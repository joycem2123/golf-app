import { ScrollView } from 'react-native';

import { HeadToHeadView } from '@/components/head-to-head-view';
import { space } from '@/theme';

export default function HeadToHead() {
  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 60 }}>
      <HeadToHeadView />
    </ScrollView>
  );
}
