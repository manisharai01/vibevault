// Shared types for the VibeVault Edge Functions.
// Plain TypeScript (no Deno APIs) so the same code runs in Deno, Node and Jest.

export type Category = 'Tops' | 'Bottoms' | 'Dresses' | 'Outerwear' | 'Shoes' | 'Accessories' | 'Bags';
export const CATEGORIES: Category[] = ['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes', 'Accessories', 'Bags'];

/**
 * 'New with tags' = new. The pre-owned grades follow eBay's; 'Pre-owned' is used when the
 * marketplace says an item is used but doesn't grade it.
 */
export type Condition = 'New with tags' | 'Like new' | 'Good' | 'Fair' | 'Well-loved' | 'Pre-owned';

/** The store section an item is sold in. Kids' items are never ingested. */
export type Department = 'women' | 'men' | 'unisex';

export type StyleArchetype =
  | 'Minimalist'
  | 'Streetwear'
  | 'Bohemian'
  | 'Vintage'
  | 'Athleisure'
  | 'Preppy'
  | 'Grunge'
  | 'Cottagecore'
  | 'Dark Academia'
  | 'Y2K';

export const STYLE_ARCHETYPES: StyleArchetype[] = [
  'Minimalist',
  'Streetwear',
  'Bohemian',
  'Vintage',
  'Athleisure',
  'Preppy',
  'Grunge',
  'Cottagecore',
  'Dark Academia',
  'Y2K',
];

/** ISO 3166-1 alpha-2 code of the shopper's country, e.g. "IN". */
export type Market = string;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type EnvGetter = (key: string) => string | undefined;

/** A promo code the marketplace itself attaches to one listing (e.g. AliExpress). */
export interface ListingPromo {
  code: string | null;
  /** Human-readable terms as given by the marketplace, e.g. "US $3 off orders over US $20". */
  description: string;
  minSpend: number | null;
  currency: string | null;
  startsAt: string | null; // ISO timestamp
  endsAt: string | null; // ISO timestamp
}

/** A listing as returned by a marketplace, normalised to one shape. */
export interface NormalizedListing {
  /** Marketplace id (matches public.marketplaces.id), e.g. "ebay". */
  source: string;
  /** Shopper country this offer was retrieved for: price, currency and delivery apply to it. */
  market: Market;
  /** The marketplace's own id for the listing (ASIN, eBay item id, …). */
  sourceItemId: string;
  title: string;
  description: string | null;
  brand: string | null;
  imageUrl: string | null; // https only
  productUrl: string; // https only (affiliate link when the API returns one)
  condition: Condition;
  size: string | null;
  /** Colour exactly as the marketplace states it (attribute/aspect), if it has one. */
  colorText: string | null;
  seller: string | null;
  currency: string; // ISO 4217
  price: number; // what the shopper pays now (before shipping), in `currency`
  /** List price / MRP / "was" price, only when the marketplace reports one above `price`. */
  originalPrice: number | null;
  listedAt: string | null; // ISO timestamp
  available: boolean;
  /** Department from the marketplace's own category or gender data; null when it has none. */
  department: Department | null;
  /** The marketplace's category path or name (used to classify the item), e.g. "Clothing>Women>Dresses". */
  categoryText: string | null;
  /** Marketplace promo code attached to this listing, if any. */
  promo: ListingPromo | null;
}

export interface SearchRequest {
  /** Search words in the market's language (falls back to English). */
  query: string;
  /** The same search in English. */
  queryEn: string;
  category: Category;
  department: Department;
  market: Market;
  /** Listings wanted; providers cap it to what one API call returns. */
  limit: number;
}

export interface MarketplaceProvider {
  source: string;
  /** Shopper countries this provider can serve with its current configuration. */
  markets: Market[];
  search(request: SearchRequest): Promise<NormalizedListing[]>;
  /**
   * Current state of one listing for `market`, or null when the marketplace says it no
   * longer exists. Providers whose API has no item lookup omit this; their listings are
   * re-confirmed when searches find them again.
   */
  lookup?(sourceItemId: string, market: Market): Promise<NormalizedListing | null>;
  /**
   * Batch version of lookup for APIs that take several ids per call (Amazon: 10). Ids missing
   * from the returned map failed to load; null means the marketplace says the listing is gone.
   */
  lookupMany?(sourceItemIds: string[], market: Market): Promise<Map<string, NormalizedListing | null>>;
}

/** A configured service, or why it isn't available (missing keys). */
export type Slot<T> = T | { missing: string };

export function isConfigured<T extends object>(slot: Slot<T>): slot is T {
  return !('missing' in slot);
}

export interface ProviderDefinition {
  source: string;
  /** Environment variables it reads (documented in supabase/functions/.env.example). */
  env: string[];
  create(env: EnvGetter, fetch: FetchLike): Slot<MarketplaceProvider>;
}

// ---- Price history from a third-party archive (e.g. Keepa for Amazon) ----

export interface HistoryPoint {
  date: string; // YYYY-MM-DD (UTC)
  price: number;
}

export interface HistoryProvider {
  /** Name of the archive, e.g. "keepa". */
  name: string;
  /** Marketplace whose listings it covers, e.g. "amazon". */
  source: string;
  markets: Market[];
  /** Daily prices (oldest first) in `currency`, or null when the archive doesn't know the item. */
  history(sourceItemId: string, market: Market): Promise<{ currency: string; points: HistoryPoint[] } | null>;
}

export interface HistoryDefinition {
  name: string;
  env: string[];
  create(env: EnvGetter, fetch: FetchLike): Slot<HistoryProvider>;
}

// ---- Coupons and offers from official merchant / affiliate-network feeds ----

/**
 * Offers announced up to this far ahead are kept: they're shown as "sale starts on …" until
 * they start (see the upcoming_offers view), then as coupons.
 */
export const UPCOMING_OFFER_MS = 90 * 86_400_000;

export interface NormalizedOffer {
  /** Feed it came from, e.g. "flipkart", "admitad", "cuelinks". */
  network: string;
  /** Stable id of the offer within the network. */
  networkOfferId: string;
  /** Store the offer is for, e.g. "Myntra". */
  merchant: string;
  /** Store website domain without www, e.g. "myntra.com"; null when the feed doesn't give one. */
  merchantDomain: string | null;
  /** Countries the network says the offer is valid in; empty when the feed doesn't say. */
  markets: Market[];
  title: string;
  description: string | null;
  /** Coupon code to enter at checkout; null for deals that need no code. */
  code: string | null;
  /** https landing page (tracking link when the network provides one). */
  url: string;
  /** e.g. "10% off", "₹200 off" – as stated by the network. */
  discountText: string | null;
  minSpend: number | null;
  currency: string | null;
  startsAt: string | null; // ISO timestamp
  endsAt: string | null; // ISO timestamp
  categories: string[];
  imageUrl: string | null;
}

export interface OfferProvider {
  network: string;
  markets: Market[];
  /** Offers the network currently lists as valid for shoppers in `market`. */
  fetchOffers(market: Market): Promise<NormalizedOffer[]>;
}

export interface OfferSourceDefinition {
  network: string;
  env: string[];
  create(env: EnvGetter, fetch: FetchLike): Slot<OfferProvider>;
}

// ---- Database rows ----

/** `${source}:${market}:${sourceItemId}` – the same product in two countries is two offers. */
export function listingId(listing: Pick<NormalizedListing, 'source' | 'market' | 'sourceItemId'>): string {
  return `${listing.source}:${listing.market}:${listing.sourceItemId}`;
}

/** Row shape accepted by the `ingest_listings` SQL function. */
export interface IngestRow {
  id: string;
  source: string;
  market: string;
  source_item_id: string;
  title: string;
  description: string | null;
  brand: string | null;
  image_url: string | null;
  product_url: string;
  category: Category;
  department: Department;
  style_archetypes: StyleArchetype[];
  condition: Condition;
  size: string | null;
  colors: string[];
  seller: string | null;
  currency: string;
  current_price: number;
  original_price: number | null;
  available: boolean;
  listed_at: string | null;
}
