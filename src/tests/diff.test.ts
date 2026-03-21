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
