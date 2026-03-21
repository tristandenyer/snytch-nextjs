import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { cwd } from 'process';
import { resolve, basename } from 'path';
import { scan } from './commands/scan.js';
import { check } from './commands/check.js';
import { diffEnvFiles } from './diff.js';
import type { Finding, CheckFinding } from './types.js';

// ── Safe serialisation helpers ────────────────────────────────────────────────

/**
 * Strip rca field (and ensure no raw secret values leak) from a scan Finding.
 * Only truncatedValue is retained — the full matched value is never included.
 *
 * @param f - The finding to sanitise.
 * @returns A safe copy with rca omitted.
 */
function safeFinding(f: Finding): Omit<Finding, 'rca'> {
  return {
    type: f.type,
    patternName: f.patternName,
    severity: f.severity,
    description: f.description,
    filePath: f.filePath,
    charOffset: f.charOffset,
    truncatedValue: f.truncatedValue,
    gitContext: f.gitContext,
  };
}

/**
 * Return a safe copy of a CheckFinding (no raw secret values).
 *
 * @param f - The check finding to sanitise.
 * @returns A safe copy.
 */
function safeCheckFinding(f: CheckFinding): CheckFinding {
  return {
    varName: f.varName,
    severity: f.severity,
    reason: f.reason,
    patternName: f.patternName,
    description: f.description,
    envFile: f.envFile,
    line: f.line,
    truncatedValue: f.truncatedValue,
  };
}

// ── Server bootstrap ──────────────────────────────────────────────────────────

/**
 * Start the snytch MCP server on stdio transport.
 *
 * Registers three tools: snytch_scan, snytch_check, snytch_diff.
 * Never transmits full secret values — all findings are truncated before output.
 */
export async function startMcpServer(): Promise<void> {
  const projectRoot = cwd();

  const server = new McpServer({ name: '@snytch/nextjs', version: '0.1.0' });

  // ── Tool: snytch_scan ──────────────────────────────────────────────────────

  server.registerTool(
    'snytch_scan',
    {
      description: 'Scan the Next.js bundle for leaked secrets in client-side JS',
      inputSchema: { dir: z.string().optional().describe('Path to the .next directory (default: <cwd>/.next)') },
    },
    async ({ dir }) => {
      const resolvedDir = dir ? resolve(dir) : resolve(projectRoot, '.next');

      const result = await scan({
        dir: resolvedDir,
        projectRoot,
        json: false,
        report: false,
        failOn: 'critical',
        aiProvider: 'none',
      });

      const safeFindings = result.findings.map(safeFinding);
      const critical = safeFindings.filter((f) => f.severity === 'critical').length;
      const warning = safeFindings.filter((f) => f.severity === 'warning').length;

      const output = JSON.stringify({
        findings: safeFindings,
        summary: {
          scannedFiles: result.scannedFiles,
          total: safeFindings.length,
          critical,
          warning,
          durationMs: result.durationMs,
        },
      });

      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  // ── Tool: snytch_check ─────────────────────────────────────────────────────

  server.registerTool(
    'snytch_check',
    {
      description: 'Check .env files for dangerous NEXT_PUBLIC_ prefix usage',
      inputSchema: {
        envFiles: z
          .array(z.string())
          .optional()
          .describe('Paths to .env files to check (default: auto-detect from cwd)'),
      },
    },
    async ({ envFiles }) => {
      const result = await check({
        projectRoot,
        json: false,
        report: false,
        failOn: 'critical',
        envFiles,
      });

      const safeFindings = result.findings.map(safeCheckFinding);
      const critical = safeFindings.filter((f) => f.severity === 'critical').length;
      const warning = safeFindings.filter((f) => f.severity === 'warning').length;

      const output = JSON.stringify({
        findings: safeFindings,
        summary: {
          scannedFiles: result.scannedFiles,
          total: safeFindings.length,
          critical,
          warning,
          durationMs: result.durationMs,
        },
      });

      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  // ── Tool: snytch_diff ──────────────────────────────────────────────────────

  server.registerTool(
    'snytch_diff',
    {
      description: 'Compare environment variable key presence across .env files',
      inputSchema: {
        envFiles: z
          .array(z.string())
          .min(2)
          .describe('Two or more .env file paths to compare (values are never read into output)'),
      },
    },
    ({ envFiles }) => {
      const files = envFiles.map((p) => ({
        path: resolve(p),
        label: basename(p),
      }));

      const result = diffEnvFiles(files);

      const output = JSON.stringify({
        drift: result.drift,
        inSync: result.inSync,
        onlyInOne: result.onlyInOne,
      });

      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
