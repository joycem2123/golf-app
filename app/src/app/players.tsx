import { ScrollView } from 'react-native';

import { FriendsList, MeCard } from '@/components/people';
import { Label } from '@/components/ui';
import { space } from '@/theme';

export default function Players() {
  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
      <Label>Me</Label>
      <MeCard />
      <Label>Friends</Label>
      <FriendsList />
    </ScrollView>
  );
}
