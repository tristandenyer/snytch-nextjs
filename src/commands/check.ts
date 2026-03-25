import { readFileSync } from 'fs';
import { basename, join } from 'path';
import { loadConfig } from '../config.js';
import { parseEnvFileContent } from '../parser.js';
import { applyCheckRules } from '../rules.js';
import { applyCheckSuppressions } from '../suppress.js';
import { CheckOptions, CheckResult } from '../types.js';

/**
 * Default .env file names to scan (relative to projectRoot), in Next.js load order.
 * Used when the caller does not supply an explicit envFiles list.
 */
const DEFAULT_ENV_FILES = [
  '.env.local',
  '.env.development.local',
  '.env.production.local',
  '.env.test.local',
  '.env.development',
  '.env.production',
  '.env.test',
  '.env',
];

interface ResolvedEnvFile {
  /** Absolute path used for readFileSync. */
  absPath: string;
  /** Short label used in findings (basename, or the path as given for explicit files). */
  label: string;
}

function resolveEnvFiles(options: CheckOptions): ResolvedEnvFile[] {
  if (options.envFiles && options.envFiles.length > 0) {
    // Explicit --env paths: treat as-is (may be relative or absolute from the shell)
    return options.envFiles.map((p) => ({
      absPath: p,
      label: basename(p),
    }));
  }
  return DEFAULT_ENV_FILES.map((name) => ({
    absPath: join(options.projectRoot, name),
    label: name,
  }));
}

/**
 * Scan .env* files for NEXT_PUBLIC_ variables that look like secrets or
 * violate the serverOnly config.
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

  for (const { absPath, label } of resolveEnvFiles(options)) {
    let content: string;
    try {
      content = readFileSync(absPath, 'utf-8');
    } catch {
      continue;
    }

    scannedFiles++;
    const entries = parseEnvFileContent(content, absPath);

    for (const entry of entries) {
      if (!entry.key.startsWith('NEXT_PUBLIC_')) continue;
      const findings = applyCheckRules({ entry, envFile: label }, serverOnlySet);
      allFindings.push(...findings);
    }
  }

  const suppressRules = config?.suppress ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const { active, suppressed, expiredRules } = applyCheckSuppressions(allFindings, suppressRules, today);

  return {
    scannedFiles,
    findings: active,
    suppressedFindings: suppressed,
    expiredRules,
    durationMs: Date.now() - startTime,
  };
}
