import type { GameResult, HoleOutcome } from '@golf/engine';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { gameKeys, matchLabel } from '@/lib/games';
import { grossAt, scoreKeys, teeFor } from '@/lib/round';
import { holeWinner, teamGroups, teamHole } from '@/lib/teams';
import type { RoundRecord } from '@/store/store';
import { fonts, useColors } from '@/theme';

const W = 34; // hole cell width
const SUM = 42; // out/in/total width
const NAME = 92;
const H = 38;

/** Traditional scorecard marks: circle = birdie, double circle = eagle, square = bogey, double square = double+. */
export function Mark({ gross, par, dot }: { gross: number | null; par: number; dot: number }) {
  const c = useColors();
  if (gross === null) {
    return (
      <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
        {dot > 0 && <View style={{ position: 'absolute', top: 1, right: 1, width: 5, height: 5, borderRadius: 3, backgroundColor: c.accent }} />}
        {dot > 1 && <View style={{ position: 'absolute', top: 8, right: 1, width: 5, height: 5, borderRadius: 3, backgroundColor: c.accent }} />}
      </View>
    );
  }
  const d = gross - par;
  const color = d < 0 ? c.under : c.over;
  const shape = (inset: number, round: boolean) => ({
    position: 'absolute' as const, top: inset, left: inset, right: inset, bottom: inset,
    borderWidth: 1, borderColor: color, borderRadius: round ? 20 : 1,
  });
  return (
    <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
      {d <= -1 && <View style={shape(2, true)} />}
      {d <= -2 && <View style={shape(5, true)} />}
      {d >= 1 && <View style={shape(3, false)} />}
      {d >= 2 && <View style={shape(6, false)} />}
      <Text style={{ color, fontSize: 14, fontWeight: '600' }}>{gross}</Text>
      {dot > 0 && <View style={{ position: 'absolute', top: 1, right: 1, width: 5, height: 5, borderRadius: 3, backgroundColor: c.accent }} />}
      {dot > 1 && <View style={{ position: 'absolute', top: 8, right: 1, width: 5, height: 5, borderRadius: 3, backgroundColor: c.accent }} />}
    </View>
  );
}

export function ScorecardGrid({
  r,
  results,
  onPickHole,
  focus = 0,
}: {
  r: RoundRecord;
  results: (GameResult | { error: string })[];
  onPickHole: (hole: number) => void;
  /** Which game (match) the card is about. */
  focus?: number;
}) {
  const c = useColors();
  const main = results[focus] && !('error' in results[focus]) ? results[focus] : undefined;
  const strokes = main?.strokes ?? {};
  const tee = teeFor(r, r.players[0].id);
  const multi = r.games.filter((g) => matchLabel(g)).length > 1;
  const focusKeys = new Set(gameKeys(r.games[focus]));
  const keys = scoreKeys(r).filter((k) => !multi || focusKeys.has(k.key));
  const teams = teamGroups(r, c, focus);
  const label = (k: string) => keys.find((x) => x.key === k)?.label ?? k;
  const front = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const back = [10, 11, 12, 13, 14, 15, 16, 17, 18];
  const parOf = (k: string, h: number) => teeFor(r, keys.find((x) => x.key === k)?.members[0] ?? r.players[0].id).holes[h - 1].par;
  const sum = (k: string, holes: number[]) => {
    const v = holes.map((h) => grossAt(r, k, h));
    return v.some((x) => x !== null) ? v.reduce<number>((s, x) => s + (x ?? 0), 0) : '';
  };

  // Match status after each hole (for match-play main games).
  let outcomes: HoleOutcome[] | null = null;
  if (main?.type === 'matchPlay') outcomes = main.status.outcomes;
  if (main?.type === 'nassau') outcomes = main.segments[2].status.outcomes;
  const names = main?.type === 'matchPlay' ? [main.sideA.name, main.sideB.name] : null;
  const letterA = teams ? teams[0].label.slice(-1) : !names ? 'A' : names[0].slice(0, 1).toUpperCase();
  const letterB = teams ? (teams[1]?.label.slice(-1) ?? 'B') : !names ? 'B' : names[1].slice(0, 1).toUpperCase() === letterA ? names[1].slice(0, 2) : names[1].slice(0, 1).toUpperCase();
  const running: (number | null)[] = [];
  if (outcomes) {
    let lead = 0;
    outcomes.forEach((o, i) => {
      if (o === null) return running.push(null); // not played yet (later holes still count)
      lead += o;
      running.push(lead);
    });
  }

  const cell = (content: React.ReactNode, w = W, bg?: string, key?: string | number) => (
    <View key={key} style={{ width: w, height: H, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderRightWidth: 1, borderRightColor: c.border }}>
      {content}
    </View>
  );
  const headText = (t: string | number, color = c.onPrimary) => <Text style={{ color, fontWeight: '700', fontSize: 13 }}>{t}</Text>;
  const row = (name: React.ReactNode, cells: React.ReactNode[], bg?: string, key?: string) => (
    <View key={key} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: bg }}>
      <View style={{ width: NAME, height: H, justifyContent: 'center', paddingHorizontal: 8, borderRightWidth: 1, borderRightColor: c.border }}>{name}</View>
      {cells}
    </View>
  );
  const nineCells = (fn: (h: number) => React.ReactNode, sumFn: (holes: number[], which: string) => React.ReactNode, bg?: string) => [
    ...front.map((h) => cell(fn(h), W, bg, h)),
    cell(sumFn(front, 'out'), SUM, bg ?? c.chip, 'out'),
    ...back.map((h) => cell(fn(h), W, bg, h)),
    cell(sumFn(back, 'in'), SUM, bg ?? c.chip, 'in'),
    cell(sumFn([...front, ...back], 'tot'), SUM, bg ?? c.chip, 'tot'),
  ];
  const nameText = (t: string, color = c.text) => <Text numberOfLines={1} style={{ color, fontWeight: '600', fontSize: 13 }}>{t}</Text>;

  const playerRow = (k: string) =>
    row(
      nameText(label(k)),
      nineCells(
        (h) => (
          <Pressable onPress={() => onPickHole(h)}>
            <Mark gross={grossAt(r, k, h)} par={parOf(k, h)} dot={strokes[k]?.[h - 1] ?? 0} />
          </Pressable>
        ),
        (holes) => <Text style={{ fontWeight: '700', color: c.text }}>{sum(k, holes)}</Text>,
      ),
      undefined,
      k,
    );

  const grouped = teams ? teams.flatMap((t) => t.keys) : [];
  const rest = keys.map((k) => k.key).filter((k) => !grouped.includes(k));

  return (
    <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 8, overflow: 'hidden' }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {row(headText('HOLE'), nineCells((h) => headText(h), (_, w) => headText(w.toUpperCase())), c.primary, 'hole')}
          {row(nameText('Par', c.muted), nineCells((h) => <Text style={{ color: c.muted }}>{tee.holes[h - 1].par}</Text>, (holes) => <Text style={{ color: c.muted, fontWeight: '700' }}>{holes.reduce((s, h) => s + tee.holes[h - 1].par, 0)}</Text>), c.bg, 'par')}
          {row(nameText('Hcp', c.muted), nineCells((h) => <Text style={{ color: c.muted, fontSize: 12 }}>{tee.holes[h - 1].strokeIndex}</Text>, () => null), c.bg, 'si')}

          {teams?.map((t, ti) => (
            <View key={t.id}>
              <View style={{ flexDirection: 'row', backgroundColor: t.soft, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <View style={{ width: NAME, paddingHorizontal: 8, paddingVertical: 4, borderLeftWidth: 4, borderLeftColor: t.color }}>
                  <Text style={{ color: t.color, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>{t.label.toUpperCase()}</Text>
                </View>
              </View>
              {t.keys.map(playerRow)}
              {t.keys.length > 1 &&
                row(
                  nameText(r.games[focus].type === 'vegas' ? 'Team #' : 'Team', t.color),
                  nineCells(
                    (h) => {
                      const th = teamHole(r, main, t, h, focus);
                      const w = holeWinner(teams.map((x) => teamHole(r, main, x, h, focus)));
                      return <Text style={{ color: t.color, fontWeight: w === ti ? '800' : '500', fontSize: th.score !== null && th.score >= 100 ? 11 : 14, textDecorationLine: w === ti ? 'underline' : 'none' }}>{th.score ?? ''}</Text>;
                    },
                    () => null,
                    t.soft,
                  ),
                  t.soft,
                  `${t.id}-team`,
                )}
            </View>
          ))}

          {rest.map(playerRow)}

          {outcomes &&
            row(
              nameText('Match', c.muted),
              nineCells(
                (h) => {
                  const v = running[h - 1];
                  if (v === null || v === undefined) return null;
                  const color = v > 0 ? (teams?.[0].color ?? c.teamA) : v < 0 ? (teams?.[1]?.color ?? c.teamB) : c.muted;
                  return <Text style={{ color, fontWeight: '700', fontSize: 12, fontFamily: fonts.serif }}>{v === 0 ? 'AS' : `${v > 0 ? letterA : letterB}${Math.abs(v)}`}</Text>;
                },
                () => null,
              ),
              c.bg,
              'match',
            )}
        </View>
      </ScrollView>
    </View>
  );
}
