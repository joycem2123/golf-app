import { router, Stack, useLocalSearchParams } from 'expo-router';
import { AccountNeeded, useIsGuest } from '@/components/account-needed';
import { ScrollView } from 'react-native';

import { FriendSearch } from '@/components/friend-search';
import { usePickBus } from '@/store/pick';
import { space } from '@/theme';

/**
 * Full-screen friend search: the search bar sits at the top so the keyboard never covers it.
 * With ?pick=<target>, tapping Add hands the person back to the screen that opened this one.
 */
export default function AddFriendScreen() {
  // Guests can only follow: starting things needs an account.
  return useIsGuest() ? <AccountNeeded what="add friends" title="Add a Friend" /> : <AddFriend />;
}

function AddFriend() {
  const { pick, q } = useLocalSearchParams<{ pick?: string; q?: string }>();
  const push = usePickBus((s) => s.push);

  return (
    <>
      <Stack.Screen options={{ title: pick ? 'Add to the Group' : 'Add a Friend' }} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets>
        <FriendSearch
          initialQuery={q}
          asFriend={!pick}
          onClose={() => router.back()}
          onAdded={
            pick
              ? (p) => {
                  usePickBus.setState({ target: pick });
                  push(p);
                  router.back();
                }
              : undefined
          }
        />
      </ScrollView>
    </>
  );
}
