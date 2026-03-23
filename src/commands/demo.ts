/**
 * snytch demo
 *
 * Runs a fully synthetic end-to-end demonstration of all three snytch commands
 * (scan, check, diff) using fake findings that cover the full range of severity
 * levels and pattern types. Output is identical to a real run — the same
 * formatters, the same exit code (1), and a real HTML report written to disk.
 *
 * At the end the user is prompted to delete the generated report file.
 */

import { createInterface } from 'readline';
import { existsSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import chalk from 'chalk';
import { printScanResult, printCheckResult, printDiffResult } from '../output.js';
import { generateReport, generateCheckReport, generateDiffReport } from '../report.js';
import { generateRcaForFindings } from '../rca.js';
import type {
  ScanResult,
  ScanOptions,
  CheckResult,
  CheckOptions,
  DiffResult,
  DiffOptions,
  Finding,
  CheckFinding,
} from '../types.js';

// ── Synthetic data ─────────────────────────────────────────────────────────────

const PROJECT_ROOT = '/demo/my-nextjs-app';
const CHUNKS_DIR = `${PROJECT_ROOT}/.next/static/chunks`;

/** Fake scan findings — critical and warning, multiple pattern categories. */
const SCAN_FINDINGS: Finding[] = [
  {
    type: 'pattern-match',
    patternName: 'AWS Access Key ID (AKIA)',
    severity: 'critical',
    description: 'AWS IAM access key found in client bundle',
    filePath: `${CHUNKS_DIR}/pages/_app-4f8e2a1b.js`,
    charOffset: 1247,
    truncatedValue: 'AKIAIOSFODNN7•••',
  },
  {
    type: 'pattern-match',
    patternName: 'Stripe Live Secret Key',
    severity: 'critical',
    description: 'Stripe live secret key found in client bundle',
    filePath: `${CHUNKS_DIR}/framework-8b3c91de.js`,
    charOffset: 8832,
    truncatedValue: 'sk_live_•••',
  },
  {
    type: 'pattern-match',
    patternName: 'Anthropic API Key',
    severity: 'critical',
    description: 'Anthropic API key found in client bundle',
    filePath: `${CHUNKS_DIR}/pages/_app-4f8e2a1b.js`,
    charOffset: 3401,
    truncatedValue: 'sk-ant-ap•••',
  },
  {
    type: 'pattern-match',
    patternName: 'GitHub Personal Access Token',
    severity: 'critical',
    description: 'GitHub PAT found in client bundle',
    filePath: `${CHUNKS_DIR}/main-d9a721cc.js`,
    charOffset: 512,
    truncatedValue: 'ghp_XyZ12•••',
  },
  {
    type: 'pattern-match',
    patternName: 'NPM Token',
    severity: 'warning',
    description: 'NPM automation token found in client bundle',
    filePath: `${CHUNKS_DIR}/main-d9a721cc.js`,
    charOffset: 2190,
    truncatedValue: 'npm_ABCDE•••',
  },
  {
    type: 'pattern-match',
    patternName: 'JWT Token',
    severity: 'warning',
    description: 'JSON Web Token found in client bundle',
    filePath: `${CHUNKS_DIR}/framework-8b3c91de.js`,
    charOffset: 14022,
    truncatedValue: 'eyJhbGci•••',
  },
  {
    type: 'pattern-match',
    patternName: 'Clerk Secret Key (Live)',
    severity: 'critical',
    description: 'Clerk live secret key found in client bundle',
    filePath: `${CHUNKS_DIR}/pages/_app-4f8e2a1b.js`,
    charOffset: 5710,
    truncatedValue: 'sk_live_•••',
  },
  {
    type: 'pattern-match',
    patternName: 'Fly.io API Token',
    severity: 'critical',
    description: 'Fly.io API token found in client bundle',
    filePath: `${CHUNKS_DIR}/main-d9a721cc.js`,
    charOffset: 3920,
    truncatedValue: 'FlyV1 fm•••',
  },
  {
    type: 'pattern-match',
    patternName: 'Razorpay Live Key ID',
    severity: 'critical',
    description: 'Razorpay live key found in client bundle',
    filePath: `${CHUNKS_DIR}/framework-8b3c91de.js`,
    charOffset: 11204,
    truncatedValue: 'rzp_live•••',
  },
  {
    type: 'sourcemap-secret',
    patternName: 'Twilio Auth Token',
    severity: 'warning',
    description: 'Twilio auth token found in source map, may not be in live bundle',
    filePath: `${CHUNKS_DIR}/main-d9a721cc.js.map`,
    charOffset: 4418,
    truncatedValue: 'SKabcdef•••',
  },
  {
    type: 'graph-leak',
    patternName: 'Import chain: DATABASE_URL',
    severity: 'warning',
    description: 'app/dashboard/page.tsx → lib/db.ts → lib/DATABASE_URL.ts',
    filePath: '/project/lib/DATABASE_URL.ts',
    charOffset: 0,
    truncatedValue: '(no value)',
  },
];

/** Synthetic suppression rules for the demo. */
const DEMO_SUPPRESS_RULES = {
  jwtInternal: {
    pattern: 'JWT Token',
    reason: 'Internal session token used by auth middleware. Not a credential, reviewed 2026-03-21',
    until: '2026-09-01',
    addedBy: '@alice',
  },
  npmExpired: {
    pattern: 'NPM Token',
    reason: 'Read-only publish token, rotated quarterly. Suppression was not extended',
    until: '2026-01-15', // expired
    addedBy: '@bob',
  },
} satisfies Record<string, import('../types.js').SuppressRule>;

const SCAN_RESULT: ScanResult = {
  scannedFiles: 12,
  // JWT Token and NPM Token are "suppressed" — remove them from active findings
  findings: SCAN_FINDINGS.filter(
    (f) => f.patternName !== 'JWT Token' && f.patternName !== 'NPM Token',
  ),
  suppressedFindings: [
    {
      finding: SCAN_FINDINGS.find((f) => f.patternName === 'JWT Token')!,
      rule: DEMO_SUPPRESS_RULES.jwtInternal,
    },
    {
      finding: SCAN_FINDINGS.find((f) => f.patternName === 'NPM Token')!,
      rule: DEMO_SUPPRESS_RULES.npmExpired,
    },
  ],
  expiredRules: [DEMO_SUPPRESS_RULES.npmExpired],
  durationMs: 184,
};

const SCAN_OPTIONS: ScanOptions = {
  dir: `${PROJECT_ROOT}/.next`,
  projectRoot: PROJECT_ROOT,
  json: false,
  report: false,
  failOn: 'critical',
};

/** Fake check findings — NEXT_PUBLIC_ variables that carry secrets. */
const CHECK_FINDINGS: CheckFinding[] = [
  {
    varName: 'NEXT_PUBLIC_STRIPE_KEY',
    severity: 'critical',
    reason: 'pattern-match',
    patternName: 'Stripe Live Secret Key',
    description: 'Stripe live secret key, must never be exposed to the browser',
    envFile: '.env.local',
    line: 4,
    truncatedValue: 'sk_live_•••',
  },
  {
    varName: 'NEXT_PUBLIC_ANTHROPIC_KEY',
    severity: 'critical',
    reason: 'pattern-match',
    patternName: 'Anthropic API Key',
    description: 'Anthropic API key, must never be exposed to the browser',
    envFile: '.env.local',
    line: 7,
    truncatedValue: 'sk-ant-ap•••',
  },
  {
    varName: 'NEXT_PUBLIC_INTERNAL_TOKEN',
    severity: 'critical',
    reason: 'serverOnly',
    patternName: 'serverOnly config',
    description: 'Listed in snytch.config.json serverOnly, must not be NEXT_PUBLIC_',
    envFile: '.env.production',
    line: 12,
    truncatedValue: 'tok_live_•••',
  },
  {
    varName: 'NEXT_PUBLIC_SESSION_SECRET',
    severity: 'warning',
    reason: 'high-entropy',
    patternName: 'High Entropy',
    description: 'High-entropy value detected, may be a secret',
    envFile: '.env.local',
    line: 11,
    truncatedValue: 'Xk92mNpQ•••',
  },
];

const CHECK_RESULT: CheckResult = {
  scannedFiles: 3,
  findings: CHECK_FINDINGS,
  durationMs: 31,
};

const CHECK_OPTIONS: CheckOptions = {
  projectRoot: PROJECT_ROOT,
  json: false,
  report: false,
  failOn: 'critical',
};

/** Fake diff result — staging vs production vs local. */
const DIFF_RESULT: DiffResult = {
  fileLabels: ['.env.staging', '.env.production', '.env.local'],
  inSync: [
    'DATABASE_URL',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_POSTHOG_KEY',
    'REDIS_URL',
  ],
  drift: [
    {
      key: 'STRIPE_SECRET_KEY',
      presentIn: ['.env.staging', '.env.production'],
      missingFrom: ['.env.local'],
    },
    {
      key: 'SENTRY_DSN',
      presentIn: ['.env.production', '.env.local'],
      missingFrom: ['.env.staging'],
    },
  ],
  onlyInOne: [
    { key: 'VERCEL_TOKEN', file: '.env.production' },
    { key: 'NGROK_AUTHTOKEN', file: '.env.local' },
  ],
  durationMs: 8,
};

const DIFF_OPTIONS: DiffOptions = {
  envFiles: [
    { path: `${PROJECT_ROOT}/.env.staging`, label: '.env.staging' },
    { path: `${PROJECT_ROOT}/.env.production`, label: '.env.production' },
    { path: `${PROJECT_ROOT}/.env.local`, label: '.env.local' },
  ],
  projectRoot: PROJECT_ROOT,
  json: false,
  report: false,
  strict: false,
  serverOnly: ['STRIPE_SECRET_KEY'],
  diffAliases: [],
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Print a bold section banner with a top/bottom border.
 *
 * @param title - The section title to display.
 */
function banner(title: string): void {
  const line = '━'.repeat(52);
  console.log('');
  console.log(chalk.bold.cyan(`  ${line}`));
  console.log(chalk.bold.cyan(`  ${title}`));
  console.log(chalk.bold.cyan(`  ${line}`));
}

/**
 * Prompt the user with a yes/no question and resolve with their answer.
 *
 * @param question - The question to display.
 * @returns True if the user answered yes (y/Y), false otherwise.
 */
function askYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ── Main demo entry point ──────────────────────────────────────────────────────

/**
 * Run the full snytch demo.
 *
 * Renders synthetic scan, check, and diff results through the real output
 * formatters, generates an HTML report, dumps JSON to stdout, then optionally
 * deletes the report file.
 *
 * @param projectRoot - The real working directory (used for report output path).
 * @returns A promise that resolves when the demo is complete.
 */
export async function runDemo(projectRoot: string): Promise<void> {
  const reportsDir = join(resolve(projectRoot), 'snytch-reports');

  // ── Intro ──────────────────────────────────────────────────────────────────
  console.log('');
  console.log(chalk.bold.yellow('  ⚠  DEMO MODE: all findings are synthetic'));
  console.log(chalk.dim('  No real files are scanned. This output is identical to a live run.'));

  // ── Section 1: scan ────────────────────────────────────────────────────────
  banner('snytch scan  ·  bundle + source map secret detection');
  printScanResult(SCAN_RESULT, SCAN_OPTIONS);
  console.log(chalk.dim('  Source map findings ([source map]) are always [WARN]. The value may'));
  console.log(chalk.dim('  not be reachable in the live bundle, but was present at build time.'));

  // ── Section 2: check ──────────────────────────────────────────────────────
  banner('snytch check  ·  NEXT_PUBLIC_ exposure detection');
  printCheckResult(CHECK_RESULT, CHECK_OPTIONS);

  // ── Section 3: diff ───────────────────────────────────────────────────────
  banner('snytch diff  ·  environment drift');
  printDiffResult(DIFF_RESULT, DIFF_OPTIONS);

  // ── Section 4: JSON output ─────────────────────────────────────────────────
  banner('JSON output  ·  --json flag (scan findings shown)');
  console.log('');
  console.log(
    JSON.stringify(
      {
        scannedFiles: SCAN_RESULT.scannedFiles,
        findings: SCAN_RESULT.findings,
        durationMs: SCAN_RESULT.durationMs,
      },
      null,
      2,
    ),
  );

  // ── Section 5: HTML report ─────────────────────────────────────────────────
  banner('HTML report  ·  --report flag');
  console.log('');

  const reportScanOptions: ScanOptions = { ...SCAN_OPTIONS, report: true, projectRoot };
  const reportCheckOptions: CheckOptions = { ...CHECK_OPTIONS, report: true, projectRoot };
  const reportDiffOptions: DiffOptions = { ...DIFF_OPTIONS, report: true, projectRoot };

  // Run AI RCA on synthetic findings if ANTHROPIC_API_KEY is set
  if (process.env['ANTHROPIC_API_KEY']) {
    console.log(chalk.dim('  Running AI RCA on synthetic findings...'));
    await generateRcaForFindings(SCAN_RESULT.findings, projectRoot, 'anthropic');
  }

  generateReport(SCAN_RESULT, reportScanOptions);
  generateCheckReport(CHECK_RESULT, reportCheckOptions);
  generateDiffReport(DIFF_RESULT, reportDiffOptions);

  console.log(chalk.green(`  ✓ reports written → ${reportsDir}/`));
  console.log(chalk.dim('  Open any report in a browser to see the full HTML output.'));

  // ── Footer ─────────────────────────────────────────────────────────────────
  console.log('');
  console.log(chalk.bold.yellow('  ⚠  DEMO COMPLETE. Exit code will be 1 (critical findings detected).'));
  console.log(chalk.dim('  In CI, this exit code would fail the build.'));
  console.log('');

  // ── Cleanup prompt ─────────────────────────────────────────────────────────
  if (existsSync(reportsDir)) {
    const del = await askYesNo(
      chalk.dim('  Delete snytch-reports/? [y/N] '),
    );
    if (del) {
      rmSync(reportsDir, { recursive: true });
      console.log(chalk.dim('  snytch-reports/ deleted.'));
    } else {
      console.log(chalk.dim(`  Reports kept at: ${reportsDir}/`));
    }
  }

  console.log('');
}
