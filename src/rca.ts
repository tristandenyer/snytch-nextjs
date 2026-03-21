import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Finding, RcaResult, AiProvider } from './types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Read the Next.js version from the nearest package.json.
 * Returns 'unknown' on any error.
 */
function readNextVersion(projectRoot: string): string {
  try {
    const raw = readFileSync(join(projectRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;

    const deps = pkg['dependencies'] as Record<string, string> | undefined;
    const devDeps = pkg['devDependencies'] as Record<string, string> | undefined;

    const version = (deps?.['next'] ?? devDeps?.['next']) as string | undefined;
    return version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Strip the full secret value from a payload string.
 * The truncatedValue is `first8chars•••` — extract only the visible prefix for matching.
 * We cannot reconstruct the full value from the truncatedValue, so this is a no-op guard
 * that warns if a full value somehow leaked through.
 *
 * Returns `{ payload, stripped }` where stripped=true if any redaction occurred.
 */
function stripSecretValues(payload: string, truncatedValue: string): { payload: string; stripped: boolean } {
  // The prefix visible in truncatedValue ends at '•••'
  const bulletIdx = truncatedValue.indexOf('•••');
  if (bulletIdx <= 0) return { payload, stripped: false };

  const visiblePrefix = truncatedValue.slice(0, bulletIdx);

  // If the full prefix appears literally in the payload (e.g. repeated elsewhere), redact
  if (!payload.includes(visiblePrefix)) return { payload, stripped: false };

  const redacted = payload.replaceAll(visiblePrefix, '[REDACTED]');
  return { payload: redacted, stripped: true };
}

/**
 * Build the structured prompt for the AI model.
 */
function buildPrompt(finding: Finding, nextVersion: string): string {
  const git = finding.gitContext;
  const culprit = git?.likelyCulprit;
  const sourceFile = git?.sourceFile ?? 'unknown';

  const gitSection = culprit
    ? [
        `Source file:     ${sourceFile}`,
        `Introducing commit:`,
        `  hash:    ${culprit.hash}`,
        `  author:  ${culprit.author} <${culprit.email}>`,
        `  when:    ${culprit.relativeTime}`,
        `  message: ${culprit.message}`,
      ].join('\n')
    : `Source file: ${sourceFile}\nNo git history available.`;

  return `You are a senior security engineer performing a root cause analysis (RCA) for a secret leakage finding in a Next.js application.

## Finding details
Type:            ${finding.type}
Pattern:         ${finding.patternName}
Severity:        ${finding.severity}
Description:     ${finding.description}
Bundle file:     ${finding.filePath}
Char offset:     ${finding.charOffset}
Truncated value: ${finding.truncatedValue}  ← context only, do NOT reference the actual secret

## Git provenance
${gitSection}

## Environment
Next.js version: ${nextVersion}

## Instructions
- Do NOT include or reference the actual secret value in your response.
- Focus on structural causes (how Next.js bundling works, server/client boundaries, import patterns).
- Be specific and actionable. Avoid generic advice.
- The "fix" should explain what code change prevents the leak, not just "rotate the secret".
- The codeExample should show a before/after code snippet (TypeScript/JS) illustrating the fix.
- editorPrompts[0] should be a short prompt for the developer to paste into Cursor/Copilot to auto-apply the fix.
- editorPrompts[1] should be a short prompt to verify the fix was applied correctly.

Respond with ONLY valid JSON matching this schema (no markdown, no code fences, no commentary).
All string values must be on a single line — use \\n for newlines within strings, never literal newlines.
{
  "what": "string — one sentence: what type of secret leaked",
  "when": "string — when it was likely introduced",
  "how": "string — structural cause: how it ended up in the client bundle",
  "fix": "string — concrete remediation steps",
  "codeExample": "string — before/after code snippet (use \\n for line breaks)",
  "editorPrompts": ["string", "string"]
}`;
}

// ── RCA engine ────────────────────────────────────────────────────────────────

/**
 * Call the Anthropic API to generate an RCA for a single finding.
 *
 * @param options - Finding, project root, and provider config.
 * @returns Parsed RcaResult, or null on any error (API failure, parse error, etc.)
 */
async function callAnthropic(finding: Finding, projectRoot: string, maxTokens: number): Promise<RcaResult | null> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) return null;

  const nextVersion = readNextVersion(projectRoot);
  let prompt = buildPrompt(finding, nextVersion);

  // Safety: strip any visible secret prefix from the outgoing payload
  const { payload, stripped } = stripSecretValues(prompt, finding.truncatedValue);
  if (stripped) {
    process.stderr.write(
      `  [rca] ⚠ Potential secret prefix detected in prompt payload — redacted before sending.\n`,
    );
    prompt = payload;
  }

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;

    // Strip markdown code fences if the model wrapped the JSON despite instructions
    const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(raw) as Partial<RcaResult>;

    // Validate required fields
    if (
      typeof parsed.what !== 'string' ||
      typeof parsed.when !== 'string' ||
      typeof parsed.how !== 'string' ||
      typeof parsed.fix !== 'string' ||
      typeof parsed.codeExample !== 'string' ||
      !Array.isArray(parsed.editorPrompts) ||
      parsed.editorPrompts.length < 2
    ) {
      return null;
    }

    return {
      what: parsed.what,
      when: parsed.when,
      how: parsed.how,
      fix: parsed.fix,
      codeExample: parsed.codeExample,
      editorPrompts: [parsed.editorPrompts[0] as string, parsed.editorPrompts[1] as string],
    };
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate AI RCA results for all critical findings.
 *
 * Only runs when provider !== 'none' and the relevant API key is set.
 * Mutates each finding's `.rca` field in-place.
 *
 * @param findings    - Array of all scan findings (only criticals are analysed).
 * @param projectRoot - Absolute project root.
 * @param provider    - AI provider to use.
 * @param maxTokens   - Maximum tokens for the AI response. Defaults to 2048.
 */
export async function generateRcaForFindings(
  findings: Finding[],
  projectRoot: string,
  provider: AiProvider,
  maxTokens = 2048,
): Promise<void> {
  if (provider === 'none') return;

  const criticals = findings.filter((f) => f.severity === 'critical');
  if (criticals.length === 0) return;

  if (provider === 'anthropic') {
    if (!process.env['ANTHROPIC_API_KEY']) {
      process.stderr.write(
        '  [rca] ANTHROPIC_API_KEY not set — skipping AI RCA.\n',
      );
      return;
    }

    for (const finding of criticals) {
      const rca = await callAnthropic(finding, projectRoot, maxTokens);
      if (rca !== null) {
        finding.rca = rca;
      }
    }
  }

  // 'openai' provider: reserved for future implementation
  if (provider === 'openai') {
    process.stderr.write(
      '  [rca] OpenAI provider is not yet implemented. Use --ai-provider anthropic.\n',
    );
  }
}
