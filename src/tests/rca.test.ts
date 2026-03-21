import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Finding, RcaResult } from '../types.js';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockCreate = vi.hoisted(() => vi.fn());

// ── Mock @anthropic-ai/sdk ────────────────────────────────────────────────────

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_opts: unknown) {}
  },
}));

// ── Mock fs ───────────────────────────────────────────────────────────────────

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { readFileSync } from 'fs';
import { generateRcaForFindings } from '../rca.js';
const mockReadFileSync = vi.mocked(readFileSync);

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    type: 'pattern-match',
    patternName: 'Stripe Secret Key',
    severity: 'critical',
    description: 'Stripe secret key detected',
    filePath: '/project/.next/static/chunks/pages/index-abc123.js',
    charOffset: 42,
    truncatedValue: 'sk_live_•••',
    ...overrides,
  };
}

const validRca: RcaResult = {
  what: 'A Stripe secret API key was leaked into the client bundle.',
  when: 'Likely introduced 3 days ago in commit abc1234.',
  how: 'The key was imported from a lib/stripe.ts module that was not guarded by a server-only import.',
  fix: 'Move the Stripe initialisation to a server-only module and remove it from any file imported by client components.',
  codeExample: '// Before\nimport stripe from "../../lib/stripe";\n// After\nimport "server-only";\nimport stripe from "../../lib/stripe";',
  editorPrompts: [
    'Add "server-only" import to lib/stripe.ts to prevent it from being bundled on the client.',
    'Verify that the Stripe secret key no longer appears in .next/static/chunks after running npm run build.',
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockCreate.mockReset();
  mockReadFileSync.mockReset();
  mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { next: '14.2.0' } }));
  process.env['ANTHROPIC_API_KEY'] = 'test-key';
});

afterEach(() => {
  delete process.env['ANTHROPIC_API_KEY'];
});

describe('generateRcaForFindings', () => {
  it('does nothing when provider is "none"', async () => {
    const finding = makeFinding();
    await generateRcaForFindings([finding], '/project', 'none');
    expect(finding.rca).toBeUndefined();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does nothing when there are no critical findings', async () => {
    const warning = makeFinding({ severity: 'warning' });
    await generateRcaForFindings([warning], '/project', 'anthropic');
    expect(warning.rca).toBeUndefined();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('skips when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env['ANTHROPIC_API_KEY'];
    const finding = makeFinding();
    await generateRcaForFindings([finding], '/project', 'anthropic');
    expect(finding.rca).toBeUndefined();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('attaches rca to a critical finding on success', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(validRca) }],
    });

    const finding = makeFinding();
    await generateRcaForFindings([finding], '/project', 'anthropic');

    expect(finding.rca).toBeDefined();
    expect(finding.rca!.what).toBe(validRca.what);
    expect(finding.rca!.editorPrompts).toHaveLength(2);
  });

  it('only analyses critical findings, skips warnings', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(validRca) }],
    });

    const critical = makeFinding({ severity: 'critical' });
    const warning = makeFinding({ severity: 'warning' });

    await generateRcaForFindings([critical, warning], '/project', 'anthropic');

    expect(critical.rca).toBeDefined();
    expect(warning.rca).toBeUndefined();
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('leaves rca undefined when the API returns malformed JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json' }],
    });

    const finding = makeFinding();
    await generateRcaForFindings([finding], '/project', 'anthropic');

    expect(finding.rca).toBeUndefined();
  });

  it('leaves rca undefined when the API response is missing required fields', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ what: 'partial' }) }],
    });

    const finding = makeFinding();
    await generateRcaForFindings([finding], '/project', 'anthropic');

    expect(finding.rca).toBeUndefined();
  });

  it('leaves rca undefined when the API call throws', async () => {
    mockCreate.mockRejectedValue(new Error('rate limit'));

    const finding = makeFinding();
    await generateRcaForFindings([finding], '/project', 'anthropic');

    expect(finding.rca).toBeUndefined();
  });

  it('processes multiple critical findings independently', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify(validRca) }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify({ ...validRca, what: 'Second finding' }) }] });

    const f1 = makeFinding({ patternName: 'Stripe Key' });
    const f2 = makeFinding({ patternName: 'AWS Secret' });

    await generateRcaForFindings([f1, f2], '/project', 'anthropic');

    expect(f1.rca?.what).toBe(validRca.what);
    expect(f2.rca?.what).toBe('Second finding');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('reads Next.js version from package.json and passes it in the prompt', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { next: '15.1.0' } }));
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(validRca) }],
    });

    const finding = makeFinding();
    await generateRcaForFindings([finding], '/project', 'anthropic');

    expect(mockCreate).toHaveBeenCalledOnce();
    const call = mockCreate.mock.calls[0][0] as { messages: { content: string }[] };
    expect(call.messages[0].content).toContain('15.1.0');
  });

  it('includes Truncated value in the prompt as context', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(validRca) }],
    });

    const finding = makeFinding({ truncatedValue: 'sk_live_•••' });
    await generateRcaForFindings([finding], '/project', 'anthropic');

    expect(mockCreate).toHaveBeenCalledOnce();
    // The prompt instruction says not to reference the actual value
    const call = mockCreate.mock.calls[0][0] as { messages: { content: string }[] };
    expect(call.messages[0].content).toContain('do NOT reference the actual secret');
  });

  it('includes git context in the prompt when available', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(validRca) }],
    });

    const finding = makeFinding({
      gitContext: {
        sourceFile: '/project/src/lib/stripe.ts',
        log: [],
        likelyCulprit: {
          hash: 'abc1234',
          author: 'Alice',
          email: 'alice@example.com',
          relativeTime: '3 days ago',
          message: 'feat: add stripe integration',
        },
      },
    });

    await generateRcaForFindings([finding], '/project', 'anthropic');

    expect(mockCreate).toHaveBeenCalledOnce();
    const call = mockCreate.mock.calls[0][0] as { messages: { content: string }[] };
    const prompt = call.messages[0].content;
    expect(prompt).toContain('abc1234');
    expect(prompt).toContain('alice@example.com');
    expect(prompt).toContain('feat: add stripe integration');
  });

  it('handles missing content blocks gracefully', async () => {
    mockCreate.mockResolvedValue({ content: [] });

    const finding = makeFinding();
    await generateRcaForFindings([finding], '/project', 'anthropic');

    expect(finding.rca).toBeUndefined();
  });

  it('emits a warning to stderr for the openai provider (not yet implemented)', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const finding = makeFinding();
    await generateRcaForFindings([finding], '/project', 'openai');

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('OpenAI provider is not yet implemented'));
    expect(finding.rca).toBeUndefined();

    stderrSpy.mockRestore();
  });
});
