import { resolve, basename } from 'path';
import { scan } from './scan.js';
import { check } from './check.js';
import { diff } from './diff.js';
import { loadConfig } from '../config.js';
import type {
  AllOptions,
  AllResult,
  AllError,
  ScanOptions,
  CheckOptions,
  DiffOptions,
  ScanResult,
  CheckResult,
  DiffResult,
} from '../types.js';

/**
 * Run scan, check, and (optionally) diff sequentially in a single pass.
 *
 * Each sub-command is wrapped in a try/catch so a failure in one does not
 * prevent the others from running. Errors are collected in `result.errors`.
 * This makes the command safe for CI/CD pipelines where partial results are
 * better than a hard crash.
 *
 * Diff only runs when `options.envFiles` contains 2 or more paths.
 *
 * @param options - Combined options for the run.
 * @returns A combined result containing scan, check, and diff outputs.
 */
export async function runAll(options: AllOptions): Promise<AllResult> {
  const start = Date.now();
  const errors: AllError[] = [];
  let scanResult: ScanResult | null = null;
  let checkResult: CheckResult | null = null;
  let diffResult: DiffResult | null = null;

  const config = await loadConfig(options.projectRoot);
  const rcaMaxTokens = options.rcaMaxTokens ?? config?.rca?.maxTokens;
  const serverOnly = options.serverOnly.length > 0
    ? options.serverOnly
    : config?.serverOnly ?? [];

  // ── 1. Scan ───────────────────────────────────────────────────────────────
  const scanOptions: ScanOptions = {
    dir: options.dir,
    projectRoot: options.projectRoot,
    json: false,
    report: options.report,
    failOn: options.failOn,
    aiProvider: options.aiProvider,
    rcaMaxTokens,
    graph: options.graph,
  };

  try {
    scanResult = await scan(scanOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown scan error';
    errors.push({ command: 'scan', message });
  }

  // ── 2. Check ──────────────────────────────────────────────────────────────
  const checkOptions: CheckOptions = {
    projectRoot: options.projectRoot,
    json: false,
    report: options.report,
    failOn: options.failOn,
    envFiles: options.envFiles,
  };

  try {
    checkResult = await check(checkOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown check error';
    errors.push({ command: 'check', message });
  }

  // ── 3. Diff (only with 2+ env files) ─────────────────────────────────────
  if (options.envFiles && options.envFiles.length >= 2) {
    const resolvedFiles = options.envFiles.map((p: string) => ({
      path: resolve(p),
      label: basename(p),
    }));

    const diffOptions: DiffOptions = {
      envFiles: resolvedFiles,
      projectRoot: options.projectRoot,
      json: false,
      report: options.report,
      strict: options.strict,
      serverOnly,
      diffAliases: options.diffAliases ?? [],
    };

    try {
      diffResult = await diff(diffOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown diff error';
      errors.push({ command: 'diff', message });
    }
  }

  return {
    scan: scanResult,
    check: checkResult,
    diff: diffResult,
    errors,
    durationMs: Date.now() - start,
  };
}
