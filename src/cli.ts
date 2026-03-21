#!/usr/bin/env node

import { cwd } from 'process';
import { scan } from './commands/scan.js';
import { check } from './commands/check.js';
import { printScanResult, printCheckResult } from './output.js';
import { ScanOptions, CheckOptions, FailOn } from './types.js';

function parseFailOn(args: string[], i: number): FailOn {
  const val = args[i + 1];
  if (val === 'critical' || val === 'warning' || val === 'all') return val;
  return 'critical';
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const projectRoot = cwd();

  if (!command || (command !== 'scan' && command !== 'check')) {
    console.error('Usage:');
    console.error('  snytch scan [--dir ./.next] [--json] [--report] [--fail-on critical|warning|all]');
    console.error('  snytch check [--env .env.local] [--json] [--report] [--fail-on critical|warning|all]');
    console.error('');
    console.error('  --env may be repeated to specify multiple files:');
    console.error('    snytch check --env .env.local --env .env.production');
    process.exit(1);
  }

  let json = false;
  let report = false;
  let failOn: FailOn = 'critical';
  let dir = projectRoot + '/.next';
  const envFiles: string[] = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      json = true;
    } else if (arg === '--report') {
      report = true;
    } else if (arg === '--fail-on' && args[i + 1]) {
      failOn = parseFailOn(args, i);
      i++;
    } else if (arg === '--dir' && args[i + 1]) {
      dir = args[i + 1];
      i++;
    } else if (arg === '--env' && args[i + 1]) {
      envFiles.push(args[i + 1]);
      i++;
    }
  }

  try {
    if (command === 'scan') {
      const options: ScanOptions = { dir, projectRoot, json, report, failOn };
      const result = await scan(options);
      printScanResult(result, options);

      let shouldFail = false;
      if (failOn === 'critical') shouldFail = result.findings.some((f) => f.severity === 'critical');
      else if (failOn === 'warning') shouldFail = result.findings.some((f) => f.severity === 'critical' || f.severity === 'warning');
      else if (failOn === 'all') shouldFail = result.findings.length > 0;
      process.exit(shouldFail ? 1 : 0);

    } else if (command === 'check') {
      const options: CheckOptions = {
        projectRoot,
        json,
        report,
        failOn,
        envFiles: envFiles.length > 0 ? envFiles : undefined,
      };
      const result = await check(options);
      printCheckResult(result, options);

      let shouldFail = false;
      if (failOn === 'critical') shouldFail = result.findings.some((f) => f.severity === 'critical');
      else if (failOn === 'warning') shouldFail = result.findings.some((f) => f.severity === 'critical' || f.severity === 'warning');
      else if (failOn === 'all') shouldFail = result.findings.length > 0;
      process.exit(shouldFail ? 1 : 0);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error:', error.message);
    } else {
      console.error('Unknown error occurred');
    }
    process.exit(1);
  }
}

main();
