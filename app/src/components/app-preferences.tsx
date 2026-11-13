/** Account Settings → Preferences: switches that used to live in More. */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { resetTips } from '@/components/tip';
import { Card, H2, Toggle } from '@/components/ui';
import { liveActivitiesSupported, useLiveActivityPref } from '@/lib/live-activity';
import { setPreviewFree, usePro } from '@/lib/pro';
import { useUsageSharing } from '@/lib/usage';
import { space, useColors } from '@/theme';

export function AppPreferences() {
  const c = useColors();
  const [sharingUsage, setSharingUsage] = useUsageSharing();
  const [liveCard, setLiveCard] = useLiveActivityPref();
  const pro = usePro();
  const [tipsReset, setTipsReset] = useState(false);
  return (
    <Card>
      <H2>Preferences</H2>
      {liveActivitiesSupported() && <Toggle label="Live score on Lock Screen" hint="While you’re playing, your match shows on the Lock Screen and in the Dynamic Island." value={liveCard} onChange={setLiveCard} />}
      <Toggle label="Share anonymous usage data" hint="Which features get used, never your name, email or scores. Helps us decide what to improve." value={sharingUsage} onChange={setSharingUsage} />
      {!pro.paywall && <Toggle label="Preview as a free user (beta)" hint="See the app as someone without Clutch Up Pro would. Only on this phone; turn off to get everything back." value={pro.previewFree} onChange={setPreviewFree} />}
      <Pressable onPress={() => void resetTips().then(() => setTipsReset(true))} accessibilityRole="button"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, opacity: pressed ? 0.6 : 1 })}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, color: c.text, fontWeight: '600' }}>Show tips again</Text>
          <Text style={{ fontSize: 13, color: tipsReset ? c.primary : c.muted }}>{tipsReset ? 'Tips are back. You’ll see each one again the next time you open that screen.' : 'Bring back the one-time tips and the welcome video'}</Text>
        </View>
        <Text style={{ color: c.muted, fontSize: 20 }}>›</Text>
      </Pressable>
    </Card>
  );
}
