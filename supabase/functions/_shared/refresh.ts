// Catalogue refresh, run every few minutes by pg_cron (see supabase/setup/schedule.sql).
// Each run takes the most overdue jobs from a queue so every call stays well inside the
// Edge Function time limit:
//   • exchange rates – once every 12 hours
//   • one marketplace + market: re-check known listings (today's price), discover new ones
//     with the next search terms, import archived history, retire listings that can't be
//     confirmed any more
//   • one coupon feed + market: store the feed's currently valid offers

import type { Db } from './db.ts';
import type { EcbRates } from './fx.ts';
import { mapLimit } from './http.ts';
import { prepareListing, type ListingHint } from './pipeline.ts';
import {
  isConfigured,
  STYLE_ARCHETYPES,
  type Category,
  type Department,
  type HistoryProvider,
  type IngestRow,
  type MarketplaceProvider,
  type NormalizedListing,
  type NormalizedOffer,
  type OfferProvider,
  type Slot,
  type StyleArchetype,
} from './types.ts';

export const RECHECK_AFTER_HOURS = 20;
/** Listings that a marketplace can look up are retired after this long unconfirmed. */
export const RETIRE_AFTER_DAYS = 3;
/** Search-only marketplaces re-confirm listings only when a search finds them again. */
export const RETIRE_SEARCH_ONLY_AFTER_DAYS = 14;
export const SEARCH_RESULTS_PER_TERM = 10;
export const ARCHIVE_IMPORTS_PER_RUN = 20;
const LOOKUP_CONCURRENCY = 4;
const SEARCH_CONCURRENCY = 3;
const INGEST_BATCH = 100;
const FX_EVERY_HOURS = 12;
const HOUR_MS = 3_600_000;

export interface RefreshDeps {
  db: Db;
  providers: Record<string, Slot<MarketplaceProvider>>;
  offerSources: Record<string, Slot<OfferProvider>>;
  archives: Slot<HistoryProvider>[];
  fetchFx: () => Promise<EcbRates>;
  now: () => Date;
}

export interface JobSummary {
  kind: 'catalog' | 'offers';
  source: string;
  market: string;
  status: 'ok' | 'partial' | 'error';
  checked: number;
  found: number;
  removed: number;
  archived: number;
  offers: number;
  errors: string[];
}

export interface RefreshSummary {
  fx: { status: 'ok' | 'skipped' | 'error'; currencies?: number; observedOn?: string; error?: string };
  jobs: JobSummary[];
  /** Marketplaces/feeds without keys (nothing to do for them). */
  notConfigured: string[];
}

interface ClaimedCatalogJob {
  source: string;
  market: string;
  language: string;
  searches_per_run: number;
  lookups_per_run: number;
}

interface KnownRow {
  id: string;
  source_item_id: string;
  category: Category;
  department: Department;
  style_archetypes: StyleArchetype[];
}

interface TermRow {
  id: number;
  query: string;
  query_en: string;
  category: Category;
  department: Department;
  style_archetype: StyleArchetype | null;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

async function ingest(db: Db, rows: IngestRow[], observedOn: string): Promise<void> {
  for (let i = 0; i < rows.length; i += INGEST_BATCH) {
    await db.rpc('ingest_listings', { items: rows.slice(i, i + INGEST_BATCH), observed: observedOn });
  }
}

/** Promo codes attached to listings, still valid at `now`. */
function promoRows(listings: { id: string; listing: NormalizedListing }[], now: Date) {
  return listings.flatMap(({ id, listing }) => {
    const promo = listing.promo;
    if (!promo) return [];
    if (promo.endsAt && new Date(promo.endsAt).getTime() <= now.getTime()) return [];
    return [
      {
        listing_id: id,
        code: promo.code,
        description: promo.description,
        min_spend: promo.minSpend,
        currency: promo.currency,
        starts_at: promo.startsAt,
        ends_at: promo.endsAt,
      },
    ];
  });
}

function offerRow(offer: NormalizedOffer) {
  return {
    network_offer_id: offer.networkOfferId,
    merchant: offer.merchant,
    merchant_domain: offer.merchantDomain,
    title: offer.title,
    description: offer.description,
    code: offer.code,
    url: offer.url,
    discount_text: offer.discountText,
    min_spend: offer.minSpend,
    currency: offer.currency,
    starts_at: offer.startsAt,
    ends_at: offer.endsAt,
    categories: offer.categories,
    image_url: offer.imageUrl,
  };
}

async function startRun(db: Db, kind: 'catalog' | 'offers' | 'fx', source: string, market: string | null, startedAt: Date) {
  const [run] = await db.insert<{ id: number }>('refresh_runs', { kind, source, market, started_at: startedAt.toISOString() });
  return run?.id ?? null;
}

async function finishRun(db: Db, runId: number | null, now: Date, summary: Pick<JobSummary, 'status' | 'checked' | 'found' | 'removed' | 'errors'>) {
  if (runId === null) return;
  await db.update('refresh_runs', `id=eq.${runId}`, {
    finished_at: now.toISOString(),
    status: summary.status,
    listings_checked: summary.checked,
    listings_found: summary.found,
    listings_removed: summary.removed,
    message: summary.errors.length ? summary.errors.slice(0, 5).join(' | ').slice(0, 1000) : null,
  });
}

// ---- Exchange rates -------------------------------------------------------

async function refreshFx(deps: RefreshDeps): Promise<RefreshSummary['fx']> {
  const { db, now } = deps;
  const since = new Date(now().getTime() - FX_EVERY_HOURS * HOUR_MS).toISOString();
  const recent = await db.select('refresh_runs', `select=id&kind=eq.fx&status=eq.ok&started_at=gt.${encodeURIComponent(since)}&limit=1`);
  if (recent.length > 0) return { status: 'skipped' };
  const runId = await startRun(db, 'fx', 'ecb', null, now());
  try {
    const rates = await deps.fetchFx();
    const rows = Object.entries(rates.perEur)
      .filter(([currency]) => currency !== 'EUR')
      .map(([quote, rate]) => ({ base: 'EUR', quote, observed_on: rates.observedOn, rate }));
    await db.upsert('fx_rates', rows, 'base,quote,observed_on');
    await finishRun(db, runId, now(), { status: 'ok', checked: rows.length, found: 0, removed: 0, errors: [] });
    return { status: 'ok', currencies: rows.length, observedOn: rates.observedOn };
  } catch (error) {
    await finishRun(db, runId, now(), { status: 'error', checked: 0, found: 0, removed: 0, errors: [message(error)] });
    return { status: 'error', error: message(error) };
  }
}

// ---- One marketplace + market ----------------------------------------------

async function recheckKnown(
  provider: MarketplaceProvider,
  job: ClaimedCatalogJob,
  deps: RefreshDeps,
  summary: JobSummary,
  today: string,
): Promise<number> {
  const { db, now } = deps;
  const lookup = provider.lookup?.bind(provider);
  const lookupMany = provider.lookupMany?.bind(provider);
  if ((!lookup && !lookupMany) || job.lookups_per_run <= 0) return 0;
  const cutoff = new Date(now().getTime() - RECHECK_AFTER_HOURS * HOUR_MS).toISOString();
  const known = await db.select<KnownRow>(
    'listings',
    `select=id,source_item_id,category,department,style_archetypes&source=eq.${job.source}&market=eq.${job.market}` +
      `&available=is.true&last_checked_at=lt.${encodeURIComponent(cutoff)}&order=last_checked_at.asc&limit=${job.lookups_per_run}`,
  );
  let results: { row: KnownRow; listing: NormalizedListing | null; failed: boolean }[];
  if (lookupMany) {
    // Batch lookups (several ids per call); ids missing from the answer failed to load.
    let found = new Map<string, NormalizedListing | null>();
    try {
      found = known.length ? await lookupMany(known.map((r) => r.source_item_id), job.market) : found;
    } catch (error) {
      summary.errors.push(`lookups: ${message(error)}`);
    }
    results = known.map((row) =>
      found.has(row.source_item_id)
        ? { row, listing: found.get(row.source_item_id) ?? null, failed: false }
        : { row, listing: null, failed: true },
    );
    const missing = results.filter((r) => r.failed).length;
    if (missing > 0 && summary.errors.length === 0) summary.errors.push(`${missing} lookups failed`);
  } else {
    results = await mapLimit(known, LOOKUP_CONCURRENCY, async (row) => {
      try {
        return { row, listing: await lookup!(row.source_item_id, job.market), failed: false };
      } catch (error) {
        summary.errors.push(`lookup ${row.id}: ${message(error)}`);
        return { row, listing: null, failed: true };
      }
    });
  }

  const updates: IngestRow[] = [];
  const withListing: { id: string; listing: NormalizedListing }[] = [];
  const gone: string[] = [];
  const reclassifiedOut: string[] = [];
  for (const { row, listing, failed } of results) {
    if (failed) continue;
    if (!listing) {
      gone.push(row.id);
      continue;
    }
    const hint: ListingHint = { category: row.category, department: row.department, archetypes: row.style_archetypes };
    const prepared = prepareListing(listing, hint);
    if ('rejected' in prepared) {
      reclassifiedOut.push(row.id);
      continue;
    }
    updates.push(prepared.row);
    withListing.push({ id: prepared.row.id, listing });
  }

  await ingest(db, updates, today);
  if (gone.length) summary.removed += await db.rpc<number>('end_listings', { ids: gone, reason: 'gone', observed: today });
  if (reclassifiedOut.length) {
    summary.removed += await db.rpc<number>('end_listings', { ids: reclassifiedOut, reason: 'stale', observed: today });
  }
  summary.removed += updates.filter((u) => !u.available).length;
  const checkedIds = results.filter((r) => !r.failed).map((r) => r.row.id);
  if (checkedIds.length) {
    await db.rpc('store_listing_promos', { p_checked: checkedIds, p_promos: promoRows(withListing, now()) });
  }
  summary.checked = checkedIds.length;
  return known.length;
}

async function discoverNew(
  provider: MarketplaceProvider,
  job: ClaimedCatalogJob,
  deps: RefreshDeps,
  summary: JobSummary,
  today: string,
): Promise<number> {
  const { db, now } = deps;
  if (job.searches_per_run <= 0) return 0;
  const terms = await db.rpc<TermRow[]>('next_search_terms', { p_source: job.source, p_market: job.market, p_limit: job.searches_per_run });
  const discovered = new Map<string, { row: IngestRow; listing: NormalizedListing }>();
  const runs: { term_id: number; source: string; market: string; last_run_at: string; results: number }[] = [];

  await mapLimit(terms ?? [], SEARCH_CONCURRENCY, async (term) => {
    try {
      const listings = await provider.search({
        query: term.query,
        queryEn: term.query_en,
        category: term.category,
        department: term.department,
        market: job.market,
        limit: SEARCH_RESULTS_PER_TERM,
      });
      let kept = 0;
      for (const listing of listings) {
        if (listing.market !== job.market || listing.source !== job.source) continue;
        const prepared = prepareListing(listing, {
          category: term.category,
          department: term.department,
          archetypes: term.style_archetype ? [term.style_archetype] : [],
        });
        if ('rejected' in prepared) continue;
        kept++;
        const existing = discovered.get(prepared.row.id);
        if (existing) {
          const merged = new Set([...existing.row.style_archetypes, ...prepared.row.style_archetypes]);
          existing.row.style_archetypes = STYLE_ARCHETYPES.filter((style) => merged.has(style));
        } else {
          discovered.set(prepared.row.id, { row: prepared.row, listing });
        }
      }
      runs.push({ term_id: term.id, source: job.source, market: job.market, last_run_at: now().toISOString(), results: kept });
    } catch (error) {
      summary.errors.push(`search "${term.query}": ${message(error)}`);
    }
  });

  const found = [...discovered.values()];
  await ingest(db, found.map((f) => f.row), today);
  if (found.length) {
    await db.rpc('store_listing_promos', {
      p_checked: found.map((f) => f.row.id),
      p_promos: promoRows(found.map((f) => ({ id: f.row.id, listing: f.listing })), now()),
    });
  }
  await db.upsert('search_runs', runs, 'term_id,source,market');
  summary.found = found.length;
  return (terms ?? []).length;
}

async function importArchives(job: ClaimedCatalogJob, deps: RefreshDeps, summary: JobSummary): Promise<void> {
  const { db, now } = deps;
  for (const slot of deps.archives) {
    if (!isConfigured(slot) || slot.source !== job.source || !slot.markets.includes(job.market)) continue;
    const pending = await db.rpc<{ id: string; source_item_id: string }[]>('listings_needing_archive', {
      p_source: job.source,
      p_market: job.market,
      p_limit: ARCHIVE_IMPORTS_PER_RUN,
    });
    for (const row of pending ?? []) {
      try {
        const history = await slot.history(row.source_item_id, job.market);
        if (history && history.points.length > 0) {
          summary.archived += await db.rpc<number>('ingest_history', {
            p_listing: row.id,
            p_currency: history.currency,
            p_points: history.points,
          });
        }
        await db.update('listings', `id=eq.${encodeURIComponent(row.id)}`, { archive_checked_at: now().toISOString() });
      } catch (error) {
        summary.errors.push(`${slot.name} ${row.id}: ${message(error)}`);
      }
    }
  }
}

async function retireUnconfirmed(provider: MarketplaceProvider, job: ClaimedCatalogJob, deps: RefreshDeps, summary: JobSummary, today: string) {
  const { db, now } = deps;
  const days = provider.lookup || provider.lookupMany ? RETIRE_AFTER_DAYS : RETIRE_SEARCH_ONLY_AFTER_DAYS;
  const cutoff = new Date(now().getTime() - days * 24 * HOUR_MS).toISOString();
  const stale = await db.select<{ id: string }>(
    'listings',
    `select=id&source=eq.${job.source}&market=eq.${job.market}&available=is.true&last_checked_at=lt.${encodeURIComponent(cutoff)}&limit=500`,
  );
  if (stale.length) {
    summary.removed += await db.rpc<number>('end_listings', { ids: stale.map((r) => r.id), reason: 'stale', observed: today });
  }
}

async function runCatalogJob(provider: MarketplaceProvider, job: ClaimedCatalogJob, deps: RefreshDeps): Promise<JobSummary> {
  const { db, now } = deps;
  const started = now();
  const today = isoDay(started);
  const summary: JobSummary = {
    kind: 'catalog',
    source: job.source,
    market: job.market,
    status: 'ok',
    checked: 0,
    found: 0,
    removed: 0,
    archived: 0,
    offers: 0,
    errors: [],
  };
  const runId = await startRun(db, 'catalog', job.source, job.market, started);
  try {
    const lookups = await recheckKnown(provider, job, deps, summary, today);
    const searches = await discoverNew(provider, job, deps, summary, today);
    await importArchives(job, deps, summary);
    await retireUnconfirmed(provider, job, deps, summary, today);
    const attempted = lookups + searches;
    const failures = summary.errors.length;
    summary.status = failures === 0 ? 'ok' : failures < attempted ? 'partial' : 'error';
  } catch (error) {
    summary.status = 'error';
    summary.errors.push(message(error));
  }
  await finishRun(db, runId, now(), summary);
  return summary;
}

// ---- One coupon feed + market ------------------------------------------------

async function runOfferJob(source: OfferProvider, market: string, deps: RefreshDeps): Promise<JobSummary> {
  const { db, now } = deps;
  const summary: JobSummary = {
    kind: 'offers',
    source: source.network,
    market,
    status: 'ok',
    checked: 0,
    found: 0,
    removed: 0,
    archived: 0,
    offers: 0,
    errors: [],
  };
  const runId = await startRun(db, 'offers', source.network, market, now());
  try {
    const at = now().getTime();
    const offers = (await source.fetchOffers(market)).filter(
      (o) => (!o.endsAt || new Date(o.endsAt).getTime() > at) && (!o.startsAt || new Date(o.startsAt).getTime() <= at) && o.url.startsWith('https://'),
    );
    // Only a successful, complete fetch replaces the stored offers (withdrawn ones are switched off).
    await db.rpc('store_offers', { p_network: source.network, p_market: market, p_offers: offers.map(offerRow) });
    summary.offers = offers.length;
    summary.found = offers.length;
  } catch (error) {
    summary.status = 'error';
    summary.errors.push(message(error));
  }
  await finishRun(db, runId, now(), summary);
  return summary;
}

// ---- Entry point ---------------------------------------------------------------

export interface RefreshOptions {
  /** Marketplace + market jobs to run this call (default 1). */
  catalogJobs?: number;
  /** Coupon feed jobs to run this call (default 1). */
  offerJobs?: number;
}

export async function runRefresh(deps: RefreshDeps, options: RefreshOptions = {}): Promise<RefreshSummary> {
  const { db } = deps;
  const notConfigured = [
    ...Object.entries(deps.providers)
      .filter(([, slot]) => !isConfigured(slot))
      .map(([, slot]) => (slot as { missing: string }).missing),
    ...Object.entries(deps.offerSources)
      .filter(([, slot]) => !isConfigured(slot))
      .map(([, slot]) => (slot as { missing: string }).missing),
  ];
  const summary: RefreshSummary = { fx: await refreshFx(deps), jobs: [], notConfigured };

  const providers = new Map<string, MarketplaceProvider>();
  for (const slot of Object.values(deps.providers)) if (isConfigured(slot)) providers.set(slot.source, slot);
  const catalogPairs = [...providers.values()].flatMap((p) => p.markets.map((m) => `${p.source}:${m}`));
  for (let i = 0; i < (options.catalogJobs ?? 1) && catalogPairs.length > 0; i++) {
    const [job] = await db.rpc<ClaimedCatalogJob[]>('claim_catalog_job', { pairs: catalogPairs });
    if (!job) break;
    summary.jobs.push(await runCatalogJob(providers.get(job.source)!, job, deps));
  }

  const feeds = new Map<string, OfferProvider>();
  for (const slot of Object.values(deps.offerSources)) if (isConfigured(slot)) feeds.set(slot.network, slot);
  const offerPairs = [...feeds.values()].flatMap((f) => f.markets.map((m) => `${f.network}:${m}`));
  for (let i = 0; i < (options.offerJobs ?? 1) && offerPairs.length > 0; i++) {
    const [job] = await db.rpc<{ network: string; market: string }[]>('claim_offer_job', { pairs: offerPairs });
    if (!job) break;
    summary.jobs.push(await runOfferJob(feeds.get(job.network)!, job.market, deps));
  }
  return summary;
}

