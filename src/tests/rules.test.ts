/**
 * Tests for the NEXT_PUBLIC_ detection rules engine (src/rules.ts).
 * Pure function tests — no filesystem, no mocking needed.
 */
import { describe, it, expect } from 'vitest';
import { applyCheckRules, shannonEntropy, isHighEntropy } from '../rules.js';
import type { EnvEntry } from '../types.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEntry(key: string, value: string, line = 1): EnvEntry {
  return { key, value, file: '/project/.env.local', line };
}

function run(
  key: string,
  value: string,
  serverOnly: string[] = [],
  envFile = '.env.local',
) {
  return applyCheckRules(
    { entry: makeEntry(key, value), envFile },
    new Set(serverOnly),
  );
}

// ── shannonEntropy ────────────────────────────────────────────────────────────

describe('shannonEntropy', () => {
  it('returns 0 for empty string', () => {
    expect(shannonEntropy('')).toBe(0);
  });

  it('returns 0 for single repeated character', () => {
    expect(shannonEntropy('aaaa')).toBe(0);
  });

  it('returns 1 for two equally distributed chars', () => {
    expect(shannonEntropy('aabb')).toBeCloseTo(1, 5);
  });

  it('scores a random base64-like string above threshold', () => {
    // High-entropy string: shuffled alphanumeric + symbols
    expect(shannonEntropy('aB3xQ9mKpLwRtYuVeNcJhZfDgS2iOo7')).toBeGreaterThan(3.5);
  });

  it('scores a low-entropy human-readable word below threshold', () => {
    expect(shannonEntropy('helloworld')).toBeLessThan(3.5);
  });
});

// ── isHighEntropy ─────────────────────────────────────────────────────────────

describe('isHighEntropy', () => {
  it('returns false for short strings (< 32 chars)', () => {
    expect(isHighEntropy('aB3xQ9mKpLwRtYuVeNcJhZ')).toBe(false);
  });

  it('returns true for a 32+ char high-entropy string', () => {
    expect(isHighEntropy('aB3xQ9mKpLwRtYuVeNcJhZfDgS2iOo7X')).toBe(true);
  });

  it('returns true for a UUID (used as secret)', () => {
    expect(isHighEntropy('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('returns false for a URL even if long', () => {
    expect(isHighEntropy('https://my-very-long-domain-name.example.com/api/v1/endpoint')).toBe(false);
  });

  it('returns false for a slug-like value', () => {
    expect(isHighEntropy('my-feature-flag-name-for-the-rollout-experiment')).toBe(false);
  });

  it('returns false for a pure numeric string', () => {
    expect(isHighEntropy('12345678901234567890123456789012')).toBe(false);
  });

  it('returns false for low-entropy long string', () => {
    // Lots of repetition → low entropy
    expect(isHighEntropy('aaaaaaaaabbbbbbbbbbccccccccccdddd')).toBe(false);
  });
});

// ── Rule 1: pattern match ─────────────────────────────────────────────────────

describe('applyCheckRules — Rule 1 (pattern match)', () => {
  it('returns a CRITICAL finding for a Stripe live key', () => {
    const findings = run('NEXT_PUBLIC_KEY', 'sk_live_abcdefghijklmnopqrstu');
    expect(findings.some((f) => f.reason === 'pattern-match')).toBe(true);
    expect(findings.find((f) => f.reason === 'pattern-match')!.severity).toBe('critical');
  });

  it('returns a finding for an AWS AKIA key', () => {
    const findings = run('NEXT_PUBLIC_AWS', 'AKIAIOSFODNN7EXAMPLE');
    expect(findings.some((f) => f.reason === 'pattern-match')).toBe(true);
  });

  it('returns a finding for an Anthropic API key', () => {
    const findings = run('NEXT_PUBLIC_AI', 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789');
    expect(findings.some((f) => f.reason === 'pattern-match')).toBe(true);
  });

  it('returns a finding for an NPM token', () => {
    const findings = run('NEXT_PUBLIC_NPM', 'npm_' + 'a'.repeat(36));
    expect(findings.some((f) => f.reason === 'pattern-match')).toBe(true);
  });

  it('uses the correct description', () => {
    const findings = run('NEXT_PUBLIC_KEY', 'sk_live_abcdefghijklmnopqrstu');
    const f = findings.find((f) => f.reason === 'pattern-match')!;
    expect(f.description).toContain('NEXT_PUBLIC_ prefix will inline');
    expect(f.description).toContain('client bundle');
  });

  it('only reports the first matching pattern (no duplicates per entry)', () => {
    // A JWT matches JWT pattern; should produce exactly 1 pattern-match finding
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const findings = run('NEXT_PUBLIC_TOKEN', jwt);
    expect(findings.filter((f) => f.reason === 'pattern-match')).toHaveLength(1);
  });

  it('returns no pattern-match finding for a safe value', () => {
    const findings = run('NEXT_PUBLIC_THEME', 'dark');
    expect(findings.filter((f) => f.reason === 'pattern-match')).toHaveLength(0);
  });

  it('includes the varName in the finding', () => {
    const findings = run('NEXT_PUBLIC_STRIPE', 'sk_live_abcdefghijklmnopqrstu');
    expect(findings[0].varName).toBe('NEXT_PUBLIC_STRIPE');
  });

  it('truncates the value to 8 chars + •••', () => {
    const findings = run('NEXT_PUBLIC_KEY', 'sk_live_abcdefghijklmnopqrstu');
    expect(findings[0].truncatedValue).toBe('sk_live_•••');
  });

  it('records the correct envFile and line', () => {
    const entry = makeEntry('NEXT_PUBLIC_KEY', 'sk_live_abcdefghijklmnopqrstu', 5);
    const findings = applyCheckRules({ entry, envFile: '.env.production' }, new Set());
    expect(findings[0].envFile).toBe('.env.production');
    expect(findings[0].line).toBe(5);
  });

  it('respects pattern severity (warning-level pattern produces warning)', () => {
    // JWT Token is 'warning' severity
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const findings = run('NEXT_PUBLIC_JWT', jwt);
    const f = findings.find((f) => f.reason === 'pattern-match')!;
    expect(f).toBeDefined();
    expect(f.severity).toBe('warning');
  });
});

// ── Rule 2: serverOnly config ─────────────────────────────────────────────────

describe('applyCheckRules — Rule 2 (serverOnly)', () => {
  it('flags when full NEXT_PUBLIC_ name is in serverOnly set', () => {
    const findings = run('NEXT_PUBLIC_FOO', 'safevalue', ['NEXT_PUBLIC_FOO']);
    expect(findings.some((f) => f.reason === 'serverOnly')).toBe(true);
  });

  it('flags when bare name (without prefix) is in serverOnly set', () => {
    const findings = run('NEXT_PUBLIC_FOO', 'safevalue', ['FOO']);
    expect(findings.some((f) => f.reason === 'serverOnly')).toBe(true);
  });

  it('uses CRITICAL severity', () => {
    const findings = run('NEXT_PUBLIC_FOO', 'safevalue', ['FOO']);
    const f = findings.find((f) => f.reason === 'serverOnly')!;
    expect(f.severity).toBe('critical');
  });

  it('uses the correct description with bare name', () => {
    const findings = run('NEXT_PUBLIC_DATABASE_URL', 'safevalue', ['DATABASE_URL']);
    const f = findings.find((f) => f.reason === 'serverOnly')!;
    expect(f.description).toContain('DATABASE_URL');
    expect(f.description).toContain('serverOnly');
    expect(f.description).toContain('NEXT_PUBLIC_ prefix');
  });

  it('does not flag when serverOnly set is empty', () => {
    const findings = run('NEXT_PUBLIC_FOO', 'safevalue', []);
    expect(findings.filter((f) => f.reason === 'serverOnly')).toHaveLength(0);
  });

  it('can produce both pattern-match AND serverOnly findings for the same entry', () => {
    const findings = run('NEXT_PUBLIC_KEY', 'sk_live_abcdefghijklmnopqrstu', ['KEY']);
    expect(findings.some((f) => f.reason === 'pattern-match')).toBe(true);
    expect(findings.some((f) => f.reason === 'serverOnly')).toBe(true);
  });

  it('flags even when value is short/safe — serverOnly ignores value content', () => {
    const findings = run('NEXT_PUBLIC_DB_HOST', 'localhost', ['DB_HOST']);
    expect(findings.some((f) => f.reason === 'serverOnly')).toBe(true);
  });
});

// ── Rule 3: high entropy ──────────────────────────────────────────────────────

describe('applyCheckRules — Rule 3 (high entropy)', () => {
  it('flags a 32+ char high-entropy value with WARN', () => {
    const findings = run('NEXT_PUBLIC_MYSTERY', 'aB3xQ9mKpLwRtYuVeNcJhZfDgS2iOo7X');
    const f = findings.find((f) => f.reason === 'high-entropy');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('warning');
  });

  it('flags a UUID with WARN', () => {
    // Use a UUID whose last segment contains letters to avoid the AWS Account ID pattern (\b[0-9]{12}\b)
    const findings = run('NEXT_PUBLIC_UUID', '550e8400-e29b-41d4-a716-44665544abcd');
    expect(findings.some((f) => f.reason === 'high-entropy')).toBe(true);
  });

  it('does NOT emit high-entropy when Rule 1 already fired', () => {
    // Stripe key is both high-entropy AND matches a pattern
    const findings = run('NEXT_PUBLIC_SK', 'sk_live_abcdefghijklmnopqrstu');
    expect(findings.filter((f) => f.reason === 'high-entropy')).toHaveLength(0);
    expect(findings.some((f) => f.reason === 'pattern-match')).toBe(true);
  });

  it('does NOT flag a URL even if long', () => {
    const findings = run('NEXT_PUBLIC_API', 'https://api.example.com/v1/endpoint/long/path/here/more/path');
    expect(findings.filter((f) => f.reason === 'high-entropy')).toHaveLength(0);
  });

  it('does NOT flag a short value even if high-entropy chars', () => {
    expect(run('NEXT_PUBLIC_X', 'aB3xQ9m').filter((f) => f.reason === 'high-entropy')).toHaveLength(0);
  });

  it('uses the correct description', () => {
    const findings = run('NEXT_PUBLIC_MYSTERY', 'aB3xQ9mKpLwRtYuVeNcJhZfDgS2iOo7X');
    const f = findings.find((f) => f.reason === 'high-entropy')!;
    expect(f.description).toContain('characteristics of a secret');
    expect(f.description).toContain('Verify it is safe to expose publicly');
  });

  it('high-entropy finding can coexist with serverOnly finding', () => {
    const findings = run('NEXT_PUBLIC_SECRET', 'aB3xQ9mKpLwRtYuVeNcJhZfDgS2iOo7X', ['SECRET']);
    expect(findings.some((f) => f.reason === 'high-entropy')).toBe(true);
    expect(findings.some((f) => f.reason === 'serverOnly')).toBe(true);
  });
});

// ── zero findings ─────────────────────────────────────────────────────────────

describe('applyCheckRules — no findings', () => {
  it('returns empty array for a safe short value', () => {
    expect(run('NEXT_PUBLIC_THEME', 'dark')).toHaveLength(0);
  });

  it('returns empty array for a plain public URL', () => {
    expect(run('NEXT_PUBLIC_API_URL', 'https://api.example.com')).toHaveLength(0);
  });

  it('returns empty array for an empty value', () => {
    expect(run('NEXT_PUBLIC_EMPTY', '')).toHaveLength(0);
  });

  it('returns empty array for a numeric value', () => {
    expect(run('NEXT_PUBLIC_PORT', '3000')).toHaveLength(0);
  });

  it('returns empty array for a slug-like feature flag value', () => {
    expect(run('NEXT_PUBLIC_FLAG', 'my-feature-enabled-rollout-experiment')).toHaveLength(0);
  });
});
