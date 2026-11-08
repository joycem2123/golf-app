import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { TabHeader } from '@/components/tab-header';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Body, Button, Card, Toggle } from '@/components/ui';
import { useUsageSharing } from '@/lib/usage';
import { openTutorial } from '@/lib/tutorial';
import { resetTips } from '@/components/tip';
import { GUEST_KEY, switchAccount } from '@/store/accounts';
import { useStore } from '@/store/store';
import { signOut, useSession } from '@/sync/auth';
import { SEED_COURSES } from '@golf/engine';
import { space, useColors } from '@/theme';

function Row({ title, sub, href, onPress }: { title: string; sub: string; href?: Href; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={() => (onPress ? onPress() : href && router.push(href))}>
      {({ pressed }) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: c.text, fontWeight: '600' }}>{title}</Text>
            <Text style={{ fontSize: 13, color: c.muted }}>{sub}</Text>
          </View>
          <Text style={{ color: c.muted, fontSize: 20 }}>›</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function More() {
  const session = useSession();
  const [asking, setAsking] = useState(false);
  const [sharingUsage, setSharingUsage] = useUsageSharing();
  const [tipsReset, setTipsReset] = useState(false);
  const c = useColors();
  const signedIn = !!session?.user && !session.user.is_anonymous;
  const email = session?.user?.email;
  return (
    <View style={{ flex: 1 }}>
      <TabHeader title="More" />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }}>
        <Card style={{ paddingVertical: 0 }}>
          {signedIn ? (
            <Row title="Account information" sub={email ? `${email} · change email or password` : 'Change email or password'} href="/account" />
          ) : (
            <Row title="Create account or sign in" sub="You’re using Clutch Up as a guest" onPress={() => { useStore.getState().setOnboarded(false); router.replace('/welcome'); }} />
          )}
          <Row title="How Clutch Up works" sub="A two-minute video tour of the app" onPress={() => openTutorial()} />
          <Row title="Friends" sub="Friend requests and your group's handicap indexes" href="/friends" />
          <Row title="Courses" sub={`${SEED_COURSES.length} courses · edit ratings, slopes, pars and hole handicaps`} href="/courses" />
          <Row title="Contact support" sub="support@clutchupgolf.com · questions, problems or ideas" onPress={() => void Linking.openURL('mailto:support@clutchupgolf.com?subject=Clutch%20Up%20Golf%20support')} />
          <Row title="Show tips again" sub="Bring back the one-time tips and the welcome video" onPress={() => void resetTips().then(() => setTipsReset(true))} />
          <Row title="Privacy policy & terms" sub="How your data is used" onPress={() => void Linking.openURL('https://clutchupgolf.com/privacy.html')} />
        </Card>
        {tipsReset && <Body style={{ color: c.primary, textAlign: 'center' }}>Tips are back. You’ll see each one again the next time you open that screen.</Body>}
        <Card>
          <Toggle label="Share anonymous usage data" hint="Which features get used, never your name, email or scores. Helps us decide what to improve." value={sharingUsage} onChange={setSharingUsage} />
        </Card>
        {signedIn && <Button title="Sign out" kind="danger" onPress={() => setAsking(true)} />}
        <Body muted style={{ textAlign: 'center' }}>Clutch Up · preview build</Body>
      </ScrollView>
      <ConfirmDialog
        visible={asking}
        title="Sign out?"
        message="Your rounds, events and friends stay saved to your account. Sign back in any time to pick up where you left off."
        cancelLabel="Cancel"
        confirmLabel="Sign out"
        onCancel={() => setAsking(false)}
        onConfirm={async () => {
          setAsking(false);
          await signOut();
          await switchAccount(GUEST_KEY);
          useStore.getState().setOnboarded(false);
          router.replace('/welcome');
        }}
      />
    </View>
  );
}
