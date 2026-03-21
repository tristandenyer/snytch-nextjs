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
