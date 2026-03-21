import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanSourceMaps, deduplicateSourceMapFindings } from '../sourcemapscan.js';
import type { SnytchConfig, Finding } from '../types.js';

// ── fs mock ───────────────────────────────────────────────────────────────────

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

import { readFileSync, readdirSync } from 'fs';
const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);

// ── config mock ───────────────────────────────────────────────────────────────

vi.mock('../config.js', () => ({
  resolveEnvVars: vi.fn(() => []),
}));

import { resolveEnvVars } from '../config.js';
const mockResolveEnvVars = vi.mocked(resolveEnvVars);

// ── helpers ───────────────────────────────────────────────────────────────────

type FakeDirent = { name: string; isDirectory: () => boolean; isFile: () => boolean };

function makeDirent(name: string, isDir = false): FakeDirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
  };
}

/**
 * Set up readdirSync to return a single .js.map file in chunks dir,
 * and readFileSync to return the given source map JSON content.
 */
function makeSourceMap(sourcesContent: unknown[] | undefined, extraFields?: Record<string, unknown>): void {
  const mapData: Record<string, unknown> = { ...extraFields };
  if (sourcesContent !== undefined) {
    mapData['sourcesContent'] = sourcesContent;
  }

  mockReaddirSync.mockImplementation((dir: unknown) => {
    if (typeof dir === 'string' && dir.endsWith('chunks')) {
      return [makeDirent('main-abc.js.map')] as unknown as ReturnType<typeof readdirSync>;
    }
    return [] as unknown as ReturnType<typeof readdirSync>;
  });

  mockReadFileSync.mockImplementation((path: unknown) => {
    if (typeof path === 'string' && path.endsWith('.js.map')) {
      return JSON.stringify(mapData);
    }
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
}

/** Set up readdirSync to simulate a missing chunks directory. */
function noChunksDir(): void {
  mockReaddirSync.mockImplementation(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
}

const emptyConfig: SnytchConfig = {};

// ── tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveEnvVars.mockReturnValue([]);
});

describe('scanSourceMaps', () => {
  describe('missing directory', () => {
    it('returns [] when .next/static/chunks does not exist', () => {
      noChunksDir();
      const findings = scanSourceMaps('/project/.next', '/project', emptyConfig);
      expect(findings).toEqual([]);
    });
  });

  describe('no sourcesContent field', () => {
    it('returns [] when source map has no sourcesContent', () => {
      makeSourceMap(undefined, { version: 3, mappings: '' });
      const findings = scanSourceMaps('/project/.next', '/project', emptyConfig);
      expect(findings).toEqual([]);
    });
  });

  describe('empty sourcesContent array', () => {
    it('returns [] when sourcesContent is empty', () => {
      makeSourceMap([]);
      const findings = scanSourceMaps('/project/.next', '/project', emptyConfig);
      expect(findings).toEqual([]);
    });
  });

  describe('malformed JSON', () => {
    it('returns [] and does not throw when source map is not valid JSON', () => {
      mockReaddirSync.mockImplementation((dir: unknown) => {
        if (typeof dir === 'string' && dir.endsWith('chunks')) {
          return [makeDirent('main-abc.js.map')] as unknown as ReturnType<typeof readdirSync>;
        }
        return [] as unknown as ReturnType<typeof readdirSync>;
      });
      mockReadFileSync.mockImplementation((path: unknown) => {
        if (typeof path === 'string' && path.endsWith('.js.map')) {
          return '{ this is not json |||';
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      expect(() => scanSourceMaps('/project/.next', '/project', emptyConfig)).not.toThrow();
      const findings = scanSourceMaps('/project/.next', '/project', emptyConfig);
      expect(findings).toEqual([]);
    });
  });

  describe('source map with a secret in sourcesContent', () => {
    it('detects a Stripe secret key in sourcesContent', () => {
      const stripeKey = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz123456';
      makeSourceMap([`const key = "${stripeKey}"; export default key;`]);
      const findings = scanSourceMaps('/project/.next', '/project', emptyConfig);
      expect(findings.length).toBeGreaterThan(0);
      const f = findings[0];
      expect(f.type).toBe('sourcemap-secret');
      expect(f.severity).toBe('warning');
      expect(f.filePath).toContain('.js.map');
    });

    it('detects a GitHub token in sourcesContent', () => {
      const ghToken = 'ghp_' + 'A'.repeat(36);
      makeSourceMap([`const t = '${ghToken}';`]);
      const findings = scanSourceMaps('/project/.next', '/project', emptyConfig);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].type).toBe('sourcemap-secret');
    });

    it('always returns severity warning (not critical)', () => {
      // AWS key is normally critical in live bundle — source map should be warning
      const awsKey = 'AKIA' + 'IOSFODNN7EXAMPLE';
      makeSourceMap([`const aws = "${awsKey}";`]);
      const findings = scanSourceMaps('/project/.next', '/project', emptyConfig);
      expect(findings.length).toBeGreaterThan(0);
      for (const f of findings) {
        expect(f.severity).toBe('warning');
      }
    });

    it('includes "source map" in the description', () => {
      const stripeKey = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz123456';
      makeSourceMap([`const k = '${stripeKey}';`]);
      const findings = scanSourceMaps('/project/.next', '/project', emptyConfig);
      expect(findings[0].description).toContain('source map');
    });

    it('truncates matched value to 8 chars + •••', () => {
      const stripeKey = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz123456';
      makeSourceMap([`const k = '${stripeKey}';`]);
      const findings = scanSourceMaps('/project/.next', '/project', emptyConfig);
      expect(findings.length).toBeGreaterThan(0);
      for (const f of findings) {
        expect(f.truncatedValue).toMatch(/^.{1,8}•••$/u);
      }
    });

    it('deduplicates findings for the same pattern+value within one source map', () => {
      const stripeKey = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz123456';
      makeSourceMap([
        `const a = '${stripeKey}';`,
        `const b = '${stripeKey}';`, // same key in a second source file in the map
      ]);
      const findings = scanSourceMaps('/project/.next', '/project', emptyConfig);
      const matchKeys = findings.map((f) => f.patternName + '|' + f.truncatedValue);
      const unique = new Set(matchKeys);
      expect(matchKeys.length).toBe(unique.size);
    });
  });

  describe('serverOnly value matching', () => {
    it('flags a serverOnly var whose literal value appears in sourcesContent', () => {
      const secretValue = 'my-super-secret-db-password-xyz';
      mockResolveEnvVars.mockReturnValue([
        { name: 'DB_PASSWORD', value: secretValue, source: '.env.local' },
      ]);
      makeSourceMap([`const conn = '${secretValue}';`]);
      const config: SnytchConfig = { serverOnly: ['DB_PASSWORD'] };
      const findings = scanSourceMaps('/project/.next', '/project', config);
      const valueFinding = findings.find((f) => f.patternName.includes('Value match'));
      expect(valueFinding).toBeDefined();
      expect(valueFinding?.severity).toBe('warning');
      expect(valueFinding?.type).toBe('sourcemap-secret');
      expect(valueFinding?.description).toContain('DB_PASSWORD');
    });
  });
});

describe('deduplicateSourceMapFindings', () => {
  function makeMinimalFinding(truncatedValue: string, type: Finding['type'] = 'sourcemap-secret'): Finding {
    return {
      type,
      patternName: 'Test Pattern',
      severity: 'warning',
      description: 'test',
      filePath: '/project/.next/static/chunks/main.js.map',
      charOffset: 0,
      truncatedValue,
    };
  }

  it('removes source map findings whose truncatedValue already appears in live bundle findings', () => {
    const liveFinding = makeMinimalFinding('sk_live_•••', 'pattern-match');
    const smFinding = makeMinimalFinding('sk_live_•••', 'sourcemap-secret');
    const result = deduplicateSourceMapFindings([smFinding], [liveFinding]);
    expect(result).toEqual([]);
  });

  it('keeps source map findings whose truncatedValue is not in the live bundle', () => {
    const liveFinding = makeMinimalFinding('AKIAIODNN•••', 'pattern-match');
    const smFinding = makeMinimalFinding('ghp_XyZ12•••', 'sourcemap-secret');
    const result = deduplicateSourceMapFindings([smFinding], [liveFinding]);
    expect(result).toEqual([smFinding]);
  });

  it('returns all source map findings when live bundle findings is empty', () => {
    const smFinding = makeMinimalFinding('sk_live_•••', 'sourcemap-secret');
    const result = deduplicateSourceMapFindings([smFinding], []);
    expect(result).toEqual([smFinding]);
  });

  it('returns [] when source map findings is empty', () => {
    const liveFinding = makeMinimalFinding('sk_live_•••', 'pattern-match');
    const result = deduplicateSourceMapFindings([], [liveFinding]);
    expect(result).toEqual([]);
  });

  it('keeps a source map finding only if its truncatedValue is absent from live bundle', () => {
    const live1 = makeMinimalFinding('sk_live_•••', 'pattern-match');
    const live2 = makeMinimalFinding('AKIAIODNN•••', 'value-match');
    const sm1 = makeMinimalFinding('sk_live_•••', 'sourcemap-secret'); // duplicate
    const sm2 = makeMinimalFinding('ghp_XyZ12•••', 'sourcemap-secret'); // unique
    const result = deduplicateSourceMapFindings([sm1, sm2], [live1, live2]);
    expect(result).toEqual([sm2]);
  });
});
