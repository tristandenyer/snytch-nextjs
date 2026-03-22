import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PATTERNS } from './patterns.js';
import { resolveEnvVars } from './config.js';
import { Finding, SnytchConfig } from './types.js';

/**
 * Recursively find all `.js.map` files under a directory.
 *
 * @param dir - Directory to search.
 * @returns Array of absolute file paths.
 */
function findMapFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findMapFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.js.map')) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory does not exist or is not readable; return empty
  }
  return files;
}

/**
 * Parse a source map file and extract a single concatenated string of all
 * `sourcesContent` entries.
 *
 * @param filePath - Absolute path to the `.js.map` file.
 * @returns The concatenated source content string, or null if the file cannot
 *   be parsed or has no `sourcesContent` array.
 */
function extractSourcesContent(filePath: string): string | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed JSON — skip silently
    return null;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('sourcesContent' in parsed)
  ) {
    return null;
  }

  const { sourcesContent } = parsed as { sourcesContent: unknown };
  if (!Array.isArray(sourcesContent) || sourcesContent.length === 0) {
    return null;
  }

  // Concatenate all source entries, filtering out non-strings
  const content = sourcesContent
    .filter((entry): entry is string => typeof entry === 'string')
    .join('\n');

  return content.length > 0 ? content : null;
}

/**
 * Scan Next.js source map files for secrets embedded in pre-minification source code.
 *
 * Source maps at `.next/static/chunks/*.js.map` contain a `sourcesContent` array
 * with the original source for each module. If a secret was present in source code
 * at build time it will appear here even if tree-shaking removed it from the live
 * bundle. Findings are returned with type `'sourcemap-secret'` and severity
 * `'warning'` — the value may not be reachable in the live bundle.
 *
 * Note: deduplication against live bundle findings must be performed by the caller
 * after both passes complete. This function only returns raw source map findings.
 *
 * @param nextDir - Absolute path to the `.next` directory.
 * @param projectRoot - Absolute path to the project root (used to resolve serverOnly vars).
 * @param config - Snytch configuration (used for serverOnly list).
 * @returns Array of findings with type `'sourcemap-secret'`.
 */
export function scanSourceMaps(nextDir: string, projectRoot: string, config: SnytchConfig): Finding[] {
  const findings: Finding[] = [];
  const chunksDir = join(nextDir, 'static', 'chunks');
  const mapFiles = findMapFiles(chunksDir);

  for (const filePath of mapFiles) {
    const content = extractSourcesContent(filePath);
    if (content === null) continue;

    const seenMatches = new Set<string>();

    // Pass 1: Pattern matching
    for (const patternDef of PATTERNS) {
      const regex = patternDef.pattern;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        const truncatedValue = match[0].substring(0, 8) + '•••';
        const matchKey = `${patternDef.name}|${truncatedValue}`;

        if (!seenMatches.has(matchKey)) {
          seenMatches.add(matchKey);
          findings.push({
            type: 'sourcemap-secret',
            patternName: patternDef.name,
            severity: 'warning',
            description: `${patternDef.description} (found in source map, may not be in live bundle)`,
            filePath,
            charOffset: match.index,
            truncatedValue,
          });
        }
      }
    }

    // Pass 2: Value matching against serverOnly vars
    if (config.serverOnly && config.serverOnly.length > 0) {
      const resolvedVars = resolveEnvVars(projectRoot, config.serverOnly);

      for (const envVar of resolvedVars) {
        let searchIdx = 0;

        while (true) {
          const idx = content.indexOf(envVar.value, searchIdx);
          if (idx === -1) break;

          const matchKey = `value-match|${envVar.name}`;
          if (!seenMatches.has(matchKey)) {
            seenMatches.add(matchKey);
            const truncatedValue = envVar.value.substring(0, 8) + '•••';
            findings.push({
              type: 'sourcemap-secret',
              patternName: `Value match: ${envVar.name}`,
              severity: 'warning',
              description: `Literal value of ${envVar.name} (from ${envVar.source}) found in source map, may not be in live bundle`,
              filePath,
              charOffset: idx,
              truncatedValue,
            });
          }

          searchIdx = idx + envVar.value.length;
        }
      }
    }
  }

  return findings;
}

/**
 * Remove source map findings whose `truncatedValue` already appears in the
 * provided set of live bundle findings.
 *
 * When the same secret is found in both the live bundle and a source map, the
 * live bundle finding is more actionable (and already critical). The source map
 * duplicate adds no signal and is dropped.
 *
 * @param sourcemapFindings - Raw findings from `scanSourceMaps`.
 * @param liveBundleFindings - Findings already collected from the live bundle passes.
 * @returns Filtered source map findings with live-bundle duplicates removed.
 */
export function deduplicateSourceMapFindings(
  sourcemapFindings: Finding[],
  liveBundleFindings: Finding[],
): Finding[] {
  // Build a set of truncated values that already appear in live bundle findings
  const liveValues = new Set<string>(liveBundleFindings.map((f) => f.truncatedValue));
  return sourcemapFindings.filter((f) => !liveValues.has(f.truncatedValue));
}
