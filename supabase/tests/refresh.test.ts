// Runs the real refresh and live-check code (supabase/functions/_shared) against the real
// migrations in PGlite, with fake marketplaces, coupon feeds and archives.
// Run: npm run test:db

import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, it } from 'node:test';
import { liveItemCheck } from '../functions/_shared/liveItem.ts';
import { runRefresh, type RefreshDeps } from '../functions/_shared/refresh.ts';
import type { HistoryProvider, MarketplaceProvider, NormalizedListing, NormalizedOffer, OfferProvider } from '../functions/_shared/types.ts';
import { pgliteDb } from './pgliteDb.ts';

const MIGRATIONS = new URL('../migrations/', import.meta.url);

async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role;');
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  }
  return db;
}

const NOW = new Date('2026-11-26T10:00:00Z');

function listing(id: string, extra: Partial<NormalizedListing> = {}): NormalizedListing {
  return {
    source: 'ebay',
    market: 'GB',
    sourceItemId: id,
    title: `Women's linen shirt ${id}`,
    description: null,
    brand: null,
    imageUrl: null,
    productUrl: `https://www.ebay.co.uk/itm/${id}`,
    condition: 'Good',
    size: null,
    colorText: 'White',
    seller: null,
    currency: 'GBP',
    price: 20,
    originalPrice: null,
    listedAt: null,
    available: true,
    department: null,
    categoryText: null,
    promo: null,
    ...extra,
  };
}

interface Fakes {
  searches: string[];
  lookups: string[];
}

function fakeEbay(fakes: Fakes, results: Record<string, NormalizedListing[]>, known: Record<string, NormalizedListing | null>): MarketplaceProvider {
  return {
    source: 'ebay',
    markets: ['GB'],
    async search(req) {
      fakes.searches.push(req.queryEn);
      return results[req.queryEn] ?? [];
    },
    async lookup(id) {
      fakes.lookups.push(id);
      if (id === 'boom') throw new Error('timeout');
      return id in known ? known[id] : null;
    },
  };
}

function deps(db: PGlite, providers: RefreshDeps['providers'], extra: Partial<RefreshDeps> = {}): RefreshDeps {
  return {
    db: pgliteDb(db),
    providers,
    offerSources: {},
    archives: [],
    fetchFx: async () => ({ observedOn: '2026-11-25', perEur: { EUR: 1, INR: 98.1, USD: 1.06, GBP: 0.84 } }),
    now: () => NOW,
    ...extra,
  };
}

describe('refresh', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await freshDb();
    // Only two search terms, so the run is easy to follow.
    await db.exec(`update search_terms set enabled = (query in ('women white linen shirt', 'floral maxi dress'))`);
  });

  it('stores exchange rates at most every 12 hours', async () => {
    const first = await runRefresh(deps(db, {}));
    assert.deepEqual(first.fx, { status: 'ok', currencies: 3, observedOn: '2026-11-25' });
    const rates = await db.query<{ currency: string; per_eur: string }>(`select currency, per_eur::text from fx_latest order by currency`);
    assert.deepEqual(rates.rows, [
      { currency: 'GBP', per_eur: '0.840000' },
      { currency: 'INR', per_eur: '98.100000' },
      { currency: 'USD', per_eur: '1.060000' },
    ]);
    assert.equal((await runRefresh(deps(db, {}))).fx.status, 'skipped');
  });

  it('re-checks known listings, discovers new ones and records why listings ended', async () => {
    const fakes: Fakes = { searches: [], lookups: [] };
    await db.query(`select ingest_listings($1::jsonb, '2026-11-24')`, [
      JSON.stringify(
        ['known', 'sold', 'boom'].map((id) => ({
          id: `ebay:GB:${id}`, source: 'ebay', market: 'GB', source_item_id: id, title: `Shirt ${id}`,
          product_url: `https://e/${id}`, category: 'Tops', department: 'women', style_archetypes: ['Minimalist'],
          condition: 'Good', colors: [], currency: 'GBP', current_price: 25, available: true,
        })),
      ),
    ]);
    // Two days before the refresh's clock (NOW), not the real clock, so the test doesn't depend on today's date.
    await db.exec(`update listings set last_checked_at = '2026-11-24T10:00:00Z'`);

    const provider = fakeEbay(
      fakes,
      {
        'women white linen shirt': [listing('new1'), listing('kid', { title: 'Girls linen shirt age 8' }), listing('both')],
        'floral maxi dress': [listing('both', { title: 'Boho floral maxi dress' }), listing('case', { title: 'Phone case floral' })],
      },
      { known: listing('known', { title: 'Shirt known', price: 19.5, promo: { code: 'SAVE5', description: '£5 off', minSpend: 30, currency: 'GBP', startsAt: null, endsAt: '2099-01-01T00:00:00Z' } }) },
    );
    const summary = await runRefresh(deps(db, { ebay: provider }));
    const job = summary.jobs[0];
    assert.equal(job.kind, 'catalog');
    assert.equal(job.market, 'GB');
    assert.equal(job.status, 'partial');
    assert.equal(job.checked, 2);
    assert.equal(job.found, 2);
    assert.match(job.errors.join(' '), /lookup ebay:GB:boom: timeout/);

    const rows = (
      await db.query<{ id: string; available: boolean; end_reason: string | null; current_price: string; category: string }>(
        `select id, available, end_reason, current_price::text, category from listings order by id`,
      )
    ).rows;
    assert.deepEqual(rows, [
      { id: 'ebay:GB:boom', available: true, end_reason: null, current_price: '25.00', category: 'Tops' },
      { id: 'ebay:GB:both', available: true, end_reason: null, current_price: '20.00', category: 'Tops' },
      { id: 'ebay:GB:known', available: true, end_reason: null, current_price: '19.50', category: 'Tops' },
      { id: 'ebay:GB:new1', available: true, end_reason: null, current_price: '20.00', category: 'Tops' },
      { id: 'ebay:GB:sold', available: false, end_reason: 'gone', current_price: '25.00', category: 'Tops' },
    ]);
    // Found by two searches: keeps both searches' styles. Kids' items and phone cases are never stored.
    const both = await db.query<{ style_archetypes: string[] }>(`select style_archetypes from listings where id = 'ebay:GB:both'`);
    assert.deepEqual(both.rows[0].style_archetypes, ['Minimalist', 'Bohemian']);
    assert.equal((await db.query(`select 1 from search_runs`)).rows.length, 2);
    const promo = await db.query<{ id: string; code: string }>(`select id, code from active_offers`);
    assert.deepEqual(promo.rows, [{ id: 'ebay:GB:known:SAVE5', code: 'SAVE5' }]);
    const run = await db.query<{ kind: string; market: string; status: string }>(`select kind, market, status from refresh_runs where kind = 'catalog'`);
    assert.deepEqual(run.rows, [{ kind: 'catalog', market: 'GB', status: 'partial' }]);

    // The pair isn't due again for hours_between_runs.
    assert.equal((await runRefresh(deps(db, { ebay: provider }))).jobs.length, 0);
  });

  it('retires listings a search-only marketplace hasn’t seen for two weeks', async () => {
    const searchOnly: MarketplaceProvider = { source: 'google_shopping', markets: ['IN'], search: async () => [] };
    await db.query(`select ingest_listings($1::jsonb, '2026-11-01')`, [
      JSON.stringify([
        { id: 'google_shopping:IN:old', source: 'google_shopping', market: 'IN', source_item_id: 'old', title: 'Kurta', product_url: 'https://g/old', category: 'Tops', department: 'men', style_archetypes: [], condition: 'New with tags', colors: [], currency: 'INR', current_price: 999, available: true },
        { id: 'google_shopping:IN:recent', source: 'google_shopping', market: 'IN', source_item_id: 'recent', title: 'Kurta 2', product_url: 'https://g/recent', category: 'Tops', department: 'men', style_archetypes: [], condition: 'New with tags', colors: [], currency: 'INR', current_price: 999, available: true },
      ]),
    ]);
    await db.exec(`update listings set last_checked_at = '2026-11-01T00:00:00Z' where id = 'google_shopping:IN:old'`);
    await db.exec(`update listings set last_checked_at = '2026-11-20T00:00:00Z' where id = 'google_shopping:IN:recent'`);
    await runRefresh(deps(db, { google_shopping: searchOnly }));
    const rows = (await db.query<{ id: string; end_reason: string | null }>(`select id, end_reason from listings order by id`)).rows;
    assert.deepEqual(rows, [
      { id: 'google_shopping:IN:old', end_reason: 'stale' },
      { id: 'google_shopping:IN:recent', end_reason: null },
    ]);
  });

  it('imports archived history once per listing', async () => {
    const fakes: Fakes = { searches: [], lookups: [] };
    await db.query(`select ingest_listings($1::jsonb, '2026-11-26')`, [
      JSON.stringify([{ id: 'ebay:GB:a1', source: 'ebay', market: 'GB', source_item_id: 'a1', title: 'Shirt', product_url: 'https://e/a1', category: 'Tops', department: 'women', style_archetypes: [], condition: 'Good', colors: [], currency: 'GBP', current_price: 20, available: true }]),
    ]);
    const asked: string[] = [];
    const archive: HistoryProvider = {
      name: 'test-archive',
      source: 'ebay',
      markets: ['GB'],
      history: async (id) => {
        asked.push(id);
        return { currency: 'GBP', points: [{ date: '2026-11-20', price: 24 }, { date: '2026-11-26', price: 99 }] };
      },
    };
    await runRefresh(deps(db, { ebay: fakeEbay(fakes, {}, {}) }, { archives: [archive] }));
    const points = (await db.query<{ d: string; price: string; origin: string }>(`select observed_on::text as d, price::text, origin from price_points order by 1`)).rows;
    assert.deepEqual(points, [
      { d: '2026-11-20', price: '24.00', origin: 'archive' },
      { d: '2026-11-26', price: '20.00', origin: 'observed' },
    ]);
    assert.deepEqual(asked, ['a1']);
  });

  it('replaces a coupon feed’s offers only after a successful fetch', async () => {
    const offer = (id: string): NormalizedOffer => ({
      network: 'cuelinks', networkOfferId: id, merchant: 'Myntra', merchantDomain: 'myntra.com', markets: ['IN'],
      title: `Offer ${id}`, description: null, code: 'MYN10', url: `https://linksredirect.com/${id}`, discountText: '10% off',
      minSpend: null, currency: null, startsAt: null, endsAt: '2099-01-01T00:00:00Z', categories: [], imageUrl: null,
    });
    let fail = false;
    const feed: OfferProvider = {
      network: 'cuelinks',
      markets: ['IN'],
      fetchOffers: async () => {
        if (fail) throw new Error('HTTP 500');
        return [offer('a'), offer('b'), { ...offer('old'), endsAt: '2020-01-01T00:00:00Z' }];
      },
    };
    const first = await runRefresh(deps(db, {}, { offerSources: { cuelinks: feed } }));
    assert.equal(first.jobs[0].offers, 2);
    assert.equal((await db.query(`select id from active_offers`)).rows.length, 2);

    fail = true;
    await db.exec(`update offer_feeds set last_run_at = null`);
    const second = await runRefresh(deps(db, {}, { offerSources: { cuelinks: feed } }));
    assert.equal(second.jobs[0].status, 'error');
    assert.equal((await db.query(`select id from active_offers`)).rows.length, 2, 'a failed fetch keeps the last good offers');
  });

  it('lists what isn’t configured without calling anything', async () => {
    const summary = await runRefresh(deps(db, { amazon: { missing: 'Amazon is not connected.' } }));
    assert.deepEqual(summary.notConfigured, ['Amazon is not connected.']);
    assert.equal(summary.jobs.length, 0);
  });
});

describe('live item check', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await freshDb();
    await db.query(`select ingest_listings($1::jsonb, '2026-11-25')`, [
      JSON.stringify(['live', 'gone', 'fresh'].map((id) => ({
        id: `ebay:GB:${id}`, source: 'ebay', market: 'GB', source_item_id: id, title: `Shirt ${id}`, product_url: `https://e/${id}`,
        category: 'Tops', department: 'women', style_archetypes: [], condition: 'Good', colors: [], currency: 'GBP', current_price: 25, available: true,
      }))),
    ]);
    await db.exec(`update listings set last_checked_at = now() - interval '1 hour' where id <> 'ebay:GB:fresh'`);
  });

  const check = (providers: RefreshDeps['providers'], id: unknown) =>
    liveItemCheck({ db: pgliteDb(db), providers, now: () => new Date() }, id);

  it('validates ids and finds only catalogue listings', async () => {
    assert.equal((await check({}, 'nope')).status, 400);
    assert.equal((await check({}, 'ebay:GB:unknown')).status, 404);
  });

  it('serves recently checked listings without calling the marketplace', async () => {
    const fakes: Fakes = { searches: [], lookups: [] };
    const result = await check({ ebay: fakeEbay(fakes, {}, {}) }, 'ebay:GB:fresh');
    assert.equal(result.body.checked, 'recent');
    assert.deepEqual(fakes.lookups, []);
  });

  it('re-checks the price live, and marks sold listings', async () => {
    const fakes: Fakes = { searches: [], lookups: [] };
    const provider = fakeEbay(fakes, {}, { live: listing('live', { price: 18 }) });
    const live = await check({ ebay: provider }, 'ebay:GB:live');
    assert.equal(live.body.checked, 'live');
    assert.equal(Number((live.body.item as { current_price: number }).current_price), 18);
    const gone = await check({ ebay: provider }, 'ebay:GB:gone');
    assert.equal((gone.body.item as { available: boolean; end_reason: string }).available, false);
    assert.equal((gone.body.item as { end_reason: string }).end_reason, 'gone');
  });

  it('says when a marketplace can’t be checked on demand or isn’t connected', async () => {
    const searchOnly: MarketplaceProvider = { source: 'ebay', markets: ['GB'], search: async () => [] };
    assert.equal((await check({ ebay: searchOnly }, 'ebay:GB:live')).body.checked, 'unsupported');
    assert.equal((await check({ ebay: { missing: 'x' } }, 'ebay:GB:live')).body.checked, 'unavailable');
  });
});
