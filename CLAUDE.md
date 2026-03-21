# snytch-nextjs — Claude Code Instructions

## 0. Package Identity (CRITICAL — never violate)

The package name is **`@snytch/nextjs`** (with the `js` suffix).

- **NEVER** use `@snytch/next` (without `js`) in any source file, comment, string, import, or generated output.
- The CLI binary is `snytch` (no suffix).
- This is a **security tool**. It must itself be beyond reproach: no secrets, no unsafe code, no sloppy patterns.

---

## 1. Technical Stack

| Concern        | Choice                       |
| -------------- | ---------------------------- |
| Language       | TypeScript 5.x — strict mode |
| Module system  | ESM (`"type": "module"`)     |
| Target         | ES2022                       |
| Runtime        | Node.js ≥ 18                 |
| Testing        | Vitest                       |
| Linting        | ESLint + Prettier            |

---

## 2. Project Structure

```
src/                  TypeScript source files
src/commands/         One file per CLI sub-command (scan, check, diff, …)
src/tests/            Vitest test files — co-located with src, NOT a top-level tests/ dir
dist/                 Compiled output — NEVER edit manually
```

- `package.json` must maintain `exports`, `main`, `module`, and `types` fields in sync after every change.
- The `files` field in `package.json` must include **only** `dist/` and `README.md`. Run `npm pack --dry-run` to verify.

---

## 3. TypeScript Rules (no exceptions)

- **No `any`** — ever. Use `unknown` and narrow it.
- **No type assertions** (`as Foo`) unless the narrowing is provably correct and a comment explains why.
- **No `@ts-ignore` or `@ts-expect-error`** without a comment explaining the exact reason.
- **No non-null assertions** (`value!`) unless a guard above guarantees non-null.
- All exported functions, types, and interfaces must have **JSDoc comments** that include:
  - A one-line summary.
  - `@param` for each parameter that isn't self-evident.
  - `@returns` describing the return value.
  - `@throws` if the function can throw (with the condition).
- Prefer **pure functions** with no side effects. Side-effectful functions (I/O, process.exit) belong in CLI entry points only.
- **No `process.exit`** outside of `src/cli.ts`.

---

## 4. ESM Import Discipline

- All relative imports **must** use the `.js` extension — even when importing `.ts` source files.
  - ✅ `import { foo } from './utils.js';`
  - ❌ `import { foo } from './utils';`
- Never use `require()`. This is a pure ESM package.
- Never use `__dirname` or `__filename`. Use `import.meta.url` with `fileURLToPath`.

---

## 5. Error Handling

- **Never throw raw strings.** Always throw `new Error('message')` or a typed subclass.
- At CLI boundaries (`src/cli.ts`), catch all errors and emit a clean `console.error` message before `process.exit(1)`. Do not leak stack traces to end-users.
- Internal functions that can fail should either return a typed result or throw a typed `Error`. Document which in JSDoc.
- Never swallow errors silently. If a failure is intentionally ignored (e.g. missing optional file), add a comment explaining why.

---

## 6. Security Standards

This is a security-scanning tool. Its own code must meet the highest standard:

- **Never log, print, or include actual secret values** in any output, report, error message, or test fixture string. Use `truncateValue()` (max 8 chars) for display.
- **Never write secret values to disk.** Reports must only contain truncated values.
- Test fixture values that look like real secrets (Stripe keys, AWS keys, GitHub tokens, etc.) must be syntactically valid fakes — not real credentials — and must not be stored as literal strings that could trigger GitHub push protection. Use string concatenation splits where necessary (e.g. `'xoxb' + '-...'`).
- **No shell injection.** Never interpolate user-controlled input into shell commands or `exec()` calls.
- **No path traversal.** Validate all file paths are within expected directories before reading.
- Regex patterns must be reviewed for **ReDoS** (catastrophic backtracking). Prefer possessive quantifiers or atomic groups where applicable; at minimum, benchmark new patterns against long inputs.

---

## 7. Dependency Rules

This package has **zero runtime dependencies** by design (or the absolute minimum). Before adding any dependency:

1. Confirm it cannot be replaced by a stdlib module or a small inline implementation.
2. Check the dependency's own dependency tree (`npm ls <pkg>`). Reject anything with a large transitive graph.
3. Check for known CVEs: `npm audit`.
4. Only add to `dependencies` if required at runtime. Dev-only tools go to `devDependencies`.
5. Pin or constrain versions appropriately — do not use `*` or unbounded `>=` ranges.

---

## 8. Testing Standards

- **Every exported function must have tests.** No untested public surface area.
- Tests live in `src/tests/` and are named `<module>.test.ts`.
- Use `vi.mock` for all filesystem and process I/O. Tests must never touch the real filesystem.
- Test both the **happy path** and **failure/edge cases** (empty inputs, malformed input, missing files, boundary values).
- Regex pattern tests must include:
  - At least 2 inputs that should match.
  - At least 2 inputs that should **not** match (including near-misses).
  - A test that all patterns have the `g` flag.
- Aim for **meaningful coverage**, not line coverage theater. A test that passes the wrong value is worse than no test.

---

## 9. Validation Checklist (CRITICAL — run before every task is marked complete)

Run these in order. Do not skip any step. Do not mark a task complete if any step fails.

```bash
npm run lint         # ESLint + Prettier
npm run typecheck    # tsc --noEmit
npm test             # Vitest full suite
npm pack --dry-run   # Verify files field — dist/ and README.md only
```

If `npm test` reports any failures, fix them before proceeding. Do not suppress or skip failing tests.

---

## 10. Publishing Rules

Before any version bump or publish:

1. Run the full validation checklist (Section 9).
2. Run `npm run build` to produce a clean `dist/`.
3. Verify `CHANGELOG.md` (or equivalent) is updated with the changes in this version.
4. Run `npm version [patch|minor|major]` — this bumps `package.json` and creates a git tag.
5. Run `npm pack --dry-run` one final time to confirm the tarball contents.
6. Only then: `npm publish --access public`.

Follow **Semantic Versioning (SemVer)**:
- `patch` — bug fixes only, no API changes.
- `minor` — new backwards-compatible features.
- `major` — breaking changes.

---

## 11. Code Review Mindset

Write every line as if a senior security engineer and a TypeScript expert are reviewing it together. Ask yourself:

- Could this leak a secret?
- Could this crash silently?
- Could this be injected into?
- Is the type actually safe, or am I lying to the compiler?
- Would a new contributor understand this in 6 months?

If the answer to any of the first four is "maybe", fix it before moving on.
