# Changelog

All notable changes to `@snytch/nextjs` are documented here.

---

## [0.5.0] - 2026-03-21

### Added

- **Next.js auth stack patterns**: Clerk secret/publishable keys, Supabase service role key assignment, Convex deploy key. These are the most commonly leaked credentials in Next.js client bundles.
- **Serverless database patterns**: Neon (`.neon.tech` connection strings), Turso (`libsql://` URLs and auth tokens), Upstash (Redis and Kafka REST tokens).
- Pattern count increased from 182 to 192.

---

## [0.4.0] — 2026-03-21

### Security

- Socket.dev supply chain monitoring enabled. The package dependency tree is continuously scanned for malicious packages, install scripts, and other supply chain risks. Badge added to README.

### Added

- **Module graph analysis** (`src/graph.ts`, `src/graphscan.ts`): new `--graph` flag on `snytch scan` parses the Next.js build trace (`.next/trace`) to build a directed module dependency graph and flags any server-only module (listed in `snytch.config.js` `serverOnly`) reachable from a client entry point. Findings carry `type: 'graph-leak'`, `severity: 'warning'`, and a full import chain string in the description (e.g., `app/page.tsx → lib/db.ts → lib/secrets.ts`). This is a structural check — it warns about the import path, not a leaked value.
- `--graph` flag is opt-in. When not passed, `scanModuleGraph` is never called and no `.next/trace` read is attempted.
- Surface label `[import chain]` in terminal output; `· import chain` label and dedicated `chain:` row (instead of `col`/`value`) in HTML report findings cards.
- `graph-leak` added to `FindingType` union in `src/types.ts`; `graph?: boolean` added to `ScanOptions`.
- Synthetic `graph-leak` finding added to `snytch demo` output to showcase the new surface.

---

## [0.3.0] — 2026-03-21

### Added

- **Source map scanner** (`src/sourcemapscan.ts`): `snytch scan` now scans `.next/static/chunks/*.js.map` for secrets embedded in the `sourcesContent` array — the pre-minification source code stored by webpack/turbopack at build time. Secrets present at build time appear here even if tree-shaking removed them from the live bundle. Findings carry `type: 'sourcemap-secret'` and `severity: 'warning'` (never critical, since the value may not be reachable at runtime).
- **Source map deduplication**: if a secret value is found in both the live bundle and a source map, the source map duplicate is dropped. The live bundle finding (already critical) takes precedence and the source map copy adds no new signal.
- Surface label `[source map]` in terminal output and `· source map` in HTML report findings cards for source map findings.
- `serverOnly` value matching in source maps: env vars listed in `snytch.config.js` `serverOnly` are now also checked against `sourcesContent`, consistent with the live bundle scanner.

---

## [0.2.0] — 2026-03-21

### Added

- **`__NEXT_DATA__` scanner** (`src/nextdata.ts`): `snytch scan` now scans `.next/server/pages/*.html` for secrets embedded in the `__NEXT_DATA__` JSON block by `getStaticProps` and `getServerSideProps`. Findings carry `type: 'next-data'`.
- **`next.config.js` env block scanner** (`src/configscan.ts`): `snytch scan` now reads `next.config.js` (and `.mjs` / `.ts` variants), extracts the `env` block, and flags values matching secret patterns or keys listed in `serverOnly`. Findings carry `type: 'config-env'`. Catches the issue at the config level — earlier than the bundle scanner.
- **Edge middleware scanner** (`src/middlewarescan.ts`): `snytch scan` now scans `.next/server/middleware.js` for secrets. Edge middleware is not client-side JS but secrets there are still a security risk. Findings carry `type: 'middleware-secret'`.
- Surface labels in terminal output: each finding now shows its origin (`[client bundle]`, `[__NEXT_DATA__]`, `[next.config env]`, `[edge middleware]`) for faster triage.
- Surface labels in HTML report: each finding card now includes the surface type as a subtitle (e.g., `· next.config env`).
- **Config-level suppression rules** (`src/suppress.ts`): add a `suppress` array to `snytch.config.js` to silence known-safe findings. Each rule requires a `reason` field and optionally accepts a `pattern`, `surface`, and `until` (ISO-8601 expiry date). Rules with an expired `until` date are surfaced as warnings rather than silently ignored.
- **Suppressions tab in HTML report**: the scan report now includes a third tab listing all suppressed findings alongside the rule that matched each one. Expired rules are highlighted in amber. The tab is omitted (not shown as "(0)") when there are no suppressions.
- **Suppression summary in terminal output**: `snytch scan` now prints a one-line count of suppressed findings after the findings block, with a hint to run `--report` to see details. Expired suppression rules print a separate amber warning.
- **`addedBy` field on suppression rules**: optional field to record who added the rule — a name, username, or email. Shown in the Suppressions tab so others know who to ask about it.

---

## [0.1.5] — 2026-03-21

### Security

- Fixed shell injection in `gitlog.ts`: replaced `execSync` with interpolated shell string with `spawnSync` + args array. No user-controlled input was reachable in practice, but the pattern violated the tool's own security standards.
- Fixed shell injection in `report.ts`: replaced all three `execSync` browser-open calls with `spawnSync` + args array.
- Fixed potential secret leakage in AI RCA prompts: commit messages are now sanitized with `stripSecretValues` before being sent to the AI provider.

### Tests

- Updated `gitlog.test.ts` to mock `spawnSync` instead of `execSync` for `getGitLog` tests, matching the refactored implementation.

---

## [0.1.4] — 2026-03-21

### Fixed

- README screenshots now use absolute `raw.githubusercontent.com` URLs so they render correctly on the npm package page.

### Changed

- Updated features list to accurately reflect 170+ patterns across all covered categories (AI/ML keys, auth providers, monitoring tools, and high-entropy heuristics were previously unlisted).

---

## [0.1.3] — 2026-03-21

### Changed

- Improved description for **Environment Variable with Secret Value** warning — now explicitly notes it may be a false positive from URL parsers or framework internals, so users can self-triage without needing external help.

---

## [0.1.2] — 2026-03-21

### Fixed

- Removed **Vault Root Token** pattern (`s\.[a-zA-Z0-9_-]{20,}`) — matched any minified JS property access where the name exceeded 20 characters, producing critical false positives on every Next.js/Turbopack bundle.
- Removed **Slack Workspace Token** pattern (`T[A-Z0-9]{8,}`) — matched `TURBOPACK` and any uppercase word starting with T, firing a warning on every chunk file. Real Slack secrets are already covered by the xoxb/xoxp/xoxa/webhook patterns.
- Tightened **Environment Variable with Secret Value** pattern — removed `key` from the keyword list (matched React's minified `Key:` prop), restricted to `=` assignment only (`:` is object literal syntax), cleaned up quote matching. Previously fired on `Key:"UniqueValue"` and similar minified React internals.
- Report files now written to `snytch-reports/` directory instead of the project root, making them easy to exclude with a single `.gitignore` entry.
- README usage examples replaced with concrete copy-pasteable commands — the previous `[--option value|other]` synopsis syntax was interpreted as glob patterns by zsh and caused errors when copied directly.

---

## [0.1.1] — 2026-03-20

### Added

- **OpenAI provider support** — `--ai-provider openai` now generates AI RCA using GPT-4o when `OPENAI_API_KEY` is set. The provider accepts either `ANTHROPIC_API_KEY` (Claude) or `OPENAI_API_KEY` (GPT-4o); behaviour is identical from the user's perspective.
- `rca.maxTokens` config option in `snytch.config.js` — allows projects to override the default 2048-token cap for AI RCA responses.
- HTML report subtitles — each report heading now includes a one-line description of what the report covers.
- `snytch demo` documented in README with instructions for running with a real API key to populate the AI RCA tab.

### Changed

- Removed the **Env Drift** tab from `snytch-report.html` — it was structurally unpopulable from `snytch scan` and was always shown empty.
- Updated `--ai-provider` description in README to list all three values (`anthropic`, `openai`, `none`) and their required env vars.

### Fixed

- AI RCA JSON parse failures caused by the model returning literal newlines inside string values — prompt now explicitly requires `\n` escape sequences, and `max_tokens` raised from 1024 → 2048 to prevent mid-response truncation.
- Markdown code fences in model responses are stripped before `JSON.parse` to handle models that wrap output despite instructions.

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
