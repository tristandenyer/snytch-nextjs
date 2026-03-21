# Changelog

All notable changes to `@snytch/nextjs` are documented here.

---

## [0.1.0] — 2026-03-20

Initial release, built across three phases.

---

### Phase 1 — Bundle Scanner (`snytch scan`)

- **`snytch scan`** CLI command: crawls `.next/static/chunks` and `.next/static/css` post-build, scans every JS and CSS file for secrets baked into client-side bundles.
- Pattern library (`src/patterns.ts`): detects AWS Access Key IDs, Stripe live secret keys, Anthropic API keys, NPM tokens, GitHub tokens, JWT tokens, and generic high-entropy strings.
- Per-finding output: file path, character offset, truncated value (max 8 chars + `•••`), severity (`critical` / `warn`), and pattern name.
- Deduplication: same pattern + value within a single file is reported once.
- `--fail-on` flag: exits with code 1 when findings at or above the specified severity are found (`critical` | `warn` | `none`).
- `--json` flag: emits structured JSON to stdout for CI consumption.
- `--report` flag: generates a self-contained HTML report at `./snytch-report.html`.
- Terminal formatter (`src/output.ts`): colour-coded, scannable output via `chalk`.
- HTML report generator (`src/report.ts`): no external dependencies, single-file output.
- Full Vitest test suite covering pattern matching, deduplication, edge cases (missing directory, empty files, binary content, large files, subdirectory recursion), truncation invariants, and scanned-file counts.

---

### Phase 2 — NEXT_PUBLIC_ Exposure Detection (`snytch check`)

- **`snytch check`** CLI command: reads `.env`, `.env.local`, `.env.development`, and `.env.production` files and flags any `NEXT_PUBLIC_` variable whose value looks like a secret.
- `.env` parser (`src/parser.ts`): handles quoted values (single and double), comment lines, blank lines, and `KEY=VALUE` pairs.
- Rules engine (`src/rules.ts`): applies the same pattern library as `scan`, plus `isHighEntropy()` heuristic for values that don't match a known pattern but are suspiciously random.
- `serverOnly` config support (`snytch.config.json`): lists variables that must never be exposed to the client — any `NEXT_PUBLIC_` variable in this list is flagged regardless of value.
- `--envFiles` option: explicitly specify which env files to scan; falls back to auto-detection when omitted or passed as empty.
- Per-finding output: variable name, env file name, line number, truncated value, severity, and reason (`pattern-match` | `high-entropy` | `serverOnly`).
- `loadConfig` (`src/config.ts`): reads `snytch.config.json` from project root; returns `null` gracefully when absent.
- Full Vitest test suite covering no-findings cases, pattern-match detection, serverOnly enforcement, multi-file scanning, edge cases (empty files, comment-only files, quoted values), and explicit `envFiles` option.

---

### Phase 3 — Environment Diff, AI RCA, MCP Server, and CI (`snytch diff`)

- **`snytch diff`** CLI command: compares two env file snapshots and classifies each variable change as `added`, `removed`, `changed`, or `unchanged`.
- Diff engine (`src/diff.ts`): pure function, no I/O — accepts two `Record<string, string>` maps and returns typed `DiffEntry[]`.
- Git log integration (`src/gitlog.ts`): `getRecentCommits()` retrieves the last N commits touching a given env file; `isGitRepo()` detects whether the project is inside a git repository.
- AI RCA report (`src/rca.ts`): when `--report` is passed and `ANTHROPIC_API_KEY` is set, calls the Anthropic API to generate a what/when/how/fix analysis for each finding. Falls back gracefully when the key is absent or the API is unavailable.
- MCP server (`src/mcp.ts`): exposes `snytch_scan`, `snytch_check`, and `snytch_diff` as MCP tools so the package can be used as a context provider inside Cursor, Windsurf, and Claude Code.
- GitHub Actions workflow template (`.github/workflows/snytch.yml`): drop-in CI workflow that runs `snytch scan` and `snytch check` on every push and pull request.
- Full Vitest test suite for diff engine, git log utilities, RCA report generator (with Anthropic SDK mocked), MCP server tool registration, and CLI diff command formatting.

---

### Infrastructure

- TypeScript 5.x in strict mode, ESM (`"type": "module"`), Node.js ≥ 18.
- ESLint flat config (`eslint.config.js`) with `typescript-eslint` and `eslint-config-prettier`.
- Prettier (`.prettierrc.json`): single quotes, trailing commas, 100-char line width.
- `npm run lint` / `npm run lint:fix` / `npm run format` / `npm run typecheck` scripts.
- `prepublishOnly` hook runs `tsc` before every publish.
- Zero prod dependencies beyond `chalk`, `@anthropic-ai/sdk` (optional, only used when `ANTHROPIC_API_KEY` is present), and `@modelcontextprotocol/sdk`.
