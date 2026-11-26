// Daily catalogue refresh:
//   1. re-check every known listing (price, availability) and record today's price
//   2. discover new listings with the configured searches
//   3. retire listings that couldn't be confirmed for a few days
//   4. store exchange rates for non-INR currencies

import { pgrstList, type Db } from './db.ts';
import type { FxRate } from './fx.ts';
import { mapLimit } from './http.ts';
import { toIngestRow, type Category, type IngestRow, type MarketplaceProvider, type Source } from './types.ts';

export const RECHECK_AFTER_HOURS = 20;
export const RETIRE_AFTER_DAYS = 3;
export const MAX_RECHECKS_PER_RUN = 300;
const LOOKUP_CONCURRENCY = 4;
const SEARCH_CONCURRENCY = 3;
const INGEST_BATCH = 100;
const HOUR_MS = 3_600_000;

export type ProviderSlot = MarketplaceProvider | { missing: string };

export interface RefreshDeps {
  db: Db;
  providers: Record<Source, ProviderSlot>;
  fetchFx: (base: string, quote: string) => Promise<FxRate>;
  now: () => Date;
}

export interface SourceSummary {
  source: Source;
  status: 'ok' | 'partial' | 'error' | 'skipped';
  checked: number;
  found: number;
  removed: number;
  errors: string[];
}

export interface RefreshSummary {
  sources: SourceSummary[];
  fx: { pair: string; rate?: number; error?: string }[];
}

interface KnownRow {
  id: string;
  source_item_id: string;
  category: Category;
  style_archetypes: string[];
}

interface QueryRow {
  query: string;
  category: Category;
  style_archetype: string;
  max_results: number;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function isConfigured(slot: ProviderSlot): slot is MarketplaceProvider {
  return 'search' in slot;
}

async function ingest(db: Db, rows: IngestRow[], observedOn: string): Promise<void> {
  for (let i = 0; i < rows.length; i += INGEST_BATCH) {
    await db.rpc('ingest_listings', { items: rows.slice(i, i + INGEST_BATCH), observed: observedOn });
  }
}

/** Local calendar date of `date` in UTC (the database's current_date). */
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

async function refreshSource(source: Source, slot: ProviderSlot, deps: RefreshDeps): Promise<SourceSummary> {
  const { db, now } = deps;
  const started = now();
  const summary: SourceSummary = { source, status: 'ok', checked: 0, found: 0, removed: 0, errors: [] };
  const [run] = await db.insert<{ id: number }>('refresh_runs', { source, started_at: started.toISOString() });

  if (!isConfigured(slot)) {
    summary.status = 'skipped';
    summary.errors.push(slot.missing);
  } else {
    const provider = slot;
    const today = isoDay(started);
    try {
      // 1. Re-check known listings.
      const cutoff = new Date(started.getTime() - RECHECK_AFTER_HOURS * HOUR_MS).toISOString();
      const known = await db.select<KnownRow>(
        'listings',
        `select=id,source_item_id,category,style_archetypes&source=eq.${source}&available=is.true` +
          `&last_checked_at=lt.${encodeURIComponent(cutoff)}&order=last_checked_at.asc&limit=${MAX_RECHECKS_PER_RUN}`,
      );
      const rechecked = await mapLimit(known, LOOKUP_CONCURRENCY, async (row) => {
        try {
          return { row, listing: await provider.lookup(row.source_item_id), failed: false };
        } catch (error) {
          summary.errors.push(`lookup ${row.id}: ${message(error)}`);
          return { row, listing: null, failed: true };
        }
      });
      const updates = rechecked.flatMap(({ row, listing }) =>
        listing ? [toIngestRow(listing, row.category, row.style_archetypes)] : [],
      );
      const gone = rechecked.filter((r) => !r.failed && r.listing === null).map((r) => r.row.id);
      await ingest(db, updates, today);
      if (gone.length > 0) {
        await db.update('listings', `id=in.${encodeURIComponent(pgrstList(gone))}`, {
          available: false,
          last_checked_at: started.toISOString(),
        });
      }
      summary.checked = rechecked.filter((r) => !r.failed).length;
      summary.removed += gone.length + updates.filter((u) => !u.available).length;

      // 2. Discover listings from the configured searches.
      const queries = await db.select<QueryRow>(
        'search_queries',
        `select=query,category,style_archetype,max_results&source=eq.${source}&enabled=is.true&order=id`,
      );
      const discovered = new Map<string, IngestRow>();
      await mapLimit(queries, SEARCH_CONCURRENCY, async (q) => {
        try {
          for (const listing of await provider.search(q.query, q.max_results)) {
            const existing = discovered.get(listing.id);
            if (existing) {
              if (!existing.style_archetypes.includes(q.style_archetype)) existing.style_archetypes.push(q.style_archetype);
            } else {
              discovered.set(listing.id, toIngestRow(listing, q.category, [q.style_archetype]));
            }
          }
        } catch (error) {
          summary.errors.push(`search "${q.query}": ${message(error)}`);
        }
      });
      await ingest(db, [...discovered.values()], today);
      summary.found = discovered.size;

      // 3. Retire listings that haven't been confirmed for a while.
      const staleCutoff = new Date(started.getTime() - RETIRE_AFTER_DAYS * 24 * HOUR_MS).toISOString();
      summary.removed += await db.update(
        'listings',
        `source=eq.${source}&available=is.true&last_checked_at=lt.${encodeURIComponent(staleCutoff)}`,
        { available: false },
      );

      const attempted = known.length + queries.length;
      const failures = summary.errors.length;
      summary.status = failures === 0 ? 'ok' : failures < attempted ? 'partial' : 'error';
    } catch (error) {
      summary.status = 'error';
      summary.errors.push(message(error));
    }
  }

  if (run) {
    await db.update('refresh_runs', `id=eq.${run.id}`, {
      finished_at: now().toISOString(),
      status: summary.status,
      listings_checked: summary.checked,
      listings_found: summary.found,
      listings_removed: summary.removed,
      message: summary.errors.length ? summary.errors.slice(0, 5).join(' | ').slice(0, 1000) : null,
    });
  }
  return summary;
}

async function refreshFxRates(deps: RefreshDeps): Promise<RefreshSummary['fx']> {
  const rows = await deps.db.select<{ currency: string }>('listings', 'select=currency&available=is.true&currency=neq.INR&limit=2000');
  const currencies = [...new Set(rows.map((r) => r.currency))];
  const results: RefreshSummary['fx'] = [];
  for (const base of currencies) {
    try {
      const fx = await deps.fetchFx(base, 'INR');
      await deps.db.upsert(
        'fx_rates',
        [{ base: fx.base, quote: fx.quote, observed_on: fx.observedOn, rate: fx.rate }],
        'base,quote,observed_on',
      );
      results.push({ pair: `${base}/INR`, rate: fx.rate });
    } catch (error) {
      results.push({ pair: `${base}/INR`, error: message(error) });
    }
  }
  return results;
}

export async function refreshCatalog(deps: RefreshDeps, sources: Source[]): Promise<RefreshSummary> {
  const summaries: SourceSummary[] = [];
  for (const source of sources) {
    summaries.push(await refreshSource(source, deps.providers[source], deps));
  }
  return { sources: summaries, fx: await refreshFxRates(deps) };
}
