// ============================================================
// VibeVault – Smart suggestions
// "Similar for less" for an item page: the same kind of piece in
// the same style or colours, for meaningfully less.
// ============================================================

import { FashionItem } from '../types';
import { FxRates } from '../utils/format';
import { priceIn } from './catalog';
import { colorFamilies } from './itemTraits';

/**
 * Cheaper alternatives to `anchor`: same category, wearable by the same department, sharing a
 * style or a colour family, and at least 5% cheaper once converted to the user's currency.
 */
export function similarForLess(anchor: FashionItem, items: FashionItem[], currency: string, rates: FxRates | null, limit = 6): FashionItem[] {
  const anchorPrice = priceIn(anchor, currency, rates);
  if (anchorPrice === null) return [];
  const anchorFamilies = new Set(colorFamilies(anchor));
  return items
    .filter((i) => i.available && i.id !== anchor.id && i.category === anchor.category)
    .filter((i) => i.department === anchor.department || i.department === 'unisex' || anchor.department === 'unisex')
    .map((item) => {
      const price = priceIn(item, currency, rates);
      const sharedStyles = item.styleArchetypes.filter((s) => anchor.styleArchetypes.includes(s)).length;
      const sharedColors = colorFamilies(item).filter((f) => anchorFamilies.has(f)).length;
      return { item, price, similarity: sharedStyles * 2 + sharedColors + item.matchScore / 50 };
    })
    .filter((c) => c.price !== null && c.price <= anchorPrice * 0.95 && c.similarity >= 1)
    .sort((a, b) => b.similarity - a.similarity || a.price! - b.price! || a.item.id.localeCompare(b.item.id))
    .slice(0, limit)
    .map((c) => c.item);
}
