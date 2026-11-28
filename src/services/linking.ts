// ============================================================
// VibeVault – Marketplace links
// Listings open their own product page. "Compare" links search the
// same item on the other marketplaces VibeVault has live listings
// from in the shopper's country, plus Google Shopping.
// ============================================================

import { Linking } from 'react-native';
import { FashionItem, MarketplaceStatus } from '../types';

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

const AMAZON_DOMAINS: Record<string, string> = {
  IN: 'amazon.in', US: 'amazon.com', GB: 'amazon.co.uk', DE: 'amazon.de', FR: 'amazon.fr', IT: 'amazon.it', ES: 'amazon.es',
  CA: 'amazon.ca', JP: 'amazon.co.jp', AU: 'amazon.com.au', BR: 'amazon.com.br', MX: 'amazon.com.mx', AE: 'amazon.ae',
  SG: 'amazon.sg', NL: 'amazon.nl', SE: 'amazon.se', PL: 'amazon.pl', TR: 'amazon.com.tr', SA: 'amazon.sa', BE: 'amazon.com.be',
  EG: 'amazon.eg', IE: 'amazon.ie',
};
const EBAY_DOMAINS: Record<string, string> = {
  US: 'ebay.com', GB: 'ebay.co.uk', DE: 'ebay.de', FR: 'ebay.fr', IT: 'ebay.it', ES: 'ebay.es', AU: 'ebay.com.au', CA: 'ebay.ca',
  AT: 'ebay.at', CH: 'ebay.ch', IE: 'ebay.ie', NL: 'ebay.nl', BE: 'befr.ebay.be', PL: 'ebay.pl',
};
const GOOGLE_DOMAINS: Record<string, string> = {
  IN: 'google.co.in', GB: 'google.co.uk', DE: 'google.de', FR: 'google.fr', IT: 'google.it', ES: 'google.es', CA: 'google.ca',
  AU: 'google.com.au', JP: 'google.co.jp', BR: 'google.com.br', MX: 'google.com.mx', AE: 'google.ae', SG: 'google.com.sg',
  NL: 'google.nl', IE: 'google.ie', NZ: 'google.co.nz', SA: 'google.com.sa', ZA: 'google.co.za',
};

/** Search-results page for `query` on a marketplace in a country, or null when it has no site there. */
export function marketplaceSearchUrl(source: string, market: string, query: string): string | null {
  const q = encodeURIComponent(query);
  switch (source) {
    case 'flipkart':
      return market === 'IN' ? `https://www.flipkart.com/search?q=${q}` : null;
    case 'amazon':
      return AMAZON_DOMAINS[market] ? `https://www.${AMAZON_DOMAINS[market]}/s?k=${q}` : null;
    case 'ebay':
      return `https://www.${EBAY_DOMAINS[market] ?? 'ebay.com'}/sch/i.html?_nkw=${q}`;
    case 'etsy':
      return `https://www.etsy.com/search?q=${q}`;
    case 'aliexpress':
      return `https://www.aliexpress.com/wholesale?SearchText=${q}`;
    case 'google_shopping':
      return `https://www.${GOOGLE_DOMAINS[market] ?? 'google.com'}/search?tbm=shop&q=${q}`;
    default:
      return null;
  }
}

export interface CompareLink {
  source: string;
  label: string;
  url: string;
}

/**
 * Where else to look for an item: the other marketplaces with live listings in its country
 * (from the backend's status), then Google Shopping, which covers stores without an API.
 */
export function compareLinks(item: Pick<FashionItem, 'source' | 'market' | 'title' | 'brand'>, marketplaces: MarketplaceStatus[]): CompareLink[] {
  const query = searchQueryFor(item);
  const links: CompareLink[] = [];
  for (const m of marketplaces) {
    if (m.source === item.source || m.source === 'google_shopping' || !m.markets.includes(item.market)) continue;
    const url = marketplaceSearchUrl(m.source, item.market, query);
    if (url) links.push({ source: m.source, label: m.name, url });
  }
  const google = marketplaceSearchUrl('google_shopping', item.market, query);
  if (google) links.push({ source: 'google_shopping', label: 'Google Shopping', url: google });
  return links;
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

/**
 * Sources whose listings come from many different stores: Google Shopping offers, and brands'
 * own catalogs from impact.com. Their listings are shown under the store's (seller's) name.
 */
export function isMultiStoreSource(source: string): boolean {
  return source === 'google_shopping' || source === 'impact';
}

export function marketplaceCtaLabel(item: Pick<FashionItem, 'siteName' | 'source' | 'seller'>): string {
  if (isMultiStoreSource(item.source) && item.seller) return `View at ${item.seller}`;
  return `View on ${item.siteName}`;
}
