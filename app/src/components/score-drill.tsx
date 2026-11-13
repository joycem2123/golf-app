/**
 * Scores → Games → Events: each event opens out into its rounds, and each round into its matches.
 * Every level can be opened: the event page, the round's results (or live scoring), and a match's details.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { gameName } from '@/lib/games';
import { headline } from '@/lib/headline';
import { formatPoints } from '@/lib/events';
import { liveTeamScore, matchOutcomes, roundTeamScore } from '@/lib/results';
import { courseFor, evaluate, isResult, shortCourseName } from '@/lib/round';
import type { EventRecord, RoundRecord } from '@/store/store';
import { radius, space, useColors } from '@/theme';
import { namesFor, teamName, picksFor } from '@/lib/team-colors';
import { EventCard } from './cards';
import { ListSection } from './list-section';
import { formatDate, today } from '@/lib/dates';
import { TeamScoreLine, type LiveOverride } from './team-score-line';
import { canDeleteRound, SwipeToDelete } from './swipe-to-delete';
import { LiveMatchRow } from './match-strip';

/** An event card that opens out into its rounds. */
export interface DrillActions {
  /** Open a screen (friends' rounds are brought onto the phone first). Defaults to navigating. */
  open?: (path: string) => void;
  /** ⋯ on a round, keyed by round. */
  roundMore?: (r: RoundRecord) => void;
  /** ⋯ on a match in a round. */
  matchMore?: (r: RoundRecord, gi: number) => void;
  /** Followed marks. */
  isFollowing?: (r: RoundRecord, gi?: number) => boolean;
}

export function EventDrill({ e, rounds, onOpenEvent, onMore, following, nameOf, actions }: { e: EventRecord; rounds: RoundRecord[]; onOpenEvent?: () => void; onMore?: () => void; following?: boolean; nameOf?: (id: string) => string | undefined; actions?: DrillActions }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const mine = rounds.filter((r) => r.eventId === e.id).sort((a, b) => b.createdAt - a.createdAt);
  const planned = (e.rounds ?? []).filter((x) => !x.roundId || !mine.some((r) => r.id === x.roundId)).length;
  return (
    <View style={{ gap: 0 }}>
      <View>
        <EventCard e={e} rounds={rounds} hint={following ? '★ Following · Event page ›' : 'Event page ›'} onPress={onOpenEvent} nameOf={nameOf} />
        {onMore && <View style={{ position: 'absolute', top: 8, right: 8 }}><MoreButton small onPress={onMore} label={`Follow and notification options for ${e.name}`} /></View>}
      </View>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -6, paddingTop: 12, paddingBottom: 8, paddingHorizontal: space.lg, backgroundColor: pressed ? c.chip : c.primarySoft, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, zIndex: -1 })}>
        <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13 }}>
          {mine.length ? `${mine.length} round${mine.length === 1 ? '' : 's'} played` : 'No rounds played yet'}{planned ? ` · ${planned} to come` : ''}
        </Text>
        <Text style={{ color: c.primary, fontWeight: '800', fontSize: 13 }}>{open ? 'Hide ▴' : 'Show rounds ▾'}</Text>
      </Pressable>
      {open && (
        <View style={{ marginLeft: space.md, paddingLeft: space.md, borderLeftWidth: 2, borderLeftColor: c.accent, gap: space.sm, paddingTop: space.sm }}>
          {mine.map((r) => <RoundDrill key={r.id} r={r} e={e} actions={actions} />)}
          {mine.length === 0 && <Text style={{ color: c.muted, fontSize: 13, paddingVertical: space.sm }}>Rounds show here once they’re started.</Text>}
        </View>
      )}
    </View>
  );
}

const firstOf = (names: string) => names.split(' & ').map((n) => n.trim().split(' ')[0]).join(' & ');

/**
 * A round's title: "Round 4 · WP 2027" in an event; otherwise who's playing, "Matt vs Dave · Daily Match"
 * (team names when there are several matches between teams, or everyone's first names).
 */
export function roundTitle(r: RoundRecord, e: EventRecord | undefined, matches: ReturnType<typeof matchOutcomes>, teamLabel: (letter: string) => string): string {
  if (r.eventId) return [r.label ?? 'Round', e?.name].filter(Boolean).join(' · ');
  const cross = matches.filter((m) => m.a.letter !== m.b.letter || matches.length === 1);
  let who: string;
  if (cross.length === 1) who = `${firstOf(cross[0].a.names)} vs ${firstOf(cross[0].b.names)}`;
  else if (cross.length > 1 && r.teamOf && Object.keys(r.teamOf).length) {
    const letters = [...new Set(cross.flatMap((m) => [m.a.letter, m.b.letter]))].sort();
    who = letters.map(teamLabel).join(' vs ');
  } else who = r.players.map((p) => p.name.split(' ')[0]).join(', ');
  return `${who} · Daily Match`;
}

/** A round in an event: tap for its results (or live scoring), open it out for its matches. */
export function RoundDrill({ r, e, actions }: { r: RoundRecord; e?: EventRecord; actions?: DrillActions }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const results = evaluate(r);
  const matches = matchOutcomes(r, results).filter((m) => !(r.games[m.gi].id ?? '').startsWith('side-'));
  const score = roundTeamScore(r, results);
  const summary = !score && results[0] && isResult(results[0]) ? results[0].summary : null;
  const live = r.status === 'active';
  const liveScore = live && score ? liveState(r, results, matches, (L) => teamName(L, namesFor(r, e))) : null;
  let course = '';
  try { course = shortCourseName(courseFor(r).name); } catch { /* course missing */ }
  const date = new Date(r.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const go = actions?.open ?? ((path: string) => router.push(path as never));
  const goRound = () => go(live ? `/round/${r.id}` : `/round/${r.id}/results`);
  const following = actions?.isFollowing?.(r) ?? false;
  const title = roundTitle(r, e, matches, (L) => teamName(L, namesFor(r, e)));
  const more = actions?.roundMore;
  return (
    <View style={{ backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md }}>
        <Pressable onPress={goRound} style={({ pressed }) => ({ flex: 1, gap: 2, opacity: pressed ? 0.6 : 1, paddingRight: more ? 30 : 0 })} accessibilityRole="button" accessibilityLabel={`${r.label ?? 'Round'} ${live ? 'live scoring' : 'results'}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, color: c.text, fontWeight: '800', fontSize: 15 }}>{title}</Text>
            <View style={{ backgroundColor: live ? c.under : c.primary, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>{live ? 'LIVE' : 'FINAL'}</Text>
            </View>
            {following && <Text style={{ color: c.accent, fontSize: 11, fontWeight: '800' }}>★ FOLLOWING</Text>}
          </View>
          <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{[date, course, gameName(r.games[0]), e ? null : r.players.map((p) => p.name.split(' ')[0]).join(', ')].filter(Boolean).join(' · ')}</Text>
          {score ? (
            <View style={{ marginTop: 4 }}>
              <TeamScoreLine picks={picksFor(r, e)} done={!live} live={liveScore} teams={score.map((t) => ({ letter: t.letter, name: teamName(t.letter, namesFor(r, e)), points: t.points }))} />
            </View>
          ) : summary ? (
            <Text numberOfLines={2} style={{ color: c.text, fontSize: 13 }}>{summary}</Text>
          ) : null}
          <Text style={{ color: c.primary, fontWeight: '700', fontSize: 12, marginTop: 2 }}>{live ? 'Live scoring ›' : 'Round results ›'}</Text>
        </Pressable>
        {/* Follow / alerts, tucked into the top-right corner. */}
        {more && <View style={{ position: 'absolute', top: 6, right: 6 }}><MoreButton small onPress={() => more(r)} label="Follow and notification options for this round" /></View>}
      </View>
      {/* The matches open out below, slim scoreboard lines like the event page; the bar across the bottom opens them. */}
      {open && matches.length > 0 && (
        <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg, padding: 6, gap: 4 }}>
          {matches.map((m) => (
            <View key={m.gi} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ flex: 1 }}>
                <LiveMatchRow compact r={r} results={results} m={m} leftLetter={e?.teams ? 'A' : e?.teamLetters?.[0]} picks={picksFor(r, e)} onPress={() => go(`/round/${r.id}/match/${m.gi}`)} />
              </View>
              {actions?.matchMore && live ? <MoreButton small onPress={() => actions.matchMore!(r, m.gi)} label={`Follow and notification options for ${m.title}`} /> : null}
            </View>
          ))}
        </View>
      )}
      {matches.length > 0 && (
        <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={open ? 'Hide matches' : 'Show matches'}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: pressed ? c.chip : c.primarySoft })}>
          <Text style={{ color: c.primary, fontWeight: '800', fontSize: 13 }}>
            {open ? 'Hide matches ▴' : `Show ${matches.length} match${matches.length === 1 ? '' : 'es'} ▾`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * A live round's team match as it stands now, like the live scoring screen. One match: each team's
 * margin ("1 UP" / "1 DN") and "TEAM A 1 UP THRU 6". Several: matches won so far, and who's ahead in the rest.
 */
function liveState(r: RoundRecord, results: ReturnType<typeof evaluate>, matches: ReturnType<typeof matchOutcomes>, name: (L: string) => string): LiveOverride | null {
  const cross = matches.filter((m) => m.a.letter !== m.b.letter);
  if (cross.length === 1) {
    const m = cross[0];
    const res = results[m.gi];
    if (m.winner || !res || !isResult(res)) return null;
    const h = headline(res, r.players);
    const thru = h.small.toLowerCase();
    if (thru === 'not started') return { values: { [m.a.letter]: '–', [m.b.letter]: '–' }, leader: null, caption: 'NOT STARTED' };
    const margin = h.big.match(/^(\d+) UP/)?.[1];
    if (h.side === null || !margin) return { values: { [m.a.letter]: 'AS', [m.b.letter]: 'AS' }, leader: null, caption: `ALL SQUARE ${thru.toUpperCase()}` };
    const up = h.side === 0 ? m.a.letter : m.b.letter;
    const down = h.side === 0 ? m.b.letter : m.a.letter;
    return { values: { [up]: `${margin} UP`, [down]: `${margin} DN` }, leader: up, caption: `${name(up).toUpperCase()} ${margin} UP ${thru.toUpperCase()}` };
  }
  // Several matches: points won so far stay in the boxes; the caption says who's ahead in the rest.
  const ls = liveTeamScore(r, results);
  if (!ls || ls.live === 0) return null;
  const top = [...ls.teams].sort((x, y) => y.projected - x.projected);
  const ahead = ls.teams.filter((t) => t.leading > 0).map((t) => `${name(t.letter).toUpperCase()} AHEAD IN ${t.leading} MATCH${t.leading === 1 ? '' : 'ES'}`);
  if (ls.square) ahead.push(`${ls.square} ALL SQUARE`);
  ahead.push(`PROJ ${ls.teams.map((t) => formatPoints(t.projected)).join("–")}`);
  const leader = top.length >= 2 && top[0].projected > top[1].projected ? top[0].letter : null;
  return { values: {}, leader, caption: ahead.join(' · ') };
}

/**
 * My rounds in three sections: in progress, coming up (planned event rounds) and completed (folded away
 * to start). Each shows four, then "Show more".
 */
export function MyRounds({ rounds, events, onDelete, actions, upcomingSlot, emptyLive, emptyDone }: {
  rounds: RoundRecord[];
  events: EventRecord[];
  onDelete?: (id: string) => void;
  actions?: DrillActions;
  /** Friends' view: its own upcoming list (with ⋯), in place of my planned event rounds. */
  upcomingSlot?: { count: number; items: React.ReactNode };
  emptyLive?: string;
  emptyDone?: string;
}) {
  const c = useColors();
  const live = rounds.filter((r) => r.status === 'active').sort((a, b) => b.createdAt - a.createdAt);
  const done = rounds.filter((r) => r.status === 'complete').sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt));
  const from = today();
  const upcoming = events
    .filter((e) => e.remote?.role !== 'viewer')
    .flatMap((e) => (e.rounds ?? []).filter((p) => !p.roundId && p.date && p.date >= from).map((p) => ({ e, p })))
    .sort((a, b) => (a.p.date ?? '').localeCompare(b.p.date ?? ''));
  const eventOf = (r: RoundRecord) => (r.eventId ? events.find((e) => e.id === r.eventId) : undefined);
  const item = (r: RoundRecord) =>
    onDelete && canDeleteRound(r) && r.remote?.role !== 'viewer' ? (
      <SwipeToDelete key={r.id} label="round" onDelete={() => onDelete(r.id)}><RoundDrill r={r} e={eventOf(r)} actions={actions} /></SwipeToDelete>
    ) : (
      <RoundDrill key={r.id} r={r} e={eventOf(r)} actions={actions} />
    );
  return (
    <View style={{ gap: space.md }}>
      <ListSection title="In progress" count={live.length} empty={emptyLive ?? 'No rounds in play. Start one from Home.'}>{live.map(item)}</ListSection>
      {upcomingSlot ? (
        <ListSection title="Upcoming" count={upcomingSlot.count} empty="No rounds coming up.">{upcomingSlot.items}</ListSection>
      ) : (
      <ListSection title="Upcoming" count={upcoming.length} empty="Nothing planned. Add rounds to an event to see them here.">
        {upcoming.map(({ e, p }) => (
          <Pressable key={`${e.id}:${p.id}`} onPress={() => router.push(`/event/${e.id}`)} accessibilityRole="button"
            style={({ pressed }) => ({ backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: space.md, gap: 2, opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 15 }}>Round {p.number} · {e.name}</Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>{p.date ? formatDate(p.date) : ''}</Text>
            <Text style={{ color: c.primary, fontWeight: '700', fontSize: 12, marginTop: 2 }}>Event page ›</Text>
          </Pressable>
        ))}
      </ListSection>
      )}
      <ListSection title="Completed" count={done.length} collapsed empty={emptyDone ?? 'No finished rounds yet.'}>{done.map(item)}</ListSection>
    </View>
  );
}

/** Rounds played outside an event: live first, then completed, each opening out into its matches. */
export function SoloRounds({ rounds, onDelete }: { rounds: RoundRecord[]; onDelete: (id: string) => void }) {
  const live = rounds.filter((r) => r.status === 'active').sort((a, b) => b.createdAt - a.createdAt);
  const done = rounds.filter((r) => r.status === 'complete').sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt));
  const item = (r: RoundRecord) =>
    canDeleteRound(r) && r.remote?.role !== 'viewer' ? (
      <SwipeToDelete key={r.id} label="round" onDelete={() => onDelete(r.id)}><RoundDrill r={r} /></SwipeToDelete>
    ) : (
      <RoundDrill key={r.id} r={r} />
    );
  return (
    <View style={{ gap: space.sm }}>
      {live.length > 0 && <SectionLabel text="Live" />}
      {live.map(item)}
      {done.length > 0 && <SectionLabel text="Completed" />}
      {done.map(item)}
    </View>
  );
}

export function MoreButton({ onPress, label, small }: { onPress: () => void; label: string; small?: boolean }) {
  const c = useColors();
  const d = small ? 30 : 36;
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ width: d, height: d, borderRadius: d / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: c.chip, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: c.primary, fontSize: small ? 16 : 18, fontWeight: '900', marginTop: small ? -5 : -6 }}>⋯</Text>
    </Pressable>
  );
}

function SectionLabel({ text }: { text: string }) {
  const c = useColors();
  return <Text style={{ color: c.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 4 }}>{text}</Text>;
}
