import { courseHandicap, searchCourses, validateCourse, type Course, type Player, type Tee } from '@golf/engine';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { GameOptions } from '@/components/game-options';
import { GamePicker, GameRulesButton, PlayerPicker, Sheet, StepPills } from '@/components/round-setup';
import { HandicapCheck } from '@/components/handicap-check';
import { TeamsStep } from '@/components/teams-step';
import { usePickBus } from '@/store/pick';
import { Body, Button, Card, Chip, Field, H2, Label, Segmented, Toggle, styles } from '@/components/ui';
import { formatIndex, shuffle } from '@/lib/format';
import { meFirst, useMe } from '@/lib/me';
import { draftProblem, draftToConfigs, GAMES, isMatchFormat, newDraft, sideMatchConfig, teamsSet, type GameDraft, type TeamOf } from '@/lib/games';
import { newId, useEvent, useStore, type RoundRecord, type SavedPlayer } from '@/store/store';
import { autoShare } from '@/sync/sync';
import { radius, space, teamColor, useColors } from '@/theme';
import { today } from '@/lib/dates';
import { getCourse, useCourses } from '@/lib/courses';

type Step = 'course' | 'players' | 'teams' | 'game';

const teeLabel = (t: Tee) => `${t.name}${t.gender === 'F' ? ' (W)' : ''}`;

function teesFor(course: Course, gender: 'M' | 'F') {
  const list = course.tees.filter((t) => (t.gender ?? 'M') === gender);
  return list.length ? list : course.tees;
}

export default function NewRound() {
  const c = useColors();
  const { eventId, matchId, eventRound, addRound: addingRound } = useLocalSearchParams<{ eventId?: string; matchId?: string; eventRound?: string; addRound?: string }>();
  const event = useEvent(eventId);
  // A round planned in the event (format and matchups already set).
  const planned = event?.rounds?.find((x) => x.id === eventRound);
  const eventTeams: TeamOf | undefined = event?.teamOf ?? (event?.teams ? Object.fromEntries([...event.teams.A.playerIds.map((id) => [id, 'A']), ...event.teams.B.playerIds.map((id) => [id, 'B'])]) : undefined);
  const allSaved = useStore((s) => s.players);
  const { me, isMe } = useMe();
  const saved = event ? allSaved.filter((p) => event.playerIds.includes(p.id)) : allSaved;
  const teamOfEvent = (id: string): 'A' | 'B' | undefined =>
    event?.teams ? (event.teams.A.playerIds.includes(id) ? 'A' : event.teams.B.playerIds.includes(id) ? 'B' : undefined) : undefined;
  const upsertPlayer = useStore((s) => s.upsertPlayer);
  const addRound = useStore((s) => s.addRound);
  const courses = useCourses();

  const [step, setStep] = useState<Step>('course');
  const [query, setQuery] = useState('');
  const [course, setCourse] = useState<Course | null>(null);
  const [roster, setRoster] = useState<{ id: string; teeId: string }[]>([]);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [draft, setDraft] = useState<GameDraft | null>(null);
  // Teams step: start with an empty Team A and Team B (a Ryder Cup event fills them in).
  const [teamOf, setTeamOfState] = useState<TeamOf>(() => eventTeams ?? {});
  const [letters, setLetters] = useState<string[]>(event?.teamLetters ?? ['A', 'B']);
  const [noTeams, setNoTeams] = useState(false);
  const setTeamOf = (t: TeamOf) => {
    setTeamOfState(t);
    setDraft(null);
  };
  const [sideMatches, setSideMatches] = useState<[string, string][]>([]);
  const [pickSide, setPickSide] = useState<string | null>(null);
  const [statsEnabled, setStatsEnabled] = useState(false);
  // Add a regular round to a season?
  const events = useStore((s) => s.events);
  const seasons = events.filter((e) => e.type === 'season' && e.status !== 'complete' && e.remote?.role !== 'viewer');
  const [toSeason, setToSeason] = useState<'no' | 'yes'>('no');
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [seasonSheet, setSeasonSheet] = useState(false);
  const [seasonQuery, setSeasonQuery] = useState('');
  const seasonsAtStart = useRef(new Set(seasons.map((e) => e.id)));
  // A season created from here (Create a new season) is picked automatically when you come back.
  useEffect(() => {
    const fresh = seasons.find((e) => !seasonsAtStart.current.has(e.id));
    if (fresh) {
      seasonsAtStart.current.add(fresh.id);
      setToSeason('yes');
      setSeasonId(fresh.id);
    }
  }, [seasons.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const season = toSeason === 'yes' ? seasons.find((e) => e.id === seasonId) : undefined;

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
    const co = scheduled.courseId ? getCourse(scheduled.courseId) : undefined;
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

  // Planned event round: once the course is picked, bring in its players and its game.
  // Matchups decided on the day start with the whole event group (take out anyone not playing).
  const plannedIds = planned?.matchupsLater
    ? saved.filter((p) => event!.playerIds.includes(p.id)).map((p) => p.id)
    : planned?.draft
      ? Object.keys(planned.draft.teamOf).filter((id) => saved.some((p) => p.id === id))
      : [];
  const plannedDraftSet = useRef(false);
  useEffect(() => {
    // TBD matchups: keep the round's format and options, and suggest matchups for whoever is playing.
    if (planned?.draft && planned.matchupsLater) {
      if (draft || players.length === 0) return;
      const fresh = newDraft(planned.draft.kind, players, noTeams ? undefined : teamOf);
      setDraft({ ...planned.draft, teamOf: fresh.teamOf, teamSize: fresh.teamSize, matches: fresh.matches });
      return;
    }
    if (!planned?.draft || plannedDraftSet.current || players.length === 0) return;
    const same = players.length === plannedIds.length && players.every((p) => plannedIds.includes(p.id));
    if (!same) return;
    plannedDraftSet.current = true;
    setDraft({ ...planned.draft, teamOf: { ...planned.draft.teamOf } });
  }, [players, draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const addEventRound = useStore((s) => s.addEventRound);
  const setEventRoundId = useStore((s) => s.setEventRoundId);
  const addEventPlayers = useStore((s) => s.addEventPlayers);
  const start = () => {
    if (!course || !draft || problem || (!event && toSeason === 'yes' && !season)) return;
    const id = newId();
    const round: RoundRecord = {
      id,
      createdAt: Date.now(),
      courseId: course.id,
      course,
      players,
      games: [...draftToConfigs(draft, players), ...sideMatches.map(([a, b]) => sideMatchConfig(a, b))],
      statsEnabled,
      ledger: {},
      stats: {},
      currentHole: 1,
      status: 'active',
      notices: [],
      eventId: event?.id ?? season?.id,
      label: planned ? `Round ${planned.number}` : event && addingRound ? `Round ${(event.rounds?.length ?? 0) + 1}` : season ? `Round ${(season.rounds?.length ?? 0) + 1}` : scheduled?.label,
      teamOf: !noTeams && Object.keys(teamOf).length ? teamOf : undefined,
    };
    addRound(round);
    if (event && scheduled) saveScheduled(event.id, { ...scheduled, roundId: id });
    if (event && planned) setEventRoundId(event.id, planned.id, id);
    if (event && addingRound && !planned) addEventRound(event.id, { id: newId(), number: 0, date: today(), draft, roundId: id });
    if (!event && season) {
      // Joins the season: listed as its next round, and anyone new joins the season.
      addEventRound(season.id, { id: newId(), number: 0, date: today(), draft, roundId: id });
      addEventPlayers(season.id, players.map((p) => p.id));
    }
    void autoShare(id);
    router.replace(`/round/${id}`);
  };

  // ------------------------------------------------------------------ steps
  const rosterIds = roster.map((r) => r.id);
  const teamsDone = noTeams || teamsSet(rosterIds, (id) => (letters.includes(teamOf[id]) ? teamOf[id] : undefined));
  const canGo = (st: Step) =>
    st === 'course' || (st === 'players' && !!course) || (st === 'teams' && !!course && players.length > 0) || (st === 'game' && !!course && players.length > 0 && teamsDone);
  const stepBar = (
    <StepPills
      steps={[
        { value: 'course', label: 'Course' },
        { value: 'players', label: 'Players' },
        { value: 'teams', label: 'Teams' },
        { value: 'game', label: 'Game' },
      ]}
      current={step}
      isDone={(st) => (st === 'course' ? !!course : st === 'players' ? roster.length > 0 : st === 'teams' ? teamsDone && roster.length > 0 : !!draft)}
      canGo={canGo}
      onGo={(st) => canGo(st) && setStep(st)}
    />
  );

  const pickGame = (kind: GameDraft['kind']) => {
    const d = newDraft(kind, players, noTeams ? undefined : teamOf);
    setDraft(d);
    setSideMatches([]);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
      {stepBar}

      {step === 'course' && (
        <>
          <Field label="Search courses" value={query} onChangeText={setQuery} placeholder="Course name or city" />
          {searchCourses(query, courses).map((co) => {
            const unfinished = validateCourse(co).length > 0;
            return (
            <Pressable
              key={co.id}
              disabled={unfinished}
              onPress={() => {
                setCourse(co);
                // Start with me in the group (if I'm part of this event, or it's a regular round).
                if (planned?.draft) {
                  plannedDraftSet.current = false;
                  setRoster(plannedIds.map((pid) => ({ id: pid, teeId: defaultTee(co, saved.find((p) => p.id === pid)!) })));
                } else setRoster(me && (!event || event.playerIds.includes(me.id)) ? [{ id: me.id, teeId: defaultTee(co, me) }] : []);
                setDraft(null);
                setStep('players');
              }}>
              <Card style={{ ...(course?.id === co.id ? { borderColor: c.primary, borderWidth: 2 } : {}), opacity: unfinished ? 0.55 : 1 }}>
                <H2>{co.name}</H2>
                <Body muted>{[co.city, co.region].filter(Boolean).join(', ')} · Par {co.tees[0]?.par ?? '–'} · {co.tees.length} tees</Body>
                {unfinished && <Body style={{ color: c.danger, fontSize: 13 }}>Finish setting this course up in More → Courses.</Body>}
              </Card>
            </Pressable>
            );
          })}
          <Button small kind="ghost" title="Course not listed? Add it in More → Courses" onPress={() => router.push('/course/new')} />
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
            colorFor={(id) => (eventTeams?.[id] ? teamColor(eventTeams[id]).color : undefined)}
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
          {!event?.lockHandicaps && <HandicapCheck players={roster.map((r) => saved.find((p) => p.id === r.id)).filter((p): p is SavedPlayer => !!p)} />}


          {roster.length > 1 && (() => {
            // One tap sets everyone's tee (men and ladies each get their own version of it).
            const names = [...new Set(course.tees.map((t) => t.name))];
            const setAll = (name: string) =>
              setRoster((rs) =>
                rs.map((x) => {
                  const p = saved.find((s) => s.id === x.id);
                  const t = p && teesFor(course, p.gender).find((tt) => tt.name === name);
                  return t ? { ...x, teeId: t.id } : x;
                }),
              );
            const everyone = (name: string) => roster.every((x) => course.tees.find((t) => t.id === x.teeId)?.name === name);
            const missing = (name: string) => roster.filter((x) => { const p = saved.find((s) => s.id === x.id); return p && !teesFor(course, p.gender).some((t) => t.name === name); }).length;
            return (
              <Card>
                <H2>Tees for everyone</H2>
                <View style={styles.wrap}>
                  {names.map((n) => <Chip key={n} label={n} selected={everyone(n)} onPress={() => setAll(n)} />)}
                </View>
                <Label style={{ textTransform: 'none', letterSpacing: 0 }}>Sets every player’s tee at once. You can still change anyone below.{names.some((n) => missing(n) > 0) ? ' Players without that tee keep theirs.' : ''}</Label>
              </Card>
            );
          })()}

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

          <Button title="Next: teams" disabled={roster.length === 0} onPress={() => setStep('teams')} />
        </>
      )}

      {step === 'teams' && course && (
        <>
          <TeamsStep
            players={players}
            teamOf={teamOf}
            onTeamOf={(t) => { setTeamOf(t); setNoTeams(false); }}
            letters={letters}
            onLetters={(l) => { setLetters(l); setDraft(null); }}
            lockedReason={eventTeams ? `Teams come from ${event!.name}.` : undefined}
          />
          <Button
            title={teamsDone && !noTeams ? 'Next: choose game' : `Put every player on a team (${players.filter((p) => !letters.includes(teamOf[p.id])).length} left)`}
            disabled={!teamsSet(rosterIds, (id) => (letters.includes(teamOf[id]) ? teamOf[id] : undefined))}
            onPress={() => { setNoTeams(false); setStep('game'); }}
          />
          {!eventTeams && (
            <Button
              title="No teams (individual games)"
              kind="ghost"
              onPress={() => {
                setNoTeams(true);
                setDraft(null);
                setStep('game');
              }}
            />
          )}
        </>
      )}

      {step === 'game' && course && (
        <>
          <GamePicker value={draft?.kind ?? null} playerIds={rosterIds} teamOf={noTeams ? undefined : teamOf} onPick={pickGame} />

          {draft && (
            <>
              <GameRulesButton kind={draft.kind} />
              <GameOptions draft={draft} players={players} onChange={setDraft} teamOf={noTeams ? undefined : teamOf} />

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

          {!event && (
            <Card>
              <H2>Add this round to a season?</H2>
              <Segmented options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} value={toSeason} onChange={setToSeason} />
              {toSeason === 'yes' && (
                <Pressable
                  onPress={() => setSeasonSheet(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Choose a season"
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: season ? c.primary : c.border, borderRadius: radius.md, padding: space.md, opacity: pressed ? 0.7 : 1 })}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>SEASON</Text>
                    <Text style={{ color: season ? c.text : c.muted, fontSize: 17, fontWeight: '700' }}>{season ? season.name : 'Choose a season'}</Text>
                    {season && <Text style={{ color: c.muted, fontSize: 12 }}>Will be Round {(season.rounds?.length ?? 0) + 1} · {season.playerIds.length} players</Text>}
                  </View>
                  <Text style={{ color: c.primary, fontSize: 16 }}>▾</Text>
                </Pressable>
              )}
            </Card>
          )}

          {problem && draft ? <Body style={{ color: c.danger }}>{problem}</Body> : null}
          {!problem && !event && toSeason === 'yes' && !season ? <Body style={{ color: c.danger }}>Choose a season, or pick No.</Body> : null}
          <Button title={season ? `Start round · ${season.name}` : 'Start round'} disabled={!!problem || (!event && toSeason === 'yes' && !season)} onPress={start} />

          <Sheet visible={seasonSheet} onClose={() => setSeasonSheet(false)} title="Choose a season">
            <View style={{ gap: space.sm }}>
              {seasons.length > 4 && <Field label="Search" value={seasonQuery} onChangeText={setSeasonQuery} placeholder="Season name" />}
              {seasons
                .filter((e) => !seasonQuery.trim() || e.name.toLowerCase().includes(seasonQuery.trim().toLowerCase()))
                .map((e) => {
                  const sel = e.id === seasonId;
                  return (
                    <Pressable key={e.id} onPress={() => { setSeasonId(e.id); setSeasonSheet(false); }} accessibilityRole="button" accessibilityLabel={e.name}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 })}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{e.name}</Text>
                        <Text style={{ color: c.muted, fontSize: 12 }}>{(e.rounds?.length ?? 0)} round{(e.rounds?.length ?? 0) === 1 ? '' : 's'} so far · {e.playerIds.length} players</Text>
                      </View>
                      {sel && <Text style={{ color: c.primary, fontSize: 18, fontWeight: '900' }}>✓</Text>}
                    </Pressable>
                  );
                })}
              {seasons.length === 0 && <Body muted>You don’t have any seasons yet.</Body>}
              <Button
                title="+ Create a new season"
                kind="secondary"
                onPress={() => { setSeasonSheet(false); router.push({ pathname: '/new-event', params: { type: 'season', returnTo: 'new-round' } }); }}
              />
            </View>
          </Sheet>
        </>
      )}
    </ScrollView>
  );
}
