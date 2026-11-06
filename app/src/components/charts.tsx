import { useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

import type { ScoreTypes, TrendPoint } from '@/lib/analytics';
import { toPar } from '@/lib/format';
import { fonts, radius, space, useColors } from '@/theme';

/** Diverging scale for score types: under par (red) → par (neutral) → over par (navy). Validated for CVD separation. */
export const SCORE_TYPE_COLORS = {
  eagle: '#8E1B14',
  birdie: '#D45A52',
  par: '#DDD8CC',
  bogey: '#7E9CC6',
  double: '#1F3A60',
};
const TYPE_LABELS: [keyof typeof SCORE_TYPE_COLORS, string][] = [
  ['eagle', 'Eagle or better'],
  ['birdie', 'Birdie'],
  ['par', 'Par'],
  ['bogey', 'Bogey'],
  ['double', 'Double or worse'],
];

const PLOT_H = 140;
const DOT = 10;

/** Gross score per round, oldest to newest. Tap a dot to see the round. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const [sel, setSel] = useState(points.length - 1);
  if (points.length === 0) return null;
  const scores = points.map((p) => p.gross);
  const lo = Math.floor((Math.min(...scores) - 2) / 2) * 2;
  const hi = Math.ceil((Math.max(...scores) + 2) / 2) * 2;
  const ticks = [hi, Math.round((hi + lo) / 2), lo];
  const AXIS = 30;
  const plotW = Math.max(0, width - AXIS - DOT);
  const x = (i: number) => AXIS + DOT / 2 + (points.length === 1 ? plotW / 2 : (plotW * i) / (points.length - 1));
  // Lower scores are better, but the chart keeps the usual direction: higher score = higher on the chart.
  const y = (g: number) => PLOT_H - ((g - lo) / (hi - lo)) * PLOT_H;
  const best = Math.min(...scores);
  const s = points[Math.min(sel, points.length - 1)];

  return (
    <View>
      <View style={{ minHeight: 40, marginBottom: space.sm }}>
        <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 }}>
          {new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {s.course}
        </Text>
        <Text style={{ color: c.text, fontFamily: fonts.serif, fontSize: 22, fontWeight: '700' }}>
          {s.gross} <Text style={{ fontSize: 15, color: c.muted }}>({toPar(s.toPar)}){s.gross === best ? '  · Best' : ''}</Text>
        </Text>
      </View>
      <View style={{ height: PLOT_H + 22 }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {/* recessive grid + y labels */}
        {ticks.map((t) => (
          <View key={t} style={{ position: 'absolute', left: 0, right: 0, top: y(t) - 7, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ width: AXIS - 4, color: c.muted, fontSize: 10, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{t}</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: c.border, marginLeft: 4 }} />
          </View>
        ))}
        {/* 2px connecting line */}
        {width > 0 &&
          points.slice(1).map((p, i) => {
            const x1 = x(i), y1 = y(points[i].gross), x2 = x(i + 1), y2 = y(p.gross);
            const len = Math.hypot(x2 - x1, y2 - y1);
            const ang = Math.atan2(y2 - y1, x2 - x1);
            return (
              <View
                key={p.roundId}
                style={{
                  position: 'absolute', left: (x1 + x2) / 2 - len / 2, top: (y1 + y2) / 2 - 1, width: len, height: 2,
                  backgroundColor: c.primary, opacity: 0.55, transform: [{ rotate: `${ang}rad` }],
                }}
              />
            );
          })}
        {/* dots with a surface ring; hit target larger than the dot */}
        {width > 0 &&
          points.map((p, i) => {
            const active = i === sel;
            const size = active ? DOT + 4 : DOT;
            return (
              <Pressable
                key={p.roundId}
                onPress={() => setSel(i)}
                accessibilityLabel={`Round ${i + 1}: ${p.gross}`}
                style={{ position: 'absolute', left: x(i) - 16, top: y(p.gross) - 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: active ? c.accent : c.primary, borderWidth: 2, borderColor: c.card }} />
              </Pressable>
            );
          })}
        {/* x labels: first and last only */}
        {width > 0 && (
          <>
            <Text style={{ position: 'absolute', left: AXIS, top: PLOT_H + 6, color: c.muted, fontSize: 10 }}>
              {new Date(points[0].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Text>
            {points.length > 1 && (
              <Text style={{ position: 'absolute', right: 0, top: PLOT_H + 6, color: c.muted, fontSize: 10 }}>
                {new Date(points[points.length - 1].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

/** Share of holes by score type, as one split bar with a legend that doubles as the table. */
export function ScoreTypeBar({ types }: { types: ScoreTypes }) {
  const c = useColors();
  const [sel, setSel] = useState<keyof typeof SCORE_TYPE_COLORS | null>(null);
  if (!types.holes) return null;
  const pct = (n: number) => Math.round((n / types.holes) * 100);
  const segs = TYPE_LABELS.filter(([k]) => types[k] > 0);
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', height: 20, gap: 2 }}>
        {segs.map(([k], i) => (
          <Pressable
            key={k}
            onPress={() => setSel(sel === k ? null : k)}
            accessibilityLabel={`${k} ${pct(types[k])}%`}
            style={{
              flex: types[k],
              backgroundColor: SCORE_TYPE_COLORS[k],
              opacity: sel && sel !== k ? 0.35 : 1,
              borderTopLeftRadius: i === 0 ? radius.sm : 0,
              borderBottomLeftRadius: i === 0 ? radius.sm : 0,
              borderTopRightRadius: i === segs.length - 1 ? radius.sm : 0,
              borderBottomRightRadius: i === segs.length - 1 ? radius.sm : 0,
            }}
          />
        ))}
      </View>
      <View style={{ gap: 6 }}>
        {TYPE_LABELS.map(([k, label]) => (
          <Pressable key={k} onPress={() => setSel(sel === k ? null : k)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, opacity: sel && sel !== k ? 0.45 : 1 }}>
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: SCORE_TYPE_COLORS[k], borderWidth: k === 'par' ? 1 : 0, borderColor: c.border }} />
              <Text style={{ flex: 1, color: c.text, fontSize: 14 }}>{label}</Text>
              <Text style={{ color: c.muted, fontSize: 13, fontVariant: ['tabular-nums'], width: 44, textAlign: 'right' }}>{types[k]}</Text>
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'], width: 44, textAlign: 'right' }}>{pct(types[k])}%</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Single-series horizontal bars (from zero) with values written out. */
export function HBars({ rows }: { rows: { label: string; value: number | null; display: string; note?: string }[] }) {
  const c = useColors();
  const max = Math.max(0.01, ...rows.map((r) => Math.abs(r.value ?? 0)));
  return (
    <View style={{ gap: space.md }}>
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{r.label}</Text>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{r.display}</Text>
          </View>
          <View style={{ height: 10, backgroundColor: c.chip, borderRadius: radius.sm }}>
            <View style={{ width: `${(Math.abs(r.value ?? 0) / max) * 100}%`, height: 10, backgroundColor: (r.value ?? 0) < 0 ? SCORE_TYPE_COLORS.birdie : c.primary, borderRadius: radius.sm }} />
          </View>
          {r.note ? <Text style={{ color: c.muted, fontSize: 11 }}>{r.note}</Text> : null}
        </View>
      ))}
    </View>
  );
}
