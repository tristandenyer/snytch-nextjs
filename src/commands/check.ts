import { readFileSync } from 'fs';
import { join } from 'path';
import { PATTERNS } from '../patterns.js';
import { loadConfig } from '../config.js';
import { parseEnvFileContent } from '../parser.js';
import { CheckFinding, CheckOptions, CheckResult } from '../types.js';

/**
 * Names of .env files to scan, in priority order (highest first).
 * We record which file declared each NEXT_PUBLIC_ var but do NOT deduplicate
 * across files — a var declared in multiple files may have different values.
 */
const ENV_FILES = [
  '.env.local',
  '.env.development.local',
  '.env.production.local',
  '.env.test.local',
  '.env.development',
  '.env.production',
  '.env.test',
  '.env',
];

/**
 * Scan .env* files in projectRoot for NEXT_PUBLIC_ variables whose values
 * look like secrets (pattern match) or are listed in snytch.config.js serverOnly.
 *
 * Never throws.
 */
export async function check(options: CheckOptions): Promise<CheckResult> {
  const startTime = Date.now();
  const findings: CheckFinding[] = [];
  let scannedFiles = 0;

  // Load optional config for serverOnly list
  const config = loadConfig(options.projectRoot);
  const serverOnlySet = new Set<string>(config?.serverOnly ?? []);

  for (const envFileName of ENV_FILES) {
    const envFilePath = join(options.projectRoot, envFileName);
    let content: string;

    try {
      content = readFileSync(envFilePath, 'utf-8');
    } catch {
      continue; // file doesn't exist or isn't readable
    }

    scannedFiles++;
    const entries = parseEnvFileContent(content, envFilePath);

    for (const entry of entries) {
      // Only care about NEXT_PUBLIC_ variables
      if (!entry.key.startsWith('NEXT_PUBLIC_')) continue;

      const truncatedValue = entry.value.substring(0, 8) + '•••';

      // Check 1: value matches a known secret pattern
      for (const patternDef of PATTERNS) {
        patternDef.pattern.lastIndex = 0;
        if (patternDef.pattern.test(entry.value)) {
          findings.push({
            varName: entry.key,
            severity: patternDef.severity,
            reason: 'pattern-match',
            patternName: patternDef.name,
            description: `${entry.key} matches pattern "${patternDef.name}" — secret should not be NEXT_PUBLIC_`,
            envFile: envFileName,
            line: entry.line,
            truncatedValue,
          });
          // Only report the first matching pattern per var per file
          break;
        }
      }

      // Check 2: var is listed in serverOnly config
      if (serverOnlySet.has(entry.key)) {
        findings.push({
          varName: entry.key,
          severity: 'critical',
          reason: 'serverOnly',
          patternName: 'serverOnly config',
          description: `${entry.key} is listed in snytch.config.js serverOnly but has NEXT_PUBLIC_ prefix`,
          envFile: envFileName,
          line: entry.line,
          truncatedValue,
        });
      }
    }
  }

  return {
    scannedFiles,
    findings,
    durationMs: Date.now() - startTime,
  };
}
