import { ScrollView, View } from 'react-native';

import { FriendRequestsCard, FriendsList } from '@/components/people';
import { TabHeader } from '@/components/tab-header';
import { Label } from '@/components/ui';
import { useMe } from '@/lib/me';
import { space } from '@/theme';

export default function Friends() {
  const { friends } = useMe();
  return (
    <View style={{ flex: 1 }}>
      <TabHeader title="Friends" sub="The people you play with" />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
        <FriendRequestsCard />
        <Label>Friends · {friends.length}</Label>
        <FriendsList />
      </ScrollView>
    </View>
  );
}
