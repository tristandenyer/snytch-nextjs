/**
 * Module graph reader for @snytch/nextjs.
 *
 * Parses the Next.js build trace file (.next/trace) to build a directed module
 * dependency graph, then provides a BFS walker to find all modules reachable
 * from a set of entry points.
 *
 * The .next/trace format is newline-delimited JSON. Each line is a trace event
 * object. Events relevant to module dependencies carry a `name` field containing
 * "module" and include a `tags` object with `importer` and `request` (or
 * `resolvedModule`) keys that describe a single import edge.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ── Internal types ─────────────────────────────────────────────────────────────

/** A raw trace event line from .next/trace (shape we care about). */
interface TraceEvent {
  name?: string;
  tags?: Record<string, string>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Attempt to parse a single line of the trace file as a JSON object.
 *
 * @param line - A single line from .next/trace.
 * @returns The parsed object, or null if the line is empty or malformed.
 */
function parseLine(line: string): TraceEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as TraceEvent;
  } catch {
    return null;
  }
}

/**
 * Extract the importer and the imported module path from a trace event's `tags`.
 *
 * Next.js trace events use several naming conventions across webpack/turbopack
 * versions. We handle:
 *
 * - `importer` + `request`          (webpack module resolve events)
 * - `importer` + `resolvedModule`   (turbopack / newer webpack)
 *
 * @param tags - The `tags` object from a trace event.
 * @returns A [from, to] tuple, or null if the event doesn't describe an edge.
 */
function extractEdge(tags: Record<string, string>): [string, string] | null {
  const from = tags['importer'];
  const to = tags['resolvedModule'] ?? tags['request'];
  if (typeof from === 'string' && typeof to === 'string' && from.length > 0 && to.length > 0) {
    return [from, to];
  }
  return null;
}

// ── Exported functions ─────────────────────────────────────────────────────────

/**
 * Parse the Next.js build trace file and return a directed adjacency list
 * representing the module dependency graph.
 *
 * The trace file lives at `.next/trace` and is written during every production
 * build (`next build`). Each line is a JSON trace event; this function
 * extracts module-dependency events and builds an in-memory graph.
 *
 * @param nextDir - Absolute path to the `.next` directory.
 * @returns Map from module path to array of imported module paths.
 *          Returns an empty map if the trace file is missing or unparseable.
 */
export function loadModuleGraph(nextDir: string): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const tracePath = join(nextDir, 'trace');

  let raw: string;
  try {
    raw = readFileSync(tracePath, 'utf8');
  } catch {
    // Trace file absent — not a production build, or trace was disabled.
    return graph;
  }

  for (const line of raw.split('\n')) {
    const event = parseLine(line);
    if (event === null) continue;

    // Only process events whose name suggests a module dependency.
    const name = event.name ?? '';
    if (!name.includes('module') && !name.includes('dependency') && !name.includes('resolve')) {
      continue;
    }

    const tags = event.tags;
    if (typeof tags !== 'object' || tags === null) continue;

    const edge = extractEdge(tags);
    if (edge === null) continue;

    const [from, to] = edge;
    const existing = graph.get(from);
    if (existing === undefined) {
      graph.set(from, [to]);
    } else if (!existing.includes(to)) {
      existing.push(to);
    }

    // Ensure the destination node exists in the graph (as a leaf if needed).
    if (!graph.has(to)) {
      graph.set(to, []);
    }
  }

  return graph;
}

/**
 * Walk the module graph from a set of entry points and return all reachable
 * module paths. Uses iterative BFS to handle cycles safely.
 *
 * @param graph - Adjacency list from {@link loadModuleGraph}.
 * @param entryPoints - Set of starting module paths.
 * @returns Set of all reachable module paths, including the entry points themselves.
 */
export function reachableModules(
  graph: Map<string, string[]>,
  entryPoints: Set<string>,
): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [...entryPoints];

  while (queue.length > 0) {
    const current = queue.pop();
    // pop() on an empty array returns undefined, but the while guard ensures queue.length > 0
    if (current === undefined) break;

    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors = graph.get(current);
    if (neighbors !== undefined) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
  }

  return visited;
}
