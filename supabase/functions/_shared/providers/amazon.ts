// Amazon Creators API (successor of PA-API 5.0, which Amazon retired in 2026) – new fashion
// from Amazon's marketplaces, with the buy-box price for each locale.
// Docs (Associates Central, checked 2026-11-26):
//   https://affiliate-program.amazon.com/creatorsapi/docs/en-us/get-started/using-curl
//   https://affiliate-program.amazon.com/creatorsapi/docs/en-us/concepts/common-request-headers-and-parameters
//   https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/operations/search-items
//   https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/operations/get-items
//   https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/resources/offersV2
//   https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/resources/item-info
//   https://affiliate-program.amazon.com/creatorsapi/docs/en-us/concepts/api-rates
//   https://affiliate-program.amazon.com/creatorsapi/docs/en-us/troubleshooting/error-codes-and-messages
//
//   Token:  POST https://api.amazon.com/auth/o2/token (NA, credential version 3.1),
//           api.amazon.co.uk (EU/ME/India, 3.2), api.amazon.co.jp (FE, 3.3)
//           JSON {grant_type: client_credentials, client_id, client_secret, scope: creatorsapi::default}
//           → {access_token, token_type: bearer, expires_in: 3600}
//   Calls:  POST https://creatorsapi.amazon/catalog/v1/searchItems | getItems
//           headers Authorization: Bearer …, x-marketplace: www.amazon.in; body is lowerCamelCase with
//           partnerTag + marketplace on every call. Up to 10 items per call.
//   Limits: new credentials get 1 call per second (8,640 a day), so calls are spaced out here.
//   Access: needs 10 qualified sales in the trailing 30 days (403 AssociateNotEligible otherwise).
// The searchItems path is inferred from the documented getItems path and operation name.

import { HttpError, requestJson } from '../http.ts';
import { cleanText, toAmount, toHttps } from '../normalize.ts';
import type {
  Condition,
  EnvGetter,
  FetchLike,
  ListingPromo,
  Market,
  MarketplaceProvider,
  NormalizedListing,
  ProviderDefinition,
} from '../types.ts';

export const AMAZON_API_BASE = 'https://creatorsapi.amazon/catalog/v1';
export const AMAZON_MAX_ITEMS = 10;
/** New Creators API credentials are limited to one call per second. */
export const AMAZON_MIN_CALL_GAP_MS = 1100;

/** Shopper country → Amazon site host (the documented marketplace values). */
export const AMAZON_SITES: Record<string, string> = {
  US: 'www.amazon.com',
  CA: 'www.amazon.ca',
  BR: 'www.amazon.com.br',
  MX: 'www.amazon.com.mx',
  GB: 'www.amazon.co.uk',
  DE: 'www.amazon.de',
  FR: 'www.amazon.fr',
  IT: 'www.amazon.it',
  ES: 'www.amazon.es',
  NL: 'www.amazon.nl',
  BE: 'www.amazon.com.be',
  EG: 'www.amazon.eg',
  IN: 'www.amazon.in',
  IE: 'www.amazon.ie',
  PL: 'www.amazon.pl',
  SA: 'www.amazon.sa',
  SE: 'www.amazon.se',
  TR: 'www.amazon.com.tr',
  AE: 'www.amazon.ae',
  JP: 'www.amazon.co.jp',
  SG: 'www.amazon.sg',
  AU: 'www.amazon.com.au',
};

const REGION_BY_MARKET: Record<string, '3.1' | '3.2' | '3.3'> = {
  US: '3.1', CA: '3.1', BR: '3.1', MX: '3.1',
  JP: '3.3', SG: '3.3', AU: '3.3',
};

/** Login with Amazon token endpoint for each credential version. */
export const AMAZON_TOKEN_URLS: Record<'3.1' | '3.2' | '3.3', string> = {
  '3.1': 'https://api.amazon.com/auth/o2/token',
  '3.2': 'https://api.amazon.co.uk/auth/o2/token',
  '3.3': 'https://api.amazon.co.jp/auth/o2/token',
};

export const AMAZON_RESOURCES = [
  'itemInfo.title',
  'itemInfo.byLineInfo',
  'itemInfo.productInfo',
  'itemInfo.classifications',
  'images.primary.large',
  'browseNodeInfo.browseNodes',
  'browseNodeInfo.browseNodes.ancestor',
  'offersV2.listings.price',
  'offersV2.listings.availability',
  'offersV2.listings.condition',
  'offersV2.listings.isBuyBoxWinner',
  'offersV2.listings.merchantInfo',
  'offersV2.listings.dealDetails',
];

export interface AmazonConfig {
  clientId: string;
  clientSecret: string;
  /** Credential version from Associates Central: 3.1 (NA), 3.2 (EU, Middle East, India), 3.3 (Far East). */
  credentialVersion: '3.1' | '3.2' | '3.3';
  /** Shopper country → associate tag for that Amazon site. */
  partnerTags: Record<string, string>;
}

interface Money {
  amount?: number | string;
  currency?: string;
}

interface BrowseNode {
  displayName?: string;
  contextFreeName?: string;
  ancestor?: BrowseNode | null;
}

interface OfferListing {
  isBuyBoxWinner?: boolean;
  price?: {
    money?: Money;
    savingBasis?: { money?: Money; savingBasisType?: string } | null;
  } | null;
  availability?: { type?: string } | null;
  condition?: { value?: string; subCondition?: string } | null;
  merchantInfo?: { name?: string } | null;
  dealDetails?: { badge?: string; startTime?: string; endTime?: string } | null;
}

export interface AmazonItem {
  asin?: string;
  detailPageURL?: string;
  images?: { primary?: { large?: { url?: string }; medium?: { url?: string }; small?: { url?: string } } };
  itemInfo?: {
    title?: { displayValue?: string };
    byLineInfo?: { brand?: { displayValue?: string }; manufacturer?: { displayValue?: string } };
    productInfo?: { color?: { displayValue?: string }; size?: { displayValue?: string } };
    classifications?: { productGroup?: { displayValue?: string }; binding?: { displayValue?: string } };
  };
  browseNodeInfo?: { browseNodes?: BrowseNode[] };
  offersV2?: { listings?: OfferListing[] } | null;
}

/** "Clothing & Accessories>Women>Dresses" from the item's first browse node and its ancestors. */
export function browsePath(nodes: BrowseNode[] | undefined): string | null {
  const node = nodes?.[0];
  if (!node) return null;
  const names: string[] = [];
  for (let n: BrowseNode | null | undefined = node; n && names.length < 12; n = n.ancestor) {
    const name = n.contextFreeName ?? n.displayName;
    if (typeof name === 'string' && name.trim()) names.unshift(name.trim());
  }
  return names.length ? names.join('>') : null;
}

export function mapAmazonCondition(value: unknown, subCondition: unknown): Condition {
  const v = typeof value === 'string' ? value.toLowerCase() : '';
  const sub = typeof subCondition === 'string' ? subCondition.toLowerCase() : '';
  if (v === 'new' || v === '') return 'New with tags';
  if (sub === 'likenew') return 'Like new';
  if (sub === 'verygood' || sub === 'good') return 'Good';
  if (sub === 'acceptable') return 'Fair';
  return 'Pre-owned';
}

const AVAILABLE_TYPES = new Set(['IN_STOCK', 'IN_STOCK_SCARCE', 'LEADTIME', 'AVAILABLE_DATE', 'PREORDER']);
/** Saving bases that are a real list/was price (not "lowest price in 30 days"). */
const ORIGINAL_PRICE_BASES = new Set(['LIST_PRICE', 'WAS_PRICE']);

/** The listing Amazon shows in the buy box (or the first one). */
function featuredListing(item: AmazonItem): OfferListing | null {
  const listings = item.offersV2?.listings ?? [];
  return listings.find((l) => l?.isBuyBoxWinner) ?? listings[0] ?? null;
}

export function parseAmazonItem(item: AmazonItem, market: Market, now: Date = new Date()): NormalizedListing | null {
  const asin = typeof item?.asin === 'string' ? item.asin.trim() : '';
  const title = cleanText(item?.itemInfo?.title?.displayValue, 160);
  const productUrl = toHttps(item?.detailPageURL);
  const listing = featuredListing(item);
  const price = toAmount(listing?.price?.money?.amount);
  const currency = listing?.price?.money?.currency;
  if (!asin || !title || !productUrl || price === null || price === 0 || typeof currency !== 'string') return null;

  const basis = listing?.price?.savingBasis;
  const original =
    basis && ORIGINAL_PRICE_BASES.has(String(basis.savingBasisType ?? '').toUpperCase()) ? toAmount(basis.money?.amount) : null;
  const availability = String(listing?.availability?.type ?? 'IN_STOCK').toUpperCase();
  const deal = listing?.dealDetails;
  const dealEnds = typeof deal?.endTime === 'string' ? deal.endTime : null;
  const promo: ListingPromo | null =
    deal && (!dealEnds || new Date(dealEnds).getTime() > now.getTime())
      ? {
          code: null,
          description: cleanText(deal.badge, 120) ?? 'Limited time deal',
          minSpend: null,
          currency,
          startsAt: typeof deal.startTime === 'string' ? deal.startTime : null,
          endsAt: dealEnds,
        }
      : null;
  const images = item.images?.primary;

  return {
    source: 'amazon',
    market,
    sourceItemId: asin,
    title,
    description: null,
    brand: cleanText(item.itemInfo?.byLineInfo?.brand?.displayValue ?? item.itemInfo?.byLineInfo?.manufacturer?.displayValue, 60),
    imageUrl: toHttps(images?.large?.url ?? images?.medium?.url ?? images?.small?.url),
    productUrl,
    condition: mapAmazonCondition(listing?.condition?.value, listing?.condition?.subCondition),
    size: cleanText(item.itemInfo?.productInfo?.size?.displayValue, 40),
    colorText: cleanText(item.itemInfo?.productInfo?.color?.displayValue, 40),
    seller: cleanText(listing?.merchantInfo?.name, 80),
    currency: currency.toUpperCase(),
    price,
    originalPrice: original !== null && original > price ? original : null,
    listedAt: null,
    available: AVAILABLE_TYPES.has(availability),
    department: null,
    categoryText: cleanText(browsePath(item.browseNodeInfo?.browseNodes) ?? item.itemInfo?.classifications?.productGroup?.displayValue, 200),
    promo,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createAmazonProvider(config: AmazonConfig, fetch: FetchLike, now: () => Date = () => new Date()): MarketplaceProvider {
  let token: { value: string; expiresAt: number } | null = null;
  let nextCallAt = 0;
  /** Markets whose site rejected the Fashion search index (searched across All instead). */
  const searchAll = new Set<string>();
  const markets = Object.keys(config.partnerTags).filter((m) => AMAZON_SITES[m]);

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt > now().getTime() + 60_000) return token.value;
    const body = await requestJson<{ access_token?: string; expires_in?: number }>(
      AMAZON_TOKEN_URLS[config.credentialVersion],
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: config.clientId,
          client_secret: config.clientSecret,
          scope: 'creatorsapi::default',
        }),
      },
      { fetch, label: 'Amazon token' },
    );
    if (!body?.access_token) throw new Error('Amazon token response had no access_token');
    token = { value: body.access_token, expiresAt: now().getTime() + (body.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  /** Spaces calls out to respect the 1-call-per-second limit of new credentials. */
  async function throttle(): Promise<void> {
    const at = Date.now();
    const wait = nextCallAt - at;
    nextCallAt = Math.max(at, nextCallAt) + AMAZON_MIN_CALL_GAP_MS;
    if (wait > 0) await sleep(wait);
  }

  async function call<T>(operation: 'searchItems' | 'getItems', market: Market, body: Record<string, unknown>): Promise<T | null> {
    const site = AMAZON_SITES[market];
    const partnerTag = config.partnerTags[market];
    if (!site || !partnerTag) throw new Error(`Amazon: no partner tag configured for ${market}`);
    const bearer = await accessToken();
    await throttle();
    return requestJson<T>(
      `${AMAZON_API_BASE}/${operation}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-marketplace': site,
        },
        body: JSON.stringify({ ...body, partnerTag, marketplace: site, resources: AMAZON_RESOURCES }),
      },
      { fetch, label: `Amazon ${operation}` },
      true, // 404 = "no results" / "no items found"
    );
  }

  /**
   * Looks up ASINs 10 per call. A chunk that fails is left out of the result (its ASINs count as
   * failed lookups, not as gone); if every chunk fails, the first error is thrown.
   */
  async function getItems(asins: string[], market: Market): Promise<Map<string, NormalizedListing | null>> {
    const result = new Map<string, NormalizedListing | null>();
    let firstError: unknown = null;
    let succeeded = 0;
    for (let i = 0; i < asins.length; i += AMAZON_MAX_ITEMS) {
      const chunk = asins.slice(i, i + AMAZON_MAX_ITEMS);
      let body: { itemsResult?: { items?: AmazonItem[] }; itemResults?: { items?: AmazonItem[] } } | null;
      try {
        body = await call('getItems', market, { itemIds: chunk, itemIdType: 'ASIN' });
        succeeded++;
      } catch (error) {
        firstError ??= error;
        continue;
      }
      const items = body?.itemsResult?.items ?? body?.itemResults?.items ?? [];
      const at = now();
      const byAsin = new Map(items.filter((it) => typeof it?.asin === 'string').map((it) => [it.asin as string, it]));
      for (const asin of chunk) {
        const item = byAsin.get(asin);
        // Not returned (invalid, no longer sold, not accessible) or no buyable offer: gone.
        result.set(asin, item ? parseAmazonItem(item, market, at) : null);
      }
    }
    if (succeeded === 0 && firstError) throw firstError;
    return result;
  }

  return {
    source: 'amazon',
    markets,

    async search({ query, market, limit }) {
      const itemCount = Math.max(1, Math.min(AMAZON_MAX_ITEMS, Math.floor(limit)));
      const run = (searchIndex: string) =>
        call<{ searchResult?: { items?: AmazonItem[] } }>('searchItems', market, {
          keywords: query,
          searchIndex,
          itemCount,
          availability: 'Available',
        });
      let body;
      try {
        body = await run(searchAll.has(market) ? 'All' : 'Fashion');
      } catch (error) {
        // A site without the Fashion index rejects it (400); search everything there instead.
        if (!(error instanceof HttpError) || error.status !== 400 || searchAll.has(market)) throw error;
        searchAll.add(market);
        body = await run('All');
      }
      const at = now();
      return (body?.searchResult?.items ?? [])
        .map((item) => parseAmazonItem(item, market, at))
        .filter((listing): listing is NormalizedListing => listing !== null && listing.available)
        .slice(0, itemCount);
    },

    async lookup(asin, market) {
      return (await getItems([asin], market)).get(asin) ?? null;
    },

    lookupMany: getItems,
  };
}

/** "IN:mytag-21, US:mytag-20" → { IN: 'mytag-21', US: 'mytag-20' } (supported sites only). */
export function parsePartnerTags(value: string | undefined): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const part of (value ?? '').split(/[,\s]+/)) {
    const match = /^([A-Za-z]{2}):([A-Za-z0-9_-]+)$/.exec(part.trim());
    if (match && AMAZON_SITES[match[1].toUpperCase()]) tags[match[1].toUpperCase()] = match[2];
  }
  return tags;
}

export const amazonDefinition: ProviderDefinition = {
  source: 'amazon',
  env: ['AMAZON_CREATORS_CLIENT_ID', 'AMAZON_CREATORS_CLIENT_SECRET', 'AMAZON_CREATORS_CREDENTIAL_VERSION', 'AMAZON_PARTNER_TAGS'],
  create(env: EnvGetter, fetch: FetchLike) {
    const clientId = env('AMAZON_CREATORS_CLIENT_ID')?.trim();
    const clientSecret = env('AMAZON_CREATORS_CLIENT_SECRET')?.trim();
    const partnerTags = parsePartnerTags(env('AMAZON_PARTNER_TAGS'));
    const markets = Object.keys(partnerTags);
    if (!clientId || !clientSecret || markets.length === 0) {
      return {
        missing:
          'Amazon is not connected: set AMAZON_CREATORS_CLIENT_ID, AMAZON_CREATORS_CLIENT_SECRET and AMAZON_PARTNER_TAGS (e.g. IN:yourtag-21).',
      };
    }
    const version = env('AMAZON_CREATORS_CREDENTIAL_VERSION')?.trim();
    const credentialVersion =
      version === '3.1' || version === '3.2' || version === '3.3' ? version : (REGION_BY_MARKET[markets[0]] ?? '3.2');
    return createAmazonProvider({ clientId, clientSecret, credentialVersion, partnerTags }, fetch);
  },
};
