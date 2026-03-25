import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PATTERNS } from '../patterns.js';
import { loadConfig, resolveEnvVars } from '../config.js';
import { resolveGitContext } from '../gitlog.js';
import { generateRcaForFindings } from '../rca.js';
import { scanNextData } from '../nextdata.js';
import { scanNextConfig } from '../configscan.js';
import { scanMiddleware } from '../middlewarescan.js';
import { scanSourceMaps, deduplicateSourceMapFindings } from '../sourcemapscan.js';
import { applySuppressions } from '../suppress.js';
import { scanModuleGraph } from '../graphscan.js';
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
            type: 'pattern-match',
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

  // Pass 2: value matching against serverOnly vars from snytch.config.js
  const config = await loadConfig(options.projectRoot);
  if (config?.serverOnly && config.serverOnly.length > 0) {
    const resolvedVars = resolveEnvVars(options.projectRoot, config.serverOnly);

    for (const envVar of resolvedVars) {
      const truncatedValue = envVar.value.substring(0, 8) + '•••';

      for (const filePath of allFiles) {
        try {
          const fileContent = readFileSync(filePath, 'utf-8');
          let searchIdx = 0;

          while (true) {
            const idx = fileContent.indexOf(envVar.value, searchIdx);
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
                type: 'value-match',
                patternName: `Value match: ${envVar.name}`,
                severity: 'critical',
                description: `Literal value of ${envVar.name} (from ${envVar.source}) found in client bundle`,
                filePath,
                charOffset: idx,
                truncatedValue,
              });
            }

            searchIdx = idx + envVar.value.length;
          }
        } catch {
          // File read error; skip silently
        }
      }
    }
  }

  // Pass 3: scan __NEXT_DATA__ blocks in .next/server/pages
  const nextDataFindings = scanNextData(options.dir, options.projectRoot, config ?? {});
  findings.push(...nextDataFindings);

  // Pass 3b: scan next.config.js env block
  const configFindings = scanNextConfig(options.projectRoot, config ?? {});
  findings.push(...configFindings);

  // Pass 3c: scan edge middleware
  const middlewareFindings = scanMiddleware(options.dir, options.projectRoot, config ?? {});
  findings.push(...middlewareFindings);

  // Pass 3e: module graph analysis — only when --graph flag is set
  if (options.graph) {
    const graphFindings = scanModuleGraph(options.dir, options.projectRoot, config ?? {});
    findings.push(...graphFindings);
  }

  // Pass 3d: scan source maps — deduplicate against live bundle findings
  const rawSourceMapFindings = scanSourceMaps(options.dir, options.projectRoot, config ?? {});
  // Live bundle findings are those collected so far (pattern-match and value-match)
  const liveBundleFindings = findings.filter(
    (f) => f.type === 'pattern-match' || f.type === 'value-match',
  );
  const sourcemapFindings = deduplicateSourceMapFindings(rawSourceMapFindings, liveBundleFindings);
  findings.push(...sourcemapFindings);

  // Pass 4: attach git context to each finding (cached per chunk file)
  const gitContextCache = new Map<string, ReturnType<typeof resolveGitContext>>();

  for (const finding of findings) {
    if (!gitContextCache.has(finding.filePath)) {
      gitContextCache.set(
        finding.filePath,
        resolveGitContext(finding.filePath, options.projectRoot, options.dir),
      );
    }
    const ctx = gitContextCache.get(finding.filePath);
    if (ctx !== null && ctx !== undefined) {
      finding.gitContext = ctx;
    }
  }

  // Pass 4b: apply suppression rules from snytch.config.js
  const today = new Date().toISOString().slice(0, 10);
  const suppressionResult = applySuppressions(findings, config?.suppress ?? [], today);
  const activeFindings = suppressionResult.active;

  // Pass 5: AI RCA — only when --report is set, a provider is configured, and findings exist
  if (options.report && options.aiProvider && options.aiProvider !== 'none') {
    await generateRcaForFindings(activeFindings, options.projectRoot, options.aiProvider, options.rcaMaxTokens);
  }

  const durationMs = Date.now() - startTime;

  return {
    scannedFiles: allFiles.length,
    findings: activeFindings,
    suppressedFindings: suppressionResult.suppressed,
    expiredRules: suppressionResult.expiredRules,
    durationMs,
  };
}
