// eBay Browse API client (second-hand fashion that ships to the user's country).
// Docs: https://developer.ebay.com/api-docs/buy/browse/overview.html
//   Token:  POST https://api.ebay.com/identity/v1/oauth2/token (client credentials)
//   Search: GET  https://api.ebay.com/buy/browse/v1/item_summary/search
//   Item:   GET  https://api.ebay.com/buy/browse/v1/item/{item_id}

import { HttpError, requestJson } from './http.ts';
import { cleanText, colorsFromText, toAmount, toHttps } from './normalize.ts';
import type { Condition, FetchLike, MarketplaceProvider, NormalizedListing } from './types.ts';

export const EBAY_API_BASE = 'https://api.ebay.com';
/** eBay category "Clothing, Shoes & Accessories". */
export const EBAY_FASHION_CATEGORY = '11450';
export const EBAY_MAX_RESULTS = 50;

export interface EbayConfig {
  clientId: string;
  clientSecret: string;
  /** e.g. EBAY_US */
  marketplaceId: string;
  /** ISO country the items must ship to, e.g. IN */
  deliveryCountry: string;
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
  estimatedAvailabilities?: { estimatedAvailabilityStatus?: string }[];
}

/** Maps eBay condition ids (https://developer.ebay.com/api-docs/sell/static/metadata/condition-id-values.html). */
export function mapEbayCondition(conditionId: unknown, conditionText: unknown): Condition {
  switch (String(conditionId ?? '')) {
    case '1000':
      return 'New with tags';
    case '1500':
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
  if (text.includes('new with tags')) return 'New with tags';
  if (text.includes('excellent') || text.includes('like new') || text.includes('new without')) return 'Like new';
  if (text.includes('fair')) return 'Fair';
  return 'Good';
}

/** eBay serves thumbnails (s-l225); ask the CDN for a larger rendition. */
export function largerEbayImage(url: string | null): string | null {
  return url ? url.replace(/\/s-l\d+\./, '/s-l800.') : null;
}

export function parseEbayItem(item: EbayItem, now: Date = new Date()): NormalizedListing | null {
  const itemId = typeof item?.itemId === 'string' ? item.itemId.trim() : '';
  const title = cleanText(item?.title, 160);
  const productUrl = toHttps(item?.itemAffiliateWebUrl) ?? toHttps(item?.itemWebUrl);
  const price = toAmount(item?.price?.value);
  if (!itemId || !title || !productUrl || price === null || price === 0) return null;

  const original = toAmount(item.marketingPrice?.originalPrice?.value);
  const availability = item.estimatedAvailabilities?.[0]?.estimatedAvailabilityStatus;
  const ended = item.itemEndDate ? new Date(item.itemEndDate).getTime() <= now.getTime() : false;

  return {
    id: `ebay:${itemId}`,
    source: 'ebay',
    sourceItemId: itemId,
    title,
    description: cleanText(item.shortDescription, 600),
    brand: cleanText(item.brand, 60),
    imageUrl: largerEbayImage(toHttps(item.image?.imageUrl)),
    productUrl,
    condition: mapEbayCondition(item.conditionId, item.condition),
    size: cleanText(item.size, 40),
    colors: colorsFromText(item.color, title),
    seller: cleanText(item.seller?.username, 80),
    region: 'Global',
    currency: (item.price?.currency ?? 'USD').toString().toUpperCase(),
    price,
    originalPrice: original !== null && original > price ? original : null,
    listedAt: typeof item.itemCreationDate === 'string' ? item.itemCreationDate : null,
    available: availability !== 'OUT_OF_STOCK' && !ended,
  };
}

/** Builds the base64 "client_id:client_secret" value without relying on Buffer or btoa quirks. */
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

  async function headers(): Promise<Record<string, string>> {
    const context = [`contextualLocation=${encodeURIComponent(`country=${config.deliveryCountry}`)}`];
    if (config.campaignId) context.push(`affiliateCampaignId=${encodeURIComponent(config.campaignId)}`);
    return {
      Authorization: `Bearer ${await accessToken()}`,
      'X-EBAY-C-MARKETPLACE-ID': config.marketplaceId,
      'X-EBAY-C-ENDUSERCTX': context.join(','),
      Accept: 'application/json',
    };
  }

  return {
    source: 'ebay',

    async search(query, limit) {
      const count = Math.max(1, Math.min(EBAY_MAX_RESULTS, Math.floor(limit)));
      const filter = [
        'buyingOptions:{FIXED_PRICE}',
        'conditions:{USED}',
        `deliveryCountry:${config.deliveryCountry}`,
      ].join(',');
      const url =
        `${EBAY_API_BASE}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}` +
        `&category_ids=${EBAY_FASHION_CATEGORY}&limit=${count}&filter=${encodeURIComponent(filter)}`;
      const body = await requestJson<{ itemSummaries?: EbayItem[] }>(url, { headers: await headers() }, { fetch, label: 'eBay search' });
      const items = Array.isArray(body?.itemSummaries) ? body.itemSummaries : [];
      const at = now();
      return items
        .map((item) => parseEbayItem(item, at))
        .filter((listing): listing is NormalizedListing => listing !== null && listing.available)
        .slice(0, count);
    },

    async lookup(itemId) {
      const url = `${EBAY_API_BASE}/buy/browse/v1/item/${encodeURIComponent(itemId)}`;
      try {
        const body = await requestJson<EbayItem>(url, { headers: await headers() }, { fetch, label: 'eBay item lookup' }, true);
        return body ? parseEbayItem(body, now()) : null;
      } catch (error) {
        // Ended or removed listings come back as 404/410.
        if (error instanceof HttpError && error.status === 410) return null;
        throw error;
      }
    },
  };
}
