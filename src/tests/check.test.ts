/**
 * Tests for the check command — detects NEXT_PUBLIC_ variables that look like secrets.
 * Uses vi.mock + memfs, same pattern as scan.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', async () => {
  const { Volume, createFsFromVolume } = await import('memfs');
  const vol = new Volume();
  (globalThis as Record<string, unknown>).__checkTestVol = vol;
  return createFsFromVolume(vol);
});

// Mock loadConfig so we can control serverOnly without needing real import()
vi.mock('../config.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../config.js')>();
  return {
    ...original,
    loadConfig: vi.fn(async () => null),
  };
});

import type { CheckOptions } from '../types.js';
import { check } from '../commands/check.js';
import { loadConfig } from '../config.js';

function getVol() {
  return (globalThis as Record<string, unknown>).__checkTestVol as import('memfs').Volume;
}

function makeOptions(overrides: Partial<CheckOptions> = {}): CheckOptions {
  return {
    projectRoot: '/project',
    json: false,
    report: false,
    failOn: 'critical',
    ...overrides,
  };
}

beforeEach(() => {
  getVol().reset();
  getVol().mkdirSync('/project', { recursive: true });
  // Default: no config
  vi.mocked(loadConfig).mockResolvedValue(null);
});

// ── no findings ───────────────────────────────────────────────────────────────

describe('check — no findings', () => {
  it('returns 0 findings when no .env files exist', async () => {
    const result = await check(makeOptions());
    expect(result.findings).toHaveLength(0);
    expect(result.scannedFiles).toBe(0);
  });

  it('returns 0 findings when NEXT_PUBLIC_ var has a safe value', async () => {
    getVol().writeFileSync('/project/.env.local', 'NEXT_PUBLIC_THEME=dark\n');
    const result = await check(makeOptions());
    expect(result.findings).toHaveLength(0);
    expect(result.scannedFiles).toBe(1);
  });

  it('ignores non-NEXT_PUBLIC_ vars even if they match a pattern', async () => {
    getVol().writeFileSync('/project/.env.local', 'SECRET_KEY=sk_live_abcdefghijklmnopqrstu\n');
    const result = await check(makeOptions());
    expect(result.findings).toHaveLength(0);
  });

});

// ── pattern-match findings ────────────────────────────────────────────────────

describe('check — pattern-match findings', () => {
  it('detects NEXT_PUBLIC_ Stripe live key', async () => {
    getVol().writeFileSync('/project/.env.local', 'NEXT_PUBLIC_STRIPE_KEY=sk_live_abcdefghijklmnopqrstu\n');
    const result = await check(makeOptions());
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].varName).toBe('NEXT_PUBLIC_STRIPE_KEY');
    expect(result.findings[0].reason).toBe('pattern-match');
    expect(result.findings[0].severity).toBe('critical');
  });

  it('detects NEXT_PUBLIC_ AWS AKIA key', async () => {
    getVol().writeFileSync('/project/.env.local', 'NEXT_PUBLIC_AWS_KEY=AKIAIOSFODNN7EXAMPLE\n');
    const result = await check(makeOptions());
    expect(result.findings.some((f) => f.varName === 'NEXT_PUBLIC_AWS_KEY')).toBe(true);
  });

  it('detects NEXT_PUBLIC_ Anthropic key', async () => {
    getVol().writeFileSync('/project/.env.local', 'NEXT_PUBLIC_AI_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789\n');
    const result = await check(makeOptions());
    expect(result.findings.some((f) => f.varName === 'NEXT_PUBLIC_AI_KEY')).toBe(true);
  });

  it('reports correct envFile and line number', async () => {
    getVol().writeFileSync('/project/.env', '# comment\nNEXT_PUBLIC_STRIPE=sk_live_abcdefghijklmnopqrstu\n');
    const result = await check(makeOptions());
    expect(result.findings[0].envFile).toBe('.env');
    expect(result.findings[0].line).toBe(2);
  });

  it('truncates value to 8 chars + •••', async () => {
    getVol().writeFileSync('/project/.env.local', 'NEXT_PUBLIC_KEY=sk_live_abcdefghijklmnopqrstu\n');
    const result = await check(makeOptions());
    expect(result.findings[0].truncatedValue).toBe('sk_live_•••');
    expect(result.findings[0].truncatedValue.endsWith('•••')).toBe(true);
  });

  it('only reports first matching pattern per var per file', async () => {
    // A JWT would match JWT pattern; only one finding expected
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    getVol().writeFileSync('/project/.env.local', `NEXT_PUBLIC_TOKEN=${jwt}\n`);
    const result = await check(makeOptions());
    const findings = result.findings.filter((f) => f.varName === 'NEXT_PUBLIC_TOKEN');
    expect(findings).toHaveLength(1);
  });
});

// ── serverOnly findings ───────────────────────────────────────────────────────

describe('check — serverOnly findings', () => {
  it('flags NEXT_PUBLIC_ var listed in serverOnly config', async () => {
    getVol().writeFileSync('/project/.env.local', 'NEXT_PUBLIC_MY_SECRET=somevalue123\n');
    vi.mocked(loadConfig).mockResolvedValue({ serverOnly: ['NEXT_PUBLIC_MY_SECRET'] });
    const result = await check(makeOptions());
    const f = result.findings.find((f) => f.reason === 'serverOnly');
    expect(f).toBeDefined();
    expect(f!.varName).toBe('NEXT_PUBLIC_MY_SECRET');
    expect(f!.severity).toBe('critical');
  });

  it('does not flag non-NEXT_PUBLIC_ serverOnly vars', async () => {
    getVol().writeFileSync('/project/.env.local', 'MY_SECRET=somevalue123\n');
    vi.mocked(loadConfig).mockResolvedValue({ serverOnly: ['MY_SECRET'] });
    const result = await check(makeOptions());
    expect(result.findings.filter((f) => f.reason === 'serverOnly')).toHaveLength(0);
  });
});

// ── multi-file scanning ───────────────────────────────────────────────────────

describe('check — multiple .env files', () => {
  it('scans both .env.local and .env', async () => {
    getVol().writeFileSync('/project/.env.local', 'NEXT_PUBLIC_A=sk_live_abcdefghijklmnopqrstu\n');
    getVol().writeFileSync('/project/.env', 'NEXT_PUBLIC_B=sk_live_abcdefghijklmnopqrstuv\n');
    const result = await check(makeOptions());
    expect(result.scannedFiles).toBe(2);
    const vars = result.findings.map((f) => f.varName);
    expect(vars).toContain('NEXT_PUBLIC_A');
    expect(vars).toContain('NEXT_PUBLIC_B');
  });

  it('reports findings from both files independently', async () => {
    getVol().writeFileSync('/project/.env.local', 'NEXT_PUBLIC_KEY=sk_live_abcdefghijklmnopqrstu\n');
    getVol().writeFileSync('/project/.env', 'NEXT_PUBLIC_KEY=sk_live_abcdefghijklmnopqrstu\n');
    const result = await check(makeOptions());
    // Both files scanned, each produces its own finding
    const envFiles = result.findings.map((f) => f.envFile);
    expect(envFiles).toContain('.env.local');
    expect(envFiles).toContain('.env');
  });

  it('counts only present files in scannedFiles', async () => {
    // Only .env exists (not .env.local etc.)
    getVol().writeFileSync('/project/.env', 'NEXT_PUBLIC_THEME=light\n');
    const result = await check(makeOptions());
    expect(result.scannedFiles).toBe(1);
  });
});

// ── edge cases ────────────────────────────────────────────────────────────────

describe('check — edge cases', () => {
  it('handles empty .env file without throwing', async () => {
    getVol().writeFileSync('/project/.env.local', '');
    await expect(check(makeOptions())).resolves.toBeDefined();
  });

  it('handles .env with only comments without throwing', async () => {
    getVol().writeFileSync('/project/.env.local', '# just a comment\n');
    await expect(check(makeOptions())).resolves.toBeDefined();
  });

  it('handles quoted NEXT_PUBLIC_ secret value', async () => {
    getVol().writeFileSync('/project/.env.local', 'NEXT_PUBLIC_KEY="sk_live_abcdefghijklmnopqrstu"\n');
    const result = await check(makeOptions());
    expect(result.findings.some((f) => f.varName === 'NEXT_PUBLIC_KEY')).toBe(true);
  });

  it('does not throw when no .env files present at all', async () => {
    await expect(check(makeOptions())).resolves.toBeDefined();
  });
});

// ── explicit envFiles option ───────────────────────────────────────────────────

describe('check — explicit envFiles', () => {
  it('scans only the specified file when envFiles is set', async () => {
    getVol().writeFileSync('/project/.env.local', 'NEXT_PUBLIC_A=sk_live_abcdefghijklmnopqrstu\n');
    getVol().writeFileSync('/project/.env', 'NEXT_PUBLIC_B=sk_live_abcdefghijklmnopqrstuv\n');
    const result = await check(makeOptions({ envFiles: ['/project/.env.local'] }));
    const vars = result.findings.map((f) => f.varName);
    expect(vars).toContain('NEXT_PUBLIC_A');
    expect(vars).not.toContain('NEXT_PUBLIC_B');
    expect(result.scannedFiles).toBe(1);
  });

  it('scans multiple explicit files', async () => {
    getVol().writeFileSync('/project/.env.local', 'NEXT_PUBLIC_A=sk_live_abcdefghijklmnopqrstu\n');
    getVol().writeFileSync('/project/.env', 'NEXT_PUBLIC_B=sk_live_abcdefghijklmnopqrstuv\n');
    const result = await check(makeOptions({ envFiles: ['/project/.env.local', '/project/.env'] }));
    const vars = result.findings.map((f) => f.varName);
    expect(vars).toContain('NEXT_PUBLIC_A');
    expect(vars).toContain('NEXT_PUBLIC_B');
    expect(result.scannedFiles).toBe(2);
  });

  it('uses basename of explicit path as the envFile label in findings', async () => {
    getVol().writeFileSync('/project/.env.local', 'NEXT_PUBLIC_KEY=sk_live_abcdefghijklmnopqrstu\n');
    const result = await check(makeOptions({ envFiles: ['/project/.env.local'] }));
    expect(result.findings[0].envFile).toBe('.env.local');
  });

  it('skips missing explicit files gracefully', async () => {
    const result = await check(makeOptions({ envFiles: ['/project/.env.does-not-exist'] }));
    expect(result.scannedFiles).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it('falls back to auto-detection when envFiles is empty array', async () => {
    getVol().writeFileSync('/project/.env.local', 'NEXT_PUBLIC_KEY=sk_live_abcdefghijklmnopqrstu\n');
    const result = await check(makeOptions({ envFiles: [] }));
    // Empty array triggers fallback — .env.local should be found
    expect(result.scannedFiles).toBe(1);
  });
});
