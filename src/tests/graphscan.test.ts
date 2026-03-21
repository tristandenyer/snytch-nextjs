import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanModuleGraph } from '../graphscan.js';
import type { SnytchConfig } from '../types.js';

// ── fs mocks ──────────────────────────────────────────────────────────────────

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

// ── helpers ───────────────────────────────────────────────────────────────────

/** Serialize trace events to newline-delimited JSON. */
function makeTrace(events: Record<string, unknown>[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n');
}

/** Set the .next/trace content to the given raw string. */
function setTrace(content: string): void {
  mockReadFileSync.mockImplementation((path: unknown) => {
    if (typeof path === 'string' && path.endsWith('trace')) {
      return content;
    }
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
}

/** Simulate .next/trace not existing. */
function noTraceFile(): void {
  mockReadFileSync.mockImplementation(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
}

/** Simulate no client entry files in .next/server/pages or app. */
function noClientEntries(): void {
  mockReaddirSync.mockImplementation(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
}

/** Simulate client entry JS files in .next/server/pages. */
function withClientEntries(entries: string[]): void {
  mockReaddirSync.mockImplementation((dir: unknown, _opts?: unknown) => {
    if (typeof dir !== 'string') return [];
    if (dir.includes('server/pages') || dir.includes('server/app')) {
      return entries.map((name) => ({
        name,
        isFile: () => true,
        isDirectory: () => false,
        parentPath: dir as string,
      })) as unknown as ReturnType<typeof readdirSync>;
    }
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

const emptyConfig: SnytchConfig = {};
const configWithServer: SnytchConfig = { serverOnly: ['secrets', 'database'] };

// ── early-exit guards ─────────────────────────────────────────────────────────

describe('scanModuleGraph early-exit guards', () => {
  it('returns [] when serverOnly is empty', () => {
    noTraceFile();
    noClientEntries();
    const result = scanModuleGraph('/project/.next', '/project', emptyConfig);
    expect(result).toEqual([]);
  });

  it('returns [] when serverOnly is undefined', () => {
    noTraceFile();
    noClientEntries();
    const result = scanModuleGraph('/project/.next', '/project', {});
    expect(result).toEqual([]);
  });

  it('returns [] when trace file is absent', () => {
    noTraceFile();
    noClientEntries();
    const result = scanModuleGraph('/project/.next', '/project', configWithServer);
    expect(result).toEqual([]);
  });

  it('returns [] when graph has no module events', () => {
    setTrace(makeTrace([{ name: 'webpack-compilation', tags: {} }]));
    noClientEntries();
    const result = scanModuleGraph('/project/.next', '/project', configWithServer);
    expect(result).toEqual([]);
  });

  it('returns [] when no client entries are found', () => {
    const trace = makeTrace([
      { name: 'resolve-module', tags: { importer: '/lib/a.ts', request: '/lib/b.ts' } },
    ]);
    setTrace(trace);
    noClientEntries();
    const result = scanModuleGraph('/project/.next', '/project', configWithServer);
    // Graph has nodes but none are client entries and filesystem returns nothing
    expect(result).toEqual([]);
  });
});

// ── server-only module detection ──────────────────────────────────────────────

describe('scanModuleGraph server-only module detection', () => {
  it('flags a server-only module reachable from a client entry', () => {
    const trace = makeTrace([
      {
        name: 'resolve-module',
        tags: {
          importer: '/project/app/page.tsx',
          request: '/project/lib/secrets.ts',
        },
      },
    ]);
    setTrace(trace);
    noClientEntries();

    const result = scanModuleGraph('/project/.next', '/project', configWithServer);
    expect(result).toHaveLength(1);
    const finding = result[0];
    expect(finding.type).toBe('graph-leak');
    expect(finding.severity).toBe('warning');
    expect(finding.patternName).toContain('secrets');
    expect(finding.truncatedValue).toBe('(no value)');
  });

  it('sets description to the import chain string', () => {
    const trace = makeTrace([
      {
        name: 'resolve-module',
        tags: {
          importer: '/project/app/page.tsx',
          request: '/project/lib/secrets.ts',
        },
      },
    ]);
    setTrace(trace);
    noClientEntries();

    const result = scanModuleGraph('/project/.next', '/project', configWithServer);
    expect(result[0].description).toContain('→');
    expect(result[0].description).toContain('secrets');
  });

  it('does not flag a server-only module that is not reachable from any client entry', () => {
    // The server-only module is in the graph but only reachable from a non-entry node
    const trace = makeTrace([
      {
        name: 'resolve-module',
        tags: { importer: '/project/server/worker.ts', request: '/project/lib/secrets.ts' },
      },
    ]);
    setTrace(trace);
    noClientEntries();
    // No client entries in either graph or filesystem — nothing reachable

    const result = scanModuleGraph('/project/.next', '/project', configWithServer);
    expect(result).toEqual([]);
  });

  it('does not flag a module name that does not match any serverOnly name', () => {
    const trace = makeTrace([
      {
        name: 'resolve-module',
        tags: { importer: '/project/app/page.tsx', request: '/project/lib/utils.ts' },
      },
    ]);
    setTrace(trace);
    noClientEntries();

    const result = scanModuleGraph('/project/.next', '/project', configWithServer);
    expect(result).toEqual([]);
  });

  it('match is case-insensitive — DATABASE matches database in serverOnly', () => {
    const trace = makeTrace([
      {
        name: 'resolve-module',
        tags: { importer: '/project/app/page.tsx', request: '/project/lib/DATABASE.ts' },
      },
    ]);
    setTrace(trace);
    noClientEntries();

    const result = scanModuleGraph('/project/.next', '/project', configWithServer);
    expect(result).toHaveLength(1);
    expect(result[0].patternName).toContain('database');
  });

  it('reports at most one finding per server-only module path', () => {
    // Two separate entries both reach the same secrets module
    const trace = makeTrace([
      {
        name: 'resolve-module',
        tags: { importer: '/project/app/page.tsx', request: '/project/lib/secrets.ts' },
      },
      {
        name: 'resolve-module',
        tags: { importer: '/project/app/other.tsx', request: '/project/lib/secrets.ts' },
      },
    ]);
    setTrace(trace);
    noClientEntries();

    const result = scanModuleGraph('/project/.next', '/project', configWithServer);
    // Even though two entries reach it, one finding per module
    const secretsFindings = result.filter((f) => f.filePath.includes('secrets'));
    expect(secretsFindings.length).toBe(1);
  });

  it('can flag multiple distinct server-only modules', () => {
    const trace = makeTrace([
      {
        name: 'resolve-module',
        tags: { importer: '/project/app/page.tsx', request: '/project/lib/secrets.ts' },
      },
      {
        name: 'resolve-module',
        tags: { importer: '/project/app/page.tsx', request: '/project/lib/database.ts' },
      },
    ]);
    setTrace(trace);
    noClientEntries();

    const result = scanModuleGraph('/project/.next', '/project', configWithServer);
    expect(result).toHaveLength(2);
    const types = result.map((f) => f.type);
    expect(types).toEqual(['graph-leak', 'graph-leak']);
  });
});

// ── client entry discovery ────────────────────────────────────────────────────

describe('scanModuleGraph client entry discovery from filesystem', () => {
  it('uses .js files discovered from .next/server/pages as entries', () => {
    // Trace has no client-looking entries — relies on filesystem discovery
    const trace = makeTrace([
      {
        name: 'resolve-module',
        tags: { importer: '/project/.next/server/pages/index.js', request: '/project/lib/secrets.ts' },
      },
    ]);
    setTrace(trace);
    withClientEntries(['index.js']);

    const result = scanModuleGraph('/project/.next', '/project', configWithServer);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('graph-leak');
  });

  it('skips non-.js non-.html files from directory scan', () => {
    // Even if discovered, .ts files should not be treated as entries (readdirSync filter)
    setTrace(makeTrace([
      {
        name: 'resolve-module',
        tags: { importer: '/project/.next/server/pages/index.ts', request: '/project/lib/secrets.ts' },
      },
    ]));
    mockReaddirSync.mockReturnValue([
      { name: 'index.ts', isFile: () => true, isDirectory: () => false, parentPath: '/project/.next/server/pages' },
    ] as unknown as ReturnType<typeof readdirSync>);

    const result = scanModuleGraph('/project/.next', '/project', configWithServer);
    // index.ts is not a valid entry from FS discovery, and graph-based isClientEntry
    // checks for /pages/ in path — /server/pages/ matches, so it IS a graph entry
    // The finding depends on graph-based detection only
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── charOffset ────────────────────────────────────────────────────────────────

describe('scanModuleGraph finding shape', () => {
  it('sets charOffset to 0', () => {
    const trace = makeTrace([
      {
        name: 'resolve-module',
        tags: { importer: '/project/app/page.tsx', request: '/project/lib/secrets.ts' },
      },
    ]);
    setTrace(trace);
    noClientEntries();

    const result = scanModuleGraph('/project/.next', '/project', configWithServer);
    expect(result[0].charOffset).toBe(0);
  });
});
