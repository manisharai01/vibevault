// ============================================================
// VibeVault – Marketplace / region constants
// ============================================================

import { ItemCategory, Platform, Region, StyleArchetype } from '../types';

export const PLATFORMS: Platform[] = [
  'Myntra',
  'Meesho',
  'Amazon',
  'Flipkart',
  'Depop',
  'Poshmark',
  'Vinted',
  'ThredUp',
  'Local Thrift',
];

export const REGIONS: Region[] = ['India', 'US', 'EU', 'Global'];

export const REGION_BY_PLATFORM: Record<Platform, Region> = {
  Myntra: 'India',
  Meesho: 'India',
  Amazon: 'India',
  Flipkart: 'India',
  Depop: 'Global',
  Poshmark: 'US',
  Vinted: 'EU',
  ThredUp: 'US',
  'Local Thrift': 'Global',
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
