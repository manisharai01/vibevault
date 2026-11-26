// ============================================================
// VibeVault – Marketplace links
// Live listings open their own product page; stores without a
// public price API are offered as "search there" links.
// ============================================================

import { Linking } from 'react-native';
import { ExternalStore } from '../constants/marketplaces';
import { FashionItem, Platform } from '../types';

const THRIFT_STORES_NEARBY_URL = 'https://www.google.com/maps/search/?api=1&query=thrift%20stores%20near%20me';

/** Search query for a listing: brand + title without decorative punctuation. */
export function searchQueryFor(item: Pick<FashionItem, 'title' | 'brand'>): string {
  const brand = item.brand && !item.title.toLowerCase().includes(item.brand.toLowerCase()) ? `${item.brand} ` : '';
  return `${brand}${item.title}`
    .replace(/[–—"“”|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Search results page for `query` on a store without a price API. */
export function externalSearchUrl(store: ExternalStore, query: string): string {
  const q = encodeURIComponent(query);
  switch (store) {
    case 'Myntra':
      return `https://www.myntra.com/${slugify(query)}?rawQuery=${q}`;
    case 'Meesho':
      return `https://www.meesho.com/search?q=${q}`;
    case 'Amazon':
      return `https://www.amazon.in/s?k=${q}`;
    case 'Ajio':
      return `https://www.ajio.com/search/?text=${q}`;
    case 'Depop':
      return `https://www.depop.com/search/?q=${q}`;
    case 'Vinted':
      return `https://www.vinted.com/catalog?search_text=${q}`;
    case 'Poshmark':
      return `https://poshmark.com/search?query=${q}`;
    case 'ThredUp':
      return `https://www.thredup.com/products?query=${q}`;
  }
}

/** Opens a URL in the browser/app. Resolves false if it could not be opened. */
export async function openUrl(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export function openItemOnMarketplace(item: Pick<FashionItem, 'productUrl'>): Promise<boolean> {
  return openUrl(item.productUrl);
}

export function openThriftStoresNearby(): Promise<boolean> {
  return openUrl(THRIFT_STORES_NEARBY_URL);
}

export function marketplaceCtaLabel(platform: Platform): string {
  return `View on ${platform}`;
}
