// Keepa – archived Amazon price history, used to backfill the history of Amazon listings so
// their "when to buy" predictions can learn from past years (including past sale seasons).
// Source: Keepa's official Java client, https://github.com/keepacom/api_backend
//   KeepaAPI.java            GET https://api.keepa.com/product?key=…&domain=…&asin=…&history=1&days=…
//   structs/AmazonLocale.java domain ids: US 1, GB 2, DE 3, FR 4, JP 5, CA 6, IT 8, ES 9, IN 10, MX 11, BR 12
//   helper/KeepaTime.java    unix ms = (keepaMinute + 21564000) × 60000
//   structs/Product.java     csv[type] = [time, price, …]; types with shipping (e.g. 18 BUY_BOX_SHIPPING)
//                            are [time, price, shipping, …]; prices in the locale's smallest unit
//                            (yen for JP); -1 = no offer at that time
//   structs/Response.java    products[], tokensLeft, refillIn; 429/503 when tokens run out

import { requestJson } from '../http.ts';
import type { EnvGetter, FetchLike, HistoryDefinition, HistoryPoint, HistoryProvider, Market } from '../types.ts';

export const KEEPA_API = 'https://api.keepa.com/product';
export const KEEPA_START_MINUTE = 21564000;
export const KEEPA_HISTORY_DAYS = 365;

export const KEEPA_DOMAINS: Record<string, { id: number; currency: string }> = {
  US: { id: 1, currency: 'USD' },
  GB: { id: 2, currency: 'GBP' },
  DE: { id: 3, currency: 'EUR' },
  FR: { id: 4, currency: 'EUR' },
  JP: { id: 5, currency: 'JPY' },
  CA: { id: 6, currency: 'CAD' },
  IT: { id: 8, currency: 'EUR' },
  ES: { id: 9, currency: 'EUR' },
  IN: { id: 10, currency: 'INR' },
  MX: { id: 11, currency: 'MXN' },
  BR: { id: 12, currency: 'BRL' },
};

/** csv indexes used, in order of preference, and whether entries carry a shipping cost. */
export const KEEPA_PRICE_TYPES = [
  { index: 18, name: 'BUY_BOX_SHIPPING', withShipping: true },
  { index: 1, name: 'NEW', withShipping: false },
  { index: 0, name: 'AMAZON', withShipping: false },
] as const;

export function keepaMinutesToMs(minutes: number): number {
  return (minutes + KEEPA_START_MINUTE) * 60_000;
}

export interface KeepaEvent {
  at: number; // unix ms
  price: number; // smallest currency unit, -1 = no offer
}

/** Decodes a csv array into time-ordered events (the shipping part of triples is ignored). */
export function keepaEvents(csv: unknown, withShipping: boolean): KeepaEvent[] {
  if (!Array.isArray(csv)) return [];
  const step = withShipping ? 3 : 2;
  const events: KeepaEvent[] = [];
  for (let i = 0; i + 1 < csv.length; i += step) {
    const minutes = csv[i];
    const price = csv[i + 1];
    if (typeof minutes === 'number' && typeof price === 'number' && Number.isFinite(minutes) && Number.isFinite(price)) {
      events.push({ at: keepaMinutesToMs(minutes), price });
    }
  }
  return events.sort((a, b) => a.at - b.at);
}

/**
 * One price per UTC day: the price in effect at 12:00 UTC, for days within `days` of `now`.
 * Days without an offer (-1) are skipped; amounts are converted from the smallest unit.
 */
export function dailyPrices(events: KeepaEvent[], currency: string, now: Date, days: number = KEEPA_HISTORY_DAYS): HistoryPoint[] {
  if (events.length === 0) return [];
  const divisor = currency === 'JPY' ? 1 : 100;
  const todayNoon = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
  const firstNoon = Math.max(
    todayNoon - (days - 1) * 86_400_000,
    Date.UTC(new Date(events[0].at).getUTCFullYear(), new Date(events[0].at).getUTCMonth(), new Date(events[0].at).getUTCDate(), 12),
  );
  const points: HistoryPoint[] = [];
  let e = -1;
  for (let noon = firstNoon; noon <= todayNoon; noon += 86_400_000) {
    if (noon > now.getTime()) break;
    while (e + 1 < events.length && events[e + 1].at <= noon) e++;
    if (e < 0) continue;
    const price = events[e].price;
    if (price > 0) points.push({ date: new Date(noon).toISOString().slice(0, 10), price: Math.round((price / divisor) * 100) / 100 });
  }
  return points;
}

interface KeepaProduct {
  asin?: string;
  csv?: (number[] | null)[] | null;
}

export function createKeepaHistory(apiKey: string, fetch: FetchLike, now: () => Date = () => new Date()): HistoryProvider {
  return {
    name: 'keepa',
    source: 'amazon',
    markets: Object.keys(KEEPA_DOMAINS),

    async history(asin, market: Market) {
      const domain = KEEPA_DOMAINS[market];
      if (!domain || !/^[A-Z0-9]{10}$/.test(asin)) return null;
      const url = `${KEEPA_API}?key=${encodeURIComponent(apiKey)}&domain=${domain.id}&asin=${asin}&history=1&days=${KEEPA_HISTORY_DAYS}`;
      const body = await requestJson<{ products?: KeepaProduct[] }>(url, {}, { fetch, label: 'Keepa product history' });
      const product = body?.products?.find((p) => p?.asin === asin);
      if (!product?.csv) return null;
      for (const type of KEEPA_PRICE_TYPES) {
        const points = dailyPrices(keepaEvents(product.csv[type.index], type.withShipping), domain.currency, now());
        if (points.length > 0) return { currency: domain.currency, points };
      }
      return null;
    },
  };
}

export const keepaDefinition: HistoryDefinition = {
  name: 'keepa',
  env: ['KEEPA_API_KEY'],
  create(env: EnvGetter, fetch: FetchLike) {
    const key = env('KEEPA_API_KEY')?.trim();
    if (!key) return { missing: 'Keepa price history is not connected: set KEEPA_API_KEY.' };
    return createKeepaHistory(key, fetch);
  },
};
