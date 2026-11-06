import { courseHandicap, findCourse, searchCourses, SEED_COURSES, type Course, type Player, type Tee } from '@golf/engine';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { GameOptions } from '@/components/game-options';
import { GamePicker, GameRulesButton, PlayerPicker, StepPills } from '@/components/round-setup';
import { usePickBus } from '@/store/pick';
import { Body, Button, Card, Chip, Field, H2, Label, Segmented, Toggle, styles } from '@/components/ui';
import { formatIndex, shuffle } from '@/lib/format';
import { meFirst, useMe } from '@/lib/me';
import { draftProblem, draftToConfigs, GAMES, isMatchFormat, newDraft, sideMatchConfig, type GameDraft } from '@/lib/games';
import { newId, useEvent, useStore, type RoundRecord, type SavedPlayer } from '@/store/store';
import { autoShare } from '@/sync/sync';
import { space, useColors } from '@/theme';

type Step = 'course' | 'players' | 'game';

const teeLabel = (t: Tee) => `${t.name}${t.gender === 'F' ? ' (W)' : ''}`;

function teesFor(course: Course, gender: 'M' | 'F') {
  const list = course.tees.filter((t) => (t.gender ?? 'M') === gender);
  return list.length ? list : course.tees;
}

export default function NewRound() {
  const c = useColors();
  const { eventId, matchId } = useLocalSearchParams<{ eventId?: string; matchId?: string }>();
  const event = useEvent(eventId);
  const allSaved = useStore((s) => s.players);
  const { me, isMe } = useMe();
  const saved = event ? allSaved.filter((p) => event.playerIds.includes(p.id)) : allSaved;
  const teamOfEvent = (id: string): 'A' | 'B' | undefined =>
    event?.teams ? (event.teams.A.playerIds.includes(id) ? 'A' : event.teams.B.playerIds.includes(id) ? 'B' : undefined) : undefined;
  const upsertPlayer = useStore((s) => s.upsertPlayer);
  const addRound = useStore((s) => s.addRound);

  const [step, setStep] = useState<Step>('course');
  const [query, setQuery] = useState('');
  const [course, setCourse] = useState<Course | null>(null);
  const [roster, setRoster] = useState<{ id: string; teeId: string }[]>([]);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [draft, setDraft] = useState<GameDraft | null>(null);
  const [sideMatches, setSideMatches] = useState<[string, string][]>([]);
  const [pickSide, setPickSide] = useState<string | null>(null);
  const [statsEnabled, setStatsEnabled] = useState(false);

  const players: Player[] = useMemo(
    () =>
      roster
        .map((r) => {
          const p = saved.find((s) => s.id === r.id);
          const index = event?.lockHandicaps ? (event.lockedIndexes[p?.id ?? ''] ?? p?.handicapIndex) : p?.handicapIndex;
          return p ? { id: p.id, name: p.name, handicapIndex: index!, teeId: r.teeId } : null;
        })
        .filter((p): p is Player => p !== null)
        // In a cup, Team A players come first so 1 v 1 games line up A v B.
        .sort((a, b) => (teamOfEvent(a.id) === teamOfEvent(b.id) ? 0 : teamOfEvent(a.id) === 'A' ? -1 : 1)),
    [roster, saved, event],
  );

  const defaultTee = (course: Course, p: SavedPlayer) => {
    const list = teesFor(course, p.gender);
    // Pick a middle tee by default: second-longest men's tee, longest women's tee.
    return (p.gender === 'M' && list.length > 2 ? list[1] : list[0]).id;
  };

  const togglePlayer = (p: SavedPlayer) => {
    if (!course) return;
    setDraft(null);
    setSideMatches([]);
    setRoster((r) => (r.some((x) => x.id === p.id) ? r.filter((x) => x.id !== p.id) : [...r, { id: p.id, teeId: defaultTee(course, p) }]));
  };

  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const problem = draft ? draftProblem(draft, players) : 'Choose a game';

  // Starting a scheduled match: pre-fill course, players, sides and format.
  const scheduled = event?.schedule?.find((m) => m.id === matchId);
  const saveScheduled = useStore((s) => s.saveScheduled);
  const prefilled = useRef(false);
  useEffect(() => {
    if (!scheduled || prefilled.current) return;
    prefilled.current = true;
    const co = scheduled.courseId ? findCourse(scheduled.courseId) : undefined;
    if (!co) return;
    setCourse(co);
    const ids = [...scheduled.sideA, ...scheduled.sideB].filter((id) => saved.some((p) => p.id === id));
    setRoster(ids.map((id) => ({ id, teeId: defaultTee(co, saved.find((p) => p.id === id)!) })));
    setStep(ids.length ? 'game' : 'players');
  }, [scheduled]);
  // A friend picked on the Add Friend screen joins the group.
  const picked = usePickBus((s) => s.picked);
  useEffect(() => {
    if (!course || picked.length === 0) return;
    const add = usePickBus.getState().take('new-round');
    if (!add.length) return;
    setRoster((r) => [...r, ...add.filter((p) => !r.some((x) => x.id === p.id)).map((p) => ({ id: p.id, teeId: defaultTee(course, p) }))]);
    setDraft(null);
  }, [picked, course]);

  const draftPrefilled = useRef(false);
  useEffect(() => {
    if (!scheduled?.kind || draftPrefilled.current || players.length === 0) return;
    draftPrefilled.current = true;
    const kind = scheduled.kind as GameDraft['kind'];
    if (!GAMES.some((g) => g.kind === kind)) return;
    const d = newDraft(kind, players);
    for (const p of players) d.teamOf[p.id] = scheduled.sideB.includes(p.id) ? 'B' : 'A';
    // A scheduled match is one matchup: keep its sides as set on the schedule.
    if (isMatchFormat(kind) && scheduled.sideA.length && scheduled.sideA.length === scheduled.sideB.length) {
      d.teamSize = scheduled.sideA.length;
      d.matches = [{ a: scheduled.sideA, b: scheduled.sideB }];
    }
    setDraft(d);
  }, [players, scheduled]);

  const start = () => {
    if (!course || !draft || problem) return;
    const id = newId();
    const round: RoundRecord = {
      id,
      createdAt: Date.now(),
      courseId: course.id,
      players,
      games: [...draftToConfigs(draft, players), ...sideMatches.map(([a, b]) => sideMatchConfig(a, b))],
      statsEnabled,
      ledger: {},
      stats: {},
      currentHole: 1,
      status: 'active',
      notices: [],
      eventId: event?.id,
      label: scheduled?.label,
    };
    addRound(round);
    if (event && scheduled) saveScheduled(event.id, { ...scheduled, roundId: id });
    void autoShare(id);
    router.replace(`/round/${id}`);
  };

  // ------------------------------------------------------------------ steps
  const canGo = (st: Step) => st === 'course' || (st === 'players' && !!course) || (st === 'game' && !!course && players.length > 0);
  const stepBar = (
    <StepPills
      steps={[
        { value: 'course', label: 'Course' },
        { value: 'players', label: 'Players' },
        { value: 'game', label: 'Game' },
      ]}
      current={step}
      isDone={(st) => (st === 'course' ? !!course : st === 'players' ? roster.length > 0 : !!draft)}
      canGo={canGo}
      onGo={(st) => canGo(st) && setStep(st)}
    />
  );

  const pickGame = (kind: GameDraft['kind']) => {
    const d = newDraft(kind, players, event?.teams ? teamOfEvent : undefined);
    setDraft(d);
    setSideMatches([]);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
      {stepBar}

      {step === 'course' && (
        <>
          <Field label="Search courses" value={query} onChangeText={setQuery} placeholder="Course name or city" />
          {searchCourses(query, SEED_COURSES).map((co) => (
            <Pressable
              key={co.id}
              onPress={() => {
                setCourse(co);
                // Start with me in the group (if I'm part of this event, or it's a regular round).
                setRoster(me && (!event || event.playerIds.includes(me.id)) ? [{ id: me.id, teeId: defaultTee(co, me) }] : []);
                setDraft(null);
                setStep('players');
              }}>
              <Card style={course?.id === co.id ? { borderColor: c.primary, borderWidth: 2 } : undefined}>
                <H2>{co.name}</H2>
                <Body muted>{[co.city, co.region].filter(Boolean).join(', ')} · Par {co.tees[0].par} · {co.tees.length} tees</Body>
              </Card>
            </Pressable>
          ))}
          <Body muted>More courses are coming. Only these three are loaded for now.</Body>
        </>
      )}

      {step === 'players' && course && (
        <>
          <PlayerPicker
            people={meFirst(saved, isMe)}
            selected={roster.map((r) => r.id)}
            onToggle={togglePlayer}
            isMe={isMe}
            indexFor={(p) => (event?.lockHandicaps ? (event.lockedIndexes[p.id] ?? p.handicapIndex) : p.handicapIndex)}
            colorFor={(id) => (event?.teams ? (teamOfEvent(id) === 'B' ? c.teamB : c.teamA) : undefined)}
            allowNew={!event}
            onFindNew={(q) => router.push({ pathname: '/add-friend', params: { pick: 'new-round', q } })}
          />

          {event?.teams && (
            <View style={styles.row}>
              {([1, 2] as const).map((n) => (
                <View key={n} style={{ flex: 1 }}>
                  <Button
                    small
                    kind="secondary"
                    title={`Random ${n} v ${n}`}
                    onPress={() => {
                      const pick = (ids: string[]) => shuffle(ids).slice(0, n);
                      const ids = [...pick(event.teams!.A.playerIds), ...pick(event.teams!.B.playerIds)];
                      setDraft(null);
                      setSideMatches([]);
                      setRoster(ids.map((id) => ({ id, teeId: defaultTee(course, saved.find((p) => p.id === id)!) })));
                    }}
                  />
                </View>
              ))}
            </View>
          )}
          {event?.lockHandicaps ? <Label style={{ textTransform: 'none', letterSpacing: 0 }}>Handicaps are locked for {event.name}.</Label> : null}


          {roster.map((r) => {
            const p = saved.find((s) => s.id === r.id)!;
            const tee = course.tees.find((t) => t.id === r.teeId)!;
            return (
              <Card key={r.id}>
                <View style={[styles.row, { justifyContent: 'space-between' }]}>
                  <H2>{p.name}</H2>
                  <Body muted>
                    Index {formatIndex(p.handicapIndex)} → Course hcp <Text style={{ fontWeight: '700', color: c.text }}>{courseHandicap(p.handicapIndex, tee)}</Text>
                  </Body>
                </View>
                <View style={styles.wrap}>
                  {teesFor(course, p.gender).map((t) => (
                    <Chip
                      key={t.id}
                      label={teeLabel(t)}
                      selected={t.id === r.teeId}
                      onPress={() => setRoster((rs) => rs.map((x) => (x.id === r.id ? { ...x, teeId: t.id } : x)))}
                    />
                  ))}
                </View>
                <Label style={{ textTransform: 'none' }}>
                  {tee.courseRating} / {tee.slope} · {tee.holes.reduce((s, h) => s + (h.yards ?? 0), 0)} yds
                </Label>
              </Card>
            );
          })}

          <Button title="Next: choose game" disabled={roster.length === 0} onPress={() => setStep('game')} />
        </>
      )}

      {step === 'game' && course && (
        <>
          <GamePicker value={draft?.kind ?? null} playerCount={players.length} onPick={pickGame} />

          {draft && (
            <>
              <GameRulesButton kind={draft.kind} />
              <GameOptions draft={draft} players={players} onChange={setDraft} teamOf={event?.teams ? teamOfEvent : undefined} />

              <Card>
                <H2>Side matches</H2>
                <Body muted>Singles matches played alongside the main game.</Body>
                {sideMatches.map(([a, b], i) => (
                  <View key={`${a}-${b}`} style={[styles.row, { justifyContent: 'space-between' }]}>
                    <Body>{name(a)} vs {name(b)}</Body>
                    <Button small kind="ghost" title="Remove" onPress={() => setSideMatches((s) => s.filter((_, j) => j !== i))} />
                  </View>
                ))}
                {players.length >= 2 && (
                  <>
                    <Label style={{ textTransform: 'none' }}>{pickSide ? `${name(pickSide)} vs…` : 'Tap two players to add a match'}</Label>
                    <View style={styles.wrap}>
                      {players.map((p) => (
                        <Chip
                          key={p.id}
                          label={p.name}
                          selected={pickSide === p.id}
                          onPress={() => {
                            if (!pickSide) return setPickSide(p.id);
                            if (pickSide !== p.id && !sideMatches.some(([a, b]) => (a === pickSide && b === p.id) || (a === p.id && b === pickSide))) {
                              setSideMatches((s) => [...s, [pickSide, p.id]]);
                            }
                            setPickSide(null);
                          }}
                        />
                      ))}
                    </View>
                    {isMatchFormat(draft.kind) && draft.teamSize === 2 && draft.matches.length >= 1 && sideMatches.length === 0 && (
                      <Button
                        small
                        kind="secondary"
                        title="Match up the teams (A1 v B1, A2 v B2)"
                        onPress={() => {
                          // Within each match: A1 v B1 and A2 v B2.
                          setSideMatches(draft.matches.flatMap((m) => m.a.map((id, i) => [id, m.b[i]] as [string, string]).filter(([, y]) => !!y)));
                        }}
                      />
                    )}
                  </>
                )}
              </Card>

              <Card>
                <Toggle label="Track stats" hint="Putts, fairways and greens in regulation" value={statsEnabled} onChange={setStatsEnabled} />
              </Card>
            </>
          )}

          {problem && draft ? <Body style={{ color: c.danger }}>{problem}</Body> : null}
          <Button title="Start round" disabled={!!problem} onPress={start} />
        </>
      )}
    </ScrollView>
  );
}
