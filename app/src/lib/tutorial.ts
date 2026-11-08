import { Linking } from 'react-native';

import { track } from './usage';

export const TUTORIAL_URL = 'https://clutchupgolf.com/tutorial.html';
export const TUTORIAL_POSTER = 'https://clutchupgolf.com/img/tutorial-poster.jpg';

/** The video tour, in an in-app browser (or Safari if this build doesn't have one). */
export async function openTutorial(from: 'more' | 'welcome' = 'more') {
  track('tutorial_opened', { from });
  try {
    const WebBrowser = await import('expo-web-browser');
    await WebBrowser.openBrowserAsync(TUTORIAL_URL);
  } catch {
    void Linking.openURL(TUTORIAL_URL);
  }
}
