"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HistoryStore = void 0;
const MAX_HISTORY_POINTS = 50;
const STORAGE_KEY = 'claudeUsage.history';
class HistoryStore {
    constructor(globalState) {
        this.globalState = globalState;
        this.history = globalState.get(STORAGE_KEY, []);
    }
    add(snapshot) {
        this.history.push({
            epochMs: snapshot.updatedAtEpochMs,
            fiveHourPercent: snapshot.fiveHour.percent,
            weeklyPercent: snapshot.weekly.percent,
        });
        if (this.history.length > MAX_HISTORY_POINTS) {
            this.history = this.history.slice(-MAX_HISTORY_POINTS);
        }
        this.globalState.update(STORAGE_KEY, this.history);
    }
    getLast(n = MAX_HISTORY_POINTS) {
        return this.history.slice(-n);
    }
    clear() {
        this.history = [];
        this.globalState.update(STORAGE_KEY, []);
    }
}
exports.HistoryStore = HistoryStore;
//# sourceMappingURL=HistoryStore.js.map