// Verifies marketplace, coupon-feed and price-archive credentials against the real APIs and
// shows what was parsed. Usage:
//   npm run providers:check                 (reads supabase/functions/.env)
//   npm run providers:check -- "linen shirt" IN
// Prints only results; never prints keys.

import { readFileSync } from 'node:fs';
import { buildArchives, buildOfferSources, buildProviders } from '../supabase/functions/_shared/context.ts';
import { fetchEcbRates } from '../supabase/functions/_shared/fx.ts';
import { prepareListing } from '../supabase/functions/_shared/pipeline.ts';
import { isConfigured } from '../supabase/functions/_shared/types.ts';

const ENV_FILE = new URL('../supabase/functions/.env', import.meta.url);

function loadEnv(): Record<string, string> {
  let text = '';
  try {
    text = readFileSync(ENV_FILE, 'utf8');
  } catch {
    console.error('Missing supabase/functions/.env — copy supabase/functions/.env.example and fill in your keys.');
    process.exit(1);
  }
  const vars: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !line.trimStart().startsWith('#')) vars[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return vars;
}

const query = process.argv[2] ?? 'denim jacket';
const preferredMarket = (process.argv[3] ?? '').toUpperCase();
const env = loadEnv();
const getEnv = (key: string) => env[key];
let failures = 0;
const fail = (error: unknown) => {
  failures++;
  console.log(`  FAILED: ${error instanceof Error ? error.message : String(error)}`);
  const body = (error as { body?: string })?.body;
  if (body) console.log(`  response: ${body.slice(0, 300)}`);
};

console.log('\n######## Marketplaces ########');
for (const [source, slot] of Object.entries(buildProviders(getEnv, fetch))) {
  console.log(`\n=== ${source} ===`);
  if (!isConfigured(slot)) {
    console.log(`skipped: ${slot.missing}`);
    continue;
  }
  const market = slot.markets.includes(preferredMarket) ? preferredMarket : slot.markets[0];
  console.log(`markets: ${slot.markets.join(', ')} (testing ${market})`);
  try {
    const started = Date.now();
    const results = await slot.search({ query, queryEn: query, category: 'Outerwear', department: 'unisex', market, limit: 3 });
    console.log(`search "${query}": ${results.length} result(s) in ${Date.now() - started} ms`);
    for (const r of results) {
      const prepared = prepareListing(r, { category: 'Outerwear', department: 'unisex', archetypes: [] });
      const row = 'row' in prepared ? prepared.row : null;
      console.log(`  • ${r.title} — ${r.currency} ${r.price}${r.originalPrice ? ` (was ${r.originalPrice})` : ''} · ${r.condition} · ${r.sourceItemId}`);
      console.log(`    ${row ? `${row.category} · ${row.department} · ${row.style_archetypes.join('/') || 'no style words'}` : `rejected: ${'rejected' in prepared ? prepared.rejected : ''}`}`);
      if (r.promo) console.log(`    promo: ${r.promo.code ?? '(no code)'} ${r.promo.description} until ${r.promo.endsAt ?? '?'}`);
    }
    if (results.length > 0 && slot.lookup) {
      const again = await slot.lookup(results[0].sourceItemId, market);
      console.log(`lookup ${results[0].sourceItemId}: ${again ? `${again.currency} ${again.price}, available=${again.available}` : 'not found'}`);
    } else if (!slot.lookup) {
      console.log('(no single-item lookup: listings are re-confirmed by daily searches)');
    }
  } catch (error) {
    fail(error);
  }
}

console.log('\n######## Price archives ########');
const archives = buildArchives(getEnv, fetch);
for (const slot of archives) {
  if (!isConfigured(slot)) {
    console.log(`skipped: ${slot.missing}`);
    continue;
  }
  console.log(`${slot.name} (${slot.source}): markets ${slot.markets.join(', ')} — tested when an ${slot.source} listing is imported`);
}

console.log('\n######## Coupon feeds ########');
for (const [network, slot] of Object.entries(buildOfferSources(getEnv, fetch))) {
  console.log(`\n=== ${network} ===`);
  if (!isConfigured(slot)) {
    console.log(`skipped: ${slot.missing}`);
    continue;
  }
  const market = slot.markets.includes(preferredMarket) ? preferredMarket : slot.markets[0];
  try {
    const offers = await slot.fetchOffers(market);
    console.log(`${market}: ${offers.length} valid offer(s)`);
    for (const o of offers.slice(0, 5)) {
      console.log(`  • ${o.merchant}: ${o.title}${o.code ? ` — code ${o.code}` : ''} (until ${o.endsAt ?? 'no end date'})`);
    }
  } catch (error) {
    fail(error);
  }
}

console.log('\n######## Exchange rates ########');
try {
  const fx = await fetchEcbRates(fetch);
  console.log(`ECB ${fx.observedOn}: ${Object.keys(fx.perEur).length} currencies (1 EUR = ${fx.perEur.INR} INR, ${fx.perEur.USD} USD)`);
} catch (error) {
  fail(error);
}

process.exit(failures > 0 ? 1 : 0);
