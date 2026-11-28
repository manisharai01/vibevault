// Runs the real migrations in PGlite (Postgres compiled to WebAssembly) and checks the
// database logic: re-keying, ingest, search rotation, the refresh queue, coupons and the
// price-prediction model with its track record.
// Run: npm run test:db

import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const migrationFiles = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

async function freshDb(options: { stopBefore?: string } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role;');
  for (const file of migrationFiles) {
    if (options.stopBefore && file >= options.stopBefore) break;
    await db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  }
  return db;
}

async function rows<T = Record<string, unknown>>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

async function one<T = Record<string, unknown>>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  const result = await rows<T>(db, sql, params);
  assert.equal(result.length, 1, `expected one row from: ${sql}`);
  return result[0];
}

const day = (n: number) => `date '2026-01-01' + ${n}`;

function listingRow(id: string, extra: Record<string, unknown> = {}) {
  const [source, market, itemId] = id.split(':');
  return {
    id,
    source,
    market,
    source_item_id: itemId,
    title: `Item ${itemId}`,
    description: null,
    brand: null,
    image_url: null,
    product_url: `https://example.com/${itemId}`,
    category: 'Tops',
    department: 'women',
    style_archetypes: ['Minimalist'],
    condition: 'Good',
    size: null,
    colors: [],
    seller: null,
    currency: 'USD',
    current_price: 100,
    original_price: null,
    available: true,
    listed_at: null,
    ...extra,
  };
}

describe('migrations', () => {
  it('re-keys listings from the first schema to <source>:<market>:<item>', async () => {
    const db = await freshDb({ stopBefore: '20261127' });
    await db.exec(`
      insert into listings (id, source, source_item_id, title, product_url, category, condition, region, currency, current_price, available)
      values ('flipkart:ABC', 'flipkart', 'ABC', 'Shirt', 'https://f/abc', 'Tops', 'New with tags', 'India', 'INR', 999, true),
             ('ebay:v1|9|0', 'ebay', 'v1|9|0', 'Jacket', 'https://e/9', 'Outerwear', 'Good', 'Global', 'USD', 20, false);
      insert into price_points values ('flipkart:ABC', '2026-11-25', 1099, 'INR'), ('flipkart:ABC', '2026-11-26', 999, 'INR');
    `);
    // Apply the global-catalogue migration (and everything after it) to the old data.
    for (const file of migrationFiles.filter((name) => name >= '20261127')) await db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
    const listings = await rows<{ id: string; market: string; end_reason: string | null }>(
      db,
      'select id, market, end_reason from listings order by id',
    );
    assert.deepEqual(listings, [
      { id: 'ebay:IN:v1|9|0', market: 'IN', end_reason: 'gone' },
      { id: 'flipkart:IN:ABC', market: 'IN', end_reason: null },
    ]);
    const points = await one<{ n: number }>(db, `select count(*)::int as n from price_points where listing_id = 'flipkart:IN:ABC'`);
    assert.equal(points.n, 2);
    // Renaming a listing cascades to its price history.
    await db.exec(`update listings set id = 'flipkart:IN:XYZ' where id = 'flipkart:IN:ABC'`);
    assert.equal((await one<{ n: number }>(db, `select count(*)::int as n from price_points where listing_id = 'flipkart:IN:XYZ'`)).n, 2);
  });
});

describe('catalogue functions', () => {
  let db: PGlite;
  before(async () => {
    db = await freshDb();
  });

  it('seeds marketplaces, markets and translated search terms', async () => {
    const counts = await one<{ m: number; mm: number; t: number }>(
      db,
      `select (select count(*)::int from marketplaces) as m, (select count(*)::int from marketplace_markets) as mm,
              (select count(*)::int from search_terms) as t`,
    );
    assert.equal(counts.m, 7);
    assert.ok(counts.mm >= 65, `markets: ${counts.mm}`);
    assert.ok(counts.t >= 55, `terms: ${counts.t}`);
  });

  it('ingests listings with market and department, and records why they ended', async () => {
    const items = [
      listingRow('ebay:GB:1', { currency: 'GBP', current_price: 25 }),
      listingRow('ebay:GB:2', { available: false }),
    ];
    await db.query(`select ingest_listings($1::jsonb, '2026-02-01')`, [JSON.stringify(items)]);
    const stored = await rows(db, `select id, market, department, available, ended_on::text, end_reason from listings where source = 'ebay' order by id`);
    assert.deepEqual(stored, [
      { id: 'ebay:GB:1', market: 'GB', department: 'women', available: true, ended_on: null, end_reason: null },
      { id: 'ebay:GB:2', market: 'GB', department: 'women', available: false, ended_on: '2026-02-01', end_reason: 'gone' },
    ]);
    const points = await rows(db, `select listing_id, observed_on::text, price::float, origin from price_points order by listing_id`);
    assert.deepEqual(points, [{ listing_id: 'ebay:GB:1', observed_on: '2026-02-01', price: 25, origin: 'observed' }]);

    // Back in stock: the end markers clear.
    await db.query(`select ingest_listings($1::jsonb, '2026-02-02')`, [JSON.stringify([listingRow('ebay:GB:2')])]);
    assert.deepEqual(await one(db, `select available, ended_on, end_reason from listings where id = 'ebay:GB:2'`), {
      available: true,
      ended_on: null,
      end_reason: null,
    });

    // Retiring: 'stale' keeps last_checked_at; already-ended listings aren't touched.
    assert.equal((await one<{ n: number }>(db, `select end_listings(array['ebay:GB:1','ebay:GB:2'], 'stale', '2026-02-05') as n`)).n, 2);
    assert.equal((await one<{ n: number }>(db, `select end_listings(array['ebay:GB:1'], 'gone') as n`)).n, 0);
    assert.equal((await one<{ r: string }>(db, `select end_reason as r from listings where id = 'ebay:GB:1'`)).r, 'stale');
  });

  it('imports archived prices without overwriting recorded ones', async () => {
    const n = await one<{ n: number }>(
      db,
      `select ingest_history('ebay:GB:1', 'GBP', '[{"date":"2026-01-31","price":27},{"date":"2026-02-01","price":99},{"date":"2026-01-30","price":0}]'::jsonb) as n`,
    );
    assert.equal(n.n, 1);
    const points = await rows(db, `select observed_on::text as d, price::float as p, origin from price_points where listing_id = 'ebay:GB:1' order by 1`);
    assert.deepEqual(points, [
      { d: '2026-01-31', p: 27, origin: 'archive' },
      { d: '2026-02-01', p: 25, origin: 'observed' },
    ]);
  });

  it('rotates search terms per marketplace and market, in the market language', async () => {
    const jp = await rows<{ query: string; query_en: string }>(db, `select * from next_search_terms('amazon', 'JP', 2)`);
    assert.equal(jp.length, 2);
    assert.equal(jp[0].query, 'レディース 白 リネンシャツ');
    assert.equal(jp[0].query_en, 'women white linen shirt');

    const inTerms = await rows<{ query: string }>(db, `select query from next_search_terms('flipkart', 'IN', 200)`);
    const usTerms = await rows<{ query: string }>(db, `select query from next_search_terms('ebay', 'US', 200)`);
    assert.ok(inTerms.some((t) => t.query === 'saree'));
    assert.ok(!usTerms.some((t) => t.query === 'saree'), 'India-only terms are not searched elsewhere');

    const first = await one<{ id: number }>(db, `select id from next_search_terms('ebay', 'US', 1)`);
    await db.query(`insert into search_runs (term_id, source, market, last_run_at) values ($1, 'ebay', 'US', now())`, [first.id]);
    const next = await one<{ id: number }>(db, `select id from next_search_terms('ebay', 'US', 1)`);
    assert.notEqual(next.id, first.id);
  });

  it('claims the most overdue configured marketplace and market', async () => {
    const a = await one<{ source: string; market: string; language: string }>(
      db,
      `select * from claim_catalog_job(array['ebay:GB', 'ebay:DE'])`,
    );
    assert.equal(a.source, 'ebay');
    const b = await one<{ market: string }>(db, `select market from claim_catalog_job(array['ebay:GB', 'ebay:DE'])`);
    assert.notEqual(a.market, b.market);
    // Both ran within hours_between_runs: nothing is due.
    assert.equal((await rows(db, `select * from claim_catalog_job(array['ebay:GB', 'ebay:DE'])`)).length, 0);
    // Pairs a provider is configured for but that weren't seeded are created on the fly.
    const created = await one<{ market: string; language: string }>(db, `select market, language from claim_catalog_job(array['aliexpress:NG'])`);
    assert.deepEqual(created, { market: 'NG', language: 'en' });
  });
});

describe('offers', () => {
  let db: PGlite;
  before(async () => {
    db = await freshDb();
  });

  const offer = (id: string, extra: Record<string, unknown> = {}) => ({
    network_offer_id: id,
    merchant: 'Flipkart',
    merchant_domain: 'flipkart.com',
    title: `Offer ${id}`,
    description: null,
    code: null,
    url: `https://www.flipkart.com/offer/${id}`,
    discount_text: '10% off',
    min_spend: null,
    currency: null,
    starts_at: null,
    ends_at: null,
    categories: ['Fashion'],
    image_url: null,
    ...extra,
  });

  it('stores a feed, matches merchants to marketplaces and withdraws offers the feed dropped', async () => {
    await db.query(`select store_offers('cuelinks', 'IN', $1::jsonb)`, [
      JSON.stringify([offer('a', { code: 'SAVE10' }), offer('b'), offer('c', { merchant: 'Myntra', merchant_domain: 'myntra.com' })]),
    ]);
    const stored = await rows(db, `select id, source, code, active from offers order by id`);
    assert.deepEqual(stored, [
      { id: 'cuelinks:IN:a', source: 'flipkart', code: 'SAVE10', active: true },
      { id: 'cuelinks:IN:b', source: 'flipkart', code: null, active: true },
      { id: 'cuelinks:IN:c', source: null, code: null, active: true },
    ]);

    await db.exec(`update offers set last_seen_at = now() - interval '2 hours'`);
    await db.query(`select store_offers('cuelinks', 'IN', $1::jsonb)`, [JSON.stringify([offer('a', { code: 'SAVE10' })])]);
    const active = await rows<{ id: string }>(db, `select id from active_offers order by id`);
    assert.deepEqual(active.map((o) => o.id), ['cuelinks:IN:a']);
  });

  it('only shows offers that are in date and recently confirmed', async () => {
    await db.query(`select store_offers('admitad', 'GB', $1::jsonb)`, [
      JSON.stringify([
        offer('live', { ends_at: '2099-01-01T00:00:00Z' }),
        offer('expired', { ends_at: '2020-01-01T00:00:00Z' }),
        offer('future', { starts_at: '2099-01-01T00:00:00Z' }),
      ]),
    ]);
    const ids = (await rows<{ id: string }>(db, `select id from active_offers where network = 'admitad'`)).map((o) => o.id);
    assert.deepEqual(ids, ['admitad:GB:live']);
    await db.exec(`update offers set last_seen_at = now() - interval '27 hours' where id = 'admitad:GB:live'`);
    assert.equal((await rows(db, `select id from active_offers where network = 'admitad'`)).length, 0);
  });

  it('attaches marketplace promo codes to listings and withdraws them when they disappear', async () => {
    await db.query(`select ingest_listings($1::jsonb, '2026-02-01')`, [
      JSON.stringify([listingRow('aliexpress:IN:100', { currency: 'INR', current_price: 500 })]),
    ]);
    await db.query(`select store_listing_promos(array['aliexpress:IN:100'], $1::jsonb)`, [
      JSON.stringify([{ listing_id: 'aliexpress:IN:100', code: 'AE50', description: '₹50 off over ₹400', min_spend: 400, currency: 'INR', starts_at: null, ends_at: '2099-01-01T00:00:00Z' }]),
    ]);
    const promo = await one(db, `select id, listing_id, code, source, url from active_offers where listing_id is not null`);
    assert.deepEqual(promo, {
      id: 'aliexpress:IN:100:AE50',
      listing_id: 'aliexpress:IN:100',
      code: 'AE50',
      source: 'aliexpress',
      url: 'https://example.com/100',
    });
    await db.exec(`update offers set last_seen_at = now() - interval '2 hours'`);
    await db.query(`select store_listing_promos(array['aliexpress:IN:100'], '[]'::jsonb)`);
    assert.equal((await rows(db, `select id from active_offers where listing_id is not null`)).length, 0);
  });
});

describe('price model', () => {
  let db: PGlite;
  // 20 "sale cycle" listings: 100 for 7 days, then 90 for 7 days, repeating.
  // 20 "steady" listings: always 100.
  const CYCLE = 'ebay:US:cycle';
  const STEADY = 'ebay:US:steady';

  async function addDays(from: number, to: number, skip: string[] = []) {
    await db.query(
      `insert into price_points (listing_id, observed_on, price, currency)
       select l.id, date '2026-01-01' + d, case when l.id like '${CYCLE}%' and d % 14 >= 7 then 90 else 100 end, 'USD'
       from listings l cross join generate_series($1::int, $2::int) as d
       where l.source = 'ebay' and not (l.id = any ($3::text[]))
       on conflict do nothing`,
      [from, to, skip],
    );
  }

  before(async () => {
    db = await freshDb();
    const items = [
      ...Array.from({ length: 20 }, (_, i) => listingRow(`${CYCLE}${i}`)),
      ...Array.from({ length: 20 }, (_, i) => listingRow(`${STEADY}${i}`, { category: 'Shoes' })),
    ];
    await db.query(`select ingest_listings($1::jsonb, ${day(0)})`, [JSON.stringify(items)]);
    await addDays(0, 112);
  });

  it('publishes nothing until enough listings have complete outcomes', async () => {
    const empty = await freshDb();
    const result = await one<{ r: { predictions: number } }>(empty, `select run_price_model(${day(112)}) as r`);
    assert.equal(result.r.predictions, 0);
  });

  it('learns from what happened to tracked prices and says wait or buy', async () => {
    const result = await one<{ r: { examples: number; predictions: number } }>(db, `select run_price_model(${day(112)}) as r`);
    assert.ok(result.r.examples > 3000, `examples: ${result.r.examples}`);
    assert.equal(result.r.predictions, 40 * 3);

    const cycle = await one<{ p: number; verdict: string; low: number; basis: string }>(
      db,
      `select p_drop::float as p, verdict, expected_low::float as low, basis from price_predictions
       where listing_id = '${CYCLE}0' and horizon_days = 14`,
    );
    assert.ok(cycle.p > 0.9, `cycle p_drop ${cycle.p}`);
    assert.equal(cycle.verdict, 'wait');
    assert.equal(cycle.low, 90);
    assert.equal(cycle.basis, 'listing');

    const steady = await one<{ p: number; verdict: string; low: number }>(
      db,
      `select p_drop::float as p, verdict, expected_low::float as low from price_predictions
       where listing_id = '${STEADY}0' and horizon_days = 14`,
    );
    assert.ok(steady.p < 0.1, `steady p_drop ${steady.p}`);
    assert.equal(steady.verdict, 'buy');
    assert.equal(steady.low, 100);
  });

  it('exposes the prediction, history and price stats in catalog_items', async () => {
    const item = await one<{ prediction: { made_on: string; price: number; horizons: Record<string, { verdict: string }> }; stats: { days: number; lowest: number; highest: number } }>(
      db,
      `select prediction, stats from catalog_items where id = '${CYCLE}0'`,
    );
    assert.equal(item.prediction.made_on, '2026-04-23');
    assert.equal(item.prediction.horizons['14'].verdict, 'wait');
    assert.deepEqual(Object.keys(item.prediction.horizons).sort(), ['14', '30', '7']);
    assert.equal(item.stats.days, 113);
    assert.equal(item.stats.lowest, 90);
    assert.equal(item.stats.highest, 100);
  });

  it('scores each prediction against what really happened', async () => {
    // One steady listing sells out three days later; the rest keep being tracked.
    const sold = `${STEADY}19`;
    await addDays(113, 140, [sold]);
    await db.exec(`select end_listings(array['${sold}'], 'gone', ${day(115)})`);
    await one(db, `select run_price_model(${day(140)}) as r`);

    const outcomes = await rows<{ h: number; outcome: string; n: number }>(
      db,
      `select horizon_days as h, outcome, count(*)::int as n from price_predictions
       where made_on = ${day(112)} group by 1, 2 order by 1, 2`,
    );
    assert.deepEqual(outcomes, [
      { h: 7, outcome: 'dropped', n: 20 },
      { h: 7, outcome: 'gone', n: 1 },
      { h: 7, outcome: 'no_drop', n: 19 },
      { h: 14, outcome: 'dropped', n: 20 },
      { h: 14, outcome: 'gone', n: 1 },
      { h: 14, outcome: 'no_drop', n: 19 },
      // 30-day windows are still open (a drop would have settled them early).
      { h: 30, outcome: 'dropped', n: 20 },
      { h: 30, outcome: null as unknown as string, n: 20 },
    ]);

    const record = await one<{ resolved: number; wait_calls: number; wait_correct: number; buy_calls: number; buy_correct: number; brier: number; brier_base_rate: number }>(
      db,
      `select resolved::int, wait_calls::int, wait_correct::int, buy_calls::int, buy_correct::int, brier::float, brier_base_rate::float
       from prediction_track_record where horizon_days = 14 and source is null`,
    );
    assert.equal(record.resolved, 40);
    assert.equal(record.wait_calls, 20);
    assert.equal(record.wait_correct, 20);
    assert.equal(record.buy_calls, 20);
    assert.equal(record.buy_correct, 20);
    assert.ok(record.brier < record.brier_base_rate, 'beats always predicting the average');

    const perSource = await one<{ resolved: number }>(db, `select resolved::int from prediction_track_record where horizon_days = 14 and source = 'ebay'`);
    assert.equal(perSource.resolved, 40);
    const calibration = await rows(db, `select bucket, resolved::int from prediction_calibration where horizon_days = 14 order by bucket`);
    assert.ok(calibration.length >= 2);
  });

  it('re-publishes one listing on demand (after a live price check)', async () => {
    await db.exec(`update price_points set price = 80 where listing_id = '${STEADY}0' and observed_on = ${day(140)}`);
    const n = await one<{ n: number }>(db, `select publish_predictions(${day(140)}, '${STEADY}0') as n`);
    assert.equal(n.n, 3);
    const p = await one<{ price: number }>(db, `select price::float from price_predictions where listing_id = '${STEADY}0' and made_on = ${day(140)} and horizon_days = 7`);
    assert.equal(p.price, 80);
  });
});

describe('when to buy', () => {
  let db: PGlite;
  const ASOF = "date '2026-11-04'";

  before(async () => {
    db = await freshDb();
    const coats = Array.from({ length: 12 }, (_, i) => listingRow(`ebay:US:coat${i}`, { category: 'Outerwear' }));
    const solo = listingRow('ebay:US:solo', { category: 'Outerwear' });
    await db.query(`select ingest_listings($1::jsonb, date '2026-11-04')`, [JSON.stringify([...coats, solo])]);
    // ~13 months of daily prices: 100, except 80 throughout December.
    await db.exec(`
      delete from price_points;
      insert into price_points (listing_id, observed_on, price, currency)
      select l.id, date '2025-10-01' + d, case when extract(month from date '2025-10-01' + d) = 12 then 80 else 100 end, 'USD'
      from listings l cross join generate_series(0, 399) as d
      where l.id like 'ebay:US:coat%';
      insert into price_points (listing_id, observed_on, price, currency)
      select 'ebay:US:solo', date '2026-07-28' + d, 100, 'USD' from generate_series(0, 99) as d;
    `);
  });

  it('learns the yearly pattern per listing and per category, with enough listings behind it', async () => {
    const result = await one<{ r: Record<string, number> }>(db, `select compute_seasonality(${ASOF}) as r`);
    assert.deepEqual(result.r, { listing_months: 144, category_months: 12, marketplace_months: 0 });
    const dec = await one<{ ratio: string; listings: number }>(db, `select ratio, listings from season_profiles where level = 'category' and month = 12`);
    assert.equal(Number(dec.ratio), 0.8);
    assert.equal(dec.listings, 12);
    const jun = await one<{ ratio: string }>(db, `select ratio from season_profiles where level = 'category' and month = 6`);
    assert.equal(Number(jun.ratio), 1);
  });

  it('gives each listing its most specific pattern in catalog_items', async () => {
    const own = await one<{ season: { basis: string; listings: number; months: Record<string, number> } }>(db, `select season from catalog_items where id = 'ebay:US:coat0'`);
    assert.equal(own.season.basis, 'listing');
    assert.equal(Number(own.season.months['12']), 0.8);
    const solo = await one<{ season: { basis: string; listings: number; months: Record<string, number> } }>(db, `select season from catalog_items where id = 'ebay:US:solo'`);
    assert.equal(solo.season.basis, 'category');
    assert.equal(solo.season.listings, 12);
    assert.equal(Number(solo.season.months['12']), 0.8);
  });

  it('lists sales announced within 90 days as upcoming, not as coupons', async () => {
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const later = new Date(Date.now() + 200 * 86_400_000).toISOString();
    const offer = (id: string, starts: string) => ({ network_offer_id: id, merchant: 'eBay', merchant_domain: 'ebay.com', title: `Sale ${id}`, url: `https://www.ebay.com/sale/${id}`, starts_at: starts, ends_at: null, categories: [] });
    await db.query(`select store_offers('awin', 'US', $1::jsonb)`, [JSON.stringify([offer('soon', soon), offer('later', later)])]);
    const upcoming = (await rows<{ id: string; source: string }>(db, `select id, source from upcoming_offers`)).map((o) => `${o.id}|${o.source}`);
    assert.deepEqual(upcoming, ['awin:US:soon|ebay']);
    assert.equal((await rows(db, `select id from active_offers`)).length, 0);
  });
});

describe('access', () => {
  it('lets the app read the catalogue but nothing else', async () => {
    const db = await freshDb();
    await db.query(`select ingest_listings($1::jsonb, '2026-02-01')`, [JSON.stringify([listingRow('ebay:US:1')])]);
    await db.exec('set role anon');
    assert.equal((await rows(db, 'select id from catalog_items')).length, 1);
    for (const view of ['catalog_status', 'available_markets', 'fx_latest', 'active_offers', 'upcoming_offers', 'season_profiles', 'prediction_track_record', 'prediction_calibration', 'model_status']) {
      await rows(db, `select * from ${view}`);
    }
    await assert.rejects(rows(db, 'select * from search_terms'), /permission denied/);
    await assert.rejects(rows(db, `select ingest_listings('[]'::jsonb)`), /permission denied/);
    await assert.rejects(rows(db, `select run_price_model()`), /permission denied/);
    await assert.rejects(rows(db, `select compute_seasonality()`), /permission denied/);
    await assert.rejects(db.exec(`update listings set current_price = 1`), /permission denied/);
    await db.exec('reset role');
  });
});
