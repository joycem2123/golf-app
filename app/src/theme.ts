import { useColorScheme } from 'react-native';

const light = {
  bg: '#F3F5F4',
  card: '#FFFFFF',
  text: '#0E1A14',
  muted: '#5B6B63',
  border: '#DDE3E0',
  primary: '#0B6E4F',
  onPrimary: '#FFFFFF',
  primarySoft: '#E3F0EA',
  accent: '#B8922F',
  danger: '#C0392B',
  chip: '#EBF0ED',
  win: '#0B6E4F',
  lose: '#C0392B',
};

const dark: typeof light = {
  bg: '#0A100D',
  card: '#141C18',
  text: '#EAF2ED',
  muted: '#9AABA2',
  border: '#25322C',
  primary: '#36B486',
  onPrimary: '#03110B',
  primarySoft: '#173328',
  accent: '#D9B65E',
  danger: '#E5675B',
  chip: '#1C2722',
  win: '#36B486',
  lose: '#E5675B',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
