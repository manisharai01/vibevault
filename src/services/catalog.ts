// ============================================================
// VibeVault – Catalogue rows → app items
// Converts rows from the backend's `catalog_items` view into
// FashionItems, validating every field (bad rows are skipped),
// and converts prices between currencies with the ECB rates.
// ============================================================

import { CATEGORIES, STYLE_ARCHETYPES } from '../constants/marketplaces';
import {
  Department,
  FashionItem,
  HorizonPrediction,
  ItemCategory,
  ItemCondition,
  Prediction,
  PredictionBasis,
  PredictionHorizon,
  PriceStats,
  PricePoint,
  StyleArchetype,
  Verdict,
} from '../types';
import { toDateKey } from '../utils/date';
import { convertAmount, formatMoneyWhole, FxRates } from '../utils/format';

/** Row shape of the `catalog_items` view (supabase/migrations). */
export interface CatalogRow {
  id: string;
  source: string;
  source_name: string;
  source_kind?: string;
  site_name: string;
  market: string;
  source_item_id: string;
  title: string;
  description: string | null;
  brand: string | null;
  image_url: string | null;
  product_url: string;
  category: string;
  department: string;
  style_archetypes: string[] | null;
  condition: string;
  size: string | null;
  colors: string[] | null;
  seller: string | null;
  currency: string;
  current_price: number | string;
  original_price: number | string | null;
  available: boolean;
  listed_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_checked_at: string;
  ended_on?: string | null;
  end_reason?: string | null;
  price_history: { date: string; price: number | string }[] | null;
  stats?: { days?: unknown; since?: unknown; lowest?: unknown; lowest_on?: unknown; highest?: unknown; median?: unknown } | null;
  prediction?: { made_on?: unknown; price?: unknown; horizons?: Record<string, Record<string, unknown>> } | null;
}

export const LISTING_ID_PATTERN = /^[a-z][a-z0-9_]{1,30}:[A-Z]{2}:\S{1,160}$/;

const CONDITIONS: ItemCondition[] = ['New with tags', 'Like new', 'Good', 'Fair', 'Well-loved', 'Pre-owned'];
const DEPARTMENTS: Department[] = ['women', 'men', 'unisex'];
const HORIZONS: PredictionHorizon[] = [7, 14, 30];
const BASES: PredictionBasis[] = ['listing', 'category', 'marketplace', 'situation', 'all'];
const VERDICTS: Verdict[] = ['wait', 'buy', 'unclear'];
/** A prediction older than this (days) is no longer shown. */
export const PREDICTION_MAX_AGE_DAYS = 3;
/** A prediction made for a price this different from today's is no longer shown. */
const PREDICTION_PRICE_TOLERANCE = 0.005;

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const dateKey = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; // plain date: keep as-is (no timezone shift)
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : toDateKey(d);
};
const httpsUrl = (v: unknown): string | null => {
  const s = str(v);
  return s && /^https:\/\//.test(s) ? s : null;
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

function parseStats(raw: CatalogRow['stats']): PriceStats | null {
  const days = num(raw?.days);
  const lowest = num(raw?.lowest);
  const highest = num(raw?.highest);
  const median = num(raw?.median);
  const since = dateKey(raw?.since);
  const lowestOn = dateKey(raw?.lowest_on);
  if (!days || days < 1 || lowest === null || highest === null || median === null || !since || !lowestOn || lowest <= 0) return null;
  return { days, since, lowest, lowestOn, highest, median: Math.round(median * 100) / 100 };
}

function parseHorizon(raw: Record<string, unknown> | undefined): HorizonPrediction | null {
  if (!raw) return null;
  const pDrop = num(raw.p_drop);
  const pGone = num(raw.p_gone);
  const expectedLow = num(raw.expected_low);
  const basisListings = num(raw.basis_listings);
  const basis = raw.basis as PredictionBasis;
  const verdict = raw.verdict as Verdict;
  if (pDrop === null || pDrop < 0 || pDrop > 1 || pGone === null || pGone < 0 || pGone > 1) return null;
  if (expectedLow === null || expectedLow <= 0 || basisListings === null || basisListings < 0) return null;
  if (!BASES.includes(basis) || !VERDICTS.includes(verdict)) return null;
  return { pDrop, pGone, expectedLow, basis, basisListings: Math.round(basisListings), verdict };
}

/**
 * The model's latest prediction for the listing, or null when there is none, it is older than
 * PREDICTION_MAX_AGE_DAYS, or it was made for a different price than today's.
 */
export function parsePrediction(raw: CatalogRow['prediction'], currentPrice: number, today: string): Prediction | null {
  const madeOn = dateKey(raw?.made_on);
  const price = num(raw?.price);
  if (!raw || !madeOn || price === null || price <= 0) return null;
  if (daysBetween(madeOn, today) > PREDICTION_MAX_AGE_DAYS) return null;
  if (Math.abs(price - currentPrice) / currentPrice > PREDICTION_PRICE_TOLERANCE) return null;
  const horizons: Prediction['horizons'] = {};
  for (const h of HORIZONS) {
    const parsed = parseHorizon(raw.horizons?.[String(h)]);
    if (parsed) horizons[h] = parsed;
  }
  return Object.keys(horizons).length > 0 ? { madeOn, price, horizons } : null;
}

export function toFashionItem(row: CatalogRow, now: Date = new Date()): FashionItem | null {
  const category = row?.category as ItemCategory;
  const condition = row?.condition as ItemCondition;
  const department = row?.department as Department;
  const id = str(row?.id);
  const source = str(row?.source);
  const market = str(row?.market);
  const title = str(row?.title);
  const productUrl = httpsUrl(row?.product_url);
  const currentPrice = num(row?.current_price);
  const currency = str(row?.currency)?.toUpperCase() ?? null;
  const lastChecked = str(row?.last_checked_at);
  const firstSeen = dateKey(row?.first_seen_at);
  if (
    !id || !LISTING_ID_PATTERN.test(id) || !source || !market || !/^[A-Z]{2}$/.test(market) || !title || !productUrl ||
    currentPrice === null || currentPrice <= 0 || !currency || !/^[A-Z]{3}$/.test(currency) || !lastChecked || !firstSeen ||
    !CATEGORIES.includes(category) || !CONDITIONS.includes(condition) || !DEPARTMENTS.includes(department)
  ) {
    return null;
  }

  const priceHistory: PricePoint[] = (Array.isArray(row.price_history) ? row.price_history : [])
    .map((p) => ({ date: str(p?.date) ?? '', price: num(p?.price) ?? Number.NaN }))
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.price) && p.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const originalPrice = num(row.original_price);
  const secondhand = condition !== 'New with tags';
  const platform = str(row.source_name) ?? source;
  const endReason = row.end_reason === 'gone' || row.end_reason === 'stale' ? row.end_reason : null;

  return {
    id,
    source,
    platform,
    siteName: str(row.site_name) ?? platform,
    market,
    title,
    description: str(row.description),
    image: httpsUrl(row.image_url),
    category,
    department,
    styleArchetypes: (Array.isArray(row.style_archetypes) ? row.style_archetypes : []).filter((s): s is StyleArchetype =>
      (STYLE_ARCHETYPES as string[]).includes(s),
    ),
    brand: str(row.brand),
    condition,
    size: str(row.size),
    colors: (Array.isArray(row.colors) ? row.colors : []).filter((c) => /^#[0-9A-Fa-f]{6}$/.test(c)).slice(0, 4),
    seller: str(row.seller),
    productUrl,
    currency,
    currentPrice,
    originalPrice: originalPrice !== null && originalPrice > currentPrice ? originalPrice : null,
    priceHistory,
    stats: parseStats(row.stats),
    prediction: row.available === true ? parsePrediction(row.prediction, currentPrice, toDateKey(now)) : null,
    secondhand,
    matchScore: 0,
    matchReasons: [],
    available: row.available === true,
    endReason,
    listedDate: dateKey(row.listed_at),
    firstSeen,
    lastChecked,
  };
}

export function toFashionItems(rows: unknown, now: Date = new Date()): FashionItem[] {
  if (!Array.isArray(rows)) return [];
  const items: FashionItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const item = toFashionItem(row as CatalogRow, now);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }
  return items;
}

// ---- Currency conversion ----

/** The listing's price in `currency` (null when an exchange rate is unknown). */
export function priceIn(item: Pick<FashionItem, 'currentPrice' | 'currency'>, currency: string, rates: FxRates | null): number | null {
  return convertAmount(item.currentPrice, item.currency, currency, rates);
}

export interface MoneyTotal {
  /** Sum in the target currency of the items that could be converted. */
  total: number;
  currency: string;
  /** True when some amounts were converted from another currency (so the total is approximate). */
  approximate: boolean;
  /** Items left out because their exchange rate is unknown. */
  missing: number;
}

/** Total of several listings in `currency`, converting foreign prices at the latest ECB rates. */
export function totalIn(items: Pick<FashionItem, 'currentPrice' | 'currency'>[], currency: string, rates: FxRates | null): MoneyTotal {
  let total = 0;
  let approximate = false;
  let missing = 0;
  for (const item of items) {
    const converted = priceIn(item, currency, rates);
    if (converted === null) {
      missing += 1;
      continue;
    }
    total += converted;
    if (item.currency !== currency) approximate = true;
  }
  return { total, currency, approximate, missing };
}

/** "₹4,520", "≈ ₹4,520" (converted), or "—" when nothing could be totalled. */
export function formatTotal({ total, currency, approximate, missing }: MoneyTotal, count: number): string {
  if (count > 0 && missing === count) return '—';
  return `${approximate ? '≈ ' : ''}${formatMoneyWhole(total, currency)}`;
}
