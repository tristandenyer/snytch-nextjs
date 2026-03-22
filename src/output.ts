import chalk from 'chalk';
import { relative } from 'path';
import { ScanResult, ScanOptions, Finding, CheckResult, CheckOptions, DiffResult, DiffOptions } from './types.js';
import { generateReport, generateCheckReport, generateDiffReport } from './report.js';

const DIVIDER = '─'.repeat(45);

function relPath(filePath: string, projectRoot: string): string {
  return relative(projectRoot, filePath) || filePath;
}

/**
 * Return a short human-readable label describing where a finding came from.
 *
 * @param finding - The finding to label.
 * @returns A short surface label string.
 */
function findingSurfaceLabel(finding: Finding): string {
  switch (finding.type) {
    case 'next-data':
      return chalk.dim('[__NEXT_DATA__]');
    case 'config-env':
      return chalk.dim('[next.config env]');
    case 'middleware-secret':
      return chalk.dim('[edge middleware]');
    case 'sourcemap-secret':
      return chalk.dim('[source map]');
    case 'graph-leak':
      return chalk.dim('[import chain]');
    case 'value-match':
    case 'pattern-match':
    default:
      return chalk.dim('[client bundle]');
  }
}

function printFinding(finding: Finding, projectRoot: string): void {
  const severityLabel =
    finding.severity === 'critical'
      ? chalk.red('[CRITICAL]')
      : chalk.yellow('[WARN]');

  const surface = findingSurfaceLabel(finding);

  console.log('');
  console.log(`  ${severityLabel} ${surface} ${finding.patternName}`);

  if (finding.type === 'graph-leak') {
    console.log(`    chain: ${finding.description}`);
  } else {
    console.log(`    file:  ${relPath(finding.filePath, projectRoot)}`);
    console.log(`    col:   ${finding.charOffset}`);
    console.log(`    value: ${finding.truncatedValue} (truncated)`);
  }
}

/**
 * Print a one-line suppression summary and any expired-rule warnings.
 *
 * @param result - The scan result containing suppressed findings.
 * @param expiredRules - Any suppression rules whose `until` date has passed.
 * @param reportMode - Whether `--report` was passed (suppressed tab visible in report).
 */
function printSuppressionSummary(
  suppressedCount: number,
  expiredRules: import('./types.js').SuppressRule[],
  reportMode: boolean,
): void {
  if (suppressedCount > 0) {
    const label = suppressedCount === 1 ? 'finding' : 'findings';
    const hint = reportMode
      ? chalk.dim('(listed in report)')
      : chalk.dim('(run with --report to see details)');
    console.log(
      `  ${chalk.dim(`${suppressedCount} suppressed ${label}`)} ${hint}`,
    );
  }

  for (const rule of expiredRules) {
    console.log(
      chalk.yellow(
        `  ⚠  Suppression rule expired. Reason: "${rule.reason}"${rule.until ? ` (until: ${rule.until})` : ''}`,
      ),
    );
    console.log(
      chalk.yellow('     This rule is no longer suppressing any findings. Remove or extend it.'),
    );
  }
}

export function printScanResult(
  result: ScanResult,
  options: ScanOptions,
): void {
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          scannedFiles: result.scannedFiles,
          findings: result.findings,
          durationMs: result.durationMs,
        },
        null,
        2,
      ),
    );
    return;
  }

  const criticals = result.findings.filter((f) => f.severity === 'critical');
  const warnings = result.findings.filter((f) => f.severity === 'warning');
  const cleanCount =
    result.scannedFiles - new Set(result.findings.map((f) => f.filePath)).size;

  // Header
  console.log('');
  console.log(
    `  scanning .next/static/chunks (${result.scannedFiles} files)...`,
  );

  // Zero findings: single clean line
  if (result.findings.length === 0) {
    console.log('');
    console.log(
      chalk.green(
        '  ✓ snytch ran clean. No secrets detected in client bundle.',
      ),
    );
    console.log('');
    return;
  }

  // Summary bar
  console.log('');
  console.log(`  ${DIVIDER}`);

  const criticalLabel =
    criticals.length > 0
      ? chalk.red(`${criticals.length} critical`)
      : chalk.green('0 critical');
  const warningLabel =
    warnings.length > 0
      ? chalk.yellow(`${warnings.length} warning`)
      : chalk.green('0 warning');
  const cleanLabel = chalk.green(`${cleanCount} clean`);

  console.log(`  ${criticalLabel}   ${warningLabel}   ${cleanLabel}`);
  console.log(`  ${DIVIDER}`);

  // Findings: CRITICAL first, then WARN
  for (const finding of [...criticals, ...warnings]) {
    printFinding(finding, options.projectRoot);
  }

  console.log('');
  printSuppressionSummary(
    result.suppressedFindings.length,
    result.expiredRules,
    options.report ?? false,
  );
  if (options.report) {
    generateReport(result, options);
  } else {
    console.log('  run with --report to generate full RCA report');
  }
  console.log('');
}

// ── Diff output ───────────────────────────────────────────────────────────────

/**
 * Print a formatted diff table to stdout.
 *
 * Sort order: drifted/onlyInOne keys first (alphabetical within that group),
 * then inSync keys alphabetically.
 *
 * Values are never printed — key presence only.
 *
 * @param result - The structured diff result.
 * @param options - CLI options controlling JSON/report mode and strict flag.
 */
export function printDiffResult(result: DiffResult, options: DiffOptions): void {
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          fileLabels: result.fileLabels,
          inSync: result.inSync,
          drift: result.drift,
          onlyInOne: result.onlyInOne,
          durationMs: result.durationMs,
        },
        null,
        2,
      ),
    );
    return;
  }

  const totalKeys =
    result.inSync.length + result.drift.length + result.onlyInOne.length;
  const outOfSyncCount = result.drift.length + result.onlyInOne.length;
  const labels = result.fileLabels;

  // ── Header ─────────────────────────────────────────────────────────────────
  console.log('');
  console.log(
    `  Comparing ${labels.length} environments · ${totalKeys} total key${totalKeys === 1 ? '' : 's'}`,
  );
  console.log('');
  if (outOfSyncCount === 0) {
    console.log(chalk.green(`  IN SYNC (${result.inSync.length})`));
  } else {
    console.log(
      chalk.green(`  IN SYNC (${result.inSync.length})`) +
        '     ' +
        chalk.red(`DRIFT (${outOfSyncCount})`),
    );
  }
  console.log('');

  // ── Table header ───────────────────────────────────────────────────────────
  const varColWidth = Math.max(
    20,
    ...result.inSync.map((k) => k.length),
    ...result.drift.map((d) => d.key.length),
    ...result.onlyInOne.map((o) => o.key.length),
  ) + 2;

  // File label columns — at least 14 chars wide
  const colWidths = labels.map((l) => Math.max(14, l.length + 2));

  const headerVar = 'variable'.padEnd(varColWidth);
  const headerFiles = labels.map((l, i) => l.padEnd(colWidths[i])).join('  ');
  console.log(`  ${chalk.dim(headerVar)}  ${chalk.dim(headerFiles)}`);

  const dividerWidth = varColWidth + colWidths.reduce((s, w) => s + w + 2, 0) + 4;
  console.log(`  ${'─'.repeat(dividerWidth)}`);

  // ── Rows: drifted/onlyInOne first, then inSync ─────────────────────────────
  const driftedKeys = [
    ...result.drift.map((d) => d.key),
    ...result.onlyInOne.map((o) => o.key),
  ].sort();

  for (const key of driftedKeys) {
    const driftEntry = result.drift.find((d) => d.key === key);
    const onlyEntry = result.onlyInOne.find((o) => o.key === key);

    const cells = labels.map((label, i) => {
      let present: boolean;
      if (driftEntry) {
        present = driftEntry.presentIn.includes(label);
      } else {
        // onlyInOne
        present = onlyEntry!.file === label;
      }

      const mark = present ? chalk.green('✓') : chalk.red('✗');
      const note =
        !present
          ? chalk.dim(` ← MISSING IN ${label.toUpperCase()}`)
          : '';

      return mark.padEnd(colWidths[i]) + note;
    });

    console.log(`  ${chalk.yellow(key.padEnd(varColWidth))}  ${cells.join('  ')}`);
  }

  // Separator between drifted and in-sync
  if (driftedKeys.length > 0 && result.inSync.length > 0) {
    console.log(`  ${'─'.repeat(dividerWidth)}`);
  }

  for (const key of result.inSync) {
    const cells = labels.map((_label, i) =>
      chalk.green('✓').padEnd(colWidths[i]),
    );
    console.log(`  ${key.padEnd(varColWidth)}  ${cells.join('  ')}`);
  }

  console.log('');

  // ── Summary footer ─────────────────────────────────────────────────────────
  if (outOfSyncCount === 0) {
    console.log(chalk.green('  ✓ all variables in sync across all environments'));
  } else {
    console.log(chalk.red(`  ${outOfSyncCount} variable${outOfSyncCount === 1 ? '' : 's'} out of sync.`));
  }
  console.log(chalk.dim('  values are never compared, key presence only'));
  console.log('');

  if (options.report) {
    generateDiffReport(result, options);
  }
}

export function printCheckResult(
  result: CheckResult,
  options: CheckOptions,
): void {
  if (options.json) {
    console.log(JSON.stringify({ scannedFiles: result.scannedFiles, findings: result.findings, durationMs: result.durationMs }, null, 2));
    return;
  }

  const criticals = result.findings.filter((f) => f.severity === 'critical');
  const warnings = result.findings.filter((f) => f.severity === 'warning');

  console.log('');
  console.log(`  checking .env* files (${result.scannedFiles} scanned)...`);

  if (result.findings.length === 0) {
    console.log('');
    console.log(chalk.green('  ✓ snytch ran clean. No NEXT_PUBLIC_ secrets detected.'));
    if (options.report) {
      console.log('');
      generateCheckReport(result, options);
    }
    console.log('');
    return;
  }

  console.log('');
  console.log(`  ${DIVIDER}`);

  const criticalLabel = criticals.length > 0 ? chalk.red(`${criticals.length} critical`) : chalk.green('0 critical');
  const warningLabel = warnings.length > 0 ? chalk.yellow(`${warnings.length} warning`) : chalk.green('0 warning');
  console.log(`  ${criticalLabel}   ${warningLabel}`);
  console.log(`  ${DIVIDER}`);

  for (const finding of [...criticals, ...warnings]) {
    const label = finding.severity === 'critical' ? chalk.red('[CRITICAL]') : chalk.yellow('[WARN]');
    console.log('');
    console.log(`  ${label} ${finding.varName}`);
    console.log(`    file:    ${finding.envFile}:${finding.line}`);
    console.log(`    reason:  ${finding.description}`);
    console.log(`    value:   ${finding.truncatedValue} (truncated)`);
  }

  console.log('');
  if (options.report) {
    generateCheckReport(result, options);
  }
  console.log('');
}

