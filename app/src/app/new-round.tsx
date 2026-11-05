import { courseHandicap, findCourse, searchCourses, SEED_COURSES, type Course, type Player, type Tee } from '@golf/engine';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { GameOptions } from '@/components/game-options';
import { PlayerForm } from '@/components/player-form';
import { Body, Button, Card, Chip, Field, H2, Label, Segmented, Toggle, styles } from '@/components/ui';
import { formatIndex, shuffle } from '@/lib/format';
import { draftProblem, draftToConfig, gameInfo, GAMES, newDraft, sideMatchConfig, type GameDraft } from '@/lib/games';
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
  const draftPrefilled = useRef(false);
  useEffect(() => {
    if (!scheduled?.kind || draftPrefilled.current || players.length === 0) return;
    draftPrefilled.current = true;
    const kind = scheduled.kind as GameDraft['kind'];
    if (!GAMES.some((g) => g.kind === kind)) return;
    const d = newDraft(kind, players);
    for (const p of players) d.teamOf[p.id] = scheduled.sideB.includes(p.id) ? 'B' : 'A';
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
      games: [draftToConfig(draft, players), ...sideMatches.map(([a, b]) => sideMatchConfig(a, b))],
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
  const stepBar = (
    <Segmented
      options={[
        { value: 'course', label: '1 Course' },
        { value: 'players', label: '2 Players' },
        { value: 'game', label: '3 Game' },
      ]}
      value={step}
      onChange={(s) => {
        if (s === 'course' || (s === 'players' && course) || (s === 'game' && course && players.length > 0)) setStep(s);
      }}
    />
  );

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      {stepBar}

      {step === 'course' && (
        <>
          <Field label="Search courses" value={query} onChangeText={setQuery} placeholder="Course name or city" />
          {searchCourses(query, SEED_COURSES).map((co) => (
            <Pressable key={co.id} onPress={() => { setCourse(co); setRoster([]); setDraft(null); setStep('players'); }}>
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
          <Card>
            <Label>Who’s playing?</Label>
            {saved.length === 0 ? <Body muted>Add your group below. They’ll be saved for next time.</Body> : null}
            <View style={styles.wrap}>
              {saved.map((p) => (
                <Chip
                  key={p.id}
                  label={`${p.name} ${formatIndex(event?.lockHandicaps ? (event.lockedIndexes[p.id] ?? p.handicapIndex) : p.handicapIndex)}`}
                  selected={roster.some((r) => r.id === p.id)}
                  color={teamOfEvent(p.id) === 'B' ? c.teamB : undefined}
                  onPress={() => togglePlayer(p)}
                />
              ))}
            </View>
          </Card>

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

          {event ? null : addingPlayer ? (
            <PlayerForm
              onCancel={() => setAddingPlayer(false)}
              onSave={(p) => {
                upsertPlayer(p);
                setRoster((r) => [...r, { id: p.id, teeId: defaultTee(course, p) }]);
                setDraft(null);
                setAddingPlayer(false);
              }}
            />
          ) : (
            <Button title="+ New player" kind="secondary" onPress={() => setAddingPlayer(true)} />
          )}

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
          <Label>Main game · {players.length} player{players.length === 1 ? '' : 's'}</Label>
          <View style={styles.wrap}>
            {GAMES.map((g) => {
              const fits = players.length >= g.minPlayers && players.length <= g.maxPlayers;
              return (
                <Chip
                  key={g.kind}
                  label={g.name}
                  selected={draft?.kind === g.kind}
                  onPress={
                    fits
                      ? () => {
                          const d = newDraft(g.kind, players);
                          if (event?.teams) for (const p of players) d.teamOf[p.id] = teamOfEvent(p.id) ?? d.teamOf[p.id];
                          setDraft(d);
                          setSideMatches([]);
                        }
                      : undefined
                  }
                  color={fits ? undefined : c.border}
                />
              );
            })}
          </View>

          {draft && (
            <>
              <Body muted>{gameInfo(draft.kind).blurb}</Body>
              <GameOptions draft={draft} players={players} onChange={setDraft} />

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
                    {gameInfo(draft.kind).pairs && sideMatches.length === 0 && (
                      <Button
                        small
                        kind="secondary"
                        title="Match up the teams (A1 v B1, A2 v B2)"
                        onPress={() => {
                          const a = players.filter((p) => draft.teamOf[p.id] === 'A');
                          const b = players.filter((p) => draft.teamOf[p.id] === 'B');
                          setSideMatches(a.slice(0, b.length).map((p, i) => [p.id, b[i].id]));
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
