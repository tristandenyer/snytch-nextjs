#!/usr/bin/env node

import { cwd } from 'process';
import { scan } from './commands/scan.js';
import { printScanResult } from './output.js';
import { ScanOptions } from './types.js';

function parseArgs(): ScanOptions {
  const args = process.argv.slice(2);

  let command = '';
  const projectRoot = cwd();
  let dir = projectRoot + '/.next';
  let json = false;
  let failOn: 'critical' | 'warning' | 'all' = 'critical';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!command && arg === 'scan') {
      command = 'scan';
    } else if (arg === '--dir' && args[i + 1]) {
      dir = args[i + 1];
      i++;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--fail-on' && args[i + 1]) {
      const val = args[i + 1];
      if (val === 'critical' || val === 'warning' || val === 'all') {
        failOn = val;
      }
      i++;
    }
  }

  if (!command || command !== 'scan') {
    console.error(
      'Usage: snytch scan [--dir ./.next] [--json] [--fail-on critical|warning|all]',
    );
    process.exit(1);
  }

  return { dir, projectRoot, json, failOn };
}

async function main() {
  const options = parseArgs();

  try {
    const result = await scan(options);
    printScanResult(result, options);

    // Determine exit code based on failOn level
    let shouldFail = false;

    if (options.failOn === 'critical') {
      shouldFail = result.findings.some((f) => f.severity === 'critical');
    } else if (options.failOn === 'warning') {
      shouldFail = result.findings.some(
        (f) => f.severity === 'critical' || f.severity === 'warning',
      );
    } else if (options.failOn === 'all') {
      shouldFail = result.findings.length > 0;
    }

    process.exit(shouldFail ? 1 : 0);
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
