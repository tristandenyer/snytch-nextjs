import { describe, it, expect, vi, beforeEach } from 'vitest';
import { diff } from '../commands/diff.js';
import { DiffOptions } from '../types.js';

// Mock the diff engine — unit-test the command wrapper only
vi.mock('../diff.js', () => ({
  diffEnvFiles: vi.fn(),
}));

import { diffEnvFiles } from '../diff.js';
const mockDiffEnvFiles = vi.mocked(diffEnvFiles);

beforeEach(() => {
  vi.resetAllMocks();
});

function makeOptions(overrides: Partial<DiffOptions> = {}): DiffOptions {
  return {
    envFiles: [
      { path: '/a/.env.staging', label: '.env.staging' },
      { path: '/b/.env.production', label: '.env.production' },
    ],
    projectRoot: '/project',
    json: false,
    report: false,
    strict: false,
    serverOnly: [],
    ...overrides,
  };
}

describe('diff command', () => {
  it('delegates to diffEnvFiles with the correct file descriptors', async () => {
    mockDiffEnvFiles.mockReturnValue({ inSync: ['FOO'], drift: [], onlyInOne: [] });

    await diff(makeOptions());

    expect(mockDiffEnvFiles).toHaveBeenCalledOnce();
    expect(mockDiffEnvFiles).toHaveBeenCalledWith([
      { path: '/a/.env.staging', label: '.env.staging' },
      { path: '/b/.env.production', label: '.env.production' },
    ]);
  });

  it('returns fileLabels matching the input order', async () => {
    mockDiffEnvFiles.mockReturnValue({ inSync: [], drift: [], onlyInOne: [] });

    const result = await diff(makeOptions());

    expect(result.fileLabels).toEqual(['.env.staging', '.env.production']);
  });

  it('includes inSync, drift, and onlyInOne from the engine', async () => {
    mockDiffEnvFiles.mockReturnValue({
      inSync: ['DATABASE_URL', 'NODE_ENV'],
      drift: [{ key: 'SENTRY_DSN', presentIn: ['.env.staging'], missingFrom: ['.env.production'] }],
      onlyInOne: [{ key: 'VERCEL_URL', file: '.env.production' }],
    });

    const result = await diff(makeOptions());

    expect(result.inSync).toEqual(['DATABASE_URL', 'NODE_ENV']);
    expect(result.drift).toHaveLength(1);
    expect(result.drift[0].key).toBe('SENTRY_DSN');
    expect(result.onlyInOne).toHaveLength(1);
    expect(result.onlyInOne[0].key).toBe('VERCEL_URL');
  });

  it('includes a non-negative durationMs', async () => {
    mockDiffEnvFiles.mockReturnValue({ inSync: [], drift: [], onlyInOne: [] });

    const result = await diff(makeOptions());

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('works with three or more files', async () => {
    mockDiffEnvFiles.mockReturnValue({ inSync: ['KEY'], drift: [], onlyInOne: [] });

    const options = makeOptions({
      envFiles: [
        { path: '/a/.env', label: '.env' },
        { path: '/b/.env.staging', label: '.env.staging' },
        { path: '/c/.env.production', label: '.env.production' },
      ],
    });

    const result = await diff(options);
    expect(result.fileLabels).toHaveLength(3);
  });
});
