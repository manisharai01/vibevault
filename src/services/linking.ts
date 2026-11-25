// ============================================================
// VibeVault – Marketplace links
// ============================================================

import { Linking } from 'react-native';
import { FashionItem, Platform } from '../types';

const THRIFT_STORES_NEARBY_URL = 'https://www.google.com/maps/search/?api=1&query=thrift%20stores%20near%20me';

/** Search query for a listing: brand + title without decorative punctuation. */
export function searchQueryFor(item: Pick<FashionItem, 'title' | 'brand'>): string {
  const brand = item.brand && item.brand !== 'Unknown' && !item.title.includes(item.brand) ? `${item.brand} ` : '';
  return `${brand}${item.title}`
    .replace(/[–—"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Search URL for a listing on its marketplace. */
export function getMarketplaceUrl(item: Pick<FashionItem, 'title' | 'brand'> & { platform: Platform }): string {
  const query = searchQueryFor(item);
  const q = encodeURIComponent(query);
  switch (item.platform) {
    case 'Myntra':
      return `https://www.myntra.com/${slugify(query)}?rawQuery=${q}`;
    case 'Meesho':
      return `https://www.meesho.com/search?q=${q}`;
    case 'Amazon':
      return `https://www.amazon.in/s?k=${q}`;
    case 'Flipkart':
      return `https://www.flipkart.com/search?q=${q}`;
    case 'Depop':
      return `https://www.depop.com/search/?q=${q}`;
    case 'Poshmark':
      return `https://poshmark.com/search?query=${q}`;
    case 'Vinted':
      return `https://www.vinted.com/catalog?search_text=${q}`;
    case 'ThredUp':
      return `https://www.thredup.com/products?query=${q}`;
    case 'Local Thrift':
      return THRIFT_STORES_NEARBY_URL;
    default:
      return `https://www.google.com/search?q=${q}`;
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

export function openItemOnMarketplace(item: FashionItem): Promise<boolean> {
  return openUrl(item.productUrl || getMarketplaceUrl(item));
}

export function openThriftStoresNearby(): Promise<boolean> {
  return openUrl(THRIFT_STORES_NEARBY_URL);
}

/** Call-to-action label for viewing a listing. */
export function marketplaceCtaLabel(platform: Platform): string {
  return platform === 'Local Thrift' ? 'Find Nearby Thrift Stores' : `View on ${platform}`;
}
