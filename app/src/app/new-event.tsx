import { lockHandicaps, type Player } from '@golf/engine';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Calendar } from '@/components/calendar';
import { GameOptions } from '@/components/game-options';
import { GamePicker, GameRulesButton, PlayerPicker, Sheet, StepPills } from '@/components/round-setup';
import { TeamsStep } from '@/components/teams-step';
import { Body, Button, Card, Field, H2, Label, OptionRow, Segmented, Stepper, Toggle } from '@/components/ui';
import { addDays, daysBetween, describeRecurrence, formatDate, occurrences, today, WEEKDAYS, type Recurrence } from '@/lib/dates';
import { draftProblem, gameInfo, isMatchFormat, newDraft, teamsSet, type GameDraft, type GameKind, type TeamOf } from '@/lib/games';
import { meFirst, useMe } from '@/lib/me';
import { usePickBus } from '@/store/pick';
import { newId, useStore, type EventRecord, type EventType, type SavedPlayer } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';

type Step = 'details' | 'players' | 'teams' | 'rounds' | 'matchups';
type Plan = { id: string; date?: string; draft: GameDraft | null };

const TYPES: { value: EventType; label: string; icon: string; blurb: string }[] = [
  { value: 'trip', label: 'Trip', icon: '✈︎', blurb: 'A few rounds over a few days. Standings from every match.' },
  { value: 'cup', label: 'Ryder Cup', icon: '🏆', blurb: 'Two teams play matches for points. Win 1, halve ½.' },
  { value: 'season', label: 'Season', icon: '📅', blurb: 'Regular rounds on a repeating schedule, with season standings.' },
];

/** A date you tap to change, with a calendar in a sheet. */
function DateField({ label, value, onChange, min }: { label: string; value: string; onChange: (d: string) => void; min?: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatDate(value)}`}
        style={({ pressed }) => ({ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: space.md, backgroundColor: c.card, opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>{label.toUpperCase()}</Text>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', marginTop: 2 }}>{formatDate(value, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <Calendar
          selected={value}
          initial={value}
          onSelect={(d) => {
            if (min && d < min) return;
            onChange(d);
            setOpen(false);
          }}
        />
        {min ? <Text style={{ color: c.muted, fontSize: 12, marginTop: space.sm }}>Can’t be before {formatDate(min)}.</Text> : null}
      </Sheet>
    </>
  );
}

export default function NewEvent() {
  const c = useColors();
  const saved = useStore((s) => s.players);
  const addEvent = useStore((s) => s.addEvent);
  const { me, isMe } = useMe();

  const [step, setStep] = useState<Step>('details');
  // Details
  const [type, setType] = useState<EventType>('trip');
  const [name, setName] = useState('');
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(addDays(today(), 2));
  const [rec, setRec] = useState<Recurrence>({ every: 'weekly', days: [], week: 1 });
  const [lock, setLock] = useState(true);
  // Players & teams
  const [ids, setIds] = useState<string[]>(me ? [me.id] : []);
  const [teamOf, setTeamOfState] = useState<TeamOf>({});
  const [letters, setLetters] = useState<string[]>(['A', 'B']);
  const [noTeams, setNoTeams] = useState(false);
  const [teamNames, setTeamNames] = useState({ A: 'Team A', B: 'Team B' });
  const [holder, setHolder] = useState<'none' | 'A' | 'B'>('none');
  // Rounds
  const [count, setCount] = useState(3);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState(0);

  const isSeason = type === 'season';
  const isCup = type === 'cup';
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
  const roundCount = isSeason ? seasonDates.length : count;
  useEffect(() => {
    setPlans((ps) =>
      Array.from({ length: roundCount }, (_, i) => {
        const date = isSeason ? seasonDates[i] : ps[i]?.date && eventDays.includes(ps[i].date!) ? ps[i].date : eventDays[Math.min(i, eventDays.length - 1)];
        return { id: ps[i]?.id ?? newId(), date, draft: ps[i]?.draft ?? null };
      }),
    );
    setCurrent((x) => Math.min(x, Math.max(0, roundCount - 1)));
  }, [roundCount, isSeason, seasonDates.join(','), eventDays.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ------------------------------------------------------------------ checks
  const detailsProblem = !name.trim()
    ? 'Give the event a name'
    : end < start
      ? 'The end date is before the start'
      : isSeason && rec.days.length === 0
        ? 'Pick the days rounds are played'
        : isSeason && seasonDates.length === 0
          ? 'No rounds fall between these dates'
          : null;
  const playersProblem = ids.length < 2 ? 'Add at least 2 players' : null;
  const roundsProblem = plans.some((p) => !p.draft) ? 'Choose a format for every round' : null;
  const matchupProblems = plans.map((p) => (p.draft ? draftProblem(p.draft, players) : 'Choose a format'));

  const canGo = (s: Step) =>
    s === 'details' ||
    (s === 'players' && !detailsProblem) ||
    (s === 'teams' && !detailsProblem && !playersProblem) ||
    (s === 'rounds' && !detailsProblem && !playersProblem && teamsDone) ||
    (s === 'matchups' && !detailsProblem && !playersProblem && teamsDone && !roundsProblem);

  const create = () => {
    if (!canGo('matchups') || matchupProblems.some((x) => x)) return;
    const chosen = saved.filter((p) => ids.includes(p.id));
    const teamIds = (L: string) => ids.filter((id) => teamOf[id] === L);
    const cupPoints = plans.reduce((s, p) => s + (p.draft && isMatchFormat(p.draft.kind) ? p.draft.matches.length : 0), 0);
    const e: EventRecord = {
      id: newId(),
      name: name.trim(),
      type,
      createdAt: Date.now(),
      playerIds: ids,
      lockHandicaps: lock,
      lockedIndexes: lockHandicaps(chosen),
      teams: isCup ? { A: { name: teamNames.A.trim() || 'Team A', playerIds: teamIds('A') }, B: { name: teamNames.B.trim() || 'Team B', playerIds: teamIds('B') } } : undefined,
      holder: isCup && holder !== 'none' ? holder : undefined,
      cupPoints: isCup ? cupPoints : undefined,
      points: { win: 1, halve: 0.5, loss: 0 },
      status: 'active',
      startDate: start,
      endDate: end,
      recurrence: isSeason ? rec : undefined,
      teamOf: teams ? Object.fromEntries(ids.map((id) => [id, teamOf[id]])) : undefined,
      teamLetters: teams ? letters : undefined,
      rounds: plans.map((p, i) => ({ id: p.id, number: i + 1, date: p.date, draft: p.draft ?? undefined })),
    };
    addEvent(e);
    router.replace(`/event/${e.id}`);
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

  const next = (to: Step, title: string, problem: string | null) => (
    <>
      {problem ? <Body style={{ color: c.danger, textAlign: 'center' }}>{problem}</Body> : null}
      <Button title={title} disabled={!!problem} onPress={() => setStep(to)} />
    </>
  );
  const plan = plans[current];

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
      {stepBar}

      {step === 'details' && (
        <>
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

          <Field label="Event name" value={name} onChangeText={setName} placeholder={isCup ? 'Palm Desert Cup 2027' : type === 'trip' ? 'Boys Trip 2027' : 'Tuesday Night League 2027'} />

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
                options={[{ value: 'weekly', label: 'Weekly' }, { value: 'biweekly', label: 'Every 2 weeks' }, { value: 'monthly', label: 'Monthly' }]}
                value={rec.every}
                onChange={(every) => setRec((r) => ({ ...r, every, days: every === 'monthly' ? r.days.slice(0, 1) : r.days }))}
              />
              {rec.every === 'monthly' && (
                <OptionRow label="Which week">
                  <Segmented
                    options={[{ value: '1', label: '1st' }, { value: '2', label: '2nd' }, { value: '3', label: '3rd' }, { value: '4', label: '4th' }, { value: '-1', label: 'Last' }]}
                    value={String(rec.week ?? 1)}
                    onChange={(w) => setRec((r) => ({ ...r, week: Number(w) }))}
                  />
                </OptionRow>
              )}
              <Label>{rec.every === 'monthly' ? 'On' : 'On these days'}</Label>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
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
              </View>
              {rec.days.length > 0 && (
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
          {next('players', 'Next: players', name ? detailsProblem : null)}
        </>
      )}

      {step === 'players' && (
        <>
          <View style={{ backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.md, borderLeftWidth: 3, borderLeftColor: c.accent }}>
            <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>
              Pick everyone playing in the event. If someone can’t make a round, you’ll be able to swap a sub in for that match when the round starts, without changing the event.
            </Text>
          </View>
          <PlayerPicker
            people={meFirst(saved, isMe)}
            selected={ids}
            onToggle={toggle}
            isMe={isMe}
            indexFor={(p) => p.handicapIndex}
            onFindNew={(q) => router.push({ pathname: '/add-friend', params: { pick: 'new-event', q } })}
          />
          {next('teams', 'Next: teams', playersProblem)}
        </>
      )}

      {step === 'teams' && (
        <>
          <TeamsStep
            players={players}
            teamOf={teamOf}
            onTeamOf={setTeamOf}
            letters={letters}
            onLetters={(l) => { setLetters(l); setPlans((ps) => rebuild(ps, teamOf)); }}
            maxTeams={isCup ? 2 : undefined}
            note={isCup ? 'A Ryder Cup has two teams.' : 'Teams stay the same for every round.'}
          />
          {isCup && (
            <Card>
              <H2>Team names</H2>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {(['A', 'B'] as const).map((t) => (
                  <View key={t} style={{ flex: 1 }}>
                    <Field label={`Team ${t}`} value={teamNames[t]} onChangeText={(v) => setTeamNames((n) => ({ ...n, [t]: v }))} />
                  </View>
                ))}
              </View>
              <OptionRow label="Defending champion (keeps the cup on a tie)">
                <Segmented options={[{ value: 'none', label: 'None' }, { value: 'A', label: teamNames.A || 'Team A' }, { value: 'B', label: teamNames.B || 'Team B' }]} value={holder} onChange={setHolder} />
              </OptionRow>
            </Card>
          )}
          <Button
            title={teamsDone && !noTeams ? 'Next: rounds' : `Put every player on a team (${ids.filter((id) => !assigned(id)).length} left)`}
            disabled={!(teamsSet(ids, assigned) && (!isCup || letters.every((L) => ids.some((id) => teamOf[id] === L))))}
            onPress={() => { setNoTeams(false); setStep('rounds'); }}
          />
          {!isCup && <Button title="No teams (individual standings)" kind="ghost" onPress={() => { setNoTeams(true); setStep('rounds'); }} />}
        </>
      )}

      {step === 'rounds' && (
        <>
          <Card>
            <H2>Rounds</H2>
            {isSeason ? (
              <Body muted>{describeRecurrence(rec)}: {plans.length} round{plans.length === 1 ? '' : 's'} from {formatDate(start)} to {formatDate(end)}.</Body>
            ) : (
              <OptionRow label="Number of rounds">
                <Stepper value={count} min={1} max={12} onChange={setCount} />
              </OptionRow>
            )}
            <Text style={{ color: c.muted, fontSize: 13 }}>Choose the format for each round. You’ll set the matchups next.</Text>
            {plans[0]?.draft && plans.length > 1 && (
              <Button
                small
                kind="secondary"
                title={`Use ${gameInfo(plans[0].draft.kind).name} for every round`}
                onPress={() => setPlans((ps) => ps.map((p, i) => (i === 0 ? p : { ...p, draft: newDraft(ps[0].draft!.kind, players, teams) })))}
              />
            )}
          </Card>

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
              <GamePicker
                value={p.draft?.kind ?? null}
                playerIds={ids}
                teamOf={teams}
                onPick={(k: GameKind) => setPlans((ps) => ps.map((x) => (x.id === p.id ? { ...x, draft: newDraft(k, players, teams) } : x)))}
              />
            </Card>
          ))}
          {next('matchups', 'Next: matchups', roundsProblem)}
        </>
      )}

      {step === 'matchups' && plan?.draft && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.sm }}>
            {plans.map((p, i) => {
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
                  <Text style={{ color: sel ? '#ffffffcc' : c.muted, fontSize: 11 }}>{p.draft ? gameInfo(p.draft.kind).name : ''}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View>
            <Text style={{ fontFamily: fonts.serif, fontSize: 22, fontWeight: '700', color: c.text }}>Round {current + 1} · {gameInfo(plan.draft.kind).name}</Text>
            {plan.date && <Text style={{ color: c.muted }}>{formatDate(plan.date, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>}
          </View>
          <GameRulesButton kind={plan.draft.kind} />
          <GameOptions
            draft={plan.draft}
            players={players}
            teamOf={teams}
            onChange={(d) => setPlans((ps) => ps.map((x) => (x.id === plan.id ? { ...x, draft: d } : x)))}
          />

          {matchupProblems[current] ? <Body style={{ color: c.danger, textAlign: 'center' }}>{matchupProblems[current]}</Body> : null}
          {current < plans.length - 1 ? (
            <Button title={`Next: Round ${current + 2}`} disabled={!!matchupProblems[current]} onPress={() => setCurrent(current + 1)} />
          ) : (
            <>
              {matchupProblems.some((x) => x) && (
                <Body muted style={{ textAlign: 'center' }}>
                  Finish the matchups for {matchupProblems.map((x, i) => (x ? `Round ${i + 1}` : null)).filter(Boolean).join(', ')} first.
                </Body>
              )}
              <Button title="Create event" disabled={matchupProblems.some((x) => x)} onPress={create} />
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
