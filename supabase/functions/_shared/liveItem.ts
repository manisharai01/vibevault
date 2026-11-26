// On-demand price check for one listing (called when the app opens an item).
// Only listings already in the catalogue can be checked, and each is re-fetched
// from its marketplace at most once per FRESH_FOR_MINUTES, which keeps API usage bounded.

import type { Db } from './db.ts';
import { isConfigured, type ProviderSlot } from './refresh.ts';
import { toIngestRow, type Category, type Source } from './types.ts';

export const FRESH_FOR_MINUTES = 15;
const ID_PATTERN = /^(flipkart|ebay):[A-Za-z0-9|_.\-]{1,120}$/;

export interface LiveItemDeps {
  db: Db;
  providers: Record<Source, ProviderSlot>;
  now: () => Date;
}

export interface LiveItemResult {
  status: number;
  body: { item?: unknown; checked?: 'live' | 'recent' | 'unavailable'; error?: string };
}

interface ListingRow {
  id: string;
  source: Source;
  source_item_id: string;
  category: Category;
  style_archetypes: string[];
  last_checked_at: string;
}

async function catalogItem(db: Db, id: string) {
  const [item] = await db.select('catalog_items', `select=*&id=eq.${encodeURIComponent(id)}`);
  return item;
}

export async function liveItemCheck(deps: LiveItemDeps, id: unknown): Promise<LiveItemResult> {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    return { status: 400, body: { error: 'A valid listing id is required.' } };
  }
  const { db, now } = deps;
  const [row] = await db.select<ListingRow>(
    'listings',
    `select=id,source,source_item_id,category,style_archetypes,last_checked_at&id=eq.${encodeURIComponent(id)}`,
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

  try {
    const listing = await slot.lookup(row.source_item_id);
    if (listing) {
      await db.rpc('ingest_listings', { items: [toIngestRow(listing, row.category, row.style_archetypes)] });
    } else {
      await db.update('listings', `id=eq.${encodeURIComponent(id)}`, {
        available: false,
        last_checked_at: now().toISOString(),
      });
    }
    return { status: 200, body: { item: await catalogItem(db, id), checked: 'live' } };
  } catch {
    // Marketplace unreachable: fall back to the last recorded price.
    return { status: 200, body: { item: await catalogItem(db, id), checked: 'unavailable' } };
  }
}
