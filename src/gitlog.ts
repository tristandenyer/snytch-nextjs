import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import { GitCommit, GitContext } from './types.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Source directories considered "likely candidates" for leaked values. */
const CANDIDATE_DIRS = ['lib', 'utils', 'services', 'config', 'helpers', 'src/lib', 'src/utils', 'src/services', 'src/config'];

/** Max commits to retrieve per source file. */
const GIT_LOG_LIMIT = 10;

/**
 * Regex to match static ES import paths.
 * Captures the module specifier in group 1.
 * Examples matched:
 *   import foo from './config'
 *   import { bar } from '../lib/secrets'
 *   import * as baz from "../../services/api"
 */
const IMPORT_RE = /\bimport\b[^'"]*['"]([^'"]+)['"]/g;

// ── Build manifest types ──────────────────────────────────────────────────────

interface BuildManifest {
  pages?: Record<string, string[]>;
  [key: string]: unknown;
}

// ── Step 1: chunk → source file mapping ──────────────────────────────────────

/**
 * Parse the Next.js build-manifest.json to map chunk file paths back to the
 * page routes that include them.
 *
 * @param nextDir - Absolute path to the .next directory.
 * @returns Map from chunk basename → array of page routes.
 */
function loadBuildManifest(nextDir: string): Map<string, string[]> {
  const manifestPath = join(nextDir, 'build-manifest.json');
  const result = new Map<string, string[]>();

  if (!existsSync(manifestPath)) return result;

  try {
    const raw = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw) as BuildManifest;

    if (!manifest.pages || typeof manifest.pages !== 'object') return result;

    for (const [page, chunks] of Object.entries(manifest.pages)) {
      if (!Array.isArray(chunks)) continue;
      for (const chunk of chunks) {
        if (typeof chunk !== 'string') continue;
        // chunk is a relative URL like "_next/static/chunks/pages/index-abc123.js"
        const base = chunk.split('/').pop() ?? chunk;
        if (!result.has(base)) result.set(base, []);
        result.get(base)!.push(page);
      }
    }
  } catch {
    // Malformed manifest — skip
  }

  return result;
}

/**
 * Derive a likely source file path from a page route.
 * e.g. "/dashboard" → "src/pages/dashboard.tsx" or "pages/dashboard.tsx"
 *
 * @param page        - Next.js page route, e.g. "/dashboard" or "/api/users".
 * @param projectRoot - Absolute project root.
 * @returns Absolute path if resolvable, otherwise null.
 */
function pageToSourceFile(page: string, projectRoot: string): string | null {
  // Normalize: strip leading slash, replace / with OS separator
  const normalized = page.replace(/^\//, '').replace(/\//g, '/') || 'index';

  const candidates = [
    // App router
    `app/${normalized}/page.tsx`,
    `app/${normalized}/page.ts`,
    `src/app/${normalized}/page.tsx`,
    `src/app/${normalized}/page.ts`,
    // Pages router
    `pages/${normalized}.tsx`,
    `pages/${normalized}.ts`,
    `pages/${normalized}.jsx`,
    `pages/${normalized}.js`,
    `src/pages/${normalized}.tsx`,
    `src/pages/${normalized}.ts`,
  ];

  for (const rel of candidates) {
    const abs = join(projectRoot, rel);
    if (existsSync(abs)) return abs;
  }

  return null;
}

// ── Step 2: import chain extraction ──────────────────────────────────────────

/**
 * Extract import paths from a JS/TS source file and filter to those that
 * look like they come from candidate directories (lib, utils, services, config).
 *
 * @param filePath - Absolute path to the file to parse.
 * @param projectRoot - Absolute project root (for resolving relative imports).
 * @returns Absolute paths of candidate source files found in the import chain.
 */
export function extractCandidateImports(filePath: string, projectRoot: string): string[] {
  let source: string;
  try {
    source = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const candidates: string[] = [];
  let match: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;

  while ((match = IMPORT_RE.exec(source)) !== null) {
    const specifier = match[1];

    // Only follow relative imports
    if (!specifier.startsWith('.')) continue;

    // Resolve relative to the importing file's directory
    const base = dirname(filePath);
    const resolved = join(base, specifier);

    // Check if this resolves into a candidate directory
    const rel = relative(projectRoot, resolved);
    const isCandidatePath = CANDIDATE_DIRS.some(
      (dir) => rel === dir || rel.startsWith(dir + '/'),
    );

    if (!isCandidatePath) continue;

    // Try common extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];
    for (const ext of extensions) {
      const abs = resolved + ext;
      if (existsSync(abs)) {
        candidates.push(abs);
        break;
      }
    }
  }

  return candidates;
}

// ── Step 3: git log ───────────────────────────────────────────────────────────

/**
 * Returns true if the given directory is inside a git repository.
 *
 * @param cwd - Directory to check.
 */
export function isGitRepo(cwd: string): boolean {
  try {
    execSync('git rev-parse --git-dir', {
      cwd,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run `git log --follow` for a single file and parse the output into
 * structured commit objects.
 *
 * @param filePath    - Absolute path to the source file.
 * @param projectRoot - Git repository root (used as cwd for git).
 * @returns Array of up to GIT_LOG_LIMIT commits, oldest-first within the limit.
 * @throws Never — returns empty array on any error.
 */
export function getGitLog(filePath: string, projectRoot: string): GitCommit[] {
  try {
    const relFile = relative(projectRoot, filePath);
    const output = execSync(
      `git log --follow --format="%H|%an|%ae|%ar|%s" -${GIT_LOG_LIMIT} -- "${relFile}"`,
      {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'ignore'],
        // Hard cap on output to prevent ReDoS-like runaway on huge repos
        maxBuffer: 1024 * 256,
      },
    )
      .toString()
      .trim();

    if (!output) return [];

    return output.split('\n').flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) return [];

      // Format: hash|author|email|relativeTime|message
      // Split on first 4 pipes only (message may contain pipes)
      const parts = trimmed.split('|');
      if (parts.length < 5) return [];

      const [hash, author, email, relativeTime, ...messageParts] = parts;
      return [{
        hash: hash.trim(),
        author: author.trim(),
        email: email.trim(),
        relativeTime: relativeTime.trim(),
        message: messageParts.join('|').trim(),
      }];
    });
  } catch {
    return [];
  }
}

// ── Step 4: culprit identification ───────────────────────────────────────────

/**
 * Identify the most likely introducing commit from a git log.
 *
 * Heuristic priority (first match wins):
 * 1. A commit whose message contains "add", "init", "create", or "introduce"
 *    (likely the file's creation commit).
 * 2. A commit whose message references an env var, secret, config, or key.
 * 3. The oldest commit in the log (last entry) — the file's first known commit.
 *
 * @param log - Parsed git log, newest-first.
 * @returns The most likely culprit commit, or null if log is empty.
 */
export function identifyCulprit(log: GitCommit[]): GitCommit | null {
  if (log.length === 0) return null;

  const addRe = /\b(add|init|create|introduce|initial)\b/i;
  const secretRe = /\b(env|secret|config|key|credential|token|api.?key)\b/i;

  for (const commit of log) {
    if (addRe.test(commit.message)) return commit;
  }

  for (const commit of log) {
    if (secretRe.test(commit.message)) return commit;
  }

  // Fall back to oldest commit in the returned window
  return log[log.length - 1];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve the git context for a single scan finding.
 *
 * This is the main entry point called by the scan command. It performs all
 * four steps: chunk→source mapping, import chain walk, git log query, and
 * culprit identification.
 *
 * Returns null when:
 * - The project is not a git repository.
 * - No source file can be identified.
 *
 * Never throws.
 *
 * @param chunkFilePath - Absolute path to the .next chunk file where the
 *                        finding was detected.
 * @param projectRoot   - Absolute project root.
 * @param nextDir       - Absolute path to the .next directory.
 * @returns A GitContext object, or null for non-git projects.
 */
export function resolveGitContext(
  chunkFilePath: string,
  projectRoot: string,
  nextDir: string,
): GitContext | null {
  try {
    if (!isGitRepo(projectRoot)) return null;

    // Step 1: map chunk → page → source file
    const manifest = loadBuildManifest(nextDir);
    const chunkBase = chunkFilePath.split('/').pop() ?? '';
    const pages = manifest.get(chunkBase) ?? [];

    let sourceFile: string | null = null;

    for (const page of pages) {
      const candidate = pageToSourceFile(page, projectRoot);
      if (candidate) {
        sourceFile = candidate;
        break;
      }
    }

    // Step 2: if we found a source file, walk its import chain for better candidates
    if (sourceFile) {
      const importCandidates = extractCandidateImports(sourceFile, projectRoot);
      // Prefer a lib/utils/services/config import over the page file itself
      if (importCandidates.length > 0) {
        sourceFile = importCandidates[0];
      }
    }

    // If still no source file, we can return a context with null sourceFile
    // but still indicate this is a git repo (log will just be empty)
    const log = sourceFile ? getGitLog(sourceFile, projectRoot) : [];
    const likelyCulprit = identifyCulprit(log);

    return { sourceFile, log, likelyCulprit };
  } catch {
    return null;
  }
}
