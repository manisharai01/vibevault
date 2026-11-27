// ============================================================
// VibeVault – Backend API client (Supabase REST + Edge Functions)
// Read-only: listings, price history, exchange rates, coupons,
// the prediction model's track record and refresh status, plus a
// live price check of one listing.
// ============================================================

import type { BackendConfig } from '../config';
import type { CalibrationBucket, MarketplaceStatus, Offer, PredictionHorizon, PricePoint, TrackRecord } from '../types';
import type { FxRates } from '../utils/format';
import { LISTING_ID_PATTERN, type CatalogRow } from './catalog';

export class CatalogError extends Error {
  readonly kind: 'network' | 'http';
  readonly status?: number;

  constructor(message: string, kind: 'network' | 'http', status?: number) {
    super(message);
    this.name = 'CatalogError';
    this.kind = kind;
    this.status = status;
  }
}

export const CATALOG_LIMIT = 800;
const TIMEOUT_MS = 20000;

function headers(config: BackendConfig): Record<string, string> {
  const h: Record<string, string> = { apikey: config.anonKey, Accept: 'application/json' };
  // Legacy anon keys are JWTs; new publishable keys (sb_publishable_…) only go in `apikey`.
  if (config.anonKey.startsWith('eyJ')) h.Authorization = `Bearer ${config.anonKey}`;
  return h;
}

async function request<T>(url: string, init: RequestInit, label: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new CatalogError(`${label}: couldn't reach the VibeVault server.`, 'network');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new CatalogError(`${label} failed (HTTP ${response.status}).`, 'http', response.status);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new CatalogError(`${label}: unexpected response from the server.`, 'http', response.status);
  }
}

const get = <T>(config: BackendConfig, path: string, label: string) => request<T>(`${config.url}/rest/v1/${path}`, { headers: headers(config) }, label);

/** Quotes values for a PostgREST in.(…) filter. */
function inList(values: string[]): string {
  return `(${values.map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`;
}

const rowsOf = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * Available listings offered to shoppers in `market` (all markets when null), plus any extra ids
 * the user cares about (wishlist, alerts) even if they are no longer available.
 */
export async function fetchCatalogRows(config: BackendConfig, market: string | null, extraIds: string[] = []): Promise<CatalogRow[]> {
  const ids = [...new Set(extraIds)].filter((id) => LISTING_ID_PATTERN.test(id)).slice(0, 200);
  const live = market && /^[A-Z]{2}$/.test(market) ? `and(available.is.true,market.eq.${market})` : 'available.is.true';
  const filter = ids.length > 0 ? `or=${encodeURIComponent(`(${live},id.in.${inList(ids)})`)}` : `or=${encodeURIComponent(`(${live})`)}`;
  const rows = await get<unknown>(config, `catalog_items?select=*&${filter}&order=first_seen_at.desc&limit=${CATALOG_LIMIT}`, 'Loading listings');
  return rowsOf<CatalogRow>(rows);
}

/** Every recorded (and archived) daily price of one listing, oldest first. */
export async function fetchPriceHistory(config: BackendConfig, id: string): Promise<PricePoint[]> {
  if (!LISTING_ID_PATTERN.test(id)) return [];
  const rows = await get<unknown>(
    config,
    `price_points?select=observed_on,price&listing_id=eq.${encodeURIComponent(id)}&order=observed_on.asc&limit=2000`,
    'Loading price history',
  );
  return rowsOf<{ observed_on: string; price: number | string }>(rows)
    .map((r) => ({ date: r.observed_on, price: num(r.price) ?? Number.NaN }))
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.price > 0);
}

export async function fetchCatalogStatus(config: BackendConfig): Promise<MarketplaceStatus[]> {
  const rows = rowsOf<{
    source: string;
    name: string;
    attribution: string | null;
    last_success_at: string | null;
    available_listings: number | string;
    markets: string[] | null;
  }>(await get<unknown>(config, 'catalog_status?select=*', 'Loading status'));
  return rows.map((r) => ({
    source: r.source,
    name: r.name,
    attribution: r.attribution ?? null,
    lastSuccessAt: r.last_success_at,
    availableListings: num(r.available_listings) ?? 0,
    markets: Array.isArray(r.markets) ? r.markets : [],
  }));
}

/** Countries that have live listings, with how many. */
export async function fetchAvailableMarkets(config: BackendConfig): Promise<{ market: string; listings: number; sources: string[] }[]> {
  const rows = rowsOf<{ market: string; listings: number | string; sources: string[] | null }>(
    await get<unknown>(config, 'available_markets?select=*&order=listings.desc', 'Loading countries'),
  );
  return rows.map((r) => ({ market: r.market, listings: num(r.listings) ?? 0, sources: Array.isArray(r.sources) ? r.sources : [] }));
}

/** ECB reference rates: units of each currency per euro, plus the publication date. */
export async function fetchFxRates(config: BackendConfig): Promise<{ rates: FxRates; date: string | null }> {
  const rows = rowsOf<{ currency: string; per_eur: number | string; observed_on: string }>(
    await get<unknown>(config, 'fx_latest?select=*', 'Loading exchange rates'),
  );
  const rates: FxRates = { EUR: 1 };
  let date: string | null = null;
  for (const r of rows) {
    const rate = num(r.per_eur);
    if (/^[A-Z]{3}$/.test(r.currency) && rate && rate > 0) rates[r.currency] = rate;
    if (!date || r.observed_on > date) date = r.observed_on;
  }
  return { rates, date };
}

/** Coupons and offers valid now for shoppers in `market` (expired ones are never returned). */
export async function fetchOffers(config: BackendConfig, market: string): Promise<Offer[]> {
  if (!/^[A-Z]{2}$/.test(market)) return [];
  return parseOfferRows(
    await get<unknown>(config, `active_offers?select=*&market=eq.${market}&order=ends_at.asc.nullslast&limit=400`, 'Loading offers'),
    market,
  );
}

/** Sales stores have announced in their official feeds that start within the next 90 days. */
export async function fetchUpcomingOffers(config: BackendConfig, market: string): Promise<Offer[]> {
  if (!/^[A-Z]{2}$/.test(market)) return [];
  return parseOfferRows(
    await get<unknown>(config, `upcoming_offers?select=*&market=eq.${market}&order=starts_at.asc&limit=200`, 'Loading announced sales'),
    market,
  );
}

function parseOfferRows(value: unknown, market: string): Offer[] {
  const rows = rowsOf<Record<string, unknown>>(value);
  const offers: Offer[] = [];
  for (const r of rows) {
    const url = typeof r.url === 'string' && r.url.startsWith('https://') ? r.url : null;
    if (typeof r.id !== 'string' || !url || typeof r.title !== 'string' || typeof r.merchant !== 'string') continue;
    offers.push({
      id: r.id,
      network: String(r.network ?? ''),
      market: String(r.market ?? market),
      merchant: r.merchant,
      merchantDomain: typeof r.merchant_domain === 'string' ? r.merchant_domain : null,
      source: typeof r.source === 'string' ? r.source : null,
      listingId: typeof r.listing_id === 'string' ? r.listing_id : null,
      title: r.title,
      description: typeof r.description === 'string' ? r.description : null,
      code: typeof r.code === 'string' && r.code.trim() ? r.code.trim() : null,
      url,
      discountText: typeof r.discount_text === 'string' ? r.discount_text : null,
      minSpend: num(r.min_spend),
      currency: typeof r.currency === 'string' ? r.currency : null,
      startsAt: typeof r.starts_at === 'string' ? r.starts_at : null,
      endsAt: typeof r.ends_at === 'string' ? r.ends_at : null,
      lastSeenAt: typeof r.last_seen_at === 'string' ? r.last_seen_at : new Date(0).toISOString(),
    });
  }
  return offers;
}

const HORIZONS: PredictionHorizon[] = [7, 14, 30];

/** How the model's published predictions have turned out, and its calibration. */
export async function fetchTrackRecord(config: BackendConfig): Promise<{ records: TrackRecord[]; calibration: CalibrationBucket[] }> {
  const [records, calibration] = await Promise.all([
    get<unknown>(config, 'prediction_track_record?select=*', 'Loading prediction track record'),
    get<unknown>(config, 'prediction_calibration?select=*&order=horizon_days,bucket', 'Loading prediction calibration'),
  ]);
  return {
    records: rowsOf<Record<string, unknown>>(records)
      .filter((r) => HORIZONS.includes(Number(r.horizon_days) as PredictionHorizon))
      .map((r) => ({
        horizon: Number(r.horizon_days) as PredictionHorizon,
        source: typeof r.source === 'string' ? r.source : null,
        resolved: num(r.resolved) ?? 0,
        dropped: num(r.dropped) ?? 0,
        brier: num(r.brier),
        brierBaseRate: num(r.brier_base_rate),
        waitCalls: num(r.wait_calls) ?? 0,
        waitCorrect: num(r.wait_correct) ?? 0,
        buyCalls: num(r.buy_calls) ?? 0,
        buyCorrect: num(r.buy_correct) ?? 0,
        since: typeof r.since === 'string' ? r.since : null,
      })),
    calibration: rowsOf<Record<string, unknown>>(calibration)
      .filter((r) => HORIZONS.includes(Number(r.horizon_days) as PredictionHorizon))
      .map((r) => ({
        horizon: Number(r.horizon_days) as PredictionHorizon,
        bucket: num(r.bucket) ?? 0,
        resolved: num(r.resolved) ?? 0,
        predicted: num(r.predicted) ?? 0,
        observed: num(r.observed) ?? 0,
      })),
  };
}

export type LiveCheck = 'live' | 'recent' | 'unavailable' | 'unsupported';
export type LiveCheckResult = { row: CatalogRow | null; checked: LiveCheck };

/** Asks the backend to re-check one listing's price on its marketplace. */
export async function liveCheckListing(config: BackendConfig, id: string): Promise<LiveCheckResult> {
  const body = await request<{ item?: CatalogRow; checked?: LiveCheck }>(
    `${config.url}/functions/v1/live-item`,
    { method: 'POST', headers: { ...headers(config), 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) },
    'Checking the live price',
  );
  return { row: body?.item ?? null, checked: body?.checked ?? 'unavailable' };
}
