import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { HeadToHeadView } from '@/components/head-to-head-view';
import { FriendRequestsCard, FriendsList } from '@/components/people';
import { TabHeader } from '@/components/tab-header';
import { Label, Segmented } from '@/components/ui';
import { useMe } from '@/lib/me';
import { space } from '@/theme';

export default function Friends() {
  const { friends } = useMe();
  const [tab, setTab] = useState<'list' | 'h2h'>('list');
  return (
    <View style={{ flex: 1 }}>
      <TabHeader title="Friends" sub="The people you play with" />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
        <Segmented options={[{ value: 'list', label: 'Friends List' }, { value: 'h2h', label: 'Head to Head' }]} value={tab} onChange={setTab} />
        {tab === 'list' ? (
          <>
            <FriendRequestsCard />
            <Label>Friends · {friends.length}</Label>
            <FriendsList />
          </>
        ) : (
          <HeadToHeadView />
        )}
      </ScrollView>
    </View>
  );
}
