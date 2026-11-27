// ============================================================
// VibeVault – Design Tokens & Theme Constants
// ============================================================

export const Colors = {
  // Primary palette
  primary: '#6C5CE7',
  primaryLight: '#A29BFE',
  primaryDark: '#4A3DB8',

  // Secondary / accent
  accent: '#FD79A8',
  accentLight: '#FDCB6E',
  accentDark: '#E84393',

  // Semantic
  success: '#00B894',
  warning: '#FDCB6E',
  error: '#FF7675',
  info: '#74B9FF',

  // Neutrals
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceLight: '#25253D',
  card: '#222240',
  border: '#333360',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0C0',
  textMuted: '#8A8AB0',

  // Sustainability
  ecoGreen: '#00B894',
  ecoLight: '#55EFC4',

  // Gradients
  gradientPrimary: ['#6C5CE7', '#A29BFE'] as const,
  gradientAccent: ['#FD79A8', '#FDCB6E'] as const,
  gradientDark: ['#0F0F1A', '#1A1A2E'] as const,
  gradientEco: ['#00B894', '#55EFC4'] as const,
};

/** Gradient tuple accepted by expo-linear-gradient. */
export type GradientColors = readonly [string, string, ...string[]];

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const FontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  hero: 40,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  button: {
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
};

export const STYLE_COLORS: Record<string, string> = {
  Minimalist: '#DCDDE1',
  Streetwear: '#FF6B6B',
  Bohemian: '#F0932B',
  Vintage: '#C8A97E',
  Athleisure: '#00CEC9',
  Preppy: '#6AB04C',
  Grunge: '#535C68',
  Cottagecore: '#BADC58',
  'Dark Academia': '#6D4C41',
  Y2K: '#FF79C6',
};

/** Brand colour of each marketplace (by source id), for the small platform tags. */
export const PLATFORM_COLORS: Record<string, string> = {
  flipkart: '#2874F0',
  amazon: '#FF9900',
  ebay: '#E53238',
  etsy: '#F1641E',
  aliexpress: '#E62E04',
  google_shopping: '#4285F4',
};

/** Text colour that stays readable on top of a style/platform colour chip. */
export function readableTextOn(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return '#FFFFFF';
  const n = parseInt(match[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#1A1A2E' : '#FFFFFF';
}
