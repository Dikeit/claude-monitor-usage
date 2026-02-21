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
const assert = __importStar(require("assert"));
const AnthropicUsageClient_1 = require("../../usage/AnthropicUsageClient");
// Fixture: realistic API response
const FIXTURE_FULL = {
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
const FIXTURE_MINIMAL = {
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
        const snap = (0, AnthropicUsageClient_1.parseRawResponse)(FIXTURE_FULL, false);
        assert.strictEqual(snap.fiveHour.percent, 72.5);
    });
    test('maps seven_day utilization to weekly.percent', () => {
        const snap = (0, AnthropicUsageClient_1.parseRawResponse)(FIXTURE_FULL, false);
        assert.strictEqual(snap.weekly.percent, 35.0);
    });
    test('parses token counts', () => {
        const snap = (0, AnthropicUsageClient_1.parseRawResponse)(FIXTURE_FULL, false);
        assert.strictEqual(snap.fiveHour.tokensUsed, 55000);
        assert.strictEqual(snap.fiveHour.tokensLimit, 100000);
        assert.strictEqual(snap.weekly.tokensUsed, 35000);
    });
    test('parses resets_at into epoch ms', () => {
        const snap = (0, AnthropicUsageClient_1.parseRawResponse)(FIXTURE_FULL, false);
        const expected = new Date('2026-02-18T15:59:59.943648+00:00').getTime();
        assert.strictEqual(snap.fiveHour.resetEpochMs, expected);
    });
    test('handles missing optional fields gracefully', () => {
        const snap = (0, AnthropicUsageClient_1.parseRawResponse)(FIXTURE_MINIMAL, false);
        assert.strictEqual(snap.fiveHour.tokensUsed, undefined);
        assert.strictEqual(snap.fiveHour.tokensLimit, undefined);
        assert.strictEqual(snap.weekly.percent, 100);
    });
    test('includes raw when debugLogging is true', () => {
        const snap = (0, AnthropicUsageClient_1.parseRawResponse)(FIXTURE_FULL, true);
        assert.deepStrictEqual(snap.raw, FIXTURE_FULL);
    });
    test('omits raw when debugLogging is false', () => {
        const snap = (0, AnthropicUsageClient_1.parseRawResponse)(FIXTURE_FULL, false);
        assert.strictEqual(snap.raw, undefined);
    });
    test('updatedAtEpochMs is close to now', () => {
        const before = Date.now();
        const snap = (0, AnthropicUsageClient_1.parseRawResponse)(FIXTURE_FULL, false);
        const after = Date.now();
        assert.ok(snap.updatedAtEpochMs >= before);
        assert.ok(snap.updatedAtEpochMs <= after);
    });
});
//# sourceMappingURL=usageParser.test.js.map