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
exports.AuthError = exports.AnthropicUsageClient = void 0;
exports.parseRawResponse = parseRawResponse;
const https = __importStar(require("https"));
const USAGE_ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';
const ANTHROPIC_BETA = 'oauth-2025-04-20';
// ─── Parser (exported for unit tests) ───────────────────────────────────────
function parseWindow(raw) {
    const date = new Date(raw.resets_at);
    return {
        percent: raw.utilization,
        tokensUsed: raw.tokens_used,
        tokensLimit: raw.tokens_limit,
        resetAt: raw.resets_at,
        resetEpochMs: isNaN(date.getTime()) ? undefined : date.getTime(),
    };
}
function parseRawResponse(raw, includeRaw) {
    return {
        fiveHour: parseWindow(raw.five_hour),
        weekly: parseWindow(raw.seven_day),
        updatedAtEpochMs: Date.now(),
        ...(includeRaw ? { raw } : {}),
    };
}
// ─── HTTP helper (Node https, no external deps) ──────────────────────────────
function httpsGet(url, headers) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers,
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk.toString()));
            res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body }));
        });
        req.on('error', reject);
        req.end();
    });
}
// ─── Client ──────────────────────────────────────────────────────────────────
class AnthropicUsageClient {
    constructor(debugLogging = false) {
        this.debugLogging = debugLogging;
    }
    log(msg) {
        if (this.debugLogging) {
            console.log(`[ClaudeUsage:Client] ${msg}`);
        }
    }
    async getUsage(token) {
        const tokenSuffix = token.accessToken.slice(-4);
        this.log(`Fetching usage (token …${tokenSuffix})`);
        const { statusCode, body } = await httpsGet(USAGE_ENDPOINT, {
            Authorization: `Bearer ${token.accessToken}`,
            'anthropic-beta': ANTHROPIC_BETA,
            Accept: 'application/json',
        });
        this.log(`Response: HTTP ${statusCode}, body length ${body.length}`);
        let parsed;
        try {
            parsed = JSON.parse(body);
        }
        catch {
            throw new Error(`Failed to parse API response: ${body.slice(0, 120)}`);
        }
        // Anthropic returns HTTP 200 even for auth errors — check body shape first
        const maybeError = parsed;
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
        const raw = parsed;
        if (!raw.five_hour || !raw.seven_day) {
            throw new Error(`Unexpected API response shape: ${JSON.stringify(raw).slice(0, 120)}`);
        }
        return parseRawResponse(raw, this.debugLogging);
    }
}
exports.AnthropicUsageClient = AnthropicUsageClient;
// ─── Errors ──────────────────────────────────────────────────────────────────
class AuthError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthError';
    }
}
exports.AuthError = AuthError;
//# sourceMappingURL=AnthropicUsageClient.js.map