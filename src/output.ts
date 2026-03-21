import chalk from 'chalk';
import { relative } from 'path';
import { ScanResult, ScanOptions, Finding } from './types.js';

const DIVIDER = '─'.repeat(45);

function relPath(filePath: string, projectRoot: string): string {
  return relative(projectRoot, filePath) || filePath;
}

function printFinding(finding: Finding, projectRoot: string): void {
  const label =
    finding.severity === 'critical'
      ? chalk.red('[CRITICAL]')
      : chalk.yellow('[WARN]');

  console.log('');
  console.log(`  ${label} ${finding.patternName}`);
  console.log(`    file:  ${relPath(finding.filePath, projectRoot)}`);
  console.log(`    col:   ${finding.charOffset}`);
  console.log(`    value: ${finding.truncatedValue} (truncated)`);
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
        '  ✓ snytch: clean — no secrets detected in client bundle',
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
  console.log('  run with --report to generate full RCA report');
  console.log('');
}
