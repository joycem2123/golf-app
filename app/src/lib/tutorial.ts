import { useTutorialPlayer } from '@/components/tutorial-player';
import { track } from './usage';

/** Play the video tour full screen, inside the app. */
export function openTutorial(from: 'more' | 'welcome' = 'more') {
  track('tutorial_opened', { from });
  useTutorialPlayer.setState({ open: true });
}
