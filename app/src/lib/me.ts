import type { RecordedMatch } from '@golf/engine';

import { useStore, type SavedPlayer } from '@/store/store';

/** Is this player id me (my own player, or an alias from someone else's round)? */
export function isMeId(id: string, state = useStore.getState()): boolean {
  return id === state.myPlayerId || state.meAliases.includes(id);
}

export function useMe() {
  const players = useStore((s) => s.players);
  const myPlayerId = useStore((s) => s.myPlayerId);
  const meAliases = useStore((s) => s.meAliases);
  const me: SavedPlayer | undefined = players.find((p) => p.id === myPlayerId);
  const isMe = (id: string) => id === myPlayerId || meAliases.includes(id);
  const others = players.filter((p) => !isMe(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const friends = others.filter((p) => !p.pending);
  /** People I've sent a friend request to who haven't accepted yet. */
  const requested = others.filter((p) => p.pending);
  return { me, isMe, friends, requested, myPlayerId };
}

/** Players with me first, then friends A–Z. */
export function meFirst<T extends { id: string; name: string }>(list: T[], isMe: (id: string) => boolean): T[] {
  return [...list].sort((a, b) => (isMe(a.id) ? -1 : isMe(b.id) ? 1 : a.name.localeCompare(b.name)));
}

/** Rewrite match history so every id that is me becomes my main player id (for records and head-to-head). */
export function normalizeMe(matches: RecordedMatch[], myId: string | null, aliases: string[]): RecordedMatch[] {
  if (!myId || aliases.length === 0) return matches;
  const fix = (ids: string[]) => ids.map((id) => (aliases.includes(id) ? myId : id));
  return matches.map((m) => ({ ...m, sideA: fix(m.sideA), sideB: fix(m.sideB) }));
}
