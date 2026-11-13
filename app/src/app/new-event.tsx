import { lockHandicaps, type Player } from '@golf/engine';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/date-field';
import { SetupSaved } from '@/components/setup-saved';
import { TeamColors } from '@/lib/team-colors';
import { GameOptions } from '@/components/game-options';
import { HolesSetup } from '@/components/holes-setup';
import { GamePicker, GameRulesButton, PlayerPicker, Sheet, StepPills } from '@/components/round-setup';
import { TeamsStep } from '@/components/teams-step';
import { Body, Button, Card, Checkbox, Field, H2, Label, OptionRow, Segmented, Stepper, Toggle } from '@/components/ui';
import { addDays, daysBetween, describeRecurrence, formatDate, occurrences, today, WEEKDAYS, type Recurrence } from '@/lib/dates';
import { draftProblem, gameInfo, isMatchFormat, newDraft, teamsSet, type GameDraft, type GameKind, type TeamOf } from '@/lib/games';
import { meFirst, useMe } from '@/lib/me';
import { openPaywall, usePro } from '@/lib/pro';
import { usePickBus } from '@/store/pick';
import { newId, useStore, type EventRecord, type EventType, type SavedPlayer } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';
import { track } from '@/lib/usage';

type Step = 'details' | 'players' | 'teams' | 'rounds' | 'matchups';
type Plan = { id: string; date?: string; draft: GameDraft | null; tbd?: boolean };

const TYPES: { value: EventType; label: string; icon: string; blurb: string }[] = [
  { value: 'trip', label: 'Trip', icon: '✈︎', blurb: 'A few rounds over a few days. Standings from every match.' },
  { value: 'cup', label: 'Ryder Cup', icon: '🏆', blurb: 'Two teams play matches for points. Win 1, halve ½.' },
  { value: 'season', label: 'Season', icon: '📅', blurb: 'Regular rounds on a repeating schedule, with season standings.' },
];

export default function NewEvent() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const saved = useStore((s) => s.players);
  const addEvent = useStore((s) => s.addEvent);
  const { me, isMe } = useMe();

  const [step, setStep] = useState<Step>('details');
  const [triedDetails, setTriedDetails] = useState(false);
  const nameRef = useRef<ComponentRef<typeof TextInput>>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  // Details
  // Opened from New Round's "Create a new season": start as a play-as-you-go season and go back there after.
  const params = useLocalSearchParams<{ type?: EventType; returnTo?: string }>();
  const fromRound = params.returnTo === 'new-round';
  const [type, setType] = useState<EventType>(params.type ?? 'trip');
  const [name, setName] = useState('');
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(addDays(today(), params.type === 'season' ? 91 : 2));
  const [rec, setRec] = useState<Recurrence>({ every: fromRound ? 'asYouGo' : 'weekly', days: [], week: 1 });
  const [lock, setLock] = useState(true);
  // Players & teams
  const [ids, setIds] = useState<string[]>(me ? [me.id] : []);
  const [teamOf, setTeamOfState] = useState<TeamOf>({});
  const [letters, setLetters] = useState<string[]>(['A', 'B']);
  const [noTeams, setNoTeams] = useState(false);
  const [teamColors, setTeamColors] = useState<Record<string, string>>({});
  // Team names (blank = "Team A"), set beside each team's colour.
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [holder, setHolder] = useState<'none' | 'A' | 'B'>('none');
  // Rounds
  const [count, setCount] = useState(fromRound ? 0 : 3);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState(0);
  // One game for every round (on by default; untick to choose per round).
  // Off by default: each round can have its own game unless the organiser chooses one for all.
  const [sameGame, setSameGame] = useState(false);

  const isSeason = type === 'season';
  const isCup = type === 'cup';
  const asYouGo = isSeason && rec.every === 'asYouGo';
  const eventDays = useMemo(() => daysBetween(start, end), [start, end]);
  const seasonDates = useMemo(() => (isSeason ? occurrences(start, end, rec).slice(0, 60) : []), [isSeason, start, end, rec]);

  const players: Player[] = useMemo(
    () => ids.map((id) => saved.find((p) => p.id === id)).filter((p): p is SavedPlayer => !!p).map((p) => ({ id: p.id, name: p.name, handicapIndex: p.handicapIndex, teeId: '' })),
    [ids, saved],
  );
  const teams = noTeams ? undefined : teamOf;
  const assigned = (id: string) => (letters.includes(teamOf[id]) ? teamOf[id] : undefined);
  const teamsDone = noTeams || (teamsSet(ids, assigned) && (!isCup || letters.every((L) => ids.some((id) => teamOf[id] === L))));

  // Changing who's playing or the teams rebuilds each round's matchups (keeping its format).
  const rebuild = (list: Plan[], t: TeamOf | undefined) => list.map((p) => (p.draft ? { ...p, draft: newDraft(p.draft.kind, players, t) } : p));
  const setTeamOf = (t: TeamOf) => {
    setTeamOfState(t);
    setNoTeams(false);
    setPlans((ps) => rebuild(ps, t));
  };
  useEffect(() => setPlans((ps) => rebuild(ps, teams)), [ids.join(','), noTeams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep one plan per round, with a sensible date.
  const roundCount = isSeason && !asYouGo ? seasonDates.length : count;
  useEffect(() => {
    setPlans((ps) =>
      Array.from({ length: roundCount }, (_, i) => {
        const date = asYouGo ? undefined : isSeason ? seasonDates[i] : ps[i]?.date && eventDays.includes(ps[i].date!) ? ps[i].date : eventDays[Math.min(i, eventDays.length - 1)];
        return { id: ps[i]?.id ?? newId(), date, draft: ps[i]?.draft ?? null, tbd: ps[i]?.tbd };
      }),
    );
    setCurrent((x) => Math.min(x, Math.max(0, roundCount - 1)));
  }, [roundCount, isSeason, asYouGo, seasonDates.join(','), eventDays.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same game for all rounds: rounds added later (more rounds, longer dates) get it too.
  useEffect(() => {
    const kind = plans.find((p) => p.draft)?.draft?.kind;
    if (!sameGame || !kind || plans.every((p) => p.draft?.kind === kind)) return;
    setPlans((ps) => ps.map((p) => (p.draft?.kind === kind ? p : { ...p, draft: newDraft(kind, players, teams) })));
  }, [sameGame, plans.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (p: SavedPlayer) => {
    setIds((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]));
    setTeamOfState((t) => {
      const next = { ...t };
      delete next[p.id];
      return next;
    });
  };
  const picked = usePickBus((s) => s.picked);
  useEffect(() => {
    if (picked.length === 0) return;
    const add = usePickBus.getState().take('new-event');
    if (add.length) setIds((x) => [...x, ...add.map((p) => p.id).filter((id) => !x.includes(id))]);
  }, [picked]);

  // ------------------------------------------------------------------ draft
  // Saved as you go, so closing the screen by accident loses nothing ("Pick up where you left off").
  const saveDraft = useStore((s) => s.saveDraft);
  const snapshot = { step, type, name, start, end, rec, lock, ids, teamOf, teamColors, letters, noTeams, teamNames, holder, count, plans, current };
  const started = !!name.trim() || ids.length > 1 || step !== 'details';
  useEffect(() => {
    if (fromRound || !started) return;
    const label = TYPES.find((t) => t.value === type)?.label ?? 'Event';
    saveDraft('event', { data: snapshot, summary: [name.trim() ? `${label}: ${name.trim()}` : label, ids.length ? `${ids.length} player${ids.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '), savedAt: Date.now() });
  }, [JSON.stringify(snapshot)]); // eslint-disable-line react-hooks/exhaustive-deps
  // Restoring: the round plans go back last, after the screen has adjusted them to the players and dates.
  const [restorePlans, setRestorePlans] = useState<{ plans: Plan[]; current: number } | null>(null);
  useEffect(() => {
    if (!restorePlans) return;
    setPlans(restorePlans.plans);
    setCurrent(restorePlans.current);
    setRestorePlans(null);
  }, [restorePlans]);
  const resume = (d: typeof snapshot) => {
    setType(d.type); setName(d.name); setStart(d.start); setEnd(d.end); setRec(d.rec); setLock(d.lock);
    setIds(d.ids.filter((id) => saved.some((p) => p.id === id)));
    setTeamOfState(d.teamOf); if (d.teamColors) setTeamColors(d.teamColors); setTeamNames(d.teamNames ?? {}); setLetters(d.letters); setNoTeams(d.noTeams); setHolder(d.holder);
    setCount(d.count); setStep(d.step);
    setTimeout(() => setRestorePlans({ plans: d.plans, current: d.current }), 0);
  };

  // ------------------------------------------------------------------ checks
  const detailsProblem = !name.trim()
    ? 'Give the event a name'
    : end < start
      ? 'The end date is before the start'
      : isSeason && !asYouGo && rec.days.length === 0
        ? 'Pick the days rounds are played'
        : isSeason && !asYouGo && seasonDates.length === 0
          ? 'No rounds fall between these dates'
          : null;
  const playersProblem = ids.length < 2 ? 'Add at least 2 players' : null;
  // The game can be decided later (when the round is set up), so it isn't required here.
  const roundsProblem = null as string | null;
  // Rounds with a game chosen: only those have matchups to set now.
  const withGame = plans.map((p, i) => (p.draft ? i : -1)).filter((i) => i >= 0);
  // Round 1's matchups must be set; later rounds can be decided as the event is played.
  const matchupProblems = plans.map((p, i) => (!p.draft ? null : i > withGame[0] && p.tbd ? null : draftProblem(p.draft, players)));

  const canGo = (s: Step) =>
    s === 'details' ||
    (s === 'players' && !detailsProblem) ||
    (s === 'teams' && !detailsProblem && !playersProblem) ||
    (s === 'rounds' && !detailsProblem && !playersProblem && teamsDone) ||
    (s === 'matchups' && !detailsProblem && !playersProblem && teamsDone && withGame.length > 0);

  const create = () => {
    // Anyone can set an event up to see what's possible; creating it is Clutch Up Pro (the setup stays here).
    // (It's saved as a draft as you go, so nothing is lost.)
    if (!usePro.getState().pro) {
      openPaywall('event');
      return;
    }
    // Never fail silently: say what's still missing, or what went wrong.
    const firstBad = matchupProblems.findIndex((x) => x);
    const blocked =
      detailsProblem ? `Event step: ${detailsProblem}.`
        : playersProblem ? `Players step: ${playersProblem}.`
          : !teamsDone ? 'Teams step: put every player on a team.'
            : roundsProblem ? `Rounds step: ${roundsProblem}.`
              : firstBad >= 0 ? `Round ${firstBad + 1}: ${matchupProblems[firstBad]}.`
                : null;
    if (blocked) {
      Alert.alert('Not quite ready', blocked);
      if (firstBad >= 0 && !detailsProblem && !playersProblem && teamsDone && !roundsProblem) setCurrent(firstBad);
      return;
    }
    try {
      build();
    } catch (err) {
      Alert.alert('Couldn’t create the event', err instanceof Error ? err.message : String(err));
    }
  };

  const build = () => {
    const chosen = saved.filter((p) => ids.includes(p.id));
    const teamIds = (L: string) => ids.filter((id) => teamOf[id] === L);
    // Each match is worth 1 point; a Nassau is worth 3 (front, back, overall).
    const cupPoints = plans.reduce((s, p) => s + (p.draft && isMatchFormat(p.draft.kind) ? p.draft.matches.length * (p.draft.kind === 'nassau' ? 3 : 1) : 0), 0);
    const e: EventRecord = {
      id: newId(),
      name: name.trim(),
      type,
      createdAt: Date.now(),
      playerIds: ids,
      lockHandicaps: lock,
      lockedIndexes: lockHandicaps(chosen),
      teams: isCup ? { A: { name: teamNames.A?.trim() || 'Team A', playerIds: teamIds('A') }, B: { name: teamNames.B?.trim() || 'Team B', playerIds: teamIds('B') } } : undefined,
      holder: isCup && holder !== 'none' ? holder : undefined,
      cupPoints: isCup ? cupPoints : undefined,
      points: { win: 1, halve: 0.5, loss: 0 },
      status: 'active',
      startDate: start,
      endDate: end,
      recurrence: isSeason ? rec : undefined,
      teamOf: teams ? Object.fromEntries(ids.map((id) => [id, teamOf[id]])) : undefined,
      teamColors: teams && Object.keys(teamColors).length ? teamColors : undefined,
      teamNames: teams && Object.values(teamNames).some((v) => v.trim()) ? Object.fromEntries(Object.entries(teamNames).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])) : undefined,
      teamLetters: teams ? letters : undefined,
      rounds: plans.map((p, i) => ({ id: p.id, number: i + 1, date: p.date, draft: p.draft ?? undefined, matchupsLater: i > 0 && p.tbd ? true : undefined })),
    };
    addEvent(e);
    if (!fromRound) saveDraft('event', null);
    track('event_created', { type, rounds: plans.length, players: ids.length, teams: !!teams, recurring: !!(isSeason && rec) });
    // The event is saved; go to it once this screen has finished handling the tap.
    setTimeout(() => {
      try {
        if (fromRound) return router.back(); // New Round picks the new season up
        router.replace(`/event/${e.id}`);
      } catch {
        router.dismissTo('/');
      }
    }, 0);
  };

  const stepBar = (
    <StepPills
      steps={[
        { value: 'details', label: 'Event' },
        { value: 'players', label: 'Players' },
        { value: 'teams', label: 'Teams' },
        { value: 'rounds', label: 'Rounds' },
        { value: 'matchups', label: 'Matchups' },
      ]}
      current={step}
      isDone={(s) =>
        s === 'details'
          ? !detailsProblem
          : s === 'players'
            ? !playersProblem
            : s === 'teams'
              ? teamsDone && !playersProblem
              : s === 'rounds'
                ? !roundsProblem && plans.length > 0
                : plans.length > 0 && matchupProblems.every((x) => !x)
      }
      canGo={canGo}
      onGo={(s) => canGo(s) && setStep(s)}
    />
  );

  const plan = plans[current];
  const nextWithGame = withGame.find((i) => i > current);

  // The main button for each step, pinned to the bottom of the screen (no scrolling to find it), as in New Round.
  const nextBtn = (to: Step, title: string, problem: string | null) => <Button title={title} disabled={!!problem} onPress={() => setStep(to)} />;
  const footerMessage =
    step === 'details' ? (triedDetails ? detailsProblem : null)
    : step === 'players' ? playersProblem
    : step === 'rounds' ? (plans.length ? roundsProblem : null)
    : step === 'matchups' ? (matchupProblems[current] ?? (current === plans.length - 1 && matchupProblems.some((x) => x)
      ? `Finish the matchups for ${matchupProblems.map((x, i) => (x ? `Round ${i + 1}` : null)).filter(Boolean).join(', ')} first.` : null))
    : null;
  const footer =
    step === 'details' ? (
      // No name, no moving on: tapping Next shows where it's missing.
      <Button title="Next: players" onPress={() => {
        if (detailsProblem) {
          setTriedDetails(true);
          if (!name.trim()) { scrollRef.current?.scrollTo({ y: 0, animated: true }); nameRef.current?.focus(); }
          return;
        }
        setStep('players');
      }} />
    )
    : step === 'players' ? nextBtn('teams', 'Next: teams', playersProblem)
    : step === 'teams' ? (
      <Button
        title={teamsDone && !noTeams ? 'Next: rounds' : `Put every player on a team (${ids.filter((id) => !assigned(id)).length} left)`}
        disabled={!(teamsSet(ids, assigned) && (!isCup || letters.every((L) => ids.some((id) => teamOf[id] === L))))}
        onPress={() => { setNoTeams(false); setStep('rounds'); }}
      />
    )
    : step === 'rounds' ? (withGame.length === 0
      ? <Button title={fromRound ? 'Create season and go back to my round' : 'Create event'} onPress={create} />
      : <Button title="Next: matchups" onPress={() => { setCurrent(withGame[0]); setStep('matchups'); }} />)
    : step === 'matchups' && plan ? (nextWithGame !== undefined ? (
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}><Button title={`Next: Round ${nextWithGame + 1}`} disabled={!!matchupProblems[current]} onPress={() => setCurrent(nextWithGame)} /></View>
        {matchupProblems.every((x) => !x) && <View style={{ flex: 1 }}><Button title="Create event" kind="secondary" onPress={create} /></View>}
      </View>
    ) : <Button title="Create event" onPress={create} />)
    : null;

  return (
    <TeamColors picks={teamColors} names={teamNames}>
    <View style={{ flex: 1 }}>
    <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
      {stepBar}

      {step === 'details' && (
        <>
          {!fromRound && <SetupSaved draftKey="event" onResume={(d) => resume(d as typeof snapshot)} />}
          <View style={{ gap: space.sm }}>
            {TYPES.map((t) => {
              const sel = type === t.value;
              return (
                <Pressable
                  key={t.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                  onPress={() => {
                    setType(t.value);
                    setLock(t.value !== 'season');
                    if (t.value === 'season' && end < addDays(start, 28)) setEnd(addDays(start, 91));
                    if (t.value !== 'season' && end > addDays(start, 13)) setEnd(addDays(start, 2));
                    if (t.value === 'cup') setLetters(['A', 'B']);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg,
                    borderWidth: sel ? 2 : 1, borderColor: sel ? c.primary : c.border, backgroundColor: sel ? c.primarySoft : c.card, opacity: pressed ? 0.7 : 1,
                  })}>
                  <Text style={{ fontSize: 26, width: 34, textAlign: 'center' }}>{t.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fonts.serif, fontSize: 18, fontWeight: '700', color: c.text }}>{t.label}</Text>
                    <Text style={{ color: c.muted, fontSize: 13 }}>{t.blurb}</Text>
                  </View>
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: sel ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                    {sel && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.primary }} />}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Field ref={nameRef} label="Event name" value={name} onChangeText={setName} error={triedDetails && !name.trim() ? 'Enter a name for the event' : null} placeholder={isCup ? 'e.g. Palm Desert Cup 2027' : type === 'trip' ? 'e.g. Boys Trip 2027' : 'e.g. Tuesday Night League 2027'} />

          <Card>
            <H2>{isSeason ? 'Season dates' : 'Dates'}</H2>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <DateField label="Starts" value={start} onChange={(d) => { setStart(d); if (end < d) setEnd(isSeason ? addDays(d, 91) : d); }} />
              <DateField label="Ends" value={end} onChange={setEnd} min={start} />
            </View>
            {!isSeason && <Text style={{ color: c.muted, fontSize: 13 }}>{eventDays.length} day{eventDays.length === 1 ? '' : 's'}</Text>}
          </Card>

          {isSeason && (
            <Card>
              <H2>Repeats</H2>
              <Segmented
                options={[{ value: 'weekly', label: 'Weekly' }, { value: 'biweekly', label: '2 weeks' }, { value: 'monthly', label: 'Monthly' }, { value: 'asYouGo', label: 'As you go' }]}
                value={rec.every}
                onChange={(every) => setRec((r) => ({ ...r, every, days: every === 'monthly' ? r.days.slice(0, 1) : r.days }))}
              />
              {asYouGo && (
                <View style={{ backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.md, gap: 2 }}>
                  <Text style={{ color: c.primary, fontWeight: '700' }}>Play as you go</Text>
                  <Text style={{ color: c.muted, fontSize: 13 }}>No fixed days. Plan the first rounds now and add more from the event page whenever you play.</Text>
                </View>
              )}
              {rec.every === 'monthly' && (
                <OptionRow label="Which week">
                  <Segmented
                    options={[{ value: '1', label: '1st' }, { value: '2', label: '2nd' }, { value: '3', label: '3rd' }, { value: '4', label: '4th' }, { value: '-1', label: 'Last' }]}
                    value={String(rec.week ?? 1)}
                    onChange={(w) => setRec((r) => ({ ...r, week: Number(w) }))}
                  />
                </OptionRow>
              )}
              {!asYouGo && <Label>{rec.every === 'monthly' ? 'On' : 'On these days'}</Label>}
              {!asYouGo && <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {WEEKDAYS.map((d, i) => {
                  const on = rec.days.includes(i);
                  return (
                    <Pressable
                      key={d}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={d}
                      onPress={() => setRec((r) => ({ ...r, days: r.every === 'monthly' ? [i] : on ? r.days.filter((x) => x !== i) : [...r.days, i].sort() }))}
                      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.primary : c.chip, opacity: pressed ? 0.7 : 1 })}>
                      <Text style={{ color: on ? c.onPrimary : c.text, fontWeight: '700', fontSize: 13 }}>{d.slice(0, 1)}</Text>
                    </Pressable>
                  );
                })}
              </View>}
              {!asYouGo && rec.days.length > 0 && (
                <View style={{ backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.md, gap: 2 }}>
                  <Text style={{ color: c.primary, fontWeight: '700' }}>{describeRecurrence(rec)}</Text>
                  <Text style={{ color: c.muted, fontSize: 13 }}>
                    {seasonDates.length} round{seasonDates.length === 1 ? '' : 's'}
                    {seasonDates.length ? ` · first ${formatDate(seasonDates[0])}, last ${formatDate(seasonDates.at(-1)!)}` : ''}
                  </Text>
                </View>
              )}
            </Card>
          )}

          <Card>
            <Toggle label="Lock handicaps at the start" hint="Everyone plays the whole event off today's index, even if it changes on Golf Canada." value={lock} onChange={setLock} />
          </Card>
        </>
      )}

      {step === 'players' && (
        <>
          <View style={{ backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.md, borderLeftWidth: 3, borderLeftColor: c.accent }}>
            <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>
              Pick everyone playing in the event. If someone can’t make a round, you’ll be able to swap a sub in for that match when the round starts, without changing the event.
            </Text>
          </View>
          {(() => {
            const everyone = saved.filter((p) => !p.pending);
            const all = everyone.length > 0 && everyone.every((p) => ids.includes(p.id));
            return (
              <Checkbox
                label="Select all"
                hint={`Everyone in your friends list (${everyone.length})`}
                value={all}
                onChange={(v) => {
                  setIds(v ? everyone.map((p) => p.id) : me ? [me.id] : []);
                  if (!v) setTeamOfState({});
                }}
              />
            );
          })()}
          <PlayerPicker
            people={meFirst(saved, isMe)}
            selected={ids}
            onToggle={toggle}
            isMe={isMe}
            indexFor={(p) => p.handicapIndex}
            onFindNew={(q) => router.push({ pathname: '/add-friend', params: { pick: 'new-event', q } })}
          />
        </>
      )}

      {step === 'teams' && (
        <>
          {!isCup && <Button title="No teams (individual standings)" kind="secondary" onPress={() => { setNoTeams(true); setStep('rounds'); }} />}
          <TeamsStep
            players={players}
            teamOf={teamOf}
            onTeamOf={setTeamOf}
            letters={letters}
            onLetters={(l) => { setLetters(l); setPlans((ps) => rebuild(ps, teamOf)); }}
            maxTeams={isCup ? 2 : undefined}
            note={isCup ? 'A Ryder Cup has two teams.' : 'Teams stay the same for every round.'}
            colors={teamColors}
            onColors={setTeamColors}
            names={teamNames}
            onNames={setTeamNames}
          />
          {isCup && (
            <Card>
              <OptionRow label="Defending champion (keeps the cup on a tie)">
                <Segmented options={[{ value: 'none', label: 'None' }, { value: 'A', label: teamNames.A?.trim() || 'Team A' }, { value: 'B', label: teamNames.B?.trim() || 'Team B' }]} value={holder} onChange={setHolder} />
              </OptionRow>
            </Card>
          )}
        </>
      )}

      {step === 'rounds' && (
        <>
          <Card>
            <H2>Rounds</H2>
            {isSeason && !asYouGo ? (
              <Body muted>{describeRecurrence(rec)}: {plans.length} round{plans.length === 1 ? '' : 's'} from {formatDate(start)} to {formatDate(end)}.</Body>
            ) : (
              <OptionRow label={asYouGo ? 'Rounds to plan now' : 'Number of rounds'}>
                <Stepper value={count} min={asYouGo ? 0 : 1} max={asYouGo ? 30 : 12} onChange={setCount} />
              </OptionRow>
            )}
            {asYouGo && <Text style={{ color: c.muted, fontSize: 13 }}>You can add more rounds from the event page any time during the season.</Text>}
            <Text style={{ color: c.muted, fontSize: 13 }}>{sameGame && plans.length > 1 ? 'Choose the game for every round.' : 'Choose the format for each round.'} {withGame.length ? 'You’ll set the matchups next.' : 'Leave it as Decide later to choose when each round is set up.'}</Text>
          </Card>

          {/* Its own card, just under the number of rounds, so it's easy to spot (off by default). */}
          {plans.length > 1 && (
            <Card style={{ borderLeftWidth: 4, borderLeftColor: c.accent }}>
              <Checkbox
                label="Same game for all rounds"
                hint="Pick the game once instead of for every round."
                value={sameGame}
                onChange={(v) => {
                  setSameGame(v);
                  // Turning it on: every round takes the first round's game.
                  if (v && plans[0]?.draft) setPlans((ps) => ps.map((p, i) => (i === 0 || p.draft?.kind === ps[0].draft!.kind ? p : { ...p, draft: newDraft(ps[0].draft!.kind, players, teams) })));
                }}
              />
            </Card>
          )}

          {sameGame && plans.length > 1 && (
            <Card>
              <Text style={{ fontFamily: fonts.serif, fontSize: 18, fontWeight: '700', color: c.text }}>Game for all {plans.length} rounds</Text>
              <GamePicker
                value={plans[0]?.draft?.kind ?? null}
                playerIds={ids}
                teamOf={teams}
                onPick={(k: GameKind) => setPlans((ps) => ps.map((x) => ({ ...x, draft: newDraft(k, players, teams) })))}
                onLater={() => setPlans((ps) => ps.map((x) => ({ ...x, draft: null })))}
              />
            </Card>
          )}

          {plans.map((p, i) => (
            <Card key={p.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ fontFamily: fonts.serif, fontSize: 18, fontWeight: '700', color: c.text }}>Round {i + 1}</Text>
                {p.date && <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>{formatDate(p.date)}</Text>}
              </View>
              {!isSeason && eventDays.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {eventDays.map((d) => {
                    const on = p.date === d;
                    return (
                      <Pressable
                        key={d}
                        accessibilityRole="button"
                        accessibilityLabel={`Round ${i + 1} on ${formatDate(d)}`}
                        onPress={() => setPlans((ps) => ps.map((x) => (x.id === p.id ? { ...x, date: d } : x)))}
                        style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: on ? c.primary : c.chip }}>
                        <Text style={{ color: on ? c.onPrimary : c.text, fontSize: 12, fontWeight: '700' }}>{formatDate(d, { weekday: 'short', day: 'numeric' })}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
              {sameGame && plans.length > 1 ? (
                <Text style={{ color: c.muted, fontSize: 13 }}>{p.draft ? gameInfo(p.draft.kind).name : 'Game: decide later'}</Text>
              ) : (
                <GamePicker
                  value={p.draft?.kind ?? null}
                  playerIds={ids}
                  teamOf={teams}
                  onPick={(k: GameKind) => setPlans((ps) => ps.map((x) => (x.id === p.id ? { ...x, draft: newDraft(k, players, teams) } : x)))}
                  onLater={() => setPlans((ps) => ps.map((x) => (x.id === p.id ? { ...x, draft: null } : x)))}
                />
              )}
            </Card>
          ))}
        </>
      )}

      {step === 'matchups' && plan?.draft && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.sm }}>
            {plans.map((p, i) => {
              if (!p.draft) return null; // game decided later: no matchups yet
              const sel = i === current;
              const ok = !matchupProblems[i];
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: sel }}
                  onPress={() => setCurrent(i)}
                  style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: sel ? c.primary : c.border, backgroundColor: sel ? c.primary : c.card }}>
                  <Text style={{ color: sel ? c.onPrimary : c.text, fontWeight: '700', fontSize: 13 }}>{ok ? '✓ ' : ''}Round {i + 1}</Text>
                  <Text style={{ color: sel ? '#ffffffcc' : c.muted, fontSize: 11 }}>{p.draft ? gameInfo(p.draft.kind).name : ''}{i > 0 && p.tbd ? ' · TBD' : ''}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View>
            <Text style={{ fontFamily: fonts.serif, fontSize: 22, fontWeight: '700', color: c.text }}>Round {current + 1} · {gameInfo(plan.draft.kind).name}</Text>
            {plan.date && <Text style={{ color: c.muted }}>{formatDate(plan.date, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>}
          </View>
          <GameRulesButton kind={plan.draft.kind} />
          {current > 0 && (
            <Card>
              <Toggle
                label="Decide matchups later (TBD)"
                hint="Often set once the earlier rounds are played. You'll pick them when this round starts."
                value={!!plan.tbd}
                onChange={(v) => setPlans((ps) => ps.map((x) => (x.id === plan.id ? { ...x, tbd: v } : x)))}
              />
            </Card>
          )}
          <GameOptions
            draft={plan.draft}
            players={players}
            teamOf={teams}
            hideMatchups={current > 0 && !!plan.tbd}
            onChange={(d) => setPlans((ps) => ps.map((x) => (x.id === plan.id ? { ...x, draft: d } : x)))}
          />
          <HolesSetup
            draft={plan.draft}
            name={(id) => players.find((p) => p.id === id)?.name ?? ''}
            hideStarts={current > 0 && !!plan.tbd}
            onChange={(d) => setPlans((ps) => ps.map((x) => (x.id === plan.id ? { ...x, draft: d } : x)))}
          />

          {current < plans.length - 1 && plans.length > 2 && plans.slice(1).some((p) => !p.tbd) && (
            <Button
              title="Decide all later rounds later (TBD)"
              kind="ghost"
              onPress={() => setPlans((ps) => ps.map((x, i) => (i > 0 ? { ...x, tbd: true } : x)))}
            />
          )}
        </>
      )}
    </ScrollView>
    {footer && (
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + space.sm, gap: 6, backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.border }}>
        {footerMessage ? <Text style={{ color: c.danger, fontSize: 13, textAlign: 'center' }}>{footerMessage}</Text> : null}
        {footer}
      </View>
    )}
    </View>
    </TeamColors>
  );
}
