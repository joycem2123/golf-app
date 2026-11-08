import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { eventStoryKey, refreshEventStory } from '@/lib/event-story';
import type { EventRecord, RoundRecord } from '@/store/store';
import { radius, space, useColors } from '@/theme';

/** "The story so far": an AI overview of every completed match in the event. */
export function EventStory({ e, rounds }: { e: EventRecord; rounds: RoundRecord[] }) {
  const c = useColors();
  const key = eventStoryKey(e, rounds);
  const [writing, setWriting] = useState(false);
  useEffect(() => {
    if (!key || e.story?.key === key) return;
    let alive = true;
    setWriting(true);
    void refreshEventStory(e, rounds).finally(() => alive && setWriting(false));
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!key) return null; // no completed matches yet
  if (!e.story && !writing) return null;
  const finished = e.status === 'complete';
  return (
    <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, borderLeftWidth: 4, borderLeftColor: c.brandGold, padding: space.lg, gap: 6 }}>
      <Text style={{ color: c.brandGold, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>✨ {finished ? 'THE STORY OF THE EVENT' : 'THE STORY SO FAR'}</Text>
      {e.story ? <Text style={{ color: c.text, fontSize: 15, lineHeight: 22 }}>{e.story.text}</Text> : null}
      {writing && <Text style={{ color: c.muted, fontSize: 13 }}>{e.story ? 'Updating with the latest results…' : 'Writing the story…'}</Text>}
    </View>
  );
}
