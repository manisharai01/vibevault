// Verifies marketplace credentials and response parsing against the real APIs.
// Usage: npm run providers:check   (reads supabase/functions/.env)
// Prints only results; never prints keys.

import { readFileSync } from 'node:fs';
import { buildProviders } from '../supabase/functions/_shared/context.ts';
import { fetchFxRate } from '../supabase/functions/_shared/fx.ts';
import { isConfigured } from '../supabase/functions/_shared/refresh.ts';

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
const env = loadEnv();
const providers = buildProviders((key) => env[key], fetch);
let failures = 0;

for (const [source, slot] of Object.entries(providers)) {
  console.log(`\n=== ${source} ===`);
  if (!isConfigured(slot)) {
    console.log(`skipped: ${slot.missing}`);
    continue;
  }
  try {
    const started = Date.now();
    const results = await slot.search(query, 3);
    console.log(`search "${query}": ${results.length} result(s) in ${Date.now() - started} ms`);
    for (const r of results) {
      console.log(`  • ${r.title} — ${r.currency} ${r.price}${r.originalPrice ? ` (was ${r.originalPrice})` : ''} · ${r.condition} · ${r.id}`);
      console.log(`    image: ${r.imageUrl ?? 'none'}`);
    }
    if (results.length === 0) {
      console.log('  (no results — try another search term)');
    } else {
      const first = results[0];
      const again = await slot.lookup(first.sourceItemId);
      console.log(`lookup ${first.id}: ${again ? `${again.currency} ${again.price}, available=${again.available}` : 'not found'}`);
    }
  } catch (error) {
    failures++;
    console.log(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    const body = (error as { body?: string })?.body;
    if (body) console.log(`  response: ${body.slice(0, 300)}`);
  }
}

console.log('\n=== exchange rate ===');
try {
  const fx = await fetchFxRate('USD', 'INR', fetch);
  console.log(`USD/INR ${fx.rate} (${fx.observedOn})`);
} catch (error) {
  failures++;
  console.log(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
}

process.exit(failures > 0 ? 1 : 0);
