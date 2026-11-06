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
  /** Deep green from the RIVL logo (banners, welcome, splash). */
  brand: '#14352A',
  /** Gold from the RIVL logo. */
  brandGold: '#B48954',
  primary: '#1F5A3D',
  onPrimary: '#FFFFFF',
  primarySoft: '#EDF2EC',
  accent: '#A8864D',
  danger: '#A6322B',
  chip: '#F4F1E9',
  /** Under par is red, as on a traditional leaderboard. */
  under: '#B3261E',
  over: '#1B2A22',
  // Team colors: validated as a categorical set (colorblind-safe neighbours, readable on white).
  teamA: '#2E7D4F',
  teamB: '#3366B0',
  teamASoft: '#ECF5EF',
  teamBSoft: '#EDF2FA',
};

export type Colors = typeof palette;

/** Team colors by letter (Team A, B, C…). A and B match the app's team green and navy. */
const TEAM_COLORS: Record<string, { color: string; soft: string }> = {
  A: { color: palette.teamA, soft: palette.teamASoft },
  B: { color: palette.teamB, soft: palette.teamBSoft },
  C: { color: '#B5831A', soft: '#F8F1E3' },
  D: { color: '#B03E52', soft: '#F8ECEE' },
  E: { color: '#00909C', soft: '#E6F4F5' },
  F: { color: '#7354B8', soft: '#F1EDF8' },
  G: { color: '#C2602E', soft: '#F9EEE8' },
  H: { color: '#A8418F', soft: '#F7ECF4' },
};
export const teamColor = (letter: string) => TEAM_COLORS[letter] ?? TEAM_COLORS.H;
export const TEAM_LETTERS = Object.keys(TEAM_COLORS);

export function useColors(): Colors {
  return palette;
}

export const fonts = {
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' }),
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 4, md: 8, lg: 10, pill: 999 } as const;
