// Test fixtures: catalogue rows / items shaped like real backend data.
// (This folder is excluded from jest's test match in package.json.)

import { CatalogRow, toFashionItem } from '../../services/catalog';
import { FashionItem, PricePoint } from '../../types';
import { addDays, toDateKey } from '../../utils/date';

export const NOW = new Date(2026, 10, 25, 10, 0);
export const TODAY = toDateKey(NOW);

/** ECB-style rates: units per euro. */
export const RATES = { EUR: 1, INR: 98.4, USD: 1.06, GBP: 0.84 };

/** One recorded price per day, the last one on `end`. */
export function dailyHistory(prices: number[], end: Date = NOW): PricePoint[] {
  return prices.map((price, i) => ({ date: toDateKey(addDays(end, i - prices.length + 1)), price }));
}

/** A prediction block as the catalog_items view returns it. */
export function predictionJson(price: number, pDrop14: number, extra: { pGone?: number; expectedLow?: number; madeOn?: string } = {}) {
  const verdict = pDrop14 >= 0.6 ? 'wait' : pDrop14 <= 0.3 ? 'buy' : 'unclear';
  const horizon = (p: number) => ({
    p_drop: p,
    p_gone: extra.pGone ?? 0.05,
    expected_low: extra.expectedLow ?? Math.round(price * (1 - p * 0.15) * 100) / 100,
    basis: 'category',
    basis_listings: 42,
    verdict: p >= 0.6 ? 'wait' : p <= 0.3 ? 'buy' : 'unclear',
  });
  return {
    made_on: extra.madeOn ?? TODAY,
    price,
    horizons: { '7': horizon(Math.max(0, pDrop14 - 0.1)), '14': { ...horizon(pDrop14), verdict }, '30': horizon(Math.min(1, pDrop14 + 0.1)) },
  };
}

export function makeRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  const nowIso = NOW.toISOString();
  return {
    id: 'flipkart:IN:SHTFX123',
    source: 'flipkart',
    source_name: 'Flipkart',
    site_name: 'Flipkart',
    market: 'IN',
    source_item_id: 'SHTFX123',
    title: 'Roadster Men Slim Fit Oxford Shirt',
    description: 'Cotton oxford shirt with a button-down collar.',
    brand: 'Roadster',
    image_url: 'https://rukminim1.flixcart.com/image/800/800/shirt.jpeg',
    product_url: 'https://dl.flipkart.com/dl/roadster-shirt/p/itm123?pid=SHTFX123',
    category: 'Tops',
    department: 'men',
    style_archetypes: ['Minimalist', 'Preppy'],
    condition: 'New with tags',
    size: 'M',
    colors: ['#F5F5F5'],
    seller: null,
    currency: 'INR',
    current_price: 649,
    original_price: 1299,
    available: true,
    listed_at: null,
    first_seen_at: nowIso,
    last_seen_at: nowIso,
    last_checked_at: nowIso,
    ended_on: null,
    end_reason: null,
    price_history: [{ date: TODAY, price: 649 }],
    stats: { days: 1, since: TODAY, lowest: 649, lowest_on: TODAY, highest: 649, median: 649 },
    prediction: null,
    ...overrides,
  };
}

export function makeEbayRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return makeRow({
    id: 'ebay:IN:v1|1234567890|0',
    source: 'ebay',
    source_name: 'eBay',
    site_name: 'eBay (ships to India)',
    source_item_id: 'v1|1234567890|0',
    title: "Levi's 501 Vintage Denim Jacket",
    description: null,
    brand: "Levi's",
    image_url: 'https://i.ebayimg.com/images/g/abc/s-l800.jpg',
    product_url: 'https://www.ebay.com/itm/1234567890',
    category: 'Outerwear',
    department: 'unisex',
    style_archetypes: ['Vintage', 'Streetwear'],
    condition: 'Good',
    size: 'L',
    colors: ['#3A6EA5'],
    seller: 'denimhunter',
    currency: 'USD',
    current_price: 42.5,
    original_price: null,
    price_history: [{ date: TODAY, price: 42.5 }],
    stats: { days: 1, since: TODAY, lowest: 42.5, lowest_on: TODAY, highest: 42.5, median: 42.5 },
    ...overrides,
  });
}

/** A validated FashionItem (throws if the row is rejected). */
export function makeItem(row: Partial<CatalogRow> = {}, extra: Partial<FashionItem> = {}): FashionItem {
  const item = toFashionItem(makeRow(row), NOW);
  if (!item) throw new Error('fixture row rejected');
  return { ...item, ...extra };
}

export function makeEbayItem(row: Partial<CatalogRow> = {}, extra: Partial<FashionItem> = {}): FashionItem {
  const item = toFashionItem(makeEbayRow(row), NOW);
  if (!item) throw new Error('fixture row rejected');
  return { ...item, ...extra };
}

let seq = 0;
/** A Flipkart listing with the given basics (id derived from the title). */
function piece(title: string, category: string, department: string, styles: string[], colors: string[], price: number, extra: Partial<CatalogRow> = {}): CatalogRow {
  const id = `P${(seq++).toString().padStart(3, '0')}`;
  return makeRow({
    id: `flipkart:IN:${id}`,
    source_item_id: id,
    title,
    description: null,
    category,
    department,
    style_archetypes: styles,
    colors,
    current_price: price,
    original_price: Math.round(price * 1.8),
    price_history: [{ date: TODAY, price }],
    stats: { days: 1, since: TODAY, lowest: price, lowest_on: TODAY, highest: price, median: price },
    ...extra,
  });
}

/**
 * A mixed catalogue for India: women's and men's pieces in every category and several
 * styles and colours, plus a pre-owned eBay jacket priced in dollars.
 */
export function sampleCatalogRows(): CatalogRow[] {
  seq = 0;
  return [
    piece('Women White Linen Shirt', 'Tops', 'women', ['Minimalist'], ['#F5F5F5'], 899),
    piece('Women Black Ribbed Turtleneck', 'Tops', 'women', ['Minimalist', 'Dark Academia'], ['#1C1C1C'], 749),
    piece('Women Pink Puff Sleeve Blouse', 'Tops', 'women', ['Cottagecore'], ['#E8A0B4'], 999),
    piece('Women Straight Leg Beige Trousers', 'Bottoms', 'women', ['Minimalist'], ['#D8C3A0'], 1299),
    piece('Women High Waist Black Jeans', 'Bottoms', 'women', ['Minimalist', 'Grunge'], ['#1C1C1C'], 1499),
    piece('Floral Tiered Maxi Dress', 'Dresses', 'women', ['Bohemian', 'Cottagecore'], ['#E8A0B4', '#556B2F'], 1199),
    piece('Black Slip Dress', 'Dresses', 'women', ['Minimalist'], ['#1C1C1C'], 1099),
    piece('Women White Leather Sneakers', 'Shoes', 'women', ['Minimalist'], ['#F5F5F5'], 1999),
    piece('Women Tan Loafers', 'Shoes', 'women', ['Preppy'], ['#C19A6B'], 1799),
    piece('Women Camel Wool Blazer', 'Outerwear', 'women', ['Dark Academia', 'Minimalist'], ['#C19A6B'], 2999),
    piece('Women Beige Tote Bag', 'Bags', 'women', ['Minimalist'], ['#D8C3A0'], 799),
    piece('Gold Hoop Earrings', 'Accessories', 'women', ['Y2K'], ['#D4AF37'], 399),
    piece('Men White Oxford Shirt', 'Tops', 'men', ['Minimalist', 'Preppy'], ['#F5F5F5'], 899),
    piece('Men Navy Polo Shirt', 'Tops', 'men', ['Preppy'], ['#1F2A44'], 699),
    piece('Men Oversized Graphic T-Shirt', 'Tops', 'men', ['Streetwear'], ['#1C1C1C'], 499),
    piece('Men Slim Beige Chinos', 'Bottoms', 'men', ['Minimalist', 'Preppy'], ['#D8C3A0'], 1199),
    piece('Men Olive Cargo Pants', 'Bottoms', 'men', ['Streetwear'], ['#556B2F'], 1399),
    piece('Men White Sneakers', 'Shoes', 'men', ['Minimalist'], ['#F5F5F5'], 1899),
    piece('Men Brown Leather Belt', 'Accessories', 'men', ['Vintage'], ['#6B4226'], 449),
    makeEbayRow(),
  ];
}

export function sampleCatalog(): FashionItem[] {
  return sampleCatalogRows()
    .map((row) => toFashionItem(row, NOW))
    .filter((item): item is FashionItem => item !== null);
}
