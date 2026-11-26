import { pgrstList, type Db } from '../../../supabase/functions/_shared/db.ts';
import { liveItemCheck } from '../../../supabase/functions/_shared/liveItem.ts';
import { refreshCatalog, type ProviderSlot } from '../../../supabase/functions/_shared/refresh.ts';
import type { MarketplaceProvider, NormalizedListing, Source } from '../../../supabase/functions/_shared/types.ts';

const NOW = new Date('2026-11-26T01:00:00Z');

function listing(source: Source, itemId: string, price: number, available = true): NormalizedListing {
  return {
    id: `${source}:${itemId}`,
    source,
    sourceItemId: itemId,
    title: `Item ${itemId}`,
    description: null,
    brand: null,
    imageUrl: null,
    productUrl: `https://example.com/${itemId}`,
    condition: source === 'flipkart' ? 'New with tags' : 'Good',
    size: null,
    colors: [],
    seller: null,
    region: source === 'flipkart' ? 'India' : 'Global',
    currency: source === 'flipkart' ? 'INR' : 'USD',
    price,
    originalPrice: null,
    listedAt: null,
    available,
  };
}

interface Row {
  [key: string]: unknown;
}

/** In-memory stand-in for the PostgREST client, understanding just the filters the code uses. */
function fakeDb(initial: { listings?: Row[]; search_queries?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    listings: initial.listings ?? [],
    search_queries: initial.search_queries ?? [],
    refresh_runs: [],
    fx_rates: [],
    price_points: [],
  };
  const ingested: Row[][] = [];

  const matches = (row: Row, query: string) =>
    query.split('&').every((part) => {
      const [key, raw] = part.split('=');
      const value = decodeURIComponent(raw ?? '');
      if (['select', 'order', 'limit', 'on_conflict'].includes(key)) return true;
      const [op, ...rest] = value.split('.');
      const operand = rest.join('.');
      const field = row[key];
      if (op === 'eq') return String(field) === operand;
      if (op === 'neq') return String(field) !== operand;
      if (op === 'is') return String(field) === operand;
      if (op === 'lt') return String(field) < operand;
      if (op === 'in') return (JSON.parse(`[${operand.slice(1, -1)}]`) as string[]).includes(String(field));
      throw new Error(`unsupported filter ${part}`);
    });

  const db: Db = {
    async select<T>(table: string, query: string) {
      if (table === 'catalog_items') return tables.listings.filter((r) => matches(r, query)) as T[];
      return tables[table].filter((r) => matches(r, query)) as T[];
    },
    async insert<T>(table: string, rows: object | object[]) {
      const list = (Array.isArray(rows) ? rows : [rows]).map((r, i) => ({ id: tables[table].length + i + 1, ...r }));
      tables[table].push(...list);
      return list as T[];
    },
    async update(table: string, query: string, patch: object) {
      const hits = tables[table].filter((r) => matches(r, query));
      hits.forEach((r) => Object.assign(r, patch));
      return hits.length;
    },
    async upsert(table: string, rows: object[]) {
      tables[table].push(...(rows as Row[]));
    },
    async rpc<T>(fn: string, args: object) {
      expect(fn).toBe('ingest_listings');
      const { items } = args as { items: Row[] };
      ingested.push(items);
      for (const item of items) {
        const existing = tables.listings.find((r) => r.id === item.id);
        const merged = { ...item, last_checked_at: NOW.toISOString() };
        if (existing) Object.assign(existing, merged, { category: existing.category });
        else tables.listings.push(merged);
      }
      return items.length as T;
    },
  };
  return { db, tables, ingested };
}

function provider(source: Source, opts: { search?: Record<string, NormalizedListing[]>; lookup?: Record<string, NormalizedListing | null | Error> }) {
  const calls = { search: [] as string[], lookup: [] as string[] };
  const p: MarketplaceProvider = {
    source,
    async search(query) {
      calls.search.push(query);
      return opts.search?.[query] ?? [];
    },
    async lookup(id) {
      calls.lookup.push(id);
      const result = opts.lookup?.[id];
      if (result instanceof Error) throw result;
      return result ?? null;
    },
  };
  return { p, calls };
}

const missing = (source: Source): ProviderSlot => ({ missing: `${source} not connected` });

describe('pgrstList', () => {
  it('quotes values for in.() filters', () => {
    expect(pgrstList(['ebay:v1|1|0', 'a"b'])).toBe('("ebay:v1|1|0","a\\"b")');
  });
});

describe('refreshCatalog', () => {
  it('re-checks known listings, discovers new ones, retires stale ones and logs the run', async () => {
    const stale = new Date(NOW.getTime() - 26 * 3600_000).toISOString();
    const { db, tables, ingested } = fakeDb({
      listings: [
        { id: 'flipkart:A', source: 'flipkart', source_item_id: 'A', category: 'Tops', style_archetypes: ['Minimalist'], available: true, last_checked_at: stale },
        { id: 'flipkart:B', source: 'flipkart', source_item_id: 'B', category: 'Shoes', style_archetypes: ['Y2K'], available: true, last_checked_at: stale },
        { id: 'flipkart:OLD', source: 'flipkart', source_item_id: 'OLD', category: 'Bags', style_archetypes: [], available: true, last_checked_at: '2026-11-20T00:00:00Z' },
      ],
      search_queries: [
        { id: 1, source: 'flipkart', query: 'white shirt', category: 'Tops', style_archetype: 'Minimalist', max_results: 5, enabled: true },
        { id: 2, source: 'flipkart', query: 'oxford shirt', category: 'Tops', style_archetype: 'Preppy', max_results: 5, enabled: true },
        { id: 3, source: 'ebay', query: 'ignored', category: 'Tops', style_archetype: 'Y2K', max_results: 5, enabled: true },
      ],
    });
    const fk = provider('flipkart', {
      lookup: { A: listing('flipkart', 'A', 999), B: null, OLD: new Error('Flipkart product lookup failed with HTTP 503') },
      search: { 'white shirt': [listing('flipkart', 'C', 499)], 'oxford shirt': [listing('flipkart', 'C', 499), listing('flipkart', 'D', 799)] },
    });

    const summary = await refreshCatalog(
      { db, providers: { flipkart: fk.p, ebay: missing('ebay') }, fetchFx: jest.fn(), now: () => NOW },
      ['flipkart'],
    );

    expect(fk.calls.lookup.sort()).toEqual(['A', 'B', 'OLD']);
    expect(fk.calls.search).toEqual(['white shirt', 'oxford shirt']);
    // A re-priced with its existing category; C tagged with both searches' styles.
    expect(ingested[0]).toEqual([expect.objectContaining({ id: 'flipkart:A', current_price: 999, category: 'Tops', style_archetypes: ['Minimalist'] })]);
    expect(ingested[1]).toEqual([
      expect.objectContaining({ id: 'flipkart:C', style_archetypes: ['Minimalist', 'Preppy'], category: 'Tops' }),
      expect.objectContaining({ id: 'flipkart:D', style_archetypes: ['Preppy'] }),
    ]);
    expect(tables.listings.find((r) => r.id === 'flipkart:B')?.available).toBe(false); // gone from Flipkart
    expect(tables.listings.find((r) => r.id === 'flipkart:OLD')?.available).toBe(false); // unconfirmed for 3+ days
    expect(summary.sources[0]).toMatchObject({ source: 'flipkart', status: 'partial', checked: 2, found: 2, removed: 2 });
    expect(summary.sources[0].errors[0]).toContain('lookup flipkart:OLD');
    expect(tables.refresh_runs[0]).toMatchObject({ source: 'flipkart', status: 'partial', listings_found: 2, finished_at: NOW.toISOString() });
  });

  it('skips marketplaces without credentials and records why', async () => {
    const { db, tables } = fakeDb();
    const summary = await refreshCatalog({ db, providers: { flipkart: missing('flipkart'), ebay: missing('ebay') }, fetchFx: jest.fn(), now: () => NOW }, ['flipkart', 'ebay']);
    expect(summary.sources.map((s) => s.status)).toEqual(['skipped', 'skipped']);
    expect(tables.refresh_runs.map((r) => r.message)).toEqual(['flipkart not connected', 'ebay not connected']);
  });

  it('stores exchange rates for non-INR currencies only', async () => {
    const { db, tables } = fakeDb({
      search_queries: [{ id: 1, source: 'ebay', query: 'jacket', category: 'Outerwear', style_archetype: 'Vintage', max_results: 5, enabled: true }],
    });
    const eb = provider('ebay', { search: { jacket: [listing('ebay', 'v1|1|0', 40)] } });
    const fetchFx = jest.fn(async (base: string, quote: string) => ({ base, quote, observedOn: '2026-11-25', rate: 92.24 }));
    const summary = await refreshCatalog({ db, providers: { flipkart: missing('flipkart'), ebay: eb.p }, fetchFx, now: () => NOW }, ['ebay']);
    expect(fetchFx).toHaveBeenCalledTimes(1);
    expect(fetchFx).toHaveBeenCalledWith('USD', 'INR');
    expect(tables.fx_rates).toEqual([{ base: 'USD', quote: 'INR', observed_on: '2026-11-25', rate: 92.24 }]);
    expect(summary.fx).toEqual([{ pair: 'USD/INR', rate: 92.24 }]);
  });
});

describe('liveItemCheck', () => {
  const base = { id: 'ebay:v1|7|0', source: 'ebay', source_item_id: 'v1|7|0', category: 'Tops', style_archetypes: ['Grunge'], available: true };

  it('validates the id and 404s unknown listings', async () => {
    const { db } = fakeDb();
    const providers = { flipkart: missing('flipkart'), ebay: missing('ebay') };
    expect((await liveItemCheck({ db, providers, now: () => NOW }, 'drop table')).status).toBe(400);
    expect((await liveItemCheck({ db, providers, now: () => NOW }, 'ebay:v1|404|0')).status).toBe(404);
  });

  it('serves recently checked prices without calling the marketplace', async () => {
    const { db } = fakeDb({ listings: [{ ...base, last_checked_at: new Date(NOW.getTime() - 5 * 60_000).toISOString() }] });
    const eb = provider('ebay', {});
    const result = await liveItemCheck({ db, providers: { flipkart: missing('flipkart'), ebay: eb.p }, now: () => NOW }, base.id);
    expect(result.body.checked).toBe('recent');
    expect(eb.calls.lookup).toEqual([]);
  });

  it('re-checks stale prices live and marks vanished listings unavailable', async () => {
    const old = new Date(NOW.getTime() - 60 * 60_000).toISOString();
    const { db, tables, ingested } = fakeDb({ listings: [{ ...base, last_checked_at: old }, { ...base, id: 'ebay:v1|8|0', source_item_id: 'v1|8|0', last_checked_at: old }] });
    const eb = provider('ebay', { lookup: { 'v1|7|0': listing('ebay', 'v1|7|0', 35) } });
    const deps = { db, providers: { flipkart: missing('flipkart'), ebay: eb.p }, now: () => NOW };

    const live = await liveItemCheck(deps, base.id);
    expect(live.body.checked).toBe('live');
    expect(ingested[0][0]).toMatchObject({ id: base.id, current_price: 35, category: 'Tops', style_archetypes: ['Grunge'] });

    await liveItemCheck(deps, 'ebay:v1|8|0');
    expect(tables.listings.find((r) => r.id === 'ebay:v1|8|0')?.available).toBe(false);
  });

  it('falls back to the stored price when the marketplace is down', async () => {
    const { db } = fakeDb({ listings: [{ ...base, last_checked_at: '2026-11-25T00:00:00Z' }] });
    const eb = provider('ebay', { lookup: { 'v1|7|0': new Error('eBay item lookup failed with HTTP 503') } });
    const result = await liveItemCheck({ db, providers: { flipkart: missing('flipkart'), ebay: eb.p }, now: () => NOW }, base.id);
    expect(result).toMatchObject({ status: 200, body: { checked: 'unavailable', item: expect.objectContaining({ id: base.id }) } });
  });
});
