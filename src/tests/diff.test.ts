import { describe, it, expect, vi, beforeEach } from 'vitest';
import { diffEnvFiles } from '../diff.js';

// Mock fs to avoid real filesystem reads
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

import { readFileSync } from 'fs';
const mockReadFileSync = vi.mocked(readFileSync);

function setup(fileContents: Record<string, string>) {
  mockReadFileSync.mockImplementation((path) => {
    const p = path as string;
    if (p in fileContents) return fileContents[p];
    const err = new Error(`ENOENT: no such file or directory, open '${p}'`);
    (err as NodeJS.ErrnoException).code = 'ENOENT';
    throw err;
  });
}

function files(map: Record<string, string>) {
  return Object.entries(map).map(([label, path]) => ({ path, label }));
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ── Identical files ──────────────────────────────────────────────────────────

describe('diffEnvFiles — identical files', () => {
  it('puts all keys in inSync when both files have the same keys', () => {
    setup({
      '/a/.env': 'FOO=1\nBAR=2\nBAZ=3\n',
      '/b/.env': 'FOO=x\nBAR=y\nBAZ=z\n',
    });
    const result = diffEnvFiles(files({ '.env (a)': '/a/.env', '.env (b)': '/b/.env' }));
    expect(result.inSync).toEqual(['BAR', 'BAZ', 'FOO']);
    expect(result.drift).toEqual([]);
    expect(result.onlyInOne).toEqual([]);
  });

  it('handles empty files (both empty)', () => {
    setup({ '/a/.env': '', '/b/.env': '' });
    const result = diffEnvFiles(files({ 'a': '/a/.env', 'b': '/b/.env' }));
    expect(result.inSync).toEqual([]);
    expect(result.drift).toEqual([]);
    expect(result.onlyInOne).toEqual([]);
  });
});

// ── One key missing ──────────────────────────────────────────────────────────

describe('diffEnvFiles — one key missing', () => {
  it('puts the missing key in onlyInOne', () => {
    setup({
      '/a/.env': 'FOO=1\nBAR=2\n',
      '/b/.env': 'FOO=x\n',
    });
    const result = diffEnvFiles(files({ 'a': '/a/.env', 'b': '/b/.env' }));
    expect(result.inSync).toEqual(['FOO']);
    expect(result.onlyInOne).toEqual([{ key: 'BAR', file: 'a' }]);
    expect(result.drift).toEqual([]);
  });

  it('correctly identifies which file the key is missing from', () => {
    setup({
      '/a/.env': 'FOO=1\n',
      '/b/.env': 'FOO=x\nSECRET_KEY=y\n',
    });
    const result = diffEnvFiles(files({ 'a': '/a/.env', 'b': '/b/.env' }));
    expect(result.onlyInOne).toEqual([{ key: 'SECRET_KEY', file: 'b' }]);
  });
});

// ── Asymmetric drift (3 files) ───────────────────────────────────────────────

describe('diffEnvFiles — asymmetric drift across 3 files', () => {
  it('puts keys present in some-but-not-all in drift', () => {
    setup({
      '/a/.env': 'FOO=1\nBAR=2\n',
      '/b/.env': 'FOO=x\nBAZ=3\n',
      '/c/.env': 'FOO=y\nBAR=z\nBAZ=w\n',
    });
    const result = diffEnvFiles(files({ 'a': '/a/.env', 'b': '/b/.env', 'c': '/c/.env' }));

    expect(result.inSync).toEqual(['FOO']);

    // BAR: present in a and c, missing from b
    const barDrift = result.drift.find((d) => d.key === 'BAR');
    expect(barDrift).toBeDefined();
    expect(barDrift!.presentIn.sort()).toEqual(['a', 'c']);
    expect(barDrift!.missingFrom).toEqual(['b']);

    // BAZ: present in b and c, missing from a
    const bazDrift = result.drift.find((d) => d.key === 'BAZ');
    expect(bazDrift).toBeDefined();
    expect(bazDrift!.presentIn.sort()).toEqual(['b', 'c']);
    expect(bazDrift!.missingFrom).toEqual(['a']);

    expect(result.onlyInOne).toEqual([]);
  });
});

// ── Completely different files ───────────────────────────────────────────────

describe('diffEnvFiles — completely different keys', () => {
  it('puts every key in onlyInOne when there is no overlap', () => {
    setup({
      '/a/.env': 'ALPHA=1\nBETA=2\n',
      '/b/.env': 'GAMMA=x\nDELTA=y\n',
    });
    const result = diffEnvFiles(files({ 'a': '/a/.env', 'b': '/b/.env' }));
    expect(result.inSync).toEqual([]);
    expect(result.drift).toEqual([]);
    expect(result.onlyInOne.map((e) => e.key).sort()).toEqual(['ALPHA', 'BETA', 'DELTA', 'GAMMA']);
  });
});

// ── Missing/unreadable file ──────────────────────────────────────────────────

describe('diffEnvFiles — missing file', () => {
  it('treats a missing file as empty (all its keys appear only in the other file)', () => {
    setup({
      '/a/.env': 'FOO=1\nBAR=2\n',
      // /b/.env is not in setup → readFileSync throws ENOENT
    });
    const result = diffEnvFiles(files({ 'a': '/a/.env', 'b': '/b/.env' }));
    expect(result.inSync).toEqual([]);
    expect(result.drift).toEqual([]);
    expect(result.onlyInOne.map((e) => e.key).sort()).toEqual(['BAR', 'FOO']);
    expect(result.onlyInOne.every((e) => e.file === 'a')).toBe(true);
  });
});

// ── Values are never in output ───────────────────────────────────────────────

describe('diffEnvFiles — no values in result', () => {
  it('result contains no secret values from the env files', () => {
    setup({
      '/a/.env': 'API_KEY=sk-live-supersecretvalue12345\n',
      '/b/.env': 'API_KEY=sk-live-differentsecret67890\n',
    });
    const result = diffEnvFiles(files({ 'a': '/a/.env', 'b': '/b/.env' }));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('sk-live');
    expect(serialized).not.toContain('supersecret');
    expect(serialized).not.toContain('differentsecret');
    // Key name is fine
    expect(serialized).toContain('API_KEY');
  });
});

// ── Error handling ───────────────────────────────────────────────────────────

describe('diffEnvFiles — validation', () => {
  it('throws when fewer than two files are provided', () => {
    setup({ '/a/.env': 'FOO=1\n' });
    expect(() =>
      diffEnvFiles([{ path: '/a/.env', label: 'a' }]),
    ).toThrow('at least two files');
  });
});

// ── Alias-aware diffing ──────────────────────────────────────────────────────

describe('diffEnvFiles — alias groups', () => {
  it('treats aliased keys as the same logical variable (in sync)', () => {
    setup({
      '/a/.env': 'STRIPE_SECRET_KEY_TEST=sk_test_xxx\n',
      '/b/.env': 'STRIPE_SECRET_KEY=sk_live_xxx\n',
    });
    const aliases = [['STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY_TEST']];
    const result = diffEnvFiles(files({ 'dev': '/a/.env', 'prod': '/b/.env' }), aliases);
    expect(result.inSync).toEqual(['STRIPE_SECRET_KEY']);
    expect(result.drift).toEqual([]);
    expect(result.onlyInOne).toEqual([]);
  });

  it('uses the first element in the alias group as the canonical name', () => {
    setup({
      '/a/.env': 'DEV_DB_URL=postgres://dev\n',
      '/b/.env': 'DATABASE_URL=postgres://prod\n',
    });
    const aliases = [['DATABASE_URL', 'DEV_DB_URL']];
    const result = diffEnvFiles(files({ 'dev': '/a/.env', 'prod': '/b/.env' }), aliases);
    expect(result.inSync).toEqual(['DATABASE_URL']);
  });

  it('reports drift using canonical name when alias is missing from a file', () => {
    setup({
      '/a/.env': 'STRIPE_KEY_TEST=sk_test_xxx\nFOO=1\n',
      '/b/.env': 'FOO=2\n',
    });
    const aliases = [['STRIPE_KEY', 'STRIPE_KEY_TEST']];
    const result = diffEnvFiles(files({ 'dev': '/a/.env', 'prod': '/b/.env' }), aliases);
    expect(result.inSync).toEqual(['FOO']);
    expect(result.onlyInOne).toEqual([{ key: 'STRIPE_KEY', file: 'dev' }]);
  });

  it('handles multiple alias groups independently', () => {
    setup({
      '/a/.env': 'DB_DEV=x\nSTRIPE_TEST=y\n',
      '/b/.env': 'DATABASE_URL=x\nSTRIPE_KEY=y\n',
    });
    const aliases = [
      ['DATABASE_URL', 'DB_DEV'],
      ['STRIPE_KEY', 'STRIPE_TEST'],
    ];
    const result = diffEnvFiles(files({ 'dev': '/a/.env', 'prod': '/b/.env' }), aliases);
    expect(result.inSync.sort()).toEqual(['DATABASE_URL', 'STRIPE_KEY']);
    expect(result.drift).toEqual([]);
    expect(result.onlyInOne).toEqual([]);
  });

  it('ignores alias groups with fewer than 2 entries', () => {
    setup({
      '/a/.env': 'FOO=1\n',
      '/b/.env': 'FOO=2\n',
    });
    const aliases = [['SOLO']];
    const result = diffEnvFiles(files({ 'a': '/a/.env', 'b': '/b/.env' }), aliases);
    expect(result.inSync).toEqual(['FOO']);
  });

  it('works with no aliases (undefined)', () => {
    setup({
      '/a/.env': 'FOO=1\n',
      '/b/.env': 'FOO=2\n',
    });
    const result = diffEnvFiles(files({ 'a': '/a/.env', 'b': '/b/.env' }), undefined);
    expect(result.inSync).toEqual(['FOO']);
  });

  it('works across 3 files with mixed aliased and non-aliased keys', () => {
    setup({
      '/a/.env': 'API_KEY_DEV=x\nSHARED=1\n',
      '/b/.env': 'API_KEY_STAGING=x\nSHARED=2\n',
      '/c/.env': 'API_KEY=x\nSHARED=3\n',
    });
    const aliases = [['API_KEY', 'API_KEY_DEV', 'API_KEY_STAGING']];
    const result = diffEnvFiles(
      files({ 'dev': '/a/.env', 'staging': '/b/.env', 'prod': '/c/.env' }),
      aliases,
    );
    expect(result.inSync.sort()).toEqual(['API_KEY', 'SHARED']);
    expect(result.drift).toEqual([]);
    expect(result.onlyInOne).toEqual([]);
  });
});

// ── Result is sorted ────────────────────────────────────────────────────────

describe('diffEnvFiles — sorted output', () => {
  it('returns inSync keys in alphabetical order', () => {
    setup({
      '/a/.env': 'ZEBRA=1\nAPPLE=2\nMIDDLE=3\n',
      '/b/.env': 'ZEBRA=x\nAPPLE=y\nMIDDLE=z\n',
    });
    const result = diffEnvFiles(files({ 'a': '/a/.env', 'b': '/b/.env' }));
    expect(result.inSync).toEqual(['APPLE', 'MIDDLE', 'ZEBRA']);
  });
});
