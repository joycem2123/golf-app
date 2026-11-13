/**
 * The event TV board: clutchupgolf.com/tv/board/?c=CODE, made to be shown on a TV across a room.
 *
 * Ryder Cup-style scoreboard: the event's team score (and projection), then every match of the round in
 * play, each with a status block in the leading team's colour pointing at the leader. Beside it, every
 * round's score, what's next, and a QR code to follow on a phone. Events without teams get a leaderboard.
 * Reads the event by its share code (no sign-in) and refreshes itself every 20 seconds.
 */
import { applyScoreEntry } from '@golf/engine';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { LogoMark } from '@/components/logo';
import { boardMatches, matchView } from '@/components/match-strip';
import { QrCode } from '@/components/qr-code';
import { getCourse } from '@/lib/courses';
import { formatDate } from '@/lib/dates';
import { formatIndex } from '@/lib/format';
import { fedexStandings, scoreRound, type FedexPart, type FedexRoundResult } from '@golf/engine';
import { currentHalf, fedexResults } from '@/lib/fedex';
import { fmtPts } from '@/components/fedex-standings';
import { cupScore, eventStandings, eventTeamTotals, formatPoints, planName } from '@/lib/events';
import { gameInfo, gameName } from '@/lib/games';
import { liveTeamScore, roundTeamScore, type MatchOutcome } from '@/lib/results';
import { courseFor, evaluate, grossAt, isResult, shortCourseName } from '@/lib/round';
import { storyHoles } from '@/lib/story';
import { namesFor, teamName } from '@/lib/team-colors';
import type { EventRecord, RoundRecord } from '@/store/store';
import { supabase } from '@/sync/supabase';
import { fonts, teamColor, useColors } from '@/theme';

export { ErrorBoundary } from '@/components/error-screen';

const BG = '#0B2219';
/** Side panels: the app's cream card, so they stand out against the green. */
const PANEL = '#FAF8F2';
const PANEL_LINE = 'rgba(20,38,30,0.08)';
const MUTED = '#66756D';
const PRIMARY = '#1F5A3D';
const LINE = 'rgba(255,255,255,0.09)';

// The board runs in a web browser, so it can use real CSS for depth: gradients, glass blur and soft shadows.
const css = (o: Record<string, string>): object => (Platform.OS === 'web' ? o : {});
const PAGE_BG = css({ backgroundImage: 'radial-gradient(1400px 700px at 12% -10%, #1E5A40 0%, rgba(30,90,64,0) 60%), radial-gradient(1000px 600px at 105% 115%, #154A33 0%, rgba(21,74,51,0) 60%), linear-gradient(180deg, #0E2A1F 0%, #071710 100%)' });
const GLASS = css({ backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' });
const SHADOW = css({ boxShadow: '0 18px 40px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.25)' });
/** One font for the whole board: Georgia, the font of the team names and scores (and the app's headings). */
const SANS = fonts.serif;
const TABULAR = { fontVariant: ['tabular-nums' as const] };
/** A team colour with a little depth: lighter top-left to darker bottom-right. */
const sheen = (c: string) => css({ backgroundImage: `linear-gradient(180deg, ${lighten(c, 0.14)} 0%, ${c} 50%, ${darken(c, 0.14)} 100%)` });
const GOLD = '#C9A227';
const INK = '#14261E';
const REFRESH_MS = 20_000;
/** A match or round left open goes back to the main board after this long untouched. */
const IDLE_MS = 90_000;

type Names = Map<string, { name: string; hcp?: number }>;
type Screen = { k: 'board' } | { k: 'round'; id: string };
type Open = { id: string; gi: number } | null;

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
    <View style={{ flex: 1, backgroundColor: BG, minHeight: '100%', ...PAGE_BG }}>
      <Stack.Screen options={{ headerShown: false, title: 'Clutch Up · TV' }} />
      {code.length !== 6 ? (
        <CodeEntry u={u} />
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

/** clutchupgolf.com/tv with no code: type the event's 6-character code (easy with a TV remote; no link to copy). */
function CodeEntry({ u }: { u: number }) {
  const [text, setText] = useState('');
  const clean = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const go = () => { if (clean.length === 6) router.setParams({ c: clean }); };
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 * u, padding: 40 * u }}>
      <LogoMark size={110 * u} />
      <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 56 * u, fontWeight: '700', textAlign: 'center' }}>Clutch Up TV</Text>
      <Text style={{ fontFamily: SANS, color: 'rgba(255,255,255,0.75)', fontSize: 26 * u, textAlign: 'center' }}>Enter your event’s code. It’s under “Show on TV” on the event in the app.</Text>
      <TextInput
        value={clean}
        onChangeText={setText}
        onSubmitEditing={go}
        autoFocus
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        placeholder="ABC123"
        placeholderTextColor="rgba(20,38,30,0.25)"
        accessibilityLabel="Event code"
        style={{ fontFamily: SANS, backgroundColor: '#FAF8F2', color: INK, fontSize: 64 * u, fontWeight: '800', letterSpacing: 14 * u, textAlign: 'center', width: 520 * u, paddingVertical: 14 * u, borderRadius: 18 * u }}
      />
      <Pressable onPress={go} disabled={clean.length !== 6} accessibilityRole="button"
        style={(st) => ({ backgroundColor: clean.length === 6 ? GOLD : 'rgba(255,255,255,0.15)', paddingHorizontal: 48 * u, paddingVertical: 16 * u, borderRadius: 999, opacity: hov(st) ? 0.9 : 1 })}>
        <Text style={{ fontFamily: SANS, color: clean.length === 6 ? INK : 'rgba(255,255,255,0.6)', fontWeight: '800', fontSize: 26 * u }}>Show scoreboard</Text>
      </Pressable>
    </View>
  );
}

function Message({ u, title, sub }: { u: number; title: string; sub: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 * u, padding: 40 * u }}>
      <LogoMark size={120 * u} />
      <Text style={{ color: '#fff', fontFamily: fonts.serif, fontWeight: '700', fontSize: 56 * u, textAlign: 'center' }}>{title}</Text>
      {sub ? <Text style={{ fontFamily: SANS, color: '#FFFFFFAA', fontSize: 28 * u, textAlign: 'center' }}>{sub}</Text> : null}
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
  const [open, setOpen] = useState<Open>(null);
  const go = (next: Screen) => { setScreen(next); setOpen(null); setTouch((n) => n + 1); };
  // Tap a match to open its scorecard underneath it; tap again to close.
  const toggle = (id: string, gi: number) => { setOpen((o) => (o && o.id === id && o.gi === gi ? null : { id, gi })); setTouch((n) => n + 1); };
  useEffect(() => {
    if (screen.k === 'board' && !open) return;
    const t = setTimeout(() => { setScreen({ k: 'board' }); setOpen(null); }, IDLE_MS);
    return () => clearTimeout(t);
  }, [screen, open, touch]);
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

  // Points Race seasons: standings from every round's Stableford points and finishing bonus.
  const race = e.fedex ? fedexResults(e, rounds) : null;

  let course = '';
  try { if (featured) course = shortCourseName(courseFor(featured).name); } catch { /* no course */ }
  const isLive = live.length > 0;
  const subtitle = race
    ? ['Points Race', currentHalf(e, race) === 2 ? '2nd half' : '1st half', `${race.length} round${race.length === 1 ? '' : 's'} played`, isLive ? `${featured?.label ?? 'Round'} in play` : null].filter(Boolean).join(' · ')
    : [featured?.label, course, isLive ? null : featured ? 'Final' : null].filter(Boolean).join(' · ');
  const joinUrl = `https://clutchupgolf.com/join?c=${code}`;

  return (
    <View style={{ flex: 1 }}>
      {/* Top bar: brand, event, live status — glass over the page */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 22 * u, paddingHorizontal: 32 * u, paddingVertical: 16 * u, backgroundColor: 'rgba(0,0,0,0.38)', borderBottomWidth: 1, borderColor: LINE, ...GLASS }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 * u }}>
          <LogoMark size={46 * u} />
          <Text style={{ color: GOLD, fontFamily: fonts.brand, fontSize: 20 * u, letterSpacing: 4 * u }}>CLUTCH UP</Text>
        </View>
        <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: LINE }} />
        <View style={{ flex: 1, gap: 2 * u }}>
          <Text numberOfLines={1} style={{ color: '#fff', fontFamily: fonts.serif, fontWeight: '700', fontSize: 42 * u }}>{e.name}</Text>
          {subtitle ? <Text numberOfLines={1} style={{ fontFamily: SANS, color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: 18 * u, letterSpacing: 1.5 * u }}>{subtitle.toUpperCase()}</Text> : null}
        </View>
        <Text style={{ fontFamily: SANS, color: stale ? '#F5B041' : 'rgba(255,255,255,0.5)', fontSize: 15 * u, fontWeight: '700' }}>
          {stale ? 'Reconnecting…' : updated ? `Updated ${updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
        </Text>
        {isLive ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 * u, backgroundColor: 'rgba(231,76,60,0.16)', borderWidth: 1, borderColor: 'rgba(231,76,60,0.55)', paddingHorizontal: 16 * u, paddingVertical: 7 * u, borderRadius: 999 }}>
            <LiveDot size={12 * u} />
            <Text style={{ fontFamily: SANS, color: '#FF6B5A', fontWeight: '800', fontSize: 18 * u, letterSpacing: 3 * u }}>LIVE</Text>
          </View>
        ) : (
          <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 16 * u, paddingVertical: 7 * u, borderRadius: 999 }}>
            <Text style={{ fontFamily: SANS, color: 'rgba(255,255,255,0.7)', fontWeight: '800', fontSize: 16 * u, letterSpacing: 3 * u }}>FINAL</Text>
          </View>
        )}
      </View>

    <View style={{ flex: 1, padding: 26 * u, gap: 22 * u }}>
      <View style={{ flex: 1, flexDirection: 'row', gap: 26 * u }}>
        {/* Main: team score and matches (or the leaderboard), a round's details, or one match's scorecard */}
        <View style={{ flex: 7, gap: 18 * u }}>
          {screenRound ? (
            <RoundDetail e={e} r={screenRound} sides={sides} names={names} u={u} picks={picks} onBack={() => go({ k: 'board' })} open={open?.id === screenRound.id ? open.gi : null} onMatch={(gi) => toggle(screenRound.id, gi)} />
          ) : race ? (
            <RaceStandings e={e} results={race} names={names} u={u} />
          ) : sides ? (
            <>
              <TeamBar sides={sides} u={u} />
              {featured && <Matches r={featured} leftLetter={sides[0].letter} names={names} u={u} picks={picks} open={open?.id === featured.id ? open.gi : null} onMatch={(gi) => toggle(featured.id, gi)} />}
            </>
          ) : (
            <Leaderboard e={e} rounds={rounds} names={names} u={u} />
          )}
        </View>

        {/* Side panel: rounds, what's next, everyone's points, follow on your phone */}
        <View style={{ flex: 3, gap: 14 * u }}>
          {race ? (
            <>
              {live[0] ? <RaceLive e={e} r={live[0]} names={names} u={u} /> : null}
              <RaceLastRound results={race} names={names} u={u} />
            </>
          ) : (
            <Panel u={u} title="ROUNDS">
              <RoundsList e={e} rounds={rounds} sides={sides} u={u} selected={screenRound?.id} onRound={(id) => go({ k: 'round', id })} />
            </Panel>
          )}
          <NextUp e={e} names={names} u={u} picks={picks} />
          {sides ? <Contributions e={e} rounds={rounds} names={names} u={u} picks={picks} /> : null}
          <View style={{ flexGrow: 1 }} />
          <View style={{ backgroundColor: PANEL, borderRadius: 22 * u, padding: 14 * u, flexDirection: 'row', alignItems: 'center', gap: 16 * u, borderWidth: 1, borderColor: PANEL_LINE, ...SHADOW }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 14 * u, padding: 6 * u, borderWidth: 1, borderColor: PANEL_LINE }}>
              <QrCode value={joinUrl} size={96 * u} color={INK} />
            </View>
            <View style={{ flex: 1, gap: 4 * u }}>
              <Text style={{ color: INK, fontFamily: SANS, fontWeight: '800', fontSize: 20 * u }}>Follow live on your phone</Text>
              <Text style={{ fontFamily: SANS, color: MUTED, fontSize: 14 * u }}>Scan, or tap Join with Code in Clutch Up</Text>
              <Text style={{ fontFamily: SANS, color: PRIMARY, fontWeight: '800', fontSize: 32 * u, letterSpacing: 8 * u, ...TABULAR }}>{code}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
    </View>
  );
}

/** The pulsing red dot in the LIVE pill. */
function LiveDot({ size }: { size: number }) {
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size * 2.2, height: size * 2.2, borderRadius: size * 1.1, backgroundColor: '#FF4D3A', opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#FF4D3A' }} />
    </View>
  );
}

function PanelTitle({ u, title, right }: { u: number; title: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 * u }}>
      <View style={{ width: 4 * u, height: 16 * u, borderRadius: 2 * u, backgroundColor: GOLD }} />
      <Text style={{ fontFamily: SANS, flex: 1, color: PRIMARY, fontWeight: '800', fontSize: 15 * u, letterSpacing: 2.5 * u }}>{title}</Text>
      {right}
    </View>
  );
}

function Panel({ u, title, children }: { u: number; title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: PANEL, borderRadius: 22 * u, padding: 22 * u, gap: 14 * u, borderWidth: 1, borderColor: PANEL_LINE, ...SHADOW }}>
      <PanelTitle u={u} title={title} />
      {children}
    </View>
  );
}

/** A triangle pointing left or right (the scoreboard's arrows). */
function Arrow({ dir, color, h, overlay }: { dir: 'left' | 'right'; color: string; h: number; overlay?: boolean }) {
  const w = h * 0.32;
  return (
    <View style={{
      ...(overlay ? { position: 'absolute' as const, top: 0, zIndex: 2, ...(dir === 'left' ? { left: -w } : { right: -w }) } : null),
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
    <View style={{ flex: 1, height: h, backgroundColor: '#fff', justifyContent: 'center', paddingHorizontal: 32 * u, gap: 2 * u, ...css({ backgroundImage: 'linear-gradient(180deg, #FFFFFF 0%, #EEF2EF 100%)' }) }}>
      <Text style={{ fontFamily: SANS, color: '#8A978F', fontWeight: '700', fontSize: 15 * u, letterSpacing: 3 * u, textAlign: align }}>{lead === s.letter ? 'LEADS' : lead ? 'TRAILS' : 'TIED'}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: s.color, fontFamily: fonts.serif, fontWeight: '700', fontSize: 50 * u, textAlign: align }}>{s.name}</Text>
    </View>
  );
  const score = (s: Side) => (
    <View style={{ width: 210 * u, height: h, backgroundColor: s.color, alignItems: 'center', justifyContent: 'center', zIndex: 1, overflow: 'visible', ...sheen(s.color) }}>
      {lead === s.letter ? <Arrow overlay dir={s.letter === A.letter ? 'left' : 'right'} color={s.color} h={h} /> : null}
      <Text style={{ fontFamily: fonts.serif, color: '#fff', fontWeight: '700', fontSize: 88 * u, ...TABULAR, ...css({ textShadow: '0 2px 10px rgba(0,0,0,0.25)' }) }}>{formatPoints(s.points)}</Text>
    </View>
  );
  return (
    <View style={{ gap: 10 * u }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 22 * u, overflow: 'hidden', ...SHADOW }}>
        {name(A, 'right')}
        {score(A)}
        {score(B)}
        {name(B, 'left')}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 40 * u }}>
        <View style={{ backgroundColor: A.color, borderRadius: 999, paddingHorizontal: 26 * u, paddingVertical: 4 * u, minWidth: 120 * u, alignItems: 'center', opacity: projLead === 'B' ? 0.75 : 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', ...sheen(A.color), ...SHADOW }}>
          <Text style={{ fontFamily: fonts.serif, color: '#fff', fontWeight: '700', fontSize: 38 * u, ...TABULAR }}>{formatPoints(A.projected)}</Text>
        </View>
        <Text style={{ fontFamily: SANS, color: 'rgba(255,255,255,0.8)', fontWeight: '800', fontSize: 18 * u, letterSpacing: 5 * u }}>PROJECTED</Text>
        <View style={{ backgroundColor: B.color, borderRadius: 999, paddingHorizontal: 26 * u, paddingVertical: 4 * u, minWidth: 120 * u, alignItems: 'center', opacity: projLead === 'A' ? 0.75 : 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', ...sheen(B.color), ...SHADOW }}>
          <Text style={{ fontFamily: fonts.serif, color: '#fff', fontWeight: '700', fontSize: 38 * u, ...TABULAR }}>{formatPoints(B.projected)}</Text>
        </View>
      </View>
    </View>
  );
}

function darken(hex: string, by = 0.2): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(v * (1 - by)).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
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
/** The scoreboard row: players either side, the status block in the leader's colour pointing at them. */
function MatchRow({ r, results, m, leftLetter, names, u, picks, h, onPress, open }: { r: RoundRecord; results: ReturnType<typeof evaluate>; m: MatchOutcome; leftLetter?: string; names: Names; u: number; picks: Picks; h: number; onPress?: () => void; open?: boolean }) {
  const v = matchView(r, results, m, leftLetter, picks);
  const people = (ids: string[], align: 'left' | 'right', color: string) => (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20 * u, gap: 0 }}>
      {ids.map((id) => (
        <View key={id} style={{ flexDirection: align === 'left' ? 'row' : 'row-reverse', alignItems: 'baseline', gap: 10 * u }}>
          <Text numberOfLines={1} style={{ fontFamily: SANS, color, fontWeight: '700', fontSize: (ids.length > 1 ? 21 : 26) * u, flexShrink: 1 }}>{names.get(id)?.name ?? '?'}</Text>
          {names.get(id)?.hcp !== undefined ? <Text style={{ fontFamily: SANS, color: '#7A8A82', fontWeight: '700', fontSize: 15 * u }}>HCP {formatIndex(names.get(id)!.hcp!)}</Text> : null}
        </View>
      ))}
    </View>
  );
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={onPress ? (open ? 'Close this match’s scorecard' : 'Open this match’s scorecard') : undefined} accessibilityState={{ expanded: !!open }}
      style={(st) => ({ flexDirection: 'row', alignItems: 'center', height: h, backgroundColor: hov(st) ? '#F3F7F4' : '#fff', borderRadius: 18 * u, borderBottomLeftRadius: open ? 0 : 18 * u, borderBottomRightRadius: open ? 0 : 18 * u, overflow: 'hidden', ...(open ? {} : SHADOW), ...css({ transition: 'background-color 150ms ease' }) })}>
      {people(v.left.members, 'left', v.lc)}
      <View style={{ width: 150 * u, height: h, backgroundColor: v.cellColor, alignItems: 'center', justifyContent: 'center', borderLeftWidth: v.ahead ? 0 : 1, borderRightWidth: v.ahead ? 0 : 1, borderColor: '#E3E8E5', ...(v.ahead || v.done ? sheen(v.cellColor) : css({ backgroundImage: 'linear-gradient(180deg, #F7F9F8 0%, #E9EEEB 100%)' })) , zIndex: 1, overflow: 'visible' }}>
        {v.ahead ? <Arrow overlay dir={v.ahead === 'L' ? 'left' : 'right'} color={v.cellColor} h={h} /> : null}
        <Text style={{ fontFamily: SANS, color: v.cellText, fontWeight: '800', fontSize: 32 * u, ...TABULAR }}>{v.big}</Text>
        <Text style={{ fontFamily: SANS, color: v.cellText, opacity: 0.85, fontWeight: '700', fontSize: 12 * u, letterSpacing: 2 * u }}>{v.small}</Text>
      </View>
      {people(v.right.members, 'right', v.rc)}
    </Pressable>
  );
}

/** Every match in the round: Team A's players left, Team B's right. Tap one to open its scorecard underneath. */
function Matches({ r, leftLetter, names, u, picks, open, onMatch }: { r: RoundRecord; leftLetter?: string; names: Names; u: number; picks: Picks; open: number | null; onMatch: (gi: number) => void }) {
  const results = evaluate(r);
  const rows = boardMatches(r, results);
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const tops = useRef<Record<number, number>>({});
  // Bring the opened match (and its scorecard) up into view.
  useEffect(() => {
    if (open === null) { scroller.current?.scrollTo({ y: 0, animated: true }); return; }
    const t = setTimeout(() => scroller.current?.scrollTo({ y: Math.max(0, (tops.current[open] ?? 0) - 8 * u), animated: true }), 60);
    return () => clearTimeout(t);
  }, [open, u]);
  if (!rows.length) return <Text style={{ fontFamily: SANS, color: '#FFFFFF99', fontSize: 24 * u }}>No matches in this round.</Text>;
  // Two columns when there are lots of matches (one while a scorecard is open), so every one stays big enough to read.
  const cols = rows.length > 6 && open === null ? 2 : 1;
  const perCol = Math.ceil(rows.length / cols);
  const rowH = Math.max(72, Math.min(100, 560 / Math.ceil(rows.length / (rows.length > 6 ? 2 : 1)))) * u;
  const columns = Array.from({ length: cols }, (_, i) => rows.slice(i * perCol, (i + 1) * perCol));
  return (
    <View style={{ flex: 1, minHeight: 0, gap: 8 * u }}>
      <ScrollView ref={scroller} style={{ flex: 1, marginHorizontal: -14 * u }} contentContainerStyle={{ flexDirection: 'row', gap: 16 * u, paddingHorizontal: 14 * u, paddingTop: 4 * u, paddingBottom: 30 * u }}>
        {columns.map((list, i) => (
          <View key={i} style={{ flex: 1, gap: 10 * u }}>
            {list.map((m) => (
              <View key={m.gi} onLayout={(ev) => { tops.current[m.gi] = ev.nativeEvent.layout.y; }}>
                <MatchRow r={r} results={results} m={m} leftLetter={leftLetter} names={names} u={u} picks={picks} h={rowH} open={open === m.gi} onPress={() => onMatch(m.gi)} />
                {open === m.gi ? <Scorecard r={r} results={results} m={m} leftLetter={leftLetter} names={names} u={u} picks={picks} /> : null}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
      <Text style={{ fontFamily: SANS, color: '#FFFFFF80', fontSize: 15 * u, textAlign: 'center' }}>{open === null ? 'Tap a match for its scorecard' : 'Tap the match again to close its scorecard'}</Text>
    </View>
  );
}

function BackBar({ u, title, sub, back, onBack, onHome }: { u: number; title: string; sub?: string; back: string; onBack: () => void; onHome?: () => void }) {
  const btn = (label: string, on: () => void) => (
    <Pressable onPress={on} accessibilityRole="button" style={(st) => ({ backgroundColor: hov(st) ? '#FFFFFF33' : '#FFFFFF1A', borderRadius: 10 * u, paddingHorizontal: 16 * u, paddingVertical: 8 * u })}>
      <Text style={{ fontFamily: SANS, color: '#fff', fontWeight: '700', fontSize: 20 * u }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 * u }}>
      {btn(`← ${back}`, onBack)}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: '#fff', fontFamily: SANS, fontWeight: '800', fontSize: 34 * u }}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={{ fontFamily: SANS, color: '#FFFFFFB0', fontSize: 20 * u, fontWeight: '600' }}>{sub}</Text> : null}
      </View>
      {onHome ? btn('Main board', onHome) : null}
    </View>
  );
}

function roundCourse(r: RoundRecord) {
  try { return shortCourseName(courseFor(r).name); } catch { return ''; }
}

/** One round: its date, course, format and team score, then every match (tap for the scorecard). */
function RoundDetail({ e, r, sides, names, u, picks, onBack, open, onMatch }: { e: EventRecord; r: RoundRecord; sides: [Side, Side] | null; names: Names; u: number; picks: Picks; onBack: () => void; open: number | null; onMatch: (gi: number) => void }) {
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
      <BackBar u={u} back="Main board" onBack={onBack} title={r.label ?? (plan ? planName(plan) : 'Round')} sub={sub} />
      {bar ? <TeamBar sides={bar} u={u * 0.8} /> : null}
      <Matches r={r} leftLetter={sides?.[0].letter} names={names} u={u} picks={picks} open={open} onMatch={onMatch} />
    </>
  );
}

/** The drawer under an opened match, hole by hole: par, every player's score, who won each hole and the running status. */
function Scorecard({ r, results, m, leftLetter, names, u, picks }: { r: RoundRecord; results: ReturnType<typeof evaluate>; m: MatchOutcome; leftLetter?: string; names: Names; u: number; picks: Picks }) {
  const c = useColors();
  const gi = m.gi;
  const res = results[gi];
  const v = matchView(r, results, m, leftLetter, picks);
  const holes = res && isResult(res) ? storyHoles(r, res, m, c) : [];
  const g = r.games[gi];
  const sub = [gameName(g), g.handicap?.net === false ? 'Gross' : 'Net', roundCourse(r)].filter(Boolean).join(' · ');
  // Lead from the left side's point of view.
  const sign = v.flip ? -1 : 1;
  // One row, like a printed card: 1–9, OUT, 10–18, IN, TOT (or just the holes and a total).
  type Col = { k: 'hole'; h: (typeof holes)[number] } | { k: 'sum'; id: string; label: string; hs: typeof holes };
  const cols: Col[] = holes.length === 18
    ? [...holes.slice(0, 9).map((h) => ({ k: 'hole' as const, h })), { k: 'sum', id: 'out', label: 'OUT', hs: holes.slice(0, 9) },
      ...holes.slice(9).map((h) => ({ k: 'hole' as const, h })), { k: 'sum', id: 'in', label: 'IN', hs: holes.slice(9) }, { k: 'sum', id: 'tot', label: 'TOT', hs: holes }]
    : [...holes.map((h) => ({ k: 'hole' as const, h })), { k: 'sum', id: 'tot', label: 'TOT', hs: holes }];
  const leftIds = v.left.members;
  const rightIds = v.right.members;
  const sum = (id: string, hs: typeof holes) => {
    const xs = hs.map((h) => grossAt(r, id, h.hole));
    return xs.some((x) => x !== null) ? xs.reduce<number>((t, x) => t + (x ?? 0), 0) : null;
  };
  const cellW = 46 * u;
  const sumW = 54 * u;
  const labelW = 150 * u;
  const rowH = 34 * u;
  const cell = (key: string | number, text: string | number | null, o: { bg?: string; color?: string; bold?: boolean; ring?: string; w?: number } = {}) => (
    <View key={key} style={{ width: o.w ?? cellW, height: rowH, alignItems: 'center', justifyContent: 'center', backgroundColor: o.bg }}>
      <View style={o.ring ? { borderWidth: 2 * u, borderColor: o.ring, borderRadius: 14 * u, minWidth: 28 * u, height: 28 * u, alignItems: 'center', justifyContent: 'center' } : undefined}>
        <Text style={{ fontFamily: SANS, color: o.color ?? INK, fontWeight: o.bold ? '800' : '600', ...TABULAR, fontSize: 17 * u }}>{text ?? ''}</Text>
      </View>
    </View>
  );
  const label = (text: string, color = INK, small = false) => (
    <View style={{ width: labelW, height: rowH, justifyContent: 'center', paddingHorizontal: 10 * u }}>
      <Text numberOfLines={1} style={{ fontFamily: SANS, color, fontWeight: '800', fontSize: (small ? 13 : 17) * u, letterSpacing: small ? 2 * u : 0 }}>{text}</Text>
    </View>
  );
  const sumCell = (col: Extract<Col, { k: 'sum' }>, text: string | number | null, o: { color?: string; bold?: boolean; bg?: string } = {}) =>
    cell(col.id, text, { w: sumW, bg: o.bg ?? (col.id === 'tot' ? '#E2E8E4' : '#EEF2EF'), color: o.color, bold: o.bold ?? true });
  const playerRow = (id: string, color: string, side: 1 | -1) => (
    <View key={id} style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: '#E3E8E5' }}>
      {label(names.get(id)?.name ?? '?', color)}
      {cols.map((col) => {
        if (col.k === 'sum') return sumCell(col, sum(id, col.hs));
        const h = col.h;
        const gross = grossAt(r, id, h.hole);
        const won = h.outcome !== null && h.outcome * sign === side;
        return cell(h.hole, gross, { bg: won ? `${color}22` : undefined, color: won ? color : INK, bold: won, ring: gross !== null && gross < h.par ? color : undefined });
      })}
    </View>
  );
  const table = (
    <View style={{ backgroundColor: '#fff', borderRadius: 10 * u, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', backgroundColor: INK }}>
        {label('HOLE', '#fff', true)}
        {cols.map((col) => (col.k === 'sum' ? sumCell(col, col.label, { color: GOLD, bg: '#0F1D17' }) : cell(col.h.hole, col.h.hole, { color: '#fff', bold: true })))}
      </View>
      <View style={{ flexDirection: 'row', backgroundColor: '#F4F6F5' }}>
        {label('PAR', '#4A5A52', true)}
        {cols.map((col) => (col.k === 'sum' ? sumCell(col, col.hs.reduce((t, h) => t + h.par, 0), { color: '#4A5A52', bold: false }) : cell(col.h.hole, col.h.par, { color: '#4A5A52' })))}
      </View>
      {leftIds.map((id) => playerRow(id, v.lc, 1))}
      {/* The match after each hole, in the leader's colour. */}
      <View style={{ flexDirection: 'row', borderTopWidth: 2, borderBottomWidth: 2, borderColor: '#C9D2CD' }}>
        {label('MATCH', '#4A5A52', true)}
        {cols.map((col) => {
          if (col.k === 'sum') return sumCell(col, '', { bg: '#fff' });
          const h = col.h;
          if (h.lead === null) return cell(h.hole, '');
          const lead = h.lead * sign;
          return cell(h.hole, lead === 0 ? 'AS' : `${Math.abs(lead)}`, { bg: lead > 0 ? v.lc : lead < 0 ? v.rc : '#E6EBE8', color: lead === 0 ? INK : '#fff', bold: true });
        })}
      </View>
      {rightIds.map((id) => playerRow(id, v.rc, -1))}
    </View>
  );
  return (
    <View style={{ backgroundColor: '#F1F4F2', borderBottomLeftRadius: 18 * u, borderBottomRightRadius: 18 * u, borderTopWidth: 1, borderColor: '#DDE3DF', ...SHADOW, paddingVertical: 12 * u, paddingHorizontal: 12 * u, gap: 8 * u, alignItems: 'center' }}>
      <Text style={{ fontFamily: SANS, color: '#4A5A52', fontWeight: '700', fontSize: 14 * u, letterSpacing: 2 * u }}>{sub.toUpperCase()}</Text>
      {holes.length ? (
        <>
          {table}
          <Text style={{ fontFamily: SANS, color: '#4A5A52', fontSize: 14 * u }}>Gross scores · shaded = won the hole · circled = birdie or better · MATCH = holes up after each hole</Text>
        </>
      ) : (
        <Text style={{ fontFamily: SANS, color: '#4A5A52', fontSize: 22 * u }}>No scores yet.</Text>
      )}
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
          <Text key={t} style={{ fontFamily: SANS, flex: i === 1 ? 4 : 1, color: '#7A8A82', fontWeight: '800', fontSize: 18 * u, letterSpacing: 2 * u, textAlign: i === 1 ? 'left' : 'center' }}>{t}</Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={r.playerId} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 * u, paddingHorizontal: 12 * u, borderRadius: 10 * u, backgroundColor: i === 0 ? '#F6EFD9' : i % 2 ? '#F4F6F5' : '#fff' }}>
          <Text style={{ fontFamily: SANS, flex: 1, textAlign: 'center', color: INK, fontWeight: '800', fontSize: 30 * u }}>{r.position}</Text>
          <Text numberOfLines={1} style={{ fontFamily: SANS, flex: 4, color: INK, fontWeight: '700', fontSize: 32 * u }}>{names.get(r.playerId)?.name ?? '?'}</Text>
          <Text style={{ fontFamily: SANS, flex: 1, textAlign: 'center', color: INK, fontWeight: '800', fontSize: 34 * u }}>{formatPoints(r.points)}</Text>
          <Text style={{ fontFamily: SANS, flex: 1, textAlign: 'center', color: '#4A5A52', fontWeight: '700', fontSize: 24 * u }}>{r.wins}–{r.halves}–{r.losses}</Text>
        </View>
      ))}
    </View>
  );
}

/** Every round played so far, with its team score (or "In play"). Tap one for its details. */
function RoundsList({ e, rounds, sides, u, selected, onRound }: { e: EventRecord; rounds: RoundRecord[]; sides: [Side, Side] | null; u: number; selected?: string; onRound: (id: string) => void }) {
  const list = (e.rounds ?? []).map((p) => ({ p, r: p.roundId ? rounds.find((x) => x.id === p.roundId) : undefined })).filter((x) => x.r);
  const extra = rounds.filter((r) => !(e.rounds ?? []).some((p) => p.roundId === r.id)).map((r) => ({ p: undefined, r }));
  const all = [...list, ...extra];
  // Rows are a fixed height so four of them set the panel's height; more than four scroll by themselves.
  const rowH = 38 * u;
  const gap = 4 * u;
  if (!all.length) return <Text style={{ fontFamily: SANS, color: MUTED, fontSize: 20 * u }}>No rounds played yet.</Text>;
  return (
    <AutoScroll u={u} maxHeight={all.length > 4 ? rowH * 4 + gap * 3 : undefined} gap={gap}>
      {all.map(({ p, r }) => {
        const score = sides && r ? roundTeamScore(r, evaluate(r)) : null;
        const of = (L: string) => score?.find((t) => t.letter === L)?.points ?? 0;
        return (
          <Pressable key={r!.id} onPress={() => onRound(r!.id)} accessibilityRole="button" accessibilityLabel={`Open ${r!.label ?? 'round'}`}
            style={(st) => ({ flexDirection: 'row', alignItems: 'center', gap: 10 * u, height: rowH, paddingHorizontal: 8 * u, marginHorizontal: -8 * u, borderRadius: 8 * u, backgroundColor: selected === r!.id ? 'rgba(31,90,61,0.12)' : hov(st) ? 'rgba(31,90,61,0.06)' : 'transparent' })}>
            <Text numberOfLines={1} style={{ fontFamily: SANS, flex: 1, color: INK, fontWeight: '700', fontSize: 21 * u }}>{r!.label ?? (p ? planName(p) : 'Round')}</Text>
            {sides && score ? (
              <Text style={{ fontFamily: SANS, fontWeight: '800', fontSize: 22 * u, ...TABULAR }}>
                <Text style={{ fontFamily: SANS, color: sides[0].color }}>{formatPoints(of(sides[0].letter))}</Text>
                <Text style={{ fontFamily: SANS, color: MUTED }}> – </Text>
                <Text style={{ fontFamily: SANS, color: sides[1].color }}>{formatPoints(of(sides[1].letter))}</Text>
              </Text>
            ) : null}
            <Text style={{ fontFamily: SANS, width: 64 * u, textAlign: 'right', color: r!.status === 'active' ? '#D63A2A' : MUTED, fontWeight: '800', fontSize: 14 * u, letterSpacing: 1 * u }}>{r!.status === 'active' ? 'LIVE' : 'FINAL'}</Text>
            <Text style={{ fontFamily: SANS, color: MUTED, fontSize: 20 * u }}>›</Text>
          </Pressable>
        );
      })}
    </AutoScroll>
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
    <Text numberOfLines={1} style={{ fontFamily: SANS, flex: 1, textAlign: align, color: letter ? teamColor(letter, picks).color : INK, fontWeight: '700', fontSize: (matches.length > 4 ? 16 : 18) * u }}>{ids.map(first).join(' & ')}</Text>
  );
  return (
    <Panel u={u} title="UP NEXT">
      <View style={{ gap: 2 * u }}>
        <Text style={{ color: INK, fontFamily: SANS, fontWeight: '800', fontSize: 24 * u }}>{planName(next)} · {formatDate(next.date!, { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
        {format || course ? <Text style={{ fontFamily: SANS, color: '#9A7A12', fontWeight: '800', fontSize: 18 * u }}>{[format, course].filter(Boolean).join(' · ')}</Text> : null}
      </View>
      {matches.length ? (
        <View style={{ gap: 4 * u }}>
          {matches.slice(0, 6).map((m, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * u }}>
              {side(m.a, m.ta, 'right')}
              <Text style={{ fontFamily: SANS, color: MUTED, fontWeight: '700', fontSize: 14 * u }}>vs</Text>
              {side(m.b, m.tb, 'left')}
            </View>
          ))}
          {matches.length > 6 ? <Text style={{ fontFamily: SANS, color: MUTED, fontSize: 15 * u, textAlign: 'center' }}>+{matches.length - 6} more</Text> : null}
        </View>
      ) : (
        <Text style={{ fontFamily: SANS, color: MUTED, fontSize: 17 * u }}>{e.fedex ? 'Stableford · whoever plays that day' : d?.kind || next.matchupsLater ? 'Matchups to be set on the day.' : 'Format and matchups to be set.'}</Text>
      )}
    </Panel>
  );
}

/** Every player's points and win–halve–loss record for the event, in their team's colour. */
function Contributions({ e, rounds, names, u, picks }: { e: EventRecord; rounds: RoundRecord[]; names: Names; u: number; picks: Picks }) {
  const rows = eventStandings(e, rounds);
  const letterOf = (id: string) => e.teamOf?.[id] ?? (e.teams ? (e.teams.A.playerIds.includes(id) ? 'A' : e.teams.B.playerIds.includes(id) ? 'B' : undefined) : undefined);
  if (!rows.length) return null;
  const fs = rows.length > 12 ? 16 : 18;
  return (
    <View style={{ flexShrink: 1, minHeight: 0, backgroundColor: PANEL, borderRadius: 22 * u, padding: 20 * u, gap: 10 * u, borderWidth: 1, borderColor: PANEL_LINE, ...SHADOW }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}><PanelTitle u={u} title="INDIVIDUAL CONTRIBUTIONS" /></View>
        <Text style={{ fontFamily: SANS, width: 56 * u, textAlign: 'right', color: MUTED, fontWeight: '800', fontSize: 13 * u, letterSpacing: 1 * u }}>PTS</Text>
        <Text style={{ fontFamily: SANS, width: 80 * u, textAlign: 'right', color: MUTED, fontWeight: '800', fontSize: 13 * u, letterSpacing: 1 * u }}>W–H–L</Text>
      </View>
      <AutoScroll u={u} style={{ flexGrow: 0, flexShrink: 1 }} gap={2 * u}>
        {rows.map((r) => {
          const L = letterOf(r.playerId);
          const color = L ? teamColor(L, picks).color : MUTED;
          return (
            <View key={r.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * u }}>
              <View style={{ width: 6 * u, height: 22 * u, borderRadius: 3 * u, backgroundColor: color }} />
              <Text numberOfLines={1} style={{ fontFamily: SANS, flex: 1, color: INK, fontWeight: '700', fontSize: fs * u }}>{names.get(r.playerId)?.name ?? '?'}</Text>
              <Text style={{ fontFamily: SANS, width: 56 * u, textAlign: 'right', color, fontWeight: '800', fontSize: (fs + 2) * u, ...TABULAR }}>{formatPoints(r.points)}</Text>
              <Text style={{ fontFamily: SANS, width: 80 * u, textAlign: 'right', color: MUTED, fontWeight: '700', fontSize: fs * u, ...TABULAR }}>{r.wins}–{r.halves}–{r.losses}</Text>
            </View>
          );
        })}
      </AutoScroll>
    </View>
  );
}

/**
 * A list that scrolls itself, slowly, when it has more than fits (the Rounds and Individual contributions panels):
 * it waits a few seconds at the top, glides to the bottom, waits, then goes back to the top and starts again.
 * Anyone can still scroll it by hand; it carries on from wherever they leave it.
 */
function AutoScroll({ u, style, maxHeight, gap, children }: { u: number; style?: object; maxHeight?: number; gap?: number; children: React.ReactNode }) {
  const ref = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [box, setBox] = useState(0);
  const [content, setContent] = useState(0);
  const y = useRef(0);
  const overflow = Math.round(content - box);
  useEffect(() => {
    if (overflow < 1) {
      y.current = 0;
      ref.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    const TICK = 33;
    const SPEED = 24 * u; // pixels a second: slow enough to read names as they pass
    const PAUSE = 3500;
    let waitUntil = Date.now() + PAUSE;
    let atBottom = false;
    const t = setInterval(() => {
      const now = Date.now();
      if (now < waitUntil) return;
      if (atBottom) {
        // Back to the top, then wait before going again.
        atBottom = false;
        y.current = 0;
        ref.current?.scrollTo({ y: 0, animated: true });
        waitUntil = now + PAUSE;
        return;
      }
      y.current = Math.min(overflow, y.current + (SPEED * TICK) / 1000);
      ref.current?.scrollTo({ y: y.current, animated: false });
      if (y.current >= overflow) {
        atBottom = true;
        waitUntil = now + PAUSE;
      }
    }, TICK);
    return () => clearInterval(t);
  }, [overflow, u]);
  return (
    <ScrollView
      ref={ref}
      style={[style, maxHeight !== undefined ? { maxHeight } : null]}
      contentContainerStyle={{ gap }}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={100}
      onScroll={(ev) => {
        // Only follow someone scrolling by hand; our own sub-pixel steps come back rounded.
        const at = ev.nativeEvent.contentOffset.y;
        if (Math.abs(at - y.current) > 3) y.current = at;
      }}
      onLayout={(ev) => setBox(ev.nativeEvent.layout.height)}
      onContentSizeChange={(_, h) => setContent(h)}
    >
      {children}
    </ScrollView>
  );
}

// ------------------------------------------------------------------ Points Race seasons

const PART_LABEL: Record<FedexPart, string> = { first: '1ST HALF', second: '2ND HALF', season: 'SEASON' };

/**
 * Points Race standings, rotating between the half being played, the season, and the other half (when it has
 * rounds) every 20 seconds. Tap a tab to pick one. Arrows show who moved up or down in the latest round.
 */
function RaceStandings({ e, results, names, u }: { e: EventRecord; results: FedexRoundResult[]; names: Names; u: number }) {
  const cfg = e.fedex!;
  const now = currentHalf(e, results) === 2 ? 'second' : 'first';
  const other = now === 'second' ? 'first' : 'second';
  const parts: FedexPart[] = [now, 'season', ...(results.some((r) => r.half === (other === 'first' ? 1 : 2)) ? [other as FedexPart] : [])];
  const [i, setI] = useState(0);
  const [touch, setTouch] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % parts.length), 20000);
    return () => clearInterval(t);
  }, [parts.length, touch]);
  const part = parts[i % parts.length];
  const n = part === 'first' ? cfg.best.first : part === 'second' ? cfg.best.second : cfg.best.season;
  const rows = fedexStandings(results, cfg, part, e.playerIds).filter((r) => r.played > 0);
  const before = new Map(fedexStandings(results.slice(0, -1), cfg, part, e.playerIds).filter((r) => r.played > 0).map((r) => [r.playerId, r.position]));
  const last = results.at(-1);
  const lastPts = (id: string) => last?.rows.find((x) => x.playerId === id)?.cup;
  const fs = rows.length > 14 ? 24 : rows.length > 10 ? 28 : 32;
  const head = (t: string, flex: number, align: 'left' | 'center' = 'center') => (
    <Text key={t} style={{ fontFamily: SANS, flex, color: '#7A8A82', fontWeight: '800', fontSize: 16 * u, letterSpacing: 2 * u, textAlign: align }}>{t}</Text>
  );
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 18 * u, padding: 20 * u, gap: 6 * u, ...SHADOW }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 * u, marginBottom: 6 * u }}>
        {parts.map((p, j) => (
          <Pressable key={p} onPress={() => { setI(j); setTouch((x) => x + 1); }} accessibilityRole="tab"
            style={(st) => ({ paddingHorizontal: 18 * u, paddingVertical: 8 * u, borderRadius: 999, backgroundColor: p === part ? PRIMARY : hov(st) ? 'rgba(31,90,61,0.08)' : 'rgba(31,90,61,0.04)' })}>
            <Text style={{ fontFamily: SANS, color: p === part ? '#fff' : PRIMARY, fontWeight: '800', fontSize: 18 * u, letterSpacing: 2 * u }}>{PART_LABEL[p]}</Text>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <Text style={{ fontFamily: SANS, color: MUTED, fontWeight: '700', fontSize: 18 * u }}>Best {n} rounds count</Text>
      </View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 12 * u }}>
        {head('POS', 1.1)}{head('PLAYER', 4.4, 'left')}{head('PTS', 1.5)}{head('RDS', 1)}{head('AVG', 1.2)}{head(`${n}TH BEST`, 1.5)}{head('LAST', 1.2)}
      </View>
      {rows.length === 0 ? (
        <Text style={{ fontFamily: SANS, color: '#4A5A52', fontSize: 24 * u, padding: 12 * u }}>{part === 'second' ? 'The 2nd half hasn’t started yet.' : 'No rounds played yet.'}</Text>
      ) : (
        <AutoScroll u={u} style={{ flexShrink: 1 }} gap={3 * u}>
          {rows.map((r, j) => {
            const was = before.get(r.playerId);
            const move = was ? was - r.position : 0;
            const lp = lastPts(r.playerId);
            return (
              <View key={r.playerId} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7 * u, paddingHorizontal: 12 * u, borderRadius: 10 * u, backgroundColor: j === 0 ? '#F6EFD9' : j % 2 ? '#F4F6F5' : '#fff' }}>
                <View style={{ flex: 1.1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 * u }}>
                  <Text style={{ fontFamily: SANS, color: INK, fontWeight: '800', fontSize: fs * u }}>{r.position}</Text>
                  {move ? <Text style={{ fontFamily: SANS, color: move > 0 ? '#2E7D4F' : '#C0392B', fontWeight: '800', fontSize: 14 * u }}>{move > 0 ? '▲' : '▼'}{Math.abs(move)}</Text> : null}
                </View>
                <Text numberOfLines={1} style={{ fontFamily: SANS, flex: 4.4, color: INK, fontWeight: '700', fontSize: fs * u }}>{names.get(r.playerId)?.name ?? '?'}</Text>
                <Text style={{ fontFamily: SANS, flex: 1.5, textAlign: 'center', color: INK, fontWeight: '800', fontSize: (fs + 2) * u, ...TABULAR }}>{fmtPts(r.points)}</Text>
                <Text style={{ fontFamily: SANS, flex: 1, textAlign: 'center', color: '#4A5A52', fontWeight: '700', fontSize: (fs - 6) * u, ...TABULAR }}>{r.played}</Text>
                <Text style={{ fontFamily: SANS, flex: 1.2, textAlign: 'center', color: '#4A5A52', fontWeight: '700', fontSize: (fs - 6) * u, ...TABULAR }}>{r.average.toFixed(1)}</Text>
                <Text style={{ fontFamily: SANS, flex: 1.5, textAlign: 'center', color: MUTED, fontWeight: '700', fontSize: (fs - 6) * u, ...TABULAR }}>{r.cutoff !== null ? fmtPts(r.cutoff) : '–'}</Text>
                <Text style={{ fontFamily: SANS, flex: 1.2, textAlign: 'center', color: lp !== undefined ? PRIMARY : MUTED, fontWeight: '800', fontSize: (fs - 6) * u, ...TABULAR }}>{lp !== undefined && (part === 'season' || last?.half === (part === 'first' ? 1 : 2)) ? fmtPts(lp) : '–'}</Text>
              </View>
            );
          })}
        </AutoScroll>
      )}
    </View>
  );
}

/** The latest finished round: places, Stableford, bonus and race points. */
function RaceLastRound({ results, names, u }: { results: FedexRoundResult[]; names: Names; u: number }) {
  const last = results.at(-1);
  if (!last) return null;
  const rows = last.rows;
  return (
    <Panel u={u} title={`LAST ROUND · ${formatDate(last.round.date, { month: 'short', day: 'numeric' }).toUpperCase()}`}>
      <AutoScroll u={u} maxHeight={rows.length > 6 ? 30 * u * 6 + 3 * u * 5 : undefined} gap={3 * u}>
        {rows.map((x) => (
          <View key={x.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * u, height: 30 * u }}>
            <Text style={{ fontFamily: SANS, width: 40 * u, color: INK, fontWeight: '800', fontSize: 18 * u }}>{x.tied ? 'T' : ''}{x.place}</Text>
            <Text numberOfLines={1} style={{ fontFamily: SANS, flex: 1, color: INK, fontWeight: '700', fontSize: 19 * u }}>{names.get(x.playerId)?.name ?? '?'}</Text>
            <Text style={{ fontFamily: SANS, width: 40 * u, textAlign: 'right', color: MUTED, fontWeight: '700', fontSize: 17 * u, ...TABULAR }}>{x.stableford}</Text>
            <Text style={{ fontFamily: SANS, width: 54 * u, textAlign: 'right', color: '#2E7D4F', fontWeight: '700', fontSize: 17 * u, ...TABULAR }}>{x.bonus ? `+${fmtPts(x.bonus)}` : ''}</Text>
            <Text style={{ fontFamily: SANS, width: 56 * u, textAlign: 'right', color: PRIMARY, fontWeight: '800', fontSize: 20 * u, ...TABULAR }}>{fmtPts(x.cup)}</Text>
          </View>
        ))}
      </AutoScroll>
    </Panel>
  );
}

/** A round being played: Stableford so far, and the bonus each player would get if it finished now. */
function RaceLive({ e, r, names, u }: { e: EventRecord; r: RoundRecord; names: Names; u: number }) {
  let totals: Record<string, number> = {};
  const thru: Record<string, number> = {};
  try {
    const res = evaluate(r).find((x) => x && 'type' in x && x.type === 'stableford');
    if (res && 'totals' in res) {
      totals = res.totals as Record<string, number>;
      for (const s of res.standings) thru[s.id] = s.thru ?? 0;
    }
  } catch { /* not scored yet */ }
  const rows = scoreRound(totals, e.fedex!.bonus);
  if (!rows.length) return null;
  return (
    <Panel u={u} title="LIVE ROUND · IF IT ENDED NOW">
      <AutoScroll u={u} maxHeight={rows.length > 6 ? 30 * u * 6 + 3 * u * 5 : undefined} gap={3 * u}>
        {rows.map((x) => (
          <View key={x.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * u, height: 30 * u }}>
            <Text style={{ fontFamily: SANS, width: 40 * u, color: INK, fontWeight: '800', fontSize: 18 * u }}>{x.tied ? 'T' : ''}{x.place}</Text>
            <Text numberOfLines={1} style={{ fontFamily: SANS, flex: 1, color: INK, fontWeight: '700', fontSize: 19 * u }}>{names.get(x.playerId)?.name ?? '?'}</Text>
            <Text style={{ fontFamily: SANS, width: 52 * u, textAlign: 'right', color: MUTED, fontWeight: '700', fontSize: 14 * u }}>{thru[x.playerId] >= 18 ? 'F' : `thru ${thru[x.playerId] ?? 0}`}</Text>
            <Text style={{ fontFamily: SANS, width: 40 * u, textAlign: 'right', color: INK, fontWeight: '800', fontSize: 18 * u, ...TABULAR }}>{x.stableford}</Text>
            <Text style={{ fontFamily: SANS, width: 54 * u, textAlign: 'right', color: '#2E7D4F', fontWeight: '700', fontSize: 17 * u, ...TABULAR }}>{x.bonus ? `+${fmtPts(x.bonus)}` : ''}</Text>
          </View>
        ))}
      </AutoScroll>
    </Panel>
  );
}
