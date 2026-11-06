import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { TabHeader } from '@/components/tab-header';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Body, Button, Card } from '@/components/ui';
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
            <Row title="Create account or sign in" sub="You’re using RallyCap as a guest" onPress={() => { useStore.getState().setOnboarded(false); router.replace('/welcome'); }} />
          )}
          <Row title="Friends" sub="Friend requests and your group's handicap indexes" href="/friends" />
          <Row title="Courses" sub={`${SEED_COURSES.length} courses · edit ratings, slopes, pars and hole handicaps`} href="/courses" />
        </Card>
        {signedIn && <Button title="Sign out" kind="danger" onPress={() => setAsking(true)} />}
        <Body muted style={{ textAlign: 'center' }}>RallyCap · preview build</Body>
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
