import { useEffect, useRef, useState } from 'react';

import { justPaywalled } from '@/lib/pro';
import { Pressable, Text, View } from 'react-native';

import { eventStoryKey, refreshEventStory } from '@/lib/event-story';
import type { EventRecord, RoundRecord } from '@/store/store';
import { radius, space, useColors } from '@/theme';

/**
 * "The story so far": an AI overview of every completed match in the event. Written only when someone taps
 * Generate story (it costs a little each time), and can be rewritten once there are new results.
 */
export function EventStory({ e, rounds, autoWrite }: { e: EventRecord; rounds: RoundRecord[]; /** Write it straight away if it's missing or out of date (right after completing the event). */ autoWrite?: boolean }) {
  const c = useColors();
  const key = eventStoryKey(e, rounds);
  const [writing, setWriting] = useState(false);
  const [failed, setFailed] = useState(false);
  const autoDone = useRef(false);
  useEffect(() => {
    if (!autoWrite || autoDone.current || !key || e.remote?.role === 'viewer' || e.story?.key === key) return;
    autoDone.current = true;
    void (async () => {
      setWriting(true);
      const text = await refreshEventStory(e, rounds);
      setWriting(false);
      if (!text && !justPaywalled()) setFailed(true);
    })();
  }, [autoWrite, key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!key) return null; // no completed matches yet
  const canWrite = e.remote?.role !== 'viewer';
  const stale = !!e.story && e.story.key !== key; // results have come in since it was written
  if (!e.story && !canWrite) return null;
  const finished = e.status === 'complete';

  const generate = async () => {
    setWriting(true);
    setFailed(false);
    const text = await refreshEventStory(e, rounds);
    setWriting(false);
    if (!text && !justPaywalled()) setFailed(true);
  };

  return (
    <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, borderLeftWidth: 4, borderLeftColor: c.brandGold, padding: space.lg, gap: 8 }}>
      <Text style={{ color: c.brandGold, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>✨ {finished ? 'THE STORY OF THE EVENT' : 'THE STORY SO FAR'}</Text>
      {e.story ? (
        <Text style={{ color: c.text, fontSize: 15, lineHeight: 22 }}>{e.story.text}</Text>
      ) : (
        <Text style={{ color: c.muted, fontSize: 14 }}>Get an AI write-up of the event so far: the standings, the big swings and the standout players.</Text>
      )}
      {canWrite && (!e.story || stale) && (
        <Pressable onPress={generate} disabled={writing} accessibilityRole="button"
          style={({ pressed }) => ({ alignSelf: 'flex-start', backgroundColor: c.brand, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16, opacity: pressed || writing ? 0.6 : 1 })}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{writing ? 'Writing the story…' : stale ? '✨ Regenerate with the latest results' : '✨ Generate story'}</Text>
        </Pressable>
      )}
      {stale && !writing && <Text style={{ color: c.muted, fontSize: 12 }}>New results since this was written.</Text>}
      {failed && <Text style={{ color: c.danger, fontSize: 12 }}>Couldn’t write it just now. Check your connection and try again.</Text>}
    </View>
  );
}
