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
  textMuted: '#666690',

  // Sustainability
  ecoGreen: '#00B894',
  ecoLight: '#55EFC4',

  // Gradients
  gradientPrimary: ['#6C5CE7', '#A29BFE'] as const,
  gradientAccent: ['#FD79A8', '#FDCB6E'] as const,
  gradientDark: ['#0F0F1A', '#1A1A2E'] as const,
  gradientEco: ['#00B894', '#55EFC4'] as const,
};

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

export const LEVEL_THRESHOLDS = [
  0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500, 7500, 10000,
];

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

export const PLATFORM_COLORS: Record<string, string> = {
  Depop: '#FF2300',
  Poshmark: '#7B2E8D',
  Vinted: '#09B1BA',
  ThredUp: '#3D9B35',
  'Local Thrift': '#FF9F43',
  Myntra: '#FF3F6C',
  Meesho: '#6E38E0',
  Amazon: '#FF9900',
  Flipkart: '#2874F0',
};
