import { readFileSync } from 'fs';
import { join } from 'path';
import { PATTERNS } from './patterns.js';
import { resolveEnvVars } from './config.js';
import { Finding, SnytchConfig } from './types.js';

/**
 * Candidate filenames for compiled edge middleware, in priority order.
 */
const MIDDLEWARE_FILENAMES = ['middleware.js', 'middleware.ts'];

/**
 * Read the first middleware file found under nextDir/server/.
 *
 * @param nextDir - Absolute path to the .next directory.
 * @returns Tuple of [filePath, content] if found, or null if none exists.
 */
function readMiddlewareFile(nextDir: string): [string, string] | null {
  const serverDir = join(nextDir, 'server');
  for (const name of MIDDLEWARE_FILENAMES) {
    const filePath = join(serverDir, name);
    try {
      const content = readFileSync(filePath, 'utf-8');
      return [filePath, content];
    } catch {
      // File does not exist or is unreadable; try next
    }
  }
  return null;
}

/**
 * Scan compiled edge middleware for secrets.
 *
 * Next.js compiles edge middleware to `.next/server/middleware.js`. Secrets
 * accessed in middleware are not client-side JS but are still a security risk:
 * middleware runs at the edge and any compromise of that environment exposes them.
 *
 * Two passes are run against the middleware file content:
 * 1. Pattern matching — content matched against the 170+ regex pattern library.
 * 2. Value matching — literal values of `serverOnly` vars searched in the content.
 *
 * @param nextDir - Absolute path to the .next directory.
 * @param projectRoot - Absolute path to the project root (used to resolve serverOnly vars).
 * @param config - Snytch configuration (used for serverOnly list).
 * @returns Array of findings with type `'middleware-secret'`.
 */
export function scanMiddleware(nextDir: string, projectRoot: string, config: SnytchConfig): Finding[] {
  const findings: Finding[] = [];

  const middlewareFile = readMiddlewareFile(nextDir);
  if (middlewareFile === null) return findings;

  const [filePath, content] = middlewareFile;
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
          type: 'middleware-secret',
          patternName: patternDef.name,
          severity: patternDef.severity,
          description: `${patternDef.description} (in edge middleware)`,
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
            type: 'middleware-secret',
            patternName: `Value match: ${envVar.name}`,
            severity: 'critical',
            description: `Literal value of ${envVar.name} (from ${envVar.source}) found in edge middleware`,
            filePath,
            charOffset: idx,
            truncatedValue,
          });
        }

        searchIdx = idx + envVar.value.length;
      }
    }
  }

  return findings;
}
