import { courseHandicap, type Course, type Player, type Tee } from '@golf/engine';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameOptions } from '@/components/game-options';
import { GamePicker, GameRulesButton, PlayerPicker, Sheet, StepPills } from '@/components/round-setup';
import { HandicapCheck } from '@/components/handicap-check';
import { TeamsStep } from '@/components/teams-step';
import { usePickBus } from '@/store/pick';
import { Body, Button, Card, Chip, Field, H2, Label, Segmented, Toggle, styles } from '@/components/ui';
import { formatIndex, shuffle } from '@/lib/format';
import { meFirst, useMe } from '@/lib/me';
import { HolesSetup } from '@/components/holes-setup';
import { draftProblem, draftToConfigs, GAMES, isMatchFormat, newDraft, playSpec, sideMatchConfig, teamsSet, type GameDraft, type TeamOf } from '@/lib/games';
import { newId, useEvent, useStore, type RoundRecord, type RoundSetup, type SavedPlayer } from '@/store/store';
import { SaveFavourite, SetupSaved } from '@/components/setup-saved';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PlayerDropdown } from '@/components/head-to-head-view';
import { namesFor, teamName, TeamColors } from '@/lib/team-colors';
import { autoShare } from '@/sync/sync';
import { fonts, radius, space, teamColor, useColors } from '@/theme';
import { formatDate, today } from '@/lib/dates';
import { canStartOn } from '@/lib/event-calendar';
import { getCourse, useCourses } from '@/lib/courses';
import { CoursePicker } from '@/components/course-picker';
import { track } from '@/lib/usage';
import { getPendingScan, guessRows, holesFromCard, ledgerFromCard, playedAt, setPendingScan } from '@/lib/round-scan';
import { evaluate, gameHoles, isResult, recordedMatches, scoreKeys, shortCourseName } from '@/lib/round';

type Step = 'course' | 'players' | 'teams' | 'game';

const teeLabel = (t: Tee) => `${t.name}${t.gender === 'F' ? ' (W)' : ''}`;

function teesFor(course: Course, gender: 'M' | 'F') {
  const list = course.tees.filter((t) => (t.gender ?? 'M') === gender);
  return list.length ? list : course.tees;
}

export default function NewRound() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { eventId, matchId, eventRound, addRound: addingRound, scan: scanParam, fav, play } = useLocalSearchParams<{ eventId?: string; matchId?: string; eventRound?: string; addRound?: string; scan?: string; fav?: string; play?: string }>();
  // Uploading a scorecard photo: the scores are already known, so the round goes straight to results.
  const scan = useMemo(() => (scanParam ? getPendingScan() : null), [scanParam]);
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

  // Uploaded card: course, players and tees were set on the score-check screen, so start at Teams.
  const fromCard = !!(scan?.courseId && scan.roster?.length);
  const [step, setStep] = useState<Step>(fromCard ? 'teams' : 'course');
  const [query, setQuery] = useState(() => (scan?.courseName ? shortCourseName(scan.courseName) : ''));
  const [course, setCourse] = useState<Course | null>(() => (fromCard ? (getCourse(scan!.courseId!) ?? null) : null));
  const [roster, setRoster] = useState<{ id: string; teeId: string }[]>(() => (fromCard ? scan!.roster! : []));
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [draft, setDraft] = useState<GameDraft | null>(null);
  // Teams step: start with an empty Team A and Team B (a Ryder Cup event fills them in).
  const [teamOf, setTeamOfState] = useState<TeamOf>(() => eventTeams ?? {});
  const [letters, setLetters] = useState<string[]>(event?.teamLetters ?? ['A', 'B']);
  const [noTeams, setNoTeams] = useState(false);
  // Each team's colour (an event's rounds start with the event's colours).
  const [teamColors, setTeamColors] = useState<Record<string, string>>(() => event?.teamColors ?? {});
  const [teamNames, setTeamNames] = useState<Record<string, string>>(() => namesFor(undefined, event) ?? {});
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
  // Matches where both sides are on the same team (they can't count toward the team score).
  const sideTeamOf = (ids: string[], given?: string) => given ?? (ids.length && ids.every((x) => teamOf[x] === teamOf[ids[0]]) ? teamOf[ids[0]] : undefined);
  const sameTeamMatches = !draft || noTeams || !isMatchFormat(draft.kind) || !Object.keys(teamOf).length
    ? []
    : draft.matches
        .map((m, i) => ({ i, ta: sideTeamOf(m.a, m.ta), tb: sideTeamOf(m.b, m.tb), m }))
        .filter((x) => x.ta && x.ta === x.tb && x.m.a.length && x.m.b.length)
        .map((x) => ({ i: x.i, team: teamName(x.ta!, teamNames), names: [...x.m.a, ...x.m.b].map((id) => name(id).split(' ')[0]).join(' and ') }));
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
  // (No format chosen yet counts as decided on the day: start with the whole group.)
  const plannedIds = planned?.matchupsLater || (planned && !planned.draft)
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
  const setEventRoundDate = useStore((s) => s.setEventRoundDate);
  const removeEventRound = useStore((s) => s.removeEventRound);
  const removeScheduled = useStore((s) => s.removeScheduled);
  const [deleting, setDeleting] = useState(false);
  const addEventPlayers = useStore((s) => s.addEventPlayers);
  // Uploaded card: which card row is each player's (or team's). Best guess by name, then the user's picks.
  const [rowPicks, setRowPicks] = useState<Record<string, number | null>>({});
  const scanKeys = useMemo(
    () => (scan && draft && !problem ? scoreKeys({ games: draftToConfigs(draft, players), players } as RoundRecord) : []),
    [scan, draft, problem, players],
  );
  const rowFor = useMemo(() => {
    if (!scan) return {};
    const guess = guessRows(scanKeys, scan.rows);
    return Object.fromEntries(scanKeys.map((k) => [k.key, k.key in rowPicks ? rowPicks[k.key] : guess[k.key]]));
  }, [scan, scanKeys, rowPicks]);
  const usedRows = Object.values(rowFor).filter((i): i is number => i !== null && i !== undefined);
  const scanProblem = !scan || !draft || problem
    ? null
    : scanKeys.some((k) => rowFor[k.key] === null || rowFor[k.key] === undefined)
      ? 'Pick the scorecard row for everyone'
      : new Set(usedRows).size !== usedRows.length
        ? 'Each scorecard row can only be used once'
        : null;
  const completeRound = useStore((s) => s.completeRound);

  // A planned round on a later day: everything can be set up now, but it's saved, not started.
  const planMode = !!event && !!planned?.date && planned.date > today() && !scan;
  const setEventRoundSetup = useStore((s) => s.setEventRoundSetup);
  const savePlan = () => {
    if (!event || !planned || !course || !draft || problem) return;
    setEventRoundSetup(event.id, planned.id, { courseId: course.id, roster, teamOf, teamColors, teamNames, letters, noTeams, draft, sideMatches, statsEnabled });
    track('event_round_set_up_ahead');
    router.back();
  };

  // ------------------------------------------------------------------ drafts and favourites
  // A plain new round (not from an event, a scheduled match or a scorecard photo) is saved as you go,
  // so closing the screen by accident loses nothing, and can be saved as a favourite to play again.
  const plain = !eventId && !matchId && !scan;
  const saveDraft = useStore((s) => s.saveDraft);
  const setup: RoundSetup | null = course ? { courseId: course.id, roster, teamOf, teamColors, teamNames, letters, noTeams, draft, sideMatches, statsEnabled } : null;
  const gameLabel = draft ? GAMES.find((g) => g.kind === draft.kind)?.name : undefined;
  const summary = course
    ? [shortCourseName(course.name), players.map((p) => p.name.split(' ')[0]).join(', ') || null, gameLabel].filter(Boolean).join(' · ')
    : '';
  useEffect(() => {
    if (!plain || !setup) return;
    saveDraft('round', { data: { ...setup, step }, summary, savedAt: Date.now() });
  }, [plain, step, course, roster, teamOf, teamColors, teamNames, letters, noTeams, draft, sideMatches, statsEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Load a saved setup (draft or favourite). Players no longer in your list are left out. */
  const applySetup = (su: RoundSetup, toStep: Step): boolean => {
    const co = courses.find((x) => x.id === su.courseId) ?? getCourse(su.courseId);
    if (!co) return false;
    const known = su.roster.filter((r) => allSaved.some((p) => p.id === r.id));
    const intact = known.length === su.roster.length;
    setCourse(co);
    setRoster(known);
    setTeamOfState(su.teamOf);
    if (su.teamColors) setTeamColors(su.teamColors);
    if (su.teamNames) setTeamNames(su.teamNames);
    setLetters(su.letters);
    setNoTeams(su.noTeams);
    setDraft(intact ? (su.draft as GameDraft | null) : null);
    setSideMatches(intact ? su.sideMatches : []);
    setStatsEnabled(su.statsEnabled);
    setStep(intact ? toStep : 'players');
    return true;
  };
  // "Play now" on a favourite: load it, then start as soon as it's in place.
  const [autoStart, setAutoStart] = useState(false);
  // Opened from a favourite on Home: load it (and start straight away for "play").
  const favLoaded = useRef(false);
  // A planned event round set up ahead (or being set up ahead): open on its saved setup.
  const planLoaded = useRef(false);
  useEffect(() => {
    if (planLoaded.current || !planned?.setup) return;
    planLoaded.current = true;
    plannedDraftSet.current = true;
    applySetup(planned.setup, 'game');
  }, [planned?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (favLoaded.current || !fav) return;
    favLoaded.current = true;
    const f = useStore.getState().favourites.find((x) => x.id === fav);
    if (f && applySetup(f.setup, 'game') && play) setAutoStart(true);
  }, [fav]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!autoStart || !course) return;
    setAutoStart(false);
    if (draft && !problem) start();
  }, [autoStart, course, draft, problem]); // eslint-disable-line react-hooks/exhaustive-deps

  // The round's teams: the Teams step, with each match side on the team its matchup was made for
  // (a planned round's matchups can put someone on a different team for that day).
  const roundTeamOf = () => {
    const out = { ...teamOf };
    if (draft && isMatchFormat(draft.kind)) {
      for (const m of draft.matches) {
        if (m.ta) for (const id of m.a) out[id] = m.ta;
        if (m.tb) for (const id of m.b) out[id] = m.tb;
      }
    }
    return out;
  };

  const start = () => {
    if (!course || !draft || problem || scanProblem || (!event && toSeason === 'yes' && !season)) return;
    const id = newId();
    const round: RoundRecord = {
      id,
      createdAt: scan ? playedAt(scan.date) : Date.now(),
      courseId: course.id,
      course,
      players,
      games: [...draftToConfigs(draft, players), ...sideMatches.map(([a, b]) => sideMatchConfig(a, b, playSpec(draft.holes, draft.matches.find((m) => m.a.includes(a) || m.b.includes(a))?.start ?? draft.start)))],
      statsEnabled,
      ledger: {},
      stats: {},
      // Scoring opens on the first match's starting hole.
      currentHole: draftToConfigs(draft, players)[0]?.play?.start ?? 1,
      status: 'active',
      notices: [],
      eventId: event?.id ?? season?.id,
      label: planned ? `Round ${planned.number}` : event && addingRound ? `Round ${(event.rounds?.length ?? 0) + 1}` : season ? `Round ${(season.rounds?.length ?? 0) + 1}` : scheduled?.label,
      teamOf: !noTeams && Object.keys(teamOf).length ? roundTeamOf() : undefined,
      teamColors: !noTeams && Object.keys(teamOf).length && Object.keys(teamColors).length ? teamColors : undefined,
      teamNames: !noTeams && Object.keys(teamOf).length && Object.values(teamNames).some((v) => v.trim()) ? teamNames : undefined,
    };
    if (scan) {
      const holes = [...new Set(round.games.flatMap(gameHoles))];
      round.ledger = ledgerFromCard(rowFor, scan.rows, me?.id ?? 'device', holes);
      round.fromPhoto = true;
    }
    addRound(round);
    if (plain) saveDraft('round', null);
    track('round_created', { games: round.games.map((g) => g.type).join(','), players: players.length, teams: !!round.teamOf, stats: !!statsEnabled, in_event: !!round.eventId, side_matches: sideMatches.length });
    if (event && scheduled) saveScheduled(event.id, { ...scheduled, roundId: id });
    if (event && planned) setEventRoundId(event.id, planned.id, id);
    if (event && addingRound && !planned) addEventRound(event.id, { id: newId(), number: 0, date: today(), draft, roundId: id });
    if (!event && season) {
      // Joins the season: listed as its next round, and anyone new joins the season.
      addEventRound(season.id, { id: newId(), number: 0, date: today(), draft, roundId: id });
      addEventPlayers(season.id, players.map((p) => p.id));
    }
    if (scan) {
      // Every score is in: work out the results and go straight to them.
      completeRound(id, recordedMatches(round, evaluate(round).filter(isResult)));
      track('scorecard_uploaded', { players: players.length, games: round.games.map((g) => g.type).join(',') });
      setPendingScan(null);
      void autoShare(id);
      router.dismissAll();
      router.push(`/round/${id}/results`);
      return;
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
        ...(fromCard ? [] : [{ value: 'course' as const, label: 'Course' }, { value: 'players' as const, label: 'Players' }]),
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
    // Keep the holes chosen so far when switching games (an uploaded card sets them from its scores).
    const fromCard = scan ? holesFromCard(scan) : null;
    setDraft(draft ? { ...d, holes: draft.holes, start: draft.start } : fromCard ? { ...d, holes: fromCard.holes, start: fromCard.start, matches: d.matches.map((m) => ({ ...m, start: fromCard.start })) } : d);
    setSideMatches([]);
  };

  // The main button for each step, pinned to the bottom of the screen (no scrolling to find it).
  const gameMessage =
    step !== 'game' ? null
    : problem && draft ? problem
    : !problem && scanProblem ? scanProblem
    : !problem && !event && toSeason === 'yes' && !season ? 'Choose a season, or pick No.'
    : null;
  const footer =
    step === 'players' && course ? (
      <Button title="Next: teams" disabled={roster.length === 0} onPress={() => setStep('teams')} />
    ) : step === 'teams' && course ? (
      <Button
        title={teamsDone && !noTeams ? 'Next: choose game' : `Put every player on a team (${players.filter((p) => !letters.includes(teamOf[p.id])).length} left)`}
        disabled={!teamsSet(rosterIds, (id) => (letters.includes(teamOf[id]) ? teamOf[id] : undefined))}
        onPress={() => { setNoTeams(false); setStep('game'); }}
      />
    ) : step === 'game' && course && planMode ? (
      // Set up ahead of the day: saved to the event, started on the day.
      <Button title="Save round setup" disabled={!!problem} onPress={savePlan} />
    ) : step === 'game' && course ? (
      <Button
        title={scan ? 'Calculate results' : season ? `Start round · ${season.name}` : 'Start round'}
        disabled={!!problem || !!scanProblem || (!event && toSeason === 'yes' && !season)}
        onPress={start}
      />
    ) : null;

  // A planned round or scheduled match can only be started on its day.
  const plannedDate = planned?.date ?? scheduled?.date;
  if (event && plannedDate && !canStartOn(plannedDate) && !scan && !planMode) {
    const what = planned ? `Round ${planned.number}` : (scheduled?.label ?? 'This match');
    const canMove = event.remote?.role !== 'viewer';
    return (
      <View style={{ flex: 1, padding: space.xl, gap: space.lg, justifyContent: 'center' }}>
        <Stack.Screen options={{ title: plannedDate < today() ? 'Missed round' : 'Not today yet' }} />
        <Text style={{ fontSize: 44, textAlign: 'center' }}>📅</Text>
        <Text style={{ fontFamily: fonts.serif, fontSize: 22, fontWeight: '700', color: c.text, textAlign: 'center' }}>{what} is planned for {formatDate(plannedDate, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        <Body muted style={{ textAlign: 'center' }}>
          Event rounds can only be started on the day they’re planned{plannedDate > today() ? '. It’ll show on your Home screen that morning with a Start round button.' : '.'}
        </Body>
        {canMove && (
          <Button
            title="Move it to today and start"
            onPress={() => {
              if (planned) setEventRoundDate(event.id, planned.id, today());
              else if (scheduled) saveScheduled(event.id, { ...scheduled, date: today() });
            }}
          />
        )}
        {canMove && plannedDate < today() && (
          <Button kind="ghost" title={planned ? 'Delete this round from the event' : 'Delete this match from the event'} onPress={() => setDeleting(true)} />
        )}
        <Button kind="secondary" title="Back" onPress={() => router.back()} />
        <ConfirmDialog
          visible={deleting}
          title={`Delete ${what}?`}
          message={planned ? 'It comes off the event’s list of rounds, and the rounds after it move up a number. Rounds already played aren’t affected.' : 'It comes off the event’s schedule.'}
          cancelLabel="Keep it"
          confirmLabel="Delete"
          onCancel={() => setDeleting(false)}
          onConfirm={() => {
            setDeleting(false);
            if (planned) removeEventRound(event.id, planned.id);
            else if (scheduled) removeScheduled(event.id, scheduled.id);
            track('event_round_deleted', { missed: true });
            router.back();
          }}
        />
      </View>
    );
  }

  /** Choose a course: from the list, or one just brought in from the online course database. */
  const pickCourse = (co: Course) => {
    setCourse(co);
    // Start with me in the group (if I'm part of this event, or it's a regular round).
    // Uploaded card: start with the people confirmed on the score-check screen.
    const fromCard = scan ? [...new Set(scan.rows.map((r) => r.playerId).filter((x): x is string => !!x))].filter((pid) => saved.some((p) => p.id === pid)) : [];
    if (fromCard.length) {
      setRoster(fromCard.map((pid) => ({ id: pid, teeId: defaultTee(co, saved.find((p) => p.id === pid)!) })));
    } else if (planned) {
      plannedDraftSet.current = false;
      setRoster(plannedIds.map((pid) => ({ id: pid, teeId: defaultTee(co, saved.find((p) => p.id === pid)!) })));
    } else setRoster(me && (!event || event.playerIds.includes(me.id)) ? [{ id: me.id, teeId: defaultTee(co, me) }] : []);
    setDraft(null);
    // A planned round with its players and matchups already set: straight to the game step to check and start.
    // (Matchups decided on the day: pick who's playing first.)
    if (planned?.draft && !planned.matchupsLater && plannedIds.length) {
      if (!eventTeams || !plannedIds.every((pid) => eventTeams[pid])) setNoTeams(true);
      setStep('game');
    } else setStep('players');
  };

  return (
    <TeamColors picks={teamColors} names={teamNames}>
    <View style={{ flex: 1 }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
      {scan && <Stack.Screen options={{ title: 'Set Up the Round' }} />}
      {planMode && planned && <Stack.Screen options={{ title: `Set up Round ${planned.number}` }} />}
      {planMode && planned?.date && (
        <View style={{ backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.md, borderLeftWidth: 3, borderLeftColor: c.accent }}>
          <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>
            <Text style={{ fontWeight: '800' }}>Setting up Round {planned.number} for {formatDate(planned.date, { weekday: 'long', month: 'short', day: 'numeric' })}.</Text>
            {' '}Pick everything now; it’s saved to the event and can be started on the day.
          </Text>
        </View>
      )}
      {stepBar}

      {step === 'course' && (
        <>
          {plain && (
            <SetupSaved
              onResume={(d) => applySetup(d as RoundSetup, ((d as { step?: Step }).step ?? 'players'))}
              onPlay={(su) => { if (applySetup(su, 'game')) setAutoStart(true); }}
              onEdit={(su) => applySetup(su, 'game')}
            />
          )}
          <Field label="Search courses" value={query} onChangeText={setQuery} onClear={() => setQuery('')} placeholder="Course name or city" />
          {/* Course not in the list: add it (scan the card or type it in). */}
          <Button title="Upload New Course" onPress={() => router.push('/course/new')} />
          {/* Favourites and previously played; typing searches (with a star to keep a course in Favourites). */}
          <CoursePicker query={query} courses={courses} selectedId={course?.id} onPick={pickCourse} />
        </>
      )}

      {step === 'players' && course && (
        <>
          {scan && (
            <Card style={{ gap: 4 }}>
              <Label>On the scorecard</Label>
              <Body>{scan.rows.map((r) => (r.playerId ? `${r.name} ✓` : r.name)).join(', ')}</Body>
              <Label style={{ textTransform: 'none', letterSpacing: 0 }}>
                {scan.rows.every((r) => r.playerId)
                  ? 'Everyone on the card is already added (✓). Pick their tees, then carry on.'
                  : scan.rows.some((r) => r.playerId)
                    ? 'Players marked ✓ are already added. Add the others, then pick tees.'
                    : 'Add these players (or their teams) to the round. You’ll match them to the card’s rows on the last step.'}
              </Label>
            </Card>
          )}
          <PlayerPicker
            people={meFirst(saved, isMe)}
            selected={roster.map((r) => r.id)}
            onToggle={togglePlayer}
            isMe={isMe}
            indexFor={(p) => (event?.lockHandicaps ? (event.lockedIndexes[p.id] ?? p.handicapIndex) : p.handicapIndex)}
            colorFor={(id) => (eventTeams?.[id] ? teamColor(eventTeams[id], teamColors).color : undefined)}
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
                <View style={{ flexDirection: 'row' }}>
                  <PlayerDropdown
                    label="Tees for everyone"
                    value={names.find(everyone) ?? null}
                    placeholder="Mixed: pick one to set everyone"
                    options={names.map((n) => {
                      // Yardage of that tee (the men's version when there are both).
                      const t = course.tees.find((x) => x.name === n && (x.gender ?? 'M') === 'M') ?? course.tees.find((x) => x.name === n)!;
                      return { id: n, name: `${n} · ${t.holes.reduce((s2, h) => s2 + (h.yards ?? 0), 0)} yds` };
                    })}
                    onChange={setAll}
                  />
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
                <View style={{ flexDirection: 'row' }}>
                  <PlayerDropdown
                    label={`${p.name}’s tees`}
                    value={r.teeId}
                    placeholder="Choose tees"
                    options={teesFor(course, p.gender).map((t) => ({ id: t.id, name: `${teeLabel(t)} · ${t.holes.reduce((s2, h) => s2 + (h.yards ?? 0), 0)} yds` }))}
                    onChange={(teeId) => setRoster((rs) => rs.map((x) => (x.id === r.id ? { ...x, teeId } : x)))}
                  />
                </View>
                <Label style={{ textTransform: 'none' }}>
                  {tee.courseRating} / {tee.slope} · {tee.holes.reduce((s, h) => s + (h.yards ?? 0), 0)} yds
                </Label>
              </Card>
            );
          })}

        </>
      )}

      {step === 'teams' && course && (
        <>
          {!eventTeams && (
            <Button
              title="No teams (individual games)"
              kind="secondary"
              onPress={() => {
                setNoTeams(true);
                setDraft(null);
                setStep('game');
              }}
            />
          )}
          <TeamsStep
            players={players}
            teamOf={teamOf}
            onTeamOf={(t) => { setTeamOf(t); setNoTeams(false); }}
            letters={letters}
            onLetters={(l) => { setLetters(l); setDraft(null); }}
            lockedReason={eventTeams ? `Teams come from ${event!.name}.` : undefined}
            colors={teamColors}
            onColors={event?.teamColors && eventTeams ? undefined : setTeamColors}
            names={teamNames}
            onNames={eventTeams ? undefined : setTeamNames}
          />
        </>
      )}

      {step === 'game' && course && (
        <>
          <GamePicker value={draft?.kind ?? null} playerIds={rosterIds} teamOf={noTeams ? undefined : teamOf} onPick={pickGame} />

          {sameTeamMatches.length > 0 && (
            // Two players on the same team can't earn a team point: say so before the round starts.
            <View style={{ backgroundColor: c.card, borderRadius: radius.md, borderWidth: 2, borderColor: c.danger, padding: space.md, gap: 4 }}>
              <Text style={{ color: c.danger, fontWeight: '800', fontSize: 13, letterSpacing: 0.5 }}>⚠️ SAME-TEAM MATCH{sameTeamMatches.length > 1 ? 'ES' : ''}</Text>
              {sameTeamMatches.map((m) => (
                <Text key={m.i} style={{ color: c.text, fontSize: 14 }}>
                  Match {m.i + 1}: {m.names} are both on {m.team}, so it won’t count toward the team score.
                </Text>
              ))}
              <Text style={{ color: c.muted, fontSize: 13 }}>Swap players in the matchups below, or change the teams on the Teams step.</Text>
            </View>
          )}
          {draft && (
            <>
              <GameRulesButton kind={draft.kind} />
              <GameOptions draft={draft} players={players} onChange={setDraft} teamOf={noTeams ? undefined : teamOf} />
              <HolesSetup draft={draft} onChange={setDraft} name={name} />

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

          {scan && draft && !problem && (
            <Card style={{ gap: space.md }}>
              <H2>Scores from the photo</H2>
              <Body muted>Check each player (or team) has the right row from the scorecard.</Body>
              {scanKeys.map((k) => (
                <View key={k.key} style={{ gap: space.xs }}>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>{k.label}</Text>
                  <View style={styles.wrap}>
                    {scan.rows.map((row, i) => {
                      const total = row.scores.reduce<number>((s, v) => s + (v ?? 0), 0);
                      return <Chip key={i} label={`${row.name} · ${total}`} selected={rowFor[k.key] === i} onPress={() => setRowPicks((p) => ({ ...p, [k.key]: i }))} />;
                    })}
                  </View>
                </View>
              ))}
              {scan.rows.length > scanKeys.length && <Label style={{ textTransform: 'none', letterSpacing: 0 }}>Rows not picked for anyone are left out.</Label>}
            </Card>
          )}


          {plain && setup && draft && !problem && <SaveFavourite setup={setup} summary={summary} suggested={[gameLabel, shortCourseName(course.name)].filter(Boolean).join(' at ')} />}

          <Sheet visible={seasonSheet} onClose={() => setSeasonSheet(false)} title="Choose a season">
            <View style={{ gap: space.sm }}>
              {seasons.length > 4 && <Field label="Search" value={seasonQuery} onChangeText={setSeasonQuery} onClear={() => setSeasonQuery('')} placeholder="Season name" />}
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
    {footer && (
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + space.sm, gap: 6, backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.border }}>
        {gameMessage ? <Text style={{ color: c.danger, fontSize: 13, textAlign: 'center' }}>{gameMessage}</Text> : null}
        {footer}
      </View>
    )}
    </View>
    </TeamColors>
  );
}
