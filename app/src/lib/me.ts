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
  const friends = others.filter((p) => !p.pending && !p.notFriend);
  /** People I've sent a friend request to who haven't accepted yet. */
  const requested = others.filter((p) => p.pending && !p.notFriend);
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

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * In a round with no "Me", find the player who is probably me by name:
 * my full name, or my first name when exactly one player in the round has it.
 */
export function guessMeIn(players: { id: string; name: string }[], myName: string): string | null {
  const full = norm(myName);
  if (!full) return null;
  const exact = players.filter((p) => norm(p.name) === full);
  if (exact.length === 1) return exact[0].id;
  const first = full.split(' ')[0];
  const byFirst = players.filter((p) => norm(p.name) === first || norm(p.name).split(' ')[0] === first);
  return byFirst.length === 1 ? byFirst[0].id : null;
}

/** Rounds I finished in that don't know which player was me yet (and I haven't said "not me"). */
export function roundsMissingMe(state = useStore.getState()) {
  const mine = (id: string) => id === state.myPlayerId || state.meAliases.includes(id);
  return state.rounds.filter((r) => r.status === 'complete' && !r.players.some((p) => mine(p.id)) && !state.identityDismissed.includes(r.id));
}

/** Link "Me" to my player in older rounds by name, so they count in my stats. */
export function autoLinkMyRounds() {
  const st = useStore.getState();
  const me = st.players.find((p) => p.id === st.myPlayerId);
  if (!me) return;
  for (const r of roundsMissingMe(st)) {
    const id = guessMeIn(r.players, me.name);
    if (id) useStore.getState().addMeAlias(id);
  }
}
