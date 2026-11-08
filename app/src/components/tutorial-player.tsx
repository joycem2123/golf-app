/**
 * The video tour, played full screen inside the app (no browser).
 * Open it from anywhere with openTutorial().
 */
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { space, useColors } from '@/theme';

export const TUTORIAL_VIDEO = 'https://clutchupgolf.com/tutorial.mp4';

export const useTutorialPlayer = create<{ open: boolean }>(() => ({ open: false }));

function Player({ onClose }: { onClose: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(TUTORIAL_VIDEO, (p) => {
    p.audioMixingMode = 'doNotMix'; // play the voice and music out loud
    p.play();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls fullscreenOptions={{ enable: false }} allowsPictureInPicture={false} />
      {status === 'loading' && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#ffffffaa', fontSize: 15 }}>Loading the tutorial…</Text>
        </View>
      )}
      {status === 'error' && (
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
          <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center' }}>Couldn’t load the video. Check your connection and try again.</Text>
        </View>
      )}
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close the tutorial"
        hitSlop={10}
        style={({ pressed }) => ({ position: 'absolute', top: insets.top + 8, right: 16, backgroundColor: c.brandGold, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ color: c.brand, fontWeight: '800', fontSize: 15 }}>Done</Text>
      </Pressable>
    </View>
  );
}

/** Mounted once, in the root layout. */
export function TutorialPlayer() {
  const open = useTutorialPlayer((s) => s.open);
  const close = () => useTutorialPlayer.setState({ open: false });
  return (
    <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={close} statusBarTranslucent>
      {open && <Player onClose={close} />}
    </Modal>
  );
}
