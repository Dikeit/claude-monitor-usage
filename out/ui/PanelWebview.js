"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PanelWebview = void 0;
const vscode = __importStar(require("vscode"));
class PanelWebview {
    constructor(extensionUri, onRefreshRequest) {
        this.extensionUri = extensionUri;
        this.onRefreshRequest = onRefreshRequest;
        this.lastHistory = [];
    }
    show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }
        this.panel = vscode.window.createWebviewPanel('claudeUsagePanel', 'Claude Usage', vscode.ViewColumn.Beside, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [this.extensionUri],
        });
        this.panel.onDidDispose(() => { this.panel = undefined; });
        this.panel.webview.onDidReceiveMessage((msg) => {
            if (msg.command === 'refresh') {
                this.onRefreshRequest();
            }
        });
        this.renderHtml();
    }
    update(snapshot, history) {
        this.lastSnapshot = snapshot;
        this.lastHistory = history;
        if (this.panel) {
            this.renderHtml();
        }
    }
    showError(message, isAuthError) {
        if (!this.panel)
            return;
        void this.panel.webview.postMessage({ command: 'error', message, isAuthError });
    }
    isVisible() { return this.panel?.visible ?? false; }
    dispose() { this.panel?.dispose(); }
    renderHtml() {
        if (!this.panel)
            return;
        const nonce = getNonce();
        this.panel.webview.html = this.lastSnapshot
            ? this.buildHtml(this.lastSnapshot, this.lastHistory, nonce)
            : this.buildLoadingHtml(nonce);
    }
    buildLoadingHtml(nonce) {
        return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>${css()}</style></head>
<body class="loading-body">
  <div class="loading">Loading…</div>
</body></html>`;
    }
    buildHtml(snap, history, nonce) {
        const fhPct = clamp(snap.fiveHour.percent);
        const wkPct = clamp(snap.weekly.percent);
        const updated = timeSince(snap.updatedAtEpochMs);
        const fhReset = snap.fiveHour.resetEpochMs ? formatReset(snap.fiveHour.resetEpochMs) : '—';
        const wkReset = snap.weekly.resetEpochMs ? formatReset(snap.weekly.resetEpochMs) : '—';
        const fhTok = tokenLine(snap.fiveHour.tokensUsed, snap.fiveHour.tokensLimit);
        const wkTok = tokenLine(snap.weekly.tokensUsed, snap.weekly.tokensLimit);
        const trendSvg = history.length > 2 ? buildTrendSvg(history) : '';
        return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claude Usage</title>
<style>${css()}</style>
</head><body>

<div class="card">
  <header>
    <span class="title">Claude Usage</span>
    <button class="refresh-btn" id="refreshBtn" onclick="doRefresh()" title="Refresh now">↻</button>
  </header>

  <div id="error-banner" style="display:none"></div>

  <div class="section">
    ${barRow('5-hour', fhPct, fhReset, fhTok)}
  </div>

  <div class="section">
    ${barRow('Weekly', wkPct, wkReset, wkTok)}
  </div>

  ${trendSvg ? `<div class="section trend-section">
    <div class="trend-label">5-hour trend</div>
    ${trendSvg}
  </div>` : ''}

  <footer>
    <span class="updated">Updated ${updated}</span>
  </footer>
</div>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
let refreshing = false;

function doRefresh() {
  if (refreshing) return;
  refreshing = true;
  const btn = document.getElementById('refreshBtn');
  btn.textContent = '…';
  btn.disabled = true;
  vscode.postMessage({ command: 'refresh' });
  setTimeout(() => { refreshing = false; btn.textContent = '↻'; btn.disabled = false; }, 4000);
}

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.command === 'error') {
    const b = document.getElementById('error-banner');
    b.style.display = 'block';
    b.textContent = (msg.isAuthError ? '🔑 ' : '⚠ ') + msg.message;
  }
});
</script>
</body></html>`;
    }
}
exports.PanelWebview = PanelWebview;
// ─── Bar row ─────────────────────────────────────────────────────────────────
function barRow(label, pct, resetStr, tokenStr) {
    const color = pctColor(pct);
    const width = pct.toFixed(1);
    const pctTxt = Math.round(pct);
    return `<div class="bar-row">
  <div class="bar-header">
    <span class="bar-label">${label}</span>
    <span class="bar-pct" style="color:${color}">${pctTxt}%</span>
  </div>
  <div class="bar-track">
    <div class="bar-fill" style="width:${width}%;background:${color}"></div>
  </div>
  <div class="bar-meta">
    <span class="reset-text">Resets ${resetStr}</span>
    ${tokenStr ? `<span class="token-text">${tokenStr}</span>` : ''}
  </div>
</div>`;
}
// ─── Trend sparkline ─────────────────────────────────────────────────────────
function buildTrendSvg(history) {
    const W = 320, H = 60, padX = 4, padY = 6;
    function toPath(vals) {
        if (vals.length < 2)
            return '';
        const xStep = (W - padX * 2) / (vals.length - 1);
        const pts = vals.map((v, i) => {
            const x = padX + i * xStep;
            const y = padY + (H - padY * 2) * (1 - v / 100);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        return `M ${pts.join(' L ')}`;
    }
    const path5h = toPath(history.map(h => h.fiveHourPercent));
    const pathWk = toPath(history.map(h => h.weeklyPercent));
    return `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible">
  <path d="${path5h}" fill="none" stroke="#4a9eff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>
  <path d="${pathWk}" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.7"/>
</svg>
<div class="trend-legend">
  <span style="color:#4a9eff">─</span> 5h &nbsp;
  <span style="color:#a78bfa">─</span> Weekly
</div>`;
}
// ─── CSS ─────────────────────────────────────────────────────────────────────
function css() {
    return `
:root {
  --radius: 10px;
  --gap: 20px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  font-size: 13px;
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  min-width: 320px;
  padding: 16px;
}

body.loading-body {
  display: flex; align-items: center; justify-content: center; height: 100vh;
}
.loading { color: var(--vscode-descriptionForeground); font-size: 13px; }

.card {
  background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
  border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
  border-radius: var(--radius);
  padding: 20px 22px 16px;
  max-width: 420px;
  margin: 0 auto;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--vscode-foreground);
}
.refresh-btn {
  background: none;
  border: none;
  color: var(--vscode-descriptionForeground);
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
  font-family: inherit;
  transition: color 0.15s, background 0.15s;
}
.refresh-btn:hover { color: var(--vscode-foreground); background: rgba(128,128,128,0.12); }
.refresh-btn:disabled { opacity: 0.4; cursor: default; }

#error-banner {
  background: var(--vscode-inputValidation-errorBackground);
  border: 1px solid var(--vscode-inputValidation-errorBorder, #f44336);
  border-radius: 5px;
  padding: 7px 10px;
  margin-bottom: 14px;
  font-size: 12px;
}

.section {
  margin-bottom: 18px;
}

/* ─── Bar row ─────────────────────────── */
.bar-row { width: 100%; }

.bar-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 7px;
}
.bar-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--vscode-foreground);
}
.bar-pct {
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.bar-track {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: rgba(128,128,128,0.18);
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.4s ease;
}

.bar-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 5px;
}
.reset-text {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}
.token-text {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}

/* ─── Trend ───────────────────────────── */
.trend-section { margin-bottom: 14px; }
.trend-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--vscode-descriptionForeground);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
}
.trend-legend {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin-top: 6px;
}

/* ─── Footer ──────────────────────────── */
footer {
  border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
  padding-top: 12px;
}
.updated {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}
`;
}
// ─── Utilities ────────────────────────────────────────────────────────────────
function getNonce() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
function clamp(v) { return Math.min(100, Math.max(0, v)); }
function pctColor(pct) {
    if (pct >= 85)
        return '#E8621A';
    if (pct >= 60)
        return '#FF9800';
    return '#4CAF50';
}
function timeSince(epochMs) {
    const sec = Math.round((Date.now() - epochMs) / 1000);
    if (sec < 5)
        return 'just now';
    if (sec < 60)
        return `${sec}s ago`;
    if (sec < 3600)
        return `${Math.round(sec / 60)}m ago`;
    return `${Math.round(sec / 3600)}h ago`;
}
function formatReset(epochMs) {
    const diffMs = epochMs - Date.now();
    if (diffMs <= 0)
        return 'now';
    const diffSec = Math.round(diffMs / 1000);
    if (diffSec < 3600)
        return `in ${Math.round(diffSec / 60)}m`;
    const h = Math.floor(diffSec / 3600);
    const m = Math.floor((diffSec % 3600) / 60);
    if (diffSec < 86400)
        return `in ${h}h ${m}m`;
    const d = new Date(epochMs);
    return `${d.toLocaleDateString(undefined, { weekday: 'short' })} at ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}
function formatTokens(n) {
    if (n >= 1000000)
        return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000)
        return `${Math.round(n / 1000)}K`;
    return String(n);
}
function tokenLine(used, limit) {
    if (used === undefined || limit === undefined)
        return '';
    return `${formatTokens(used)} / ${formatTokens(limit)}`;
}
//# sourceMappingURL=PanelWebview.js.map