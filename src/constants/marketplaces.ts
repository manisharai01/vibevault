// ============================================================
// VibeVault – Marketplace / region constants
// ============================================================

import { ItemCategory, ListingSource, Platform, Region, StyleArchetype } from '../types';

/** Marketplaces with live prices. */
export const PLATFORMS: Platform[] = ['Flipkart', 'eBay'];

export const PLATFORM_BY_SOURCE: Record<ListingSource, Platform> = {
  flipkart: 'Flipkart',
  ebay: 'eBay',
};

export const REGIONS: Region[] = ['India', 'Global'];

export const REGION_LABELS: Record<Region, string> = {
  India: 'India',
  Global: 'Ships to India',
};

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

/** Stores without a public price API: offered as "search there" links only. */
export type ExternalStore = 'Myntra' | 'Meesho' | 'Amazon' | 'Ajio' | 'Depop' | 'Vinted' | 'Poshmark' | 'ThredUp';

export const EXTERNAL_STORES: ExternalStore[] = ['Myntra', 'Meesho', 'Amazon', 'Ajio', 'Depop', 'Vinted', 'Poshmark', 'ThredUp'];
