import { readFileSync } from 'fs';
import { join } from 'path';
import { PATTERNS } from './patterns.js';
import { resolveEnvVars } from './config.js';
import { Finding, SnytchConfig } from './types.js';

/**
 * Names of next.config.* files to probe, in priority order.
 */
const CONFIG_FILENAMES = ['next.config.js', 'next.config.mjs', 'next.config.ts'];

/**
 * Read the first next.config.* file found in projectRoot.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns Tuple of [filePath, content] if found, or null if none exists.
 */
function readNextConfig(projectRoot: string): [string, string] | null {
  for (const name of CONFIG_FILENAMES) {
    const filePath = join(projectRoot, name);
    try {
      const content = readFileSync(filePath, 'utf-8');
      return [filePath, content];
    } catch {
      // File does not exist or is unreadable; try next
    }
  }
  return null;
}

/**
 * Represents a single key-value pair extracted from the next.config `env` block.
 */
interface EnvBlockEntry {
  key: string;
  value: string;
  /** Character offset of the value's first character in the full file content. */
  offset: number;
}

/**
 * Extract key-value pairs from the `env` block of a next.config file.
 *
 * Uses regex-based extraction — does NOT require() or eval() the config file.
 * Handles string values delimited by single quotes, double quotes, or backticks.
 *
 * @param content - Raw text of the config file.
 * @returns Array of extracted key-value entries with their offsets.
 */
function extractEnvBlock(content: string): EnvBlockEntry[] {
  const entries: EnvBlockEntry[] = [];

  // Match the env: { ... } block. Use a brace-counting approach after the opening brace.
  const envBlockStart = content.search(/\benv\s*:\s*\{/);
  if (envBlockStart === -1) return entries;

  // Find the opening brace of the env block
  const openBraceIdx = content.indexOf('{', envBlockStart);
  if (openBraceIdx === -1) return entries;

  // Walk forward counting braces to find the closing brace
  let depth = 0;
  let closeBraceIdx = -1;
  for (let i = openBraceIdx; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) {
        closeBraceIdx = i;
        break;
      }
    }
  }

  if (closeBraceIdx === -1) return entries;

  const blockContent = content.slice(openBraceIdx + 1, closeBraceIdx);
  const blockOffset = openBraceIdx + 1;

  // Match KEY: 'value', KEY: "value", KEY: `value`
  // Also handle process.env.SOME_VAR as the value (skip those — they're not literal secrets)
  const pairRegex =
    /([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*(?!process\.env)(['"`])((?:\\.|(?!\2)[^\\])*?)\2/g;

  let match: RegExpExecArray | null;
  while ((match = pairRegex.exec(blockContent)) !== null) {
    const key = match[1];
    const value = match[3];
    const valueStart = blockOffset + match.index + match[0].indexOf(match[2]) + 1;

    entries.push({ key, value, offset: valueStart });
  }

  return entries;
}

/**
 * Scan the `env` block in next.config.js (or .mjs / .ts) for secrets.
 *
 * Next.js injects everything in the `env` block into all bundles at build time —
 * client and server alike. A secret placed here is shipped to the browser even
 * without a `NEXT_PUBLIC_` prefix.
 *
 * This scanner catches the issue at the config level, giving earlier and more
 * actionable feedback than the bundle scanner (which only sees it after the build).
 *
 * Two passes are run against each key-value pair in the `env` block:
 * 1. Pattern matching — value matched against the 170+ regex pattern library.
 * 2. Value matching — key checked against the `serverOnly` list in snytch.config.js.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @param config - Snytch configuration (used for serverOnly list).
 * @returns Array of findings with type `'config-env'`.
 */
export function scanNextConfig(projectRoot: string, config: SnytchConfig): Finding[] {
  const findings: Finding[] = [];

  const configFile = readNextConfig(projectRoot);
  if (configFile === null) return findings;

  const [filePath, content] = configFile;
  const entries = extractEnvBlock(content);
  if (entries.length === 0) return findings;

  const seenMatches = new Set<string>();

  // Pass 1: Pattern matching against each value
  for (const entry of entries) {
    if (!entry.value) continue;

    for (const patternDef of PATTERNS) {
      const regex = patternDef.pattern;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(entry.value)) !== null) {
        const truncatedValue = match[0].substring(0, 8) + '•••';
        const matchKey = `${patternDef.name}|${entry.key}|pattern`;

        if (!seenMatches.has(matchKey)) {
          seenMatches.add(matchKey);
          findings.push({
            type: 'config-env',
            patternName: patternDef.name,
            severity: patternDef.severity,
            description: `${patternDef.description} (in next.config env block, key: ${entry.key})`,
            filePath,
            charOffset: entry.offset + match.index,
            truncatedValue,
          });
        }
      }
    }
  }

  // Pass 2: Value matching against serverOnly vars
  if (config.serverOnly && config.serverOnly.length > 0) {
    const resolvedVars = resolveEnvVars(projectRoot, config.serverOnly);

    for (const envVar of resolvedVars) {
      for (const entry of entries) {
        if (!entry.value) continue;

        const idx = entry.value.indexOf(envVar.value);
        if (idx === -1) continue;

        const matchKey = `value-match|${envVar.name}|${entry.key}`;
        if (!seenMatches.has(matchKey)) {
          seenMatches.add(matchKey);
          const truncatedValue = envVar.value.substring(0, 8) + '•••';
          findings.push({
            type: 'config-env',
            patternName: `Value match: ${envVar.name}`,
            severity: 'critical',
            description: `Literal value of ${envVar.name} (from ${envVar.source}) found in next.config env block`,
            filePath,
            charOffset: entry.offset + idx,
            truncatedValue,
          });
        }
      }
    }
  }

  // Pass 3: Flag keys that appear in serverOnly (regardless of value pattern)
  if (config.serverOnly && config.serverOnly.length > 0) {
    for (const entry of entries) {
      if (!config.serverOnly.includes(entry.key)) continue;

      const matchKey = `serverOnly-key|${entry.key}`;
      if (!seenMatches.has(matchKey)) {
        seenMatches.add(matchKey);
        const truncatedValue = entry.value.substring(0, 8) + '•••';
        findings.push({
          type: 'config-env',
          patternName: `serverOnly key in env block: ${entry.key}`,
          severity: 'critical',
          description: `${entry.key} is listed in serverOnly but appears in next.config env block, which injects it into all bundles`,
          filePath,
          charOffset: entry.offset,
          truncatedValue,
        });
      }
    }
  }

  return findings;
}
