// Flipkart Affiliate Offer APIs (v1): Flipkart's own deals for shoppers in India.
// Docs (checked 2026-11-26):
//   https://affiliate.flipkart.com/api-docs/af_offer_ref.html  All Offer API, Deals of the Day (DOTD) Offer API
//   https://affiliate.flipkart.com/api-docs/af_register.html   Fk-Affiliate-Id / Fk-Affiliate-Token headers, token setup
//   https://affiliate.flipkart.com/api-docs/af_faq.html        rate limit: 20 calls per second per affiliate
//   https://affiliate.flipkart.com/api-docs/af_errors.html     response codes (401 bad token, 410 URL expired, …)
//
//   GET https://affiliate-api.flipkart.net/affiliate/offers/v1/all/json   → { allOffersList: Offer[] }
//   GET https://affiliate-api.flipkart.net/affiliate/offers/v1/dotd/json  → { dotdList: Offer[] }
//   No request parameters and no pagination: each call returns the whole list.
//
// Validity: `availability` is "LIVE" (offer products in stock) or "OOS" (out of stock); only LIVE
// offers are kept. All-offers entries carry startTime/endTime, documented as Unix time; the JSON
// example uses milliseconds (1447785000000 is the XML example's 2015-11-18T00:00:00+05:30), so
// they're absolute instants and need no zone conversion. endTime is the expiry instant, so an offer
// is current while startTime <= now < endTime. Deals of the day have no window in the feed; they
// are kept with startsAt/endsAt null and are only valid while they're still in the feed.
//
// The feeds have no coupon codes (they're deals) and no offer id, so the id is a hash of the
// fields that identify an offer. They have no product ids either: `url` is a Flipkart listing page
// (category `sid` plus brand/price facets) and `category` a coarse name such as "automotive", so
// an offer can't be tied to specific products.

import { sha256Hex } from '../crypto.ts';
import { requestJson } from '../http.ts';
import { cleanText, toHttps } from '../normalize.ts';
import type { EnvGetter, FetchLike, Market, NormalizedOffer, OfferProvider, OfferSourceDefinition } from '../types.ts';

export const FLIPKART_OFFERS_BASE = 'https://affiliate-api.flipkart.net/affiliate/offers/v1';

/** The two offer lists: every current offer, and the deals of the day. */
export type FlipkartOfferList = 'all' | 'dotd';

export const FLIPKART_OFFER_URLS: Record<FlipkartOfferList, string> = {
  all: `${FLIPKART_OFFERS_BASE}/all/json`,
  dotd: `${FLIPKART_OFFERS_BASE}/dotd/json`,
};

export interface FlipkartOfferImage {
  url?: string | null;
  /** "default" (highest resolution), "high" (800x800), "mid" (400x400) or "low" (200x200). */
  resolutionType?: string | null;
}

export interface FlipkartOffer {
  title?: string | null;
  description?: string | null;
  url?: string | null;
  /** All-offers list only, e.g. "automotive". */
  category?: string | null;
  /** All-offers list only: Unix time in milliseconds. */
  startTime?: number | string | null;
  endTime?: number | string | null;
  imageUrls?: FlipkartOfferImage[] | null;
  /** "LIVE" (in stock) or "OOS" (out of stock). */
  availability?: string | null;
}

export interface FlipkartAllOffersResponse {
  allOffersList?: FlipkartOffer[] | null;
}

export interface FlipkartDotdResponse {
  dotdList?: FlipkartOffer[] | null;
}

export interface FlipkartOfferCredentials {
  affiliateId: string;
  token: string;
}

export interface FlipkartOffersOptions {
  /** Clock used to drop offers outside their window (tests inject one). */
  now?: () => Date;
}

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i;

/**
 * Epoch ms of a Flipkart offer time: null when the field is absent, NaN when it's present but
 * unusable (the offer is then dropped, since its window can't be checked). The API sends Unix time
 * in milliseconds; plain seconds and ISO-8601 strings with a zone (the XML feed's format) are
 * read too.
 */
export function flipkartTime(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') return null;
    if (/^\d+$/.test(text)) return flipkartTime(Number(text));
    return ISO_WITH_ZONE.test(text) ? Date.parse(text) : Number.NaN;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return Number.NaN;
  // 1e11 ms is 1973 and 1e11 s is year 5138, so the magnitude tells the unit.
  return value < 1e11 ? Math.round(value * 1000) : Math.round(value);
}

const IMAGE_RANK = ['default', 'high', 'mid', 'low'];

const rankOf = (resolutionType: unknown): number => {
  const index = typeof resolutionType === 'string' ? IMAGE_RANK.indexOf(resolutionType.trim().toLowerCase()) : -1;
  return index === -1 ? IMAGE_RANK.length : index;
};

/** https URL of the largest image: "default" is the highest resolution, then high, mid, low. */
export function pickFlipkartOfferImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  const candidates = images
    .filter((image): image is FlipkartOfferImage => typeof image === 'object' && image !== null)
    .map((image) => ({ url: httpsUrl(image.url), rank: rankOf(image.resolutionType) }))
    .filter((candidate): candidate is { url: string; rank: number } => candidate.url !== null)
    .sort((a, b) => a.rank - b.rank);
  return candidates[0]?.url ?? null;
}

/** An absolute https URL, upgrading http; null for anything else. */
function httpsUrl(value: unknown): string | null {
  const url = toHttps(value);
  return url !== null && /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:[/?#]\S*)?$/i.test(url) ? url : null;
}

const squash = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/**
 * Id that stays the same across fetches: a hash of the list and the offer's own fields (raw, so
 * that changes to text cleaning don't change ids). The end time is left out so an extended offer
 * keeps its id; the start time is in so the same promotion run twice gets two ids.
 */
async function offerId(list: FlipkartOfferList, offer: FlipkartOffer, url: string, start: number | null): Promise<string> {
  const key = [list, url, squash(offer.title), squash(offer.description), start ?? ''].join('\n');
  return `${list}:${(await sha256Hex(key)).slice(0, 32)}`;
}

/**
 * Converts one feed entry into an offer, or null when it isn't LIVE, `now` is outside its
 * window, or it lacks a title or a usable link.
 */
export async function parseFlipkartOffer(offer: FlipkartOffer, list: FlipkartOfferList, now: Date): Promise<NormalizedOffer | null> {
  if (typeof offer !== 'object' || offer === null) return null;
  if (squash(offer.availability).toUpperCase() !== 'LIVE') return null;

  const start = flipkartTime(offer.startTime);
  const end = flipkartTime(offer.endTime);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (start !== null && end !== null && end <= start) return null;
  const at = now.getTime();
  if (start !== null && at < start) return null;
  if (end !== null && at >= end) return null;

  const title = cleanText(offer.title, 200);
  const url = httpsUrl(offer.url);
  if (!title || !url) return null;
  const category = cleanText(offer.category, 80);

  return {
    network: 'flipkart',
    networkOfferId: await offerId(list, offer, url, start),
    merchant: 'Flipkart',
    merchantDomain: 'flipkart.com',
    markets: ['IN'],
    title,
    description: cleanText(offer.description, 600),
    code: null,
    url,
    // The feed has no discount field; the title ("Up to 30% off") already states it.
    discountText: null,
    minSpend: null,
    currency: null,
    startsAt: start === null ? null : new Date(start).toISOString(),
    endsAt: end === null ? null : new Date(end).toISOString(),
    categories: category ? [category] : [],
    imageUrl: pickFlipkartOfferImage(offer.imageUrls),
  };
}

export function createFlipkartOffersProvider(
  credentials: FlipkartOfferCredentials,
  fetch: FetchLike,
  options: FlipkartOffersOptions = {},
): OfferProvider {
  const now = options.now ?? (() => new Date());
  const headers = {
    'Fk-Affiliate-Id': credentials.affiliateId,
    'Fk-Affiliate-Token': credentials.token,
    Accept: 'application/json',
  };

  async function fetchList(list: FlipkartOfferList): Promise<unknown[]> {
    const label = list === 'all' ? 'Flipkart offers' : 'Flipkart deals of the day';
    const body = await requestJson<FlipkartAllOffersResponse & FlipkartDotdResponse>(FLIPKART_OFFER_URLS[list], { headers }, { fetch, label });
    const items = list === 'all' ? body?.allOffersList : body?.dotdList;
    return Array.isArray(items) ? items : [];
  }

  return {
    network: 'flipkart',
    markets: ['IN'],

    async fetchOffers(market: Market) {
      if (market.toUpperCase() !== 'IN') return [];
      const [all, dotd] = await Promise.all([fetchList('all'), fetchList('dotd')]);
      const at = now();
      const offers: NormalizedOffer[] = [];
      const seen = new Set<string>();
      // A deal of the day that is also in the all-offers list is kept once, with its window.
      for (const [list, items] of [['all', all], ['dotd', dotd]] as const) {
        for (const item of items) {
          const offer = await parseFlipkartOffer(item as FlipkartOffer, list, at);
          if (!offer) continue;
          const sameDeal = `${offer.url}\n${offer.title}`;
          if (seen.has(offer.networkOfferId) || seen.has(sameDeal)) continue;
          seen.add(offer.networkOfferId).add(sameDeal);
          offers.push(offer);
        }
      }
      return offers;
    },
  };
}

export const flipkartOffersDefinition: OfferSourceDefinition = {
  network: 'flipkart',
  env: ['FLIPKART_AFFILIATE_ID', 'FLIPKART_AFFILIATE_TOKEN'],
  create(env: EnvGetter, fetch: FetchLike) {
    const affiliateId = env('FLIPKART_AFFILIATE_ID')?.trim();
    const token = env('FLIPKART_AFFILIATE_TOKEN')?.trim();
    if (!affiliateId || !token) {
      return { missing: 'Flipkart offers are not connected: set FLIPKART_AFFILIATE_ID and FLIPKART_AFFILIATE_TOKEN.' };
    }
    return createFlipkartOffersProvider({ affiliateId, token }, fetch);
  },
};
