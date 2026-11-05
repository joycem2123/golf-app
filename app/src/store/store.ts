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
  /** Set once the round is shared online (live leaderboard / other scorekeepers). */
  remote?: Remote;
}

export interface Remote {
  shareCode: string;
  role: 'owner' | 'scorer' | 'viewer';
}

/** A score waiting to be sent to the server (kept while offline). */
export interface OutboxItem {
  roundId: string;
  key: string;
  hole: number;
  gross: number | null;
  enteredAt: number;
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
  remote?: Remote;
}

interface State {
  players: SavedPlayer[];
  rounds: RoundRecord[];
  history: RecordedMatch[];
  events: EventRecord[];
  /** Signed-in user id (null = not signed in). */
  me: string | null;
  /** Display names of other users, by user id. */
  names: Record<string, string>;
  outbox: OutboxItem[];
  /** Rounds whose game setup (wolf picks, presses, status) needs uploading. */
  dirtyRounds: string[];
  setMe: (id: string | null) => void;
  setName: (id: string, name: string) => void;
  setRoundRemote: (roundId: string, remote: Remote) => void;
  setEventRemote: (eventId: string, remote: Remote) => void;
  removeOutbox: (items: OutboxItem[]) => void;
  clearDirty: (roundIds: string[]) => void;
  /** Merge scores that came from the server. */
  applyRemoteScores: (roundId: string, entries: { key: string; hole: number; gross: number | null; enteredBy: string; enteredAt: number }[]) => void;
  /** Insert or update a round that came from the server. */
  upsertRemoteRound: (round: RoundRecord) => void;
  upsertRemoteEvent: (e: EventRecord) => void;
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

/** Remote rounds the user can edit get queued for upload. */
const dirty = (s: { rounds: RoundRecord[]; dirtyRounds: string[] }, roundId: string) => {
  const r = s.rounds.find((x) => x.id === roundId);
  return r?.remote && r.remote.role !== 'viewer' && !s.dirtyRounds.includes(roundId) ? [...s.dirtyRounds, roundId] : s.dirtyRounds;
};

const mapRound = (rounds: RoundRecord[], id: string, fn: (r: RoundRecord) => RoundRecord) =>
  rounds.map((r) => (r.id === id ? fn(r) : r));

export const useStore = create<State>()(
  persist(
    (set) => ({
      players: [],
      rounds: [],
      history: [],
      events: [],
      me: null,
      names: {},
      outbox: [],
      dirtyRounds: [],

      setMe: (id) => set({ me: id }),
      setName: (id, name) => set((s) => ({ names: { ...s.names, [id]: name } })),
      setRoundRemote: (roundId, remote) => set((s) => ({ rounds: mapRound(s.rounds, roundId, (r) => ({ ...r, remote })) })),
      setEventRemote: (eventId, remote) => set((s) => ({ events: s.events.map((e) => (e.id === eventId ? { ...e, remote } : e)) })),
      removeOutbox: (items) => set((s) => ({ outbox: s.outbox.filter((o) => !items.includes(o)) })),
      clearDirty: (ids) => set((s) => ({ dirtyRounds: s.dirtyRounds.filter((id) => !ids.includes(id)) })),

      applyRemoteScores: (roundId, entries) =>
        set((s) => ({
          rounds: mapRound(s.rounds, roundId, (r) => {
            let ledger = r.ledger;
            const notices = [...r.notices];
            for (const e of entries) {
              const slot = `${e.key}#${e.hole}`;
              const existing = ledger[slot];
              if (e.gross === null) {
                if (existing && existing.enteredAt <= e.enteredAt) {
                  ledger = { ...ledger };
                  delete ledger[slot];
                }
                continue;
              }
              const res = applyScoreEntry(ledger, { key: e.key, hole: e.hole, gross: e.gross, enteredBy: e.enteredBy, enteredAt: e.enteredAt });
              ledger = res.ledger;
              if (res.notice) notices.push({ ...res.notice, at: Date.now() });
            }
            return { ...r, ledger, notices };
          }),
        })),

      upsertRemoteRound: (round) =>
        set((s) => {
          const existing = s.rounds.find((r) => r.id === round.id);
          if (!existing) return { rounds: [round, ...s.rounds] };
          // Keep local scores, stats and current hole; take the shared setup.
          return {
            rounds: mapRound(s.rounds, round.id, (r) => ({
              ...r,
              players: round.players,
              games: s.dirtyRounds.includes(r.id) ? r.games : round.games,
              status: s.dirtyRounds.includes(r.id) ? r.status : round.status,
              eventId: round.eventId ?? r.eventId,
              remote: r.remote?.role === 'owner' ? r.remote : round.remote ?? r.remote,
            })),
          };
        }),

      upsertRemoteEvent: (e) =>
        set((s) => ({
          events: s.events.some((x) => x.id === e.id)
            ? s.events.map((x) => (x.id === e.id ? { ...e, remote: x.remote?.role === 'owner' ? x.remote : e.remote } : x))
            : [e, ...s.events],
        })),

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
        set((s) => {
          const round = s.rounds.find((r) => r.id === roundId);
          if (round?.remote?.role === 'viewer') return {};
          const enteredAt = Date.now();
          const outbox = round?.remote ? [...s.outbox, { roundId, key, hole, gross, enteredAt }] : s.outbox;
          return {
          outbox,
          rounds: mapRound(s.rounds, roundId, (r) => {
            if (gross === null) {
              const ledger = { ...r.ledger };
              delete ledger[`${key}#${hole}`];
              return { ...r, ledger };
            }
            const { ledger, notice } = applyScoreEntry(r.ledger, { key, hole, gross, enteredBy: s.me ?? DEVICE_USER, enteredAt });
            return { ...r, ledger, notices: notice ? [...r.notices, { ...notice, at: Date.now() }] : r.notices };
          }),
          };
        }),

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
          dirtyRounds: dirty(s, roundId),
        })),

      completeRound: (roundId, matches) =>
        set((s) => ({
          rounds: mapRound(s.rounds, roundId, (r) => ({ ...r, status: 'complete', completedAt: Date.now() })),
          history: [...s.history.filter((m) => m.eventId !== roundId), ...matches],
          dirtyRounds: dirty(s, roundId),
        })),

      reopenRound: (roundId) =>
        set((s) => ({
          rounds: mapRound(s.rounds, roundId, (r) => ({ ...r, status: 'active' })),
          history: s.history.filter((m) => m.eventId !== roundId),
          dirtyRounds: dirty(s, roundId),
        })),

      dismissNotices: (roundId) => set((s) => ({ rounds: mapRound(s.rounds, roundId, (r) => ({ ...r, notices: [] })) })),
    }),
    {
      name: 'golf-app-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      migrate: (state) => ({ events: [], names: {}, outbox: [], dirtyRounds: [], me: null, ...(state as object) }) as unknown as State,
    },
  ),
);

export const useRound = (id: string | undefined) => useStore((s) => s.rounds.find((r) => r.id === id));
export const useEvent = (id: string | undefined) => useStore((s) => s.events.find((e) => e.id === id));
