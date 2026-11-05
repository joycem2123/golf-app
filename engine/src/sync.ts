/**
 * Several people can keep score for a group, sometimes offline. Rule: the
 * latest entry wins, and if it replaces a different score someone else
 * entered, the group gets a notification.
 */
import type { Scorecard } from './types';

export interface ScoreEntry {
  /** Scorecard key: player id (or team id). */
  key: string;
  /** 1-based hole number. */
  hole: number;
  gross: number;
  /** User id of the scorekeeper. */
  enteredBy: string;
  /** When it was entered on the device (ms since epoch), not when it synced. */
  enteredAt: number;
}

export type ScoreLedger = Record<string, ScoreEntry>;

export interface ScoreConflictNotice {
  key: string;
  hole: number;
  keptGross: number;
  replacedGross: number;
  keptBy: string;
  replacedBy: string;
}

const slot = (key: string, hole: number) => `${key}#${hole}`;

export function applyScoreEntry(
  ledger: ScoreLedger,
  entry: ScoreEntry,
): { ledger: ScoreLedger; notice: ScoreConflictNotice | null } {
  const k = slot(entry.key, entry.hole);
  const existing = ledger[k];
  if (!existing) return { ledger: { ...ledger, [k]: entry }, notice: null };

  const incomingWins = entry.enteredAt >= existing.enteredAt;
  const kept = incomingWins ? entry : existing;
  const replaced = incomingWins ? existing : entry;
  const next = { ...ledger, [k]: kept };

  const conflict = kept.gross !== replaced.gross && kept.enteredBy !== replaced.enteredBy;
  return {
    ledger: next,
    notice: conflict
      ? {
          key: entry.key,
          hole: entry.hole,
          keptGross: kept.gross,
          replacedGross: replaced.gross,
          keptBy: kept.enteredBy,
          replacedBy: replaced.enteredBy,
        }
      : null,
  };
}

export function ledgerToScorecard(ledger: ScoreLedger, keys: string[], holeCount = 18): Scorecard {
  const card: Scorecard = Object.fromEntries(keys.map((k) => [k, new Array(holeCount).fill(null)]));
  for (const e of Object.values(ledger)) {
    if (card[e.key] && e.hole >= 1 && e.hole <= holeCount) card[e.key][e.hole - 1] = e.gross;
  }
  return card;
}
