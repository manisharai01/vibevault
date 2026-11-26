// Edge Function: refresh-catalog
// Called daily by pg_cron (see supabase/setup/schedule.sql) with the x-cron-secret header.
// Optional query param ?source=flipkart|ebay limits the run to one marketplace.

import { buildDb, buildProviders, CORS_HEADERS, jsonResponse, safeEqual } from '../_shared/context.ts';
import { fetchFxRate } from '../_shared/fx.ts';
import { refreshCatalog } from '../_shared/refresh.ts';
import type { Source } from '../_shared/types.ts';

const env = (key: string) => Deno.env.get(key);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Use POST.' });

  const secret = env('REFRESH_CRON_SECRET');
  const provided = req.headers.get('x-cron-secret') ?? '';
  if (!secret || !safeEqual(provided, secret)) return jsonResponse(401, { error: 'Unauthorized.' });

  const requested = new URL(req.url).searchParams.get('source');
  const sources: Source[] = requested === 'flipkart' || requested === 'ebay' ? [requested] : ['flipkart', 'ebay'];

  try {
    const summary = await refreshCatalog(
      {
        db: buildDb(env, fetch),
        providers: buildProviders(env, fetch),
        fetchFx: (base, quote) => fetchFxRate(base, quote, fetch),
        now: () => new Date(),
      },
      sources,
    );
    return jsonResponse(200, summary);
  } catch (error) {
    console.error('refresh-catalog failed', error);
    return jsonResponse(500, { error: error instanceof Error ? error.message : 'Refresh failed.' });
  }
});
