import * as https from 'https';
import { UsageSnapshot, StoredToken, UsageWindow } from './types';

const USAGE_ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';
const ANTHROPIC_BETA = 'oauth-2025-04-20';

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

function isLikelyAuthError(
  statusCode: number,
  maybeError: Partial<ApiErrorBody>,
  responseBody: unknown
): boolean {
  if (statusCode === 401 || statusCode === 403) return true;
  if (maybeError.type !== 'error') return false;

  const errType = (maybeError.error?.type ?? '').toLowerCase();
  const errMsg = (maybeError.error?.message ?? '').toLowerCase();
  const bodyText = JSON.stringify(responseBody).toLowerCase();
  const authHints = [
    'auth',
    'unauthorized',
    'forbidden',
    'invalid token',
    'token expired',
    'oauth',
    'credential',
  ];
  return authHints.some((hint) => errType.includes(hint) || errMsg.includes(hint) || bodyText.includes(hint));
}

export class AnthropicUsageClient {
  constructor(private debugLogging: boolean = false) {}

  private log(msg: string): void {
    if (this.debugLogging) {
      console.log(`[ClaudeUsage:Client] ${msg}`);
    }
  }

  async getUsage(token: StoredToken): Promise<UsageSnapshot> {
    const tokenSuffix = token.accessToken.slice(-4);
    this.log(`Fetching usage (token ...${tokenSuffix})`);

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

    const maybeError = parsed as Partial<ApiErrorBody>;
    if (isLikelyAuthError(statusCode, maybeError, parsed)) {
      const msg = maybeError.error?.message ?? 'Authentication error';
      throw new AuthError(msg);
    }

    if (statusCode < 200 || statusCode >= 300) {
      if (maybeError.type === 'error') {
        throw new Error(maybeError.error?.message ?? `Unexpected HTTP ${statusCode}`);
      }
      throw new Error(`Unexpected HTTP ${statusCode}`);
    }

    if (maybeError.type === 'error') {
      throw new Error(maybeError.error?.message ?? 'API returned an error');
    }

    const raw = parsed as Partial<RawUsageResponse>;
    if (!raw.five_hour || !raw.seven_day) {
      throw new Error(`Unexpected API response shape: ${JSON.stringify(raw).slice(0, 120)}`);
    }

    return parseRawResponse(raw as RawUsageResponse, this.debugLogging);
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}
