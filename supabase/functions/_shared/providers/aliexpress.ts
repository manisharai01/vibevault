// AliExpress Affiliate API (AliExpress Open Platform) – new fashion shipped to almost every
// country, priced in the shopper's currency where AliExpress supports it.
// Sources (the official docs at openservice.aliexpress.com could not be fetched by tools, so the
// request format follows the widely used open-source client that wraps the official SDK):
//   https://github.com/sergioteula/python-aliexpress-api  (aliexpress_api/skd/api/base.py: gateway,
//     system parameters and signing; skd/api/rest/AliexpressAffiliateProductQueryRequest.py and
//     …ProductdetailGetRequest.py: parameters; models/product.py, currencies.py, languages.py)
//
//   POST https://api-sg.aliexpress.com/sync?<system params incl. sign>   body: form-encoded API params
//   System params: app_key, format=json, method, sign_method=md5, timestamp (epoch ms), v=2.0, sign
//   sign = MD5(secret + concat(sorted key+value of system and API params) + secret), upper-case hex
//   Responses: { <method with _ for .>_response: { resp_result: { resp_code: 200, resp_msg, result } } }
//              or { error_response: { code, msg, sub_code, sub_msg } }
// `npm run providers:check` verifies this against the live API with your keys.

import { md5Hex } from '../crypto.ts';
import { requestJson } from '../http.ts';
import { cleanText, toAmount, toHttps } from '../normalize.ts';
import { parseMarketList } from './ebay.ts';
import type {
  EnvGetter,
  FetchLike,
  ListingPromo,
  Market,
  MarketplaceProvider,
  NormalizedListing,
  ProviderDefinition,
} from '../types.ts';

export const ALIEXPRESS_GATEWAY = 'https://api-sg.aliexpress.com/sync';
export const ALIEXPRESS_MAX_PAGE_SIZE = 50;

/** target_currency values the API accepts (models/currencies.py). */
const SUPPORTED_CURRENCIES = new Set(['USD', 'GBP', 'CAD', 'EUR', 'UAH', 'MXN', 'TRY', 'RUB', 'BRL', 'AUD', 'INR', 'JPY', 'IDR', 'SEK', 'KRW']);

const EURO_COUNTRIES = new Set(['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK']);
const LOCAL_CURRENCY: Record<string, string> = {
  US: 'USD', GB: 'GBP', CA: 'CAD', UA: 'UAH', MX: 'MXN', TR: 'TRY', BR: 'BRL', AU: 'AUD', IN: 'INR', JP: 'JPY', ID: 'IDR', SE: 'SEK', KR: 'KRW',
};

/** The shopper's own currency when AliExpress can price in it, else US dollars. */
export function aliexpressCurrency(market: Market): string {
  const local = EURO_COUNTRIES.has(market) ? 'EUR' : LOCAL_CURRENCY[market];
  return local && SUPPORTED_CURRENCIES.has(local) ? local : 'USD';
}

export const ALIEXPRESS_DEFAULT_MARKETS: Market[] = [
  'IN', 'US', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'PL', 'AU', 'CA', 'BR', 'MX', 'JP', 'KR', 'AE', 'SA', 'SG',
];

export interface AliexpressConfig {
  appKey: string;
  appSecret: string;
  trackingId: string;
  markets: Market[];
}

export interface AliexpressPromoCode {
  promo_code?: string;
  code_value?: string;
  code_mini_spend?: string;
  code_availabletime_start?: string;
  code_availabletime_end?: string;
}

export interface AliexpressProduct {
  product_id?: number | string;
  product_title?: string;
  product_main_image_url?: string;
  product_detail_url?: string;
  promotion_link?: string;
  target_sale_price?: string | number;
  target_sale_price_currency?: string;
  target_original_price?: string | number;
  target_original_price_currency?: string;
  sale_price?: string | number;
  sale_price_currency?: string;
  first_level_category_name?: string;
  second_level_category_name?: string;
  promo_code_info?: AliexpressPromoCode | null;
}

/** TOP-style signature: MD5(secret + sorted key/value pairs + secret), upper-case hex. */
export function aliexpressSign(params: Record<string, string>, secret: string): string {
  const keys = Object.keys(params).sort();
  return md5Hex(secret + keys.map((k) => `${k}${params[k]}`).join('') + secret).toUpperCase();
}

const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Instant of a promo-code start/end time. Zone-less times aren't documented, so they are read
 * in the zone that makes the window shortest (China time for an end, US Pacific for a start):
 * a code is never shown as valid when it might not be.
 */
export function promoInstant(value: unknown, edge: 'start' | 'end'): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) {
    const t = Date.parse(text.replace(' ', 'T'));
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  const m = WALL_TIME.exec(text);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const offsetHours = edge === 'end' ? 8 : -8;
  return new Date(wall - offsetHours * 3_600_000).toISOString();
}

export function parseAliexpressPromo(info: AliexpressPromoCode | null | undefined, currency: string, now: Date): ListingPromo | null {
  const code = typeof info?.promo_code === 'string' ? info.promo_code.trim() : '';
  if (!info || !code) return null;
  const endsAt = promoInstant(info.code_availabletime_end, 'end');
  // A code without a readable expiry can't be shown as valid.
  if (!endsAt || new Date(endsAt).getTime() <= now.getTime()) return null;
  const startsAt = promoInstant(info.code_availabletime_start, 'start');
  if (startsAt && new Date(startsAt).getTime() > now.getTime()) return null;
  const value = cleanText(info.code_value, 60);
  const minSpend = toAmount(String(info.code_mini_spend ?? '').replace(/[^\d.]/g, ''));
  return {
    code,
    description: value ? `${value} off with code ${code}` : `Code ${code}`,
    minSpend: minSpend && minSpend > 0 ? minSpend : null,
    currency,
    startsAt,
    endsAt,
  };
}

export function parseAliexpressProduct(product: AliexpressProduct, market: Market, now: Date = new Date()): NormalizedListing | null {
  const id = product?.product_id !== undefined && product?.product_id !== null ? String(product.product_id).trim() : '';
  const title = cleanText(product?.product_title, 160);
  const productUrl = toHttps(product?.promotion_link) ?? toHttps(product?.product_detail_url);
  const price = toAmount(product?.target_sale_price) ?? toAmount(product?.sale_price);
  const currency = (toAmount(product?.target_sale_price) !== null ? product?.target_sale_price_currency : product?.sale_price_currency) ?? '';
  if (!/^\d+$/.test(id) || !title || !productUrl || price === null || price === 0 || !/^[A-Za-z]{3}$/.test(currency)) return null;

  const original =
    (product.target_original_price_currency ?? currency).toUpperCase() === currency.toUpperCase()
      ? toAmount(product.target_original_price)
      : null;
  const categories = [product.first_level_category_name, product.second_level_category_name]
    .map((c) => cleanText(c, 80))
    .filter((c): c is string => c !== null);

  return {
    source: 'aliexpress',
    market,
    sourceItemId: id,
    title,
    description: null,
    brand: null,
    imageUrl: toHttps(product.product_main_image_url),
    productUrl,
    condition: 'New with tags',
    size: null,
    colorText: null,
    seller: null,
    currency: currency.toUpperCase(),
    price,
    originalPrice: original !== null && original > price ? original : null,
    listedAt: null,
    available: true,
    department: null,
    categoryText: categories.length ? categories.join('>') : null,
    promo: parseAliexpressPromo(product.promo_code_info, currency.toUpperCase(), now),
  };
}

interface RespResult {
  resp_code?: number | string;
  resp_msg?: string;
  result?: { products?: { product?: AliexpressProduct[] }; current_record_count?: number };
}

/** The product list from an API response; throws on API errors, [] when nothing matched. */
export function aliexpressProducts(body: Record<string, unknown> | null, method: string): AliexpressProduct[] {
  const error = body?.error_response as { code?: unknown; msg?: unknown; sub_msg?: unknown } | undefined;
  if (error) throw new Error(`AliExpress ${method}: ${String(error.code ?? '')} ${String(error.sub_msg ?? error.msg ?? 'error')}`.trim());
  const envelope = body?.[`${method.replace(/\./g, '_')}_response`] as { resp_result?: RespResult } | undefined;
  const result = envelope?.resp_result;
  if (!result) throw new Error(`AliExpress ${method}: unexpected response`);
  if (Number(result.resp_code) !== 200) {
    // An empty result is reported with a non-200 resp_code and a "no result"-style message.
    if (/empty|no (result|product|data)|not found/i.test(String(result.resp_msg ?? ''))) return [];
    throw new Error(`AliExpress ${method}: ${String(result.resp_code)} ${String(result.resp_msg ?? '')}`.trim());
  }
  const products = result.result?.products?.product;
  return Array.isArray(products) ? products : [];
}

export function createAliexpressProvider(config: AliexpressConfig, fetch: FetchLike, now: () => Date = () => new Date()): MarketplaceProvider {
  async function call(method: string, apiParams: Record<string, string>): Promise<AliexpressProduct[]> {
    const system: Record<string, string> = {
      app_key: config.appKey,
      format: 'json',
      method,
      sign_method: 'md5',
      timestamp: String(now().getTime()),
      v: '2.0',
    };
    const sign = aliexpressSign({ ...system, ...apiParams }, config.appSecret);
    const query = new URLSearchParams({ ...system, sign }).toString();
    const body = await requestJson<Record<string, unknown>>(
      `${ALIEXPRESS_GATEWAY}?${query}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8', Accept: 'application/json' },
        body: new URLSearchParams(apiParams).toString(),
      },
      { fetch, label: `AliExpress ${method}` },
    );
    return aliexpressProducts(body, method);
  }

  return {
    source: 'aliexpress',
    markets: config.markets,

    async search({ queryEn, market, limit }) {
      const pageSize = Math.max(1, Math.min(ALIEXPRESS_MAX_PAGE_SIZE, Math.floor(limit)));
      const products = await call('aliexpress.affiliate.product.query', {
        keywords: queryEn,
        page_no: '1',
        page_size: String(pageSize),
        ship_to_country: market,
        target_currency: aliexpressCurrency(market),
        target_language: 'EN',
        tracking_id: config.trackingId,
      });
      const at = now();
      return products
        .map((p) => parseAliexpressProduct(p, market, at))
        .filter((l): l is NormalizedListing => l !== null)
        .slice(0, pageSize);
    },

    async lookup(productId, market) {
      const products = await call('aliexpress.affiliate.productdetail.get', {
        product_ids: productId,
        country: market,
        target_currency: aliexpressCurrency(market),
        target_language: 'EN',
        tracking_id: config.trackingId,
      });
      const match = products.find((p) => String(p?.product_id) === productId);
      return match ? parseAliexpressProduct(match, market, now()) : null;
    },
  };
}

export const aliexpressDefinition: ProviderDefinition = {
  source: 'aliexpress',
  env: ['ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET', 'ALIEXPRESS_TRACKING_ID', 'ALIEXPRESS_MARKETS'],
  create(env: EnvGetter, fetch: FetchLike) {
    const appKey = env('ALIEXPRESS_APP_KEY')?.trim();
    const appSecret = env('ALIEXPRESS_APP_SECRET')?.trim();
    const trackingId = env('ALIEXPRESS_TRACKING_ID')?.trim();
    if (!appKey || !appSecret || !trackingId) {
      return { missing: 'AliExpress is not connected: set ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET and ALIEXPRESS_TRACKING_ID.' };
    }
    return createAliexpressProvider(
      { appKey, appSecret, trackingId, markets: parseMarketList(env('ALIEXPRESS_MARKETS'), ALIEXPRESS_DEFAULT_MARKETS) },
      fetch,
    );
  },
};
