// Test fixtures: catalogue rows / items shaped like real backend data.
// (This folder is excluded from jest's test match in package.json.)

import { CatalogRow, toFashionItem } from '../../services/catalog';
import { FashionItem, PricePoint } from '../../types';
import { addDays, toDateKey } from '../../utils/date';

export const NOW = new Date(2026, 10, 25, 10, 0);

/** One recorded price per day, the last one on `end`. */
export function dailyHistory(prices: number[], end: Date = NOW): PricePoint[] {
  return prices.map((price, i) => ({ date: toDateKey(addDays(end, i - prices.length + 1)), price }));
}

export function makeRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  const nowIso = NOW.toISOString();
  return {
    id: 'flipkart:SHTFX123',
    source: 'flipkart',
    source_item_id: 'SHTFX123',
    title: 'Roadster Men Slim Fit Oxford Shirt',
    description: 'Cotton oxford shirt with a button-down collar.',
    brand: 'Roadster',
    image_url: 'https://rukminim1.flixcart.com/image/800/800/shirt.jpeg',
    product_url: 'https://dl.flipkart.com/dl/roadster-shirt/p/itm123?pid=SHTFX123',
    category: 'Tops',
    style_archetypes: ['Minimalist', 'Preppy'],
    condition: 'New with tags',
    size: 'M',
    colors: ['#FFFFFF'],
    seller: null,
    region: 'India',
    currency: 'INR',
    current_price: 649,
    original_price: 1299,
    available: true,
    listed_at: null,
    first_seen_at: nowIso,
    last_seen_at: nowIso,
    last_checked_at: nowIso,
    inr_rate: 1,
    price_history: [{ date: toDateKey(NOW), price: 649 }],
    ...overrides,
  };
}

export function makeEbayRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return makeRow({
    id: 'ebay:v1|1234567890|0',
    source: 'ebay',
    source_item_id: 'v1|1234567890|0',
    title: "Levi's 501 Vintage Denim Jacket",
    description: null,
    brand: "Levi's",
    image_url: 'https://i.ebayimg.com/images/g/abc/s-l800.jpg',
    product_url: 'https://www.ebay.com/itm/1234567890',
    category: 'Outerwear',
    style_archetypes: ['Vintage', 'Streetwear'],
    condition: 'Good',
    size: 'L',
    colors: ['#3B5B92'],
    seller: 'denimhunter',
    region: 'Global',
    currency: 'USD',
    current_price: 42.5,
    original_price: null,
    inr_rate: 92.24,
    price_history: [{ date: toDateKey(NOW), price: 42.5 }],
    ...overrides,
  });
}

/** A validated FashionItem (throws if the row is rejected). */
export function makeItem(row: Partial<CatalogRow> = {}, extra: Partial<FashionItem> = {}): FashionItem {
  const item = toFashionItem(makeRow(row));
  if (!item) throw new Error('fixture row rejected');
  return { ...item, ...extra };
}

export function makeEbayItem(row: Partial<CatalogRow> = {}, extra: Partial<FashionItem> = {}): FashionItem {
  const item = toFashionItem(makeEbayRow(row));
  if (!item) throw new Error('fixture row rejected');
  return { ...item, ...extra };
}

/** A small mixed catalogue covering every category, both sources and several styles. */
export function sampleCatalogRows(): CatalogRow[] {
  return [
    makeRow(),
    makeRow({
      id: 'flipkart:JEAFX1',
      source_item_id: 'JEAFX1',
      title: 'Levis Women High Rise Wide Leg Jeans',
      brand: "Levi's",
      category: 'Bottoms',
      style_archetypes: ['Vintage', 'Minimalist'],
      current_price: 1799,
      original_price: 3599,
      price_history: [{ date: toDateKey(NOW), price: 1799 }],
    }),
    makeRow({
      id: 'flipkart:DRSFX1',
      source_item_id: 'DRSFX1',
      title: 'Floral Print Tiered Maxi Dress',
      brand: 'SASSAFRAS',
      category: 'Dresses',
      style_archetypes: ['Cottagecore', 'Bohemian'],
      current_price: 899,
      original_price: 2499,
      price_history: [{ date: toDateKey(NOW), price: 899 }],
    }),
    makeRow({
      id: 'flipkart:SHOFX1',
      source_item_id: 'SHOFX1',
      title: 'Chunky Platform Sneakers',
      brand: 'Bacca Bucci',
      category: 'Shoes',
      style_archetypes: ['Y2K', 'Streetwear'],
      current_price: 1499,
      original_price: 2999,
      price_history: [{ date: toDateKey(NOW), price: 1499 }],
    }),
    makeRow({
      id: 'flipkart:BAGFX1',
      source_item_id: 'BAGFX1',
      title: 'Leather Satchel Bag',
      brand: 'Hidesign',
      category: 'Bags',
      style_archetypes: ['Dark Academia', 'Preppy'],
      current_price: 3499,
      original_price: 5999,
      price_history: [{ date: toDateKey(NOW), price: 3499 }],
    }),
    makeEbayRow(),
    makeEbayRow({
      id: 'ebay:v1|222|0',
      source_item_id: 'v1|222|0',
      title: 'Vintage Silver Chain Necklace',
      brand: null,
      category: 'Accessories',
      style_archetypes: ['Grunge', 'Y2K'],
      condition: 'Like new',
      current_price: 18,
      price_history: [{ date: toDateKey(NOW), price: 18 }],
    }),
    makeEbayRow({
      id: 'ebay:v1|333|0',
      source_item_id: 'v1|333|0',
      title: 'Nike Tech Fleece Hoodie',
      brand: 'Nike',
      category: 'Tops',
      style_archetypes: ['Athleisure', 'Streetwear'],
      condition: 'Like new',
      current_price: 55,
      price_history: [{ date: toDateKey(NOW), price: 55 }],
    }),
  ];
}

export function sampleCatalog(): FashionItem[] {
  return sampleCatalogRows().map((row) => {
    const item = toFashionItem(row);
    if (!item) throw new Error(`fixture row rejected: ${row.id}`);
    return item;
  });
}
