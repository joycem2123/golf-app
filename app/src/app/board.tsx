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
import { Text, useWindowDimensions, View } from 'react-native';

import { LogoMark } from '@/components/logo';
import { QrCode } from '@/components/qr-code';
import { formatDate } from '@/lib/dates';
import { formatIndex } from '@/lib/format';
import { cupScore, eventStandings, eventTeamTotals, formatPoints } from '@/lib/events';
import { headline } from '@/lib/headline';
import { liveTeamScore, matchOutcomes, roundTeamScore } from '@/lib/results';
import { courseFor, evaluate, isResult, shortCourseName } from '@/lib/round';
import { namesFor, teamName } from '@/lib/team-colors';
import type { EventRecord, RoundRecord } from '@/store/store';
import { supabase } from '@/sync/supabase';
import { fonts, teamColor } from '@/theme';

export { ErrorBoundary } from '@/components/error-screen';

const BG = '#0E2A20';
const PANEL = '#14352A';
const GOLD = '#C9A227';
const INK = '#14261E';
const REFRESH_MS = 20_000;

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
        {/* Main: team score and matches, or the leaderboard */}
        <View style={{ flex: 7, gap: 18 * u }}>
          {sides ? (
            <>
              <TeamBar sides={sides} u={u} />
              {featured && <Matches r={featured} sides={sides} names={names} u={u} picks={picks} />}
            </>
          ) : (
            <Leaderboard e={e} rounds={rounds} names={names} u={u} />
          )}
        </View>

        {/* Side panel: rounds, what's next, follow on your phone */}
        <View style={{ flex: 3, gap: 18 * u }}>
          <Panel u={u} title="ROUNDS">
            <RoundsList e={e} rounds={rounds} sides={sides} u={u} />
          </Panel>
          <NextUp e={e} u={u} />
          <View style={{ flex: 1 }} />
          <View style={{ backgroundColor: '#fff', borderRadius: 18 * u, padding: 18 * u, flexDirection: 'row', alignItems: 'center', gap: 18 * u }}>
            <QrCode value={joinUrl} size={150 * u} color={INK} />
            <View style={{ flex: 1, gap: 6 * u }}>
              <Text style={{ color: INK, fontWeight: '900', fontSize: 24 * u }}>Follow live on your phone</Text>
              <Text style={{ color: '#4A5A52', fontSize: 18 * u }}>Scan, or open Clutch Up and tap Join with Code:</Text>
              <Text style={{ color: PANEL, fontFamily: fonts.serif, fontWeight: '700', fontSize: 40 * u, letterSpacing: 6 * u }}>{code}</Text>
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

/** Every match in the round: Team A's players left, Team B's right, the status in the leader's colour. */
function Matches({ r, sides, names, u, picks }: { r: RoundRecord; sides: [Side, Side]; names: Map<string, { name: string; hcp?: number }>; u: number; picks?: EventRecord['teamColors'] }) {
  const results = evaluate(r);
  const rows = matchOutcomes(r, results).filter((m) => !(r.games[m.gi].id ?? '').startsWith('side-') && m.a.letter !== m.b.letter);
  if (!rows.length) return null;
  const [A] = sides;
  // Two columns when there are lots of matches, so every one stays big enough to read.
  const cols = rows.length > 6 ? 2 : 1;
  const perCol = Math.ceil(rows.length / cols);
  const rowH = Math.min(150, 660 / perCol) * u;
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
  const row = (m: (typeof rows)[number]) => {
    // Put Team A on the left whichever way round the match was set up.
    const flip = m.a.letter !== A.letter;
    const left = flip ? m.b : m.a;
    const right = flip ? m.a : m.b;
    const res = results[m.gi];
    const h = res && isResult(res) ? headline(res, r.players) : null;
    const done = !!m.winner;
    // Who's ahead: 'L', 'R' or null.
    const aheadA = m.winner === 'a' || (!m.winner && h?.side === 0);
    const aheadB = m.winner === 'b' || (!m.winner && h?.side === 1);
    const ahead = aheadA ? (flip ? 'R' : 'L') : aheadB ? (flip ? 'L' : 'R') : null;
    const margin = h?.big.match(/(\d+) UP/)?.[1];
    const win = h?.big.match(/Win (.+)$/)?.[1];
    const big = m.winner === 'halved' ? 'AS' : done ? (win ?? 'WON') : margin ? `${margin} UP` : h && h.small !== 'Not started' ? 'AS' : '—';
    const small = done ? 'FINAL' : h && h.small !== 'Not started' ? h.small.toUpperCase() : 'NOT STARTED';
    const lc = teamColor(left.letter, picks).color;
    const rc = teamColor(right.letter, picks).color;
    const cellColor = ahead === 'L' ? lc : ahead === 'R' ? rc : done ? INK : '#fff';
    const cellText = ahead || done ? '#fff' : INK;
    return (
      <View key={m.gi} style={{ flexDirection: 'row', alignItems: 'center', height: rowH, backgroundColor: '#fff', borderRadius: 12 * u, overflow: 'hidden' }}>
        {people(left.members, 'left', lc)}
        {ahead === 'L' ? <Arrow dir="left" color={cellColor} h={rowH} /> : null}
        <View style={{ width: 170 * u, height: rowH, backgroundColor: cellColor, alignItems: 'center', justifyContent: 'center', borderLeftWidth: ahead ? 0 : 1, borderRightWidth: ahead ? 0 : 1, borderColor: '#DDE3DF' }}>
          <Text style={{ color: cellText, fontWeight: '900', fontSize: 38 * u }}>{big}</Text>
          <Text style={{ color: cellText, opacity: 0.85, fontWeight: '800', fontSize: 15 * u, letterSpacing: 2 * u }}>{small}</Text>
        </View>
        {ahead === 'R' ? <Arrow dir="right" color={cellColor} h={rowH} /> : null}
        {people(right.members, 'right', rc)}
      </View>
    );
  };
  const columns = Array.from({ length: cols }, (_, i) => rows.slice(i * perCol, (i + 1) * perCol));
  return (
    <View style={{ flex: 1, flexDirection: 'row', gap: 16 * u }}>
      {columns.map((list, i) => <View key={i} style={{ flex: 1, gap: 10 * u }}>{list.map(row)}</View>)}
    </View>
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

/** Every round played so far, with its team score (or "In play"). */
function RoundsList({ e, rounds, sides, u }: { e: EventRecord; rounds: RoundRecord[]; sides: [Side, Side] | null; u: number }) {
  const list = (e.rounds ?? []).map((p) => ({ p, r: p.roundId ? rounds.find((x) => x.id === p.roundId) : undefined })).filter((x) => x.r);
  const extra = rounds.filter((r) => !(e.rounds ?? []).some((p) => p.roundId === r.id)).map((r) => ({ p: undefined, r }));
  const all = [...list, ...extra].slice(-6);
  if (!all.length) return <Text style={{ color: '#FFFFFF99', fontSize: 20 * u }}>No rounds played yet.</Text>;
  return (
    <View style={{ gap: 8 * u }}>
      {all.map(({ p, r }) => {
        const score = sides && r ? roundTeamScore(r, evaluate(r)) : null;
        const of = (L: string) => score?.find((t) => t.letter === L)?.points ?? 0;
        return (
          <View key={r!.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 * u }}>
            <Text numberOfLines={1} style={{ flex: 1, color: '#fff', fontWeight: '700', fontSize: 22 * u }}>{r!.label ?? (p ? `Round ${p.number}` : 'Round')}</Text>
            {sides && score ? (
              <Text style={{ fontWeight: '900', fontSize: 24 * u }}>
                <Text style={{ color: lighten(sides[0].color) }}>{formatPoints(of(sides[0].letter))}</Text>
                <Text style={{ color: '#FFFFFF80' }}> – </Text>
                <Text style={{ color: lighten(sides[1].color) }}>{formatPoints(of(sides[1].letter))}</Text>
              </Text>
            ) : null}
            <Text style={{ width: 80 * u, textAlign: 'right', color: r!.status === 'active' ? '#E74C3C' : '#FFFFFF80', fontWeight: '800', fontSize: 16 * u }}>{r!.status === 'active' ? 'LIVE' : 'FINAL'}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** The next round on the calendar. */
function NextUp({ e, u }: { e: EventRecord; u: number }) {
  const today = new Date().toISOString().slice(0, 10);
  const next = (e.rounds ?? []).filter((p) => !p.roundId && p.date && p.date >= today).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0];
  if (!next) return null;
  return (
    <Panel u={u} title="UP NEXT">
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 28 * u }}>Round {next.number}</Text>
      <Text style={{ color: '#FFFFFFB0', fontSize: 20 * u }}>{formatDate(next.date!, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
    </Panel>
  );
}
