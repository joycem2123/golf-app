/** Recently deleted rounds and events (kept 30 days on the server), and putting one back. */
import { useStore } from '@/store/store';
import { pullEvent, pullRound } from '@/sync/sync';
import { supabase } from '@/sync/supabase';

export interface DeletedItem {
  id: number;
  kind: 'round' | 'event';
  item_id: string;
  title: string;
  event_name: string | null;
  deleted_at: string;
  holes_scored: number | null;
  players: string | null;
}

export async function listDeleted(): Promise<DeletedItem[]> {
  const { data, error } = await supabase.rpc('my_deleted');
  if (error) throw new Error('Couldn’t load recently deleted items. Check your connection and try again.');
  return (data ?? []) as DeletedItem[];
}

/** Restore it on the server; it (and its event) then come back onto this phone. */
export async function restoreDeleted(item: DeletedItem) {
  const { data, error } = await supabase.rpc('restore_deleted', { item: item.id });
  if (error) throw new Error(/already back/.test(error.message) ? error.message : 'Couldn’t restore it. Try again.');
  const res = data as { kind: 'round' | 'event'; id: string; eventId?: string | null };
  const st = useStore.getState();
  st.undelete(res.id);
  if (res.eventId) st.undelete(res.eventId);
  // Restored on the server: bring it back onto this phone in the background (the next sync would too).
  void (async () => {
    if (res.kind === 'round') {
      await pullRound(res.id);
      if (res.eventId) await pullEvent(res.eventId);
    } else {
      await pullEvent(res.id);
    }
  })().catch(() => undefined);
}
