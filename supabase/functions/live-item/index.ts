// Edge Function: live-item
// POST { "id": "<source>:<market>:<itemId>" } → the listing with its price re-checked on
// the marketplace (at most once every 15 minutes per listing).

import { buildDb, buildProviders, CORS_HEADERS, jsonResponse } from '../_shared/context.ts';
import { liveItemCheck } from '../_shared/liveItem.ts';

const env = (key: string) => Deno.env.get(key);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Use POST.' });

  let id: unknown;
  try {
    id = (await req.json())?.id;
  } catch {
    return jsonResponse(400, { error: 'Body must be JSON: { "id": "..." }' });
  }

  try {
    const result = await liveItemCheck({ db: buildDb(env, fetch), providers: buildProviders(env, fetch), now: () => new Date() }, id);
    return jsonResponse(result.status, result.body);
  } catch (error) {
    console.error('live-item failed', error);
    return jsonResponse(500, { error: 'Price check failed.' });
  }
});
