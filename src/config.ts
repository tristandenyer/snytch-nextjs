import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SnytchConfig, ResolvedEnvVar } from './types.js';

/**
 * Load snytch.config.js from projectRoot. Returns null if not found or invalid.
 * Never throws.
 */
export function loadConfig(projectRoot: string): SnytchConfig | null {
  const configPath = join(projectRoot, 'snytch.config.js');
  if (!existsSync(configPath)) return null;

  try {
    const require = createRequire(import.meta.url);
    const config = require(configPath) as unknown;
    if (typeof config !== 'object' || config === null) return null;
    return config as SnytchConfig;
  } catch {
    return null;
  }
}

/**
 * Parse a .env file into a key→value map.
 * Handles: KEY=value, KEY="value", KEY='value', comments, blank lines.
 * Never throws.
 */
function parseEnvFile(filePath: string): Map<string, string> {
  const result = new Map<string, string>();
  try {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;

      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();

      // Strip surrounding quotes
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }

      if (key) result.set(key, val);
    }
  } catch {
    // File unreadable; skip
  }
  return result;
}

/**
 * Resolve actual values for each name in serverOnly.
 * Resolution order: .env.local → .env → process.env
 * Returns only vars with non-empty values (length >= 8 to avoid false positives).
 */
export function resolveEnvVars(
  projectRoot: string,
  serverOnly: string[],
): ResolvedEnvVar[] {
  const envLocal = parseEnvFile(join(projectRoot, '.env.local'));
  const envBase = parseEnvFile(join(projectRoot, '.env'));

  const resolved: ResolvedEnvVar[] = [];

  for (const name of serverOnly) {
    let value: string | undefined;
    let source = '';

    if (envLocal.has(name)) {
      value = envLocal.get(name);
      source = '.env.local';
    } else if (envBase.has(name)) {
      value = envBase.get(name);
      source = '.env';
    } else if (process.env[name]) {
      value = process.env[name];
      source = 'process.env';
    }

    // Only include vars with a value long enough to be meaningful
    if (value && value.length >= 8) {
      resolved.push({ name, value, source });
    }
  }

  return resolved;
}
