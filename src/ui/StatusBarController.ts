import * as vscode from 'vscode';
import { UsageSnapshot } from '../usage/types';

type DisplayMode = 'percentage' | 'bar' | 'compact';

export class StatusBarController implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private mode: DisplayMode;

  constructor(private getConfig: () => vscode.WorkspaceConfiguration) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.mode = this.getConfig().get<DisplayMode>('statusBarDisplay', 'percentage');
    this.showLoading();
  }

  // ── State setters ──────────────────────────────────────────────────────────

  showLoading(): void {
    this.item.text = '$(sync~spin) Claude';
    this.item.tooltip = 'Claude Usage: Loading…';
    this.item.command = 'claudeUsage.openPanel';
    this.item.color = undefined;
    this.item.backgroundColor = undefined;
    this.item.show();
  }

  showSignIn(): void {
    this.item.text = '$(key) Claude: Sign in';
    this.item.tooltip = 'Click to configure your Claude API token';
    this.item.command = 'claudeUsage.signIn';
    this.item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    this.item.show();
  }

  showError(message: string): void {
    this.item.text = '$(error) Claude: --';
    this.item.tooltip = `Claude Usage Error:\n${message}`;
    this.item.command = 'claudeUsage.openPanel';
    this.item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.item.show();
  }

  update(snapshot: UsageSnapshot): void {
    this.mode = this.getConfig().get<DisplayMode>('statusBarDisplay', 'percentage');
    const primaryKey = this.getConfig().get<'fiveHour' | 'weekly'>('primaryMetric', 'fiveHour');
    const window = primaryKey === 'fiveHour' ? snapshot.fiveHour : snapshot.weekly;
    const pct = Math.round(Math.min(100, Math.max(0, window.percent)));
    const label = primaryKey === 'fiveHour' ? '5h' : '7d';

    this.item.command = 'claudeUsage.openPanel';
    this.item.color = this.getThemeColor(pct);
    this.item.backgroundColor =
      pct >= 90 ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;

    switch (this.mode) {
      case 'bar':
        this.item.text = `Claude ${this.renderBar(pct)}`;
        break;
      case 'compact':
        this.item.text = `☁ ${pct}%`;
        break;
      default:
        this.item.text = `$(pulse) Claude ${pct}%`;
    }

    const ago = this.timeSince(snapshot.updatedAtEpochMs);
    this.item.tooltip = this.buildTooltip(snapshot, ago);

    this.item.show();
  }

  toggleMode(): void {
    const modes: DisplayMode[] = ['percentage', 'bar', 'compact'];
    const idx = modes.indexOf(this.mode);
    this.mode = modes[(idx + 1) % modes.length];
    vscode.workspace
      .getConfiguration('claudeUsage')
      .update('statusBarDisplay', this.mode, vscode.ConfigurationTarget.Global);
  }

  dispose(): void {
    this.item.dispose();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private buildTooltip(snap: UsageSnapshot, ago: string): vscode.MarkdownString {
    const fhPct = Math.round(Math.min(100, Math.max(0, snap.fiveHour.percent)));
    const wkPct = Math.round(Math.min(100, Math.max(0, snap.weekly.percent)));

    const bar = (pct: number) => {
      const filled = Math.round(pct / 5); // 20 chars = 100%
      const empty  = 20 - filled;
      return '█'.repeat(filled) + '░'.repeat(empty);
    };

    const fhReset = snap.fiveHour.resetEpochMs ? this.formatReset(snap.fiveHour.resetEpochMs) : '—';
    const wkReset = snap.weekly.resetEpochMs   ? this.formatReset(snap.weekly.resetEpochMs)   : '—';

    const fhColor = pct2emoji(fhPct);
    const wkColor = pct2emoji(wkPct);

    const md = new vscode.MarkdownString(
      `**Claude Usage**\n\n` +
      `**5-hour** ${fhColor}\n\n` +
      `\`${bar(fhPct)}\` **${fhPct}%**\n\n` +
      `Resets ${fhReset}\n\n` +
      `---\n\n` +
      `**Weekly** ${wkColor}\n\n` +
      `\`${bar(wkPct)}\` **${wkPct}%**\n\n` +
      `Resets ${wkReset}\n\n` +
      `---\n\n` +
      `_Updated ${ago} · Click to open panel_`
    );
    md.supportThemeIcons = true;
    return md;
  }

  private formatReset(epochMs: number): string {
    const diffMs  = epochMs - Date.now();
    if (diffMs <= 0) return 'now';
    const diffSec = Math.round(diffMs / 1000);
    if (diffSec < 3600) return `in ${Math.round(diffSec / 60)}m`;
    const h = Math.floor(diffSec / 3600);
    const m = Math.floor((diffSec % 3600) / 60);
    if (diffSec < 86400) return `in ${h}h ${m}m`;
    const d = new Date(epochMs);
    return `${d.toLocaleDateString(undefined, { weekday: 'short' })} at ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }

  private getThemeColor(pct: number): vscode.ThemeColor | undefined {
    if (pct >= 75) return new vscode.ThemeColor('statusBarItem.warningForeground');
    return undefined;
  }

  private renderBar(pct: number): string {
    const filled = Math.round(pct / 10);
    const empty = 10 - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  private timeSince(epochMs: number): string {
    const sec = Math.round((Date.now() - epochMs) / 1000);
    if (sec < 5) return 'just now';
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
    return `${Math.round(sec / 3600)}h ago`;
  }
}

function pct2emoji(pct: number): string {
  if (pct >= 85) return '🟠';
  if (pct >= 60) return '🟡';
  return '🟢';
}
