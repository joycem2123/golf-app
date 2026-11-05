import { Platform } from 'react-native';

/**
 * Classic clubhouse palette: bright ivory and white, deep green, muted gold.
 * The app is always light (see app.json "userInterfaceStyle").
 */
const palette = {
  bg: '#FAF8F2',
  card: '#FFFFFF',
  text: '#1B2A22',
  muted: '#6E746B',
  border: '#E3DDCF',
  primary: '#1F5A3D',
  onPrimary: '#FFFFFF',
  primarySoft: '#EDF2EC',
  accent: '#A8864D',
  danger: '#A6322B',
  chip: '#F4F1E9',
  /** Under par is red, as on a traditional leaderboard. */
  under: '#B3261E',
  over: '#1B2A22',
  teamA: '#1F5A3D',
  teamB: '#1F3A60',
  teamASoft: '#EEF4EF',
  teamBSoft: '#EEF2F8',
};

export type Colors = typeof palette;

export function useColors(): Colors {
  return palette;
}

export const fonts = {
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' }),
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 4, md: 8, lg: 10, pill: 999 } as const;
