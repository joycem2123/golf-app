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
  /** Deep green from the brand logo (banners, welcome, splash). */
  brand: '#14352A',
  /** Gold from the brand logo. */
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
/** Colours a team can pick (Teams step). Each team gets a different one. */
export const TEAM_SWATCHES: { id: string; name: string; color: string; soft: string }[] = [
  { id: 'green', name: 'Green', color: palette.teamA, soft: palette.teamASoft },
  { id: 'navy', name: 'Navy', color: palette.teamB, soft: palette.teamBSoft },
  { id: 'red', name: 'Red', color: '#C0392B', soft: '#FBECEA' },
  { id: 'gold', name: 'Gold', color: '#B5831A', soft: '#F8F1E3' },
  { id: 'teal', name: 'Teal', color: '#00909C', soft: '#E6F4F5' },
  { id: 'purple', name: 'Purple', color: '#7354B8', soft: '#F1EDF8' },
  { id: 'orange', name: 'Orange', color: '#D35400', soft: '#FBEEE6' },
  { id: 'pink', name: 'Pink', color: '#C2407E', soft: '#F9ECF2' },
  { id: 'sky', name: 'Sky blue', color: '#2D8FD5', soft: '#E9F3FB' },
  { id: 'black', name: 'Black', color: '#2B2B2B', soft: '#EDEDED' },
];

/** Team letter → chosen swatch id (saved on a round or event). */
export type TeamPicks = Record<string, string>;

/** A team's colour: the one picked for it, else the default for its letter. */
export const teamColor = (letter: string, picks?: TeamPicks) => {
  const pick = picks?.[letter] ? TEAM_SWATCHES.find((x) => x.id === picks[letter]) : undefined;
  return pick ? { color: pick.color, soft: pick.soft } : (TEAM_COLORS[letter] ?? TEAM_COLORS.H);
};
export const TEAM_LETTERS = Object.keys(TEAM_COLORS);

export function useColors(): Colors {
  return palette;
}

export const fonts = {
  /** Clutch Up wordmark: Outfit, a clean geometric sans (loaded in the root layout). */
  brand: 'Outfit_700Bold',
  brandMedium: 'Outfit_600SemiBold',
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' }),
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 4, md: 8, lg: 10, pill: 999 } as const;
