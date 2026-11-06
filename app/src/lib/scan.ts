import type { Course, Tee } from '@golf/engine';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { ensureSession } from '@/sync/auth';
import { supabase } from '@/sync/supabase';

interface ScannedCard {
  courseName: string | null;
  city: string | null;
  region: string | null;
  notes: string;
  tees: { name: string; gender: 'M' | 'F'; courseRating: number | null; slope: number | null; holes: { number: number; par: number; strokeIndex: number; yards: number | null }[] }[];
}

/** Take a photo (or pick one) of a scorecard. Returns base64 JPEG, or null if cancelled. */
export async function pickScorecard(source: 'camera' | 'library'): Promise<string | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Clutch Up needs camera access to scan a scorecard. Turn it on in Settings, or choose a photo instead.');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets[0]) return null;
  // Big enough to read the small print, small enough to send quickly.
  const out = await manipulateAsync(res.assets[0].uri, [{ resize: { width: 2000 } }], { compress: 0.8, format: SaveFormat.JPEG, base64: true });
  return out.base64 ?? null;
}

/** Send the photo to be read; returns the course it describes (to check and save). */
export async function readScorecard(base64: string, hint: { id: string; name: string; city?: string; region?: string }): Promise<{ course: Course; notes: string }> {
  await ensureSession();
  const { data, error } = await supabase.functions.invoke('scan-scorecard', { body: { image: base64, mediaType: 'image/jpeg', hint: { name: hint.name, city: hint.city } } });
  if (error) {
    let msg = 'Couldn’t read the scorecard. Check your connection and try again.';
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) msg = body.error;
    } catch {
      /* keep the general message */
    }
    throw new Error(msg);
  }
  const card = data?.card as ScannedCard | undefined;
  if (!card?.tees?.length) throw new Error('No tees could be read from that photo. Try a clearer, straight-on photo of the whole card.');
  const used = new Set<string>();
  const tees: Tee[] = card.tees
    .filter((t) => t.holes.length > 0)
    .map((t) => {
      const holes = [...t.holes].sort((a, b) => a.number - b.number).map((h, i) => ({ number: i + 1, par: h.par, strokeIndex: h.strokeIndex, ...(h.yards ? { yards: h.yards } : {}) }));
      let id = `${hint.id}-${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${t.gender.toLowerCase()}`;
      while (used.has(id)) id += '-2';
      used.add(id);
      return { id, name: t.name, gender: t.gender, courseRating: t.courseRating ?? 0, slope: t.slope ?? 0, par: holes.reduce((s, h) => s + h.par, 0), holes };
    });
  return {
    course: { id: hint.id, name: hint.name || card.courseName || 'New course', city: hint.city || card.city || undefined, region: hint.region || card.region || undefined, country: 'CA', tees, source: 'scorecard photo' },
    notes: card.notes,
  };
}
