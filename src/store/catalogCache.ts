// ============================================================
// VibeVault – Offline cache of the last catalogue download
// Lets the app show the last known real prices (clearly labelled
// with their age) when it starts offline.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CatalogRow } from '../services/catalog';

const CACHE_KEY = 'vibevault-catalog-cache-v1';

export interface CachedCatalog {
  fetchedAt: string; // ISO
  updatedAt: string | null; // latest successful server refresh (ISO)
  rows: CatalogRow[];
}

export async function readCatalogCache(): Promise<CachedCatalog | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedCatalog>;
    if (typeof parsed?.fetchedAt !== 'string' || !Array.isArray(parsed.rows)) return null;
    return { fetchedAt: parsed.fetchedAt, updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null, rows: parsed.rows };
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

