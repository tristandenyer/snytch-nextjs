import { PATTERNS } from './patterns.js';
import { CheckFinding, EnvEntry, Severity } from './types.js';

// ── Entropy helpers ───────────────────────────────────────────────────────────

/**
 * Compute Shannon entropy in bits per character.
 * Returns 0 for empty strings.
 */
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Minimum length for an unrecognised value to be considered high-entropy.
 * Short random strings produce false positives; 32 chars is a common
 * minimum for secrets (UUIDs are 32 hex chars without dashes).
 */
const ENTROPY_MIN_LENGTH = 32;

/**
 * Shannon entropy threshold (bits per character).
 * Base64/hex secrets typically score ≥ 3.5.
 * Human-readable values rarely exceed 3.2.
 */
const ENTROPY_THRESHOLD = 3.5;

/**
 * Patterns that indicate a value is NOT a secret even if it is long / high-entropy:
 *  - Looks like a plain URL (contains "://")
 *  - Looks like a hex colour (#rrggbb or #rgb)
 *  - Is a well-known public identifier format (e.g. Google Analytics G-XXXXXXXX)
 *  - Contains only word characters and hyphens (slug-like, e.g. "my-feature-flag-name")
 */
const SAFE_VALUE_PATTERNS: RegExp[] = [
  /https?:\/\//i,             // URLs
  /^#[0-9a-f]{3,8}$/i,        // CSS colour
  /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, // slug / feature-flag (lowercase only, no uppercase)
  /^[0-9]+$/,                 // pure numeric
];

/**
 * Return true if the value looks "safe to expose" — i.e. we should NOT
 * flag it as high-entropy even if entropy / length thresholds are met.
 */
function isSafeValue(value: string): boolean {
  return SAFE_VALUE_PATTERNS.some((re) => re.test(value));
}

/**
 * Return true if the value looks like a UUID used as a secret.
 * Standard UUID format: 8-4-4-4-12 hex digits.
 */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Return true if the value triggers the high-entropy heuristic:
 *  - Long enough (≥ ENTROPY_MIN_LENGTH chars), AND
 *  - High Shannon entropy (≥ ENTROPY_THRESHOLD bits/char), OR is a UUID
 *  - AND does not match any safe-value exemption
 */
export function isHighEntropy(value: string): boolean {
  if (value.length < ENTROPY_MIN_LENGTH) return false;
  if (isUuid(value)) return true;
  if (isSafeValue(value)) return false;
  return shannonEntropy(value) >= ENTROPY_THRESHOLD;
}

// ── Rule application ──────────────────────────────────────────────────────────

export interface RuleInput {
  entry: EnvEntry;
  envFile: string; // short filename, e.g. '.env.local'
}

/**
 * Apply all three detection rules to a single NEXT_PUBLIC_ env entry.
 * Returns zero or more findings. Callers must only pass NEXT_PUBLIC_ entries.
 *
 * Rule 1 — Pattern match (CRITICAL or pattern severity):
 *   Value matches a known secret pattern → flag at that pattern's severity.
 *   Only the first matching pattern is reported per entry.
 *
 * Rule 2 — serverOnly config (CRITICAL):
 *   The bare name (without NEXT_PUBLIC_) appears in the serverOnly set.
 *   Flagged regardless of value content.
 *   The bare name OR the full NEXT_PUBLIC_ name may appear in serverOnly.
 *
 * Rule 3 — High entropy (WARN):
 *   Value is long and high-entropy but doesn't match a known pattern.
 *   Only emitted if Rule 1 didn't already fire (avoids double-reporting).
 */
export function applyCheckRules(
  input: RuleInput,
  serverOnlySet: Set<string>,
): CheckFinding[] {
  const { entry, envFile } = input;
  const { key, value, line } = entry;
  const truncatedValue = value.substring(0, 8) + '•••';
  const findings: CheckFinding[] = [];

  // Rule 1 — pattern match
  let patternMatched = false;
  for (const patternDef of PATTERNS) {
    patternDef.pattern.lastIndex = 0;
    if (patternDef.pattern.test(value)) {
      findings.push({
        varName: key,
        severity: patternDef.severity,
        reason: 'pattern-match',
        patternName: patternDef.name,
        description:
          `NEXT_PUBLIC_ prefix will inline this secret into the client bundle at build time`,
        envFile,
        line,
        truncatedValue,
      });
      patternMatched = true;
      break; // only first matching pattern per entry
    }
  }

  // Rule 2 — serverOnly config
  // Accept either the full name (NEXT_PUBLIC_FOO) or bare name (FOO)
  const bareName = key.replace(/^NEXT_PUBLIC_/, '');
  if (serverOnlySet.has(key) || serverOnlySet.has(bareName)) {
    findings.push({
      varName: key,
      severity: 'critical' as Severity,
      reason: 'serverOnly',
      patternName: 'serverOnly config',
      description:
        `${bareName} is declared serverOnly in snytch.config.js. Removing ` +
        `NEXT_PUBLIC_ prefix will keep it server-side`,
      envFile,
      line,
      truncatedValue,
    });
  }

  // Rule 3 — high entropy (only if Rule 1 didn't fire)
  if (!patternMatched && isHighEntropy(value)) {
    findings.push({
      varName: key,
      severity: 'warning' as Severity,
      reason: 'high-entropy',
      patternName: 'High Entropy',
      description:
        `This value has characteristics of a secret. Verify it is safe to expose publicly.`,
      envFile,
      line,
      truncatedValue,
    });
  }

  return findings;
}
