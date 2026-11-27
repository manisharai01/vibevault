// Flipkart Affiliate API (v1.0) – new fashion sold on flipkart.com (India).
// Docs: https://affiliate.flipkart.com/api-docs/af_prod_ref.html
//   GET https://affiliate-api.flipkart.net/affiliate/1.0/search.json?query=…&resultCount=… (max 10)
//   GET https://affiliate-api.flipkart.net/affiliate/1.0/product.json?id=…
//   Headers: Fk-Affiliate-Id, Fk-Affiliate-Token

import { requestJson } from '../http.ts';
import { cleanText, toAmount, toHttps } from '../normalize.ts';
import type {
  Department,
  EnvGetter,
  FetchLike,
  MarketplaceProvider,
  NormalizedListing,
  ProviderDefinition,
} from '../types.ts';

export const FLIPKART_API_BASE = 'https://affiliate-api.flipkart.net/affiliate/1.0';
export const FLIPKART_MAX_RESULTS = 10;

interface Money {
  amount?: number | string | null;
  currency?: string | null;
}

export interface FlipkartProduct {
  productBaseInfoV1?: {
    productId?: string;
    title?: string;
    productDescription?: string | null;
    imageUrls?: Record<string, string | undefined>;
    maximumRetailPrice?: Money | null;
    flipkartSellingPrice?: Money | null;
    flipkartSpecialPrice?: Money | null;
    productUrl?: string;
    productBrand?: string | null;
    inStock?: boolean | null;
    categoryPath?: string | null;
    attributes?: { size?: string | null; color?: string | null } | null;
  };
  productShippingInfoV1?: { sellerName?: string | null } | null;
  categorySpecificInfoV1?: { lifeStyleInfo?: { idealFor?: string[] | null } | null } | null;
}

export interface FlipkartCredentials {
  affiliateId: string;
  token: string;
}

const IMAGE_SIZE_PREFERENCE = ['800x800', '400x400', 'unknown', '200x200'];

/** Flipkart's "Ideal for" attribute: Men, Women, Men & Women, Boys, Girls, Baby Boys … */
export function departmentFromIdealFor(idealFor: unknown): Department | null | 'kids' {
  if (!Array.isArray(idealFor) || idealFor.length === 0) return null;
  const text = idealFor.filter((v) => typeof v === 'string').join(' ').toLowerCase();
  if (/\b(boys?|girls?|baby|kids?|infants?|toddlers?)\b/.test(text)) return 'kids';
  const men = /\bmen\b/.test(text);
  const women = /\bwomen\b/.test(text);
  if (men && women) return 'unisex';
  if (women) return 'women';
  if (men) return 'men';
  if (/unisex/.test(text)) return 'unisex';
  return null;
}

/** Converts one Flipkart product into a normalised listing (null if unusable or a kids' item). */
export function parseFlipkartProduct(product: FlipkartProduct): NormalizedListing | null {
  const base = product?.productBaseInfoV1;
  if (!base) return null;
  const productId = typeof base.productId === 'string' ? base.productId.trim() : '';
  const title = cleanText(base.title, 160);
  const productUrl = toHttps(base.productUrl);
  const price = toAmount(base.flipkartSpecialPrice?.amount) ?? toAmount(base.flipkartSellingPrice?.amount);
  if (!productId || !title || !productUrl || price === null || price === 0) return null;

  const department = departmentFromIdealFor(product.categorySpecificInfoV1?.lifeStyleInfo?.idealFor);
  if (department === 'kids') return null;

  const mrp = toAmount(base.maximumRetailPrice?.amount);
  const currency = (base.flipkartSpecialPrice?.currency || base.flipkartSellingPrice?.currency || base.maximumRetailPrice?.currency || 'INR')
    .toString()
    .toUpperCase();
  const images = base.imageUrls ?? {};
  const imageKey = IMAGE_SIZE_PREFERENCE.find((key) => images[key]) ?? Object.keys(images).find((key) => images[key]);

  return {
    source: 'flipkart',
    market: 'IN',
    sourceItemId: productId,
    title,
    description: cleanText(base.productDescription, 600),
    brand: cleanText(base.productBrand, 60),
    imageUrl: imageKey ? toHttps(images[imageKey]) : null,
    productUrl,
    condition: 'New with tags',
    size: cleanText(base.attributes?.size, 40),
    colorText: cleanText(base.attributes?.color, 40),
    seller: cleanText(product.productShippingInfoV1?.sellerName, 80),
    currency,
    price,
    originalPrice: mrp !== null && mrp > price ? mrp : null,
    listedAt: null,
    // Flipkart sometimes reports null; a listing with a live price is treated as available.
    available: base.inStock !== false,
    department,
    categoryText: cleanText(base.categoryPath, 200),
    promo: null,
  };
}

export function createFlipkartProvider(credentials: FlipkartCredentials, fetch: FetchLike): MarketplaceProvider {
  const headers = {
    'Fk-Affiliate-Id': credentials.affiliateId,
    'Fk-Affiliate-Token': credentials.token,
    Accept: 'application/json',
  };

  return {
    source: 'flipkart',
    markets: ['IN'],

    async search({ queryEn, limit }) {
      const resultCount = Math.max(1, Math.min(FLIPKART_MAX_RESULTS, Math.floor(limit)));
      const url = `${FLIPKART_API_BASE}/search.json?query=${encodeURIComponent(queryEn)}&resultCount=${resultCount}`;
      const body = await requestJson<{ productInfoList?: FlipkartProduct[] }>(url, { headers }, { fetch, label: 'Flipkart search' });
      const products = Array.isArray(body?.productInfoList) ? body.productInfoList : [];
      return products
        .map(parseFlipkartProduct)
        .filter((listing): listing is NormalizedListing => listing !== null)
        .slice(0, resultCount);
    },

    async lookup(productId) {
      const url = `${FLIPKART_API_BASE}/product.json?id=${encodeURIComponent(productId)}`;
      const body = await requestJson<FlipkartProduct>(url, { headers }, { fetch, label: 'Flipkart product lookup' }, true);
      return body ? parseFlipkartProduct(body) : null;
    },
  };
}

export const flipkartDefinition: ProviderDefinition = {
  source: 'flipkart',
  env: ['FLIPKART_AFFILIATE_ID', 'FLIPKART_AFFILIATE_TOKEN'],
  create(env: EnvGetter, fetch: FetchLike) {
    const affiliateId = env('FLIPKART_AFFILIATE_ID')?.trim();
    const token = env('FLIPKART_AFFILIATE_TOKEN')?.trim();
    if (!affiliateId || !token) {
      return { missing: 'Flipkart is not connected: set FLIPKART_AFFILIATE_ID and FLIPKART_AFFILIATE_TOKEN.' };
    }
    return createFlipkartProvider({ affiliateId, token }, fetch);
  },
};
