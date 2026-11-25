// ============================================================
// VibeVault – Outfit composer
// Picks one item per outfit slot, preferring wishlist pieces and
// otherwise sampling from the best-ranked matches.
// ============================================================

import { FashionItem, ItemCategory } from '../types';
import { mulberry32 } from '../utils/random';

export type SlotKey = 'top' | 'bottom' | 'dress' | 'layer' | 'shoes' | 'extra';

export const SLOT_CATEGORIES: Record<SlotKey, ItemCategory[]> = {
  top: ['Tops'],
  bottom: ['Bottoms'],
  dress: ['Dresses'],
  layer: ['Outerwear'],
  shoes: ['Shoes'],
  extra: ['Accessories', 'Bags'],
};

export const SLOT_LABELS: Record<SlotKey, string> = {
  top: 'Top',
  bottom: 'Bottom',
  dress: 'Dress',
  layer: 'Layer',
  shoes: 'Shoes',
  extra: 'Accessory',
};

export interface LookSlot {
  key: SlotKey;
  item: FashionItem | null;
  fromWishlist: boolean;
}

/** How many of the top-ranked candidates a slot samples from. */
const SAMPLE_WINDOW = 4;

/**
 * Composes a look from `candidates` (assumed ranked best-first).
 * The base is either top + bottom or a dress; then a layer, shoes
 * and an accessory/bag. Deterministic for a given seed.
 */
export function composeLook(candidates: FashionItem[], wishlist: Set<string>, seed: number): LookSlot[] {
  const rand = mulberry32(seed);
  const pick = (pool: FashionItem[]): FashionItem | null =>
    pool.length === 0 ? null : pool[Math.floor(rand() * Math.min(pool.length, SAMPLE_WINDOW))];

  const pickSlot = (key: SlotKey): LookSlot => {
    const pool = candidates.filter((item) => SLOT_CATEGORIES[key].includes(item.category));
    const saved = pool.filter((item) => wishlist.has(item.id));
    const item = saved.length > 0 ? pick(saved) : pick(pool);
    return { key, item, fromWishlist: item !== null && wishlist.has(item.id) };
  };

  const top = pickSlot('top');
  const bottom = pickSlot('bottom');
  const dress = pickSlot('dress');
  const hasSeparates = top.item !== null && bottom.item !== null;
  const preferDress = dress.item !== null && (!hasSeparates || dress.fromWishlist || rand() < 0.3);
  const base = preferDress ? [dress] : [top, bottom];

  return [...base, pickSlot('layer'), pickSlot('shoes'), pickSlot('extra')];
}
