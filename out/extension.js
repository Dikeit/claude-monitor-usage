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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const AnthropicUsageClient_1 = require("./usage/AnthropicUsageClient");
const CredentialProvider_1 = require("./usage/CredentialProvider");
const StatusBarController_1 = require("./ui/StatusBarController");
const PanelWebview_1 = require("./ui/PanelWebview");
const HistoryStore_1 = require("./storage/HistoryStore");
const DEBOUNCE_MS = 2000;
const AUTH_RETRY_MAX = 1;
const AUTH_PROMPT_COOLDOWN_MS = 5 * 60 * 1000;
async function activate(context) {
    // Item de diagnóstico: aparece INMEDIATAMENTE, sin depender de ningún await.
    // Si ves "☁ …" en la barra inferior, la extensión SÍ está activándose.
    const diagItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 999);
    diagItem.text = '☁ …';
    diagItem.tooltip = 'Claude Usage: iniciando…';
    diagItem.show();
    context.subscriptions.push(diagItem);
    try {
        await _activate(context);
        diagItem.hide(); // El StatusBarController ya tiene su propio item
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        diagItem.text = '☁ ERROR';
        diagItem.tooltip = msg;
        void vscode.window.showErrorMessage(`Claude Usage failed to activate: ${msg}`);
        console.error('[ClaudeUsage] Activation error:', err);
    }
}
async function _activate(context) {
    const config = () => vscode.workspace.getConfiguration('claudeUsage');
    // ── Output channel — siempre activo ────────────────────────────────────────
    const outputChannel = vscode.window.createOutputChannel('Claude Usage');
    context.subscriptions.push(outputChannel);
    const log = (msg) => {
        outputChannel.appendLine(`[${new Date().toISOString()}] ${msg}`);
    };
    log('Extension activating…');
    // ── Status bar primero — lo más importante, antes de cualquier await ───────
    const statusBar = new StatusBarController_1.StatusBarController(config);
    context.subscriptions.push(statusBar);
    // ── Resto de servicios ─────────────────────────────────────────────────────
    const credentials = new CredentialProvider_1.CredentialProvider(context.secrets, log);
    const panel = new PanelWebview_1.PanelWebview(context.extensionUri, () => void refresh());
    const historyStore = new HistoryStore_1.HistoryStore(context.globalState);
    context.subscriptions.push(panel);
    // ── State ──────────────────────────────────────────────────────────────────
    let currentToken = null;
    let lastRefreshMs = 0;
    let refreshTimer;
    const notifiedThresholds = new Set();
    let shownAutoDetectFailedOnce = false;
    let lastAuthPromptMs = 0;
    // ── Commands ───────────────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('claudeUsage.openPanel', () => panel.show()), vscode.commands.registerCommand('claudeUsage.refresh', () => void refresh()), vscode.commands.registerCommand('claudeUsage.signIn', async () => {
        const token = await credentials.promptForToken();
        if (token) {
            currentToken = token;
            notifiedThresholds.clear();
            await refresh(true);
            void vscode.window.showInformationMessage('Claude Usage: Token saved. Fetching data…');
        }
    }), vscode.commands.registerCommand('claudeUsage.toggleStatusBarMode', () => statusBar.toggleMode()));
    // ── Config changes ─────────────────────────────────────────────────────────
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('claudeUsage.refreshIntervalSeconds')) {
            restartTimer();
        }
        if (e.affectsConfiguration('claudeUsage.debugLogging')) {
            // Recreate client with updated flag
            // (The existing client instance is replaced on next getUsage call)
        }
    }));
    // ── Core refresh logic ─────────────────────────────────────────────────────
    async function refresh(force = false, authRetryCount = 0) {
        const now = Date.now();
        if (!force && now - lastRefreshMs < DEBOUNCE_MS) {
            log('Refresh skipped (debounce)');
            return;
        }
        lastRefreshMs = now;
        if (!currentToken) {
            const autoDetect = config().get('autoDetectCredentials', true);
            log(`Looking for credentials (autoDetect=${autoDetect})…`);
            currentToken = await credentials.getToken(autoDetect);
        }
        if (!currentToken) {
            statusBar.showSignIn();
            // Notify once — the user deserves to know WHY the status bar shows "Sign in"
            if (!shownAutoDetectFailedOnce) {
                shownAutoDetectFailedOnce = true;
                log('Auto-detection failed — prompting user');
                void vscode.window
                    .showInformationMessage('Claude Usage: Could not auto-detect credentials from Claude Code. ' +
                    'If you use Claude CLI, your token may be in a keychain entry that ' +
                    'could not be read. You can paste your token manually.', 'Sign In', 'Show Log')
                    .then((action) => {
                    if (action === 'Sign In') {
                        void vscode.commands.executeCommand('claudeUsage.signIn');
                    }
                    else if (action === 'Show Log') {
                        outputChannel.show();
                    }
                });
            }
            return;
        }
        try {
            const debugMode = config().get('debugLogging', false);
            const freshClient = new AnthropicUsageClient_1.AnthropicUsageClient(debugMode);
            const snapshot = await freshClient.getUsage(currentToken);
            historyStore.add(snapshot);
            statusBar.update(snapshot);
            panel.update(snapshot, historyStore.getLast(20));
            checkThresholds(snapshot);
            log(`Usage: 5h=${snapshot.fiveHour.percent.toFixed(1)}% 7d=${snapshot.weekly.percent.toFixed(1)}%`);
        }
        catch (err) {
            const recovered = await handleError(err, authRetryCount);
            if (recovered) {
                await refresh(true, authRetryCount + 1);
            }
        }
    }
    async function handleError(err, authRetryCount) {
        if (err instanceof AnthropicUsageClient_1.AuthError) {
            log(`Auth error: ${err.message}`);
            const autoDetect = config().get('autoDetectCredentials', true);
            if (autoDetect && authRetryCount < AUTH_RETRY_MAX) {
                const recovered = await credentials.refreshFromAutoDetect();
                if (recovered) {
                    const oldSuffix = currentToken?.accessToken.slice(-4) ?? 'none';
                    const newSuffix = recovered.accessToken.slice(-4);
                    currentToken = recovered;
                    log(`Recovered credentials from auto-detect (old ...${oldSuffix}, new ...${newSuffix})`);
                    return true;
                }
            }
            statusBar.showSignIn();
            currentToken = null;
            const now = Date.now();
            if (now - lastAuthPromptMs >= AUTH_PROMPT_COOLDOWN_MS) {
                lastAuthPromptMs = now;
                void vscode.window
                    .showWarningMessage('Claude Usage: Authentication failed and auto-recovery did not succeed. Please sign in again.', 'Sign In')
                    .then((action) => {
                    if (action === 'Sign In') {
                        void vscode.commands.executeCommand('claudeUsage.signIn');
                    }
                });
            }
        }
        else {
            const msg = err instanceof Error ? err.message : String(err);
            log(`API error: ${msg}`);
            statusBar.showError(msg.slice(0, 80));
            panel.showError(msg, false);
        }
        return false;
    }
    function checkThresholds(snapshot) {
        if (!config().get('enableNotifications', true))
            return;
        const thresholds = config().get('thresholds', [50, 75, 90, 100]);
        const primaryKey = config().get('primaryMetric', 'fiveHour');
        const pct = primaryKey === 'fiveHour' ? snapshot.fiveHour.percent : snapshot.weekly.percent;
        const windowLabel = primaryKey === 'fiveHour' ? '5-hour' : 'weekly';
        for (const threshold of thresholds) {
            if (pct >= threshold && !notifiedThresholds.has(threshold)) {
                notifiedThresholds.add(threshold);
                const msg = `Claude ${windowLabel} usage at ${Math.round(pct)}% (threshold: ${threshold}%)`;
                if (threshold >= 90) {
                    void vscode.window.showErrorMessage(msg);
                }
                else {
                    void vscode.window.showWarningMessage(msg);
                }
            }
        }
        // Reset lower threshold notifications when usage drops (hysteresis: -10%)
        for (const threshold of [...notifiedThresholds]) {
            if (pct < threshold - 10) {
                notifiedThresholds.delete(threshold);
            }
        }
    }
    function restartTimer() {
        if (refreshTimer !== undefined)
            clearInterval(refreshTimer);
        const intervalSec = Math.max(10, config().get('refreshIntervalSeconds', 60));
        refreshTimer = setInterval(() => void refresh(), intervalSec * 1000);
        log(`Auto-refresh set to every ${intervalSec}s`);
    }
    context.subscriptions.push({
        dispose: () => {
            if (refreshTimer !== undefined)
                clearInterval(refreshTimer);
        },
    });
    // ── Bootstrap ──────────────────────────────────────────────────────────────
    log('Bootstrap: first refresh starting…');
    await refresh(true);
    restartTimer();
    log('Bootstrap complete');
}
function deactivate() {
    // Cleanup handled via context.subscriptions
}
//# sourceMappingURL=extension.js.map