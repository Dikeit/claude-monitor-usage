import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { StoredToken } from './types';

const execFileAsync = promisify(execFile);

const SECRET_KEY_ACCESS = 'claudeUsage.accessToken';
const SECRET_KEY_REFRESH = 'claudeUsage.refreshToken';
const SECRET_KEY_EXPIRES = 'claudeUsage.expiresAt';

// Windows Credential Manager target names to try, in priority order.
// Claude Code CLI uses "Claude Code-credentials" (confirmed from macOS keychain analysis).
const WIN_CRED_TARGETS = [
  'Claude Code-credentials',
  'Claude Code',
  'claude-code-credentials',
  'claude',
];

// ─── Credential object parsers ────────────────────────────────────────────────

function parseCredentialObject(data: Record<string, unknown>): StoredToken | null {
  // Format A: { accessToken, refreshToken?, expiresAt? }
  if (typeof data['accessToken'] === 'string' && data['accessToken']) {
    return {
      accessToken: data['accessToken'],
      refreshToken: typeof data['refreshToken'] === 'string' ? data['refreshToken'] : undefined,
      expiresAtEpochMs: typeof data['expiresAt'] === 'number' ? data['expiresAt'] : undefined,
    };
  }

  // Format B: { access_token, refresh_token?, expires_at? }
  if (typeof data['access_token'] === 'string' && data['access_token']) {
    return {
      accessToken: data['access_token'],
      refreshToken: typeof data['refresh_token'] === 'string' ? data['refresh_token'] : undefined,
      expiresAtEpochMs: typeof data['expires_at'] === 'number' ? data['expires_at'] : undefined,
    };
  }

  // Format C: Claude Code keychain JSON — { claudeAiOauth: { accessToken, refreshToken, expiresAt } }
  const oauth = data['claudeAiOauth'] as Record<string, unknown> | undefined;
  if (oauth && typeof oauth['accessToken'] === 'string') {
    return {
      accessToken: oauth['accessToken'],
      refreshToken: typeof oauth['refreshToken'] === 'string' ? oauth['refreshToken'] : undefined,
      expiresAtEpochMs: typeof oauth['expiresAt'] === 'number' ? oauth['expiresAt'] : undefined,
    };
  }

  return null;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class CredentialProvider {
  constructor(
    private secrets: vscode.SecretStorage,
    private log: (msg: string) => void
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Returns a token using the cascade:
   *   1. VSCode SecretStorage (already saved)
   *   2. Auto-detect from Claude Code CLI (Windows Credential Manager / files)
   *   3. null → caller should prompt the user
   */
  async getToken(autoDetect = true): Promise<StoredToken | null> {
    const stored = await this.getFromSecretStorage();
    if (stored) {
      this.log('Token loaded from VSCode SecretStorage');
      return stored;
    }

    if (autoDetect) {
      const detected = await this.tryAutoDetect();
      if (detected) {
        this.log('Token auto-detected from Claude Code — caching in SecretStorage');
        await this.saveToken(detected);
        return detected;
      }
    }

    return null;
  }

  async saveToken(token: StoredToken): Promise<void> {
    await this.secrets.store(SECRET_KEY_ACCESS, token.accessToken);
    if (token.refreshToken) {
      await this.secrets.store(SECRET_KEY_REFRESH, token.refreshToken);
    } else {
      await this.secrets.delete(SECRET_KEY_REFRESH);
    }
    if (token.expiresAtEpochMs) {
      await this.secrets.store(SECRET_KEY_EXPIRES, String(token.expiresAtEpochMs));
    } else {
      await this.secrets.delete(SECRET_KEY_EXPIRES);
    }
  }

  async clearToken(): Promise<void> {
    await this.secrets.delete(SECRET_KEY_ACCESS);
    await this.secrets.delete(SECRET_KEY_REFRESH);
    await this.secrets.delete(SECRET_KEY_EXPIRES);
  }

  /**
   * Force re-detection from Claude Code sources (files/credential manager),
   * replacing cached SecretStorage values when a newer token is found.
   */
  async refreshFromAutoDetect(): Promise<StoredToken | null> {
    const detected = await this.tryAutoDetect();
    if (!detected) return null;
    await this.saveToken(detected);
    return detected;
  }

  /** Interactive: prompts the user to paste their access token. */
  async promptForToken(): Promise<StoredToken | null> {
    const accessToken = await vscode.window.showInputBox({
      title: 'Claude Usage: Access Token',
      prompt:
        'Paste your Claude OAuth access token. ' +
        'Tip: you can get it from the Claude Code CLI session.',
      password: true,
      placeHolder: 'ey…  (the token is stored encrypted, never in settings.json)',
      ignoreFocusOut: true,
      validateInput: (v) => (v.trim().length < 10 ? 'Token too short' : null),
    });

    if (!accessToken) return null;

    const refreshToken = await vscode.window.showInputBox({
      title: 'Claude Usage: Refresh Token (optional)',
      prompt: 'Paste your refresh token to allow auto-renewal (optional).',
      password: true,
      placeHolder: 'Leave empty to skip',
      ignoreFocusOut: true,
    });

    const token: StoredToken = {
      accessToken: accessToken.trim(),
      refreshToken: refreshToken?.trim() || undefined,
    };

    await this.saveToken(token);
    return token;
  }

  // ── Private: SecretStorage ─────────────────────────────────────────────────

  private async getFromSecretStorage(): Promise<StoredToken | null> {
    const accessToken = await this.secrets.get(SECRET_KEY_ACCESS);
    if (!accessToken) return null;

    const refreshToken = await this.secrets.get(SECRET_KEY_REFRESH);
    const expiresStr = await this.secrets.get(SECRET_KEY_EXPIRES);

    return {
      accessToken,
      refreshToken: refreshToken ?? undefined,
      expiresAtEpochMs: expiresStr ? parseInt(expiresStr, 10) : undefined,
    };
  }

  // ── Private: auto-detection cascade ───────────────────────────────────────

  private async tryAutoDetect(): Promise<StoredToken | null> {
    // 1. File-based (unlikely on Windows but cheap to check)
    const fromFile = await this.tryCredentialFiles();
    if (fromFile) return fromFile;

    // 2. Windows Credential Manager (primary path on Windows)
    if (process.platform === 'win32') {
      return this.tryWindowsCredentialManager();
    }

    return null;
  }

  private async tryCredentialFiles(): Promise<StoredToken | null> {
    const home = os.homedir();
    const appData = process.env['APPDATA'] ?? '';
    const localAppData = process.env['LOCALAPPDATA'] ?? '';

    const candidates = [
      path.join(home, '.claude', 'credentials.json'),
      path.join(home, '.claude', 'auth.json'),
      path.join(home, '.claude', '.credentials.json'),
      path.join(home, '.config', 'claude', 'credentials.json'),
      path.join(appData, 'Claude', 'credentials.json'),
      path.join(localAppData, 'Claude', 'credentials.json'),
    ].filter(Boolean);

    for (const filePath of candidates) {
      try {
        if (!fs.existsSync(filePath)) continue;
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw) as Record<string, unknown>;
        const token = parseCredentialObject(data);
        if (token) {
          this.log(`Auto-detected credentials from file: ${filePath}`);
          return token;
        }
      } catch (e) {
        this.log(`Skipping ${filePath}: ${e}`);
      }
    }
    return null;
  }

  /**
   * Reads Claude Code credentials from Windows Credential Manager via PowerShell.
   *
   * Uses P/Invoke (advapi32.dll CredReadW) — no external modules required.
   * Tries several target name variants because the exact name may vary.
   *
   * IMPORTANT: The CREDENTIAL struct uses [MarshalAs(UnmanagedType.LPWStr)] on
   * string pointer fields so the CLR marshaller dereferences them correctly on
   * both 32-bit and 64-bit processes.
   */
  private async tryWindowsCredentialManager(): Promise<StoredToken | null> {
    this.log('Windows: reading Credential Manager entries for Claude Code…');

    // C# code embedded in a PowerShell here-string.
    // We compile it once with Add-Type then query each target name.
    const csharp = `
using System;
using System.Runtime.InteropServices;
using System.Text;
public class ClaudeCredReader {
    [DllImport("advapi32.dll", EntryPoint = "CredReadW",
               CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(
        string target, uint type, int flags, out IntPtr credPtr);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern void CredFree(IntPtr buffer);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public uint   Flags;
        public uint   Type;
        [MarshalAs(UnmanagedType.LPWStr)] public string TargetName;
        [MarshalAs(UnmanagedType.LPWStr)] public string Comment;
        public long   LastWritten;          // FILETIME (2x DWORD)
        public uint   CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint   Persist;
        public uint   AttributeCount;
        public IntPtr Attributes;
        [MarshalAs(UnmanagedType.LPWStr)] public string TargetAlias;
        [MarshalAs(UnmanagedType.LPWStr)] public string UserName;
    }

    public static string ReadBlob(string target) {
        IntPtr ptr = IntPtr.Zero;
        if (!CredRead(target, 1 /*GENERIC*/, 0, out ptr)) return null;
        try {
            var cred = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
            if (cred.CredentialBlobSize == 0 || cred.CredentialBlob == IntPtr.Zero)
                return null;
            byte[] bytes = new byte[cred.CredentialBlobSize];
            Marshal.Copy(cred.CredentialBlob, bytes, 0, bytes.Length);
            return Encoding.Unicode.GetString(bytes);
        } finally {
            CredFree(ptr);
        }
    }
}`;

    // Build the target list as a PS array literal
    const targetsPs = WIN_CRED_TARGETS.map((t) => `"${t}"`).join(',');

    const psScript = `
$ErrorActionPreference = 'Stop'
try {
    Add-Type -TypeDefinition @'
${csharp}
'@ -Language CSharp 2>$null
} catch {}
$targets = @(${targetsPs})
foreach ($t in $targets) {
    try {
        $blob = [ClaudeCredReader]::ReadBlob($t)
        if ($blob) { Write-Output $blob; break }
    } catch {}
}
`;

    try {
      const { stdout } = await execFileAsync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', psScript],
        { timeout: 10000 }
      );

      const text = stdout.trim();
      if (!text) {
        this.log('Windows Credential Manager: no Claude Code entry found');
        return null;
      }

      this.log(`Windows Credential Manager: got blob (${text.length} chars)`);

      const data = JSON.parse(text) as Record<string, unknown>;
      const token = parseCredentialObject(data);
      if (token) {
        this.log('Windows Credential Manager: credentials parsed successfully');
        return token;
      }

      this.log('Windows Credential Manager: blob found but format unrecognised');
    } catch (e) {
      this.log(`Windows Credential Manager read error: ${e}`);
    }

    return null;
  }
}
