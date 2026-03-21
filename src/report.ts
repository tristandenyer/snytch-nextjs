import { writeFileSync, mkdirSync } from 'fs';
import { join, relative } from 'path';
import { execSync, spawnSync } from 'child_process';
import { ScanResult, ScanOptions, Finding, CheckResult, CheckOptions, CheckFinding, DiffResult, DiffOptions, RcaResult } from './types.js';

/** Returns (and creates if needed) the snytch-reports/ output directory. */
function reportsDir(projectRoot: string): string {
  const dir = join(projectRoot, 'snytch-reports');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function getGitSha(projectRoot: string): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function relPath(filePath: string, projectRoot: string): string {
  return relative(projectRoot, filePath) || filePath;
}

function renderFindingCard(finding: Finding, projectRoot: string): string {
  const isCritical = finding.severity === 'critical';
  const badgeClass = isCritical ? 'badge-critical' : 'badge-warning';
  const cardClass = isCritical ? 'card card-critical' : 'card card-warning';
  const badgeLabel = isCritical ? 'CRITICAL' : 'WARN';
  const typeLabel = finding.type === 'value-match' ? ' · value match' : '';

  return `
    <div class="${cardClass}">
      <div class="card-header">
        <span class="badge ${badgeClass}">${badgeLabel}</span>
        <span class="pattern-name">${escapeHtml(finding.patternName)}${typeLabel}</span>
      </div>
      <div class="card-body">
        <div class="field"><span class="label">file</span><span class="value mono">${escapeHtml(relPath(finding.filePath, projectRoot))}</span></div>
        <div class="field"><span class="label">col</span><span class="value mono">${finding.charOffset}</span></div>
        <div class="field"><span class="label">value</span><span class="value mono redacted">${escapeHtml(finding.truncatedValue)} <span class="truncated-note">(truncated)</span></span></div>
        <div class="field"><span class="label">desc</span><span class="value">${escapeHtml(finding.description)}</span></div>
      </div>
    </div>`;
}

function renderFindingsTab(
  result: ScanResult,
  projectRoot: string,
): string {
  const criticals = result.findings.filter((f) => f.severity === 'critical');
  const warnings = result.findings.filter((f) => f.severity === 'warning');
  const cleanFiles =
    result.scannedFiles -
    new Set(result.findings.map((f) => f.filePath)).size;

  const summaryCards = `
    <div class="summary-row">
      <div class="summary-card summary-critical">
        <div class="summary-count">${criticals.length}</div>
        <div class="summary-label">critical</div>
      </div>
      <div class="summary-card summary-warning">
        <div class="summary-count">${warnings.length}</div>
        <div class="summary-label">warning</div>
      </div>
      <div class="summary-card summary-clean">
        <div class="summary-count">${cleanFiles}</div>
        <div class="summary-label">clean files</div>
      </div>
      <div class="summary-card summary-scanned">
        <div class="summary-count">${result.scannedFiles}</div>
        <div class="summary-label">files scanned</div>
      </div>
    </div>`;

  if (result.findings.length === 0) {
    return `
      ${summaryCards}
      <div class="clean-message">
        <span class="clean-check">✓</span> No secrets detected in client bundle.
      </div>`;
  }

  const cards = [...criticals, ...warnings]
    .map((f) => renderFindingCard(f, projectRoot))
    .join('');

  return `${summaryCards}<div class="findings-list">${cards}</div>`;
}

function renderRcaCard(finding: Finding, projectRoot: string, rca: RcaResult): string {
  return `
    <div class="rca-card">
      <div class="rca-card-header">
        <span class="badge badge-critical">CRITICAL</span>
        <span class="pattern-name">${escapeHtml(finding.patternName)}</span>
        <span class="rca-file mono">${escapeHtml(relPath(finding.filePath, projectRoot))}</span>
      </div>
      <div class="rca-card-body">
        <div class="rca-section">
          <div class="rca-label">What</div>
          <div class="rca-content">${escapeHtml(rca.what)}</div>
        </div>
        <div class="rca-section">
          <div class="rca-label">When</div>
          <div class="rca-content">${escapeHtml(rca.when)}</div>
        </div>
        <div class="rca-section">
          <div class="rca-label">How</div>
          <div class="rca-content">${escapeHtml(rca.how)}</div>
        </div>
        <div class="rca-section">
          <div class="rca-label">Fix</div>
          <div class="rca-content">${escapeHtml(rca.fix)}</div>
        </div>
        ${rca.codeExample ? `
        <div class="rca-section">
          <div class="rca-label">Code</div>
          <pre class="rca-code">${escapeHtml(rca.codeExample)}</pre>
        </div>` : ''}
        <div class="rca-section">
          <div class="rca-label">Editor prompts</div>
          <div class="rca-prompts">
            <div class="rca-prompt">
              <span class="prompt-tag">Fix</span>
              <code class="rca-prompt-text">${escapeHtml(rca.editorPrompts[0])}</code>
            </div>
            <div class="rca-prompt">
              <span class="prompt-tag">Verify</span>
              <code class="rca-prompt-text">${escapeHtml(rca.editorPrompts[1])}</code>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderRcaTab(result: ScanResult, projectRoot: string): string {
  const criticals = result.findings.filter((f) => f.severity === 'critical' && f.rca);

  if (criticals.length === 0) {
    const hasCriticals = result.findings.some((f) => f.severity === 'critical');
    if (!hasCriticals) {
      return `<div class="placeholder">No critical findings — AI RCA not needed.</div>`;
    }
    return `
      <div class="placeholder">
        Set <code>ANTHROPIC_API_KEY</code> and run <code>snytch scan --report</code> to enable AI analysis.<br>
        The AI RCA tab provides a what / when / how / fix breakdown for each critical finding.
      </div>`;
  }

  const cards = criticals.map((f) => renderRcaCard(f, projectRoot, f.rca!)).join('');
  return `<div class="rca-list">${cards}</div>`;
}

function buildHtml(
  result: ScanResult,
  options: ScanOptions,
  gitSha: string,
  timestamp: string,
): string {
  const findingsHtml = renderFindingsTab(result, options.projectRoot);
  const rcaHtml = renderRcaTab(result, options.projectRoot);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>snytch report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #ffffff;
      --bg2: #f6f8fa;
      --bg3: #eaeef2;
      --border: #d0d7de;
      --text: #1f2328;
      --text2: #636c76;
      --critical: #cf222e;
      --critical-bg: #fff0ee;
      --critical-border: #ffcece;
      --warning: #9a6700;
      --warning-bg: #fffbe5;
      --warning-border: #f5d76e;
      --green: #1a7f37;
      --green-bg: #dafbe1;
      --tab-active: #0969da;
      --mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0d1117;
        --bg2: #161b22;
        --bg3: #21262d;
        --border: #30363d;
        --text: #e6edf3;
        --text2: #8b949e;
        --critical: #ff7b72;
        --critical-bg: #2d1115;
        --critical-border: #6e2626;
        --warning: #e3b341;
        --warning-bg: #2d2000;
        --warning-border: #6e5000;
        --green: #3fb950;
        --green-bg: #0d2a17;
        --tab-active: #58a6ff;
        --mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      }
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      font-size: 14px;
      line-height: 1.5;
    }

    .header {
      background: var(--bg2);
      border-bottom: 1px solid var(--border);
      padding: 20px 32px;
    }

    .header-top {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }

    .header h1 {
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.3px;
    }

    .header-subtitle { font-size: 14px; color: var(--text2); margin-top: 4px; }
    .header-meta {
      font-size: 12px;
      color: var(--text2);
      margin-top: 4px;
      font-family: var(--mono);
    }

    .tabs {
      display: flex;
      gap: 0;
      border-bottom: 1px solid var(--border);
      background: var(--bg2);
      padding: 0 32px;
    }

    .tab-btn {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      padding: 10px 16px;
      cursor: pointer;
      font-size: 14px;
      color: var(--text2);
      font-family: inherit;
      margin-bottom: -1px;
      transition: color 0.15s, border-color 0.15s;
    }

    .tab-btn:hover { color: var(--text); }

    .tab-btn.active {
      color: var(--tab-active);
      border-bottom-color: var(--tab-active);
      font-weight: 500;
    }

    .tab-panel { display: none; padding: 28px 32px; }
    .tab-panel.active { display: block; }

    .summary-row {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .summary-card {
      flex: 1;
      min-width: 100px;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px 16px;
      background: var(--bg2);
    }

    .summary-count {
      font-size: 28px;
      font-weight: 600;
      line-height: 1;
    }

    .summary-label {
      font-size: 12px;
      color: var(--text2);
      margin-top: 4px;
    }

    .summary-critical .summary-count { color: var(--critical); }
    .summary-warning .summary-count { color: var(--warning); }
    .summary-clean .summary-count { color: var(--green); }

    .findings-list { display: flex; flex-direction: column; gap: 12px; }

    .card {
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      border-left-width: 4px;
    }

    .card-critical { border-left-color: var(--critical); background: var(--critical-bg); border-color: var(--critical-border); border-left-color: var(--critical); }
    .card-warning  { border-left-color: var(--warning);  background: var(--warning-bg);  border-color: var(--warning-border);  border-left-color: var(--warning); }

    .card-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
    }

    .badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 4px;
      letter-spacing: 0.4px;
    }

    .badge-critical { background: var(--critical); color: #fff; }
    .badge-warning  { background: var(--warning);  color: #fff; }

    .pattern-name { font-weight: 500; font-size: 13px; }

    .card-body { padding: 10px 14px; display: flex; flex-direction: column; gap: 5px; }

    .field { display: flex; gap: 12px; font-size: 13px; }
    .field .label { color: var(--text2); min-width: 40px; flex-shrink: 0; }
    .field .value { word-break: break-all; }
    .field .mono { font-family: var(--mono); font-size: 12px; }
    .field .redacted { color: var(--critical); }
    .truncated-note { color: var(--text2); font-size: 11px; }

    .clean-message {
      padding: 24px;
      background: var(--green-bg);
      border: 1px solid var(--green);
      border-radius: 8px;
      color: var(--green);
      font-size: 15px;
      font-weight: 500;
    }

    .clean-check { font-size: 18px; }

    .placeholder {
      padding: 40px 24px;
      text-align: center;
      color: var(--text2);
      border: 1px dashed var(--border);
      border-radius: 8px;
      font-size: 14px;
      line-height: 2;
    }

    .placeholder code {
      font-family: var(--mono);
      font-size: 12px;
      background: var(--bg3);
      padding: 2px 6px;
      border-radius: 4px;
      color: var(--text);
    }

    /* ── RCA tab ────────────────────────────────────────── */
    .rca-list { display: flex; flex-direction: column; gap: 20px; }

    .rca-card {
      border: 1px solid var(--critical-border);
      border-left: 4px solid var(--critical);
      border-radius: 8px;
      background: var(--critical-bg);
      overflow: hidden;
    }

    .rca-card-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--critical-border);
      flex-wrap: wrap;
    }

    .rca-file {
      margin-left: auto;
      font-size: 11px;
      color: var(--text2);
    }

    .rca-card-body { padding: 14px; display: flex; flex-direction: column; gap: 12px; }

    .rca-section { display: flex; gap: 12px; }
    .rca-label {
      color: var(--text2);
      font-size: 12px;
      font-weight: 600;
      min-width: 56px;
      flex-shrink: 0;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding-top: 1px;
    }
    .rca-content { font-size: 13px; line-height: 1.6; }

    .rca-code {
      font-family: var(--mono);
      font-size: 12px;
      background: var(--bg3);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 14px;
      white-space: pre-wrap;
      word-break: break-all;
      line-height: 1.6;
      flex: 1;
    }

    .rca-prompts { display: flex; flex-direction: column; gap: 8px; flex: 1; }
    .rca-prompt {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 10px;
    }
    .prompt-tag {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--bg3);
      color: var(--text2);
      flex-shrink: 0;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .rca-prompt-text {
      font-family: var(--mono);
      font-size: 12px;
      line-height: 1.5;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-top">
      <h1>snytch report</h1>
      <p class="header-subtitle">Secrets and sensitive values detected in your Next.js client bundle.</p>
    </div>
    <div class="header-meta">
      commit ${escapeHtml(gitSha)} &nbsp;·&nbsp; ${escapeHtml(timestamp)}
    </div>
  </div>

  <div class="tabs">
    <button class="tab-btn active" onclick="showTab('findings')">Findings</button>
    <button class="tab-btn" onclick="showTab('rca')">AI RCA</button>
  </div>

  <div id="tab-findings" class="tab-panel active">
    ${findingsHtml}
  </div>

  <div id="tab-rca" class="tab-panel">
    ${rcaHtml}
  </div>

  <script>
    function showTab(name) {
      document.querySelectorAll('.tab-panel').forEach(function(el) {
        el.classList.remove('active');
      });
      document.querySelectorAll('.tab-btn').forEach(function(el) {
        el.classList.remove('active');
      });
      document.getElementById('tab-' + name).classList.add('active');
      event.currentTarget.classList.add('active');
    }
  </script>
</body>
</html>`;
}

// ── Check report ──────────────────────────────────────────────────────────────

function renderCheckFindingCard(finding: CheckFinding): string {
  const isCritical = finding.severity === 'critical';
  const badgeClass = isCritical ? 'badge-critical' : 'badge-warning';
  const cardClass = isCritical ? 'card card-critical' : 'card card-warning';
  const badgeLabel = isCritical ? 'CRITICAL' : 'WARN';
  const reasonLabel =
    finding.reason === 'pattern-match' ? 'pattern match' :
    finding.reason === 'serverOnly'     ? 'serverOnly config' :
                                          'high entropy';

  return `
    <div class="${cardClass}">
      <div class="card-header">
        <span class="badge ${badgeClass}">${badgeLabel}</span>
        <span class="pattern-name">${escapeHtml(finding.varName)}</span>
        <span style="font-size:12px;color:var(--text2);margin-left:auto">${escapeHtml(reasonLabel)}</span>
      </div>
      <div class="card-body">
        <div class="field"><span class="label">file</span><span class="value mono">${escapeHtml(finding.envFile)}:${finding.line}</span></div>
        <div class="field"><span class="label">rule</span><span class="value">${escapeHtml(finding.patternName)}</span></div>
        <div class="field"><span class="label">desc</span><span class="value">${escapeHtml(finding.description)}</span></div>
        <div class="field"><span class="label">value</span><span class="value mono redacted">${escapeHtml(finding.truncatedValue)} <span class="truncated-note">(truncated)</span></span></div>
      </div>
    </div>`;
}

function buildCheckHtml(
  result: CheckResult,
  gitSha: string,
  timestamp: string,
): string {
  const criticals = result.findings.filter((f) => f.severity === 'critical');
  const warnings  = result.findings.filter((f) => f.severity === 'warning');

  const summaryCards = `
    <div class="summary-row">
      <div class="summary-card summary-critical">
        <div class="summary-count">${criticals.length}</div>
        <div class="summary-label">critical</div>
      </div>
      <div class="summary-card summary-warning">
        <div class="summary-count">${warnings.length}</div>
        <div class="summary-label">warning</div>
      </div>
      <div class="summary-card summary-scanned">
        <div class="summary-count">${result.scannedFiles}</div>
        <div class="summary-label">files scanned</div>
      </div>
    </div>`;

  const bodyHtml = result.findings.length === 0
    ? `${summaryCards}<div class="clean-message"><span class="clean-check">✓</span> No NEXT_PUBLIC_ secrets detected.</div>`
    : `${summaryCards}<div class="findings-list">${[...criticals, ...warnings].map(renderCheckFindingCard).join('')}</div>`;

  // Reuse the same CSS as the scan report — self-contained single file
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>snytch check report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #ffffff; --bg2: #f6f8fa; --bg3: #eaeef2; --border: #d0d7de;
      --text: #1f2328; --text2: #636c76;
      --critical: #cf222e; --critical-bg: #fff0ee; --critical-border: #ffcece;
      --warning: #9a6700; --warning-bg: #fffbe5; --warning-border: #f5d76e;
      --green: #1a7f37; --green-bg: #dafbe1;
      --mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0d1117; --bg2: #161b22; --bg3: #21262d; --border: #30363d;
        --text: #e6edf3; --text2: #8b949e;
        --critical: #ff7b72; --critical-bg: #2d1115; --critical-border: #6e2626;
        --warning: #e3b341; --warning-bg: #2d2000; --warning-border: #6e5000;
        --green: #3fb950; --green-bg: #0d2a17;
        --mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      }
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.5; }
    .header { background: var(--bg2); border-bottom: 1px solid var(--border); padding: 20px 32px; }
    .header h1 { font-size: 18px; font-weight: 600; letter-spacing: -0.3px; }
    .header-subtitle { font-size: 14px; color: var(--text2); margin-top: 4px; }
    .header-meta { font-size: 12px; color: var(--text2); margin-top: 4px; font-family: var(--mono); }
    .content { padding: 28px 32px; }
    .summary-row { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
    .summary-card { flex: 1; min-width: 100px; border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; background: var(--bg2); }
    .summary-count { font-size: 28px; font-weight: 600; line-height: 1; }
    .summary-label { font-size: 12px; color: var(--text2); margin-top: 4px; }
    .summary-critical .summary-count { color: var(--critical); }
    .summary-warning .summary-count { color: var(--warning); }
    .findings-list { display: flex; flex-direction: column; gap: 12px; }
    .card { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; border-left-width: 4px; }
    .card-critical { border-left-color: var(--critical); background: var(--critical-bg); border-color: var(--critical-border); border-left-color: var(--critical); }
    .card-warning  { border-left-color: var(--warning);  background: var(--warning-bg);  border-color: var(--warning-border);  border-left-color: var(--warning); }
    .card-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--border); }
    .badge { font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 4px; letter-spacing: 0.4px; }
    .badge-critical { background: var(--critical); color: #fff; }
    .badge-warning  { background: var(--warning);  color: #fff; }
    .pattern-name { font-weight: 500; font-size: 13px; }
    .card-body { padding: 10px 14px; display: flex; flex-direction: column; gap: 5px; }
    .field { display: flex; gap: 12px; font-size: 13px; }
    .field .label { color: var(--text2); min-width: 40px; flex-shrink: 0; }
    .field .value { word-break: break-all; }
    .field .mono { font-family: var(--mono); font-size: 12px; }
    .field .redacted { color: var(--critical); }
    .truncated-note { color: var(--text2); font-size: 11px; }
    .clean-message { padding: 24px; background: var(--green-bg); border: 1px solid var(--green); border-radius: 8px; color: var(--green); font-size: 15px; font-weight: 500; }
    .clean-check { font-size: 18px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>snytch check report</h1>
    <p class="header-subtitle">NEXT_PUBLIC_ variables that expose secrets or sensitive values to the browser.</p>
    <div class="header-meta">commit ${escapeHtml(gitSha)} &nbsp;·&nbsp; ${escapeHtml(timestamp)} &nbsp;·&nbsp; ${result.scannedFiles} file${result.scannedFiles === 1 ? '' : 's'} scanned</div>
  </div>
  <div class="content">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

export function generateCheckReport(
  result: CheckResult,
  options: CheckOptions,
): void {
  const gitSha = getGitSha(options.projectRoot);
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const outputPath = join(reportsDir(options.projectRoot), 'snytch-check-report.html');

  const html = buildCheckHtml(result, gitSha, timestamp);
  writeFileSync(outputPath, html, 'utf-8');

  console.log(`  report written to ${relative(options.projectRoot, outputPath)}`);

  try {
    const cmd =
      process.platform === 'darwin' ? 'open' :
      process.platform === 'win32'  ? 'start' :
                                      'xdg-open';
    // Use spawnSync with an args array — never interpolate outputPath into a shell string
    spawnSync(cmd, [outputPath], { stdio: 'ignore' });
  } catch {
    // Browser open failed — user can open manually
  }
}

// ── Diff report ───────────────────────────────────────────────────────────────

function buildDiffHtml(result: DiffResult, gitSha: string, timestamp: string): string {
  const totalKeys = result.inSync.length + result.drift.length + result.onlyInOne.length;
  const outOfSyncCount = result.drift.length + result.onlyInOne.length;
  const labels = result.fileLabels;

  // Build drifted key rows
  const driftedKeys = [
    ...result.drift.map((d) => d.key),
    ...result.onlyInOne.map((o) => o.key),
  ].sort();

  function renderRow(key: string, isDrifted: boolean): string {
    const driftEntry = result.drift.find((d) => d.key === key);
    const onlyEntry = result.onlyInOne.find((o) => o.key === key);

    const cells = labels.map((label) => {
      let present: boolean;
      if (driftEntry) {
        present = driftEntry.presentIn.includes(label);
      } else if (onlyEntry) {
        present = onlyEntry.file === label;
      } else {
        // inSync key — present in all environments
        present = true;
      }
      const mark = present
        ? '<span class="mark-present">✓</span>'
        : '<span class="mark-missing">✗ <small>missing</small></span>';
      return `<td>${mark}</td>`;
    }).join('');

    const rowClass = isDrifted ? 'row-drift' : '';
    return `<tr class="${rowClass}"><td class="key-cell">${escapeHtml(key)}</td>${cells}</tr>`;
  }

  const theadCols = labels.map((l) => `<th>${escapeHtml(l)}</th>`).join('');
  const driftRows = driftedKeys.map((k) => renderRow(k, true)).join('');
  const syncRows = result.inSync.map((k) => renderRow(k, false)).join('');
  const dividerRow = driftedKeys.length > 0 && result.inSync.length > 0
    ? `<tr class="divider-row"><td colspan="${labels.length + 1}"></td></tr>`
    : '';

  const statusHtml = outOfSyncCount === 0
    ? `<div class="status-clean"><span class="clean-check">✓</span> All ${totalKeys} variable${totalKeys === 1 ? '' : 's'} in sync across all environments.</div>`
    : `<div class="status-drift">${outOfSyncCount} variable${outOfSyncCount === 1 ? '' : 's'} out of sync.</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>snytch diff report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #ffffff; --bg2: #f6f8fa; --bg3: #eaeef2; --border: #d0d7de;
      --text: #1f2328; --text2: #636c76;
      --critical: #cf222e; --critical-bg: #fff0ee;
      --warning: #9a6700; --warning-bg: #fffbe5;
      --green: #1a7f37; --green-bg: #dafbe1;
      --mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0d1117; --bg2: #161b22; --bg3: #21262d; --border: #30363d;
        --text: #e6edf3; --text2: #8b949e;
        --critical: #ff7b72; --critical-bg: #2d1115;
        --warning: #e3b341; --warning-bg: #2d2000;
        --green: #3fb950; --green-bg: #0d2a17;
      }
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.5; }
    .header { background: var(--bg2); border-bottom: 1px solid var(--border); padding: 20px 32px; }
    .header h1 { font-size: 18px; font-weight: 600; letter-spacing: -0.3px; }
    .header-subtitle { font-size: 14px; color: var(--text2); margin-top: 4px; }
    .header-meta { font-size: 12px; color: var(--text2); margin-top: 4px; font-family: var(--mono); }
    .content { padding: 28px 32px; }
    .summary-row { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
    .summary-card { flex: 1; min-width: 100px; border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; background: var(--bg2); }
    .summary-count { font-size: 28px; font-weight: 600; line-height: 1; }
    .summary-label { font-size: 12px; color: var(--text2); margin-top: 4px; }
    .summary-sync .summary-count { color: var(--green); }
    .summary-drift .summary-count { color: var(--critical); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; }
    th { background: var(--bg2); padding: 8px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border); color: var(--text2); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 7px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    .key-cell { font-family: var(--mono); font-size: 12px; }
    tr.row-drift td { background: var(--warning-bg); }
    tr.row-drift .key-cell { color: var(--warning); font-weight: 600; }
    tr.divider-row td { height: 8px; background: var(--bg2); border: none; }
    .mark-present { color: var(--green); font-weight: 600; }
    .mark-missing { color: var(--critical); font-weight: 600; }
    .mark-missing small { font-size: 10px; font-weight: normal; color: var(--text2); }
    .status-clean { padding: 16px 20px; background: var(--green-bg); border: 1px solid var(--green); border-radius: 8px; color: var(--green); font-size: 15px; font-weight: 500; margin-bottom: 16px; }
    .status-drift { padding: 16px 20px; background: var(--critical-bg); border: 1px solid var(--critical); border-radius: 8px; color: var(--critical); font-size: 15px; font-weight: 500; margin-bottom: 16px; }
    .clean-check { font-size: 18px; }
    .footer-note { font-size: 12px; color: var(--text2); margin-top: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>snytch diff report</h1>
    <p class="header-subtitle">Environment variable drift across your .env files — keys that are missing, mismatched, or only present in one environment.</p>
    <div class="header-meta">commit ${escapeHtml(gitSha)} &nbsp;·&nbsp; ${escapeHtml(timestamp)} &nbsp;·&nbsp; ${totalKeys} key${totalKeys === 1 ? '' : 's'} across ${labels.length} files</div>
  </div>
  <div class="content">
    <div class="summary-row">
      <div class="summary-card summary-sync">
        <div class="summary-count">${result.inSync.length}</div>
        <div class="summary-label">in sync</div>
      </div>
      <div class="summary-card summary-drift">
        <div class="summary-count">${outOfSyncCount}</div>
        <div class="summary-label">out of sync</div>
      </div>
      <div class="summary-card">
        <div class="summary-count">${totalKeys}</div>
        <div class="summary-label">total keys</div>
      </div>
    </div>
    ${statusHtml}
    <table>
      <thead>
        <tr><th>variable</th>${theadCols}</tr>
      </thead>
      <tbody>
        ${driftRows}
        ${dividerRow}
        ${syncRows}
      </tbody>
    </table>
    <div class="footer-note">values are never compared — key presence only</div>
  </div>
</body>
</html>`;
}

/**
 * Write a self-contained HTML diff report to snytch-diff-report.html and
 * attempt to open it in the default browser.
 *
 * @param result  - The structured diff result.
 * @param options - CLI options including projectRoot.
 */
export function generateDiffReport(result: DiffResult, options: DiffOptions): void {
  const gitSha = getGitSha(options.projectRoot);
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const outputPath = join(reportsDir(options.projectRoot), 'snytch-diff-report.html');

  const html = buildDiffHtml(result, gitSha, timestamp);
  writeFileSync(outputPath, html, 'utf-8');

  console.log(`  report written to ${relative(options.projectRoot, outputPath)}`);

  try {
    const cmd =
      process.platform === 'darwin' ? 'open' :
      process.platform === 'win32'  ? 'start' :
                                      'xdg-open';
    spawnSync(cmd, [outputPath], { stdio: 'ignore' });
  } catch {
    // Browser open failed — user can open the file manually
  }
}

export function generateReport(
  result: ScanResult,
  options: ScanOptions,
): void {
  const gitSha = getGitSha(options.projectRoot);
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const outputPath = join(reportsDir(options.projectRoot), 'snytch-report.html');

  const html = buildHtml(result, options, gitSha, timestamp);
  writeFileSync(outputPath, html, 'utf-8');

  console.log(`  report written to ${relative(options.projectRoot, outputPath)}`);

  // Open in default browser — best-effort, never throw
  try {
    const cmd =
      process.platform === 'darwin' ? 'open' :
      process.platform === 'win32'  ? 'start' :
                                      'xdg-open';
    spawnSync(cmd, [outputPath], { stdio: 'ignore' });
  } catch {
    // Browser open failed silently; user can open the file manually
  }
}
