import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PATTERNS } from '../patterns.js';
import { Finding, ScanResult, ScanOptions } from '../types.js';

function recursiveReadFiles(dir: string, extension: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...recursiveReadFiles(fullPath, extension));
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory does not exist or is not readable; skip silently
  }

  return files;
}

export async function scan(options: ScanOptions): Promise<ScanResult> {
  const startTime = Date.now();
  const findings: Finding[] = [];
  const seenMatches = new Map<string, Set<string>>();

  // Scan .js files in static/chunks
  const chunksDir = join(options.dir, 'static', 'chunks');
  const jsFiles = recursiveReadFiles(chunksDir, '.js');

  // Also scan .css files in static/css if directory exists
  const cssDir = join(options.dir, 'static', 'css');
  const cssFiles = recursiveReadFiles(cssDir, '.css');

  const allFiles = [...jsFiles, ...cssFiles];

  for (const filePath of allFiles) {
    try {
      const fileContent = readFileSync(filePath, 'utf-8');

      for (const patternDef of PATTERNS) {
        const regex = patternDef.pattern;
        let match;

        // eslint-disable-next-line no-cond-assign
        while ((match = regex.exec(fileContent)) !== null) {
          const truncatedValue = match[0].substring(0, 8) + '•••';
          const matchKey = `${patternDef.name}|${truncatedValue}|${filePath}`;

          // Deduplicate: skip if we've already found this pattern + value in this file
          if (!seenMatches.has(filePath)) {
            seenMatches.set(filePath, new Set());
          }

          const fileMatches = seenMatches.get(filePath)!;
          if (fileMatches.has(matchKey)) {
            continue;
          }
          fileMatches.add(matchKey);

          const finding: Finding = {
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
    } catch {
      // File read error; skip silently
    }
  }

  const durationMs = Date.now() - startTime;

  return {
    scannedFiles: allFiles.length,
    findings,
    durationMs,
  };
}
