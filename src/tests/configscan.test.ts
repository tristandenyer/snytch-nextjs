import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanNextConfig } from '../configscan.js';
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

function makeConfig(next: string): void {
  mockReadFileSync.mockImplementation((path: unknown) => {
    if (typeof path === 'string' && path.endsWith('next.config.js')) {
      return next;
    }
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
}

function noConfig(): void {
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

describe('scanNextConfig', () => {
  describe('missing config file', () => {
    it('returns [] when no next.config.* file exists', () => {
      noConfig();
      const findings = scanNextConfig('/project', emptyConfig);
      expect(findings).toEqual([]);
    });
  });

  describe('config with no env block', () => {
    it('returns [] when env block is absent', () => {
      makeConfig(`
        const nextConfig = {
          reactStrictMode: true,
        };
        module.exports = nextConfig;
      `);
      const findings = scanNextConfig('/project', emptyConfig);
      expect(findings).toEqual([]);
    });
  });

  describe('config with env block but no secrets', () => {
    it('returns [] when values are harmless strings', () => {
      makeConfig(`
        const nextConfig = {
          env: {
            APP_NAME: 'My App',
            VERSION: '1.0.0',
          },
        };
        module.exports = nextConfig;
      `);
      const findings = scanNextConfig('/project', emptyConfig);
      expect(findings).toEqual([]);
    });
  });

  describe('pattern matching', () => {
    it('detects a Stripe secret key in env block', () => {
      // Use a split to avoid GitHub push protection
      const stripeKey = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz123456';
      makeConfig(`
        const nextConfig = {
          env: {
            STRIPE_KEY: '${stripeKey}',
          },
        };
        module.exports = nextConfig;
      `);
      const findings = scanNextConfig('/project', emptyConfig);
      expect(findings.length).toBeGreaterThan(0);
      const f = findings[0];
      expect(f.type).toBe('config-env');
      expect(f.severity).toBe('critical');
      expect(f.filePath).toContain('next.config.js');
      expect(f.truncatedValue).toMatch(/sk_live_/);
    });

    it('detects a GitHub token in env block', () => {
      // Synthetic token that matches the GitHub PAT pattern
      const ghToken = 'ghp_' + 'A'.repeat(36);
      makeConfig(`
        const nextConfig = {
          env: {
            GH_TOKEN: '${ghToken}',
          },
        };
        module.exports = nextConfig;
      `);
      const findings = scanNextConfig('/project', emptyConfig);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].type).toBe('config-env');
    });

    it('includes the key name in the description', () => {
      const stripeKey = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz123456';
      makeConfig(`
        const nextConfig = {
          env: {
            MY_STRIPE: '${stripeKey}',
          },
        };
        module.exports = nextConfig;
      `);
      const findings = scanNextConfig('/project', emptyConfig);
      expect(findings[0].description).toContain('MY_STRIPE');
    });

    it('deduplicates findings for the same pattern+key', () => {
      // Two entries that would both match the same pattern
      const stripeKey = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz123456';
      makeConfig(`
        const nextConfig = {
          env: {
            STRIPE_KEY: '${stripeKey}',
          },
        };
        module.exports = nextConfig;
      `);
      const findings = scanNextConfig('/project', emptyConfig);
      // Each pattern should appear at most once per key
      const patternNames = findings.map((f) => f.patternName + '|' + f.filePath);
      const unique = new Set(patternNames);
      expect(patternNames.length).toBe(unique.size);
    });
  });

  describe('serverOnly value matching', () => {
    it('flags a serverOnly var whose literal value appears in the env block', () => {
      const secretValue = 'supersecret-db-password-xyz';
      mockResolveEnvVars.mockReturnValue([
        { name: 'DATABASE_PASSWORD', value: secretValue, source: '.env.local' },
      ]);
      makeConfig(`
        const nextConfig = {
          env: {
            DB_PASS: '${secretValue}',
          },
        };
        module.exports = nextConfig;
      `);
      const config: SnytchConfig = { serverOnly: ['DATABASE_PASSWORD'] };
      const findings = scanNextConfig('/project', config);
      const valueFinding = findings.find((f) => f.patternName.includes('Value match'));
      expect(valueFinding).toBeDefined();
      expect(valueFinding?.severity).toBe('critical');
      expect(valueFinding?.type).toBe('config-env');
    });
  });

  describe('serverOnly key matching', () => {
    it('flags a key that is listed in serverOnly regardless of value format', () => {
      mockResolveEnvVars.mockReturnValue([]);
      makeConfig(`
        const nextConfig = {
          env: {
            NEXTAUTH_SECRET: 'some-value-here',
          },
        };
        module.exports = nextConfig;
      `);
      const config: SnytchConfig = { serverOnly: ['NEXTAUTH_SECRET'] };
      const findings = scanNextConfig('/project', config);
      const keyFinding = findings.find((f) => f.patternName.includes('serverOnly key'));
      expect(keyFinding).toBeDefined();
      expect(keyFinding?.severity).toBe('critical');
      expect(keyFinding?.description).toContain('NEXTAUTH_SECRET');
    });
  });

  describe('edge cases', () => {
    it('skips process.env.* values (not literal secrets)', () => {
      makeConfig(`
        const nextConfig = {
          env: {
            API_KEY: process.env.SOME_KEY,
          },
        };
        module.exports = nextConfig;
      `);
      const findings = scanNextConfig('/project', emptyConfig);
      expect(findings).toEqual([]);
    });

    it('handles double-quoted values', () => {
      const stripeKey = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz123456';
      makeConfig(`
        const nextConfig = {
          env: {
            STRIPE: "${stripeKey}",
          },
        };
        module.exports = nextConfig;
      `);
      const findings = scanNextConfig('/project', emptyConfig);
      expect(findings.length).toBeGreaterThan(0);
    });

    it('handles backtick-quoted values', () => {
      const stripeKey = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz123456';
      makeConfig(`
        const nextConfig = {
          env: {
            STRIPE: \`${stripeKey}\`,
          },
        };
        module.exports = nextConfig;
      `);
      const findings = scanNextConfig('/project', emptyConfig);
      expect(findings.length).toBeGreaterThan(0);
    });

    it('returns [] when the env block braces are unbalanced (malformed config)', () => {
      makeConfig(`
        const nextConfig = {
          env: {
            KEY: 'value'
            // missing closing brace
        module.exports = nextConfig;
      `);
      // Should not throw
      expect(() => scanNextConfig('/project', emptyConfig)).not.toThrow();
    });

    it('returns [] on a completely empty file', () => {
      makeConfig('');
      const findings = scanNextConfig('/project', emptyConfig);
      expect(findings).toEqual([]);
    });

    it('sets charOffset to a non-negative number', () => {
      const stripeKey = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz123456';
      makeConfig(`
        const nextConfig = {
          env: {
            STRIPE: '${stripeKey}',
          },
        };
        module.exports = nextConfig;
      `);
      const findings = scanNextConfig('/project', emptyConfig);
      expect(findings.length).toBeGreaterThan(0);
      for (const f of findings) {
        expect(f.charOffset).toBeGreaterThanOrEqual(0);
      }
    });

    it('truncates the matched value to 8 chars + •••', () => {
      const stripeKey = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz123456';
      makeConfig(`
        const nextConfig = {
          env: {
            STRIPE: '${stripeKey}',
          },
        };
        module.exports = nextConfig;
      `);
      const findings = scanNextConfig('/project', emptyConfig);
      expect(findings.length).toBeGreaterThan(0);
      for (const f of findings) {
        expect(f.truncatedValue).toMatch(/^.{1,8}•••$/u);
      }
    });
  });

  describe('next.config.mjs fallback', () => {
    it('falls back to next.config.mjs when .js is missing', () => {
      const stripeKey = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz123456';
      mockReadFileSync.mockImplementation((path: unknown) => {
        if (typeof path !== 'string') throw new Error('unexpected');
        if (path.endsWith('next.config.js')) {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        }
        if (path.endsWith('next.config.mjs')) {
          return `export default { env: { STRIPE: '${stripeKey}' } };`;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      const findings = scanNextConfig('/project', emptyConfig);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].filePath).toContain('next.config.mjs');
    });
  });
});
