/**
 * Tests for the __NEXT_DATA__ scanner — uses vi.mock to intercept 'fs' with memfs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// This mock is hoisted. We instantiate Volume and createFsFromVolume here
// and stash the vol on globalThis so test code can call vol.reset().
vi.mock('fs', async () => {
  const { Volume, createFsFromVolume } = await import('memfs');
  const vol = new Volume();
  (globalThis as Record<string, unknown>).__testVol = vol;
  return createFsFromVolume(vol);
});

// Now import the modules under test AFTER the mock is set up.
import type { SnytchConfig } from '../types.js';
import { scanNextData } from '../nextdata.js';
import { PATTERNS } from '../patterns.js';

// Convenience accessor — guaranteed to exist after the mock factory runs.
function getVol() {
  return (globalThis as Record<string, unknown>).__testVol as import('memfs').Volume;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<SnytchConfig> = {}): SnytchConfig {
  return {
    ...overrides,
  };
}

function writeHtmlFile(
  htmlPath: string,
  jsonPayload: Record<string, unknown>,
) {
  const vol = getVol();
  vol.mkdirSync(htmlPath.substring(0, htmlPath.lastIndexOf('/')), { recursive: true });
  const jsonStr = JSON.stringify(jsonPayload);
  const html = `<!DOCTYPE html>
<html>
<body>
<script id="__NEXT_DATA__" type="application/json">${jsonStr}</script>
</body>
</html>`;
  vol.writeFileSync(htmlPath, html);
}

beforeEach(() => {
  getVol().reset();
  // Reset regex lastIndex on all global patterns to avoid stale state between tests
  for (const p of PATTERNS) p.pattern.lastIndex = 0;
});

// ── pattern matching tests ────────────────────────────────────────────────────

describe('scanNextData — pattern matching', () => {
  it('finds an AWS AKIA key in __NEXT_DATA__', () => {
    writeHtmlFile('/project/.next/server/pages/index.html', {
      props: {
        pageProps: {
          apiKey: 'AKIAIOSFODNN7EXAMPLE',
        },
      },
    });

    const findings = scanNextData(
      '/project/.next',
      '/project',
      makeConfig(),
    );

    const finding = findings.find((f) => f.patternName.includes('AKIA'));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('critical');
    expect(finding!.type).toBe('next-data');
  });

  it('finds a Stripe live key in __NEXT_DATA__', () => {
    writeHtmlFile('/project/.next/server/pages/checkout.html', {
      props: {
        pageProps: {
          stripeKey: 'sk_live_abcdefghijklmnopqrstu',
        },
      },
    });

    const findings = scanNextData(
      '/project/.next',
      '/project',
      makeConfig(),
    );

    expect(
      findings.some((f) => f.patternName === 'Stripe Live Secret Key'),
    ).toBe(true);
  });

  it('returns empty array when __NEXT_DATA__ has no secrets', () => {
    writeHtmlFile('/project/.next/server/pages/index.html', {
      props: {
        pageProps: {
          title: 'Hello World',
        },
      },
    });

    const findings = scanNextData(
      '/project/.next',
      '/project',
      makeConfig(),
    );

    expect(findings).toEqual([]);
  });

  it('returns empty array when no __NEXT_DATA__ script tag present', () => {
    const vol = getVol();
    vol.mkdirSync('/project/.next/server/pages', { recursive: true });
    vol.writeFileSync(
      '/project/.next/server/pages/index.html',
      '<html><body>No data script</body></html>',
    );

    const findings = scanNextData(
      '/project/.next',
      '/project',
      makeConfig(),
    );

    expect(findings).toEqual([]);
  });
});

// ── malformed JSON tests ──────────────────────────────────────────────────────

describe('scanNextData — error handling', () => {
  it('returns empty array when JSON is malformed', () => {
    const vol = getVol();
    vol.mkdirSync('/project/.next/server/pages', { recursive: true });
    vol.writeFileSync(
      '/project/.next/server/pages/index.html',
      '<script id="__NEXT_DATA__" type="application/json">{invalid json}</script>',
    );

    const findings = scanNextData(
      '/project/.next',
      '/project',
      makeConfig(),
    );

    expect(findings).toEqual([]);
  });

  it('returns empty array when .next/server/pages directory does not exist', () => {
    const findings = scanNextData(
      '/nonexistent/.next',
      '/nonexistent',
      makeConfig(),
    );

    expect(findings).toEqual([]);
  });
});

// ── serverOnly value matching tests ───────────────────────────────────────────

describe('scanNextData — serverOnly value matching', () => {
  it('finds a serverOnly value in __NEXT_DATA__ with severity critical', () => {
    const vol = getVol();
    vol.mkdirSync('/project/.next/server/pages', { recursive: true });
    vol.mkdirSync('/project', { recursive: true });

    // Write a .env file with a serverOnly variable
    vol.writeFileSync(
      '/project/.env.local',
      'DB_PASSWORD=my_secret_password_12345',
    );

    writeHtmlFile('/project/.next/server/pages/index.html', {
      props: {
        pageProps: {
          dbConfig: 'my_secret_password_12345',
        },
      },
    });

    const findings = scanNextData(
      '/project/.next',
      '/project',
      makeConfig({
        serverOnly: ['DB_PASSWORD'],
      }),
    );

    const finding = findings.find((f) => f.patternName.includes('DB_PASSWORD'));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('critical');
    expect(finding!.type).toBe('next-data');
  });
});

// ── nested and complex __NEXT_DATA__ tests ─────────────────────────────────────

describe('scanNextData — complex payloads', () => {
  it('finds secrets nested deeply in __NEXT_DATA__', () => {
    writeHtmlFile('/project/.next/server/pages/api/users.html', {
      props: {
        pageProps: {
          user: {
            profile: {
              credentials: {
                apiToken: 'AKIAIOSFODNN7EXAMPLE',
              },
            },
          },
        },
      },
    });

    const findings = scanNextData(
      '/project/.next',
      '/project',
      makeConfig(),
    );

    expect(
      findings.some((f) => f.patternName.includes('AKIA')),
    ).toBe(true);
  });

  it('handles multiple HTML files in nested directories', () => {
    writeHtmlFile('/project/.next/server/pages/index.html', {
      props: {
        pageProps: {
          key1: 'AKIAIOSFODNN7EXAMPLE',
        },
      },
    });

    writeHtmlFile('/project/.next/server/pages/admin/index.html', {
      props: {
        pageProps: {
          key2: 'sk_live_abcdefghijklmnopqrstu',
        },
      },
    });

    const findings = scanNextData(
      '/project/.next',
      '/project',
      makeConfig(),
    );

    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings.some((f) => f.patternName.includes('AKIA'))).toBe(true);
    expect(findings.some((f) => f.patternName === 'Stripe Live Secret Key')).toBe(true);
  });
});
