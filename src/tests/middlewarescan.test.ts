import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanMiddleware } from '../middlewarescan.js';
import type { SnytchConfig } from '../types.js';

// ── fs mock ───────────────────────────────────────────────────────────────────

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

import { readFileSync } from 'fs';
const mockReadFileSync = vi.mocked(readFileSync);

// ── config mock (resolveEnvVars) ──────────────────────────────────────────────

vi.mock('../config.js', () => ({
  resolveEnvVars: vi.fn(() => []),
}));

import { resolveEnvVars } from '../config.js';
const mockResolveEnvVars = vi.mocked(resolveEnvVars);

// ── helpers ───────────────────────────────────────────────────────────────────

function makeMiddleware(content: string): void {
  mockReadFileSync.mockImplementation((path: unknown) => {
    if (typeof path === 'string' && path.endsWith('middleware.js')) {
      return content;
    }
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
}

function noMiddleware(): void {
  mockReadFileSync.mockImplementation(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
}

const emptyConfig: SnytchConfig = {};

// ── tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveEnvVars.mockReturnValue([]);
});

describe('scanMiddleware', () => {
  describe('missing middleware file', () => {
    it('returns [] when no middleware.js exists', () => {
      noMiddleware();
      const findings = scanMiddleware('/project/.next', '/project', emptyConfig);
      expect(findings).toEqual([]);
    });
  });

  describe('middleware file with no secrets', () => {
    it('returns [] when content has no pattern matches', () => {
      makeMiddleware('export function middleware(req) { return Response.next(); }');
      const findings = scanMiddleware('/project/.next', '/project', emptyConfig);
      expect(findings).toEqual([]);
    });
  });

  describe('pattern matching', () => {
    it('detects a Stripe secret key in middleware', () => {
      const stripeKey = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz123456';
      makeMiddleware(`const key = "${stripeKey}"; // leaked secret`);
      const findings = scanMiddleware('/project/.next', '/project', emptyConfig);
      expect(findings.length).toBeGreaterThan(0);
      const f = findings[0];
      expect(f.type).toBe('middleware-secret');
      expect(f.severity).toBe('critical');
      expect(f.filePath).toContain('middleware.js');
    });

    it('detects a GitHub token in middleware', () => {
      const ghToken = 'ghp_' + 'A'.repeat(36);
      makeMiddleware(`const token = '${ghToken}';`);
      const findings = scanMiddleware('/project/.next', '/project', emptyConfig);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].type).toBe('middleware-secret');
    });

    it('includes "edge middleware" in the description', () => {
      const stripeKey = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz123456';
      makeMiddleware(`const k = '${stripeKey}';`);
      const findings = scanMiddleware('/project/.next', '/project', emptyConfig);
      expect(findings[0].description).toContain('edge middleware');
    });

    it('deduplicates findings for the same pattern+value', () => {
      const stripeKey = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz123456';
      // Same key appears twice in the file
      makeMiddleware(`const a = '${stripeKey}'; const b = '${stripeKey}';`);
      const findings = scanMiddleware('/project/.next', '/project', emptyConfig);
      // Should be deduplicated per matchKey
      const matchKeys = findings.map((f) => f.patternName + '|' + f.truncatedValue);
      const unique = new Set(matchKeys);
      expect(matchKeys.length).toBe(unique.size);
    });

    it('truncates matched value to 8 chars + •••', () => {
      const stripeKey = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz123456';
      makeMiddleware(`const k = '${stripeKey}';`);
      const findings = scanMiddleware('/project/.next', '/project', emptyConfig);
      expect(findings.length).toBeGreaterThan(0);
      for (const f of findings) {
        expect(f.truncatedValue).toMatch(/^.{1,8}•••$/u);
      }
    });

    it('sets charOffset to the match position in the file', () => {
      const stripeKey = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz123456';
      const prefix = 'const k = \'';
      makeMiddleware(`${prefix}${stripeKey}';`);
      const findings = scanMiddleware('/project/.next', '/project', emptyConfig);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].charOffset).toBeGreaterThanOrEqual(prefix.length);
    });
  });

  describe('serverOnly value matching', () => {
    it('flags a serverOnly var whose literal value appears in middleware', () => {
      const secretValue = 'my-super-secret-db-password-xyz';
      mockResolveEnvVars.mockReturnValue([
        { name: 'DB_PASSWORD', value: secretValue, source: '.env.local' },
      ]);
      makeMiddleware(`const conn = process.env.DB_PASSWORD || '${secretValue}';`);
      const config: SnytchConfig = { serverOnly: ['DB_PASSWORD'] };
      const findings = scanMiddleware('/project/.next', '/project', config);
      const valueFinding = findings.find((f) => f.patternName.includes('Value match'));
      expect(valueFinding).toBeDefined();
      expect(valueFinding?.severity).toBe('critical');
      expect(valueFinding?.type).toBe('middleware-secret');
      expect(valueFinding?.description).toContain('DB_PASSWORD');
    });

    it('only records the first occurrence per var', () => {
      const secretValue = 'my-super-secret-db-password-xyz';
      mockResolveEnvVars.mockReturnValue([
        { name: 'DB_PASSWORD', value: secretValue, source: '.env.local' },
      ]);
      // Two occurrences of the same value
      makeMiddleware(`const a = '${secretValue}'; const b = '${secretValue}';`);
      const config: SnytchConfig = { serverOnly: ['DB_PASSWORD'] };
      const findings = scanMiddleware('/project/.next', '/project', config);
      const valueFindings = findings.filter((f) => f.patternName === 'Value match: DB_PASSWORD');
      expect(valueFindings).toHaveLength(1);
    });
  });
});
