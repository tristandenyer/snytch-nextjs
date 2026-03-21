# @snytch/nextjs

Bundle scanning, secret detection, and environment exposure analysis for Next.js applications.

## Installation

```bash
npm install -D @snytch/nextjs
```

## Usage

```bash
snytch scan [--dir ./.next] [--json] [--fail-on critical|warning|all]
```

### Options

- `--dir` - Path to the `.next` directory to scan (default: `./.next`)
- `--json` - Output results as JSON for CI/CD integration
- `--fail-on` - Exit code threshold: `critical`, `warning`, or `all` (default: `critical`)

## Features

- Scans `.next/static/chunks` recursively for JavaScript files
- Detects 150+ secret patterns including:
  - AWS access keys and credentials
  - Stripe API keys (live and test)
  - Database connection strings with passwords
  - GitHub personal access tokens
  - Slack and Twilio tokens
  - Private keys (RSA, EC, OpenSSH)
  - JWT tokens and bearer tokens
  - API keys from major cloud providers (Google, Azure, Firebase, etc.)
  - And many more...

## Example

```bash
snytch scan --dir build/.next --json
```

## License

MIT
