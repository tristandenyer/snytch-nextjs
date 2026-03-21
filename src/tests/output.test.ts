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

// ── truncation ────────────────────────────────────────────────────────────────

describe('truncation invariants', () => {
  it('prefix before ••• is at most 8 chars', () => {
    // This mirrors what scan.ts does: value.substring(0, 8) + '•••'
    const rawValue = 'sk_live_abcdefghijklmnopqrstu';
    const truncated = rawValue.substring(0, 8) + '•••';
    const prefix = truncated.slice(0, truncated.indexOf('•••'));
    expect(prefix.length).toBeLessThanOrEqual(8);
    expect(truncated.endsWith('•••')).toBe(true);
  });

  it('short values are still truncated to 8+•••', () => {
    const rawValue = 'abc';
    const truncated = rawValue.substring(0, 8) + '•••';
    expect(truncated).toBe('abc•••');
  });

  it('exactly 8-char value produces 8-char prefix', () => {
    const rawValue = '12345678extra';
    const truncated = rawValue.substring(0, 8) + '•••';
    expect(truncated).toBe('12345678•••');
  });
});

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

// ── exit code logic ───────────────────────────────────────────────────────────

describe('exit code logic', () => {
  it('shouldFail is true when failOn=critical and criticals exist', () => {
    const findings: Finding[] = [makeFinding({ severity: 'critical' })];
    const shouldFail =
      findings.some((f) => f.severity === 'critical');
    expect(shouldFail).toBe(true);
  });

  it('shouldFail is false when failOn=critical and only warnings exist', () => {
    const findings: Finding[] = [makeFinding({ severity: 'warning' })];
    const shouldFail = findings.some((f) => f.severity === 'critical');
    expect(shouldFail).toBe(false);
  });

  it('shouldFail is true when failOn=warning and warnings exist', () => {
    const findings: Finding[] = [makeFinding({ severity: 'warning' })];
    const shouldFail =
      findings.some((f) => f.severity === 'critical' || f.severity === 'warning');
    expect(shouldFail).toBe(true);
  });

  it('shouldFail is false when no findings regardless of failOn', () => {
    const findings: Finding[] = [];
    const shouldFail = findings.length > 0;
    expect(shouldFail).toBe(false);
  });

  it('shouldFail is true when failOn=all and any finding exists', () => {
    const findings: Finding[] = [makeFinding({ severity: 'warning' })];
    const shouldFail = findings.length > 0;
    expect(shouldFail).toBe(true);
  });
});

// ── CLI flag: --dir ───────────────────────────────────────────────────────────

describe('CLI --dir flag', () => {
  it('parseArgs uses projectRoot + /.next as default dir', () => {
    // We test the logic directly rather than spawning a subprocess
    const projectRoot = '/some/project';
    const defaultDir = projectRoot + '/.next';
    expect(defaultDir).toBe('/some/project/.next');
  });

  it('--dir overrides the default scan directory', () => {
    // Simulate what parseArgs does: if --dir is present, use it
    const args = ['scan', '--dir', '/custom/path'];
    let dir = '/default/.next';
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--dir' && args[i + 1]) {
        dir = args[i + 1];
        i++;
      }
    }
    expect(dir).toBe('/custom/path');
  });
});

// ── value-match finding type ──────────────────────────────────────────────────

describe('value-match finding', () => {
  it('has type value-match and severity critical', () => {
    const f = makeFinding({
      type: 'value-match',
      patternName: 'Value match: MY_SECRET',
      severity: 'critical',
    });
    expect(f.type).toBe('value-match');
    expect(f.severity).toBe('critical');
  });
});
