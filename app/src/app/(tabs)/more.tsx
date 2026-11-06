import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { TabHeader } from '@/components/tab-header';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Body, Button, Card, Label } from '@/components/ui';
import { GUEST_KEY, switchAccount } from '@/store/accounts';
import { useStore } from '@/store/store';
import { signOut, useSession } from '@/sync/auth';
import { SEED_COURSES } from '@golf/engine';
import { space, useColors } from '@/theme';

function Row({ title, sub, href }: { title: string; sub: string; href: Href }) {
  const c = useColors();
  return (
    <Pressable onPress={() => router.push(href)}>
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
          <Row title="Friends" sub="Friend requests and your group's handicap indexes" href="/friends" />
          <Row title="New event" sub="Trip, Ryder Cup or season" href="/new-event" />
          <Row title="Join with code" sub="Follow a leaderboard or keep score" href="/join" />
          <Row title="Head to head" sub="Records between any two players" href="/head-to-head" />
        </Card>
        <Label>Courses</Label>
        <Card style={{ paddingVertical: 0 }}>
          <Row title="Courses" sub={`${SEED_COURSES.length} courses · edit ratings, slopes, pars and hole handicaps`} href="/courses" />
        </Card>
        {signedIn ? (
          <>
            <Label>Account</Label>
            <Card>
              {email ? <Body muted>Signed in as {email}</Body> : null}
              <Button title="Sign out" kind="danger" onPress={() => setAsking(true)} />
            </Card>
          </>
        ) : (
          <>
            <Label>Account</Label>
            <Card>
              <Body muted>You’re using RIVL as a guest.</Body>
              <Button title="Create account or sign in" onPress={() => { useStore.getState().setOnboarded(false); router.replace('/welcome'); }} />
            </Card>
          </>
        )}
        <Body muted style={{ textAlign: 'center' }}>RIVL · preview build</Body>
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
