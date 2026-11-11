import { Pressable, Text, TextInput, View } from 'react-native';

import { formatIndex, shuffle } from '@/lib/format';
import type { TeamOf } from '@/lib/games';
import { teamName } from '@/lib/team-colors';
import { fonts, radius, space, TEAM_LETTERS, teamColor, useColors, TEAM_SWATCHES, type TeamPicks } from '@/theme';
import { Body, Card, Label } from './ui';

export interface TeamPlayer {
  id: string;
  name: string;
  handicapIndex: number;
}

/**
 * Assign every player to a team before choosing the game. Starts with an empty Team A and
 * Team B; more teams can be added. Randomize deals players out evenly, Balance makes fair
 * teams by handicap (snake draft), Clear empties every team.
 */
export function TeamsStep({
  players,
  teamOf,
  onTeamOf,
  letters,
  onLetters,
  lockedReason,
  maxTeams = TEAM_LETTERS.length,
  note,
  colors,
  onColors,
  names,
  onNames,
}: {
  /** Name given to each team (letter → name), and a way to change it. */
  names?: Record<string, string>;
  onNames?: (n: Record<string, string>) => void;
  /** Colour picked for each team (letter → swatch id), and a way to change it. */
  colors?: TeamPicks;
  onColors?: (c: TeamPicks) => void;
  players: TeamPlayer[];
  teamOf: TeamOf;
  onTeamOf: (t: TeamOf) => void;
  letters: string[];
  onLetters: (l: string[]) => void;
  /** Set when teams come from somewhere else (e.g. a Ryder Cup event) and can't be changed here. */
  lockedReason?: string;
  /** e.g. 2 for a Ryder Cup. */
  maxTeams?: number;
  /** Extra line under the title. */
  note?: string;
}) {
  const c = useColors();
  const unassigned = players.filter((p) => !teamOf[p.id] || !letters.includes(teamOf[p.id]));
  const set = (id: string, L: string | null) => {
    const next = { ...teamOf };
    if (L) next[id] = L;
    else delete next[id];
    onTeamOf(next);
  };

  const deal = (order: TeamPlayer[], snake: boolean) => {
    const next: TeamOf = {};
    order.forEach((p, i) => {
      const round = Math.floor(i / letters.length);
      const pos = i % letters.length;
      next[p.id] = letters[snake && round % 2 === 1 ? letters.length - 1 - pos : pos];
    });
    onTeamOf(next);
  };
  const randomize = () => deal(shuffle(players), false);
  const balance = () => deal([...players].sort((a, b) => a.handicapIndex - b.handicapIndex), true);
  const clear = () => onTeamOf({});
  const addTeam = () => {
    const nextLetter = TEAM_LETTERS.find((L) => !letters.includes(L));
    if (nextLetter) onLetters([...letters, nextLetter]);
  };
  const removeTeam = (L: string) => {
    onLetters(letters.filter((x) => x !== L));
    onTeamOf(Object.fromEntries(Object.entries(teamOf).filter(([, t]) => t !== L)));
  };

  const action = (title: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={6} style={({ pressed }) => ({ paddingVertical: 7, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: c.chip, opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13 }}>{title}</Text>
    </Pressable>
  );

  if (lockedReason) {
    return (
      <Card>
        <Text style={{ fontFamily: fonts.serif, fontSize: 19, fontWeight: '700', color: c.text }}>Teams</Text>
        <Body muted>{lockedReason}</Body>
        {letters.map((L) => {
          const tc = teamColor(L, colors);
          const members = players.filter((p) => teamOf[p.id] === L);
          return (
            <View key={L} style={{ backgroundColor: tc.soft, borderRadius: radius.md, padding: space.md, borderLeftWidth: 4, borderLeftColor: tc.color }}>
              <Text style={{ color: tc.color, fontWeight: '800', fontSize: 12, letterSpacing: 1.2 }}>{teamName(L, names).toUpperCase()}</Text>
              <Text style={{ color: c.text, fontSize: 15 }}>{members.map((p) => p.name).join(', ') || '—'}</Text>
            </View>
          );
        })}
      </Card>
    );
  }

  return (
    <View style={{ gap: space.md }}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: fonts.serif, fontSize: 19, fontWeight: '700', color: c.text }}>Teams</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {action('Randomize', randomize)}
            {action('Balance', balance)}
            {action('Clear', clear)}
          </View>
        </View>
        <Text style={{ color: c.muted, fontSize: 13 }}>Put every player on a team. Balance makes fair teams by handicap.{note ? ` ${note}` : ''}</Text>

        {unassigned.length > 0 && (
          <View style={{ gap: 2, marginTop: space.xs }}>
            <Label>Unassigned · {unassigned.length}</Label>
            {unassigned.map((p, i) => (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{p.name}</Text>
                  <Text style={{ color: c.muted, fontSize: 12 }}>Index {formatIndex(p.handicapIndex)}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {letters.map((L) => {
                    const tc = teamColor(L, colors);
                    return (
                      <Pressable
                        key={L}
                        accessibilityRole="button"
                        accessibilityLabel={`Put ${p.name} on Team ${L}`}
                        onPress={() => set(p.id, L)}
                        hitSlop={4}
                        style={({ pressed }) => ({
                          width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: tc.color,
                          alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? tc.soft : c.card,
                        })}>
                        <Text style={{ color: tc.color, fontWeight: '800', fontSize: 14 }}>{L}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>

      {letters.map((L) => {
        const tc = teamColor(L, colors);
        const members = players.filter((p) => teamOf[p.id] === L);
        return (
          <View key={L} style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: tc.color, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
              <Text numberOfLines={1} style={{ flex: 1, color: '#fff', fontFamily: fonts.serif, fontSize: 17, fontWeight: '700' }}>{teamName(L, names)}</Text>
              <Text style={{ color: '#ffffffcc', fontSize: 12, fontWeight: '700', marginRight: letters.length > 2 ? space.md : 0 }}>
                {members.length} player{members.length === 1 ? '' : 's'}
              </Text>
              {letters.length > 2 && (
                <Pressable onPress={() => removeTeam(L)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove Team ${L}`}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Remove</Text>
                </Pressable>
              )}
            </View>
            {onNames && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.lg, paddingTop: space.sm }}>
                <Text numberOfLines={1} style={{ color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, width: 66 }}>NAME</Text>
                <TextInput
                  value={names?.[L] ?? ''}
                  onChangeText={(v) => onNames({ ...(names ?? {}), [L]: v })}
                  placeholder={`Team ${L}`}
                  placeholderTextColor={c.muted}
                  maxLength={24}
                  autoCapitalize="words"
                  returnKeyType="done"
                  accessibilityLabel={`Name for Team ${L}`}
                  style={{ flex: 1, color: c.text, fontSize: 16, fontWeight: '600', paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg }}
                />
              </View>
            )}
            {onColors && (
              // Pick the team's colour (each team gets a different one).
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <Text numberOfLines={1} style={{ color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, width: 66 }}>COLOUR</Text>
                {TEAM_SWATCHES.map((sw) => {
                  const mine = tc.color === sw.color;
                  const taken = !mine && letters.some((o) => o !== L && teamColor(o, colors).color === sw.color);
                  return (
                    <Pressable
                      key={sw.id}
                      disabled={taken}
                      onPress={() => onColors({ ...(colors ?? {}), [L]: sw.id })}
                      accessibilityRole="button"
                      accessibilityState={{ selected: mine, disabled: taken }}
                      accessibilityLabel={`${sw.name} for Team ${L}${taken ? ' (another team has it)' : ''}`}
                      hitSlop={4}
                      style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: sw.color, opacity: taken ? 0.2 : 1, borderWidth: mine ? 3 : 0, borderColor: c.card, alignItems: 'center', justifyContent: 'center', ...(mine ? { shadowColor: sw.color, shadowOpacity: 0.8, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, outlineColor: sw.color, outlineWidth: 2, outlineStyle: 'solid' } : {}) }}>
                      {mine ? <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>✓</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
            <View style={{ paddingHorizontal: space.lg, backgroundColor: tc.soft }}>
              {members.length === 0 ? (
                <Text style={{ color: c.muted, paddingVertical: space.md, fontSize: 14 }}>No players yet. Use the team buttons above.</Text>
              ) : (
                members.map((p, i) => (
                  <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
                    <Text style={{ flex: 1, color: c.text, fontSize: 16, fontWeight: '600' }}>{p.name}</Text>
                    <Text style={{ color: c.muted, fontSize: 13, marginRight: space.md }}>{formatIndex(p.handicapIndex)}</Text>
                    <Pressable onPress={() => set(p.id, null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Take ${p.name} off Team ${L}`}>
                      <Text style={{ color: c.muted, fontSize: 18 }}>×</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          </View>
        );
      })}

      {letters.length < Math.min(maxTeams, TEAM_LETTERS.length) && (
        <Pressable
          onPress={addTeam}
          accessibilityRole="button"
          style={({ pressed }) => ({ paddingVertical: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.primary, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ color: c.primary, fontWeight: '700', fontSize: 15 }}>+ Add Team {TEAM_LETTERS.find((L) => !letters.includes(L))}</Text>
        </Pressable>
      )}
    </View>
  );
}
