/**
 * Tests for parseEnvFileContent and truncateValue in src/parser.ts
 */
import { describe, it, expect } from 'vitest';
import { parseEnvFileContent, truncateValue } from '../parser.js';

// ── truncateValue ─────────────────────────────────────────────────────────────

describe('truncateValue', () => {
  it('returns first 8 chars + •••', () => {
    expect(truncateValue('sk_live_abcdefghijklmnopqrstu')).toBe('sk_live_•••');
  });

  it('short value still appends •••', () => {
    expect(truncateValue('abc')).toBe('abc•••');
  });

  it('exactly 8 chars produces 8-char prefix', () => {
    expect(truncateValue('12345678extra')).toBe('12345678•••');
  });

  it('empty string produces just •••', () => {
    expect(truncateValue('')).toBe('•••');
  });
});

// ── basic key=value ───────────────────────────────────────────────────────────

describe('parseEnvFileContent — basic', () => {
  it('parses a simple KEY=value pair', () => {
    const entries = parseEnvFileContent('FOO=bar\n', '/project/.env');
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe('FOO');
    expect(entries[0].value).toBe('bar');
  });

  it('assigns correct file path', () => {
    const entries = parseEnvFileContent('A=b\n', '/project/.env.local');
    expect(entries[0].file).toBe('/project/.env.local');
  });

  it('assigns correct 1-based line number', () => {
    const entries = parseEnvFileContent('FIRST=1\nSECOND=2\n', '/p/.env');
    expect(entries[0].line).toBe(1);
    expect(entries[1].line).toBe(2);
  });

  it('parses multiple entries', () => {
    const content = 'A=1\nB=2\nC=3\n';
    const entries = parseEnvFileContent(content, '/p/.env');
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.key)).toEqual(['A', 'B', 'C']);
  });

  it('handles empty value (KEY=)', () => {
    const entries = parseEnvFileContent('EMPTY=\n', '/p/.env');
    expect(entries[0].value).toBe('');
  });

  it('handles value containing = signs (first = is separator)', () => {
    const entries = parseEnvFileContent('URL=https://example.com?a=1&b=2\n', '/p/.env');
    expect(entries[0].key).toBe('URL');
    expect(entries[0].value).toBe('https://example.com?a=1&b=2');
  });
});

// ── comments ──────────────────────────────────────────────────────────────────

describe('parseEnvFileContent — comments', () => {
  it('skips full-line comment', () => {
    const entries = parseEnvFileContent('# this is a comment\nFOO=bar\n', '/p/.env');
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe('FOO');
  });

  it('skips blank lines', () => {
    const entries = parseEnvFileContent('\nFOO=bar\n\n', '/p/.env');
    expect(entries).toHaveLength(1);
  });

  it('strips inline comment from unquoted value', () => {
    const entries = parseEnvFileContent('FOO=bar # this is a comment\n', '/p/.env');
    expect(entries[0].value).toBe('bar');
  });

  it('does not strip hash that is not preceded by a space', () => {
    const entries = parseEnvFileContent('TAG=v1.0#release\n', '/p/.env');
    expect(entries[0].value).toBe('v1.0#release');
  });

  it('strips inline comment with leading whitespace in value', () => {
    const entries = parseEnvFileContent('FOO=value # comment here\n', '/p/.env');
    expect(entries[0].value).toBe('value');
  });
});

// ── quoted values ─────────────────────────────────────────────────────────────

describe('parseEnvFileContent — quoted values', () => {
  it('strips double quotes from value', () => {
    const entries = parseEnvFileContent('SECRET="mysecretvalue"\n', '/p/.env');
    expect(entries[0].value).toBe('mysecretvalue');
  });

  it('strips single quotes from value', () => {
    const entries = parseEnvFileContent("SECRET='mysecretvalue'\n", '/p/.env');
    expect(entries[0].value).toBe('mysecretvalue');
  });

  it('preserves # inside double-quoted value (not a comment)', () => {
    const entries = parseEnvFileContent('FOO="value#with#hash"\n', '/p/.env');
    expect(entries[0].value).toBe('value#with#hash');
  });

  it('preserves spaces inside double-quoted value', () => {
    const entries = parseEnvFileContent('MSG="hello world"\n', '/p/.env');
    expect(entries[0].value).toBe('hello world');
  });

  it('preserves spaces inside single-quoted value', () => {
    const entries = parseEnvFileContent("MSG='hello world'\n", '/p/.env');
    expect(entries[0].value).toBe('hello world');
  });

  it('handles escaped double-quote inside double-quoted value', () => {
    const entries = parseEnvFileContent('FOO="say \\"hello\\""\n', '/p/.env');
    expect(entries[0].value).toBe('say "hello"');
  });

  it('handles escaped single-quote inside single-quoted value', () => {
    const entries = parseEnvFileContent("FOO='it\\'s fine'\n", '/p/.env');
    expect(entries[0].value).toBe("it's fine");
  });

  it('handles escaped backslash inside quoted value', () => {
    const entries = parseEnvFileContent('FOO="path\\\\value"\n', '/p/.env');
    expect(entries[0].value).toBe('path\\value');
  });

  it('keeps \\n as literal two chars (not a newline) inside quoted value', () => {
    const entries = parseEnvFileContent('FOO="line\\nbreak"\n', '/p/.env');
    expect(entries[0].value).toBe('line\\nbreak');
  });

  it('falls back to raw string when closing quote is missing', () => {
    const entries = parseEnvFileContent('FOO="no closing quote\n', '/p/.env');
    expect(entries[0].value).toBe('"no closing quote');
  });

  it('empty quoted value produces empty string', () => {
    const entries = parseEnvFileContent('FOO=""\n', '/p/.env');
    expect(entries[0].value).toBe('');
  });
});

// ── export prefix ─────────────────────────────────────────────────────────────

describe('parseEnvFileContent — export prefix', () => {
  it('strips "export " prefix from key', () => {
    const entries = parseEnvFileContent('export MY_VAR=myvalue\n', '/p/.env');
    expect(entries[0].key).toBe('MY_VAR');
    expect(entries[0].value).toBe('myvalue');
  });

  it('strips "export " with extra spaces before key', () => {
    const entries = parseEnvFileContent('export   SPACED=value\n', '/p/.env');
    expect(entries[0].key).toBe('SPACED');
  });

  it('does not strip "EXPORT " (case-sensitive)', () => {
    // EXPORT is not stripped; key becomes "EXPORT" and there is no = sign after
    // Actually "EXPORT KEY=val" — key would be "EXPORT KEY" which has whitespace → skip
    const entries = parseEnvFileContent('EXPORT MYVAR=value\n', '/p/.env');
    expect(entries).toHaveLength(0);
  });
});

// ── backslash continuation ────────────────────────────────────────────────────

describe('parseEnvFileContent — backslash continuation', () => {
  it('joins two lines via backslash continuation', () => {
    const content = 'MULTI=hello \\\nworld\n';
    const entries = parseEnvFileContent(content, '/p/.env');
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe('MULTI');
    expect(entries[0].value).toBe('hello world');
  });

  it('reports starting line number of continued entry', () => {
    const content = 'A=1\nMULTI=hello \\\nworld\nB=2\n';
    const entries = parseEnvFileContent(content, '/p/.env');
    const multi = entries.find((e) => e.key === 'MULTI');
    expect(multi?.line).toBe(2);
  });

  it('double backslash is escaped, not a continuation', () => {
    const content = 'FOO=bar\\\\\nBAZ=baz\n';
    const entries = parseEnvFileContent(content, '/p/.env');
    // FOO=bar\\ → value contains bar\\, then BAZ is a separate entry
    expect(entries).toHaveLength(2);
    expect(entries[0].key).toBe('FOO');
    expect(entries[1].key).toBe('BAZ');
  });
});

// ── malformed lines ───────────────────────────────────────────────────────────

describe('parseEnvFileContent — malformed lines (never throw)', () => {
  it('skips line with no = sign', () => {
    const entries = parseEnvFileContent('NOEQUALSIGN\nFOO=bar\n', '/p/.env');
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe('FOO');
  });

  it('skips line with whitespace in key', () => {
    const entries = parseEnvFileContent('KEY WITH SPACES=value\nGOOD=ok\n', '/p/.env');
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe('GOOD');
  });

  it('skips empty key (=value)', () => {
    const entries = parseEnvFileContent('=value\nFOO=bar\n', '/p/.env');
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe('FOO');
  });

  it('never throws on completely empty content', () => {
    expect(() => parseEnvFileContent('', '/p/.env')).not.toThrow();
    expect(parseEnvFileContent('', '/p/.env')).toHaveLength(0);
  });

  it('never throws on content with only comments', () => {
    expect(() => parseEnvFileContent('# comment\n# another\n', '/p/.env')).not.toThrow();
  });

  it('never throws on binary-like content', () => {
    expect(() => parseEnvFileContent('\x00\x01\x02KEY=\xff\xfe\n', '/p/.env')).not.toThrow();
  });

  it('handles \\r\\n line endings (Windows)', () => {
    const entries = parseEnvFileContent('FOO=bar\r\nBAZ=qux\r\n', '/p/.env');
    expect(entries).toHaveLength(2);
    expect(entries[0].value).toBe('bar');
    expect(entries[1].value).toBe('qux');
  });

  it('handles content with no trailing newline', () => {
    const entries = parseEnvFileContent('FOO=bar', '/p/.env');
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe('bar');
  });
});

// ── whitespace trimming ───────────────────────────────────────────────────────

describe('parseEnvFileContent — whitespace', () => {
  it('trims leading whitespace from line', () => {
    const entries = parseEnvFileContent('  FOO=bar\n', '/p/.env');
    expect(entries[0].key).toBe('FOO');
  });

  it('trims whitespace around key (before =)', () => {
    const entries = parseEnvFileContent('FOO =bar\n', '/p/.env');
    expect(entries[0].key).toBe('FOO');
  });

  it('trims trailing whitespace from unquoted value', () => {
    const entries = parseEnvFileContent('FOO=bar   \n', '/p/.env');
    expect(entries[0].value).toBe('bar');
  });

  it('does NOT trim whitespace from quoted value', () => {
    const entries = parseEnvFileContent('FOO="  bar  "\n', '/p/.env');
    expect(entries[0].value).toBe('  bar  ');
  });
});
