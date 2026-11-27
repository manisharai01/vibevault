// ============================================================
// VibeVault – Offline cache of the last catalogue download
// Lets the app show the last known real prices (clearly labelled
// with their age) when it starts offline.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CatalogRow } from '../services/catalog';
import type { MarketplaceStatus, Offer } from '../types';
import type { FxRates } from '../utils/format';

const CACHE_KEY = 'vibevault-catalog-cache-v2';

export interface CachedCatalog {
  fetchedAt: string; // ISO
  updatedAt: string | null; // latest successful server refresh (ISO)
  market: string | null;
  rows: CatalogRow[];
  fxRates: FxRates | null;
  fxDate: string | null;
  offers: Offer[];
  /** Announced upcoming sales (optional in older caches). */
  upcomingOffers?: Offer[];
  marketplaces: MarketplaceStatus[];
}

export async function readCatalogCache(): Promise<CachedCatalog | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedCatalog>;
    if (typeof parsed?.fetchedAt !== 'string' || !Array.isArray(parsed.rows)) return null;
    return {
      fetchedAt: parsed.fetchedAt,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
      market: typeof parsed.market === 'string' ? parsed.market : null,
      rows: parsed.rows,
      fxRates: parsed.fxRates && typeof parsed.fxRates === 'object' ? parsed.fxRates : null,
      fxDate: typeof parsed.fxDate === 'string' ? parsed.fxDate : null,
      offers: Array.isArray(parsed.offers) ? parsed.offers : [],
      upcomingOffers: Array.isArray(parsed.upcomingOffers) ? parsed.upcomingOffers : [],
      marketplaces: Array.isArray(parsed.marketplaces) ? parsed.marketplaces : [],
    };
  } catch {
    return null;
  }
}

export async function writeCatalogCache(cache: CachedCatalog): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Caching is best-effort (e.g. storage full); the app still works online.
  }
}
