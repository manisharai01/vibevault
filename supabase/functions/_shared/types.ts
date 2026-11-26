// Shared types for the VibeVault Edge Functions.
// Plain TypeScript (no Deno APIs) so the same code runs in Deno, Node and Jest.

export type Source = 'flipkart' | 'ebay';

export type Category = 'Tops' | 'Bottoms' | 'Dresses' | 'Outerwear' | 'Shoes' | 'Accessories' | 'Bags';

export type Condition = 'New with tags' | 'Like new' | 'Good' | 'Fair' | 'Well-loved';

export type Region = 'India' | 'Global';

/** A listing as returned by a marketplace, normalised to one shape. */
export interface NormalizedListing {
  id: string; // `${source}:${sourceItemId}`
  source: Source;
  sourceItemId: string;
  title: string;
  description: string | null;
  brand: string | null;
  imageUrl: string | null;
  productUrl: string;
  condition: Condition;
  size: string | null;
  colors: string[];
  seller: string | null;
  region: Region;
  currency: string;
  price: number;
  originalPrice: number | null;
  listedAt: string | null; // ISO timestamp
  available: boolean;
}

export interface MarketplaceProvider {
  source: Source;
  /** Keyword search; returns at most `limit` listings. */
  search(query: string, limit: number): Promise<NormalizedListing[]>;
  /** Current state of one listing, or null if it no longer exists. */
  lookup(sourceItemId: string): Promise<NormalizedListing | null>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Row shape accepted by the `ingest_listings` SQL function. */
export interface IngestRow {
  id: string;
  source: Source;
  source_item_id: string;
  title: string;
  description: string | null;
  brand: string | null;
  image_url: string | null;
  product_url: string;
  category: Category;
  style_archetypes: string[];
  condition: Condition;
  size: string | null;
  colors: string[];
  seller: string | null;
  region: Region;
  currency: string;
  current_price: number;
  original_price: number | null;
  available: boolean;
  listed_at: string | null;
}

export function toIngestRow(listing: NormalizedListing, category: Category, styleArchetypes: string[]): IngestRow {
  return {
    id: listing.id,
    source: listing.source,
    source_item_id: listing.sourceItemId,
    title: listing.title,
    description: listing.description,
    brand: listing.brand,
    image_url: listing.imageUrl,
    product_url: listing.productUrl,
    category,
    style_archetypes: styleArchetypes,
    condition: listing.condition,
    size: listing.size,
    colors: listing.colors,
    seller: listing.seller,
    region: listing.region,
    currency: listing.currency,
    current_price: listing.price,
    original_price: listing.originalPrice,
    available: listing.available,
    listed_at: listing.listedAt,
  };
}
