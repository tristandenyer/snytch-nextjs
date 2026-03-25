/**
 * Tests for the scanner — uses vi.mock to intercept 'fs' with memfs.
 *
 * vi.mock is hoisted to the top of the file by Vitest, so the factory cannot
 * reference module-level variables defined after it. The trick: store the
 * shared Volume on globalThis inside the factory, then access it from tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// This mock is hoisted. We instantiate Volume and createFsFromVolume here
// and stash the vol on globalThis so test code can call vol.reset().
vi.mock('fs', async () => {
  const { Volume, createFsFromVolume } = await import('memfs');
  const vol = new Volume();
  (globalThis as Record<string, unknown>).__testVol = vol;
  return createFsFromVolume(vol);
});

// Now import the modules under test AFTER the mock is set up.
import type { ScanOptions } from '../types.js';
import { scan } from '../commands/scan.js';
import { resolveEnvVars, loadConfig } from '../config.js';
import { PATTERNS } from '../patterns.js';

// Convenience accessor — guaranteed to exist after the mock factory runs.
function getVol() {
  return (globalThis as Record<string, unknown>).__testVol as import('memfs').Volume;
}

// ── helpers ───────────────────────────────────────────────────────────────────

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

function writeChunk(content: string, name = 'main.js') {
  const vol = getVol();
  vol.mkdirSync('/project/.next/static/chunks', { recursive: true });
  vol.writeFileSync(`/project/.next/static/chunks/${name}`, content);
}

beforeEach(() => {
  getVol().reset();
  // Reset regex lastIndex on all global patterns to avoid stale state between tests
  for (const p of PATTERNS) p.pattern.lastIndex = 0;
});

// ── pattern-match findings ────────────────────────────────────────────────────

describe('scan — pattern matching', () => {
  it('finds an AWS AKIA key in a JS chunk', async () => {
    writeChunk('const key="AKIAIOSFODNN7EXAMPLE";');
    const result = await scan(makeOptions());
    const finding = result.findings.find((f) => f.patternName.includes('AKIA'));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('critical');
    expect(finding!.type).toBe('pattern-match');
  });

  it('finds a Stripe live key', async () => {
    writeChunk('var x = "sk_live_abcdefghijklmnopqrstu"');
    const result = await scan(makeOptions());
    expect(result.findings.some((f) => f.patternName === 'Stripe Live Secret Key')).toBe(true);
  });

  it('finds an Anthropic API key', async () => {
    writeChunk('"sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789"');
    const result = await scan(makeOptions());
    expect(result.findings.some((f) => f.patternName === 'Anthropic API Key')).toBe(true);
  });

  it('finds an NPM token', async () => {
    writeChunk('npm_' + 'a'.repeat(36));
    const result = await scan(makeOptions());
    expect(result.findings.some((f) => f.patternName === 'NPM Token')).toBe(true);
  });

  it('reports charOffset pointing to the match location', async () => {
    const prefix = 'var x = ';
    writeChunk(prefix + 'sk_live_abcdefghijklmnopqrstu');
    const result = await scan(makeOptions());
    const finding = result.findings.find((f) => f.patternName === 'Stripe Live Secret Key');
    expect(finding).toBeDefined();
    expect(finding!.charOffset).toBe(prefix.length);
  });

  it('deduplicates the same pattern+value within a file', async () => {
    const key = 'AKIAIOSFODNN7EXAMPLE';
    writeChunk(`a="${key}"; b="${key}";`);
    const result = await scan(makeOptions());
    const akiaFindings = result.findings.filter((f) => f.patternName === 'AWS Access Key ID (AKIA)');
    expect(akiaFindings.length).toBe(1);
  });

  it('reports findings from multiple files', async () => {
    const vol = getVol();
    vol.mkdirSync('/project/.next/static/chunks', { recursive: true });
    vol.writeFileSync('/project/.next/static/chunks/a.js', 'sk_live_abcdefghijklmnopqrstu1');
    vol.writeFileSync('/project/.next/static/chunks/b.js', 'sk_live_abcdefghijklmnopqrstu2');
    const result = await scan(makeOptions());
    const files = new Set(
      result.findings
        .filter((f) => f.patternName === 'Stripe Live Secret Key')
        .map((f) => f.filePath),
    );
    expect(files.size).toBe(2);
  });

  it('scans CSS files in static/css', async () => {
    const vol = getVol();
    vol.mkdirSync('/project/.next/static/css', { recursive: true });
    vol.writeFileSync('/project/.next/static/css/main.css', 'sk_live_abcdefghijklmnopqrstu');
    const result = await scan(makeOptions());
    expect(result.findings.some((f) => f.patternName === 'Stripe Live Secret Key')).toBe(true);
  });

  it('counts scannedFiles correctly', async () => {
    const vol = getVol();
    vol.mkdirSync('/project/.next/static/chunks', { recursive: true });
    vol.writeFileSync('/project/.next/static/chunks/a.js', 'x');
    vol.writeFileSync('/project/.next/static/chunks/b.js', 'x');
    vol.writeFileSync('/project/.next/static/chunks/c.js', 'x');
    const result = await scan(makeOptions());
    expect(result.scannedFiles).toBe(3);
  });

  it('returns durationMs >= 0', async () => {
    writeChunk('x');
    const result = await scan(makeOptions());
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ── edge cases ────────────────────────────────────────────────────────────────

describe('scan — edge cases', () => {
  it('handles missing .next directory gracefully (returns 0 files)', async () => {
    const result = await scan(makeOptions());
    expect(result.scannedFiles).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it('handles empty chunks directory gracefully', async () => {
    getVol().mkdirSync('/project/.next/static/chunks', { recursive: true });
    const result = await scan(makeOptions());
    expect(result.scannedFiles).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it('handles binary-like content without throwing', async () => {
    writeChunk('\x00\x01\x02\xff\xfe\xfd\x00');
    await expect(scan(makeOptions())).resolves.toBeDefined();
  });

  it('handles very large files (>10MB) without throwing', async () => {
    const line = 'var x = "safe";\n';
    const large = line.repeat(Math.ceil(11 * 1024 * 1024 / line.length));
    writeChunk(large);
    await expect(scan(makeOptions())).resolves.toBeDefined();
  }, 15_000);

  it('handles an empty file', async () => {
    writeChunk('');
    const result = await scan(makeOptions());
    expect(result.findings).toHaveLength(0);
    expect(result.scannedFiles).toBe(1);
  });

  it('recurses into sub-directories of chunks', async () => {
    const vol = getVol();
    vol.mkdirSync('/project/.next/static/chunks/pages', { recursive: true });
    vol.writeFileSync('/project/.next/static/chunks/pages/index.js', 'AKIAIOSFODNN7EXAMPLE');
    const result = await scan(makeOptions());
    expect(result.findings.some((f) => f.patternName.includes('AKIA'))).toBe(true);
  });
});

// ── truncation ────────────────────────────────────────────────────────────────

describe('scan — truncation', () => {
  it('all findings are truncated to ≤8 chars + •••', async () => {
    writeChunk('sk_live_abcdefghijklmnopqrstu');
    const result = await scan(makeOptions());
    for (const f of result.findings) {
      expect(f.truncatedValue.endsWith('•••')).toBe(true);
      const prefix = f.truncatedValue.slice(0, f.truncatedValue.indexOf('•••'));
      expect(prefix.length).toBeLessThanOrEqual(8);
    }
  });
});

// ── resolveEnvVars ────────────────────────────────────────────────────────────

describe('scan — resolveEnvVars', () => {
  it('finds a var defined in .env.local', () => {
    const vol = getVol();
    vol.mkdirSync('/project', { recursive: true });
    vol.writeFileSync('/project/.env.local', 'MY_SECRET=supersecret123\n');
    const vars = resolveEnvVars('/project', ['MY_SECRET']);
    expect(vars).toHaveLength(1);
    expect(vars[0].value).toBe('supersecret123');
    expect(vars[0].source).toBe('.env.local');
  });

  it('skips values shorter than 8 chars', () => {
    const vol = getVol();
    vol.mkdirSync('/project', { recursive: true });
    vol.writeFileSync('/project/.env.local', 'SHORT=abc\n');
    const vars = resolveEnvVars('/project', ['SHORT']);
    expect(vars).toHaveLength(0);
  });

  it('prefers .env.local over .env', () => {
    const vol = getVol();
    vol.mkdirSync('/project', { recursive: true });
    vol.writeFileSync('/project/.env.local', 'MY_VAR=localvalue123\n');
    vol.writeFileSync('/project/.env', 'MY_VAR=basevalue123\n');
    const vars = resolveEnvVars('/project', ['MY_VAR']);
    expect(vars[0].value).toBe('localvalue123');
    expect(vars[0].source).toBe('.env.local');
  });

  it('falls back to .env when .env.local is absent', () => {
    const vol = getVol();
    vol.mkdirSync('/project', { recursive: true });
    vol.writeFileSync('/project/.env', 'BASE_VAR=basevalue123\n');
    const vars = resolveEnvVars('/project', ['BASE_VAR']);
    expect(vars[0].value).toBe('basevalue123');
    expect(vars[0].source).toBe('.env');
  });

  it('ignores comment lines', () => {
    const vol = getVol();
    vol.mkdirSync('/project', { recursive: true });
    vol.writeFileSync('/project/.env.local', '# comment\nREAL_VAR=realvalue123\n');
    const vars = resolveEnvVars('/project', ['REAL_VAR']);
    expect(vars[0].value).toBe('realvalue123');
  });

  it('handles missing .env files gracefully without throwing', () => {
    const vol = getVol();
    vol.mkdirSync('/project', { recursive: true });
    expect(() => resolveEnvVars('/project', ['MISSING_VAR'])).not.toThrow();
  });

  it('returns empty array when var is not found anywhere', () => {
    const vol = getVol();
    vol.mkdirSync('/project', { recursive: true });
    const vars = resolveEnvVars('/project', ['DEFINITELY_NOT_SET_XYZ']);
    expect(vars).toHaveLength(0);
  });
});

// ── config loading ────────────────────────────────────────────────────────────

describe('scan — config loading', () => {
  it('returns null when config file is absent', async () => {
    getVol().mkdirSync('/project', { recursive: true });
    const config = await loadConfig('/project');
    expect(config).toBeNull();
  });

  it('does not throw when config file is absent', async () => {
    getVol().mkdirSync('/project', { recursive: true });
    await expect(loadConfig('/project')).resolves.not.toThrow();
  });
});
