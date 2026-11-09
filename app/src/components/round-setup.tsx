import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatIndex } from '@/lib/format';
import { GAME_RULES } from '@/lib/game-rules';
import { gameFitProblem, gameInfo, GAMES, type GameKind, type TeamOf } from '@/lib/games';
import type { SavedPlayer } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';

// ------------------------------------------------------------------ step pills

export function StepPills<T extends string>({
  steps,
  current,
  isDone,
  canGo,
  onGo,
}: {
  steps: { value: T; label: string }[];
  current: T;
  isDone: (s: T) => boolean;
  canGo: (s: T) => boolean;
  onGo: (s: T) => void;
}) {
  const c = useColors();
  // Five steps (New Event) need smaller pills to fit a phone.
  const compact = steps.length > 4;
  const gap = compact ? 3 : 6;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      {steps.map((s, i) => {
        const active = s.value === current;
        const done = !active && isDone(s.value);
        return (
          <View key={s.value} style={{ flex: active && compact ? 1.35 : 1, flexDirection: 'row', alignItems: 'center', gap }}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              disabled={!canGo(s.value)}
              onPress={() => onGo(s.value)}
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: compact ? 2 : 6,
                paddingVertical: compact ? 9 : 11,
                paddingHorizontal: compact ? 2 : 0,
                borderRadius: radius.pill,
                backgroundColor: active ? c.primary : done ? c.primarySoft : c.card,
                borderWidth: 1.5,
                borderColor: active || done ? c.primary : c.border,
                opacity: pressed ? 0.75 : canGo(s.value) || active ? 1 : 0.55,
                shadowColor: active ? c.primary : 'transparent',
                shadowOpacity: active ? 0.25 : 0,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
              })}>
              {done && !compact && <Text style={{ color: c.primary, fontWeight: '900', fontSize: 13 }}>✓</Text>}
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: active ? c.onPrimary : done ? c.primary : c.muted, fontWeight: '700', fontSize: compact ? 12 : 15, letterSpacing: compact ? 0 : 0.3 }}>{s.label}</Text>
            </Pressable>
            {i < steps.length - 1 && <View style={{ width: compact ? 3 : 8, height: 2, borderRadius: 1, backgroundColor: done ? c.primary : c.border }} />}
          </View>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ player picker

/** Searchable checklist: tick 1 to many players; search Clutch Up for someone new. */
export function PlayerPicker({
  people,
  selected,
  onToggle,
  isMe,
  indexFor,
  colorFor,
  onFindNew,
  allowNew = true,
}: {
  people: SavedPlayer[];
  selected: string[];
  onToggle: (p: SavedPlayer) => void;
  isMe: (id: string) => boolean;
  indexFor: (p: SavedPlayer) => number;
  colorFor?: (id: string) => string | undefined;
  onFindNew: (query: string) => void;
  allowNew?: boolean;
}) {
  const c = useColors();
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase().replace(/^@/, '');
  const shown = term
    ? people.filter((p) => p.name.toLowerCase().includes(term) || (p.username ?? '').toLowerCase().startsWith(term))
    : people;

  return (
    <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.lg }}>
        <Text style={{ fontFamily: fonts.serif, fontSize: 19, fontWeight: '700', color: c.text }}>Who’s playing?</Text>
        <View style={{ backgroundColor: selected.length ? c.primary : c.chip, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text style={{ color: selected.length ? c.onPrimary : c.muted, fontWeight: '700', fontSize: 13 }}>{selected.length} selected</Text>
        </View>
      </View>

      <View style={{ margin: space.lg, marginBottom: space.sm, flexDirection: 'row', alignItems: 'center', backgroundColor: c.chip, borderRadius: radius.pill, paddingHorizontal: space.md }}>
        <Text style={{ color: c.muted, fontSize: 16 }}>⌕</Text>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={allowNew ? 'Search friends or Clutch Up' : 'Search players'}
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search players"
          style={{ flex: 1, color: c.text, fontSize: 16, paddingVertical: 10, paddingHorizontal: space.sm }}
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel="Clear search">
            <Text style={{ color: c.muted, fontSize: 16 }}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {shown.map((p, i) => {
        const on = selected.includes(p.id);
        const tint = colorFor?.(p.id) ?? c.primary;
        return (
          <Pressable
            key={p.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${p.name}${isMe(p.id) ? ' (Me)' : ''}`}
            onPress={() => onToggle(p)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              backgroundColor: pressed ? c.chip : on ? c.primarySoft : 'transparent',
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: c.border,
            })}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: on ? tint : c.chip, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: on ? '#fff' : c.primary, fontWeight: '700', fontSize: 15 }}>{p.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text numberOfLines={1} style={{ color: c.text, fontSize: 16, fontWeight: '600', flexShrink: 1 }}>{p.name}</Text>
                {isMe(p.id) && (
                  <View style={{ backgroundColor: c.accent, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>ME</Text>
                  </View>
                )}
              </View>
              <Text style={{ color: c.muted, fontSize: 12 }}>
                {p.username ? `@${p.username} · ` : ''}Index {formatIndex(indexFor(p))}
                {p.pending ? ' · requested' : ''}
              </Text>
            </View>
            <View
              style={{
                width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: on ? tint : c.border,
                backgroundColor: on ? tint : 'transparent', alignItems: 'center', justifyContent: 'center',
              }}>
              {on && <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>✓</Text>}
            </View>
          </Pressable>
        );
      })}

      {shown.length === 0 && term ? (
        <Text style={{ color: c.muted, paddingHorizontal: space.lg, paddingBottom: space.sm }}>No friends match “{q.trim()}”.</Text>
      ) : null}

      {allowNew && (
        <Pressable
          accessibilityRole="button"
          onPress={() => onFindNew(q.trim())}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: pressed ? c.chip : 'transparent' })}>
          <View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: c.primary, fontSize: 20, fontWeight: '600' }}>+</Text>
          </View>
          <Text style={{ flex: 1, color: c.primary, fontSize: 16, fontWeight: '600' }}>
            {term ? `Search Clutch Up for “${q.trim()}”` : 'Add someone new'}
          </Text>
          <Text style={{ color: c.primary, fontSize: 18 }}>›</Text>
        </Pressable>
      )}
    </View>
  );
}

// ------------------------------------------------------------------ game drop-down

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Lifts the sheet above the keyboard when it has text boxes. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={{ flex: 1, backgroundColor: '#00000055' }} onPress={onClose} accessibilityLabel="Close" />
      <View style={{ maxHeight: '82%', backgroundColor: c.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: insets.bottom + space.md }}>
        <View style={{ alignItems: 'center', paddingTop: space.sm }}>
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.border }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md }}>
          <Text style={{ flex: 1, fontFamily: fonts.serif, fontSize: 20, fontWeight: '700', color: c.text }}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Done">
            <Text style={{ color: c.primary, fontSize: 16, fontWeight: '700' }}>Done</Text>
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>{children}</ScrollView>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Drop-down to choose the main game. Games that don't fit the group size are shown greyed out with the reason. */
export function GamePicker({ value, playerIds, teamOf, onPick, onLater }: { value: GameKind | null; playerIds: string[]; teamOf?: TeamOf; onPick: (k: GameKind) => void; onLater?: () => void }) {
  const playerCount = playerIds.length;
  const c = useColors();
  const [open, setOpen] = useState(false);
  const info = value ? gameInfo(value) : null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose game"
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: c.card, borderRadius: radius.lg,
          borderWidth: 1.5, borderColor: value ? c.primary : c.border, paddingHorizontal: space.lg, paddingVertical: space.md, opacity: pressed ? 0.8 : 1,
        })}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 }}>MAIN GAME</Text>
          <Text style={{ fontFamily: fonts.serif, fontSize: 20, fontWeight: '700', color: value ? c.text : c.muted }}>{info ? info.name : onLater ? 'Decide later' : 'Choose a game'}</Text>
          {info ? <Text style={{ color: c.muted, fontSize: 13 }}>{info.blurb}</Text> : onLater ? <Text style={{ color: c.muted, fontSize: 13 }}>Pick the game when the round is set up</Text> : null}
        </View>
        <Text style={{ color: c.primary, fontSize: 18, fontWeight: '700' }}>▾</Text>
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Choose a game">
        <Text style={{ color: c.muted, marginBottom: space.sm }}>{playerCount} player{playerCount === 1 ? '' : 's'} selected</Text>
        {onLater && (
          <Pressable onPress={() => { onLater(); setOpen(false); }} accessibilityRole="button" accessibilityState={{ selected: !value }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 })}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>Decide later</Text>
              <Text style={{ color: c.muted, fontSize: 13 }}>Choose the game when the round is set up</Text>
            </View>
            {!value && <Text style={{ color: c.primary, fontSize: 18, fontWeight: '900' }}>✓</Text>}
          </Pressable>
        )}
        {GAMES.map((g, i) => {
          const problem = gameFitProblem(g, playerIds, teamOf);
          const fits = !problem;
          const sel = g.kind === value;
          return (
            <Pressable
              key={g.kind}
              accessibilityRole="button"
              accessibilityState={{ disabled: !fits, selected: sel }}
              disabled={!fits}
              onPress={() => {
                onPick(g.kind);
                setOpen(false);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md,
                borderTopWidth: i ? 1 : 0, borderTopColor: c.border, opacity: fits ? (pressed ? 0.6 : 1) : 0.45,
              })}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{g.name}</Text>
                <Text style={{ color: c.muted, fontSize: 13 }}>{problem ?? g.blurb}</Text>
              </View>
              {sel && <Text style={{ color: c.primary, fontSize: 18, fontWeight: '900' }}>✓</Text>}
            </Pressable>
          );
        })}
      </Sheet>
    </>
  );
}

// ------------------------------------------------------------------ rules

/** "How it works" link that opens the rules and scoring for a game. */
export function GameRulesButton({ kind }: { kind: GameKind }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const r = GAME_RULES[kind];
  const section = (title: string, items: string[]) => (
    <View style={{ gap: 6, marginTop: space.lg }}>
      <Text style={{ color: c.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 }}>{title.toUpperCase()}</Text>
      {items.map((t) => (
        <View key={t} style={{ flexDirection: 'row', gap: space.sm }}>
          <Text style={{ color: c.primary, fontSize: 15 }}>•</Text>
          <Text style={{ flex: 1, color: c.text, fontSize: 15, lineHeight: 21 }}>{t}</Text>
        </View>
      ))}
    </View>
  );
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: c.primary, fontSize: 12, fontWeight: '800', fontFamily: fonts.serif }}>i</Text>
        </View>
        <Text style={{ color: c.primary, fontWeight: '700', fontSize: 15 }}>How {gameInfo(kind).name} works</Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={gameInfo(kind).name}>
        <Text style={{ color: c.text, fontSize: 16, lineHeight: 23 }}>{r.overview}</Text>
        {section('How it works', r.howItWorks)}
        {section('Scoring', r.scoring)}
        {section('Handicaps', [r.handicaps])}
        {r.options ? section('Options you can set', r.options) : null}
        {r.example ? (
          <View style={{ marginTop: space.lg, backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.md }}>
            <Text style={{ color: c.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.4, marginBottom: 4 }}>EXAMPLE</Text>
            <Text style={{ color: c.text, fontSize: 15, lineHeight: 21 }}>{r.example}</Text>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}
