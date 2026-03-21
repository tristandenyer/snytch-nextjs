# CI/CD Integration

`@snytch/nextjs` ships a ready-to-use GitHub Actions workflow and a GitLab CI snippet. Both scan the compiled Next.js bundle for leaked secrets on every push and pull request.

---

## GitHub Actions

Copy [`.github/workflows/snytch.yml`](.github/workflows/snytch.yml) into the same path in your project.

### What the workflow does

| Step | Description |
|---|---|
| `npm ci` + `npm run build` | Installs dependencies and compiles the Next.js app |
| `snytch scan --json` | Scans `.next/static` for 150+ secret patterns; writes `snytch-results.json` |
| `snytch diff` | Compares `.env.staging` vs `.env.production` key schemas (skipped if either file is absent) |
| PR comment | On a pull request with critical findings, posts a table of findings with commit SHA and author |
| Upload artifact | Always uploads `snytch-results.json`, `snytch-diff.json`, and `snytch-report.html` (30-day retention) |

### Secrets

| Secret | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | No | Enables AI root cause analysis; generates `snytch-report.html` alongside `snytch-results.json` |

The workflow does **not** fail if `ANTHROPIC_API_KEY` is unset — the report step is silently skipped.

### Required permissions

The workflow requests `pull-requests: write` so it can post the failure comment. Add this to the job permissions block if your repository enforces minimal permissions:

```yaml
permissions:
  contents: read
  pull-requests: write
```

### Example PR comment

When critical findings are detected on a pull request, the workflow posts:

> ## 🔴 snytch found critical secret findings
>
> **Commit:** `a1b2c3d` — **Author:** @alice
>
> | Pattern | File | Truncated value |
> |---------|------|-----------------|
> | `Stripe Secret Key` | `index-abc123.js` | `sk_live_•••` |
>
> ---
> **To investigate locally:**
> ```bash
> npx @snytch/nextjs scan --report --ai-provider anthropic
> ```
> This generates `snytch-report.html` with full root cause analysis for each finding.

### Customisation

**Change the failure threshold** — edit the `--fail-on` flag:

```yaml
npx @snytch/nextjs scan --json --fail-on warning
```

**Scan a non-default build directory** — add `--dir`:

```yaml
npx @snytch/nextjs scan --json --dir build/.next
```

**Compare more than two env files** — extend the diff step:

```yaml
npx @snytch/nextjs diff \
  --env .env.staging \
  --env .env.production \
  --env .env.preview \
  --json
```

---

## GitLab CI

Add the following snippet to your `.gitlab-ci.yml`. It mirrors the GitHub Actions workflow.

```yaml
# snytch — Secret & environment exposure scan
# Add ANTHROPIC_API_KEY to CI/CD variables (Settings → CI/CD → Variables)
# to enable AI root cause analysis. The job does not fail if the key is unset.

snytch:
  stage: test
  image: node:20-alpine
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - node_modules/
  script:
    # Install and build
    - npm ci
    - npm run build

    # Scan bundle — save JSON results regardless of exit code
    - |
      REPORT_FLAG=""
      if [ -n "$ANTHROPIC_API_KEY" ]; then
        REPORT_FLAG="--report"
      fi
      npx @snytch/nextjs scan \
        --json \
        --fail-on critical \
        $REPORT_FLAG \
        > snytch-results.json \
        && SCAN_EXIT=0 || SCAN_EXIT=$?

    # Diff .env schemas (skip if files are absent)
    - |
      if [ -f .env.staging ] && [ -f .env.production ]; then
        npx @snytch/nextjs diff \
          --env .env.staging \
          --env .env.production \
          --json > snytch-diff.json || true
      fi

    # Propagate scan failure after artifact collection
    - exit $SCAN_EXIT

  artifacts:
    when: always
    paths:
      - snytch-results.json
      - snytch-diff.json
      - snytch-report.html
    expire_in: 30 days
    reports:
      # Exposes findings count in the MR widget (GitLab 15.7+)
      # Remove if not needed.
      dotenv: snytch-results.json
```

### GitLab MR comments

GitLab does not support inline MR comments from CI scripts without additional tooling. To post a comment on a merge request when findings are detected, use the [GitLab API](https://docs.gitlab.com/ee/api/notes.html) with a project access token:

```yaml
    # After the scan step — post MR comment on failure
    - |
      if [ "$SCAN_EXIT" != "0" ] && [ -n "$CI_MERGE_REQUEST_IID" ]; then
        CRITICALS=$(node -e "
          const r = require('./snytch-results.json');
          const c = (r.findings||[]).filter(f=>f.severity==='critical');
          console.log(c.length);
        ")
        curl --silent --request POST \
          --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
          --data-urlencode "body=## snytch found ${CRITICALS} critical finding(s)

Commit: \`${CI_COMMIT_SHORT_SHA}\` — Author: @${GITLAB_USER_LOGIN}

Run locally for full root cause analysis:
\`\`\`
npx @snytch/nextjs scan --report --ai-provider anthropic
\`\`\`" \
          "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/merge_requests/${CI_MERGE_REQUEST_IID}/notes"
      fi
```

Add `GITLAB_TOKEN` as a masked CI/CD variable with the `write_repository` and `write_merge_request` scope.

---

## Running locally

```bash
# Scan the bundle
npx @snytch/nextjs scan --report --ai-provider anthropic

# Check .env files
npx @snytch/nextjs check

# Compare env schemas
npx @snytch/nextjs diff --env .env.staging --env .env.production
```

The `--report` flag generates `snytch-report.html` in the current directory with a full breakdown and, if `ANTHROPIC_API_KEY` is set, an AI root cause analysis for each critical finding.
