#!/usr/bin/env node

import { cwd } from 'process';
import { resolve, basename } from 'path';
import { scan } from './commands/scan.js';
import { check } from './commands/check.js';
import { diff } from './commands/diff.js';
import { runAll } from './commands/audit.js';
import { runDemo } from './commands/demo.js';
import { startMcpServer } from './mcp.js';
import { printScanResult, printCheckResult, printDiffResult } from './output.js';
import { ScanOptions, CheckOptions, DiffOptions, AllOptions, FailOn, AiProvider } from './types.js';
import { loadConfig } from './config.js';

function parseFailOn(args: string[], i: number): FailOn {
  const val = args[i + 1];
  if (val === 'critical' || val === 'warning' || val === 'all') return val;
  return 'critical';
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const projectRoot = cwd();

  if (!command || !['scan', 'check', 'diff', 'all', 'mcp', 'demo'].includes(command)) {
    console.error('Usage:');
    console.error('  snytch scan [--dir ./.next] [--json] [--report] [--fail-on critical|warning|all] [--ai-provider anthropic|openai|none] [--graph]');
    console.error('  snytch check [--env .env.local] [--json] [--report] [--fail-on critical|warning|all]');
    console.error('  snytch diff --env .env.staging --env .env.production [--json] [--report] [--strict]');
    console.error('  snytch all [options]   Run scan + check + diff sequentially');
    console.error('  snytch demo');
    console.error('  snytch mcp');
    console.error('');
    console.error('  --env may be repeated to specify multiple files:');
    console.error('    snytch check --env .env.local --env .env.production');
    console.error('    snytch diff  --env .env.staging --env .env.production --env .env.local');
    process.exit(1);
  }

  let json = false;
  let report = false;
  let strict = false;
  let graph = false;
  let failOn: FailOn = 'critical';
  let aiProvider: AiProvider = 'anthropic';
  let dir = projectRoot + '/.next';
  const envFiles: string[] = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      json = true;
    } else if (arg === '--report') {
      report = true;
    } else if (arg === '--strict') {
      strict = true;
    } else if (arg === '--graph') {
      graph = true;
    } else if (arg === '--fail-on' && args[i + 1]) {
      failOn = parseFailOn(args, i);
      i++;
    } else if (arg === '--ai-provider' && args[i + 1]) {
      const val = args[i + 1];
      if (val === 'anthropic' || val === 'openai' || val === 'none') {
        aiProvider = val;
      }
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
      const config = loadConfig(projectRoot);
      const rcaMaxTokens = config?.rca?.maxTokens;
      const options: ScanOptions = { dir, projectRoot, json, report, failOn, aiProvider, rcaMaxTokens, graph };
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

    } else if (command === 'diff') {
      if (envFiles.length < 2) {
        console.error('Error: snytch diff requires at least two --env flags.');
        console.error('  Example: snytch diff --env .env.staging --env .env.production');
        process.exit(1);
      }

      // Load serverOnly list from config for non-strict exit logic
      const config = loadConfig(projectRoot);
      const serverOnly = config?.serverOnly ?? [];

      const resolvedFiles = envFiles.map((p) => ({
        path: resolve(p),
        label: basename(p),
      }));

      const options: DiffOptions = {
        envFiles: resolvedFiles,
        projectRoot,
        json,
        report,
        strict,
        serverOnly,
      };

      const result = await diff(options);
      printDiffResult(result, options);

      const outOfSyncCount = result.drift.length + result.onlyInOne.length;
      let shouldFail = false;

      if (strict) {
        shouldFail = outOfSyncCount > 0;
      } else if (serverOnly.length > 0) {
        // Non-strict: only fail if a serverOnly key is drifted
        const driftedKeys = new Set([
          ...result.drift.map((d) => d.key),
          ...result.onlyInOne.map((o) => o.key),
        ]);
        shouldFail = serverOnly.some((k) => driftedKeys.has(k));
      }

      process.exit(shouldFail ? 1 : 0);

    } else if (command === 'all') {
      const config = loadConfig(projectRoot);
      const serverOnly = config?.serverOnly ?? [];

      const allOptions: AllOptions = {
        projectRoot,
        json,
        report,
        failOn,
        aiProvider,
        rcaMaxTokens: config?.rca?.maxTokens,
        graph,
        envFiles: envFiles.length > 0 ? envFiles : undefined,
        strict,
        serverOnly,
        dir,
      };

      const result = await runAll(allOptions);

      // Print results through existing formatters
      if (result.scan) {
        printScanResult(result.scan, {
          dir,
          projectRoot,
          json,
          report,
          failOn,
          aiProvider,
          rcaMaxTokens: config?.rca?.maxTokens,
          graph,
        });
      }

      if (result.check) {
        printCheckResult(result.check, {
          projectRoot,
          json,
          report,
          failOn,
          envFiles: envFiles.length > 0 ? envFiles : undefined,
        });
      }

      if (result.diff) {
        const resolvedFiles = envFiles.map((p) => ({
          path: resolve(p),
          label: basename(p),
        }));
        printDiffResult(result.diff, {
          envFiles: resolvedFiles,
          projectRoot,
          json,
          report,
          strict,
          serverOnly,
        });
      }

      for (const err of result.errors) {
        console.error(`Error in ${err.command}: ${err.message}`);
      }

      // Exit 1 if any sub-command produced findings at the configured threshold
      let shouldFail = result.errors.length > 0;

      if (!shouldFail && result.scan) {
        if (failOn === 'critical') shouldFail = result.scan.findings.some((f) => f.severity === 'critical');
        else if (failOn === 'warning') shouldFail = result.scan.findings.some((f) => f.severity === 'critical' || f.severity === 'warning');
        else if (failOn === 'all') shouldFail = result.scan.findings.length > 0;
      }

      if (!shouldFail && result.check) {
        if (failOn === 'critical') shouldFail = result.check.findings.some((f) => f.severity === 'critical');
        else if (failOn === 'warning') shouldFail = result.check.findings.some((f) => f.severity === 'critical' || f.severity === 'warning');
        else if (failOn === 'all') shouldFail = result.check.findings.length > 0;
      }

      if (!shouldFail && result.diff) {
        const outOfSyncCount = result.diff.drift.length + result.diff.onlyInOne.length;
        if (strict) {
          shouldFail = outOfSyncCount > 0;
        } else if (serverOnly.length > 0) {
          const driftedKeys = new Set([
            ...result.diff.drift.map((d) => d.key),
            ...result.diff.onlyInOne.map((o) => o.key),
          ]);
          shouldFail = serverOnly.some((k) => driftedKeys.has(k));
        }
      }

      process.exit(shouldFail ? 1 : 0);

    } else if (command === 'demo') {
      await runDemo(projectRoot);
      process.exit(1);

    } else if (command === 'mcp') {
      await startMcpServer();
      // startMcpServer runs until the transport closes — no process.exit needed
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
