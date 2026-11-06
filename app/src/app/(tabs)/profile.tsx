import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { FriendsList, MeCard, StatTiles } from '@/components/people';
import { TabHeader } from '@/components/tab-header';
import { Body, Button, Card, H2, Label } from '@/components/ui';
import { useMe } from '@/lib/me';
import { playerStats } from '@/lib/player-stats';
import { signOut, useSession } from '@/sync/auth';
import { GUEST_KEY, switchAccount } from '@/store/accounts';
import { useStore } from '@/store/store';
import { space } from '@/theme';

export default function Profile() {
  const session = useSession();
  const rounds = useStore((s) => s.rounds);
  const meAliases = useStore((s) => s.meAliases);
  const setOnboarded = useStore((s) => s.setOnboarded);
  const { me, friends } = useMe();

  const user = session?.user;
  const guest = !user || user.is_anonymous;
  const stats = me ? playerStats(rounds, [me.id, ...meAliases]) : null;

  return (
    <View style={{ flex: 1 }}>
      <TabHeader title={me?.name ?? 'Profile'} sub={guest ? 'Playing as a guest' : user?.email} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
        <Label>Me</Label>
        <MeCard />
        {stats && (
          <StatTiles
            items={[
              ['Rounds', stats.rounds],
              ['Average', stats.average ?? '–'],
              ['Best', stats.best ?? '–'],
            ]}
          />
        )}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm }}>
          <Label>Friends · {friends.length}</Label>
        </View>
        <FriendsList />

        {guest ? (
          <Card>
            <H2>Save your history</H2>
            <Body muted>Create an account so you, your friends and your records follow you to any phone.</Body>
            <Button title="Create account or sign in" onPress={() => { setOnboarded(false); router.replace('/welcome'); }} />
          </Card>
        ) : (
          <Button
            title="Sign out"
            kind="ghost"
            onPress={async () => {
              await signOut();
              await switchAccount(GUEST_KEY);
              useStore.getState().setOnboarded(false);
              router.replace('/welcome');
            }}
          />
        )}
      </ScrollView>
    </View>
  );
}
