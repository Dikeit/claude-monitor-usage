import * as https from 'https';
import { UsageSnapshot, StoredToken, UsageWindow } from './types';

const USAGE_ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';
const ANTHROPIC_BETA = 'oauth-2025-04-20';

// ─── Raw API shapes ──────────────────────────────────────────────────────────

interface RawUsageWindow {
  utilization: number;
  resets_at: string;
  tokens_used?: number;
  tokens_limit?: number;
}

export interface RawUsageResponse {
  five_hour: RawUsageWindow;
  seven_day: RawUsageWindow;
}

interface ApiErrorBody {
  type: 'error';
  error?: { message?: string; type?: string };
}

// ─── Parser (exported for unit tests) ───────────────────────────────────────

function parseWindow(raw: RawUsageWindow): UsageWindow {
  const date = new Date(raw.resets_at);
  return {
    percent: raw.utilization,
    tokensUsed: raw.tokens_used,
    tokensLimit: raw.tokens_limit,
    resetAt: raw.resets_at,
    resetEpochMs: isNaN(date.getTime()) ? undefined : date.getTime(),
  };
}

export function parseRawResponse(raw: RawUsageResponse, includeRaw: boolean): UsageSnapshot {
  return {
    fiveHour: parseWindow(raw.five_hour),
    weekly: parseWindow(raw.seven_day),
    updatedAtEpochMs: Date.now(),
    ...(includeRaw ? { raw } : {}),
  };
}

// ─── HTTP helper (Node https, no external deps) ──────────────────────────────

function httpsGet(
  url: string,
  headers: Record<string, string>
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class AnthropicUsageClient {
  constructor(private debugLogging: boolean = false) {}

  private log(msg: string): void {
    if (this.debugLogging) {
      console.log(`[ClaudeUsage:Client] ${msg}`);
    }
  }

  async getUsage(token: StoredToken): Promise<UsageSnapshot> {
    const tokenSuffix = token.accessToken.slice(-4);
    this.log(`Fetching usage (token …${tokenSuffix})`);

    const { statusCode, body } = await httpsGet(USAGE_ENDPOINT, {
      Authorization: `Bearer ${token.accessToken}`,
      'anthropic-beta': ANTHROPIC_BETA,
      Accept: 'application/json',
    });

    this.log(`Response: HTTP ${statusCode}, body length ${body.length}`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error(`Failed to parse API response: ${body.slice(0, 120)}`);
    }

    // Anthropic returns HTTP 200 even for auth errors — check body shape first
    const maybeError = parsed as Partial<ApiErrorBody>;
    if (maybeError.type === 'error') {
      const msg = maybeError.error?.message ?? 'Authentication error';
      throw new AuthError(msg);
    }

    if (statusCode === 401) {
      throw new AuthError('Unauthorized — token may be expired');
    }

    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`Unexpected HTTP ${statusCode}`);
    }

    const raw = parsed as Partial<RawUsageResponse>;
    if (!raw.five_hour || !raw.seven_day) {
      throw new Error(`Unexpected API response shape: ${JSON.stringify(raw).slice(0, 120)}`);
    }

    return parseRawResponse(raw as RawUsageResponse, this.debugLogging);
  }
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}
