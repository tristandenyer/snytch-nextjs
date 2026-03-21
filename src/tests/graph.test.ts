import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadModuleGraph, reachableModules } from '../graph.js';

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

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Serialize an array of trace event objects into newline-delimited JSON,
 * the format written by Next.js to .next/trace.
 */
function makeTrace(events: Record<string, unknown>[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n');
}

/** Simulate .next/trace not existing. */
function noTraceFile(): void {
  mockReadFileSync.mockImplementation(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
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

// ── loadModuleGraph ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadModuleGraph', () => {
  describe('missing trace file', () => {
    it('returns an empty map when .next/trace does not exist', () => {
      noTraceFile();
      const graph = loadModuleGraph('/project/.next');
      expect(graph.size).toBe(0);
    });
  });

  describe('empty trace file', () => {
    it('returns an empty map for an empty trace file', () => {
      setTrace('');
      const graph = loadModuleGraph('/project/.next');
      expect(graph.size).toBe(0);
    });
  });

  describe('malformed trace lines', () => {
    it('skips non-JSON lines and does not throw', () => {
      setTrace('not json\n{ also not json |\n');
      expect(() => loadModuleGraph('/project/.next')).not.toThrow();
      const graph = loadModuleGraph('/project/.next');
      expect(graph.size).toBe(0);
    });

    it('skips lines that are valid JSON but not objects', () => {
      setTrace('"a string"\n42\n[1,2,3]\nnull');
      const graph = loadModuleGraph('/project/.next');
      expect(graph.size).toBe(0);
    });
  });

  describe('events without module dependency fields', () => {
    it('ignores trace events whose name does not relate to modules', () => {
      const trace = makeTrace([
        { name: 'webpack-compilation', tags: { importer: '/a.ts', request: '/b.ts' } },
        { name: 'next-server-request', tags: { importer: '/c.ts', request: '/d.ts' } },
      ]);
      setTrace(trace);
      const graph = loadModuleGraph('/project/.next');
      expect(graph.size).toBe(0);
    });

    it('ignores events with no tags field', () => {
      const trace = makeTrace([
        { name: 'resolve-module', duration: 5 },
      ]);
      setTrace(trace);
      const graph = loadModuleGraph('/project/.next');
      expect(graph.size).toBe(0);
    });

    it('ignores events with tags that lack importer or request', () => {
      const trace = makeTrace([
        { name: 'module-resolve', tags: { importer: '/a.ts' } },
        { name: 'module-resolve', tags: { request: '/b.ts' } },
      ]);
      setTrace(trace);
      const graph = loadModuleGraph('/project/.next');
      expect(graph.size).toBe(0);
    });
  });

  describe('valid module dependency events', () => {
    it('builds a correct adjacency list from importer + request edges', () => {
      const trace = makeTrace([
        { name: 'resolve-module', tags: { importer: '/app/page.tsx', request: '/lib/utils.ts' } },
        { name: 'resolve-module', tags: { importer: '/lib/utils.ts', request: '/lib/secrets.ts' } },
      ]);
      setTrace(trace);
      const graph = loadModuleGraph('/project/.next');

      expect(graph.get('/app/page.tsx')).toEqual(['/lib/utils.ts']);
      expect(graph.get('/lib/utils.ts')).toEqual(['/lib/secrets.ts']);
      expect(graph.has('/lib/secrets.ts')).toBe(true);
    });

    it('handles resolvedModule tag in addition to request', () => {
      const trace = makeTrace([
        {
          name: 'resolve-module',
          tags: { importer: '/app/page.tsx', resolvedModule: '/lib/api.ts' },
        },
      ]);
      setTrace(trace);
      const graph = loadModuleGraph('/project/.next');
      expect(graph.get('/app/page.tsx')).toEqual(['/lib/api.ts']);
    });

    it('prefers resolvedModule over request when both are present', () => {
      const trace = makeTrace([
        {
          name: 'resolve-module',
          tags: { importer: '/app/page.tsx', resolvedModule: '/lib/api.ts', request: './api' },
        },
      ]);
      setTrace(trace);
      const graph = loadModuleGraph('/project/.next');
      // resolvedModule takes precedence
      expect(graph.get('/app/page.tsx')).toContain('/lib/api.ts');
    });

    it('deduplicates edges: same importer+request pair appears once', () => {
      const trace = makeTrace([
        { name: 'resolve-module', tags: { importer: '/app/page.tsx', request: '/lib/utils.ts' } },
        { name: 'resolve-module', tags: { importer: '/app/page.tsx', request: '/lib/utils.ts' } },
      ]);
      setTrace(trace);
      const graph = loadModuleGraph('/project/.next');
      expect(graph.get('/app/page.tsx')).toEqual(['/lib/utils.ts']);
    });

    it('allows a module to have multiple outbound edges', () => {
      const trace = makeTrace([
        { name: 'resolve-module', tags: { importer: '/app/page.tsx', request: '/lib/a.ts' } },
        { name: 'resolve-module', tags: { importer: '/app/page.tsx', request: '/lib/b.ts' } },
      ]);
      setTrace(trace);
      const graph = loadModuleGraph('/project/.next');
      const edges = graph.get('/app/page.tsx') ?? [];
      expect(edges).toContain('/lib/a.ts');
      expect(edges).toContain('/lib/b.ts');
      expect(edges).toHaveLength(2);
    });
  });
});

// ── reachableModules ──────────────────────────────────────────────────────────

describe('reachableModules', () => {
  it('returns only the entry point when it has no outbound edges', () => {
    const graph = new Map([['a', []]]);
    const result = reachableModules(graph, new Set(['a']));
    expect(result).toEqual(new Set(['a']));
  });

  it('traverses a simple 3-node chain: a → b → c', () => {
    const graph = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', []],
    ]);
    const result = reachableModules(graph, new Set(['a']));
    expect(result).toEqual(new Set(['a', 'b', 'c']));
  });

  it('handles a cycle without infinite looping', () => {
    const graph = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a']], // cycle back to a
    ]);
    const result = reachableModules(graph, new Set(['a']));
    expect(result).toEqual(new Set(['a', 'b', 'c']));
  });

  it('handles a self-loop', () => {
    const graph = new Map([['a', ['a']]]);
    const result = reachableModules(graph, new Set(['a']));
    expect(result).toEqual(new Set(['a']));
  });

  it('returns an empty set when entry points are empty', () => {
    const graph = new Map([['a', ['b']]]);
    const result = reachableModules(graph, new Set());
    expect(result.size).toBe(0);
  });

  it('handles multiple entry points', () => {
    const graph = new Map([
      ['entry1', ['lib/a.ts']],
      ['entry2', ['lib/b.ts']],
      ['lib/a.ts', []],
      ['lib/b.ts', []],
    ]);
    const result = reachableModules(graph, new Set(['entry1', 'entry2']));
    expect(result).toEqual(new Set(['entry1', 'entry2', 'lib/a.ts', 'lib/b.ts']));
  });

  it('returns entry point even when it is absent from the graph', () => {
    const graph = new Map<string, string[]>();
    const result = reachableModules(graph, new Set(['unknown-entry']));
    expect(result).toEqual(new Set(['unknown-entry']));
  });

  it('does not traverse into unreachable nodes', () => {
    const graph = new Map([
      ['entry', ['reachable']],
      ['reachable', []],
      ['unreachable', ['other']],
    ]);
    const result = reachableModules(graph, new Set(['entry']));
    expect(result.has('unreachable')).toBe(false);
    expect(result.has('other')).toBe(false);
  });
});
