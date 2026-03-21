import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockConnect = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRegisterTool = vi.hoisted(() => vi.fn());

// ── Mock @modelcontextprotocol/sdk/server/mcp.js ──────────────────────────────

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class MockMcpServer {
    registerTool = mockRegisterTool;
    connect = mockConnect;
  },
}));

// ── Mock @modelcontextprotocol/sdk/server/stdio.js ────────────────────────────

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class MockTransport {},
}));

// ── Mock scan, check, diffEnvFiles ────────────────────────────────────────────

const mockScan = vi.hoisted(() => vi.fn());
const mockCheck = vi.hoisted(() => vi.fn());
const mockDiff = vi.hoisted(() => vi.fn());

vi.mock('../commands/scan.js', () => ({ scan: mockScan }));
vi.mock('../commands/check.js', () => ({ check: mockCheck }));
vi.mock('../diff.js', () => ({ diffEnvFiles: mockDiff }));

// ── Import after mocks ────────────────────────────────────────────────────────

import { startMcpServer } from '../mcp.js';
import type { Finding, CheckFinding } from '../types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    type: 'pattern-match',
    patternName: 'Stripe Secret Key',
    severity: 'critical',
    description: 'Stripe secret key detected',
    filePath: '/project/.next/static/chunks/index.js',
    charOffset: 42,
    truncatedValue: 'sk_live_•••',
    ...overrides,
  };
}

function makeCheckFinding(overrides: Partial<CheckFinding> = {}): CheckFinding {
  return {
    varName: 'NEXT_PUBLIC_STRIPE_KEY',
    severity: 'critical',
    reason: 'pattern-match',
    patternName: 'Stripe Secret Key',
    description: 'Stripe key in NEXT_PUBLIC_ variable',
    envFile: '.env.local',
    line: 3,
    truncatedValue: 'sk_test_•••',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockConnect.mockReset();
  mockConnect.mockResolvedValue(undefined);
  mockRegisterTool.mockReset();
  mockScan.mockReset();
  mockCheck.mockReset();
  mockDiff.mockReset();
});

describe('startMcpServer', () => {
  it('registers exactly three tools', async () => {
    mockScan.mockResolvedValue({ findings: [], scannedFiles: 0, durationMs: 1 });
    await startMcpServer();
    expect(mockRegisterTool).toHaveBeenCalledTimes(3);
  });

  it('registers snytch_scan, snytch_check, and snytch_diff', async () => {
    await startMcpServer();
    const names = mockRegisterTool.mock.calls.map((c) => c[0] as string);
    expect(names).toContain('snytch_scan');
    expect(names).toContain('snytch_check');
    expect(names).toContain('snytch_diff');
  });

  it('connects the server to a StdioServerTransport', async () => {
    await startMcpServer();
    expect(mockConnect).toHaveBeenCalledOnce();
  });
});

describe('snytch_scan tool handler', () => {
  /**
   * Extract and call the handler registered for a given tool name.
   */
  async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await startMcpServer();
    const call = mockRegisterTool.mock.calls.find((c) => c[0] === name);
    if (!call) throw new Error(`Tool ${name} was not registered`);
    const handler = call[2] as (args: Record<string, unknown>) => unknown;
    return handler(args);
  }

  it('calls scan() and returns findings + summary', async () => {
    mockScan.mockResolvedValue({
      findings: [makeFinding()],
      scannedFiles: 5,
      durationMs: 100,
    });

    const result = await callTool('snytch_scan', {}) as { content: { text: string }[] };
    const parsed = JSON.parse(result.content[0].text) as {
      findings: Finding[];
      summary: { total: number; critical: number; scannedFiles: number };
    };

    expect(parsed.findings).toHaveLength(1);
    expect(parsed.summary.total).toBe(1);
    expect(parsed.summary.critical).toBe(1);
    expect(parsed.summary.scannedFiles).toBe(5);
  });

  it('strips rca from scan findings before returning', async () => {
    const findingWithRca = makeFinding({
      rca: {
        what: 'A Stripe key',
        when: 'yesterday',
        how: 'imported on client',
        fix: 'use server-only',
        codeExample: '// code',
        editorPrompts: ['fix it', 'verify it'],
      },
    });
    mockScan.mockResolvedValue({ findings: [findingWithRca], scannedFiles: 1, durationMs: 10 });

    const result = await callTool('snytch_scan', {}) as { content: { text: string }[] };
    const parsed = JSON.parse(result.content[0].text) as { findings: unknown[] };
    const f = parsed.findings[0] as Record<string, unknown>;

    expect(f['rca']).toBeUndefined();
    expect(f['truncatedValue']).toBe('sk_live_•••');
  });

  it('passes custom dir to scan()', async () => {
    mockScan.mockResolvedValue({ findings: [], scannedFiles: 0, durationMs: 1 });

    await callTool('snytch_scan', { dir: '/custom/.next' });

    expect(mockScan).toHaveBeenCalledOnce();
    const opts = mockScan.mock.calls[0][0] as { dir: string };
    expect(opts.dir).toContain('/custom/.next');
  });

  it('counts critical and warning findings correctly', async () => {
    mockScan.mockResolvedValue({
      findings: [
        makeFinding({ severity: 'critical' }),
        makeFinding({ severity: 'critical' }),
        makeFinding({ severity: 'warning' }),
      ],
      scannedFiles: 3,
      durationMs: 50,
    });

    const result = await callTool('snytch_scan', {}) as { content: { text: string }[] };
    const parsed = JSON.parse(result.content[0].text) as {
      summary: { critical: number; warning: number };
    };

    expect(parsed.summary.critical).toBe(2);
    expect(parsed.summary.warning).toBe(1);
  });
});

describe('snytch_check tool handler', () => {
  async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await startMcpServer();
    const call = mockRegisterTool.mock.calls.find((c) => c[0] === name);
    if (!call) throw new Error(`Tool ${name} was not registered`);
    const handler = call[2] as (args: Record<string, unknown>) => unknown;
    return handler(args);
  }

  it('calls check() and returns findings + summary', async () => {
    mockCheck.mockResolvedValue({
      findings: [makeCheckFinding()],
      scannedFiles: 2,
      durationMs: 20,
    });

    const result = await callTool('snytch_check', {}) as { content: { text: string }[] };
    const parsed = JSON.parse(result.content[0].text) as {
      findings: CheckFinding[];
      summary: { total: number; critical: number };
    };

    expect(parsed.findings).toHaveLength(1);
    expect(parsed.summary.total).toBe(1);
    expect(parsed.summary.critical).toBe(1);
  });

  it('passes envFiles to check() when supplied', async () => {
    mockCheck.mockResolvedValue({ findings: [], scannedFiles: 1, durationMs: 5 });

    await callTool('snytch_check', { envFiles: ['.env.staging'] });

    const opts = mockCheck.mock.calls[0][0] as { envFiles: string[] };
    expect(opts.envFiles).toEqual(['.env.staging']);
  });

  it('passes undefined envFiles when not supplied', async () => {
    mockCheck.mockResolvedValue({ findings: [], scannedFiles: 0, durationMs: 1 });

    await callTool('snytch_check', {});

    const opts = mockCheck.mock.calls[0][0] as { envFiles: unknown };
    expect(opts.envFiles).toBeUndefined();
  });
});

describe('snytch_diff tool handler', () => {
  async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await startMcpServer();
    const call = mockRegisterTool.mock.calls.find((c) => c[0] === name);
    if (!call) throw new Error(`Tool ${name} was not registered`);
    const handler = call[2] as (args: Record<string, unknown>) => unknown;
    return handler(args);
  }

  it('calls diffEnvFiles() and returns drift, inSync, onlyInOne', async () => {
    mockDiff.mockReturnValue({
      inSync: ['DATABASE_URL'],
      drift: [{ key: 'API_KEY', presentIn: ['.env.staging'], missingFrom: ['.env.production'] }],
      onlyInOne: [],
    });

    const result = await callTool('snytch_diff', {
      envFiles: ['.env.staging', '.env.production'],
    }) as { content: { text: string }[] };

    const parsed = JSON.parse(result.content[0].text) as {
      inSync: string[];
      drift: unknown[];
      onlyInOne: unknown[];
    };

    expect(parsed.inSync).toEqual(['DATABASE_URL']);
    expect(parsed.drift).toHaveLength(1);
    expect(parsed.onlyInOne).toHaveLength(0);
  });

  it('passes resolved absolute paths to diffEnvFiles()', async () => {
    mockDiff.mockReturnValue({ inSync: [], drift: [], onlyInOne: [] });

    await callTool('snytch_diff', { envFiles: ['.env.a', '.env.b'] });

    const files = mockDiff.mock.calls[0][0] as { path: string; label: string }[];
    expect(files[0].label).toBe('.env.a');
    expect(files[1].label).toBe('.env.b');
    // Paths should be absolute
    expect(files[0].path).toMatch(/^\//);
    expect(files[1].path).toMatch(/^\//);
  });

  it('does not include env values in diff output', async () => {
    mockDiff.mockReturnValue({
      inSync: ['SOME_KEY'],
      drift: [],
      onlyInOne: [],
    });

    const result = await callTool('snytch_diff', {
      envFiles: ['.env.a', '.env.b'],
    }) as { content: { text: string }[] };

    // The raw output should contain only key names, not values
    const text = result.content[0].text;
    expect(text).toContain('SOME_KEY');
    // Verify no "value" field appears in the output object
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed['value']).toBeUndefined();
  });
});
