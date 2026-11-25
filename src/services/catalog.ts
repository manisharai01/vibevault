// ============================================================
// VibeVault – Catalogue builder
// Turns static seed listings into today's live catalogue:
// simulated price history, current price, forecasts, region
// and marketplace link.
// ============================================================

import { REGION_BY_PLATFORM } from '../constants/marketplaces';
import { SEED_ITEMS } from '../data/mockData';
import { CatalogSeedItem, FashionItem } from '../types';
import { getMarketplaceUrl } from './linking';
import { buildPriceHistory, predictFromHistory } from './priceEngine';

export function buildCatalogItem(seed: CatalogSeedItem, asOf: Date): FashionItem {
  const { basePrice: _basePrice, ...listing } = seed;
  const priceHistory = buildPriceHistory(seed, asOf);
  return {
    ...listing,
    region: REGION_BY_PLATFORM[seed.platform],
    productUrl: getMarketplaceUrl(seed),
    priceHistory,
    currentPrice: priceHistory[priceHistory.length - 1].price,
    predictedPrice7d: predictFromHistory(priceHistory, 7),
    predictedPrice30d: predictFromHistory(priceHistory, 30),
    matchScore: 0,
  };
}

export function buildCatalog(asOf: Date = new Date(), seeds: CatalogSeedItem[] = SEED_ITEMS): FashionItem[] {
  return seeds.map((seed) => buildCatalogItem(seed, asOf));
}
