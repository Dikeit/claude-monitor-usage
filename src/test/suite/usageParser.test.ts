import * as assert from 'assert';
import { parseRawResponse, RawUsageResponse } from '../../usage/AnthropicUsageClient';

// Fixture: realistic API response
const FIXTURE_FULL: RawUsageResponse = {
  five_hour: {
    utilization: 72.5,
    resets_at: '2026-02-18T15:59:59.943648+00:00',
    tokens_used: 55000,
    tokens_limit: 100000,
  },
  seven_day: {
    utilization: 35.0,
    resets_at: '2026-02-22T03:59:59.943679+00:00',
    tokens_used: 35000,
    tokens_limit: 100000,
  },
};

// Fixture: minimal response (no optional fields)
const FIXTURE_MINIMAL: RawUsageResponse = {
  five_hour: {
    utilization: 0,
    resets_at: '2026-02-18T16:00:00.000Z',
  },
  seven_day: {
    utilization: 100,
    resets_at: '2026-02-22T04:00:00.000Z',
  },
};

suite('parseRawResponse', () => {
  test('maps five_hour utilization to fiveHour.percent', () => {
    const snap = parseRawResponse(FIXTURE_FULL, false);
    assert.strictEqual(snap.fiveHour.percent, 72.5);
  });

  test('maps seven_day utilization to weekly.percent', () => {
    const snap = parseRawResponse(FIXTURE_FULL, false);
    assert.strictEqual(snap.weekly.percent, 35.0);
  });

  test('parses token counts', () => {
    const snap = parseRawResponse(FIXTURE_FULL, false);
    assert.strictEqual(snap.fiveHour.tokensUsed, 55000);
    assert.strictEqual(snap.fiveHour.tokensLimit, 100000);
    assert.strictEqual(snap.weekly.tokensUsed, 35000);
  });

  test('parses resets_at into epoch ms', () => {
    const snap = parseRawResponse(FIXTURE_FULL, false);
    const expected = new Date('2026-02-18T15:59:59.943648+00:00').getTime();
    assert.strictEqual(snap.fiveHour.resetEpochMs, expected);
  });

  test('handles missing optional fields gracefully', () => {
    const snap = parseRawResponse(FIXTURE_MINIMAL, false);
    assert.strictEqual(snap.fiveHour.tokensUsed, undefined);
    assert.strictEqual(snap.fiveHour.tokensLimit, undefined);
    assert.strictEqual(snap.weekly.percent, 100);
  });

  test('includes raw when debugLogging is true', () => {
    const snap = parseRawResponse(FIXTURE_FULL, true);
    assert.deepStrictEqual(snap.raw, FIXTURE_FULL);
  });

  test('omits raw when debugLogging is false', () => {
    const snap = parseRawResponse(FIXTURE_FULL, false);
    assert.strictEqual(snap.raw, undefined);
  });

  test('updatedAtEpochMs is close to now', () => {
    const before = Date.now();
    const snap = parseRawResponse(FIXTURE_FULL, false);
    const after = Date.now();
    assert.ok(snap.updatedAtEpochMs >= before);
    assert.ok(snap.updatedAtEpochMs <= after);
  });
});
