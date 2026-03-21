import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGitLog, identifyCulprit, extractCandidateImports, isGitRepo } from '../gitlog.js';
import type { GitCommit } from '../types.js';

// ── Mock fs and child_process ─────────────────────────────────────────────────

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));

import { readFileSync, existsSync } from 'fs';
import { execSync, spawnSync } from 'child_process';
const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockExecSync = vi.mocked(execSync);
const mockSpawnSync = vi.mocked(spawnSync);

beforeEach(() => {
  vi.resetAllMocks();
});

/** Build a minimal SpawnSyncReturns-compatible object for mockSpawnSync. */
function spawnResult(stdout: string) {
  return { pid: 0, output: [], stdout: Buffer.from(stdout), stderr: Buffer.from(''), status: 0, signal: null };
}

// ── isGitRepo ─────────────────────────────────────────────────────────────────

describe('isGitRepo', () => {
  it('returns true when git rev-parse succeeds', () => {
    mockExecSync.mockReturnValue(Buffer.from('.git'));
    expect(isGitRepo('/project')).toBe(true);
  });

  it('returns false when git rev-parse throws (not a git repo)', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repository');
    });
    expect(isGitRepo('/project')).toBe(false);
  });
});

// ── getGitLog ─────────────────────────────────────────────────────────────────

describe('getGitLog', () => {
  it('parses well-formed git log output into commit objects', () => {
    mockSpawnSync.mockReturnValue(spawnResult(
      [
        'abc1234|Alice Dev|alice@example.com|2 days ago|feat: add stripe integration',
        'def5678|Bob Fix|bob@example.com|1 week ago|fix: remove hardcoded key',
      ].join('\n'),
    ));

    const log = getGitLog('/project/src/lib/stripe.ts', '/project');

    expect(log).toHaveLength(2);
    expect(log[0]).toEqual({
      hash: 'abc1234',
      author: 'Alice Dev',
      email: 'alice@example.com',
      relativeTime: '2 days ago',
      message: 'feat: add stripe integration',
    });
    expect(log[1].hash).toBe('def5678');
  });

  it('returns empty array when git log output is empty', () => {
    mockSpawnSync.mockReturnValue(spawnResult(''));
    expect(getGitLog('/project/src/lib/config.ts', '/project')).toEqual([]);
  });

  it('returns empty array when spawnSync throws', () => {
    mockSpawnSync.mockImplementation(() => {
      throw new Error('git: command not found');
    });
    expect(getGitLog('/project/src/lib/config.ts', '/project')).toEqual([]);
  });

  it('handles commit messages that contain pipe characters', () => {
    mockSpawnSync.mockReturnValue(spawnResult('abc1234|Dev Name|dev@x.com|3 hours ago|feat: support env|vars in config'));

    const log = getGitLog('/project/src/lib/env.ts', '/project');
    expect(log[0].message).toBe('feat: support env|vars in config');
  });

  it('skips malformed lines (fewer than 5 pipe-separated fields)', () => {
    mockSpawnSync.mockReturnValue(spawnResult(
      [
        'abc1234|Alice|alice@x.com|1 day ago|valid commit',
        'bad-line-without-enough-fields',
        'def5678|Bob|bob@x.com|2 days ago|another valid commit',
      ].join('\n'),
    ));

    const log = getGitLog('/project/src/lib/api.ts', '/project');
    expect(log).toHaveLength(2);
    expect(log.map((c) => c.hash)).toEqual(['abc1234', 'def5678']);
  });

  it('passes the relative file path to git log', () => {
    mockSpawnSync.mockReturnValue(spawnResult(''));
    getGitLog('/project/src/lib/stripe.ts', '/project');

    const args = mockSpawnSync.mock.calls[0][1] as string[];
    expect(args).toContain('src/lib/stripe.ts');
    expect(args).toContain('log');
    expect(args).toContain('--follow');
  });
});

// ── identifyCulprit ───────────────────────────────────────────────────────────

describe('identifyCulprit', () => {
  function commit(overrides: Partial<GitCommit> = {}): GitCommit {
    return {
      hash: 'aaa0000',
      author: 'Dev',
      email: 'dev@x.com',
      relativeTime: '1 day ago',
      message: 'chore: misc update',
      ...overrides,
    };
  }

  it('returns null for an empty log', () => {
    expect(identifyCulprit([])).toBeNull();
  });

  it('prefers a commit with "add" in the message', () => {
    const log = [
      commit({ hash: 'aaa', message: 'refactor: cleanup' }),
      commit({ hash: 'bbb', message: 'feat: add stripe api key config' }),
      commit({ hash: 'ccc', message: 'fix: typo' }),
    ];
    expect(identifyCulprit(log)!.hash).toBe('bbb');
  });

  it('falls back to a commit with "secret" in the message when no add/init', () => {
    const log = [
      commit({ hash: 'aaa', message: 'refactor: cleanup old code' }),
      commit({ hash: 'bbb', message: 'chore: rotate secret keys' }),
    ];
    expect(identifyCulprit(log)!.hash).toBe('bbb');
  });

  it('falls back to "create" keyword', () => {
    const log = [
      commit({ hash: 'aaa', message: 'docs: update readme' }),
      commit({ hash: 'bbb', message: 'feat: create config module' }),
    ];
    expect(identifyCulprit(log)!.hash).toBe('bbb');
  });

  it('falls back to oldest commit when no heuristic matches', () => {
    const log = [
      commit({ hash: 'newest', message: 'fix: minor change' }),
      commit({ hash: 'middle', message: 'refactor: cleanup' }),
      commit({ hash: 'oldest', message: 'chore: update deps' }),
    ];
    expect(identifyCulprit(log)!.hash).toBe('oldest');
  });

  it('returns the single commit for a one-entry log', () => {
    const log = [commit({ hash: 'only', message: 'fix: update config' })];
    expect(identifyCulprit(log)!.hash).toBe('only');
  });

  it('matches "init" keyword (case-insensitive)', () => {
    const log = [
      commit({ hash: 'aaa', message: 'docs: update' }),
      commit({ hash: 'bbb', message: 'Initial commit' }),
    ];
    expect(identifyCulprit(log)!.hash).toBe('bbb');
  });
});

// ── extractCandidateImports ───────────────────────────────────────────────────

describe('extractCandidateImports', () => {
  it('returns imports that resolve into candidate directories', () => {
    mockReadFileSync.mockReturnValue(
      `import { stripe } from '../../lib/stripe';
import { db } from '../utils/database';
import React from 'react';
import { foo } from '../../components/Foo';`,
    );
    // Simulate existsSync: only lib/stripe.ts and utils/database.ts exist
    mockExistsSync.mockImplementation((p) => {
      const path = p as string;
      return path.endsWith('lib/stripe.ts') || path.endsWith('utils/database.ts');
    });

    const results = extractCandidateImports('/project/src/pages/index.tsx', '/project');

    // Should include lib/stripe.ts and utils/database.ts
    expect(results.some((r) => r.endsWith('lib/stripe.ts'))).toBe(true);
    expect(results.some((r) => r.endsWith('utils/database.ts'))).toBe(true);
    // Should NOT include react (not relative) or components/Foo (not candidate dir)
    expect(results.some((r) => r.includes('react'))).toBe(false);
    expect(results.some((r) => r.includes('components'))).toBe(false);
  });

  it('returns empty array when the file cannot be read', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(extractCandidateImports('/missing.ts', '/project')).toEqual([]);
  });

  it('returns empty array when there are no relative imports', () => {
    mockReadFileSync.mockReturnValue(`import React from 'react';\nimport chalk from 'chalk';`);
    expect(extractCandidateImports('/project/src/pages/index.tsx', '/project')).toEqual([]);
  });

  it('returns empty array when relative imports do not resolve to candidate dirs', () => {
    mockReadFileSync.mockReturnValue(`import Foo from '../components/Foo';`);
    mockExistsSync.mockReturnValue(false);
    expect(extractCandidateImports('/project/src/pages/index.tsx', '/project')).toEqual([]);
  });

  it('does not include non-existent files even if they match candidate dirs', () => {
    mockReadFileSync.mockReturnValue(`import { x } from '../../lib/missing';`);
    // existsSync always returns false
    mockExistsSync.mockReturnValue(false);
    expect(extractCandidateImports('/project/src/pages/index.tsx', '/project')).toEqual([]);
  });
});
