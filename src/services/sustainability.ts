// ============================================================
// VibeVault – Sustainability estimates
//
// Marketplaces don't publish footprints, so the app estimates the
// emissions avoided by buying pre-owned instead of new from typical
// per-garment production footprints. These are rough averages shown
// to users as estimates ("est."), not measurements.
// ============================================================

import { ItemCategory, ItemCondition } from '../types';

/** Approximate kg CO₂e to produce one new item in each category. */
export const NEW_ITEM_FOOTPRINT_KG: Record<ItemCategory, number> = {
  Tops: 7,
  Bottoms: 20,
  Dresses: 15,
  Outerwear: 25,
  Shoes: 14,
  Accessories: 3,
  Bags: 10,
};

export const WATER_LITERS_PER_KG_CO2 = 180;
export const CO2_KG_PER_TREE_YEAR = 21;

const PRE_OWNED_SCORE: Record<ItemCondition, number> = {
  'New with tags': 80, // resold, never worn: still avoids new production
  'Like new': 88,
  Good: 92,
  Fair: 94,
  'Well-loved': 95,
};
const NEW_RETAIL_SCORE = 30;

export interface SustainabilityEstimate {
  /** 0–100: higher for pre-owned and longer-lived items. */
  score: number;
  /** kg CO₂e avoided versus buying the item new (0 for new retail). */
  co2SavedKg: number;
}

export function estimateSustainability(category: ItemCategory, condition: ItemCondition, secondhand: boolean): SustainabilityEstimate {
  if (!secondhand) return { score: NEW_RETAIL_SCORE, co2SavedKg: 0 };
  return { score: PRE_OWNED_SCORE[condition], co2SavedKg: NEW_ITEM_FOOTPRINT_KG[category] };
}
