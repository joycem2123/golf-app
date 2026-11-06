import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyScoreEntry,
  type Course,
  type GameConfig,
  type HoleStats,
  type Player,
  type RecordedMatch,
  type ScoreConflictNotice,
  type ScoreLedger,
} from '@golf/engine';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Recurrence } from '@/lib/dates';
import type { GameDraft } from '@/lib/games';

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** This device's scorekeeper id. Replaced by the signed-in user once accounts exist. */
export const DEVICE_USER = 'this-device';

export interface SavedPlayer {
  id: string;
  name: string;
  handicapIndex: number;
  gender: 'M' | 'F';
  firstName?: string;
  lastName?: string;
  /** Set for people on MatchDay (their account id is also their player id). */
  userId?: string;
  username?: string;
  /** I sent them a friend request that they haven't accepted yet. */
  pending?: boolean;
}

export interface RoundRecord {
  id: string;
  createdAt: number;
  courseId: string;
  /** The course as it was when the round was played (so later course edits don't change it). */
  course?: Course;
  /** Handicap indexes are locked in when the round is created. */
  players: Player[];
  /** games[0] is the main game; the rest are side games / side matches. */
  games: GameConfig[];
  statsEnabled: boolean;
  ledger: ScoreLedger;
  stats: Record<string, (HoleStats | null)[]>;
  currentHole: number;
  /** Hole each match is on, by game id (several matches play at once). */
  matchHoles?: Record<string, number>;
  /** AI-written match stories, by game id (shared with everyone in the round). */
  stories?: Record<string, string>;
  status: 'active' | 'complete';
  completedAt?: number;
  notices: (ScoreConflictNotice & { at: number })[];
  /** Set when the round is part of a trip, cup or season. */
  eventId?: string;
  /** e.g. "Day 1 · Best Ball" */
  label?: string;
  /** Team letter for each player, from the Teams step ("A", "B", "C"…). */
  teamOf?: Record<string, string>;
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

/** A match planned ahead of time on an event's schedule. */
export interface ScheduledMatch {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, 24-hour */
  time?: string;
  courseId?: string;
  /** Game format (see lib/games GameKind). */
  kind?: string;
  sideA: string[];
  sideB: string[];
  label?: string;
  notes?: string;
  /** Set once the match has been started. */
  roundId?: string;
}

export interface EventTeam {
  name: string;
  playerIds: string[];
}

/** A round planned when the event is created: its date, format and matchups. */
export interface EventRound {
  id: string;
  /** 1-based. */
  number: number;
  /** YYYY-MM-DD */
  date?: string;
  /** Format, handicap options and matchups (set up like a New Round's game step). */
  draft?: GameDraft;
  /** Set once the round has been started. */
  roundId?: string;
  /** Matchups to be decided when the round is played. */
  matchupsLater?: boolean;
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
  schedule?: ScheduledMatch[];
  /** YYYY-MM-DD */
  startDate?: string;
  endDate?: string;
  /** Seasons: when rounds are played. */
  recurrence?: Recurrence;
  /** Team letter for each player (from the Teams step). */
  teamOf?: Record<string, string>;
  teamLetters?: string[];
  /** The rounds of the event, in order. */
  rounds?: EventRound[];
}

interface State {
  players: SavedPlayer[];
  rounds: RoundRecord[];
  history: RecordedMatch[];
  events: EventRecord[];
  /** Signed-in user id (null = not signed in). */
  me: string | null;
  /** The user has been through the welcome screen (signed in, signed up or chose guest). */
  onboarded: boolean;
  /** The saved player who is "Me". */
  myPlayerId: string | null;
  /** Other player ids that are also me (e.g. how someone else's round listed me). */
  meAliases: string[];
  /** Rounds/events where the user said they aren't one of the players. */
  identityDismissed: string[];
  /** This account said the pre-separation data on this phone isn't theirs. */
  legacyDismissed: boolean;
  setLegacyDismissed: (v: boolean) => void;
  setMyPlayer: (id: string | null) => void;
  /** My unique @username (null until chosen). */
  myUsername: string | null;
  setMyUsername: (u: string | null) => void;
  /** Switch my player to a new id (my account id), keeping the old one as an alias. */
  replaceMyPlayerId: (newId: string) => void;
  addMeAlias: (id: string) => void;
  dismissIdentity: (key: string) => void;
  setOnboarded: (v: boolean) => void;
  /** Display names of other users, by user id. */
  names: Record<string, string>;
  outbox: OutboxItem[];
  /** Rounds whose game setup (wolf picks, presses, status) needs uploading. */
  dirtyRounds: string[];
  /** Events whose details or schedule need uploading. */
  dirtyEvents: string[];
  /** Rounds/events I deleted: the sync removes them online, and never downloads them again. */
  deleted: Record<string, Tombstone>;
  markDeletedDone: (ids: string[]) => void;
  /** My corrections to courses (rating, slope, pars, hole handicaps), by course id. */
  courseEdits: Record<string, Course>;
  /** Save a corrected course. `before` is the version rounds already played were using. */
  saveCourse: (course: Course, before: Course) => void;
  resetCourse: (id: string, before: Course) => void;
  saveScheduled: (eventId: string, m: ScheduledMatch) => void;
  /** Link a started round to the event round it was planned as. */
  setEventRoundId: (eventId: string, eventRoundId: string, roundId: string | undefined) => void;
  removeScheduled: (eventId: string, matchId: string) => void;
  clearDirtyEvents: (ids: string[]) => void;
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
  /** Results of a shared round someone else finished (for my records and head-to-head). */
  recordRemoteResults: (roundId: string, matches: RecordedMatch[]) => void;
  addEvent: (e: EventRecord) => void;
  /** A round added to an event as it's played ("play as you go"). */
  addEventRound: (eventId: string, round: EventRound) => void;
  updateEvent: (e: EventRecord) => void;
  deleteEvent: (id: string) => void;
  upsertPlayer: (p: SavedPlayer) => void;
  removePlayer: (id: string) => void;
  addRound: (r: RoundRecord) => void;
  /** now: skip the undo window (Quit round). */
  deleteRound: (id: string, opts?: { now?: boolean }) => void;
  /** Put back a deleted round (Undo). */
  restoreRound: (r: RoundRecord, matches: RecordedMatch[]) => void;
  /** Put back a deleted event and re-link its rounds (Undo). */
  restoreEvent: (e: EventRecord, roundIds: string[]) => void;
  setScore: (roundId: string, key: string, hole: number, gross: number | null) => void;
  setStats: (roundId: string, playerId: string, hole: number, stats: HoleStats | null) => void;
  setHole: (roundId: string, hole: number, gameId?: string) => void;
  updateGame: (roundId: string, index: number, game: GameConfig) => void;
  completeRound: (roundId: string, matches: RecordedMatch[]) => void;
  setStory: (roundId: string, gameId: string, story: string) => void;
  reopenRound: (roundId: string) => void;
  dismissNotices: (roundId: string) => void;
}

/** Remote rounds the user can edit get queued for upload. */
const dirty = (s: { rounds: RoundRecord[]; dirtyRounds: string[] }, roundId: string) => {
  const r = s.rounds.find((x) => x.id === roundId);
  return r?.remote && r.remote.role !== 'viewer' && !s.dirtyRounds.includes(roundId) ? [...s.dirtyRounds, roundId] : s.dirtyRounds;
};

const dirtyEvent = (s: { events: EventRecord[]; dirtyEvents: string[] }, eventId: string) => {
  const e = s.events.find((x) => x.id === eventId);
  return e?.remote && e.remote.role !== 'viewer' && !s.dirtyEvents.includes(eventId) ? [...s.dirtyEvents, eventId] : s.dirtyEvents;
};

export const STORE_VERSION = 7;

/** Everything an account saves, empty. */
export interface Tombstone {
  kind: 'round' | 'event';
  /** When it was deleted (the server copy goes once the undo window has passed). */
  at: number;
  /** I own it (delete it for everyone) or just joined it (leave it). */
  owner: boolean;
  online: boolean;
  /** Done online. */
  done?: boolean;
}

/** How long Undo is offered before a delete reaches the server. */
export const UNDO_WINDOW_MS = 6000;

export const EMPTY_DATA = {
  players: [] as SavedPlayer[],
  rounds: [] as RoundRecord[],
  history: [] as RecordedMatch[],
  events: [] as EventRecord[],
  me: null as string | null,
  onboarded: false,
  myPlayerId: null as string | null,
  meAliases: [] as string[],
  identityDismissed: [] as string[],
  legacyDismissed: false,
  myUsername: null as string | null,
  names: {} as Record<string, string>,
  outbox: [] as OutboxItem[],
  dirtyRounds: [] as string[],
  dirtyEvents: [] as string[],
  deleted: {} as Record<string, Tombstone>,
  courseEdits: {} as Record<string, Course>,
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
      onboarded: false,
      setOnboarded: (v) => set({ onboarded: v }),
      myPlayerId: null,
      meAliases: [],
      identityDismissed: [],
      legacyDismissed: false,
      setLegacyDismissed: (v) => set({ legacyDismissed: v }),
      setMyPlayer: (id) => set({ myPlayerId: id }),
      myUsername: null,
      setMyUsername: (u) => set({ myUsername: u }),
      replaceMyPlayerId: (newId) =>
        set((s) => {
          const old = s.myPlayerId;
          const me = s.players.find((p) => p.id === old);
          if (!old || !me || old === newId) return {};
          const swap = (ids: string[]) => ids.map((id) => (id === old ? newId : id));
          const events = s.events.map((e) => ({
            ...e,
            playerIds: swap(e.playerIds),
            lockedIndexes: Object.fromEntries(Object.entries(e.lockedIndexes).map(([k, v]) => [k === old ? newId : k, v])),
            teams: e.teams ? { A: { ...e.teams.A, playerIds: swap(e.teams.A.playerIds) }, B: { ...e.teams.B, playerIds: swap(e.teams.B.playerIds) } } : undefined,
            schedule: e.schedule?.map((m) => ({ ...m, sideA: swap(m.sideA), sideB: swap(m.sideB) })),
          }));
          return {
            players: [...s.players.filter((p) => p.id !== old && p.id !== newId), { ...me, id: newId, userId: newId }],
            myPlayerId: newId,
            meAliases: s.meAliases.includes(old) ? s.meAliases : [...s.meAliases, old],
            events,
          };
        }),
      addMeAlias: (id) => set((s) => ({ meAliases: s.meAliases.includes(id) ? s.meAliases : [...s.meAliases, id] })),
      dismissIdentity: (key) => set((s) => ({ identityDismissed: [...s.identityDismissed, key] })),
      names: {},
      outbox: [],
      dirtyRounds: [],
      dirtyEvents: [],
      deleted: {},
      courseEdits: {},
      // Rounds already played keep the course they were played on.
      saveCourse: (course, before) =>
        set((s) => ({
          courseEdits: { ...s.courseEdits, [course.id]: course },
          rounds: s.rounds.map((r) => (r.courseId === course.id && !r.course ? { ...r, course: before } : r)),
        })),
      resetCourse: (id, before) =>
        set((s) => ({
          courseEdits: Object.fromEntries(Object.entries(s.courseEdits ?? {}).filter(([k]) => k !== id)),
          rounds: s.rounds.map((r) => (r.courseId === id && !r.course ? { ...r, course: before } : r)),
        })),
      markDeletedDone: (ids) =>
        set((s) => ({ deleted: Object.fromEntries(Object.entries(s.deleted ?? {}).map(([k, t]) => [k, ids.includes(k) ? { ...t, done: true } : t])) })),

      setEventRoundId: (eventId, eventRoundId, roundId) =>
        set((s) => ({
          events: s.events.map((e) => (e.id === eventId ? { ...e, rounds: e.rounds?.map((x) => (x.id === eventRoundId ? { ...x, roundId } : x)) } : e)),
          dirtyEvents: dirtyEvent(s, eventId),
        })),
      saveScheduled: (eventId, m) =>
        set((s) => ({
          events: s.events.map((e) => {
            if (e.id !== eventId) return e;
            const list = e.schedule ?? [];
            const schedule = list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m];
            return { ...e, schedule };
          }),
          dirtyEvents: dirtyEvent(s, eventId),
        })),
      removeScheduled: (eventId, matchId) =>
        set((s) => ({
          events: s.events.map((e) => (e.id === eventId ? { ...e, schedule: (e.schedule ?? []).filter((x) => x.id !== matchId) } : e)),
          dirtyEvents: dirtyEvent(s, eventId),
        })),
      clearDirtyEvents: (ids) => set((s) => ({ dirtyEvents: s.dirtyEvents.filter((id) => !ids.includes(id)) })),

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
          if (s.deleted?.[round.id]) return {}; // I deleted it: don't bring it back
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
              teamOf: round.teamOf ?? r.teamOf,
              course: round.course ?? r.course,
              stories: { ...round.stories, ...r.stories },
              remote: r.remote?.role === 'owner' ? r.remote : round.remote ?? r.remote,
            })),
          };
        }),

      recordRemoteResults: (roundId, matches) =>
        set((s) => ({
          history: [...s.history.filter((m) => m.eventId !== roundId), ...matches],
          rounds: mapRound(s.rounds, roundId, (r) => ({ ...r, completedAt: r.completedAt ?? Date.now() })),
        })),

      upsertRemoteEvent: (e) =>
        set((s) => (s.deleted?.[e.id] ? {} : {
          events: s.events.some((x) => x.id === e.id)
            ? s.events.map((x) =>
                x.id === e.id
                  ? { ...e, schedule: s.dirtyEvents.includes(e.id) ? x.schedule : e.schedule, remote: x.remote?.role === 'owner' ? x.remote : e.remote }
                  : x,
              )
            : [e, ...s.events],
        })),

      addEvent: (e) => set((s) => ({ events: [e, ...s.events] })),
      addEventRound: (eventId, round) =>
        set((s) => ({
          events: s.events.map((e) => (e.id === eventId ? { ...e, rounds: [...(e.rounds ?? []), { ...round, number: (e.rounds?.length ?? 0) + 1 }] } : e)),
          dirtyEvents: dirtyEvent(s, eventId),
        })),
      updateEvent: (e) => set((s) => ({ events: s.events.map((x) => (x.id === e.id ? e : x)) })),
      deleteEvent: (id) =>
        set((s) => {
          const e = s.events.find((x) => x.id === id);
          return {
            events: s.events.filter((x) => x.id !== id),
            rounds: s.rounds.map((r) => (r.eventId === id ? { ...r, eventId: undefined } : r)),
            deleted: { ...s.deleted, [id]: { kind: 'event', at: Date.now(), owner: e?.remote?.role === 'owner', online: !!e?.remote } },
          };
        }),

      upsertPlayer: (p) =>
        set((s) => ({ players: s.players.some((x) => x.id === p.id) ? s.players.map((x) => (x.id === p.id ? p : x)) : [...s.players, p] })),
      removePlayer: (id) => set((s) => ({ players: s.players.filter((p) => p.id !== id) })),

      addRound: (r) => set((s) => ({ rounds: [r, ...s.rounds] })),
      restoreRound: (r, matches) =>
        set((s) => ({
          deleted: Object.fromEntries(Object.entries(s.deleted ?? {}).filter(([k]) => k !== r.id)),
          rounds: s.rounds.some((x) => x.id === r.id) ? s.rounds : [...s.rounds, r].sort((a, b) => b.createdAt - a.createdAt),
          history: [...s.history.filter((m) => m.eventId !== r.id), ...matches],
        })),
      restoreEvent: (e, roundIds) =>
        set((s) => ({
          deleted: Object.fromEntries(Object.entries(s.deleted ?? {}).filter(([k]) => k !== e.id)),
          events: s.events.some((x) => x.id === e.id) ? s.events : [...s.events, e].sort((a, b) => b.createdAt - a.createdAt),
          rounds: s.rounds.map((r) => (roundIds.includes(r.id) ? { ...r, eventId: e.id } : r)),
        })),
      deleteRound: (id, opts) =>
        set((s) => ({
          deleted: (() => {
            const r = s.rounds.find((x) => x.id === id);
            return { ...s.deleted, [id]: { kind: 'round' as const, at: opts?.now ? 0 : Date.now(), owner: r?.remote?.role === 'owner', online: !!r?.remote } };
          })(),
          rounds: s.rounds.filter((r) => r.id !== id),
          history: s.history.filter((m) => m.eventId !== id),
          events: s.events.map((e) => {
            let next = e;
            if (e.schedule?.some((m) => m.roundId === id)) next = { ...next, schedule: e.schedule.map((m) => (m.roundId === id ? { ...m, roundId: undefined } : m)) };
            if (e.rounds?.some((x) => x.roundId === id)) next = { ...next, rounds: e.rounds.map((x) => (x.roundId === id ? { ...x, roundId: undefined } : x)) };
            return next;
          }),
          dirtyEvents: [
            ...s.dirtyEvents,
            ...s.events
              .filter((e) => e.remote && e.remote.role !== 'viewer' && (e.schedule?.some((m) => m.roundId === id) || e.rounds?.some((x) => x.roundId === id)) && !s.dirtyEvents.includes(e.id))
              .map((e) => e.id),
          ],
        })),

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

      setHole: (roundId, hole, gameId) =>
        set((s) => ({
          rounds: mapRound(s.rounds, roundId, (r) =>
            gameId ? { ...r, matchHoles: { ...r.matchHoles, [gameId]: hole } } : { ...r, currentHole: hole },
          ),
        })),

      updateGame: (roundId, index, game) =>
        set((s) => ({
          rounds: mapRound(s.rounds, roundId, (r) => ({ ...r, games: r.games.map((g, i) => (i === index ? game : g)) })),
          dirtyRounds: dirty(s, roundId),
        })),

      setStory: (roundId, gameId, story) =>
        set((s) => ({
          rounds: mapRound(s.rounds, roundId, (r) => ({ ...r, stories: { ...r.stories, [gameId]: story } })),
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
      // Each account has its own saved data; see store/accounts.ts, which picks the name and loads it.
      name: 'golf-app:guest',
      skipHydration: true,
      storage: createJSONStorage(() => AsyncStorage),
      version: STORE_VERSION,
      migrate: (state) =>
        ({ events: [], names: {}, outbox: [], dirtyRounds: [], dirtyEvents: [], me: null, onboarded: false, myPlayerId: null, meAliases: [], identityDismissed: [], myUsername: null, legacyDismissed: false, ...(state as object) }) as unknown as State,
    },
  ),
);

export const useRound = (id: string | undefined) => useStore((s) => s.rounds.find((r) => r.id === id));
export const useEvent = (id: string | undefined) => useStore((s) => s.events.find((e) => e.id === id));
