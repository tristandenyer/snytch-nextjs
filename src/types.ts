export type Severity = 'critical' | 'warning' | 'info';
export type FailOn = 'critical' | 'warning' | 'all';

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: Severity;
  description: string;
}

export interface Finding {
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
  json: boolean;
  failOn: FailOn;
}
