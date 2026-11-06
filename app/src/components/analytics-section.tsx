import { Text, View } from 'react-native';

import { myAnalytics, overPar } from '@/lib/analytics';
import { normalizeMe, useMe } from '@/lib/me';
import { useStore } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';
import { HBars, ScoreTypeBar, TrendChart } from './charts';
import { Body, Card, H2, Label } from './ui';

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: space.md, backgroundColor: c.bg, borderRadius: radius.md }}>
      <Label style={{ textAlign: 'center' }}>{label}</Label>
      <Text style={{ fontFamily: fonts.serif, fontSize: 22, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] }}>{value}</Text>
      {sub ? <Text style={{ color: c.muted, fontSize: 11 }}>{sub}</Text> : null}
    </View>
  );
}

/** My scoring analytics (Profile). */
export function AnalyticsSection() {
  const c = useColors();
  const rounds = useStore((s) => s.rounds);
  const history = useStore((s) => s.history);
  const meAliases = useStore((s) => s.meAliases);
  const { me } = useMe();
  if (!me) return null;
  const a = myAnalytics(rounds, [me.id, ...meAliases], normalizeMe(history, me.id, meAliases), me.id);

  if (a.rounds === 0) {
    return (
      <Card>
        <H2>Analytics</H2>
        <Body muted>Finish a round to see your scoring trend, score types, par 3/4/5 scoring and more.</Body>
      </Card>
    );
  }

  const matches = a.record.wins + a.record.losses + a.record.halves;
  const winPct = matches ? Math.round(((a.record.wins + a.record.halves / 2) / matches) * 100) : null;

  return (
    <View style={{ gap: space.md }}>
      <Label>Analytics · {a.rounds} round{a.rounds === 1 ? '' : 's'} · {a.holes} holes</Label>

      {a.trend.length > 0 && (
        <Card>
          <H2>Scoring trend</H2>
          <Text style={{ color: c.muted, fontSize: 12 }}>Gross score, last {a.trend.length} full round{a.trend.length === 1 ? '' : 's'}. Tap a dot for details.</Text>
          <TrendChart points={a.trend} />
        </Card>
      )}

      <Card>
        <H2>Score types</H2>
        <ScoreTypeBar types={a.types} />
      </Card>

      <Card>
        <H2>Scoring by par</H2>
        <Text style={{ color: c.muted, fontSize: 12 }}>Average strokes over par per hole.</Text>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {([3, 4, 5] as const).map((p) => (
            <Tile key={p} label={`Par ${p}s`} value={overPar(a.byPar[p].over)} sub={`${a.byPar[p].holes} holes`} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Tile label="Front 9" value={overPar(a.nines.front, 1)} sub="avg vs par" />
          <Tile label="Back 9" value={overPar(a.nines.back, 1)} sub="avg vs par" />
        </View>
      </Card>

      <Card>
        <H2>By hole difficulty</H2>
        <HBars rows={a.difficulty.map((d) => ({ label: d.label, value: d.over, display: overPar(d.over), note: `${d.holes} holes` }))} />
      </Card>

      <Card>
        <H2>Matches</H2>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Tile label="Record" value={matches ? `${a.record.wins}-${a.record.losses}-${a.record.halves}` : '–'} sub="W-L-H" />
          <Tile label="Win rate" value={winPct === null ? '–' : `${winPct}%`} sub={`${matches} match${matches === 1 ? '' : 'es'}`} />
        </View>
      </Card>

      <Card>
        <H2>Putting & greens</H2>
        {a.stats.holesTracked === 0 ? (
          <Body muted>Turn on “Track stats” when setting up a round to see putts, fairways and greens in regulation.</Body>
        ) : (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Tile label="Putts" value={a.stats.putts === null ? '–' : String(a.stats.putts)} sub="per 18" />
            <Tile label="Fairways" value={a.stats.fir === null ? '–' : `${a.stats.fir}%`} sub="hit" />
            <Tile label="Greens" value={a.stats.gir === null ? '–' : `${a.stats.gir}%`} sub="in regulation" />
          </View>
        )}
      </Card>
    </View>
  );
}
