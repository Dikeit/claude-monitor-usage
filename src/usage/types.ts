/**
 * Represents usage data for a single rolling time window (5-hour or 7-day).
 */
export interface UsageWindow {
  /** Usage percentage 0-100 */
  percent: number;
  /** Number of tokens consumed in this window */
  tokensUsed?: number;
  /** Maximum token allocation for this window */
  tokensLimit?: number;
  /** ISO 8601 timestamp when the window resets */
  resetAt?: string;
  /** Unix epoch milliseconds when the window resets */
  resetEpochMs?: number;
}

/**
 * Normalized snapshot of Claude usage from the API.
 */
export interface UsageSnapshot {
  fiveHour: UsageWindow;
  weekly: UsageWindow;
  /** Unix epoch ms when this snapshot was fetched */
  updatedAtEpochMs: number;
  /** Raw API response, only populated when debugLogging is enabled */
  raw?: unknown;
}

/**
 * An OAuth token with optional refresh capability.
 */
export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  /** Unix epoch ms when the access token expires */
  expiresAtEpochMs?: number;
}
