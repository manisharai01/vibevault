// On-demand price check for one listing (called when the app opens an item).
// Only listings already in the catalogue can be checked, and each is re-fetched from its
// marketplace at most once per FRESH_FOR_MINUTES, which keeps API usage bounded. After a
// successful check the listing's predictions are re-published for its current price.

import type { Db } from './db.ts';
import { prepareListing } from './pipeline.ts';
import { isConfigured, type Category, type Department, type MarketplaceProvider, type Slot, type StyleArchetype } from './types.ts';

export const FRESH_FOR_MINUTES = 15;
export const LISTING_ID_PATTERN = /^[a-z][a-z0-9_]{1,30}:[A-Z]{2}:[^\s]{1,160}$/;

export type LiveCheck = 'live' | 'recent' | 'unavailable' | 'unsupported';

export interface LiveItemDeps {
  db: Db;
  providers: Record<string, Slot<MarketplaceProvider>>;
  now: () => Date;
}

export interface LiveItemResult {
  status: number;
  body: { item?: unknown; checked?: LiveCheck; error?: string };
}

interface ListingRow {
  id: string;
  source: string;
  market: string;
  source_item_id: string;
  category: Category;
  department: Department;
  style_archetypes: StyleArchetype[];
  last_checked_at: string;
}

async function catalogItem(db: Db, id: string) {
  const [item] = await db.select('catalog_items', `select=*&id=eq.${encodeURIComponent(id)}`);
  return item;
}

export async function liveItemCheck(deps: LiveItemDeps, id: unknown): Promise<LiveItemResult> {
  if (typeof id !== 'string' || !LISTING_ID_PATTERN.test(id)) {
    return { status: 400, body: { error: 'A valid listing id is required.' } };
  }
  const { db, now } = deps;
  const [row] = await db.select<ListingRow>(
    'listings',
    `select=id,source,market,source_item_id,category,department,style_archetypes,last_checked_at&id=eq.${encodeURIComponent(id)}`,
  );
  if (!row) return { status: 404, body: { error: 'Listing not found.' } };

  const ageMinutes = (now().getTime() - new Date(row.last_checked_at).getTime()) / 60_000;
  if (ageMinutes < FRESH_FOR_MINUTES) {
    return { status: 200, body: { item: await catalogItem(db, id), checked: 'recent' } };
  }

  const slot = deps.providers[row.source];
  if (!slot || !isConfigured(slot)) {
    return { status: 200, body: { item: await catalogItem(db, id), checked: 'unavailable' } };
  }
  const lookup = slot.lookup?.bind(slot);
  if (!lookup) {
    // This marketplace's API can't look up a single listing; prices refresh with daily searches.
    return { status: 200, body: { item: await catalogItem(db, id), checked: 'unsupported' } };
  }

  const today = now().toISOString().slice(0, 10);
  try {
    const listing = await lookup(row.source_item_id, row.market);
    const prepared = listing
      ? prepareListing(listing, { category: row.category, department: row.department, archetypes: row.style_archetypes })
      : null;
    if (listing && prepared && 'row' in prepared) {
      await db.rpc('ingest_listings', { items: [prepared.row], observed: today });
      const promo = listing.promo && (!listing.promo.endsAt || new Date(listing.promo.endsAt).getTime() > now().getTime()) ? listing.promo : null;
      await db.rpc('store_listing_promos', {
        p_checked: [id],
        p_promos: promo
          ? [{ listing_id: id, code: promo.code, description: promo.description, min_spend: promo.minSpend, currency: promo.currency, starts_at: promo.startsAt, ends_at: promo.endsAt }]
          : [],
      });
      if (prepared.row.available) {
        // Best effort: before the first model run there is nothing to publish.
        await db.rpc('publish_predictions', { p_asof: today, p_listing: id }).catch(() => undefined);
      }
    } else {
      await db.rpc('end_listings', { ids: [id], reason: listing ? 'stale' : 'gone', observed: today });
    }
    return { status: 200, body: { item: await catalogItem(db, id), checked: 'live' } };
  } catch {
    // Marketplace unreachable: fall back to the last recorded price.
    return { status: 200, body: { item: await catalogItem(db, id), checked: 'unavailable' } };
  }
}
