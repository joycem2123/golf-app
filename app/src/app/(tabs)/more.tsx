import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { TabHeader } from '@/components/tab-header';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Body, Button, Card } from '@/components/ui';
import { usePro } from '@/lib/pro';
import { useAdmin } from '@/lib/admin';
import { openTutorial } from '@/lib/tutorial';
import { GUEST_KEY, switchAccount } from '@/store/accounts';
import { useStore } from '@/store/store';
import { signOut, useSession } from '@/sync/auth';
import { space, useColors } from '@/theme';

function Row({ title, href, onPress }: { title: string; href?: Href; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={() => (onPress ? onPress() : href && router.push(href))}>
      {({ pressed }) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 }}>
          <Text style={{ flex: 1, fontSize: 16, color: c.text, fontWeight: '600' }}>{title}</Text>
          <Text style={{ color: c.muted, fontSize: 20 }}>›</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function More() {
  const session = useSession();
  const [asking, setAsking] = useState(false);
  const pro = usePro();
  const team = useAdmin();
  const signedIn = !!session?.user && !session.user.is_anonymous;
  return (
    <View style={{ flex: 1 }}>
      <TabHeader title="More" />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }}>
        <Card style={{ paddingVertical: 0 }}>
          <Row title="Account Settings" href="/account" />
          <Row title="How Clutch Up Works" onPress={() => openTutorial()} />
          <Row title={pro.pro ? '★ Clutch Up Pro' : 'Upgrade To Clutch Up Pro'} onPress={() => router.push('/pro')} />
          <Row title="Recently Deleted" href="/recently-deleted" />
          {team.admin && <Row title={`Course Changes${team.open ? ` · ${team.open} To Review` : ''}`} href="/course-changes" />}
          <Row title="Contact Support" onPress={() => void Linking.openURL('mailto:support@clutchupgolf.com?subject=Clutch%20Up%20Golf%20support')} />
          <Row title="Privacy Policy & Terms" onPress={() => void Linking.openURL('https://clutchupgolf.com/privacy.html')} />
        </Card>
        {signedIn && <Button title="Sign Out" kind="danger" onPress={() => setAsking(true)} />}
        <Body muted style={{ textAlign: 'center' }}>Clutch Up · Preview Build</Body>
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
