/**
 * The event TV board: clutchupgolf.com/tv/board/?c=CODE, made to be shown on a TV across a room.
 *
 * Ryder Cup-style scoreboard: the event's team score (and projection), then every match of the round in
 * play, each with a status block in the leading team's colour pointing at the leader. Beside it, every
 * round's score, what's next, and a QR code to follow on a phone. Events without teams get a leaderboard.
 * Reads the event by its share code (no sign-in) and refreshes itself every 20 seconds.
 */
import { applyScoreEntry } from '@golf/engine';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { LogoMark } from '@/components/logo';
import { QrCode } from '@/components/qr-code';
import { getCourse } from '@/lib/courses';
import { formatDate } from '@/lib/dates';
import { formatIndex } from '@/lib/format';
import { cupScore, eventStandings, eventTeamTotals, formatPoints } from '@/lib/events';
import { gameInfo, gameName } from '@/lib/games';
import { headline } from '@/lib/headline';
import { liveTeamScore, matchOutcomes, roundTeamScore, type MatchOutcome } from '@/lib/results';
import { courseFor, evaluate, grossAt, isResult, shortCourseName } from '@/lib/round';
import { storyHoles } from '@/lib/story';
import { namesFor, teamName } from '@/lib/team-colors';
import type { EventRecord, RoundRecord } from '@/store/store';
import { supabase } from '@/sync/supabase';
import { fonts, teamColor, useColors } from '@/theme';

export { ErrorBoundary } from '@/components/error-screen';

const BG = '#0E2A20';
const PANEL = '#14352A';
const GOLD = '#C9A227';
const INK = '#14261E';
const REFRESH_MS = 20_000;
/** A match or round left open goes back to the main board after this long untouched. */
const IDLE_MS = 90_000;

type Names = Map<string, { name: string; hcp?: number }>;
type Screen = { k: 'board' } | { k: 'round'; id: string } | { k: 'match'; id: string; gi: number };

type Raw = { event: { id: string; share_code: string; data: Record<string, unknown> & { playerInfo?: { id: string; name: string; handicapIndex?: number }[] } }; rounds: { id: string; status: 'active' | 'complete'; data: Record<string, unknown>; scores: { key: string; hole: number; gross: number | null }[] }[] } | null;

function toRound(x: NonNullable<Raw>['rounds'][number], eventId: string): RoundRecord {
  let ledger: RoundRecord['ledger'] = {};
  for (const s of x.scores ?? []) if (s.gross !== null) ledger = applyScoreEntry(ledger, { key: s.key, hole: s.hole, gross: s.gross, enteredBy: 'tv', enteredAt: 0 }).ledger;
  return { ...(x.data as unknown as RoundRecord), id: x.id, eventId, ledger, stats: {}, currentHole: 1, status: x.status, notices: [] };
}

const lastPlayed = (r: RoundRecord) => Math.max(r.createdAt ?? 0, ...Object.values(r.ledger).map((e) => e.enteredAt || 0));

export default function Board() {
  const { c: codeParam, code: codeAlt } = useLocalSearchParams<{ c?: string; code?: string }>();
  const code = String(codeParam ?? codeAlt ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const [raw, setRaw] = useState<Raw | undefined>(undefined);
  const [stale, setStale] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (code.length !== 6) return;
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase.rpc('tv_board', { code });
      if (!alive) return;
      if (error) { setStale(true); return; }
      setRaw((data ?? null) as Raw);
      setStale(false);
      setUpdated(new Date());
    };
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [code]);

  const { width, height } = useWindowDimensions();
  // Everything is sized from the screen, so it reads the same on a laptop or a 75" TV.
  const u = Math.max(0.45, Math.min(width / 1920, height / 1080));

  return (
    <View style={{ flex: 1, backgroundColor: BG, minHeight: '100%' }}>
      <Stack.Screen options={{ headerShown: false, title: 'Clutch Up · TV' }} />
      {code.length !== 6 ? (
        <Message u={u} title="Clutch Up TV board" sub="Open this page from an event's “Show on TV” button." />
      ) : raw === undefined ? (
        <Message u={u} title="Loading…" sub={stale ? 'Can’t reach Clutch Up. Check the internet connection.' : ''} />
      ) : raw === null ? (
        <Message u={u} title="No event with that code" sub={`Check the code (${code}) and try again.`} />
      ) : (
        <BoardView raw={raw} u={u} code={code} stale={stale} updated={updated} />
      )}
    </View>
  );
}

function Message({ u, title, sub }: { u: number; title: string; sub: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 * u, padding: 40 * u }}>
      <LogoMark size={120 * u} />
      <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 56 * u, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      {sub ? <Text style={{ color: '#FFFFFFAA', fontSize: 28 * u, textAlign: 'center' }}>{sub}</Text> : null}
    </View>
  );
}

type Side = { letter: string; name: string; color: string; points: number; projected: number };

function BoardView({ raw, u, code, stale, updated }: { raw: NonNullable<Raw>; u: number; code: string; stale: boolean; updated: Date | null }) {
  const model = useMemo(() => {
    const { playerInfo, ...rest } = raw.event.data;
    const e = { ...(rest as unknown as EventRecord), id: raw.event.id };
    const rounds = raw.rounds.map((x) => toRound(x, e.id));
    const names = new Map<string, { name: string; hcp?: number }>();
    for (const p of playerInfo ?? []) names.set(p.id, { name: p.name, hcp: p.handicapIndex });
    for (const r of rounds) for (const p of r.players) if (!names.has(p.id)) names.set(p.id, { name: p.name, hcp: p.handicapIndex });
    return { e, rounds, names };
  }, [raw]);
  const { e, rounds, names } = model;

  // Tap a round or a match to open it; it goes back to the main board after a while untouched.
  const [screen, setScreen] = useState<Screen>({ k: 'board' });
  const [touch, setTouch] = useState(0);
  const go = (next: Screen) => { setScreen(next); setTouch((n) => n + 1); };
  useEffect(() => {
    if (screen.k === 'board') return;
    const t = setTimeout(() => setScreen({ k: 'board' }), IDLE_MS);
    return () => clearTimeout(t);
  }, [screen, touch]);
  const screenRound = screen.k === 'board' ? undefined : rounds.find((r) => r.id === screen.id);

  // The round to feature: the one being played (latest scores), else the most recent.
  const live = rounds.filter((r) => r.status === 'active').sort((a, b) => lastPlayed(b) - lastPlayed(a));
  const featured = live[0] ?? [...rounds].sort((a, b) => lastPlayed(b) - lastPlayed(a))[0];

  // Team totals for the event, and projections from the matches in play.
  const picks = e.teamColors;
  const letters = e.teams ? ['A', 'B'] : (e.teamLetters ?? []).slice(0, 2);
  let sides: [Side, Side] | null = null;
  if (letters.length === 2) {
    const nm = namesFor(undefined, e);
    const mk = (L: string, name: string, points: number, projected: number): Side => ({ letter: L, name, color: teamColor(L, picks).color, points, projected });
    if (e.teams) {
      const s = cupScore(e, rounds).standings;
      sides = [mk('A', e.teams.A.name, s.teamA, s.projected?.teamA ?? s.teamA), mk('B', e.teams.B.name, s.teamB, s.projected?.teamB ?? s.teamB)];
    } else {
      const { totals } = eventTeamTotals(e, rounds);
      const of = (L: string) => totals.find((t) => t.letter === L)?.points ?? 0;
      const extra: Record<string, number> = {};
      for (const r of live) {
        const ls = liveTeamScore(r, evaluate(r));
        for (const t of ls?.teams ?? []) extra[t.letter] = (extra[t.letter] ?? 0) + (t.projected - t.points);
      }
      sides = [mk(letters[0], teamName(letters[0], nm), of(letters[0]), of(letters[0]) + (extra[letters[0]] ?? 0)), mk(letters[1], teamName(letters[1], nm), of(letters[1]), of(letters[1]) + (extra[letters[1]] ?? 0))];
    }
  }

  let course = '';
  try { if (featured) course = shortCourseName(courseFor(featured).name); } catch { /* no course */ }
  const isLive = live.length > 0;
  const subtitle = [featured?.label, course, isLive ? null : featured ? 'Final' : null].filter(Boolean).join(' · ');
  const joinUrl = `https://clutchupgolf.com/join?c=${code}`;

  return (
    <View style={{ flex: 1, padding: 28 * u, gap: 22 * u }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 * u }}>
        <LogoMark size={64 * u} />
        <Text style={{ color: GOLD, fontFamily: fonts.brand, fontSize: 26 * u, letterSpacing: 4 * u }}>CLUTCH UP</Text>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text numberOfLines={1} style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 54 * u, fontWeight: '700' }}>{e.name}</Text>
          {subtitle ? <Text style={{ color: '#FFFFFFB0', fontSize: 26 * u, fontWeight: '600' }}>{subtitle}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 * u, minWidth: 220 * u }}>
          {isLive ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * u, backgroundColor: '#C0392B', paddingHorizontal: 14 * u, paddingVertical: 6 * u, borderRadius: 8 * u }}>
              <View style={{ width: 12 * u, height: 12 * u, borderRadius: 6 * u, backgroundColor: '#fff' }} />
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22 * u, letterSpacing: 2 * u }}>LIVE</Text>
            </View>
          ) : null}
          <Text style={{ color: stale ? '#F5B041' : '#FFFFFF80', fontSize: 16 * u }}>
            {stale ? 'Reconnecting…' : updated ? `Updated ${updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, flexDirection: 'row', gap: 26 * u }}>
        {/* Main: team score and matches (or the leaderboard), a round's details, or one match's scorecard */}
        <View style={{ flex: 7, gap: 18 * u }}>
          {screenRound && screen.k === 'match' ? (
            <MatchDetail r={screenRound} gi={screen.gi} sides={sides} names={names} u={u} picks={picks} onBack={() => go({ k: 'round', id: screenRound.id })} onHome={() => go({ k: 'board' })} />
          ) : screenRound ? (
            <RoundDetail e={e} r={screenRound} sides={sides} names={names} u={u} picks={picks} onBack={() => go({ k: 'board' })} onMatch={(gi) => go({ k: 'match', id: screenRound.id, gi })} />
          ) : sides ? (
            <>
              <TeamBar sides={sides} u={u} />
              {featured && <Matches r={featured} leftLetter={sides[0].letter} names={names} u={u} picks={picks} onMatch={(gi) => go({ k: 'match', id: featured.id, gi })} />}
            </>
          ) : (
            <Leaderboard e={e} rounds={rounds} names={names} u={u} />
          )}
        </View>

        {/* Side panel: rounds, what's next, everyone's points, follow on your phone */}
        <View style={{ flex: 3, gap: 14 * u }}>
          <Panel u={u} title="ROUNDS">
            <RoundsList e={e} rounds={rounds} sides={sides} u={u} selected={screenRound?.id} onRound={(id) => go({ k: 'round', id })} />
          </Panel>
          <NextUp e={e} names={names} u={u} picks={picks} />
          {sides ? <Contributions e={e} rounds={rounds} names={names} u={u} picks={picks} /> : <View style={{ flex: 1 }} />}
          <View style={{ backgroundColor: '#fff', borderRadius: 18 * u, padding: 14 * u, flexDirection: 'row', alignItems: 'center', gap: 14 * u }}>
            <QrCode value={joinUrl} size={104 * u} color={INK} />
            <View style={{ flex: 1, gap: 2 * u }}>
              <Text style={{ color: INK, fontWeight: '900', fontSize: 20 * u }}>Follow live on your phone</Text>
              <Text style={{ color: '#4A5A52', fontSize: 15 * u }}>Scan, or open Clutch Up and tap Join with Code:</Text>
              <Text style={{ color: PANEL, fontFamily: fonts.serif, fontWeight: '700', fontSize: 32 * u, letterSpacing: 6 * u }}>{code}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function Panel({ u, title, children }: { u: number; title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: PANEL, borderRadius: 18 * u, padding: 20 * u, gap: 12 * u, borderWidth: 1, borderColor: '#FFFFFF1A' }}>
      <Text style={{ color: GOLD, fontWeight: '900', fontSize: 18 * u, letterSpacing: 3 * u }}>{title}</Text>
      {children}
    </View>
  );
}

/** A triangle pointing left or right (the scoreboard's arrows). */
function Arrow({ dir, color, h }: { dir: 'left' | 'right'; color: string; h: number }) {
  const w = h * 0.32;
  return (
    <View style={{
      width: 0, height: 0, borderTopWidth: h / 2, borderBottomWidth: h / 2, borderTopColor: 'transparent', borderBottomColor: 'transparent',
      ...(dir === 'right' ? { borderLeftWidth: w, borderLeftColor: color } : { borderRightWidth: w, borderRightColor: color }),
    }} />
  );
}

/** Team names either side of the two scores; the leader's block points at them. Projections below. */
function TeamBar({ sides, u }: { sides: [Side, Side]; u: number }) {
  const [A, B] = sides;
  const h = 130 * u;
  const lead = A.points > B.points ? 'A' : B.points > A.points ? 'B' : null;
  const projLead = A.projected > B.projected ? 'A' : B.projected > A.projected ? 'B' : null;
  const name = (s: Side, align: 'right' | 'left') => (
    <View style={{ flex: 1, height: h, backgroundColor: '#fff', justifyContent: 'center', paddingHorizontal: 30 * u, borderTopLeftRadius: align === 'right' ? 16 * u : 0, borderBottomLeftRadius: align === 'right' ? 16 * u : 0, borderTopRightRadius: align === 'left' ? 16 * u : 0, borderBottomRightRadius: align === 'left' ? 16 * u : 0 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: s.color, fontWeight: '900', fontSize: 48 * u, textAlign: align }}>{s.name}</Text>
    </View>
  );
  const score = (s: Side) => (
    <View style={{ width: 210 * u, height: h, backgroundColor: s.color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 84 * u }}>{formatPoints(s.points)}</Text>
    </View>
  );
  return (
    <View style={{ gap: 10 * u }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {name(A, 'right')}
        {lead === 'A' ? <Arrow dir="left" color={A.color} h={h} /> : null}
        {score(A)}
        {score(B)}
        {lead === 'B' ? <Arrow dir="right" color={B.color} h={h} /> : null}
        {name(B, 'left')}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 40 * u }}>
        <Text style={{ color: A.color === '#000000' ? '#fff' : lighten(A.color), fontWeight: '900', fontSize: 44 * u, opacity: projLead === 'B' ? 0.75 : 1 }}>{formatPoints(A.projected)}</Text>
        <Text style={{ color: '#FFFFFFB0', fontWeight: '800', fontSize: 22 * u, letterSpacing: 4 * u }}>PROJECTED</Text>
        <Text style={{ color: lighten(B.color), fontWeight: '900', fontSize: 44 * u, opacity: projLead === 'A' ? 0.75 : 1 }}>{formatPoints(B.projected)}</Text>
      </View>
    </View>
  );
}

function lighten(hex: string, by = 0.35): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(v + (255 - v) * by).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

type Picks = EventRecord['teamColors'];
/** Hovered with a mouse (web) or being pressed. */
const hov = (st: object) => !!(st as { hovered?: boolean; pressed?: boolean }).hovered || !!(st as { pressed?: boolean }).pressed;

/** One match's facts for the board: who's on each side (Team A left), who's ahead, and the status text. */
function matchView(r: RoundRecord, results: ReturnType<typeof evaluate>, m: MatchOutcome, leftLetter: string | undefined, picks: Picks) {
  // Put Team A on the left whichever way round the match was set up.
  const flip = !!leftLetter && m.a.letter !== leftLetter && m.b.letter === leftLetter;
  const left = flip ? m.b : m.a;
  const right = flip ? m.a : m.b;
  const res = results[m.gi];
  const h = res && isResult(res) ? headline(res, r.players) : null;
  const done = !!m.winner;
  const aheadA = m.winner === 'a' || (!m.winner && h?.side === 0);
  const aheadB = m.winner === 'b' || (!m.winner && h?.side === 1);
  const ahead: 'L' | 'R' | null = aheadA ? (flip ? 'R' : 'L') : aheadB ? (flip ? 'L' : 'R') : null;
  const margin = h?.big.match(/(\d+) UP/)?.[1];
  const win = h?.big.match(/Win (.+)$/)?.[1];
  const big = m.winner === 'halved' ? 'AS' : done ? (win ?? 'WON') : margin ? `${margin} UP` : h && h.small !== 'Not started' ? 'AS' : '—';
  const small = done ? 'FINAL' : h && h.small !== 'Not started' ? h.small.toUpperCase() : 'NOT STARTED';
  const lc = teamColor(left.letter, picks).color;
  const rc = teamColor(right.letter, picks).color;
  const cellColor = ahead === 'L' ? lc : ahead === 'R' ? rc : done ? INK : '#fff';
  const cellText = ahead || done ? '#fff' : INK;
  return { flip, left, right, ahead, big, small, lc, rc, cellColor, cellText, done };
}

/** The scoreboard row: players either side, the status block in the leader's colour pointing at them. */
function MatchRow({ r, results, m, leftLetter, names, u, picks, h, onPress }: { r: RoundRecord; results: ReturnType<typeof evaluate>; m: MatchOutcome; leftLetter?: string; names: Names; u: number; picks: Picks; h: number; onPress?: () => void }) {
  const v = matchView(r, results, m, leftLetter, picks);
  const people = (ids: string[], align: 'left' | 'right', color: string) => (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 18 * u, gap: 2 * u }}>
      {ids.map((id) => (
        <View key={id} style={{ flexDirection: align === 'left' ? 'row' : 'row-reverse', alignItems: 'baseline', gap: 10 * u }}>
          <Text numberOfLines={1} style={{ color, fontWeight: '800', fontSize: (ids.length > 1 ? 24 : 30) * u, flexShrink: 1 }}>{names.get(id)?.name ?? '?'}</Text>
          {names.get(id)?.hcp !== undefined ? <Text style={{ color: '#7A8A82', fontWeight: '700', fontSize: 15 * u }}>HCP {formatIndex(names.get(id)!.hcp!)}</Text> : null}
        </View>
      ))}
    </View>
  );
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={onPress ? 'Open this match’s scorecard' : undefined}
      style={(st) => ({ flexDirection: 'row', alignItems: 'center', height: h, backgroundColor: hov(st) ? '#F1F5F2' : '#fff', borderRadius: 12 * u, overflow: 'hidden' })}>
      {people(v.left.members, 'left', v.lc)}
      {v.ahead === 'L' ? <Arrow dir="left" color={v.cellColor} h={h} /> : null}
      <View style={{ width: 170 * u, height: h, backgroundColor: v.cellColor, alignItems: 'center', justifyContent: 'center', borderLeftWidth: v.ahead ? 0 : 1, borderRightWidth: v.ahead ? 0 : 1, borderColor: '#DDE3DF' }}>
        <Text style={{ color: v.cellText, fontWeight: '900', fontSize: 38 * u }}>{v.big}</Text>
        <Text style={{ color: v.cellText, opacity: 0.85, fontWeight: '800', fontSize: 15 * u, letterSpacing: 2 * u }}>{v.small}</Text>
      </View>
      {v.ahead === 'R' ? <Arrow dir="right" color={v.cellColor} h={h} /> : null}
      {people(v.right.members, 'right', v.rc)}
    </Pressable>
  );
}

const boardMatches = (r: RoundRecord, results: ReturnType<typeof evaluate>) =>
  matchOutcomes(r, results).filter((m) => !(r.games[m.gi].id ?? '').startsWith('side-') && m.a.letter !== m.b.letter);

/** Every match in the round: Team A's players left, Team B's right. Tap one for its scorecard. */
function Matches({ r, leftLetter, names, u, picks, onMatch }: { r: RoundRecord; leftLetter?: string; names: Names; u: number; picks: Picks; onMatch: (gi: number) => void }) {
  const results = evaluate(r);
  const rows = boardMatches(r, results);
  if (!rows.length) return <Text style={{ color: '#FFFFFF99', fontSize: 24 * u }}>No matches in this round.</Text>;
  // Two columns when there are lots of matches, so every one stays big enough to read.
  const cols = rows.length > 6 ? 2 : 1;
  const perCol = Math.ceil(rows.length / cols);
  const rowH = Math.min(150, 620 / perCol) * u;
  const columns = Array.from({ length: cols }, (_, i) => rows.slice(i * perCol, (i + 1) * perCol));
  return (
    <View style={{ flex: 1, gap: 8 * u }}>
      <View style={{ flex: 1, flexDirection: 'row', gap: 16 * u }}>
        {columns.map((list, i) => (
          <View key={i} style={{ flex: 1, gap: 10 * u }}>
            {list.map((m) => <MatchRow key={m.gi} r={r} results={results} m={m} leftLetter={leftLetter} names={names} u={u} picks={picks} h={rowH} onPress={() => onMatch(m.gi)} />)}
          </View>
        ))}
      </View>
      <Text style={{ color: '#FFFFFF66', fontSize: 15 * u, textAlign: 'center' }}>Tap a match for its scorecard</Text>
    </View>
  );
}

function BackBar({ u, title, sub, back, onBack, onHome }: { u: number; title: string; sub?: string; back: string; onBack: () => void; onHome?: () => void }) {
  const btn = (label: string, on: () => void) => (
    <Pressable onPress={on} accessibilityRole="button" style={(st) => ({ backgroundColor: hov(st) ? '#FFFFFF33' : '#FFFFFF1A', borderRadius: 10 * u, paddingHorizontal: 16 * u, paddingVertical: 8 * u })}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 20 * u }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 * u }}>
      {btn(`← ${back}`, onBack)}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: '#fff', fontFamily: fonts.serif, fontWeight: '700', fontSize: 38 * u }}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={{ color: '#FFFFFFB0', fontSize: 20 * u, fontWeight: '600' }}>{sub}</Text> : null}
      </View>
      {onHome ? btn('Main board', onHome) : null}
    </View>
  );
}

function roundCourse(r: RoundRecord) {
  try { return shortCourseName(courseFor(r).name); } catch { return ''; }
}

/** One round: its date, course, format and team score, then every match (tap for the scorecard). */
function RoundDetail({ e, r, sides, names, u, picks, onBack, onMatch }: { e: EventRecord; r: RoundRecord; sides: [Side, Side] | null; names: Names; u: number; picks: Picks; onBack: () => void; onMatch: (gi: number) => void }) {
  const results = evaluate(r);
  const plan = (e.rounds ?? []).find((p) => p.roundId === r.id);
  const formats = [...new Set(r.games.filter((g) => !(g.id ?? '').startsWith('side-')).map(gameName))].join(' + ');
  const date = plan?.date ?? (r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : undefined);
  const sub = [date ? formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' }) : null, roundCourse(r), formats, r.status === 'active' ? 'In play' : 'Final'].filter(Boolean).join(' · ');
  let bar: [Side, Side] | null = null;
  if (sides) {
    const score = roundTeamScore(r, results);
    const ls = r.status === 'active' ? liveTeamScore(r, results) : null;
    const pts = (L: string) => score?.find((t) => t.letter === L)?.points ?? 0;
    const proj = (L: string) => ls?.teams.find((t) => t.letter === L)?.projected ?? pts(L);
    bar = [{ ...sides[0], points: pts(sides[0].letter), projected: proj(sides[0].letter) }, { ...sides[1], points: pts(sides[1].letter), projected: proj(sides[1].letter) }];
  }
  return (
    <>
      <BackBar u={u} back="Main board" onBack={onBack} title={r.label ?? (plan ? `Round ${plan.number}` : 'Round')} sub={sub} />
      {bar ? <TeamBar sides={bar} u={u * 0.8} /> : null}
      <Matches r={r} leftLetter={sides?.[0].letter} names={names} u={u} picks={picks} onMatch={onMatch} />
    </>
  );
}

/** One match, hole by hole: par, every player's score, who won each hole and the running status. */
function MatchDetail({ r, gi, sides, names, u, picks, onBack, onHome }: { r: RoundRecord; gi: number; sides: [Side, Side] | null; names: Names; u: number; picks: Picks; onBack: () => void; onHome: () => void }) {
  const c = useColors();
  const results = evaluate(r);
  const m = matchOutcomes(r, results).find((x) => x.gi === gi);
  if (!m) return <BackBar u={u} back="Round" onBack={onBack} title="Match not found" />;
  const res = results[gi];
  const v = matchView(r, results, m, sides?.[0].letter, picks);
  const holes = res && isResult(res) ? storyHoles(r, res, m, c) : [];
  const g = r.games[gi];
  const sub = [r.label, gameName(g), g.handicap?.net === false ? 'Gross' : 'Net', roundCourse(r)].filter(Boolean).join(' · ');
  // Lead from the left side's point of view.
  const sign = v.flip ? -1 : 1;
  const nine = holes.length > 9 ? [holes.slice(0, 9), holes.slice(9)] : [holes];
  const leftIds = v.left.members;
  const rightIds = v.right.members;
  const sum = (ids: string, hs: typeof holes) => {
    const xs = hs.map((h) => grossAt(r, ids, h.hole));
    return xs.some((x) => x !== null) ? xs.reduce<number>((t, x) => t + (x ?? 0), 0) : null;
  };
  const cellW = 62 * u;
  const labelW = 210 * u;
  const rowH = 44 * u;
  const cell = (key: string | number, text: string | number | null, o: { bg?: string; color?: string; bold?: boolean; ring?: string; w?: number } = {}) => (
    <View key={key} style={{ width: o.w ?? cellW, height: rowH, alignItems: 'center', justifyContent: 'center', backgroundColor: o.bg }}>
      <View style={o.ring ? { borderWidth: 2 * u, borderColor: o.ring, borderRadius: 18 * u, minWidth: 36 * u, height: 36 * u, alignItems: 'center', justifyContent: 'center' } : undefined}>
        <Text style={{ color: o.color ?? INK, fontWeight: o.bold ? '900' : '700', fontSize: 22 * u }}>{text ?? ''}</Text>
      </View>
    </View>
  );
  const label = (text: string, color = INK, small = false) => (
    <View style={{ width: labelW, height: rowH, justifyContent: 'center', paddingHorizontal: 12 * u }}>
      <Text numberOfLines={1} style={{ color, fontWeight: '900', fontSize: (small ? 16 : 21) * u, letterSpacing: small ? 2 * u : 0 }}>{text}</Text>
    </View>
  );
  const playerRow = (id: string, color: string, side: 1 | -1, hs: typeof holes, total: boolean, last: boolean) => (
    <View key={id} style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: '#E3E8E5' }}>
      {label(names.get(id)?.name ?? '?', color)}
      {hs.map((h) => {
        const gross = grossAt(r, id, h.hole);
        const won = h.outcome !== null && h.outcome * sign === side;
        return cell(h.hole, gross, { bg: won ? `${color}22` : undefined, color: won ? color : INK, bold: won, ring: gross !== null && gross < h.par ? color : undefined });
      })}
      {cell('t', sum(id, hs), { bold: true, w: 80 * u, bg: '#F1F4F2' })}
      {total ? cell('tt', last ? sum(id, holes) : null, { bold: true, w: 80 * u, bg: last ? '#E6EBE8' : undefined }) : null}
    </View>
  );
  const half = (hs: typeof holes, i: number, last: boolean) => (
    <View key={i} style={{ backgroundColor: '#fff', borderRadius: 14 * u, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', backgroundColor: PANEL }}>
        {label('HOLE', '#fff', true)}
        {hs.map((h) => cell(h.hole, h.hole, { color: '#fff', bold: true }))}
        {cell('t', nine.length > 1 ? (i === 0 ? 'OUT' : 'IN') : 'TOT', { color: GOLD, bold: true, w: 80 * u })}
        {nine.length > 1 ? cell('tt', last ? 'TOT' : '', { color: GOLD, bold: true, w: 80 * u }) : null}
      </View>
      <View style={{ flexDirection: 'row', backgroundColor: '#F1F4F2' }}>
        {label('PAR', '#4A5A52', true)}
        {hs.map((h) => cell(h.hole, h.par, { color: '#4A5A52' }))}
        {cell('t', hs.reduce((t, h) => t + h.par, 0), { color: '#4A5A52', w: 80 * u })}
        {nine.length > 1 ? cell('tt', last ? holes.reduce((t, h) => t + h.par, 0) : '', { color: '#4A5A52', w: 80 * u }) : null}
      </View>
      {leftIds.map((id) => playerRow(id, v.lc, 1, hs, nine.length > 1, last))}
      {/* The match after each hole, in the leader's colour. */}
      <View style={{ flexDirection: 'row', borderTopWidth: 2, borderBottomWidth: 2, borderColor: '#C9D2CD' }}>
        {label('MATCH', '#4A5A52', true)}
        {hs.map((h) => {
          if (h.lead === null) return cell(h.hole, '');
          const lead = h.lead * sign;
          return cell(h.hole, lead === 0 ? 'AS' : `${Math.abs(lead)}`, { bg: lead > 0 ? v.lc : lead < 0 ? v.rc : '#E6EBE8', color: lead === 0 ? INK : '#fff', bold: true });
        })}
        {cell('t', '', { w: 80 * u })}
        {nine.length > 1 ? cell('tt', '', { w: 80 * u }) : null}
      </View>
      {rightIds.map((id) => playerRow(id, v.rc, -1, hs, nine.length > 1, last))}
    </View>
  );
  return (
    <>
      <BackBar u={u} back={r.label ?? 'Round'} onBack={onBack} onHome={onHome} title={`${leftIds.map((id) => names.get(id)?.name.split(' ')[0] ?? '?').join(' & ')} vs ${rightIds.map((id) => names.get(id)?.name.split(' ')[0] ?? '?').join(' & ')}`} sub={sub} />
      <MatchRow r={r} results={results} m={m} leftLetter={sides?.[0].letter} names={names} u={u} picks={picks} h={110 * u} />
      {holes.length ? (
        <View style={{ gap: 14 * u, alignItems: 'center' }}>
          {nine.map((hs, i) => half(hs, i, i === nine.length - 1))}
          <Text style={{ color: '#FFFFFF80', fontSize: 16 * u }}>Gross scores · shaded = won the hole · circled = birdie or better · MATCH = holes up after each hole</Text>
        </View>
      ) : (
        <Text style={{ color: '#FFFFFF99', fontSize: 24 * u }}>No scores yet.</Text>
      )}
    </>
  );
}

/** Events without teams: the standings. */
function Leaderboard({ e, rounds, names, u }: { e: EventRecord; rounds: RoundRecord[]; names: Map<string, { name: string; hcp?: number }>; u: number }) {
  const rows = eventStandings(e, rounds).slice(0, 12);
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 18 * u, padding: 20 * u, gap: 6 * u }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 12 * u }}>
        {['POS', 'PLAYER', 'PTS', 'W–H–L'].map((t, i) => (
          <Text key={t} style={{ flex: i === 1 ? 4 : 1, color: '#7A8A82', fontWeight: '900', fontSize: 18 * u, letterSpacing: 2 * u, textAlign: i === 1 ? 'left' : 'center' }}>{t}</Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={r.playerId} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 * u, paddingHorizontal: 12 * u, borderRadius: 10 * u, backgroundColor: i === 0 ? '#F6EFD9' : i % 2 ? '#F4F6F5' : '#fff' }}>
          <Text style={{ flex: 1, textAlign: 'center', color: INK, fontWeight: '900', fontSize: 30 * u }}>{r.position}</Text>
          <Text numberOfLines={1} style={{ flex: 4, color: INK, fontWeight: '800', fontSize: 32 * u }}>{names.get(r.playerId)?.name ?? '?'}</Text>
          <Text style={{ flex: 1, textAlign: 'center', color: PANEL, fontWeight: '900', fontSize: 34 * u }}>{formatPoints(r.points)}</Text>
          <Text style={{ flex: 1, textAlign: 'center', color: '#4A5A52', fontWeight: '700', fontSize: 24 * u }}>{r.wins}–{r.halves}–{r.losses}</Text>
        </View>
      ))}
    </View>
  );
}

/** Every round played so far, with its team score (or "In play"). Tap one for its details. */
function RoundsList({ e, rounds, sides, u, selected, onRound }: { e: EventRecord; rounds: RoundRecord[]; sides: [Side, Side] | null; u: number; selected?: string; onRound: (id: string) => void }) {
  const list = (e.rounds ?? []).map((p) => ({ p, r: p.roundId ? rounds.find((x) => x.id === p.roundId) : undefined })).filter((x) => x.r);
  const extra = rounds.filter((r) => !(e.rounds ?? []).some((p) => p.roundId === r.id)).map((r) => ({ p: undefined, r }));
  const all = [...list, ...extra].slice(-6);
  if (!all.length) return <Text style={{ color: '#FFFFFF99', fontSize: 20 * u }}>No rounds played yet.</Text>;
  return (
    <View style={{ gap: 4 * u }}>
      {all.map(({ p, r }) => {
        const score = sides && r ? roundTeamScore(r, evaluate(r)) : null;
        const of = (L: string) => score?.find((t) => t.letter === L)?.points ?? 0;
        return (
          <Pressable key={r!.id} onPress={() => onRound(r!.id)} accessibilityRole="button" accessibilityLabel={`Open ${r!.label ?? 'round'}`}
            style={(st) => ({ flexDirection: 'row', alignItems: 'center', gap: 10 * u, paddingVertical: 4 * u, paddingHorizontal: 8 * u, marginHorizontal: -8 * u, borderRadius: 8 * u, backgroundColor: selected === r!.id ? '#FFFFFF26' : hov(st) ? '#FFFFFF14' : 'transparent' })}>
            <Text numberOfLines={1} style={{ flex: 1, color: '#fff', fontWeight: '700', fontSize: 21 * u }}>{r!.label ?? (p ? `Round ${p.number}` : 'Round')}</Text>
            {sides && score ? (
              <Text style={{ fontWeight: '900', fontSize: 22 * u }}>
                <Text style={{ color: lighten(sides[0].color) }}>{formatPoints(of(sides[0].letter))}</Text>
                <Text style={{ color: '#FFFFFF80' }}> – </Text>
                <Text style={{ color: lighten(sides[1].color) }}>{formatPoints(of(sides[1].letter))}</Text>
              </Text>
            ) : null}
            <Text style={{ width: 64 * u, textAlign: 'right', color: r!.status === 'active' ? '#E74C3C' : '#FFFFFF80', fontWeight: '800', fontSize: 15 * u }}>{r!.status === 'active' ? 'LIVE' : 'FINAL'}</Text>
            <Text style={{ color: '#FFFFFF66', fontSize: 20 * u }}>›</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The next round on the calendar: when, where, the format and the matchups if they're set. */
function NextUp({ e, names, u, picks }: { e: EventRecord; names: Names; u: number; picks: Picks }) {
  const today = new Date().toISOString().slice(0, 10);
  const next = (e.rounds ?? []).filter((p) => !p.roundId && p.date && p.date >= today).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0];
  if (!next) return null;
  const d = next.draft;
  let format = '';
  try { if (d?.kind) format = [gameInfo(d.kind).name, d.net === false ? 'Gross' : `Net${d.allowancePct ? ` ${d.allowancePct}%` : ''}`, d.holes === 9 ? '9 holes' : null].filter(Boolean).join(' · '); } catch { /* unknown format */ }
  let course = '';
  try { if (next.setup?.courseId) course = shortCourseName(getCourse(next.setup.courseId)?.name ?? ''); } catch { /* no course */ }
  const matches = !next.matchupsLater ? (d?.matches ?? []).filter((m) => m.a.length && m.b.length) : [];
  const first = (id: string) => names.get(id)?.name ?? '?';
  const side = (ids: string[], letter: string | undefined, align: 'left' | 'right') => (
    <Text numberOfLines={1} style={{ flex: 1, textAlign: align, color: letter ? lighten(teamColor(letter, picks).color, 0.45) : '#fff', fontWeight: '800', fontSize: (matches.length > 4 ? 16 : 18) * u }}>{ids.map(first).join(' & ')}</Text>
  );
  return (
    <Panel u={u} title="UP NEXT">
      <View style={{ gap: 2 * u }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 26 * u }}>Round {next.number} · {formatDate(next.date!, { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
        {format || course ? <Text style={{ color: GOLD, fontWeight: '800', fontSize: 19 * u }}>{[format, course].filter(Boolean).join(' · ')}</Text> : null}
      </View>
      {matches.length ? (
        <View style={{ gap: 4 * u }}>
          {matches.slice(0, 6).map((m, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * u }}>
              {side(m.a, m.ta, 'right')}
              <Text style={{ color: '#FFFFFF80', fontWeight: '800', fontSize: 14 * u }}>vs</Text>
              {side(m.b, m.tb, 'left')}
            </View>
          ))}
          {matches.length > 6 ? <Text style={{ color: '#FFFFFF80', fontSize: 15 * u, textAlign: 'center' }}>+{matches.length - 6} more</Text> : null}
        </View>
      ) : (
        <Text style={{ color: '#FFFFFF99', fontSize: 17 * u }}>{d?.kind || next.matchupsLater ? 'Matchups to be set on the day.' : 'Format and matchups to be set.'}</Text>
      )}
    </Panel>
  );
}

/** Every player's points and win–halve–loss record for the event, in their team's colour. */
function Contributions({ e, rounds, names, u, picks }: { e: EventRecord; rounds: RoundRecord[]; names: Names; u: number; picks: Picks }) {
  const rows = eventStandings(e, rounds);
  const letterOf = (id: string) => e.teamOf?.[id] ?? (e.teams ? (e.teams.A.playerIds.includes(id) ? 'A' : e.teams.B.playerIds.includes(id) ? 'B' : undefined) : undefined);
  if (!rows.length) return <View style={{ flex: 1 }} />;
  const fs = rows.length > 12 ? 16 : 18;
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: PANEL, borderRadius: 18 * u, padding: 16 * u, gap: 8 * u, borderWidth: 1, borderColor: '#FFFFFF1A' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, color: GOLD, fontWeight: '900', fontSize: 16 * u, letterSpacing: 3 * u }}>INDIVIDUAL CONTRIBUTIONS</Text>
        <Text style={{ width: 56 * u, textAlign: 'right', color: '#FFFFFF80', fontWeight: '800', fontSize: 13 * u, letterSpacing: 1 * u }}>PTS</Text>
        <Text style={{ width: 80 * u, textAlign: 'right', color: '#FFFFFF80', fontWeight: '800', fontSize: 13 * u, letterSpacing: 1 * u }}>W–H–L</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 3 * u }}>
        {rows.map((r) => {
          const L = letterOf(r.playerId);
          const color = L ? teamColor(L, picks).color : '#FFFFFF';
          return (
            <View key={r.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * u }}>
              <View style={{ width: 6 * u, height: 22 * u, borderRadius: 3 * u, backgroundColor: color }} />
              <Text numberOfLines={1} style={{ flex: 1, color: '#fff', fontWeight: '700', fontSize: fs * u }}>{names.get(r.playerId)?.name ?? '?'}</Text>
              <Text style={{ width: 56 * u, textAlign: 'right', color: L ? lighten(color, 0.45) : '#fff', fontWeight: '900', fontSize: (fs + 2) * u }}>{formatPoints(r.points)}</Text>
              <Text style={{ width: 80 * u, textAlign: 'right', color: '#FFFFFFB0', fontWeight: '700', fontSize: fs * u }}>{r.wins}–{r.halves}–{r.losses}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
