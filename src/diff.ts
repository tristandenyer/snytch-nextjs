import { readFileSync } from 'fs';
import { parseEnvFileContent } from './parser.js';

export interface DriftEntry {
  key: string;
  presentIn: string[];   // file labels where the key exists
  missingFrom: string[]; // file labels where the key is absent
}

export interface OnlyInOneEntry {
  key: string;
  file: string; // file label where this key appears
}

export interface EnvDiffResult {
  inSync: string[];         // keys present in ALL files
  drift: DriftEntry[];      // keys present in some but not all files
  onlyInOne: OnlyInOneEntry[]; // keys present in exactly one file
}

interface FileKeys {
  label: string;
  keys: Set<string>;
}

/**
 * Compare two or more .env files by key names only.
 * Values are never read into the result — they are stripped immediately after parsing.
 *
 * @param files Array of { path, label } — path is the absolute file path,
 *              label is the display name (e.g. '.env.local')
 * @returns Structured diff with inSync / drift / onlyInOne buckets
 */
export function diffEnvFiles(files: { path: string; label: string }[]): EnvDiffResult {
  if (files.length < 2) {
    throw new Error('diffEnvFiles requires at least two files to compare');
  }

  // Parse each file and immediately discard values — keep keys only
  const parsed: FileKeys[] = files.map(({ path, label }) => {
    let content = '';
    try {
      content = readFileSync(path, 'utf-8');
    } catch {
      // Missing or unreadable file → treat as empty
    }
    const entries = parseEnvFileContent(content, path);
    return { label, keys: new Set(entries.map((e) => e.key)) };
  });

  // Build union of all keys across all files
  const allKeys = new Set<string>();
  for (const f of parsed) {
    for (const k of f.keys) allKeys.add(k);
  }

  const inSync: string[] = [];
  const drift: DriftEntry[] = [];
  const onlyInOne: OnlyInOneEntry[] = [];

  for (const key of [...allKeys].sort()) {
    const presentIn = parsed.filter((f) => f.keys.has(key)).map((f) => f.label);
    const missingFrom = parsed.filter((f) => !f.keys.has(key)).map((f) => f.label);

    if (missingFrom.length === 0) {
      // Key exists in every file
      inSync.push(key);
    } else if (presentIn.length === 1) {
      // Key exists in exactly one file
      onlyInOne.push({ key, file: presentIn[0] });
    } else {
      // Key exists in some but not all files
      drift.push({ key, presentIn, missingFrom });
    }
  }

  return { inSync, drift, onlyInOne };
}
