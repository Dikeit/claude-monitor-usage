# Claude Usage Monitor

Real-time visibility of your Claude API usage directly inside VSCode.

Monitor your **5-hour** and **7-day** utilization without leaving your editor.

---

## Why?

When working with Claude Code or the Claude API, it's easy to lose track of usage limits.

Claude Usage Monitor gives you:

- 📊 Instant visibility in the Status Bar  
- 🔄 Automatic refresh  
- 🔔 Threshold notifications  
- 📈 Detailed panel with utilization breakdown  

No dashboards. No switching tabs. Just signal.

---

## Features

### Status Bar Indicator
Displays your selected primary metric (`5-hour` or `7-day`) in real time.

Modes:
- `percentage`
- `bar`
- `compact`

### Detailed Panel
Click the status bar to open a full panel with:
- 5-hour utilization
- 7-day utilization
- Token usage vs limit
- Reset timestamps
- Usage trend (session-based)

### Threshold Notifications
Get notified when usage crosses configured percentages.

---

## Setup

The extension requires an Anthropic OAuth access token.

### Option 1 — Auto-detect (Windows, best-effort)

Attempts to detect credentials from:
- Windows Credential Manager (`Claude Code-credentials`)
- Local Claude configuration folders

If detection fails, use manual token entry.

### Option 2 — Manual Token (Recommended)

1. Run: `Claude Usage: Sign In / Configure Token`
2. Paste your OAuth access token
3. The token is stored securely in VSCode SecretStorage

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeUsage.refreshIntervalSeconds` | 60 | Auto-refresh interval |
| `claudeUsage.thresholds` | `[50,75,90,100]` | Notification thresholds |
| `claudeUsage.statusBarDisplay` | `percentage` | Display mode |
| `claudeUsage.primaryMetric` | `fiveHour` | Primary metric |
| `claudeUsage.enableNotifications` | `true` | Enable notifications |
| `claudeUsage.debugLogging` | `false` | Debug logs |
| `claudeUsage.autoDetectCredentials` | `true` | Attempt credential auto-detection |

---

## Security

- Tokens are stored using VSCode SecretStorage.
- No credentials are written to `settings.json`.
- Debug logs mask sensitive values.

---

## API

- `GET https://api.anthropic.com/api/oauth/usage`
- Requires OAuth Bearer token

---

## Built by Dikeit

AI-powered operational software.  
https://dikeit.com