// ============================================================
// VibeVault – Backend API client (Supabase REST + Edge Functions)
// Read-only: the app can read listings, price history and refresh
// status, and ask for a live price check of one listing.
// ============================================================

import type { BackendConfig } from '../config';
import type { CatalogRow } from './catalog';

export class CatalogError extends Error {
  readonly kind: 'network' | 'http';
  readonly status?: number;

  constructor(message: string, kind: 'network' | 'http', status?: number) {
    super(message);
    this.name = 'CatalogError';
    this.kind = kind;
    this.status = status;
  }
}

export interface SourceStatusRow {
  source: string;
  last_success_at: string | null;
  last_status: string | null;
  last_message: string | null;
  available_listings: number;
}

export const CATALOG_LIMIT = 800;
const TIMEOUT_MS = 20000;

function headers(config: BackendConfig): Record<string, string> {
  const h: Record<string, string> = { apikey: config.anonKey, Accept: 'application/json' };
  // Legacy anon keys are JWTs; new publishable keys (sb_publishable_…) only go in `apikey`.
  if (config.anonKey.startsWith('eyJ')) h.Authorization = `Bearer ${config.anonKey}`;
  return h;
}

async function request<T>(url: string, init: RequestInit, label: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new CatalogError(`${label}: couldn't reach the VibeVault server.`, 'network');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new CatalogError(`${label} failed (HTTP ${response.status}).`, 'http', response.status);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new CatalogError(`${label}: unexpected response from the server.`, 'http', response.status);
  }
}

/** Quotes ids for a PostgREST in.(…) filter. */
function inList(ids: string[]): string {
  return `(${ids.map((id) => `"${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`;
}

/**
 * Available listings, plus any extra ids the user cares about (wishlist,
 * alerts) even if they are no longer available.
 */
export async function fetchCatalogRows(config: BackendConfig, extraIds: string[] = []): Promise<CatalogRow[]> {
  const ids = [...new Set(extraIds)].filter((id) => /^(flipkart|ebay):/.test(id)).slice(0, 200);
  const filter = ids.length > 0 ? `or=${encodeURIComponent(`(available.is.true,id.in.${inList(ids)})`)}` : 'available=is.true';
  const url = `${config.url}/rest/v1/catalog_items?select=*&${filter}&order=first_seen_at.desc&limit=${CATALOG_LIMIT}`;
  const rows = await request<unknown>(url, { headers: headers(config) }, 'Loading listings');
  return Array.isArray(rows) ? (rows as CatalogRow[]) : [];
}

export async function fetchCatalogStatus(config: BackendConfig): Promise<SourceStatusRow[]> {
  const rows = await request<unknown>(`${config.url}/rest/v1/catalog_status?select=*`, { headers: headers(config) }, 'Loading status');
  return Array.isArray(rows) ? (rows as SourceStatusRow[]) : [];
}

export type LiveCheckResult = { row: CatalogRow | null; checked: 'live' | 'recent' | 'unavailable' };

/** Asks the backend to re-check one listing's price on its marketplace. */
export async function liveCheckListing(config: BackendConfig, id: string): Promise<LiveCheckResult> {
  const body = await request<{ item?: CatalogRow; checked?: LiveCheckResult['checked'] }>(
    `${config.url}/functions/v1/live-item`,
    { method: 'POST', headers: { ...headers(config), 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) },
    'Checking the live price',
  );
  return { row: body?.item ?? null, checked: body?.checked ?? 'unavailable' };
}
