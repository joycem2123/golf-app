import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { formatDate, today } from '@/lib/dates';
import { formatPoints } from '@/lib/events';
import { gameInfo, gameName } from '@/lib/games';
import { matchOutcomes, roundTeamScore } from '@/lib/results';
import { courseFor, evaluate, isResult, shortCourseName } from '@/lib/round';
import { useStore, type EventRecord } from '@/store/store';
import { fonts, radius, space, teamColor, useColors } from '@/theme';
import { Button, Card, H2, Label } from './ui';

/** Every planned round of the event: date, format, status, team score, and Start / Resume / Results. */
export function EventRounds({ e }: { e: EventRecord }) {
  const c = useColors();
  const rounds = useStore((s) => s.rounds);
  const list = e.rounds ?? [];
  const canEdit = e.remote?.role !== 'viewer';
  const nextUp = list.find((x) => !rounds.some((r) => r.id === x.roundId && r.status === 'complete'))?.id;

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <H2>Rounds</H2>
        <Label>{list.filter((x) => rounds.some((r) => r.id === x.roundId && r.status === 'complete')).length} of {list.length} played</Label>
      </View>
      {list.map((x) => {
        const r = rounds.find((y) => y.id === x.roundId);
        const status = !r ? 'upcoming' : r.status === 'complete' ? 'final' : 'live';
        const results = r ? evaluate(r) : [];
        const score = r ? roundTeamScore(r, results) : null;
        const summary = !score && r && results[0] && isResult(results[0]) ? results[0].summary : null;
        const fmt = r ? gameName(r.games[0]) : x.draft ? gameInfo(x.draft.kind).name : 'Format TBD';
        const matches = r ? matchOutcomes(r, results).filter((m) => !(r.games[m.gi].id ?? '').startsWith('side-')).length : x.matchupsLater ? 0 : (x.draft?.matches.length ?? 0);
        const date = x.date ?? (r ? new Date(r.createdAt).toISOString().slice(0, 10) : undefined);
        let course = '';
        try { if (r) course = shortCourseName(courseFor(r).name); } catch { /* course missing */ }
        const isNext = x.id === nextUp;
        const open = () => {
          if (r) router.push(status === 'final' ? `/round/${r.id}/results` : `/round/${r.id}`);
          else if (canEdit) router.push({ pathname: '/new-round', params: { eventId: e.id, eventRound: x.id } });
        };
        return (
          <Pressable key={x.id} onPress={open} accessibilityRole="button" accessibilityLabel={`Round ${x.number}`}>
            {({ pressed }) => (
              <View style={{ flexDirection: 'row', gap: space.md, paddingVertical: space.md, borderTopWidth: 1, borderTopColor: c.border, opacity: pressed ? 0.6 : 1 }}>
                <View style={{ width: 50, alignItems: 'center', paddingTop: 2 }}>
                  <Text style={{ color: date && date < today() && status === 'upcoming' ? c.muted : c.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>
                    {date ? formatDate(date, { weekday: 'short' }).toUpperCase() : 'DATE'}
                  </Text>
                  <Text style={{ color: c.text, fontFamily: fonts.serif, fontSize: 22, fontWeight: '700' }}>{date ? formatDate(date, { day: 'numeric' }) : 'TBD'}</Text>
                  <Text style={{ color: c.muted, fontSize: 11 }}>{date ? formatDate(date, { month: 'short' }) : ''}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>Round {x.number}</Text>
                    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: status === 'live' ? c.under : status === 'final' ? c.primary : isNext ? c.accent : c.chip }}>
                      <Text style={{ color: status === 'upcoming' && !isNext ? c.muted : '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>
                        {status === 'live' ? 'LIVE' : status === 'final' ? 'FINAL' : isNext ? 'UP NEXT' : 'UPCOMING'}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: c.muted, fontSize: 13 }}>{[fmt, x.matchupsLater && !r ? 'Matchups TBD' : matches ? `${matches} match${matches === 1 ? '' : 'es'}` : null, course || null].filter(Boolean).join(' · ')}</Text>
                  {score && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                      {score.map((t) => (
                        <View key={t.letter} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: teamColor(t.letter).soft }}>
                          <Text style={{ color: teamColor(t.letter).color, fontWeight: '800', fontSize: 12 }}>{e.teams?.[t.letter as 'A' | 'B']?.name ?? `Team ${t.letter}`}</Text>
                          <Text style={{ color: teamColor(t.letter).color, fontWeight: '800', fontSize: 13, fontFamily: fonts.serif }}>{formatPoints(t.points)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {summary ? <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{summary}</Text> : null}
                </View>
                {!r && canEdit && (
                  <View style={{ justifyContent: 'center' }}>
                    <Button small kind={isNext ? 'primary' : 'secondary'} title="Start" onPress={open} />
                  </View>
                )}
              </View>
            )}
          </Pressable>
        );
      })}
      {list.length === 0 && <Text style={{ color: c.muted }}>No rounds yet. Start one when you play.</Text>}
      {canEdit && e.status !== 'complete' && (
        <Button
          title={e.recurrence?.every === 'asYouGo' ? '+ Play a new round' : '+ Add a round'}
          kind="secondary"
          onPress={() => router.push({ pathname: '/new-round', params: { eventId: e.id, addRound: '1' } })}
        />
      )}
    </Card>
  );
}
