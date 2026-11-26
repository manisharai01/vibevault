// ============================================================
// VibeVault – Catalogue rows → app items
// Converts rows from the backend's `catalog_items` view into
// FashionItems, validating every field (bad rows are skipped).
// ============================================================

import { CATEGORIES, PLATFORM_BY_SOURCE, STYLE_ARCHETYPES } from '../constants/marketplaces';
import { FashionItem, ItemCategory, ItemCondition, ListingSource, PricePoint, Region, StyleArchetype } from '../types';
import { toDateKey } from '../utils/date';
import { formatInr } from '../utils/format';
import { predictFromHistory } from './priceEngine';
import { estimateSustainability } from './sustainability';

/** Row shape of the `catalog_items` view (supabase/migrations). */
export interface CatalogRow {
  id: string;
  source: string;
  source_item_id: string;
  title: string;
  description: string | null;
  brand: string | null;
  image_url: string | null;
  product_url: string;
  category: string;
  style_archetypes: string[] | null;
  condition: string;
  size: string | null;
  colors: string[] | null;
  seller: string | null;
  region: string;
  currency: string;
  current_price: number | string;
  original_price: number | string | null;
  available: boolean;
  listed_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_checked_at: string;
  inr_rate: number | string | null;
  price_history: { date: string; price: number | string }[] | null;
}

const CONDITIONS: ItemCondition[] = ['New with tags', 'Like new', 'Good', 'Fair', 'Well-loved'];
const SOURCES: ListingSource[] = ['flipkart', 'ebay'];
const REGIONS: Region[] = ['India', 'Global'];

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const isoDateKey = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; // plain date: keep as-is (no timezone shift)
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : toDateKey(d);
};
const httpsUrl = (v: unknown): string | null => {
  const s = str(v);
  return s && /^https:\/\//.test(s) ? s : null;
};

export function toFashionItem(row: CatalogRow): FashionItem | null {
  const source = row?.source as ListingSource;
  const category = row?.category as ItemCategory;
  const condition = row?.condition as ItemCondition;
  const region = row?.region as Region;
  const id = str(row?.id);
  const title = str(row?.title);
  const productUrl = httpsUrl(row?.product_url);
  const currentPrice = num(row?.current_price);
  const currency = str(row?.currency)?.toUpperCase() ?? null;
  const lastChecked = str(row?.last_checked_at);
  const firstSeen = isoDateKey(row?.first_seen_at);
  if (
    !id || !title || !productUrl || currentPrice === null || currentPrice <= 0 || !currency || !lastChecked || !firstSeen ||
    !SOURCES.includes(source) || !CATEGORIES.includes(category) || !CONDITIONS.includes(condition) || !REGIONS.includes(region)
  ) {
    return null;
  }

  const priceHistory: PricePoint[] = (Array.isArray(row.price_history) ? row.price_history : [])
    .map((p) => ({ date: str(p?.date) ?? '', price: num(p?.price) ?? Number.NaN }))
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.price) && p.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const originalPrice = num(row.original_price);
  const inrRate = num(row.inr_rate);
  const secondhand = source !== 'flipkart';
  const sustainability = estimateSustainability(category, condition, secondhand);

  return {
    id,
    source,
    platform: PLATFORM_BY_SOURCE[source],
    title,
    description: str(row.description),
    image: httpsUrl(row.image_url),
    category,
    styleArchetypes: (Array.isArray(row.style_archetypes) ? row.style_archetypes : []).filter((s): s is StyleArchetype =>
      (STYLE_ARCHETYPES as string[]).includes(s),
    ),
    brand: str(row.brand),
    condition,
    size: str(row.size),
    colors: (Array.isArray(row.colors) ? row.colors : []).filter((c) => /^#[0-9A-Fa-f]{6}$/.test(c)).slice(0, 4),
    seller: str(row.seller),
    region,
    productUrl,
    currency,
    currentPrice,
    originalPrice: originalPrice !== null && originalPrice > currentPrice ? originalPrice : null,
    inrRate: inrRate !== null && inrRate > 0 ? inrRate : null,
    priceHistory,
    predictedPrice7d: predictFromHistory(priceHistory, 7),
    predictedPrice30d: predictFromHistory(priceHistory, 30),
    secondhand,
    sustainabilityScore: sustainability.score,
    co2Saved: sustainability.co2SavedKg,
    matchScore: 0,
    available: row.available === true,
    listedDate: isoDateKey(row.listed_at),
    firstSeen,
    lastChecked,
  };
}

export function toFashionItems(rows: unknown): FashionItem[] {
  if (!Array.isArray(rows)) return [];
  const items: FashionItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const item = toFashionItem(row as CatalogRow);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }
  return items;
}

/** Price converted to rupees for comparisons and totals (null if the rate is unknown). */
export function priceInInr(item: Pick<FashionItem, 'currentPrice' | 'inrRate'>): number | null {
  return item.inrRate !== null ? item.currentPrice * item.inrRate : null;
}

export interface InrTotal {
  /** Sum in rupees of the items whose rate is known. */
  total: number;
  /** True when some amounts were converted from another currency (so the total is approximate). */
  approximate: boolean;
  /** Items left out because their exchange rate is unknown. */
  missing: number;
}

/** Total of several listings in rupees, converting foreign prices at the latest recorded rate. */
export function totalInInr(items: Pick<FashionItem, 'currentPrice' | 'inrRate' | 'currency'>[]): InrTotal {
  let total = 0;
  let approximate = false;
  let missing = 0;
  for (const item of items) {
    const inr = priceInInr(item);
    if (inr === null) {
      missing += 1;
      continue;
    }
    total += inr;
    if (item.currency !== 'INR') approximate = true;
  }
  return { total: Math.round(total), approximate, missing };
}

/** "₹4,520", "≈ ₹4,520" (converted), or "—" when nothing could be totalled. */
export function formatInrTotal({ total, approximate, missing }: InrTotal, count: number): string {
  if (count > 0 && missing === count) return '—';
  return `${approximate ? '≈ ' : ''}${formatInr(total)}`;
}
