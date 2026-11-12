/** A titled list that shows its first few items with "Show more", and can be collapsed from its header. */
import { Children, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { space, useColors } from '@/theme';

export function ListSection({ title, count, children, collapsed = false, limit = 4, empty }: {
  title: string;
  count: number;
  children: ReactNode;
  /** Start folded away (just the header). */
  collapsed?: boolean;
  /** How many to show before "Show more". */
  limit?: number;
  /** Shown when there's nothing in the section. */
  empty?: string;
}) {
  const c = useColors();
  const [open, setOpen] = useState(!collapsed);
  const [all, setAll] = useState(false);
  const items = Children.toArray(children);
  const shown = all ? items : items.slice(0, limit);
  return (
    <View style={{ gap: space.sm }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${title}, ${count}`} hitSlop={6}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: pressed ? 0.6 : 1, marginTop: 4 })}>
        <Text style={{ color: c.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>{title}{count ? ` (${count})` : ''}</Text>
        <Text style={{ color: c.primary, fontSize: 13, fontWeight: '800' }}>{open ? 'Hide ▴' : 'Show ▾'}</Text>
      </Pressable>
      {open && (
        <>
          {shown}
          {count === 0 && empty ? <Text style={{ color: c.muted, fontSize: 13 }}>{empty}</Text> : null}
          {items.length > limit && (
            <Pressable onPress={() => setAll(!all)} accessibilityRole="button" hitSlop={6} style={({ pressed }) => ({ alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 14, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: c.primary, fontWeight: '800', fontSize: 13 }}>{all ? 'Show less ▴' : `Show ${items.length - limit} more ▾`}</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}
