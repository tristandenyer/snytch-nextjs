# @snytch/nextjs

Bundle scanning, secret detection, and environment exposure analysis for Next.js applications.

## Installation

```bash
npm install -D @snytch/nextjs
```

## Commands

### `snytch scan`

Scan the compiled Next.js bundle for leaked secrets in client-side JavaScript.

```bash
snytch scan [--dir ./.next] [--json] [--report] [--fail-on critical|warning|all] [--ai-provider anthropic|openai|none]
```

| Option | Default | Description |
|---|---|---|
| `--dir` | `./.next` | Path to the `.next` directory |
| `--json` | off | Output results as JSON |
| `--report` | off | Generate an HTML report at `./snytch-report.html` |
| `--fail-on` | `critical` | Exit code threshold: `critical`, `warning`, or `all` |
| `--ai-provider` | `anthropic` | AI RCA provider: `anthropic` (requires `ANTHROPIC_API_KEY`) or `openai` (requires `OPENAI_API_KEY`) or `none` |

### `snytch check`

Check `.env` files for `NEXT_PUBLIC_` variables that look like secrets.

```bash
snytch check [--env .env.local] [--json] [--report] [--fail-on critical|warning|all]
```

`--env` may be repeated to check multiple files:

```bash
snytch check --env .env.local --env .env.production
```

### `snytch diff`

Compare environment variable key presence across two or more `.env` files.

```bash
snytch diff --env .env.staging --env .env.production [--json] [--report] [--strict]
```

`--env` may be repeated for more than two files:

```bash
snytch diff --env .env.staging --env .env.production --env .env.local
```

| Option | Default | Description |
|---|---|---|
| `--strict` | off | Exit 1 for any drift, not just `serverOnly` keys |

### `snytch mcp`

Start the snytch MCP server on stdio transport. Exposes `snytch_scan`, `snytch_check`, and `snytch_diff` as tools inside any MCP-compatible editor.

```bash
snytch mcp
```

---

### `snytch demo`

Runs a fully synthetic end-to-end demonstration of all three commands — `scan`, `check`, and `diff` — using fake findings that cover the full range of severity levels and pattern types. Output is identical to a real run: the same formatters, the same exit code (1), and real HTML reports written to disk.

```bash
snytch demo
```

Three report files are generated in your current directory:

| File | Contents |
|---|---|
| `snytch-report.html` | Bundle scan findings with Findings and AI RCA tabs |
| `snytch-check-report.html` | `NEXT_PUBLIC_` exposure findings |
| `snytch-diff-report.html` | Environment variable drift across `.env` files |

To see the AI RCA tab populated with real analysis, set an API key before running:

```bash
# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-... snytch demo

# OpenAI (GPT-4o)
OPENAI_API_KEY=sk-... snytch demo --ai-provider openai
```

You will be prompted to delete the generated report files when the demo completes.

---

## Features

- Scans `.next/static/chunks` recursively for JavaScript and CSS files
- Detects 150+ secret patterns including:
  - AWS access keys and credentials
  - Stripe API keys (live and test)
  - Database connection strings with passwords
  - GitHub personal access tokens
  - Slack and Twilio tokens
  - Private keys (RSA, EC, OpenSSH)
  - JWT tokens and bearer tokens
  - API keys from major cloud providers (Google, Azure, Firebase, etc.)
- AI root cause analysis via Claude (Anthropic) or GPT-4o (OpenAI) when `--report` is set
- Git provenance for each finding (source file + introducing commit)
- HTML report with per-finding details and editor prompts
- MCP server for editor integration (Cursor, Windsurf, Claude Desktop)

---

## MCP Server

`@snytch/nextjs` ships an [MCP](https://modelcontextprotocol.io) server that exposes three tools to AI editors. Secret values are **never** transmitted — all findings use truncated values only.

### Tools

| Tool | Description |
|---|---|
| `snytch_scan` | Scan the Next.js bundle for leaked secrets in client-side JS |
| `snytch_check` | Check `.env` files for dangerous `NEXT_PUBLIC_` prefix usage |
| `snytch_diff` | Compare environment variable key presence across `.env` files |

### Tool schemas

**`snytch_scan`**
```jsonc
// Input
{ "dir": "./.next" }   // optional — defaults to <cwd>/.next

// Output
{
  "findings": [...],   // truncated values only, rca omitted
  "summary": { "scannedFiles": 12, "total": 2, "critical": 1, "warning": 1, "durationMs": 80 }
}
```

**`snytch_check`**
```jsonc
// Input
{ "envFiles": [".env.local", ".env.production"] }  // optional — auto-detects from cwd

// Output
{
  "findings": [...],
  "summary": { "scannedFiles": 2, "total": 1, "critical": 1, "warning": 0, "durationMs": 5 }
}
```

**`snytch_diff`**
```jsonc
// Input
{ "envFiles": [".env.staging", ".env.production"] }  // required — minimum 2 files

// Output (key names only — values are never read into output)
{
  "inSync":    ["DATABASE_URL", "REDIS_URL"],
  "drift":     [{ "key": "API_KEY", "presentIn": [".env.staging"], "missingFrom": [".env.production"] }],
  "onlyInOne": [{ "key": "DEV_FLAG", "file": ".env.staging" }]
}
```

### Editor configuration

#### Cursor — `.cursor/mcp.json`

```json
{
  "mcpServers": {
    "snytch": {
      "command": "npx",
      "args": ["-y", "@snytch/nextjs", "mcp"]
    }
  }
}
```

#### Windsurf — `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "snytch": {
      "command": "npx",
      "args": ["-y", "@snytch/nextjs", "mcp"]
    }
  }
}
```

#### Claude Desktop — `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "snytch": {
      "command": "npx",
      "args": ["-y", "@snytch/nextjs", "mcp"]
    }
  }
}
```

> **Tip:** The MCP server runs in the directory where the editor is opened, so it automatically uses the correct `.next` directory and `.env` files for your project.

---

## Configuration

Create `snytch.config.js` in your project root to mark specific environment variables as server-only:

```js
// snytch.config.js
export default {
  serverOnly: ['DATABASE_URL', 'STRIPE_SECRET_KEY', 'NEXTAUTH_SECRET'],
  failOn: 'critical',
};
```

When `serverOnly` is set:
- `snytch check` will flag any listed key that appears under `NEXT_PUBLIC_`
- `snytch diff` will exit 1 in non-strict mode if a `serverOnly` key has drifted
- `snytch scan` will detect literal values of these variables in the bundle

---

## CI/CD integration

```yaml
# .github/workflows/security.yml
- name: Scan Next.js bundle for secrets
  run: npx @snytch/nextjs scan --json --fail-on critical
```

---

## License

MIT
