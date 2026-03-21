import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PATTERNS } from './patterns.js';
import { resolveEnvVars } from './config.js';
import { Finding, SnytchConfig } from './types.js';

/**
 * Recursively find all .html files under a directory.
 *
 * @param dir - Directory to scan.
 * @returns Array of absolute file paths.
 */
function findHtmlFiles(dir: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...findHtmlFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory does not exist or is not readable; skip silently
  }

  return files;
}

/**
 * Extract the JSON object from a __NEXT_DATA__ script tag.
 *
 * @param content - HTML file content.
 * @returns Parsed JSON object, or null if no __NEXT_DATA__ tag found or JSON is malformed.
 */
function extractNextDataJson(content: string): unknown {
  // Match <script id="__NEXT_DATA__" type="application/json">...JSON...</script>
  const match = content.match(
    /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([^<]+)<\/script>/,
  );

  if (!match || !match[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    // Malformed JSON; return null without throwing
    return null;
  }
}

/**
 * Scan .next/server/pages for HTML files containing __NEXT_DATA__ blocks
 * with embedded secrets from getStaticProps or getServerSideProps.
 *
 * For each HTML file:
 * 1. Extract the __NEXT_DATA__ JSON block.
 * 2. Flatten it to a single string (JSON.stringify).
 * 3. Run pattern matching against the flattened string.
 * 4. Run value matching against serverOnly config variables.
 *
 * @param nextDir - Path to .next directory.
 * @param projectRoot - Project root directory.
 * @param config - Snytch configuration with optional serverOnly array.
 * @returns Array of findings with type 'next-data'.
 */
export function scanNextData(
  nextDir: string,
  projectRoot: string,
  config: SnytchConfig,
): Finding[] {
  const findings: Finding[] = [];
  const seenMatches = new Map<string, Set<string>>();

  // Find all .html files in .next/server/pages
  const pagesDir = join(nextDir, 'server', 'pages');
  const htmlFiles = findHtmlFiles(pagesDir);

  for (const filePath of htmlFiles) {
    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      const jsonData = extractNextDataJson(fileContent);

      if (jsonData === null) {
        // No __NEXT_DATA__ or malformed JSON
        continue;
      }

      // Flatten the JSON to a single string for pattern matching
      const flattenedJson = JSON.stringify(jsonData);

      // Pass 1: Pattern matching
      for (const patternDef of PATTERNS) {
        const regex = patternDef.pattern;
        let match;

        while ((match = regex.exec(flattenedJson)) !== null) {
          const truncatedValue = match[0].substring(0, 8) + '•••';
          const matchKey = `${patternDef.name}|${truncatedValue}|${filePath}`;

          if (!seenMatches.has(filePath)) {
            seenMatches.set(filePath, new Set());
          }

          const fileMatches = seenMatches.get(filePath)!;
          if (fileMatches.has(matchKey)) {
            continue;
          }
          fileMatches.add(matchKey);

          const finding: Finding = {
            type: 'next-data',
            patternName: patternDef.name,
            severity: patternDef.severity,
            description: patternDef.description,
            filePath,
            charOffset: match.index,
            truncatedValue,
          };

          findings.push(finding);
        }
      }

      // Pass 2: Value matching against serverOnly vars
      if (config?.serverOnly && config.serverOnly.length > 0) {
        const resolvedVars = resolveEnvVars(projectRoot, config.serverOnly);

        for (const envVar of resolvedVars) {
          const truncatedValue = envVar.value.substring(0, 8) + '•••';
          let searchIdx = 0;

          while (true) {
            const idx = flattenedJson.indexOf(envVar.value, searchIdx);
            if (idx === -1) break;

            const matchKey = `value-match|${envVar.name}|${filePath}`;
            if (!seenMatches.has(filePath)) {
              seenMatches.set(filePath, new Set());
            }
            const fileMatches = seenMatches.get(filePath)!;

            // Only record the first occurrence per var per file
            if (!fileMatches.has(matchKey)) {
              fileMatches.add(matchKey);
              findings.push({
                type: 'next-data',
                patternName: `Value match: ${envVar.name}`,
                severity: 'critical',
                description: `Literal value of ${envVar.name} (from ${envVar.source}) found in __NEXT_DATA__`,
                filePath,
                charOffset: idx,
                truncatedValue,
              });
            }

            searchIdx = idx + envVar.value.length;
          }
        }
      }
    } catch {
      // File read error; skip silently
    }
  }

  return findings;
}
