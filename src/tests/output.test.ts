/**
 * Tests for output formatting, truncation, relative paths, and exit code logic.
 * Does NOT touch the filesystem or network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ScanResult, ScanOptions, Finding } from '../types.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    scannedFiles: 5,
    findings: [],
    suppressedFindings: [],
    expiredRules: [],
    durationMs: 42,
    ...overrides,
  };
}

function makeOptions(overrides: Partial<ScanOptions> = {}): ScanOptions {
  return {
    dir: '/project/.next',
    projectRoot: '/project',
    json: false,
    report: false,
    failOn: 'critical',
    ...overrides,
  };
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    type: 'pattern-match',
    patternName: 'Stripe Live Secret Key',
    severity: 'critical',
    description: 'Stripe Live Secret Key',
    filePath: '/project/.next/static/chunks/main.js',
    charOffset: 42,
    truncatedValue: 'sk_live_•••',
    ...overrides,
  };
}

// ── printScanResult: JSON output ──────────────────────────────────────────────

describe('printScanResult — JSON mode', () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('outputs valid JSON when --json is set', async () => {
    const { printScanResult } = await import('../output.js');
    const result = makeResult({
      findings: [makeFinding()],
    });
    printScanResult(result, makeOptions({ json: true }));

    expect(logs.length).toBe(1);
    const parsed = JSON.parse(logs[0]);
    expect(parsed).toMatchObject({
      scannedFiles: 5,
      durationMs: 42,
    });
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.findings[0].patternName).toBe('Stripe Live Secret Key');
  });

  it('JSON output includes all ScanResult fields', async () => {
    const { printScanResult } = await import('../output.js');
    const result = makeResult({ findings: [] });
    printScanResult(result, makeOptions({ json: true }));
    const parsed = JSON.parse(logs[0]);
    expect(Object.keys(parsed)).toContain('scannedFiles');
    expect(Object.keys(parsed)).toContain('findings');
    expect(Object.keys(parsed)).toContain('durationMs');
  });
});

// ── printScanResult: terminal output ─────────────────────────────────────────

describe('printScanResult — terminal mode', () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints clean message when no findings', async () => {
    const { printScanResult } = await import('../output.js');
    printScanResult(makeResult(), makeOptions());
    const output = logs.join('\n');
    expect(output).toContain('clean');
  });

  it('prints relative file paths, not absolute', async () => {
    const { printScanResult } = await import('../output.js');
    printScanResult(
      makeResult({ findings: [makeFinding()] }),
      makeOptions(),
    );
    const output = logs.join('\n');
    // Should appear as .next/static/... not /project/.next/...
    expect(output).not.toContain('/project/.next');
    expect(output).toContain('.next');
  });

  it('prints CRITICAL label for critical findings', async () => {
    const { printScanResult } = await import('../output.js');
    printScanResult(
      makeResult({ findings: [makeFinding({ severity: 'critical' })] }),
      makeOptions(),
    );
    const output = logs.join('\n');
    expect(output.toLowerCase()).toContain('critical');
  });

  it('prints WARN label for warning findings', async () => {
    const { printScanResult } = await import('../output.js');
    printScanResult(
      makeResult({ findings: [makeFinding({ severity: 'warning', patternName: 'JWT Token' })] }),
      makeOptions(),
    );
    const output = logs.join('\n');
    expect(output.toLowerCase()).toMatch(/warn/i);
  });

  it('lists criticals before warnings', async () => {
    const { printScanResult } = await import('../output.js');
    const findings: Finding[] = [
      makeFinding({ severity: 'warning', patternName: 'JWT Token' }),
      makeFinding({ severity: 'critical', patternName: 'Stripe Live Secret Key' }),
    ];
    printScanResult(makeResult({ findings }), makeOptions());
    const output = logs.join('\n');
    const critPos = output.indexOf('Stripe Live');
    const warnPos = output.indexOf('JWT Token');
    expect(critPos).toBeLessThan(warnPos);
  });

  it('shows --report hint when report flag is false', async () => {
    const { printScanResult } = await import('../output.js');
    printScanResult(
      makeResult({ findings: [makeFinding()] }),
      makeOptions({ report: false }),
    );
    const output = logs.join('\n');
    expect(output).toContain('--report');
  });
});

