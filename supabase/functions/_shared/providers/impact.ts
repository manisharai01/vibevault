// impact.com Partner API – product catalogs of the brands that approved your partner account
// (fashion brands and department stores that run their affiliate programme on impact.com).
// Each listing links through your own tracking URL and is shown under the brand's name.
// Docs (checked 2026-11-27):
//   https://integrations.impact.com/impact-publisher/reference/search-catalog-items
//     GET /Mediapartners/{AccountSID}/Catalogs/ItemSearch   Keyword, PageSize (default 100), Page
//       → { Items: Item[] }
//     GET /Mediapartners/{AccountSID}/Catalogs/{CatalogId}/Items/{Id}   → Item
//   https://integrations.impact.com/impact-publisher/reference/the-catalog-item-object
//     Item: Id, CatalogId, CampaignName, Name, Description, Manufacturer, Url (tracking URL),
//     ImageUrl, CurrentPrice, OriginalPrice, Currency, StockAvailability, Condition, Gender,
//     AgeGroup, Colors[], Size, Category, SubCategory
//   https://integrations.impact.com/impact-publisher/reference/authentication
//     HTTP Basic: Account SID as user name, Auth Token as password; Accept: application/json
//   https://integrations.impact.com/impact-publisher/reference/rate-limits
//     3,000 product searches an hour; 429 with Retry-After when exceeded
// Catalog items don't say which countries they ship to, so a listing is offered to shoppers in
// the countries whose currency it is priced in (IMPACT_MARKETS).

import { base64Encode } from '../crypto.ts';
import { requestJson } from '../http.ts';
import { cleanText, toAmount, toHttps } from '../normalize.ts';
import { parseMarketList } from './ebay.ts';
import type { Condition, Department, EnvGetter, FetchLike, Market, MarketplaceProvider, NormalizedListing, ProviderDefinition } from '../types.ts';

export const IMPACT_API_BASE = 'https://api.impact.com';
export const IMPACT_PAGE_SIZE = 100;

/** Currency a shopper in each supported country pays in. */
export const IMPACT_MARKET_CURRENCY: Record<string, string> = {
  US: 'USD',
  GB: 'GBP',
  CA: 'CAD',
  AU: 'AUD',
  NZ: 'NZD',
  IN: 'INR',
  DE: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  ES: 'EUR',
  NL: 'EUR',
  IE: 'EUR',
  SG: 'SGD',
  AE: 'AED',
  JP: 'JPY',
};

export interface ImpactItem {
  Id?: string;
  CatalogId?: string | number;
  CampaignName?: string;
  Name?: string;
  Description?: string;
  Manufacturer?: string;
  Url?: string;
  ImageUrl?: string;
  CurrentPrice?: string | number;
  OriginalPrice?: string | number;
  Currency?: string;
  StockAvailability?: string;
  Condition?: string;
  Gender?: string;
  AgeGroup?: string;
  Colors?: string[] | string;
  Size?: string;
  Category?: string;
  SubCategory?: string;
}

export interface ImpactConfig {
  accountSid: string;
  authToken: string;
  markets: Market[];
}

const KIDS = /\b(kids?|child(ren)?|infant|toddler|newborn|baby)\b/i;
const OUT_OF_STOCK = /out\s*of\s*stock|discontinued|sold\s*out|unavailable/i;
/** "<CatalogId>:<Id>": the catalog is needed to look the item up again. */
const ITEM_KEY = /^([A-Za-z0-9_-]{1,40}):(\S{1,110})$/;

export function impactItemKey(item: Pick<ImpactItem, 'CatalogId' | 'Id'>): string | null {
  const catalog = item.CatalogId === undefined || item.CatalogId === null ? '' : String(item.CatalogId).trim();
  const id = typeof item.Id === 'string' ? item.Id.trim() : typeof item.Id === 'number' ? String(item.Id) : '';
  const key = `${catalog}:${id}`;
  return ITEM_KEY.test(key) ? key : null;
}

function impactDepartment(gender: string | undefined): Department | null {
  const g = (gender ?? '').trim().toLowerCase();
  if (g === 'female' || g === 'women' || g === 'womens') return 'women';
  if (g === 'male' || g === 'men' || g === 'mens') return 'men';
  if (g === 'unisex') return 'unisex';
  return null;
}

function impactCondition(condition: string | undefined): Condition {
  const c = (condition ?? '').trim().toLowerCase();
  return c === 'used' || c === 'refurbished' || c === 'pre-owned' ? 'Pre-owned' : 'New with tags';
}

/** One catalog item as a listing for `market`, or null when it can't be shown there. */
export function parseImpactItem(item: ImpactItem, market: Market): NormalizedListing | null {
  const key = impactItemKey(item ?? {});
  const title = cleanText(item?.Name, 160);
  const productUrl = toHttps(item?.Url);
  const price = toAmount(item?.CurrentPrice);
  const currency = typeof item?.Currency === 'string' ? item.Currency.trim().toUpperCase() : '';
  if (!key || !title || !productUrl || price === null || price === 0 || !/^[A-Z]{3}$/.test(currency)) return null;
  // Priced in another country's currency: not offered to this shopper.
  if (IMPACT_MARKET_CURRENCY[market] !== currency) return null;
  if (KIDS.test(item.AgeGroup ?? '')) return null;
  const original = toAmount(item.OriginalPrice);
  const colors = Array.isArray(item.Colors) ? item.Colors.filter((c) => typeof c === 'string').join(', ') : item.Colors;
  const categoryText = [item.Category, item.SubCategory].map((c) => cleanText(c, 80)).filter(Boolean).join('>') || null;
  return {
    source: 'impact',
    market,
    sourceItemId: key,
    title,
    description: cleanText(item.Description, 600),
    brand: cleanText(item.Manufacturer, 80),
    imageUrl: toHttps(item.ImageUrl),
    productUrl,
    condition: impactCondition(item.Condition),
    size: cleanText(item.Size, 40),
    colorText: cleanText(colors, 60),
    // The brand's programme name, shown as the store.
    seller: cleanText(item.CampaignName, 80),
    currency,
    price,
    originalPrice: original !== null && original > price ? original : null,
    listedAt: null,
    available: !OUT_OF_STOCK.test(item.StockAvailability ?? ''),
    department: impactDepartment(item.Gender),
    categoryText,
    promo: null,
  };
}

export function createImpactProvider(config: ImpactConfig, fetch: FetchLike): MarketplaceProvider {
  const headers = {
    Authorization: `Basic ${base64Encode(`${config.accountSid}:${config.authToken}`)}`,
    Accept: 'application/json',
  };
  const base = `${IMPACT_API_BASE}/Mediapartners/${encodeURIComponent(config.accountSid)}`;

  return {
    source: 'impact',
    markets: config.markets.filter((m) => IMPACT_MARKET_CURRENCY[m]),

    async search({ queryEn, market, limit }) {
      if (!IMPACT_MARKET_CURRENCY[market]) return [];
      // One full page: items priced in other currencies are dropped below.
      const url = `${base}/Catalogs/ItemSearch?Keyword=${encodeURIComponent(queryEn)}&PageSize=${IMPACT_PAGE_SIZE}&Page=1`;
      const body = await requestJson<{ Items?: ImpactItem[] }>(url, { headers }, { fetch, label: 'impact.com search' });
      const items = Array.isArray(body?.Items) ? body.Items : [];
      const seen = new Set<string>();
      const out: NormalizedListing[] = [];
      for (const item of items) {
        const listing = parseImpactItem(item, market);
        if (!listing || !listing.available || seen.has(listing.sourceItemId)) continue;
        seen.add(listing.sourceItemId);
        out.push(listing);
        if (out.length >= Math.max(1, Math.floor(limit))) break;
      }
      return out;
    },

    async lookup(sourceItemId, market) {
      const match = ITEM_KEY.exec(sourceItemId);
      if (!match) return null;
      const [, catalogId, id] = match;
      const url = `${base}/Catalogs/${encodeURIComponent(catalogId)}/Items/${encodeURIComponent(id)}`;
      const item = await requestJson<ImpactItem>(url, { headers }, { fetch, label: 'impact.com item' }, true);
      if (!item) return null;
      return parseImpactItem({ CatalogId: catalogId, ...item }, market);
    },
  };
}

export const impactDefinition: ProviderDefinition = {
  source: 'impact',
  env: ['IMPACT_ACCOUNT_SID', 'IMPACT_AUTH_TOKEN', 'IMPACT_MARKETS'],
  create(env: EnvGetter, fetch: FetchLike) {
    const accountSid = env('IMPACT_ACCOUNT_SID')?.trim();
    const authToken = env('IMPACT_AUTH_TOKEN')?.trim();
    if (!accountSid || !authToken) {
      return { missing: 'impact.com is not connected: set IMPACT_ACCOUNT_SID and IMPACT_AUTH_TOKEN.' };
    }
    return createImpactProvider({ accountSid, authToken, markets: parseMarketList(env('IMPACT_MARKETS'), ['US', 'GB', 'CA', 'AU']) }, fetch);
  },
};
