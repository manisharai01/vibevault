// Edge Function: refresh-catalog
// Called every 10 minutes by pg_cron (see supabase/setup/schedule.sql) with the
// x-cron-secret header. Each call refreshes exchange rates when due, then the most overdue
// marketplace + market and the most overdue coupon feed. Optional query params:
//   ?catalog=N&offers=N   run up to N jobs of each kind in this call (max 5)

import { buildArchives, buildDb, buildOfferSources, buildProviders, CORS_HEADERS, jsonResponse, safeEqual } from '../_shared/context.ts';
import { fetchEcbRates } from '../_shared/fx.ts';
import { runRefresh } from '../_shared/refresh.ts';

const env = (key: string) => Deno.env.get(key);
const count = (value: string | null, fallback: number) => {
  const n = Number(value ?? fallback);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, 5) : fallback;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Use POST.' });

  const secret = env('REFRESH_CRON_SECRET');
  const provided = req.headers.get('x-cron-secret') ?? '';
  if (!secret || !safeEqual(provided, secret)) return jsonResponse(401, { error: 'Unauthorized.' });

  const params = new URL(req.url).searchParams;
  try {
    const summary = await runRefresh(
      {
        db: buildDb(env, fetch),
        providers: buildProviders(env, fetch),
        offerSources: buildOfferSources(env, fetch),
        archives: buildArchives(env, fetch),
        fetchFx: () => fetchEcbRates(fetch),
        now: () => new Date(),
      },
      { catalogJobs: count(params.get('catalog'), 1), offerJobs: count(params.get('offers'), 1) },
    );
    return jsonResponse(200, summary);
  } catch (error) {
    console.error('refresh-catalog failed', error);
    return jsonResponse(500, { error: error instanceof Error ? error.message : 'Refresh failed.' });
  }
});
