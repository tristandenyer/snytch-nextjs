import { Finding, SuppressRule, SuppressedFinding } from './types.js';

/**
 * Result of applying suppression rules to a findings array.
 */
export interface SuppressionResult {
  /** Findings that were NOT suppressed — proceed to CI gate and report. */
  active: Finding[];
  /** Findings that matched a valid (non-expired) suppression rule. */
  suppressed: SuppressedFinding[];
  /**
   * Rules that have passed their `until` date.
   * These are reported as warnings so engineers clean them up.
   */
  expiredRules: SuppressRule[];
}

/**
 * Determine whether a suppression rule is expired relative to `today`.
 *
 * A rule without an `until` field never expires.
 * A rule whose `until` date is today or in the future is still active.
 * A rule whose `until` date is in the past is expired.
 *
 * @param rule - The suppression rule to check.
 * @param today - The current date (ISO-8601 string, e.g. `"2026-03-21"`).
 * @returns `true` if the rule has expired, `false` otherwise.
 */
export function isRuleExpired(rule: SuppressRule, today: string): boolean {
  if (!rule.until) return false;
  // Compare as strings — ISO-8601 dates sort lexicographically.
  // A rule expiring today is still active; it expires the following day.
  return rule.until < today;
}

/**
 * Determine whether a suppression rule matches a given finding.
 *
 * A rule matches when ALL of the following are true:
 * - `rule.surface` is absent OR equals `finding.type`
 * - `rule.pattern` is absent OR is a substring of `finding.patternName`
 * - `rule.filePath` is absent OR is a substring of `finding.filePath`
 *
 * Rules with an empty or missing `reason` never match (they are invalid).
 *
 * @param rule - The suppression rule to test.
 * @param finding - The finding to test against.
 * @returns `true` if the rule matches the finding.
 */
export function ruleMatchesFinding(rule: SuppressRule, finding: Finding): boolean {
  if (!rule.reason || rule.reason.trim() === '') return false;
  if (rule.surface !== undefined && rule.surface !== finding.type) return false;
  if (rule.pattern !== undefined && !finding.patternName.includes(rule.pattern)) return false;
  if (rule.filePath !== undefined && !finding.filePath.includes(rule.filePath)) return false;
  return true;
}

/**
 * Apply suppression rules to a list of findings.
 *
 * Each finding is tested against all rules in order. The first matching,
 * non-expired rule suppresses the finding. Expired rules are collected
 * separately so they can be surfaced as warnings.
 *
 * This function is pure — it performs no I/O and does not mutate its inputs.
 *
 * @param findings - All findings produced by the scanner.
 * @param rules - Suppression rules from `snytch.config.js`. May be empty.
 * @param today - The current date as an ISO-8601 string (`"YYYY-MM-DD"`).
 *   Used to evaluate `until` expiry. Pass `new Date().toISOString().slice(0, 10)`
 *   at the call site so tests can inject a stable date.
 * @returns A `SuppressionResult` with active findings, suppressed findings,
 *   and any expired rules.
 */
export function applySuppressions(
  findings: Finding[],
  rules: SuppressRule[],
  today: string,
): SuppressionResult {
  const active: Finding[] = [];
  const suppressed: SuppressedFinding[] = [];

  // Collect expired rules once — used both for reporting and to skip them during matching
  const expiredRules = rules.filter((r) => isRuleExpired(r, today));
  const expiredSet = new Set(expiredRules);

  for (const finding of findings) {
    let matchedRule: SuppressRule | null = null;

    for (const rule of rules) {
      if (expiredSet.has(rule)) continue; // expired rules don't suppress
      if (ruleMatchesFinding(rule, finding)) {
        matchedRule = rule;
        break; // first matching rule wins
      }
    }

    if (matchedRule !== null) {
      suppressed.push({ finding, rule: matchedRule });
    } else {
      active.push(finding);
    }
  }

  return { active, suppressed, expiredRules };
}
