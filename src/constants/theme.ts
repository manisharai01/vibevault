// ============================================================
// VibeVault – Design tokens
// An editorial look: warm paper, white cards with hairlines, ink
// type, a serif for display (Instrument Serif) and a clean sans for
// everything else (Instrument Sans). Colour is reserved for meaning:
// green = buy now, amber = worth waiting, terracotta = offers.
// ============================================================

export const Palette = {
  paper: '#F5F2EC',
  paperDeep: '#ECE7DE',
  white: '#FFFFFF',
  ink: '#151412',
  inkSoft: '#34312C',
  stone: '#5E5950',
  mist: '#8F897E',
  hairline: '#E3DDD2',
  hairlineStrong: '#CFC7BA',
  buy: '#1F6B45',
  buyTint: '#E3EFE6',
  wait: '#9A5410',
  waitTint: '#F6EADB',
  offer: '#B4532A',
  offerTint: '#F6E5DC',
  danger: '#B42318',
  dangerTint: '#FBE8E6',
  info: '#2F4B7C',
  infoTint: '#E5EBF4',
  overlay: 'rgba(21, 20, 18, 0.55)',
  scrim: 'rgba(21, 20, 18, 0.35)',
};

/**
 * Semantic colours. The legacy names (primary, success, …) map onto the new palette so every
 * screen speaks the same visual language.
 */
export const Colors = {
  background: Palette.paper,
  backgroundDeep: Palette.paperDeep,
  surface: Palette.white,
  surfaceMuted: Palette.paperDeep,
  card: Palette.white,
  border: Palette.hairline,
  borderStrong: Palette.hairlineStrong,

  textPrimary: Palette.ink,
  textSecondary: Palette.stone,
  textMuted: Palette.mist,
  textInverse: Palette.white,

  ink: Palette.ink,
  inkSoft: Palette.inkSoft,
  primary: Palette.ink,
  primaryLight: Palette.ink,
  primaryDark: Palette.ink,
  surfaceLight: Palette.paperDeep,

  buy: Palette.buy,
  buyTint: Palette.buyTint,
  wait: Palette.wait,
  waitTint: Palette.waitTint,
  offer: Palette.offer,
  offerTint: Palette.offerTint,
  accent: Palette.offer,
  success: Palette.buy,
  warning: Palette.wait,
  error: Palette.danger,
  errorTint: Palette.dangerTint,
  info: Palette.info,
  infoTint: Palette.infoTint,
  ecoGreen: Palette.buy,

  overlay: Palette.overlay,
  scrim: Palette.scrim,
};

/** Font families (loaded in App.tsx). */
export const Fonts = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  regular: 'InstrumentSans_400Regular',
  medium: 'InstrumentSans_500Medium',
  semibold: 'InstrumentSans_600SemiBold',
  bold: 'InstrumentSans_700Bold',
};

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  xxxl: 34,
  hero: 44,
};

export const BorderRadius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 26,
  full: 9999,
};

/** Text styles: use these instead of ad-hoc font settings. */
export const Type = {
  hero: { fontFamily: Fonts.display, fontSize: FontSize.hero, lineHeight: 48, color: Palette.ink, letterSpacing: -0.5 },
  display: { fontFamily: Fonts.display, fontSize: FontSize.xxxl, lineHeight: 38, color: Palette.ink, letterSpacing: -0.3 },
  title: { fontFamily: Fonts.display, fontSize: FontSize.xxl, lineHeight: 30, color: Palette.ink },
  heading: { fontFamily: Fonts.semibold, fontSize: FontSize.lg, lineHeight: 22, color: Palette.ink },
  body: { fontFamily: Fonts.regular, fontSize: FontSize.md, lineHeight: 21, color: Palette.inkSoft },
  bodyStrong: { fontFamily: Fonts.semibold, fontSize: FontSize.md, lineHeight: 21, color: Palette.ink },
  small: { fontFamily: Fonts.regular, fontSize: FontSize.sm, lineHeight: 18, color: Palette.stone },
  smallStrong: { fontFamily: Fonts.semibold, fontSize: FontSize.sm, lineHeight: 18, color: Palette.ink },
  caption: { fontFamily: Fonts.medium, fontSize: FontSize.xs, lineHeight: 15, color: Palette.mist },
  eyebrow: { fontFamily: Fonts.semibold, fontSize: FontSize.xs, lineHeight: 14, color: Palette.stone, letterSpacing: 1.4, textTransform: 'uppercase' as const },
  price: { fontFamily: Fonts.display, fontSize: FontSize.xxl, lineHeight: 30, color: Palette.ink },
  priceSmall: { fontFamily: Fonts.semibold, fontSize: FontSize.md, lineHeight: 20, color: Palette.ink },
  button: { fontFamily: Fonts.semibold, fontSize: FontSize.md, lineHeight: 20 },
};

export const Shadows = {
  card: {
    shadowColor: '#2B2014',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 1,
  },
  floating: {
    shadowColor: '#2B2014',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 8,
  },
};

/** Muted swatches for style archetypes (dots and small accents only). */
export const STYLE_COLORS: Record<string, string> = {
  Minimalist: '#B8B2A7',
  Streetwear: '#C4553D',
  Bohemian: '#C07A3A',
  Vintage: '#9C7A52',
  Athleisure: '#3C8D86',
  Preppy: '#4F7A4A',
  Grunge: '#55524C',
  Cottagecore: '#8FA45B',
  'Dark Academia': '#6B4A3A',
  Y2K: '#C2578C',
};

/** Brand colour of each marketplace (by source id), shown as a small dot. */
export const PLATFORM_COLORS: Record<string, string> = {
  flipkart: '#2874F0',
  amazon: '#FF9900',
  ebay: '#E53238',
  etsy: '#F1641E',
  aliexpress: '#E62E04',
  google_shopping: '#4285F4',
  impact: '#FF5C35',
};

/** Text colour that stays readable on top of a colour. */
export function readableTextOn(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return Palette.white;
  const n = parseInt(match[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? Palette.ink : Palette.white;
}
