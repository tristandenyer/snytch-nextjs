/**
 * Module graph analysis scanner for @snytch/nextjs.
 *
 * Uses the module dependency graph built from `.next/trace` to identify
 * server-only modules that are reachable from client entry points. Reports
 * findings of type `graph-leak` with the full import chain as context.
 *
 * This complements the bundle scanner: instead of asking "is this value in
 * the compiled output?", it asks "could this module reach the client?". The
 * result is structural — a warning about the import chain, not a leaked value.
 */

import { readdirSync } from 'fs';
import { join, relative } from 'path';
import { loadModuleGraph, reachableModules } from './graph.js';
import type { Finding, SnytchConfig } from './types.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Return true if the file path looks like a client entry point.
 *
 * Next.js client entries are pages in `.next/server/pages/` or
 * `.next/server/app/`, or any path that includes `/pages/` or `/app/` in the
 * original source. The heuristic is intentionally broad to avoid false
 * negatives; the serverOnly check provides the signal that makes a match actionable.
 *
 * @param filePath - Absolute or relative module path.
 * @returns True if the path looks like a client entry.
 */
function isClientEntry(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    normalized.includes('/pages/') ||
    normalized.includes('/app/') ||
    normalized.includes('.next/server/pages/') ||
    normalized.includes('.next/server/app/')
  );
}

/**
 * Return true if the module path looks like it accesses server-only code,
 * based on the `serverOnly` config list.
 *
 * The match is a substring check on the module path — if any `serverOnly`
 * variable name appears as a path segment or file stem, we flag it.
 *
 * @param modulePath - The module path to test.
 * @param serverOnlyNames - Variable names from `snytch.config.json` `serverOnly`.
 * @returns True if the module looks server-only.
 */
function isServerOnlyModule(modulePath: string, serverOnlyNames: string[]): boolean {
  if (serverOnlyNames.length === 0) return false;
  const lower = modulePath.toLowerCase();
  return serverOnlyNames.some((name) => lower.includes(name.toLowerCase()));
}

/**
 * Walk the graph backwards from `target` to any node in `entries`, collecting
 * one sample path. Returns a human-readable chain string, or null if no path
 * exists. Performs BFS on the reversed graph.
 *
 * @param graph - Forward adjacency list.
 * @param entries - Set of entry point paths.
 * @param target - The server-only module to trace back to.
 * @returns An import chain string like `page.tsx → utils.ts → secrets.ts`, or null.
 */
function findImportChain(
  graph: Map<string, string[]>,
  entries: Set<string>,
  target: string,
): string | null {
  // Build reverse graph so we can walk from target back to an entry.
  const reverse = new Map<string, string[]>();
  for (const [from, tos] of graph) {
    for (const to of tos) {
      const existing = reverse.get(to);
      if (existing === undefined) {
        reverse.set(to, [from]);
      } else {
        existing.push(from);
      }
    }
  }

  // BFS from target to find a path to any entry point.
  const queue: string[][] = [[target]];
  const visitedInSearch = new Set<string>([target]);

  while (queue.length > 0) {
    const path = queue.shift();
    if (path === undefined) break;

    const current = path[path.length - 1];
    if (entries.has(current)) {
      // Found a path — reverse it so it reads entry → ... → target.
      return [...path].reverse().join(' → ');
    }

    const parents = reverse.get(current) ?? [];
    for (const parent of parents) {
      if (!visitedInSearch.has(parent)) {
        visitedInSearch.add(parent);
        queue.push([...path, parent]);
      }
    }
  }

  return null;
}

/**
 * Collect all `.next/server/pages` and `.next/server/app` HTML/JS entry paths
 * from the filesystem. Falls back gracefully if neither directory exists.
 *
 * @param nextDir - Absolute path to the `.next` directory.
 * @returns Array of absolute file paths that serve as client entry points.
 */
function discoverClientEntries(nextDir: string): string[] {
  const entries: string[] = [];
  const dirs = [join(nextDir, 'server', 'pages'), join(nextDir, 'server', 'app')];

  for (const dir of dirs) {
    try {
      const files = readdirSync(dir, { recursive: true, withFileTypes: true });
      for (const f of files) {
        if (
          f.isFile() &&
          (f.name.endsWith('.js') || f.name.endsWith('.html'))
        ) {
          // Construct absolute path from dirent parent + name
          const parentPath = typeof f.parentPath === 'string' ? f.parentPath : dir;
          entries.push(join(parentPath, f.name));
        }
      }
    } catch {
      // Directory absent — skip silently.
    }
  }

  return entries;
}

// ── Exported function ──────────────────────────────────────────────────────────

/**
 * Scan the module graph for server-only modules reachable from client entry points.
 *
 * Loads the build trace from `.next/trace`, identifies client entry points from
 * `.next/server/pages` and `.next/server/app`, walks the import graph, and flags
 * any reachable module whose path matches a `serverOnly` variable name.
 *
 * Returns an empty array when:
 * - The trace file is absent (no production build, or trace was disabled).
 * - `config.serverOnly` is empty or undefined.
 * - No client entries are found.
 *
 * @param nextDir - Absolute path to the `.next` directory.
 * @param projectRoot - Absolute project root (used for relative path display).
 * @param config - Snytch config containing `serverOnly` variable names.
 * @returns Array of findings with `type: 'graph-leak'`.
 */
export function scanModuleGraph(
  nextDir: string,
  projectRoot: string,
  config: SnytchConfig,
): Finding[] {
  const serverOnlyNames = config.serverOnly ?? [];
  if (serverOnlyNames.length === 0) return [];

  const graph = loadModuleGraph(nextDir);
  if (graph.size === 0) return [];

  const clientEntryPaths = discoverClientEntries(nextDir);

  // Also include any node in the graph whose path looks like a client entry.
  const graphEntries = [...graph.keys()].filter(isClientEntry);
  const allEntries = new Set<string>([...clientEntryPaths, ...graphEntries]);

  if (allEntries.size === 0) return [];

  const reachable = reachableModules(graph, allEntries);
  const findings: Finding[] = [];
  const reportedModules = new Set<string>();

  for (const modulePath of reachable) {
    // Skip entry points themselves.
    if (allEntries.has(modulePath)) continue;
    // Skip already-reported modules (one finding per server-only module).
    if (reportedModules.has(modulePath)) continue;

    if (isServerOnlyModule(modulePath, serverOnlyNames)) {
      reportedModules.add(modulePath);

      const chain = findImportChain(graph, allEntries, modulePath);
      const chainDisplay = chain ?? `(entry) → ${relative(projectRoot, modulePath) || modulePath}`;

      const matchedName = serverOnlyNames.find((n) =>
        modulePath.toLowerCase().includes(n.toLowerCase()),
      ) ?? 'serverOnly';

      findings.push({
        type: 'graph-leak',
        patternName: `Import chain: ${matchedName}`,
        severity: 'warning',
        description: chainDisplay,
        filePath: modulePath,
        charOffset: 0,
        truncatedValue: '(no value)',
      });
    }
  }

  return findings;
}
