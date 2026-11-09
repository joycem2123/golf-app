/**
 * Team colours chosen in setup. Screens (and cards) showing a round or an event provide its picks;
 * everything inside asks useTeamColor() so teams look the same everywhere.
 */
import { createContext, useContext, type ReactNode } from 'react';

import type { EventRecord, RoundRecord } from '@/store/store';
import { useStore } from '@/store/store';
import { teamColor, type TeamPicks } from '@/theme';

const Picks = createContext<TeamPicks | undefined>(undefined);
const Names = createContext<Record<string, string> | undefined>(undefined);

export function TeamColors({ picks, names, children }: { picks?: TeamPicks; names?: Record<string, string>; children: ReactNode }) {
  return <Picks.Provider value={picks}><Names.Provider value={names}>{children}</Names.Provider></Picks.Provider>;
}

/** Use in place of teamColor() inside a screen or card that provides picks. */
export function useTeamColor() {
  const picks = useContext(Picks);
  return (letter: string) => teamColor(letter, picks);
}

/** The team names provided by the screen (letter → name). */
export const useTeamNames = () => useContext(Names);

/** A team's name inside a screen or card that provides names ("Team A" by default). */
export function useTeamName() {
  const names = useContext(Names);
  return (letter: string) => teamName(letter, names);
}

/** A team's name: the one given to it, else "Team A". */
export const teamName = (letter: string, names?: Record<string, string>) => names?.[letter]?.trim() || `Team ${letter}`;

/** A round's team names: its own, else its event's (a Ryder Cup's are its two team names). */
export function namesFor(r?: { teamNames?: Record<string, string> }, e?: EventRecord): Record<string, string> | undefined {
  const fromCup = e?.teams ? { A: e.teams.A.name, B: e.teams.B.name } : undefined;
  if (!r?.teamNames && !e?.teamNames && !fromCup) return undefined;
  return { ...fromCup, ...e?.teamNames, ...r?.teamNames };
}

/** Swap "Team A" in text from the scoring engine for the team's own name. */
export const renameTeams = (text: string, names?: Record<string, string>) =>
  names ? text.replace(/\bTeam ([A-Z])\b/g, (m, L: string) => names[L]?.trim() || m) : text;

/** A round's colours: its own, else its event's. */
export function useRoundPicks(r: RoundRecord | undefined): TeamPicks | undefined {
  const ev = useStore((s) => s.events.find((e) => e.id === r?.eventId)?.teamColors);
  return r?.teamColors ?? ev;
}

export const eventPicks = (e: EventRecord | undefined) => e?.teamColors;
