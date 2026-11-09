/**
 * Team colours chosen in setup. Screens (and cards) showing a round or an event provide its picks;
 * everything inside asks useTeamColor() so teams look the same everywhere.
 */
import { createContext, useContext, type ReactNode } from 'react';

import type { EventRecord, RoundRecord } from '@/store/store';
import { useStore } from '@/store/store';
import { teamColor, type TeamPicks } from '@/theme';

const Picks = createContext<TeamPicks | undefined>(undefined);

export function TeamColors({ picks, children }: { picks?: TeamPicks; children: ReactNode }) {
  return <Picks.Provider value={picks}>{children}</Picks.Provider>;
}

/** Use in place of teamColor() inside a screen or card that provides picks. */
export function useTeamColor() {
  const picks = useContext(Picks);
  return (letter: string) => teamColor(letter, picks);
}

/** A round's colours: its own, else its event's. */
export function useRoundPicks(r: RoundRecord | undefined): TeamPicks | undefined {
  const ev = useStore((s) => s.events.find((e) => e.id === r?.eventId)?.teamColors);
  return r?.teamColors ?? ev;
}

export const eventPicks = (e: EventRecord | undefined) => e?.teamColors;
