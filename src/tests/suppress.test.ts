import { describe, it, expect } from 'vitest';
import { applySuppressions, isRuleExpired, ruleMatchesFinding } from '../suppress.js';
import type { Finding, SuppressRule } from '../types.js';

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    type: 'pattern-match',
    patternName: 'Stripe Secret Key',
    severity: 'critical',
    description: 'A Stripe secret key was found',
    filePath: '/project/.next/static/chunks/main.js',
    charOffset: 42,
    truncatedValue: 'sk_live_•••',
    ...overrides,
  };
}

const TODAY = '2026-03-21';
const YESTERDAY = '2026-03-20';
const TOMORROW = '2026-03-22';

// ── isRuleExpired ─────────────────────────────────────────────────────────────

describe('isRuleExpired', () => {
  it('returns false when rule has no until field', () => {
    expect(isRuleExpired({ reason: 'test' }, TODAY)).toBe(false);
  });

  it('returns false when until is today (still active)', () => {
    expect(isRuleExpired({ reason: 'test', until: TODAY }, TODAY)).toBe(false);
  });

  it('returns false when until is in the future', () => {
    expect(isRuleExpired({ reason: 'test', until: TOMORROW }, TODAY)).toBe(false);
  });

  it('returns true when until is in the past', () => {
    expect(isRuleExpired({ reason: 'test', until: YESTERDAY }, TODAY)).toBe(true);
  });
});

// ── ruleMatchesFinding ────────────────────────────────────────────────────────

describe('ruleMatchesFinding', () => {
  it('matches when rule has no surface or pattern (wildcard)', () => {
    const rule: SuppressRule = { reason: 'known false positive' };
    expect(ruleMatchesFinding(rule, makeFinding())).toBe(true);
  });

  it('matches when surface equals finding.type', () => {
    const rule: SuppressRule = { surface: 'pattern-match', reason: 'ok' };
    expect(ruleMatchesFinding(rule, makeFinding({ type: 'pattern-match' }))).toBe(true);
  });

  it('does not match when surface differs from finding.type', () => {
    const rule: SuppressRule = { surface: 'next-data', reason: 'ok' };
    expect(ruleMatchesFinding(rule, makeFinding({ type: 'pattern-match' }))).toBe(false);
  });

  it('matches when pattern is a substring of patternName', () => {
    const rule: SuppressRule = { pattern: 'Stripe', reason: 'ok' };
    expect(ruleMatchesFinding(rule, makeFinding({ patternName: 'Stripe Secret Key' }))).toBe(true);
  });

  it('matches when pattern equals patternName exactly', () => {
    const rule: SuppressRule = { pattern: 'Stripe Secret Key', reason: 'ok' };
    expect(ruleMatchesFinding(rule, makeFinding({ patternName: 'Stripe Secret Key' }))).toBe(true);
  });

  it('does not match when pattern is not a substring of patternName', () => {
    const rule: SuppressRule = { pattern: 'GitHub', reason: 'ok' };
    expect(ruleMatchesFinding(rule, makeFinding({ patternName: 'Stripe Secret Key' }))).toBe(false);
  });

  it('matches when both surface and pattern match', () => {
    const rule: SuppressRule = { surface: 'next-data', pattern: 'AWS', reason: 'ok' };
    expect(
      ruleMatchesFinding(
        rule,
        makeFinding({ type: 'next-data', patternName: 'AWS Access Key ID' }),
      ),
    ).toBe(true);
  });

  it('does not match when surface matches but pattern does not', () => {
    const rule: SuppressRule = { surface: 'next-data', pattern: 'Stripe', reason: 'ok' };
    expect(
      ruleMatchesFinding(
        rule,
        makeFinding({ type: 'next-data', patternName: 'AWS Access Key ID' }),
      ),
    ).toBe(false);
  });

  it('does not match when reason is empty string', () => {
    const rule: SuppressRule = { reason: '' };
    expect(ruleMatchesFinding(rule, makeFinding())).toBe(false);
  });

  it('does not match when reason is whitespace only', () => {
    const rule: SuppressRule = { reason: '   ' };
    expect(ruleMatchesFinding(rule, makeFinding())).toBe(false);
  });
});

// ── applySuppressions ─────────────────────────────────────────────────────────

describe('applySuppressions', () => {
  it('returns all findings as active when rules array is empty', () => {
    const findings = [makeFinding(), makeFinding({ patternName: 'GitHub Token' })];
    const result = applySuppressions(findings, [], TODAY);
    expect(result.active).toHaveLength(2);
    expect(result.suppressed).toHaveLength(0);
    expect(result.expiredRules).toHaveLength(0);
  });

  it('returns empty arrays when findings is empty', () => {
    const rules: SuppressRule[] = [{ reason: 'ok' }];
    const result = applySuppressions([], rules, TODAY);
    expect(result.active).toHaveLength(0);
    expect(result.suppressed).toHaveLength(0);
    expect(result.expiredRules).toHaveLength(0);
  });

  it('suppresses a finding matched by a wildcard rule', () => {
    const finding = makeFinding();
    const rule: SuppressRule = { reason: 'test key — not a real credential' };
    const result = applySuppressions([finding], [rule], TODAY);
    expect(result.active).toHaveLength(0);
    expect(result.suppressed).toHaveLength(1);
    expect(result.suppressed[0].finding).toBe(finding);
    expect(result.suppressed[0].rule).toBe(rule);
  });

  it('suppresses only the matching finding when rule has surface filter', () => {
    const bundleFinding = makeFinding({ type: 'pattern-match' });
    const nextDataFinding = makeFinding({ type: 'next-data' });
    const rule: SuppressRule = { surface: 'next-data', reason: 'legacy page — being migrated' };
    const result = applySuppressions([bundleFinding, nextDataFinding], [rule], TODAY);
    expect(result.active).toHaveLength(1);
    expect(result.active[0]).toBe(bundleFinding);
    expect(result.suppressed).toHaveLength(1);
    expect(result.suppressed[0].finding).toBe(nextDataFinding);
  });

  it('suppresses only the matching finding when rule has pattern filter', () => {
    const stripeFinding = makeFinding({ patternName: 'Stripe Secret Key' });
    const githubFinding = makeFinding({ patternName: 'GitHub Token' });
    const rule: SuppressRule = { pattern: 'Stripe', reason: 'test Stripe key in fixtures' };
    const result = applySuppressions([stripeFinding, githubFinding], [rule], TODAY);
    expect(result.active).toHaveLength(1);
    expect(result.active[0]).toBe(githubFinding);
    expect(result.suppressed[0].finding).toBe(stripeFinding);
  });

  it('first matching rule wins — does not double-suppress', () => {
    const finding = makeFinding();
    const rule1: SuppressRule = { reason: 'first rule' };
    const rule2: SuppressRule = { reason: 'second rule' };
    const result = applySuppressions([finding], [rule1, rule2], TODAY);
    expect(result.suppressed).toHaveLength(1);
    expect(result.suppressed[0].rule).toBe(rule1);
  });

  it('does not suppress when rule is expired', () => {
    const finding = makeFinding();
    const rule: SuppressRule = { reason: 'old suppression', until: YESTERDAY };
    const result = applySuppressions([finding], [rule], TODAY);
    expect(result.active).toHaveLength(1);
    expect(result.suppressed).toHaveLength(0);
  });

  it('collects expired rules in expiredRules', () => {
    const rule: SuppressRule = { reason: 'expired', until: YESTERDAY };
    const result = applySuppressions([], [rule], TODAY);
    expect(result.expiredRules).toHaveLength(1);
    expect(result.expiredRules[0]).toBe(rule);
  });

  it('a rule expiring today is still active (not expired)', () => {
    const finding = makeFinding();
    const rule: SuppressRule = { reason: 'expires today', until: TODAY };
    const result = applySuppressions([finding], [rule], TODAY);
    expect(result.active).toHaveLength(0);
    expect(result.suppressed).toHaveLength(1);
    expect(result.expiredRules).toHaveLength(0);
  });

  it('rules with empty reason never suppress (invalid rules are skipped)', () => {
    const finding = makeFinding();
    const rule: SuppressRule = { reason: '' };
    const result = applySuppressions([finding], [rule], TODAY);
    expect(result.active).toHaveLength(1);
    expect(result.suppressed).toHaveLength(0);
  });

  it('mixed: some suppressed, some active, some expired rules', () => {
    const bundleFinding = makeFinding({ type: 'pattern-match', patternName: 'Stripe Secret Key' });
    const nextDataFinding = makeFinding({ type: 'next-data', patternName: 'AWS Access Key ID' });
    const middlewareFinding = makeFinding({ type: 'middleware-secret', patternName: 'GitHub Token' });

    const rules: SuppressRule[] = [
      { surface: 'next-data', reason: 'migrating this page', until: TOMORROW },
      { reason: 'old blanket suppression', until: YESTERDAY },
    ];

    const result = applySuppressions(
      [bundleFinding, nextDataFinding, middlewareFinding],
      rules,
      TODAY,
    );

    expect(result.active).toHaveLength(2); // bundle + middleware (expired rule doesn't suppress them)
    expect(result.suppressed).toHaveLength(1); // next-data
    expect(result.suppressed[0].finding).toBe(nextDataFinding);
    expect(result.expiredRules).toHaveLength(1);
    expect(result.expiredRules[0].reason).toBe('old blanket suppression');
  });

  it('does not mutate the input findings array', () => {
    const findings = [makeFinding()];
    const original = [...findings];
    applySuppressions(findings, [{ reason: 'ok' }], TODAY);
    expect(findings).toEqual(original);
  });
});
