import { readFileSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '../config.js';
import { parseEnvFileContent } from '../parser.js';
import { applyCheckRules } from '../rules.js';
import { CheckOptions, CheckResult } from '../types.js';

/**
 * Names of .env files to scan, in Next.js load order.
 * We scan all of them — a variable declared in multiple files may have
 * different values in each and produces independent findings.
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
 * Scan .env* files in projectRoot for NEXT_PUBLIC_ variables that look like
 * secrets or violate the serverOnly config.
 *
 * Detection logic is delegated to applyCheckRules (src/rules.ts).
 * Never throws.
 */
export async function check(options: CheckOptions): Promise<CheckResult> {
  const startTime = Date.now();
  const allFindings = [];
  let scannedFiles = 0;

  const config = loadConfig(options.projectRoot);
  const serverOnlySet = new Set<string>(config?.serverOnly ?? []);

  for (const envFileName of ENV_FILES) {
    const envFilePath = join(options.projectRoot, envFileName);
    let content: string;

    try {
      content = readFileSync(envFilePath, 'utf-8');
    } catch {
      continue;
    }

    scannedFiles++;
    const entries = parseEnvFileContent(content, envFilePath);

    for (const entry of entries) {
      if (!entry.key.startsWith('NEXT_PUBLIC_')) continue;
      const findings = applyCheckRules({ entry, envFile: envFileName }, serverOnlySet);
      allFindings.push(...findings);
    }
  }

  return {
    scannedFiles,
    findings: allFindings,
    durationMs: Date.now() - startTime,
  };
}
