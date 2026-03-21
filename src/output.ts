import { ScanResult, ScanOptions } from './types.js';

const ANSI_RED = '\x1b[31m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_RESET = '\x1b[0m';

export function printScanResult(
  result: ScanResult,
  options: ScanOptions,
): void {
  if (options.json) {
    const jsonOutput = {
      scannedFiles: result.scannedFiles,
      findings: result.findings,
      durationMs: result.durationMs,
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
    return;
  }

  // Terminal output
  console.log(`\nScanning ${result.scannedFiles} files...`);
  console.log('='.repeat(60));

  const criticalCount = result.findings.filter(
    (f) => f.severity === 'critical',
  ).length;
  const warningCount = result.findings.filter(
    (f) => f.severity === 'warning',
  ).length;
  const infoCount = result.findings.filter((f) => f.severity === 'info').length;

  // Summary line with colors
  const summaryParts: string[] = [];

  if (criticalCount > 0) {
    summaryParts.push(
      `${ANSI_RED}${criticalCount} critical${ANSI_RESET}`,
    );
  } else {
    summaryParts.push(`${ANSI_GREEN}0 critical${ANSI_RESET}`);
  }

  if (warningCount > 0) {
    summaryParts.push(`${ANSI_YELLOW}${warningCount} warning${ANSI_RESET}`);
  } else {
    summaryParts.push(`${ANSI_GREEN}0 warning${ANSI_RESET}`);
  }

  if (infoCount > 0) {
    summaryParts.push(`${infoCount} info`);
  } else {
    summaryParts.push(`${ANSI_GREEN}0 info${ANSI_RESET}`);
  }

  console.log(`Summary: ${summaryParts.join('   ')}`);
  console.log('='.repeat(60));

  if (result.findings.length === 0) {
    console.log(`${ANSI_GREEN}✓ No secrets found${ANSI_RESET}`);
  } else {
    for (const finding of result.findings) {
      const severityLabel =
        finding.severity === 'critical'
          ? `${ANSI_RED}[CRITICAL]${ANSI_RESET}`
          : finding.severity === 'warning'
            ? `${ANSI_YELLOW}[WARN]${ANSI_RESET}`
            : '[INFO]';

      console.log(
        `${severityLabel} ${finding.patternName} @ ${finding.filePath}:${finding.charOffset}`,
      );
      console.log(`  Value: ${finding.truncatedValue}`);
      console.log(`  Desc: ${finding.description}`);
    }
  }

  console.log('='.repeat(60));
  console.log(`Completed in ${result.durationMs}ms`);
}
