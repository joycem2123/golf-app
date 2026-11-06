import { create } from 'zustand';

import type { SavedPlayer } from './store';

/** Hands a friend picked on the Add Friend screen back to the screen that opened it. */
export const usePickBus = create<{ target: string | null; picked: SavedPlayer[]; push: (p: SavedPlayer) => void; take: (target: string) => SavedPlayer[] }>(
  (set, get) => ({
    target: null,
    picked: [],
    push: (p) => set((s) => ({ picked: s.picked.some((x) => x.id === p.id) ? s.picked : [...s.picked, p] })),
    take: (target) => {
      if (get().target !== target) return [];
      const out = get().picked;
      set({ picked: [], target: null });
      return out;
    },
  }),
);
