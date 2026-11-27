// Google Shopping results via SerpApi – prices from the thousands of stores that list on Google
// Shopping (Myntra, Ajio, Zalando, ASOS, Nordstrom, …) in each country. SerpApi is a paid
// third-party service that retrieves Google Shopping results; it is not an official Google API.
// Docs (checked 2026-11-26):
//   https://serpapi.com/google-shopping-api        request params (engine, q, gl, hl, google_domain, …)
//   https://serpapi.com/shopping-results           shopping_results[] fields
//   https://serpapi.com/api-status-and-error-codes errors are {"error": "..."} (also on HTTP 200 for no results)
//   https://serpapi.com/pricing                    searches/month per plan (one search = one credit)
// One request returns the first page (~40 results); `start` is ignored. The merchant's own link
// needs a second (billed) call to the immersive product API, so listings link to Google's product
// page. There is no cheap single-product lookup: listings are re-confirmed when searches see them.

import { md5Hex } from '../crypto.ts';
import { HttpError, requestJson } from '../http.ts';
import { cleanText, toAmount, toHttps } from '../normalize.ts';
import { parseMarketList } from './ebay.ts';
import type { EnvGetter, FetchLike, Market, MarketplaceProvider, NormalizedListing, ProviderDefinition } from '../types.ts';

export const SERPAPI_URL = 'https://serpapi.com/search.json';

export interface MarketSettings {
  domain: string;
  hl: string;
  currency: string;
  /** How prices in this currency are written on Google (one of these must appear). */
  marks: string[];
}

export const SERPAPI_MARKETS: Record<string, MarketSettings> = {
  IN: { domain: 'google.co.in', hl: 'en', currency: 'INR', marks: ['₹', 'Rs', 'INR'] },
  US: { domain: 'google.com', hl: 'en', currency: 'USD', marks: ['$'] },
  GB: { domain: 'google.co.uk', hl: 'en', currency: 'GBP', marks: ['£', 'GBP'] },
  DE: { domain: 'google.de', hl: 'de', currency: 'EUR', marks: ['€', 'EUR'] },
  FR: { domain: 'google.fr', hl: 'fr', currency: 'EUR', marks: ['€', 'EUR'] },
  IT: { domain: 'google.it', hl: 'it', currency: 'EUR', marks: ['€', 'EUR'] },
  ES: { domain: 'google.es', hl: 'es', currency: 'EUR', marks: ['€', 'EUR'] },
  NL: { domain: 'google.nl', hl: 'nl', currency: 'EUR', marks: ['€', 'EUR'] },
  IE: { domain: 'google.ie', hl: 'en', currency: 'EUR', marks: ['€', 'EUR'] },
  CA: { domain: 'google.ca', hl: 'en', currency: 'CAD', marks: ['$'] },
  AU: { domain: 'google.com.au', hl: 'en', currency: 'AUD', marks: ['$'] },
  NZ: { domain: 'google.co.nz', hl: 'en', currency: 'NZD', marks: ['$'] },
  SG: { domain: 'google.com.sg', hl: 'en', currency: 'SGD', marks: ['$'] },
  JP: { domain: 'google.co.jp', hl: 'ja', currency: 'JPY', marks: ['¥', '￥', '円'] },
  BR: { domain: 'google.com.br', hl: 'pt', currency: 'BRL', marks: ['R$'] },
  MX: { domain: 'google.com.mx', hl: 'es', currency: 'MXN', marks: ['$'] },
  AE: { domain: 'google.ae', hl: 'en', currency: 'AED', marks: ['AED', 'د.إ'] },
  SA: { domain: 'google.com.sa', hl: 'en', currency: 'SAR', marks: ['SAR', 'ر.س'] },
  ZA: { domain: 'google.co.za', hl: 'en', currency: 'ZAR', marks: ['R'] },
};

/** Price prefixes that name a specific dollar/real currency, e.g. "US$12" seen in India. */
const FOREIGN_MARK = /(US\$|CA\$|A\$|AU\$|NZ\$|S\$|HK\$|MX\$|R\$)/;

export interface ShoppingResult {
  title?: string;
  product_id?: string;
  product_link?: string;
  source?: string;
  price?: string;
  extracted_price?: number;
  old_price?: string;
  extracted_old_price?: number;
  thumbnail?: string;
  second_hand_condition?: string;
}

export interface SerpapiConfig {
  apiKey: string;
  markets: Market[];
}

/** True when a displayed price is in the market's currency (results in other currencies are skipped). */
export function priceInMarketCurrency(price: unknown, settings: MarketSettings): boolean {
  if (typeof price !== 'string' || !price.trim()) return false;
  const foreign = FOREIGN_MARK.exec(price)?.[1];
  if (foreign && !settings.marks.includes(foreign)) return false;
  return settings.marks.some((mark) => price.includes(mark));
}

/** Stable id for a product offered by one store: Google's product id plus the store. */
export function shoppingItemId(result: ShoppingResult): string | null {
  const source = (result.source ?? '').trim().toLowerCase();
  if (!source) return null;
  if (typeof result.product_id === 'string' && /^[\w-]{4,60}$/.test(result.product_id)) {
    return `${result.product_id}~${md5Hex(source).slice(0, 8)}`;
  }
  const link = toHttps(result.product_link);
  return link ? `h${md5Hex(`${link}\n${source}`).slice(0, 24)}` : null;
}

export function parseShoppingResult(result: ShoppingResult, market: Market): NormalizedListing | null {
  const settings = SERPAPI_MARKETS[market];
  if (!settings) return null;
  const id = shoppingItemId(result);
  const title = cleanText(result?.title, 160);
  const productUrl = toHttps(result?.product_link);
  const price = toAmount(result?.extracted_price);
  if (!id || !title || !productUrl || price === null || price === 0 || !priceInMarketCurrency(result.price, settings)) return null;
  const old = toAmount(result.extracted_old_price);
  const used = typeof result.second_hand_condition === 'string' && result.second_hand_condition.trim() !== '';
  return {
    source: 'google_shopping',
    market,
    sourceItemId: id,
    title,
    description: null,
    brand: null,
    imageUrl: toHttps(result.thumbnail),
    productUrl,
    condition: used ? 'Pre-owned' : 'New with tags',
    size: null,
    colorText: null,
    seller: cleanText(result.source, 80),
    currency: settings.currency,
    price,
    originalPrice: old !== null && old > price && priceInMarketCurrency(result.old_price ?? result.price, settings) ? old : null,
    listedAt: null,
    available: true,
    department: null,
    categoryText: null,
    promo: null,
  };
}

export function createSerpapiProvider(config: SerpapiConfig, fetch: FetchLike): MarketplaceProvider {
  return {
    source: 'google_shopping',
    markets: config.markets.filter((m) => SERPAPI_MARKETS[m]),

    async search({ query, market, limit }) {
      const settings = SERPAPI_MARKETS[market];
      if (!settings) return [];
      const params = new URLSearchParams({
        engine: 'google_shopping',
        q: query,
        gl: market.toLowerCase(),
        hl: settings.hl,
        google_domain: settings.domain,
        api_key: config.apiKey,
      });
      let body: { shopping_results?: ShoppingResult[]; error?: string } | null;
      try {
        body = await requestJson(`${SERPAPI_URL}?${params}`, {}, { fetch, label: 'Google Shopping (SerpApi)' });
      } catch (error) {
        // SerpApi answers "no results" with an error body; anything else is a real failure.
        if (error instanceof HttpError && /hasn.t returned any results/i.test(error.body)) return [];
        throw error;
      }
      if (body?.error) {
        if (/hasn.t returned any results|no results/i.test(body.error)) return [];
        throw new Error(`Google Shopping (SerpApi): ${body.error}`);
      }
      const results = Array.isArray(body?.shopping_results) ? body.shopping_results : [];
      const seen = new Set<string>();
      const listings: NormalizedListing[] = [];
      for (const result of results) {
        const listing = parseShoppingResult(result, market);
        if (!listing || seen.has(listing.sourceItemId)) continue;
        seen.add(listing.sourceItemId);
        listings.push(listing);
      }
      return listings.slice(0, Math.max(1, Math.floor(limit)));
    },
  };
}

export const serpapiDefinition: ProviderDefinition = {
  source: 'google_shopping',
  env: ['SERPAPI_API_KEY', 'SERPAPI_MARKETS'],
  create(env: EnvGetter, fetch: FetchLike) {
    const apiKey = env('SERPAPI_API_KEY')?.trim();
    if (!apiKey) return { missing: 'Google Shopping is not connected: set SERPAPI_API_KEY.' };
    return createSerpapiProvider({ apiKey, markets: parseMarketList(env('SERPAPI_MARKETS'), ['IN', 'US', 'GB']) }, fetch);
  },
};
