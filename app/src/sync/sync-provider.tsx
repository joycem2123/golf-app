import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useStore } from '@/store/store';
import { supabase } from './supabase';
import { restoreMe } from './auth';
import { flush, resetSubscriptions, syncSubscriptions } from './sync';

/** Runs in the background: keeps live subscriptions open and sends queued scores. */
export function SyncProvider() {
  useEffect(() => {
    const st = useStore.getState();
    supabase.auth.getSession().then(({ data }) => {
      st.setMe(data.session?.user.id ?? null);
      void restoreMe().catch(() => undefined);
      syncSubscriptions();
      void flush();
    });
    const { data: auth } = supabase.auth.onAuthStateChange((event, session) => {
      useStore.getState().setMe(session?.user.id ?? null);
      if (event === 'SIGNED_OUT') resetSubscriptions();
      else {
        if (event === 'SIGNED_IN') void restoreMe().catch(() => undefined);
        syncSubscriptions();
      }
    });

    // Re-check subscriptions whenever rounds/events change; send new scores right away.
    let lastOutbox = st.outbox.length;
    const unsub = useStore.subscribe((s, prev) => {
      if (s.rounds !== prev.rounds || s.events !== prev.events) syncSubscriptions();
      if (s.outbox.length > lastOutbox || s.dirtyRounds.length > prev.dirtyRounds.length || s.dirtyEvents.length > prev.dirtyEvents.length) void flush();
      lastOutbox = s.outbox.length;
    });

    const timer = setInterval(() => void flush(), 10000);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        resetSubscriptions();
        syncSubscriptions();
        void flush();
      }
    });
    return () => {
      auth.subscription.unsubscribe();
      unsub();
      clearInterval(timer);
      app.remove();
    };
  }, []);
  return null;
}
