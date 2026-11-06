import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { MatchStory, SideRow } from '@/components/match-result';
import { ScorecardGrid } from '@/components/scorecard-grid';
import { Body, Card, H2, Label } from '@/components/ui';
import { useMe } from '@/lib/me';
import { matchOutcomes } from '@/lib/results';
import { evaluate, isResult } from '@/lib/round';
import { storyHoles } from '@/lib/story';
import { useRound } from '@/store/store';
import { fonts, radius, space, teamColor, useColors } from '@/theme';

/** Everything about one match: result, story, hole-by-hole breakdown and the full scorecard. */
export default function MatchDetail() {
  const { id, gi } = useLocalSearchParams<{ id: string; gi: string }>();
  const r = useRound(id);
  const c = useColors();
  const { isMe } = useMe();
  if (!r) return <Body>Round not found.</Body>;

  const results = evaluate(r);
  const m = matchOutcomes(r, results).find((x) => x.gi === Number(gi));
  const res = results[Number(gi)];
  if (!m || !res || !isResult(res)) return <Body>Match not found.</Body>;
  const holes = storyHoles(r, res, m, c);
  const myIds = r.players.filter((p) => isMe(p.id)).map((p) => p.id);
  const showTeam = m.a.letter !== m.b.letter;
  const ca = teamColor(m.a.letter);
  const cb = teamColor(m.b.letter);
  const played = holes.filter((h) => h.outcome !== null);
  const won = (side: 1 | -1) => played.filter((h) => h.outcome === side).length;

  const sumOf = (side: 'a' | 'b', list: typeof holes) => {
    const v = list.map((h) => h[side]).filter((x): x is number => x !== null);
    return v.length ? v.reduce((s, x) => s + x, 0) : '–';
  };
  const statusText = (lead: number | null) => (lead === null ? '' : lead === 0 ? 'AS' : `${Math.abs(lead)} UP`);
  const head = (t: string, w: number | undefined, color = c.muted) => (
    <Text style={{ width: w, flex: w ? undefined : 1, textAlign: 'center', color, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>{t}</Text>
  );

  const row = (h: (typeof holes)[number]) => {
    const aWin = h.outcome === 1;
    const bWin = h.outcome === -1;
    const cell = (v: number | null, win: boolean, tc: { color: string; soft: string }) => (
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ minWidth: 34, paddingVertical: 3, paddingHorizontal: 6, borderRadius: radius.sm, backgroundColor: win ? tc.color : 'transparent', alignItems: 'center' }}>
          <Text style={{ color: win ? '#fff' : v === null ? c.muted : c.text, fontWeight: win ? '800' : '500', fontSize: 15 }}>{v ?? '–'}</Text>
        </View>
      </View>
    );
    const leadColor = h.lead === null || h.lead === 0 ? c.muted : h.lead > 0 ? ca.color : cb.color;
    return (
      <View key={h.hole} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderTopWidth: 1, borderTopColor: c.border, opacity: h.outcome === null && h.a !== null ? 0.4 : 1 }}>
        <Text style={{ width: 36, textAlign: 'center', color: c.text, fontWeight: '700' }}>{h.hole}</Text>
        <Text style={{ width: 34, textAlign: 'center', color: c.muted }}>{h.par}</Text>
        {cell(h.a, aWin, ca)}
        {cell(h.b, bWin, cb)}
        <Text style={{ width: 62, textAlign: 'center', color: leadColor, fontWeight: '800', fontSize: 12, fontFamily: fonts.serif }}>
          {h.lead === null ? '' : h.lead === 0 ? 'AS' : `${h.lead > 0 ? m.a.letter : m.b.letter} ${statusText(h.lead)}`}
          {h.birdies.length ? ' ●' : ''}
        </Text>
      </View>
    );
  };
  const totalRow = (label: string, list: typeof holes) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, backgroundColor: c.chip, borderTopWidth: 1, borderTopColor: c.border }}>
      <Text style={{ width: 36, textAlign: 'center', color: c.text, fontWeight: '800', fontSize: 11 }}>{label}</Text>
      <Text style={{ width: 34, textAlign: 'center', color: c.muted, fontWeight: '700' }}>{list.reduce((s, h) => s + h.par, 0)}</Text>
      <Text style={{ flex: 1, textAlign: 'center', color: ca.color, fontWeight: '800' }}>{sumOf('a', list)}</Text>
      <Text style={{ flex: 1, textAlign: 'center', color: cb.color, fontWeight: '800' }}>{sumOf('b', list)}</Text>
      <View style={{ width: 62 }} />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Label>{m.title}</Label>
          <Label>{m.winner === 'halved' ? 'Halved' : m.winner ? 'Final' : m.detail}</Label>
        </View>
        <SideRow m={m} s={m.a} which="a" showTeam={showTeam} me={m.a.members.some((x) => myIds.includes(x))} />
        <SideRow m={m} s={m.b} which="b" showTeam={showTeam} me={m.b.members.some((x) => myIds.includes(x))} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingTop: space.xs }}>
          {[
            { n: won(1), label: showTeam ? `Team ${m.a.letter} won` : `${m.a.names.split(' ')[0]} won`, color: ca.color },
            { n: played.filter((h) => h.outcome === 0).length, label: 'Halved', color: c.muted },
            { n: won(-1), label: showTeam ? `Team ${m.b.letter} won` : `${m.b.names.split(' ')[0]} won`, color: cb.color },
          ].map((x) => (
            <View key={x.label} style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ color: x.color, fontFamily: fonts.serif, fontSize: 26, fontWeight: '700' }}>{x.n}</Text>
              <Text numberOfLines={2} style={{ color: c.muted, fontSize: 11, textAlign: 'center' }}>{x.label}</Text>
            </View>
          ))}
        </View>
        <MatchStory r={r} res={res} m={m} holes={holes} />
      </Card>

      <Card>
        <H2>Hole by hole</H2>
        <Text style={{ color: c.muted, fontSize: 12 }}>
          {r.games[m.gi].handicap?.net === false ? 'Gross scores.' : 'Net scores (after handicap strokes).'} The side that won each hole is filled in. ● = a birdie. Faded holes were played after the match was decided.
        </Text>
        <View>
          <View style={{ flexDirection: 'row', paddingBottom: 6 }}>
            {head('HOLE', 36)}
            {head('PAR', 34)}
            {head(showTeam ? `TEAM ${m.a.letter}` : m.a.names.split(' ')[0].toUpperCase(), undefined, ca.color)}
            {head(showTeam ? `TEAM ${m.b.letter}` : m.b.names.split(' ')[0].toUpperCase(), undefined, cb.color)}
            {head('MATCH', 62)}
          </View>
          {holes.slice(0, 9).map(row)}
          {holes.length > 9 && totalRow(holes[0]?.hole === 1 ? 'OUT' : '1ST 9', holes.slice(0, 9))}
          {holes.slice(9).map(row)}
          {holes.length > 9 && totalRow(holes[0]?.hole === 1 ? 'IN' : '2ND 9', holes.slice(9))}
          {totalRow('TOT', holes)}
        </View>
      </Card>

      <View style={{ gap: space.sm }}>
        <H2>Full scorecard</H2>
        <ScorecardGrid r={r} results={results} focus={m.gi} onPickHole={() => undefined} />
        <Text style={{ color: c.muted, fontSize: 12 }}>○ birdie  ◎ eagle  □ bogey  ⧈ double+  · gold dot = gets a shot</Text>
      </View>
    </ScrollView>
  );
}
