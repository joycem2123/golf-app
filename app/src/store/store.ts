import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyScoreEntry,
  type GameConfig,
  type HoleStats,
  type Player,
  type RecordedMatch,
  type ScoreConflictNotice,
  type ScoreLedger,
} from '@golf/engine';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** This device's scorekeeper id. Replaced by the signed-in user once accounts exist. */
export const DEVICE_USER = 'this-device';

export interface SavedPlayer {
  id: string;
  name: string;
  handicapIndex: number;
  gender: 'M' | 'F';
}

export interface RoundRecord {
  id: string;
  createdAt: number;
  courseId: string;
  /** Handicap indexes are locked in when the round is created. */
  players: Player[];
  /** games[0] is the main game; the rest are side games / side matches. */
  games: GameConfig[];
  statsEnabled: boolean;
  ledger: ScoreLedger;
  stats: Record<string, (HoleStats | null)[]>;
  currentHole: number;
  status: 'active' | 'complete';
  completedAt?: number;
  notices: (ScoreConflictNotice & { at: number })[];
  /** Set when the round is part of a trip, cup or season. */
  eventId?: string;
  /** e.g. "Day 1 · Best Ball" */
  label?: string;
}

export type EventType = 'trip' | 'cup' | 'season';

export interface EventTeam {
  name: string;
  playerIds: string[];
}

export interface EventRecord {
  id: string;
  name: string;
  type: EventType;
  createdAt: number;
  playerIds: string[];
  /** Handicap indexes snapshotted when the event started (used if lockHandicaps). */
  lockHandicaps: boolean;
  lockedIndexes: Record<string, number>;
  /** Ryder Cup style only. */
  teams?: { A: EventTeam; B: EventTeam };
  /** Team that keeps the cup on a tie. */
  holder?: 'A' | 'B';
  /** Total points on offer across the whole cup (decides how many are needed to win). */
  cupPoints?: number;
  /** Season/trip standings points. */
  points: { win: number; halve: number; loss: number };
  status: 'active' | 'complete';
}

interface State {
  players: SavedPlayer[];
  rounds: RoundRecord[];
  history: RecordedMatch[];
  events: EventRecord[];
  addEvent: (e: EventRecord) => void;
  updateEvent: (e: EventRecord) => void;
  deleteEvent: (id: string) => void;
  upsertPlayer: (p: SavedPlayer) => void;
  removePlayer: (id: string) => void;
  addRound: (r: RoundRecord) => void;
  deleteRound: (id: string) => void;
  setScore: (roundId: string, key: string, hole: number, gross: number | null) => void;
  setStats: (roundId: string, playerId: string, hole: number, stats: HoleStats | null) => void;
  setHole: (roundId: string, hole: number) => void;
  updateGame: (roundId: string, index: number, game: GameConfig) => void;
  completeRound: (roundId: string, matches: RecordedMatch[]) => void;
  reopenRound: (roundId: string) => void;
  dismissNotices: (roundId: string) => void;
}

const mapRound = (rounds: RoundRecord[], id: string, fn: (r: RoundRecord) => RoundRecord) =>
  rounds.map((r) => (r.id === id ? fn(r) : r));

export const useStore = create<State>()(
  persist(
    (set) => ({
      players: [],
      rounds: [],
      history: [],
      events: [],

      addEvent: (e) => set((s) => ({ events: [e, ...s.events] })),
      updateEvent: (e) => set((s) => ({ events: s.events.map((x) => (x.id === e.id ? e : x)) })),
      deleteEvent: (id) =>
        set((s) => ({ events: s.events.filter((e) => e.id !== id), rounds: s.rounds.map((r) => (r.eventId === id ? { ...r, eventId: undefined } : r)) })),

      upsertPlayer: (p) =>
        set((s) => ({ players: s.players.some((x) => x.id === p.id) ? s.players.map((x) => (x.id === p.id ? p : x)) : [...s.players, p] })),
      removePlayer: (id) => set((s) => ({ players: s.players.filter((p) => p.id !== id) })),

      addRound: (r) => set((s) => ({ rounds: [r, ...s.rounds] })),
      deleteRound: (id) =>
        set((s) => ({ rounds: s.rounds.filter((r) => r.id !== id), history: s.history.filter((m) => m.eventId !== id) })),

      setScore: (roundId, key, hole, gross) =>
        set((s) => ({
          rounds: mapRound(s.rounds, roundId, (r) => {
            if (gross === null) {
              const ledger = { ...r.ledger };
              delete ledger[`${key}#${hole}`];
              return { ...r, ledger };
            }
            const { ledger, notice } = applyScoreEntry(r.ledger, { key, hole, gross, enteredBy: DEVICE_USER, enteredAt: Date.now() });
            return { ...r, ledger, notices: notice ? [...r.notices, { ...notice, at: Date.now() }] : r.notices };
          }),
        })),

      setStats: (roundId, playerId, hole, stats) =>
        set((s) => ({
          rounds: mapRound(s.rounds, roundId, (r) => {
            const list = [...(r.stats[playerId] ?? new Array(18).fill(null))];
            list[hole - 1] = stats;
            return { ...r, stats: { ...r.stats, [playerId]: list } };
          }),
        })),

      setHole: (roundId, hole) => set((s) => ({ rounds: mapRound(s.rounds, roundId, (r) => ({ ...r, currentHole: hole })) })),

      updateGame: (roundId, index, game) =>
        set((s) => ({
          rounds: mapRound(s.rounds, roundId, (r) => ({ ...r, games: r.games.map((g, i) => (i === index ? game : g)) })),
        })),

      completeRound: (roundId, matches) =>
        set((s) => ({
          rounds: mapRound(s.rounds, roundId, (r) => ({ ...r, status: 'complete', completedAt: Date.now() })),
          history: [...s.history.filter((m) => m.eventId !== roundId), ...matches],
        })),

      reopenRound: (roundId) =>
        set((s) => ({
          rounds: mapRound(s.rounds, roundId, (r) => ({ ...r, status: 'active' })),
          history: s.history.filter((m) => m.eventId !== roundId),
        })),

      dismissNotices: (roundId) => set((s) => ({ rounds: mapRound(s.rounds, roundId, (r) => ({ ...r, notices: [] })) })),
    }),
    {
      name: 'golf-app-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (state) => ({ events: [], ...(state as object) }) as unknown as State,
    },
  ),
);

export const useRound = (id: string | undefined) => useStore((s) => s.rounds.find((r) => r.id === id));
export const useEvent = (id: string | undefined) => useStore((s) => s.events.find((e) => e.id === id));
