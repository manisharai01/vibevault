// eBay Browse API – new and pre-owned fashion from eBay's marketplaces, filtered to
// listings that deliver to the shopper's country.
// Docs: https://developer.ebay.com/api-docs/buy/browse/overview.html
//   Token:  POST https://api.ebay.com/identity/v1/oauth2/token (client credentials)
//   Search: GET  https://api.ebay.com/buy/browse/v1/item_summary/search
//   Item:   GET  https://api.ebay.com/buy/browse/v1/item/{item_id}
// Marketplace ids: https://developer.ebay.com/api-docs/static/rest-request-components.html#marketpl

import { HttpError, requestJson } from '../http.ts';
import { cleanText, toAmount, toHttps } from '../normalize.ts';
import type {
  Condition,
  Department,
  EnvGetter,
  FetchLike,
  Market,
  MarketplaceProvider,
  NormalizedListing,
  ProviderDefinition,
} from '../types.ts';

export const EBAY_API_BASE = 'https://api.ebay.com';
/** Top-level category "Clothing, Shoes & Accessories" (same id on every eBay site). */
export const EBAY_FASHION_CATEGORY = '11450';
export const EBAY_MAX_RESULTS = 50;

/** Shopper country → the eBay site that serves it. Other countries shop eBay.com (items that ship there). */
export const EBAY_SITE_BY_COUNTRY: Record<string, string> = {
  US: 'EBAY_US',
  GB: 'EBAY_GB',
  DE: 'EBAY_DE',
  FR: 'EBAY_FR',
  IT: 'EBAY_IT',
  ES: 'EBAY_ES',
  AU: 'EBAY_AU',
  CA: 'EBAY_CA',
  AT: 'EBAY_AT',
  CH: 'EBAY_CH',
  IE: 'EBAY_IE',
  NL: 'EBAY_NL',
  BE: 'EBAY_BE',
  PL: 'EBAY_PL',
  HK: 'EBAY_HK',
  SG: 'EBAY_SG',
  MY: 'EBAY_MY',
  PH: 'EBAY_PH',
};

export const ebaySiteFor = (market: Market): string => EBAY_SITE_BY_COUNTRY[market] ?? 'EBAY_US';

export type EbayCondition = 'NEW' | 'USED';

export interface EbayConfig {
  clientId: string;
  clientSecret: string;
  /** Shopper countries to serve, e.g. ["IN", "US", "GB"]. */
  markets: Market[];
  /** Which conditions to search for. */
  conditions: EbayCondition[];
  /** Optional eBay Partner Network campaign id for affiliate links. */
  campaignId?: string;
}

interface EbayMoney {
  value?: string | number;
  currency?: string;
}

export interface EbayItem {
  itemId?: string;
  title?: string;
  shortDescription?: string;
  price?: EbayMoney;
  marketingPrice?: { originalPrice?: EbayMoney };
  condition?: string;
  conditionId?: string;
  image?: { imageUrl?: string };
  itemWebUrl?: string;
  itemAffiliateWebUrl?: string;
  seller?: { username?: string };
  itemCreationDate?: string;
  itemEndDate?: string;
  brand?: string;
  color?: string;
  size?: string;
  gender?: string;
  ageGroup?: string;
  categoryPath?: string;
  categories?: { categoryId?: string; categoryName?: string }[];
  estimatedAvailabilities?: { estimatedAvailabilityStatus?: string }[];
}

/** Maps eBay condition ids (https://developer.ebay.com/api-docs/sell/static/metadata/condition-id-values.html). */
export function mapEbayCondition(conditionId: unknown, conditionText: unknown): Condition {
  switch (String(conditionId ?? '')) {
    case '1000':
      return 'New with tags';
    case '1500':
    case '2750':
    case '2990':
      return 'Like new';
    case '1750':
    case '3000':
      return 'Good';
    case '3010':
      return 'Fair';
    case '7000':
      return 'Well-loved';
  }
  const text = typeof conditionText === 'string' ? conditionText.toLowerCase() : '';
  if (text.includes('new with tags') || text === 'new') return 'New with tags';
  if (text.includes('excellent') || text.includes('like new') || text.includes('new without')) return 'Like new';
  if (text.includes('good')) return 'Good';
  if (text.includes('fair')) return 'Fair';
  return 'Pre-owned';
}

/** eBay serves thumbnails (s-l225); ask the CDN for a larger rendition. */
export function largerEbayImage(url: string | null): string | null {
  return url ? url.replace(/\/s-l\d+\./, '/s-l800.') : null;
}

/** eBay's gender/age fields (item details only): "Women", "Men", "Unisex Adults", "Boys"… */
export function ebayDepartment(gender: unknown, ageGroup: unknown): Department | null | 'kids' {
  const age = typeof ageGroup === 'string' ? ageGroup.toLowerCase() : '';
  const g = typeof gender === 'string' ? gender.toLowerCase() : '';
  if (/kid|child|baby|infant|toddler|youth/.test(age) || /\b(boys?|girls?|baby)\b/.test(g)) return 'kids';
  if (/unisex/.test(g)) return 'unisex';
  if (/\bwomen|female|ladies/.test(g)) return 'women';
  if (/\bmen\b|\bmale\b/.test(g)) return 'men';
  return null;
}

export function parseEbayItem(item: EbayItem, market: Market, now: Date = new Date()): NormalizedListing | null {
  const itemId = typeof item?.itemId === 'string' ? item.itemId.trim() : '';
  const title = cleanText(item?.title, 160);
  const productUrl = toHttps(item?.itemAffiliateWebUrl) ?? toHttps(item?.itemWebUrl);
  const price = toAmount(item?.price?.value);
  if (!itemId || !title || !productUrl || price === null || price === 0) return null;

  const department = ebayDepartment(item.gender, item.ageGroup);
  if (department === 'kids') return null;

  const original = toAmount(item.marketingPrice?.originalPrice?.value);
  const availability = item.estimatedAvailabilities?.[0]?.estimatedAvailabilityStatus;
  const ended = item.itemEndDate ? new Date(item.itemEndDate).getTime() <= now.getTime() : false;
  const categoryNames = (item.categories ?? [])
    .map((c) => c?.categoryName)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);

  return {
    source: 'ebay',
    market,
    sourceItemId: itemId,
    title,
    description: cleanText(item.shortDescription, 600),
    brand: cleanText(item.brand, 60),
    imageUrl: largerEbayImage(toHttps(item.image?.imageUrl)),
    productUrl,
    condition: mapEbayCondition(item.conditionId, item.condition),
    size: cleanText(item.size, 40),
    colorText: cleanText(item.color, 40),
    seller: cleanText(item.seller?.username, 80),
    currency: (item.price?.currency ?? 'USD').toString().toUpperCase(),
    price,
    originalPrice: original !== null && original > price ? original : null,
    listedAt: typeof item.itemCreationDate === 'string' ? item.itemCreationDate : null,
    available: availability !== 'OUT_OF_STOCK' && !ended,
    department,
    categoryText: cleanText(item.categoryPath ?? (categoryNames.length ? categoryNames.join('>') : null), 200),
    promo: null,
  };
}

/** Builds the base64 "client_id:client_secret" value without relying on Buffer. */
function basicAuth(clientId: string, clientSecret: string): string {
  const bytes = new TextEncoder().encode(`${clientId}:${clientSecret}`);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function createEbayProvider(config: EbayConfig, fetch: FetchLike, now: () => Date = () => new Date()): MarketplaceProvider {
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt > now().getTime() + 60_000) return token.value;
    const body = await requestJson<{ access_token?: string; expires_in?: number }>(
      `${EBAY_API_BASE}/identity/v1/oauth2/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth(config.clientId, config.clientSecret)}`,
        },
        body: `grant_type=client_credentials&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope')}`,
      },
      { fetch, label: 'eBay token' },
    );
    if (!body?.access_token) throw new Error('eBay token response had no access_token');
    token = { value: body.access_token, expiresAt: now().getTime() + (body.expires_in ?? 7200) * 1000 };
    return token.value;
  }

  async function headers(market: Market): Promise<Record<string, string>> {
    const context = [`contextualLocation=${encodeURIComponent(`country=${market}`)}`];
    if (config.campaignId) context.push(`affiliateCampaignId=${encodeURIComponent(config.campaignId)}`);
    return {
      Authorization: `Bearer ${await accessToken()}`,
      'X-EBAY-C-MARKETPLACE-ID': ebaySiteFor(market),
      'X-EBAY-C-ENDUSERCTX': context.join(','),
      Accept: 'application/json',
    };
  }

  return {
    source: 'ebay',
    markets: config.markets,

    async search({ query, market, limit }) {
      const count = Math.max(1, Math.min(EBAY_MAX_RESULTS, Math.floor(limit)));
      const filter = [
        'buyingOptions:{FIXED_PRICE}',
        `conditions:{${config.conditions.join('|')}}`,
        `deliveryCountry:${market}`,
      ].join(',');
      const url =
        `${EBAY_API_BASE}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}` +
        `&category_ids=${EBAY_FASHION_CATEGORY}&limit=${count}&filter=${encodeURIComponent(filter)}`;
      const body = await requestJson<{ itemSummaries?: EbayItem[] }>(url, { headers: await headers(market) }, { fetch, label: 'eBay search' });
      const items = Array.isArray(body?.itemSummaries) ? body.itemSummaries : [];
      const at = now();
      return items
        .map((item) => parseEbayItem(item, market, at))
        .filter((listing): listing is NormalizedListing => listing !== null && listing.available)
        .slice(0, count);
    },

    async lookup(itemId, market) {
      const url = `${EBAY_API_BASE}/buy/browse/v1/item/${encodeURIComponent(itemId)}`;
      try {
        const body = await requestJson<EbayItem>(url, { headers: await headers(market) }, { fetch, label: 'eBay item lookup' }, true);
        return body ? parseEbayItem(body, market, now()) : null;
      } catch (error) {
        // Ended or removed listings come back as 404/410.
        if (error instanceof HttpError && error.status === 410) return null;
        throw error;
      }
    },
  };
}

/** "IN, US,gb" → ["IN", "US", "GB"] (valid ISO-2 codes only, no duplicates). */
export function parseMarketList(value: string | undefined, fallback: Market[]): Market[] {
  if (!value?.trim()) return fallback;
  const codes = value
    .split(/[\s,]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
  return codes.length ? [...new Set(codes)] : fallback;
}

export const ebayDefinition: ProviderDefinition = {
  source: 'ebay',
  env: ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_MARKETS', 'EBAY_CONDITIONS', 'EBAY_CAMPAIGN_ID'],
  create(env: EnvGetter, fetch: FetchLike) {
    const clientId = env('EBAY_CLIENT_ID')?.trim();
    const clientSecret = env('EBAY_CLIENT_SECRET')?.trim();
    if (!clientId || !clientSecret) return { missing: 'eBay is not connected: set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET.' };
    const conditions = (env('EBAY_CONDITIONS') ?? 'USED')
      .split(/[\s,|]+/)
      .map((c) => c.trim().toUpperCase())
      .filter((c): c is 'NEW' | 'USED' => c === 'NEW' || c === 'USED');
    return createEbayProvider(
      {
        clientId,
        clientSecret,
        markets: parseMarketList(env('EBAY_MARKETS'), ['IN', 'US', 'GB', 'DE', 'FR', 'IT', 'ES', 'AU', 'CA']),
        conditions: conditions.length ? [...new Set(conditions)] : ['USED'],
        campaignId: env('EBAY_CAMPAIGN_ID')?.trim() || undefined,
      },
      fetch,
    );
  },
};
