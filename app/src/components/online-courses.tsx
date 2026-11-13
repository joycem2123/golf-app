/**
 * Under the course search: matching courses from the online course database that aren't in the app yet.
 * Tap one to bring it in (its tees, ratings and every hole) and use it.
 */
import type { Course } from '@golf/engine';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Star } from '@/components/star';
import { Label } from '@/components/ui';
import { importCatalogCourse, searchCatalog, type CatalogHit } from '@/lib/catalog';
import { fonts, radius, space, useColors } from '@/theme';

const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').replace(/\b(golf|country|club|and|the|g|cc|gc|course)\b/g, ' ').replace(/\s+/g, ' ').trim();

export function OnlineCourses({ query, have, onPick, onStar }: { query: string; have: Course[]; onPick: (c: Course) => void; /** Star: bring the course in and keep it in Favourites (without choosing it). */ onStar?: (c: Course) => void }) {
  const c = useColors();
  // Results (or the error) for the words they were searched for, so older ones never show for newer words.
  const [res, setRes] = useState<{ q: string; hits: CatalogHit[]; err: string | null } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [openErr, setOpenErr] = useState<string | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 3) return;
    let live = true;
    // Wait for a pause in typing, so each search goes out once.
    const t = setTimeout(async () => {
      try {
        const found = await searchCatalog(q);
        if (live) setRes({ q, hits: found, err: null });
      } catch (e) {
        if (live) setRes({ q, hits: [], err: e instanceof Error ? e.message : String(e) });
      }
    }, 600);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  const current = res && res.q === q ? res : null;
  const busy = !current;
  const hits = current?.hits ?? [];
  const err = openErr ?? current?.err ?? null;
  // Leave out courses already in the app (same id, or the same club and course name).
  const haveIds = new Set(have.map((x) => x.id));
  const haveNames = new Set(have.map((x) => norm(x.name)));
  const fresh = hits.filter((h) => !haveIds.has(h.id) && !haveNames.has(norm(h.name)));

  const open = async (h: CatalogHit, star = false) => {
    setOpening(h.id);
    setOpenErr(null);
    try {
      const co = await importCatalogCourse(h.id);
      if (star) onStar?.(co);
      else onPick(co);
    } catch (e) {
      setOpenErr(e instanceof Error ? e.message : String(e));
    } finally {
      setOpening(null);
    }
  };

  if (q.length < 3) return null;
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Label>More courses online</Label>
        {busy && <ActivityIndicator size="small" color={c.primary} />}
      </View>
      {err ? <Text style={{ color: c.danger, fontSize: 13 }}>{err}</Text> : null}
      {!busy && !err && fresh.length === 0 ? <Text style={{ color: c.muted, fontSize: 13 }}>No other matches online. Try the club’s name or city, or use Upload New Course.</Text> : null}
      {fresh.map((h) => (
        <Pressable key={h.id} onPress={() => void open(h)} disabled={!!opening} accessibilityRole="button" accessibilityLabel={`Add ${h.name}`}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, borderStyle: 'dashed', padding: space.md, opacity: pressed || (opening && opening !== h.id) ? 0.6 : 1 })}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontFamily: fonts.serif, fontWeight: '700', fontSize: 17 }}>{h.name}</Text>
            <Text style={{ color: c.muted, fontSize: 13 }}>{[h.city, h.region].filter(Boolean).join(', ')}</Text>
          </View>
          {opening === h.id ? <ActivityIndicator color={c.primary} /> : (
            <>
              <Text style={{ color: c.primary, fontWeight: '800', fontSize: 14 }}>＋ Add</Text>
              {onStar ? <Star on={false} onPress={() => void open(h, true)} label={`Add ${h.name} to favourites`} /> : null}
            </>
          )}
        </Pressable>
      ))}
    </View>
  );
}
