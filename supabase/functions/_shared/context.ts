// Builds the database client and marketplace providers from environment variables.

import { createDb, type Db } from './db.ts';
import { createEbayProvider } from './ebay.ts';
import { createFlipkartProvider } from './flipkart.ts';
import type { ProviderSlot } from './refresh.ts';
import type { FetchLike, Source } from './types.ts';

export type EnvGetter = (key: string) => string | undefined;

export function buildProviders(env: EnvGetter, fetch: FetchLike): Record<Source, ProviderSlot> {
  const flipkartId = env('FLIPKART_AFFILIATE_ID')?.trim();
  const flipkartToken = env('FLIPKART_AFFILIATE_TOKEN')?.trim();
  const ebayId = env('EBAY_CLIENT_ID')?.trim();
  const ebaySecret = env('EBAY_CLIENT_SECRET')?.trim();

  return {
    flipkart:
      flipkartId && flipkartToken
        ? createFlipkartProvider({ affiliateId: flipkartId, token: flipkartToken }, fetch)
        : { missing: 'Flipkart is not connected: set FLIPKART_AFFILIATE_ID and FLIPKART_AFFILIATE_TOKEN.' },
    ebay:
      ebayId && ebaySecret
        ? createEbayProvider(
            {
              clientId: ebayId,
              clientSecret: ebaySecret,
              marketplaceId: env('EBAY_MARKETPLACE_ID')?.trim() || 'EBAY_US',
              deliveryCountry: (env('EBAY_DELIVERY_COUNTRY')?.trim() || 'IN').toUpperCase(),
              campaignId: env('EBAY_CAMPAIGN_ID')?.trim() || undefined,
            },
            fetch,
          )
        : { missing: 'eBay is not connected: set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET.' },
  };
}

export function buildDb(env: EnvGetter, fetch: FetchLike): Db {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  return createDb(url, key, fetch);
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Constant-time string comparison for the cron secret. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
