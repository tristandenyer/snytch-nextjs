export type Severity = 'critical' | 'warning' | 'info';
export type FindingType = 'pattern-match' | 'value-match';
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
}

export interface ScanResult {
  scannedFiles: number;
  findings: Finding[];
  durationMs: number;
}

export interface ScanOptions {
  dir: string;
  projectRoot: string;
  json: boolean;
  report: boolean;
  failOn: FailOn;
}

export interface SnytchConfig {
  serverOnly?: string[];
  failOn?: FailOn;
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
