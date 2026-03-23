export type Severity = 'critical' | 'warning' | 'info';
export type FindingType = 'pattern-match' | 'value-match' | 'next-data' | 'config-env' | 'middleware-secret' | 'sourcemap-secret' | 'graph-leak';
export type FailOn = 'critical' | 'warning' | 'all';

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: Severity;
  description: string;
}

export interface Finding {
  type: FindingType;
  patternName: string;
  severity: Severity;
  description: string;
  filePath: string;
  charOffset: number;
  truncatedValue: string;
  /** Git provenance for this finding — populated when a git repo is present. */
  gitContext?: GitContext;
  /** AI-generated root cause analysis — populated when --report and API key are set. */
  rca?: RcaResult;
}

/**
 * A finding that was suppressed by a rule in `snytch.config.js`.
 * Carried through to the report so the suppression is always visible.
 */
export interface SuppressedFinding {
  /** The original finding that was suppressed. */
  finding: Finding;
  /** The suppression rule that matched. */
  rule: SuppressRule;
}

export interface ScanResult {
  scannedFiles: number;
  findings: Finding[];
  /** Findings excluded by suppression rules — always reported for auditability. */
  suppressedFindings: SuppressedFinding[];
  /** Suppression rules whose `until` date has passed — surfaced as warnings. */
  expiredRules: SuppressRule[];
  durationMs: number;
}

export type AiProvider = 'anthropic' | 'openai' | 'none';

export interface RcaResult {
  /** One-sentence description of what was leaked. */
  what: string;
  /** When it was likely introduced (relative time or commit reference). */
  when: string;
  /** How the value ended up in the client bundle (structural cause). */
  how: string;
  /** Concrete remediation steps. */
  fix: string;
  /** Optional illustrative code snippet showing the fix. */
  codeExample: string;
  /** Two short prompts the developer can paste into their editor AI. */
  editorPrompts: [string, string];
}

export interface ScanOptions {
  dir: string;
  projectRoot: string;
  json: boolean;
  report: boolean;
  failOn: FailOn;
  aiProvider?: AiProvider;
  /** Maximum tokens for AI RCA responses. Defaults to 2048. */
  rcaMaxTokens?: number;
  /**
   * When true, run module graph analysis to detect server-only modules
   * reachable from client entry points. Requires `.next/trace`.
   */
  graph?: boolean;
}

export interface RcaConfig {
  /** Maximum tokens for the AI RCA response. Defaults to 2048. */
  maxTokens?: number;
}

/**
 * A single suppression rule in `snytch.config.js`.
 *
 * A finding is suppressed when ALL specified fields match:
 * - `surface` (if present) matches `finding.type`
 * - `pattern` (if present) is a substring of `finding.patternName`
 *
 * `reason` is required — suppressions without a stated reason are rejected.
 * `until` is an optional ISO-8601 date string (e.g. `"2026-06-01"`). Once that
 * date has passed the rule is treated as expired and the finding becomes active again.
 */
export interface SuppressRule {
  /** Limit suppression to a specific scan surface. Omit to match all surfaces. */
  surface?: FindingType;
  /** Substring match against `finding.patternName`. Omit to match all patterns. */
  pattern?: string;
  /** Substring match against `finding.filePath`. Use to suppress a finding in one specific file rather than everywhere. Omit to match all files. */
  filePath?: string;
  /** Required. Why this finding is being suppressed. Shown in the report. */
  reason: string;
  /**
   * Optional ISO-8601 date string (`"YYYY-MM-DD"`). The suppression expires at
   * the start of this date — findings are active again from that day onward.
   */
  until?: string;
  /**
   * Optional. The person who added this suppression rule — a name, username,
   * or email. Shown in the report so others know who to ask about it.
   */
  addedBy?: string;
}

export interface SnytchConfig {
  serverOnly?: string[];
  failOn?: FailOn;
  rca?: RcaConfig;
  /** Suppression rules — findings matched by a rule are excluded from CI gates. */
  suppress?: SuppressRule[];
  /**
   * Default env files for the `diff` command. When no `--env` flags are passed
   * on the CLI, these paths are used instead.
   *
   * @example `['.env.local', '.env.production']`
   */
  diffFiles?: string[];
  /**
   * Alias groups for `diff` key matching. Each inner array lists key names
   * that should be treated as the same logical variable when comparing
   * across environments. The first element in each group is the canonical
   * name used in the diff report.
   *
   * @example `[['STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY_TEST']]`
   */
  diffAliases?: string[][];
}

export interface ResolvedEnvVar {
  name: string;
  value: string;
  source: string; // which file or 'process.env' the value came from
}

export interface EnvEntry {
  key: string;
  value: string;
  file: string;   // file path passed by the caller
  line: number;   // 1-based line number where the key starts
}

export interface CheckFinding {
  varName: string;        // e.g. NEXT_PUBLIC_STRIPE_KEY
  severity: Severity;
  reason: 'pattern-match' | 'serverOnly' | 'high-entropy';
  patternName: string;    // pattern that matched, 'serverOnly config', or 'High Entropy'
  description: string;
  envFile: string;        // which .env file declared it
  line: number;           // 1-based line in that file
  truncatedValue: string;
}

export interface CheckResult {
  scannedFiles: number;   // number of .env* files examined
  findings: CheckFinding[];
  durationMs: number;
}

export interface CheckOptions {
  projectRoot: string;
  json: boolean;
  report: boolean;
  failOn: FailOn;
  /** Explicit list of .env file paths to check. When omitted, auto-detect. */
  envFiles?: string[];
}

// ── Git context types ─────────────────────────────────────────────────────────

export interface GitCommit {
  hash: string;
  author: string;
  email: string;
  relativeTime: string;
  message: string;
}

export interface GitContext {
  /** Source file most likely responsible for the leaked value. */
  sourceFile: string | null;
  /** Full git log for the source file (up to 10 entries). */
  log: GitCommit[];
  /** The single most likely introducing commit, or null if log is empty. */
  likelyCulprit: GitCommit | null;
}

// ── Diff types ────────────────────────────────────────────────────────────────

export interface DiffOptions {
  /** Absolute paths (and display labels) for each env file to compare. Minimum 2. */
  envFiles: { path: string; label: string }[];
  projectRoot: string;
  json: boolean;
  report: boolean;
  /**
   * When true, exit 1 for any drift at all.
   * When false (default), exit 1 only if a serverOnly key is drifted.
   */
  strict: boolean;
  /** serverOnly key names loaded from snytch.config.js — used for non-strict exit logic. */
  serverOnly: string[];
  /**
   * Alias groups for key matching. Each inner array lists key names that
   * should be treated as the same logical variable. The first element in
   * each group is the canonical name used in the diff report.
   */
  diffAliases: string[][];
}

export interface DiffResult {
  /** Labels of the files compared, in input order. */
  fileLabels: string[];
  /** Keys present in all files. */
  inSync: string[];
  /**
   * Keys present in some but not all files.
   * Each entry names which files have the key and which are missing it.
   */
  drift: { key: string; presentIn: string[]; missingFrom: string[] }[];
  /** Keys present in exactly one file. */
  onlyInOne: { key: string; file: string }[];
  durationMs: number;
}

// ── Audit types (combined scan + check + diff) ───────────────────────────────

/**
 * Options for the `snytch audit` command, which runs scan, check, and
 * optionally diff in a single sequential invocation.
 */
export interface AllOptions {
  projectRoot: string;
  json: boolean;
  report: boolean;
  failOn: FailOn;
  aiProvider?: AiProvider;
  /** Maximum tokens for AI RCA responses. Defaults to 2048. */
  rcaMaxTokens?: number;
  /** When true, run module graph analysis during scan. */
  graph?: boolean;
  /** Explicit env file paths. Diff runs only when 2+ files are provided. */
  envFiles?: string[];
  /** When true, diff fails on any drift (not just serverOnly keys). */
  strict: boolean;
  /** serverOnly key names from config. */
  serverOnly: string[];
  /** Alias groups for diff key matching from config. */
  diffAliases?: string[][];
  /** Build output directory. Defaults to `<projectRoot>/.next`. */
  dir: string;
}

/**
 * An error captured from a sub-command that did not prevent other
 * sub-commands from running.
 */
export interface AllError {
  /** Which sub-command failed. */
  command: 'scan' | 'check' | 'diff';
  /** The error message. */
  message: string;
}

/**
 * Combined result of running scan + check + (optionally) diff.
 */
export interface AllResult {
  scan: ScanResult | null;
  check: CheckResult | null;
  diff: DiffResult | null;
  errors: AllError[];
  durationMs: number;
}
