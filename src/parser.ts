import { EnvEntry } from './types.js';

/**
 * Truncate a value for safe logging — never expose more than 8 chars.
 */
export function truncateValue(value: string): string {
  return value.substring(0, 8) + '•••';
}

/**
 * Parse the raw string content of a .env file into an array of EnvEntry.
 *
 * Supports:
 *  - Comments: lines starting with # (and inline # outside quotes)
 *  - Quoted values: single or double quotes
 *  - Backslash continuation: line ending with unquoted \ joins next line
 *  - Values containing = signs (only the first = is the separator)
 *  - Empty values: KEY= → { key: "KEY", value: "" }
 *  - export prefix: export KEY=value → key is "KEY"
 *
 * Never throws. Malformed lines are skipped silently.
 *
 * @param content  Raw file content string.
 * @param filePath Passed through to each EnvEntry's .file field.
 */
export function parseEnvFileContent(content: string, filePath: string): EnvEntry[] {
  const entries: EnvEntry[] = [];

  // Split into raw lines (keep original indices for line numbers)
  const rawLines = content.split('\n');
  let i = 0;

  while (i < rawLines.length) {
    const startLine = i + 1; // 1-based
    let line = rawLines[i];
    i++;

    // Collapse backslash continuations.
    // A line ending with a single \ (not \\) continues to the next line.
    // We only do this for unquoted context — we resolve quoting below, so
    // here we check mechanically: does the raw line end with odd-number of \?
    while (endsWithContinuation(line) && i < rawLines.length) {
      // Remove the trailing backslash and append next line
      line = line.slice(0, -1) + rawLines[i];
      i++;
    }

    // Strip trailing \r
    line = line.replace(/\r$/, '');

    // Trim leading whitespace
    const trimmed = line.trimStart();

    // Skip blank lines and full-line comments
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Strip optional `export ` prefix (case-sensitive per dotenv convention)
    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7).trimStart() : trimmed;

    // Find the first `=` to split key and value
    const eqIdx = withoutExport.indexOf('=');
    if (eqIdx === -1) continue; // no = sign — skip

    const key = withoutExport.slice(0, eqIdx).trim();
    if (key === '' || /\s/.test(key)) continue; // invalid key — skip

    const rawValue = withoutExport.slice(eqIdx + 1);
    const value = parseValue(rawValue);

    entries.push({ key, value, file: filePath, line: startLine });
  }

  return entries;
}

/**
 * Returns true if the line ends with an odd number of backslashes
 * (meaning the last one is an unescaped continuation marker).
 */
function endsWithContinuation(line: string): boolean {
  let count = 0;
  let j = line.length - 1;
  while (j >= 0 && line[j] === '\\') {
    count++;
    j--;
  }
  return count % 2 === 1;
}

/**
 * Parse the raw value portion (everything after the first `=`).
 * Handles: quoted strings (strip outer quotes), inline comments outside quotes.
 */
function parseValue(raw: string): string {
  // Detect if value starts with a quote character
  const first = raw[0];

  if (first === '"' || first === "'") {
    // Find the matching closing quote, respecting backslash escapes inside
    const close = findClosingQuote(raw, first);
    if (close !== -1) {
      // Quoted value: extract content between quotes, strip backslash-escapes
      return unescapeQuoted(raw.slice(1, close));
    }
    // No closing quote found — treat entire raw string as literal
    return raw;
  }

  // Unquoted: strip inline comment (# preceded by whitespace)
  // e.g.  KEY=value # comment  →  "value"
  const stripped = stripInlineComment(raw);
  return stripped.trim();
}

/**
 * Find the index of the closing quote character in `raw`, starting from index 1
 * (i.e., raw[0] is the opening quote). Handles `\"` and `\'` escapes.
 * Returns -1 if no closing quote is found.
 */
function findClosingQuote(raw: string, quote: string): number {
  let j = 1;
  while (j < raw.length) {
    if (raw[j] === '\\') {
      j += 2; // skip escaped character
      continue;
    }
    if (raw[j] === quote) return j;
    j++;
  }
  return -1;
}

/**
 * Strip a backslash-escape sequence from a quoted value.
 * Only processes `\"`, `\'`, `\\`. Other escape sequences (e.g. `\n`) are
 * kept as-is (literal two characters), matching standard dotenv behaviour.
 */
function unescapeQuoted(inner: string): string {
  return inner.replace(/\\(["'\\])/g, '$1');
}

/**
 * Remove an inline comment from an unquoted value.
 * A comment starts at the first ` #` (space + hash) sequence.
 */
function stripInlineComment(raw: string): string {
  // Walk character by character; an unquoted ` #` ends the value.
  for (let j = 0; j < raw.length - 1; j++) {
    if (raw[j] === ' ' && raw[j + 1] === '#') {
      return raw.slice(0, j);
    }
  }
  return raw;
}
