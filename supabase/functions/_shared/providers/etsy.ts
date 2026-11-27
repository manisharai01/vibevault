// Etsy Open API v3 – handmade and vintage fashion from Etsy shops based in the shopper's
// country (Etsy's search can't filter by delivery country, so listings are limited to shops in
// the same country; their prices are in the shop's currency).
// Docs (checked 2026-11-26):
//   https://developer.etsy.com/documentation/essentials/authentication  x-api-key: keystring:shared_secret
//   https://developer.etsy.com/documentation/essentials/rate-limits     per-key QPS/QPD, 429 + retry-after
//   https://developer.etsy.com/documentation/essentials/definitions     Money {amount, divisor, currency_code}, listing states
//   https://www.etsy.com/openapi/generated/oas/3.0.0.json               OpenAPI spec:
//     GET /v3/application/listings/active   (findAllListingsActive: keywords, limit ≤ 100, sort_on, shop_location)
//     GET /v3/application/listings/batch    (getListingsByListingIds: listing_ids ≤ 100, includes=Images)
//   Apps must show: "The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API
//   but is not endorsed or certified by Etsy, Inc." (stored in public.marketplaces.attribution).

import { requestJson } from '../http.ts';
import { cleanText, toHttps } from '../normalize.ts';
import { parseMarketList } from './ebay.ts';
import type { EnvGetter, FetchLike, Market, MarketplaceProvider, NormalizedListing, ProviderDefinition } from '../types.ts';

export const ETSY_API_BASE = 'https://openapi.etsy.com/v3/application';
export const ETSY_MAX_LIMIT = 100;

/** shop_location values (country names Etsy can parse) for the markets served. */
export const ETSY_SHOP_LOCATIONS: Record<string, string> = {
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  DE: 'Germany',
  FR: 'France',
  IT: 'Italy',
  ES: 'Spain',
  NL: 'Netherlands',
  IE: 'Ireland',
  IN: 'India',
};

/** when_made values that mean "made 20+ years ago" (Etsy's definition of vintage). */
const VINTAGE = /^(before_\d{4}|\d{4}_\d{4}|\d{4}s)$/;

export interface EtsyMoney {
  amount?: number;
  divisor?: number;
  currency_code?: string;
}

export interface EtsyImage {
  url_570xN?: string;
  url_fullxfull?: string;
}

export interface EtsyListing {
  listing_id?: number;
  title?: string;
  description?: string;
  state?: string;
  url?: string;
  price?: EtsyMoney;
  quantity?: number;
  who_made?: string | null;
  when_made?: string | null;
  tags?: string[];
  created_timestamp?: number;
  images?: EtsyImage[];
}

export interface EtsyConfig {
  keystring: string;
  sharedSecret: string;
  markets: Market[];
}

export function etsyAmount(money: EtsyMoney | undefined): number | null {
  const amount = money?.amount;
  const divisor = money?.divisor;
  if (typeof amount !== 'number' || typeof divisor !== 'number' || divisor <= 0 || amount < 0) return null;
  return Math.round((amount / divisor) * 100) / 100;
}

/** True for items Etsy classes as vintage: made by someone else and at least 20 years old. */
export function isEtsyVintage(listing: Pick<EtsyListing, 'who_made' | 'when_made'>, now: Date = new Date()): boolean {
  const when = listing.when_made ?? '';
  if (listing.who_made !== 'someone_else' || !VINTAGE.test(when)) return false;
  // "before_2007" was made in 2006 at the latest; "1990s" ends in 1999; "2000_2006" in 2006.
  const lastYear = Number((when.match(/\d{4}/g) ?? []).at(-1) ?? 0);
  const latestYear = when.startsWith('before_') ? lastYear - 1 : when.endsWith('s') ? lastYear + 9 : lastYear;
  return latestYear > 0 && latestYear <= now.getUTCFullYear() - 20;
}

export function parseEtsyListing(listing: EtsyListing, market: Market, now: Date = new Date()): NormalizedListing | null {
  const id = typeof listing?.listing_id === 'number' ? String(listing.listing_id) : '';
  const title = cleanText(listing?.title, 160);
  const productUrl = toHttps(listing?.url);
  const price = etsyAmount(listing?.price);
  const currency = listing?.price?.currency_code;
  if (!id || !title || !productUrl || price === null || price === 0 || typeof currency !== 'string' || !/^[A-Z]{3}$/i.test(currency)) {
    return null;
  }
  const image = listing.images?.[0];
  const vintage = isEtsyVintage(listing, now);
  return {
    source: 'etsy',
    market,
    sourceItemId: id,
    title,
    description: cleanText(listing.description, 600),
    brand: null,
    imageUrl: toHttps(image?.url_570xN ?? image?.url_fullxfull),
    productUrl,
    condition: vintage ? 'Pre-owned' : 'New with tags',
    size: null,
    colorText: null,
    seller: null,
    currency: currency.toUpperCase(),
    price,
    originalPrice: null,
    listedAt: typeof listing.created_timestamp === 'number' ? new Date(listing.created_timestamp * 1000).toISOString() : null,
    available: (listing.state ?? 'active') === 'active' && (listing.quantity ?? 1) > 0,
    department: null,
    categoryText: null,
    promo: null,
  };
}

export function createEtsyProvider(config: EtsyConfig, fetch: FetchLike, now: () => Date = () => new Date()): MarketplaceProvider {
  const headers = { 'x-api-key': `${config.keystring}:${config.sharedSecret}`, Accept: 'application/json' };

  async function batch(ids: string[]): Promise<EtsyListing[]> {
    if (ids.length === 0) return [];
    const url = `${ETSY_API_BASE}/listings/batch?listing_ids=${ids.map(encodeURIComponent).join(',')}&includes=Images`;
    const body = await requestJson<{ results?: EtsyListing[] }>(url, { headers }, { fetch, label: 'Etsy listings' });
    return Array.isArray(body?.results) ? body.results : [];
  }

  return {
    source: 'etsy',
    markets: config.markets.filter((m) => ETSY_SHOP_LOCATIONS[m]),

    async search({ queryEn, market, limit }) {
      const location = ETSY_SHOP_LOCATIONS[market];
      if (!location) return [];
      const count = Math.max(1, Math.min(ETSY_MAX_LIMIT, Math.floor(limit)));
      const url =
        `${ETSY_API_BASE}/listings/active?keywords=${encodeURIComponent(queryEn)}&limit=${count}` +
        `&sort_on=score&shop_location=${encodeURIComponent(location)}`;
      const body = await requestJson<{ results?: EtsyListing[] }>(url, { headers }, { fetch, label: 'Etsy search' });
      const found = Array.isArray(body?.results) ? body.results : [];
      // Search results have no images; fetch them for the listings in one batch call.
      const withImages = await batch(found.map((l) => String(l.listing_id)).filter((id) => /^\d+$/.test(id)));
      const byId = new Map(withImages.map((l) => [l.listing_id, l]));
      const at = now();
      return found
        .map((l) => parseEtsyListing({ ...l, images: byId.get(l.listing_id)?.images ?? l.images }, market, at))
        .filter((l): l is NormalizedListing => l !== null && l.available)
        .slice(0, count);
    },

    async lookup(listingId, market) {
      if (!/^\d+$/.test(listingId)) return null;
      // Listings that are no longer active are left out of the batch response for other apps.
      const [listing] = (await batch([listingId])).filter((l) => String(l.listing_id) === listingId);
      return listing ? parseEtsyListing(listing, market, now()) : null;
    },
  };
}

export const etsyDefinition: ProviderDefinition = {
  source: 'etsy',
  env: ['ETSY_API_KEY', 'ETSY_SHARED_SECRET', 'ETSY_MARKETS'],
  create(env: EnvGetter, fetch: FetchLike) {
    const keystring = env('ETSY_API_KEY')?.trim();
    const sharedSecret = env('ETSY_SHARED_SECRET')?.trim();
    if (!keystring || !sharedSecret) return { missing: 'Etsy is not connected: set ETSY_API_KEY (keystring) and ETSY_SHARED_SECRET.' };
    return createEtsyProvider(
      { keystring, sharedSecret, markets: parseMarketList(env('ETSY_MARKETS'), ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'IN']) },
      fetch,
    );
  },
};
