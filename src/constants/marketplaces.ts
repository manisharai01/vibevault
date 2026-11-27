// ============================================================
// VibeVault – Catalogue vocabulary (categories, styles, colours)
// Marketplaces, countries and prices come from the backend.
// ============================================================

import { ColorFamily, Department, FitPreference, ItemCategory, Occasion, ShopFor, StyleArchetype } from '../types';

export const CATEGORIES: ItemCategory[] = ['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes', 'Accessories', 'Bags'];

export const STYLE_ARCHETYPES: StyleArchetype[] = [
  'Minimalist',
  'Streetwear',
  'Bohemian',
  'Vintage',
  'Athleisure',
  'Preppy',
  'Grunge',
  'Cottagecore',
  'Dark Academia',
  'Y2K',
];

export const DEPARTMENT_LABELS: Record<Department, string> = { women: "Women's", men: "Men's", unisex: 'Unisex' };

export const SHOP_FOR_LABELS: Record<ShopFor, string> = { women: "Women's", men: "Men's", all: "Women's & men's" };

/** Whether a listing belongs to the sections the user shops. */
export function matchesShopFor(department: Department, shopFor: ShopFor | null): boolean {
  if (!shopFor || shopFor === 'all') return true;
  return department === shopFor || department === 'unisex';
}

export const COLOR_FAMILIES: ColorFamily[] = [
  'black',
  'white',
  'grey',
  'neutral',
  'brown',
  'navy',
  'blue',
  'green',
  'red',
  'pink',
  'purple',
  'yellow',
  'metallic',
];

export const COLOR_FAMILY_LABELS: Record<ColorFamily, string> = {
  black: 'Black',
  white: 'White',
  grey: 'Grey',
  neutral: 'Beige & cream',
  brown: 'Browns & tan',
  navy: 'Navy',
  blue: 'Blues',
  green: 'Greens',
  red: 'Reds',
  pink: 'Pinks',
  purple: 'Purples',
  yellow: 'Yellow & orange',
  metallic: 'Gold & silver',
};

/** Swatch shown for each colour family. */
export const COLOR_FAMILY_SWATCH: Record<ColorFamily, string> = {
  black: '#1C1C1C',
  white: '#F5F5F5',
  grey: '#7D7D7D',
  neutral: '#D8C3A0',
  brown: '#8B5A2B',
  navy: '#1F2A44',
  blue: '#3A6EA5',
  green: '#556B2F',
  red: '#C62828',
  pink: '#E8A0B4',
  purple: '#8E6BBF',
  yellow: '#E0B526',
  metallic: '#D4AF37',
};

/** Families that go with anything (the base of a palette). */
export const NEUTRAL_FAMILIES: ColorFamily[] = ['black', 'white', 'grey', 'neutral', 'brown', 'navy'];

export const OCCASION_LABELS: Record<Occasion, string> = {
  work: 'Work & office',
  everyday: 'Everyday & college',
  evening: 'Nights out & dates',
  festive: 'Festive & weddings',
  active: 'Gym & sport',
  outdoors: 'Travel & outdoors',
};

export const FIT_LABELS: Record<FitPreference, string> = {
  fitted: 'Fitted / slim',
  regular: 'Regular',
  relaxed: 'Relaxed',
  oversized: 'Oversized',
};
