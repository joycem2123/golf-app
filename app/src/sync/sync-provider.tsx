import type { Session } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { autoLinkMyRounds } from '@/lib/me';
import { accountKey, checkLegacy, getAccountKey, switchAccount } from '@/store/accounts';
import { useStore } from '@/store/store';
import { restoreMe } from './auth';
import { pullFriends, watchFriends } from './friends';
import { supabase } from './supabase';
import { flush, resetSubscriptions, syncSubscriptions } from './sync';

/** Load the signed-in account's own data (or the phone's guest data), then start syncing it. */
async function loadAccountFor(session: Session | null) {
  const user = session?.user;
  const key = accountKey(user?.id, user?.is_anonymous ?? false);
  if (key !== getAccountKey() || !useStore.persist.hasHydrated()) {
    resetSubscriptions();
    await switchAccount(key);
  }
  const st = useStore.getState();
  st.setMe(user?.id ?? null);
  // Signed in with a real account: go straight to the app.
  if (user && !user.is_anonymous && !st.onboarded) st.setOnboarded(true);
  if (user) await restoreMe().catch(() => undefined);
  autoLinkMyRounds();
  watchFriends(user?.id ?? null);
  syncSubscriptions();
  void flush();
}

/** Runs in the background: keeps the right account loaded, live subscriptions open, and queued scores sent. */
export function SyncProvider() {
  useEffect(() => {
    let lastOutbox = 0;
    void checkLegacy();
    supabase.auth.getSession().then(({ data }) => loadAccountFor(data.session));
    const { data: auth } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return; // handled by getSession above
      if (event === 'TOKEN_REFRESHED') return;
      void loadAccountFor(session);
    });

    // Re-check subscriptions whenever rounds/events change; send new scores right away.
    const unsub = useStore.subscribe((s, prev) => {
      if (s.rounds !== prev.rounds || s.events !== prev.events) syncSubscriptions();
      if (s.myPlayerId !== prev.myPlayerId || s.rounds.length !== prev.rounds.length || (s.players !== prev.players && s.myPlayerId)) autoLinkMyRounds();
      if (s.outbox.length > lastOutbox || s.dirtyRounds.length > prev.dirtyRounds.length || s.dirtyEvents.length > prev.dirtyEvents.length) void flush();
      lastOutbox = s.outbox.length;
    });

    const timer = setInterval(() => void flush(), 10000);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void pullFriends().catch(() => undefined);
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
