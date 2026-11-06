/**
 * "How many holes?" (the same for every match) and "Starting hole" (per match):
 * hole 1, hole 10, or any hole (shotgun starts).
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { isMatchFormat, type GameDraft } from '@/lib/games';
import { holeOrder } from '@golf/engine';
import { radius, space, useColors } from '@/theme';
import { Body, Card, H2, Label, Segmented } from './ui';

/** "Holes 1–9", "Holes 10–18, then 1–9". */
export function holesText(holes: 9 | 18, start: number) {
  const order = holeOrder({ holes, start });
  const first = order[0];
  const wrap = order.findIndex((n, i) => i > 0 && n < order[i - 1]);
  if (wrap < 0) return `Holes ${first}–${order[order.length - 1]}`;
  return `Holes ${first}–${order[wrap - 1]}, then ${order[wrap]}–${order[order.length - 1]}`;
}

function StartPicker({ value, onChange, holes, label }: { value: number; onChange: (n: number) => void; holes: 9 | 18; label?: string }) {
  const c = useColors();
  const [custom, setCustom] = useState(value !== 1 && value !== 10);
  const choice = custom ? 'custom' : value === 10 ? '10' : '1';
  return (
    <View style={{ gap: space.xs }}>
      {label ? <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>{label}</Text> : null}
      <Segmented
        options={[
          { value: '1', label: 'Hole 1' },
          { value: '10', label: 'Hole 10' },
          { value: 'custom', label: custom && value !== 1 && value !== 10 ? `Hole ${value}` : 'Custom' },
        ]}
        value={choice}
        onChange={(v) => {
          if (v === 'custom') return setCustom(true);
          setCustom(false);
          onChange(Number(v));
        }}
      />
      {custom && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
          {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => {
            const sel = n === value;
            return (
              <Pressable
                key={n}
                onPress={() => onChange(n)}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                accessibilityLabel={`Start on hole ${n}`}
                style={{ width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: sel ? c.primary : c.border, backgroundColor: sel ? c.primary : c.card }}>
                <Text style={{ color: sel ? c.onPrimary : c.text, fontWeight: '700' }}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <Label style={{ textTransform: 'none', letterSpacing: 0 }}>{holesText(holes, value)}</Label>
    </View>
  );
}

export function HolesSetup({ draft, onChange, name, hideStarts }: { draft: GameDraft; onChange: (d: GameDraft) => void; name: (id: string) => string; hideStarts?: boolean }) {
  const holes = draft.holes === 9 ? 9 : 18;
  const perMatch = isMatchFormat(draft.kind) && draft.matches.length > 1;
  const short = (ids: string[]) => ids.map((id) => name(id).split(' ')[0]).join(' & ');
  return (
    <Card style={{ gap: space.md }}>
      <View style={{ gap: space.xs }}>
        <H2>Holes</H2>
        <Segmented
          options={[{ value: '18', label: '18 holes' }, { value: '9', label: '9 holes' }]}
          value={String(holes) as '18' | '9'}
          onChange={(v) => onChange({ ...draft, holes: v === '9' ? 9 : 18 })}
        />
        {holes === 9 && <Body muted>Handicap strokes are halved for nine holes.</Body>}
      </View>
      {!hideStarts && (
        <View style={{ gap: space.md }}>
          <H2>Starting hole</H2>
          {isMatchFormat(draft.kind) && draft.matches.length > 0 ? (
            draft.matches.map((m, i) => (
              <StartPicker
                key={i}
                holes={holes}
                label={perMatch ? `Match ${i + 1}: ${short(m.a)} vs ${short(m.b)}` : undefined}
                value={m.start ?? 1}
                onChange={(n) => onChange({ ...draft, matches: draft.matches.map((x, j) => (j === i ? { ...x, start: n } : x)) })}
              />
            ))
          ) : (
            <StartPicker holes={holes} value={draft.start ?? 1} onChange={(n) => onChange({ ...draft, start: n })} />
          )}
          {perMatch && <Body muted>Each match can start on a different hole (for example, a shotgun start).</Body>}
        </View>
      )}
    </Card>
  );
}
