import * as vscode from 'vscode';
import { UsageSnapshot } from '../usage/types';

const MAX_HISTORY_POINTS = 50;
const STORAGE_KEY = 'claudeUsage.history';

export interface HistoryPoint {
  epochMs: number;
  fiveHourPercent: number;
  weeklyPercent: number;
}

export class HistoryStore {
  private history: HistoryPoint[];

  constructor(private globalState: vscode.Memento) {
    this.history = globalState.get<HistoryPoint[]>(STORAGE_KEY, []);
  }

  add(snapshot: UsageSnapshot): void {
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

  getLast(n: number = MAX_HISTORY_POINTS): HistoryPoint[] {
    return this.history.slice(-n);
  }

  clear(): void {
    this.history = [];
    this.globalState.update(STORAGE_KEY, []);
  }
}
