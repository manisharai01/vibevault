// Builds the database client and the configured marketplaces, archives and coupon feeds
// from environment variables.

import { createDb, type Db } from './db.ts';
import { OFFER_SOURCES } from './offers/index.ts';
import { ARCHIVES, PROVIDERS } from './providers/index.ts';
import type {
  EnvGetter,
  FetchLike,
  HistoryProvider,
  MarketplaceProvider,
  OfferProvider,
  Slot,
} from './types.ts';

export type { EnvGetter } from './types.ts';

export function buildProviders(env: EnvGetter, fetch: FetchLike): Record<string, Slot<MarketplaceProvider>> {
  return Object.fromEntries(PROVIDERS.map((definition) => [definition.source, definition.create(env, fetch)]));
}

export function buildOfferSources(env: EnvGetter, fetch: FetchLike): Record<string, Slot<OfferProvider>> {
  return Object.fromEntries(OFFER_SOURCES.map((definition) => [definition.network, definition.create(env, fetch)]));
}

export function buildArchives(env: EnvGetter, fetch: FetchLike): Slot<HistoryProvider>[] {
  return ARCHIVES.map((definition) => definition.create(env, fetch));
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
