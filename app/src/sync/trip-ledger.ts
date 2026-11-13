/**
 * Trip expenses on the server: every bill and settle-up payment of a trip, shared live with everyone in it.
 * A copy is kept on the phone so the tab opens straight away (and shows the last known state when offline);
 * changes go to the server straight away and everyone else's phones update live.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TripEntry } from '@golf/engine';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { useStore } from '@/store/store';
import { supabase } from '@/sync/supabase';
import { eventDoc, shareEvent } from '@/sync/sync';

/** An entry, plus who added it and who last changed it (account ids) and when. */
export type LedgerEntry = TripEntry & { addedBy?: string | null; changedBy?: string | null; changedAt?: string };

interface LedgerState {
  byEvent: Record<string, LedgerEntry[]>;
  /** Loaded from the server this session. */
  fresh: Record<string, boolean>;
}

export const useTripLedger = create<LedgerState>()(
  persist(() => ({ byEvent: {}, fresh: {} }), {
    name: 'golf-app:trip-ledger',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (s) => ({ byEvent: s.byEvent }),
  }),
);

const setEntries = (eventId: string, f: (xs: LedgerEntry[]) => LedgerEntry[]) =>
  useTripLedger.setState((s) => ({ byEvent: { ...s.byEvent, [eventId]: f(s.byEvent[eventId] ?? []) } }));

interface Row { id: string; kind: 'expense' | 'payment'; data: Record<string, unknown>; created_by: string | null; updated_by: string | null; updated_at: string }
const fromRow = (r: Row): LedgerEntry => ({ ...(r.data as object), id: r.id, kind: r.kind, addedBy: r.created_by, changedBy: r.updated_by, changedAt: r.updated_at } as LedgerEntry);

export async function loadLedger(eventId: string) {
  const { data, error } = await supabase.from('trip_ledger').select('id, kind, data, created_by, updated_by, updated_at').eq('event_id', eventId);
  if (error) return;
  setEntries(eventId, () => (data as Row[]).map(fromRow));
  useTripLedger.setState((s) => ({ fresh: { ...s.fresh, [eventId]: true } }));
}

/** Load a trip's expenses and keep them live while the screen is open. */
export function useLiveLedger(eventId: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    void loadLedger(eventId);
    const ch: RealtimeChannel = supabase
      .channel(`ledger:${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_ledger', filter: `event_id=eq.${eventId}` }, (p) => {
        if (p.eventType === 'DELETE') {
          const id = (p.old as { id?: string }).id;
          if (id) setEntries(eventId, (xs) => xs.filter((x) => x.id !== id));
          else void loadLedger(eventId);
        } else {
          const e = fromRow(p.new as Row);
          setEntries(eventId, (xs) => (xs.some((x) => x.id === e.id) ? xs.map((x) => (x.id === e.id ? e : x)) : [...xs, e]));
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [eventId, enabled]);
}

/** The trip must be online with expenses turned on before anything can be saved against it. */
async function ready(eventId: string) {
  const e = useStore.getState().events.find((x) => x.id === eventId);
  if (!e) throw new Error('This trip isn’t on this phone any more.');
  if (!e.remote) {
    await shareEvent(eventId);
    return;
  }
  if (e.remote.role !== 'viewer' && useStore.getState().dirtyEvents.includes(eventId)) {
    const { error } = await supabase.from('events').update({ data: eventDoc(e), updated_at: new Date().toISOString() }).eq('id', eventId);
    if (!error) useStore.getState().clearDirtyEvents([eventId]);
  }
}

function explain(msg: string): Error {
  if (/fetch|network|timeout/i.test(msg)) return new Error('You’re offline. Try again when you have signal.');
  if (/row-level security|violates|permission/i.test(msg)) return new Error('This couldn’t be saved. Trip expenses need the trip organiser to have Clutch Up Pro, and only players in the trip can add them.');
  return new Error(msg);
}

/** Add or change an expense or payment. Shows on this phone straight away; undone if the server says no. */
export async function saveEntry(eventId: string, entry: TripEntry) {
  const before = useTripLedger.getState().byEvent[eventId] ?? [];
  const me = useStore.getState().me;
  setEntries(eventId, (xs) => (xs.some((x) => x.id === entry.id) ? xs.map((x) => (x.id === entry.id ? { ...x, ...entry, changedBy: me } : x)) : [...xs, { ...entry, addedBy: me, changedBy: me }]));
  try {
    await ready(eventId);
    const { id, kind, ...data } = entry;
    const { error } = await supabase.from('trip_ledger').upsert({ id, event_id: eventId, kind, data });
    if (error) throw explain(error.message);
  } catch (err) {
    setEntries(eventId, () => before);
    throw err instanceof Error ? explain(err.message) : err;
  }
}

export async function removeEntry(eventId: string, id: string) {
  const before = useTripLedger.getState().byEvent[eventId] ?? [];
  setEntries(eventId, (xs) => xs.filter((x) => x.id !== id));
  const { error } = await supabase.from('trip_ledger').delete().eq('id', id);
  if (error) {
    setEntries(eventId, () => before);
    throw explain(error.message);
  }
}
