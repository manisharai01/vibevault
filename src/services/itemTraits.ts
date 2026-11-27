// ============================================================
// VibeVault – What a listing is like, read from its own data
// Colour families, occasions, formality, fit and pattern are
// derived from the marketplace's title/description/category and
// the colour swatches the backend extracted. Used by the stylist.
// ============================================================

import { COLOR_FAMILY_SWATCH, NEUTRAL_FAMILIES } from '../constants/marketplaces';
import { ColorFamily, FashionItem, FitPreference, Occasion } from '../types';

/** Swatches the backend assigns (supabase/functions/_shared/normalize.ts) → colour family. */
const SWATCH_FAMILY: Record<string, ColorFamily> = {
  '#1C1C1C': 'black',
  '#F5F5F5': 'white',
  '#F3EAD3': 'neutral',
  '#D8C3A0': 'neutral',
  '#6B4226': 'brown',
  '#C19A6B': 'brown',
  '#7D7D7D': 'grey',
  '#1F2A44': 'navy',
  '#3A6EA5': 'blue',
  '#A7C7E7': 'blue',
  '#556B2F': 'green',
  '#C62828': 'red',
  '#6D1A36': 'red',
  '#E8A0B4': 'pink',
  '#8E6BBF': 'purple',
  '#E0B526': 'yellow',
  '#D9692B': 'yellow',
  '#D4AF37': 'metallic',
  '#C0C0C0': 'metallic',
};

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Colour family of a swatch (exact backend swatches, else the nearest family swatch). */
export function familyOf(hex: string): ColorFamily | null {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
  const exact = SWATCH_FAMILY[hex.toUpperCase()];
  if (exact) return exact;
  const [r, g, b] = rgb(hex);
  let best: { family: ColorFamily; d: number } | null = null;
  for (const [family, swatch] of Object.entries(COLOR_FAMILY_SWATCH) as [ColorFamily, string][]) {
    const [r2, g2, b2] = rgb(swatch);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (!best || d < best.d) best = { family, d };
  }
  return best?.family ?? null;
}

export function colorFamilies(item: Pick<FashionItem, 'colors'>): ColorFamily[] {
  return [...new Set(item.colors.map(familyOf).filter((f): f is ColorFamily => f !== null))];
}

export const isNeutral = (family: ColorFamily) => NEUTRAL_FAMILIES.includes(family);

const textOf = (item: Pick<FashionItem, 'title' | 'description'>) => `${item.title} ${item.description ?? ''}`.toLowerCase();

const OCCASION_WORDS: Record<Occasion, RegExp> = {
  work: /\b(blazer|trousers?|formal|office|work|oxford|loafers?|chinos?|pencil skirt|waistcoat|button[- ]down|tailored|pumps|suit)\b/,
  evening: /\b(party|sequin|satin|bodycon|cocktail|heels?|clutch|slip dress|velvet|going out|club|date night|evening|stiletto)\b/,
  festive: /\b(kurta|kurti|saree|sari|lehenga|sherwani|anarkali|ethnic|festive|wedding|nehru|dupatta|juttis?|mojaris?|embroidered|zari|bandhgala)\b/,
  active: /\b(running|gym|yoga|sports?|training|track|leggings|dri[- ]?fit|workout|athletic|joggers?|sweatpants|activewear)\b/,
  outdoors: /\b(hiking|trekking|waterproof|windbreaker|puffer|rain|travel|cargo|outdoor|parka|fleece|utility)\b/,
  everyday: /\b(t-?shirt|tee|jeans|sneakers?|hoodie|sweatshirt|casual|tote|denim|everyday|basic|shorts|cardigan)\b/,
};

/** Occasions the listing suits, from its own words (everyday when nothing more specific is named). */
export function occasionsOf(item: Pick<FashionItem, 'title' | 'description' | 'category' | 'styleArchetypes'>): Occasion[] {
  const text = textOf(item);
  const found = (Object.keys(OCCASION_WORDS) as Occasion[]).filter((o) => OCCASION_WORDS[o].test(text));
  if (item.styleArchetypes.includes('Athleisure') && !found.includes('active')) found.push('active');
  return found.length > 0 ? found : ['everyday'];
}

/** 1 athletic · 2 casual · 3 smart-casual · 4 formal. */
export function formalityOf(item: Pick<FashionItem, 'title' | 'description' | 'category' | 'styleArchetypes'>): 1 | 2 | 3 | 4 {
  const text = textOf(item);
  if (/\b(suit|tuxedo|gown|sherwani|lehenga|stiletto|cufflinks?|bow ?tie|formal)\b/.test(text)) return 4;
  if (/\b(running|gym|yoga|sports?|training|track|leggings|dri[- ]?fit|workout|athletic|joggers?|sweatpants|flip[- ]?flops?)\b/.test(text)) return 1;
  if (/\b(blazer|oxford|loafers?|chinos?|trousers?|blouse|shirt dress|pencil|waistcoat|brogues?|heels?|kurta|saree|sari|trench|button[- ]down|polo)\b/.test(text)) return 3;
  if (item.styleArchetypes.includes('Athleisure')) return 1;
  return 2;
}

/** Fit stated in the listing, if any. */
export function fitOf(item: Pick<FashionItem, 'title' | 'description'>): FitPreference | null {
  const text = textOf(item);
  if (/\b(oversized?|baggy|boxy)\b/.test(text)) return 'oversized';
  if (/\b(relaxed|loose|wide[- ]leg|flowy|straight[- ]leg)\b/.test(text)) return 'relaxed';
  if (/\b(slim|skinny|fitted|bodycon|tapered)\b/.test(text)) return 'fitted';
  if (/\bregular fit\b/.test(text)) return 'regular';
  return null;
}

/** True when the listing names a print or pattern (outfits keep to one patterned piece). */
export function isPatterned(item: Pick<FashionItem, 'title' | 'description'>): boolean {
  return /\b(floral|print(ed)?|stripe[sd]?|plaid|check(ed)?|gingham|paisley|polka|leopard|animal print|camo|tie[- ]dye|graphic|houndstooth|argyle)\b/.test(
    textOf(item),
  );
}
