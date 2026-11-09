/**
 * New Round: pick up a setup you didn't finish, and favourite setups to play again
 * (with "Play now" to go straight to scoring).
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { newId, useStore, type RoundSetup } from '@/store/store';
import { radius, space, useColors } from '@/theme';
import { track } from '@/lib/usage';

/** Drafts older than this aren't offered. */
const DRAFT_DAYS = 14;

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

export function SetupSaved({ onResume, onPlay, onEdit, draftKey = 'round' }: {
  onResume: (data: unknown) => void;
  onPlay?: (s: RoundSetup) => void;
  onEdit?: (s: RoundSetup) => void;
  draftKey?: string;
}) {
  const c = useColors();
  // The draft as it was when the screen opened (what you're building now is saved over it as you go).
  const [draft, setDraft] = useState(() => {
    const d = useStore.getState().drafts[draftKey];
    return d && Date.now() - d.savedAt < DRAFT_DAYS * 86400000 ? d : null;
  });
  const favourites = useStore((s) => s.favourites);
  const removeFavourite = useStore((s) => s.removeFavourite);
  const saveDraft = useStore((s) => s.saveDraft);
  const showFavs = !!onPlay && favourites.length > 0;
  if (!draft && !showFavs) return null;

  return (
    <View style={{ gap: space.md }}>
      {draft && (
        <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 2, borderColor: c.accent, padding: space.lg, gap: space.sm }}>
          <Text style={{ color: c.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>PICK UP WHERE YOU LEFT OFF</Text>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{draft.summary || 'Your unfinished setup'}</Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>Saved {ago(draft.savedAt)}</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}><Button small title="Continue" onPress={() => { onResume(draft.data); setDraft(null); track('setup_resumed', { kind: draftKey }); }} /></View>
            <View style={{ flex: 1 }}><Button small kind="secondary" title="Discard" onPress={() => { saveDraft(draftKey, null); setDraft(null); }} /></View>
          </View>
        </View>
      )}
      {showFavs && (
        <View style={{ gap: space.sm }}>
          <Text style={{ color: c.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 }}>★ FAVOURITES</Text>
          {favourites.map((f) => (
            <View key={f.id} style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: space.md, gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{f.name}</Text>
                  <Text numberOfLines={2} style={{ color: c.muted, fontSize: 13 }}>{f.summary}</Text>
                </View>
                <Pressable onPress={() => removeFavourite(f.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${f.name} from favourites`}>
                  <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600' }}>Remove</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <View style={{ flex: 1 }}><Button small title="Play now ›" onPress={() => { track('favourite_played'); onPlay!(f.setup); }} /></View>
                <View style={{ flex: 1 }}><Button small kind="secondary" title="Change first" onPress={() => onEdit?.(f.setup)} /></View>
              </View>
            </View>
          ))}
          <Text style={{ color: c.muted, fontSize: 12 }}>Play now starts today’s round with the same course, players, tees, teams and games.</Text>
        </View>
      )}
    </View>
  );
}

/** "★ Save as favourite" on the last step. */
export function SaveFavourite({ setup, summary, suggested }: { setup: RoundSetup; summary: string; suggested: string }) {
  const c = useColors();
  const addFavourite = useStore((s) => s.addFavourite);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(suggested);
  const [saved, setSaved] = useState<string | null>(null);
  if (saved) {
    return <Text style={{ color: c.primary, fontWeight: '700', textAlign: 'center' }}>★ Saved to favourites as “{saved}”</Text>;
  }
  if (!open) return <Button kind="secondary" title="★ Save as favourite" onPress={() => { setName(suggested); setOpen(true); }} />;
  return (
    <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: space.md, gap: space.sm }}>
      <Field label="Favourite name" value={name} onChangeText={setName} placeholder="Saturday group" />
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Button small title="Save" disabled={!name.trim()} onPress={() => {
            addFavourite({ id: newId(), name: name.trim(), summary, setup, createdAt: Date.now() });
            track('favourite_saved');
            setSaved(name.trim());
          }} />
        </View>
        <View style={{ flex: 1 }}><Button small kind="secondary" title="Cancel" onPress={() => setOpen(false)} /></View>
      </View>
    </View>
  );
}
