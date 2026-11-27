// Cuelinks Monetization API (V3): coupons and deals from stores in India, through the Cuelinks
// affiliate network.
// Docs (checked 2026-11-26):
//   https://developers.cuelinks.com/docs                       base URL https://developers.cuelinks.com/pub_api/v3
//   https://developers.cuelinks.com/docs/authentication        "Authorization: Token <key>" (literally "Token"), key scopes
//   https://developers.cuelinks.com/docs/reference/offers      GET /offers: parameters, fields, example
//   https://developers.cuelinks.com/docs/reference/campaigns   GET /campaigns: domain, image, countries, access_status
//   https://developers.cuelinks.com/docs/errors                status codes
//   https://developers.cuelinks.com/docs/changelog             offers API added 2026-03-27, offer_type 2026-05-18
// The old V2 API (www.cuelinks.com/api/v2/…, `Token token="…"`) is no longer documented.
//
//   GET /offers?valid_on=YYYY-MM-DD&sort=id&order=desc&per_page=500&page=N   (scope read:offers)
//     → { data: Offer[], meta: { page, per_page, total, total_pages, next_page, prev_page } }
//   GET /campaigns?country_id=252&per_page=500&page=N                         (scope read:campaigns)
//     Active campaigns (stores) for India (country id 252); paused ones are left out.
//
// An offer only names its campaign (store), so the store's domain, logo and countries come from
// the campaign list. Offers are kept only when they are:
//   - status "live" (the API returns only live offers, valid on `valid_on`, today by default);
//   - inside their window at `now` (see cuelinksWindow for the time zone);
//   - for an active campaign that serves India and that we may promote (access_status "open" or
//     "approved": the docs say the campaign's tracking links are live only then).
// Pages: up to 10 of offers and 20 of campaigns (500 each) per fetch.

import { requestJson } from '../http.ts';
import { cleanText, toAmount, toHttps } from '../normalize.ts';
import type { EnvGetter, FetchLike, Market, NormalizedOffer, OfferProvider, OfferSourceDefinition } from '../types.ts';

export const CUELINKS_API_BASE = 'https://developers.cuelinks.com/pub_api/v3';
/** India's id in Cuelinks' country list (documented on List Campaigns). */
export const CUELINKS_INDIA_COUNTRY_ID = 252;
export const CUELINKS_MAX_PER_PAGE = 500;
export const CUELINKS_MAX_OFFER_PAGES = 10;
export const CUELINKS_MAX_CAMPAIGN_PAGES = 20;

export interface CuelinksCategory {
  id?: number | null;
  name?: string | null;
}

export interface CuelinksOffer {
  id?: number | string | null;
  title?: string | null;
  description?: string | null;
  terms?: string | null;
  coupon_code?: string | null;
  /** "coupon" when the offer has a coupon code, otherwise "deal". */
  offer_type?: string | null;
  campaign_id?: number | string | null;
  campaign_name?: string | null;
  categories?: CuelinksCategory[] | null;
  tracking_url?: string | null;
  /** Always "live": the API leaves non-live offers out. */
  status?: string | null;
  /** Calendar day, "YYYY-MM-DD". */
  start_date?: string | null;
  end_date?: string | null;
  original_price?: number | null;
  discount_price?: number | null;
  percent_off?: number | string | null;
  shipping_charge?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CuelinksCampaign {
  id?: number | string | null;
  name?: string | null;
  url?: string | null;
  domain?: string | null;
  image?: string | null;
  /** open | not_applied | pending | approved | rejected | blocked */
  access_status?: string | null;
  categories?: CuelinksCategory[] | null;
  countries?: { id?: number | null; iso?: string | null; name?: string | null }[] | null;
}

export interface CuelinksPage<T> {
  data?: T[] | null;
  meta?: {
    page?: number | null;
    per_page?: number | null;
    total?: number | null;
    total_pages?: number | null;
    next_page?: number | null;
    prev_page?: number | null;
  } | null;
}

export interface CuelinksOptions {
  /** Clock used to drop offers outside their window (tests inject one). */
  now?: () => Date;
  perPage?: number;
  maxOfferPages?: number;
  maxCampaignPages?: number;
}

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 19_800_000; // +05:30

/** "YYYY-MM-DD" with optional "THH:MM[:SS[.fff]]" and optional zone. */
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/** Calendar-checked epoch ms of a wall-clock time read as UTC, or null. */
function wallClockMs(y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number): number | null {
  if (h > 23 || mi > 59 || s > 59) return null;
  const value = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  const check = new Date(value);
  return check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d ? value : null;
}

/**
 * Epoch ms of one end of an offer's window: null when the date is absent, NaN when it's present
 * but unreadable. Dates with an explicit zone are exact. Zone-less ones (the API's "YYYY-MM-DD")
 * get the reading that keeps the window inside both IST and UTC (see cuelinksWindow).
 */
function boundMs(value: unknown, edge: 'start' | 'end'): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return Number.NaN;
  const text = value.trim();
  if (text === '') return null;
  const m = DATE_TIME.exec(text);
  if (!m) return Number.NaN;
  const [, y, mo, d, h, mi, s, frac, zone] = m;
  const wall = wallClockMs(+y, +mo, +d, +(h ?? 0), +(mi ?? 0), +(s ?? 0), frac ? Number(frac.padEnd(3, '0')) : 0);
  if (wall === null) return Number.NaN;
  // A bare day ends at its last millisecond.
  const instant = h === undefined && edge === 'end' ? wall + DAY_MS - 1 : wall;
  if (zone) {
    if (zone.toUpperCase() === 'Z') return instant;
    const [, sign, hh, mm] = /^([+-])(\d{2}):?(\d{2})$/.exec(zone) ?? [];
    return instant - (sign === '-' ? -1 : 1) * (Number(hh) * 60 + Number(mm)) * 60_000;
  }
  // IST is ahead of UTC, so a zone-less start is latest read as UTC and an end earliest read as IST.
  return edge === 'start' ? instant : instant - IST_OFFSET_MS;
}

/**
 * The instants an offer is valid between, as epoch ms (null = open-ended), or null when a date
 * is unreadable or the window is inverted.
 *
 * Cuelinks gives calendar days and doesn't document their time zone. Its stores are Indian, so
 * IST is the likely meaning, but the V3 API otherwise speaks UTC. Rather than guess, the window is
 * the part both readings agree on: from 00:00 UTC (05:30 IST) on start_date to 23:59:59.999 IST
 * (18:29:59.999 UTC) on end_date. Read either way, the offer has started and not yet ended inside
 * it; at most 5.5 hours at one edge are given up.
 */
export function cuelinksWindow(startDate: unknown, endDate: unknown): { start: number | null; end: number | null } | null {
  const start = boundMs(startDate, 'start');
  const end = boundMs(endDate, 'end');
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (start !== null && end !== null && end < start) return null;
  return { start, end };
}

/** Indian calendar date of `now`, "YYYY-MM-DD" (sent as valid_on). */
export function istDate(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const NO_CODE = [
  /^(?:n\/?a|nil|null|none|no|-+|\.+|\*+)$/,
  /^not\s?(?:required|needed|applicable|necessary)$/,
  /^no\s?(?:(?:coupon|promo|voucher|discount)\s?)?(?:code\s?)?(?:is\s?)?(?:required|needed|necessary)$/,
  /^no\s?(?:(?:coupon|promo|voucher|discount)\s?)?code$/,
  /^(?:(?:coupon|promo|voucher)\s?)?code\s?(?:is\s?)?not\s?(?:required|needed|necessary)$/,
  /^(?:no coupon|auto[\s-]?appl(?:y|ied)|automatically applied|applied automatically|get deal|activate deal|shop now)$/,
];

/** The code to type at checkout, or null for empty values and "no code needed" placeholders. */
export function cuelinksCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.replace(/\s+/g, ' ').trim();
  if (code === '') return null;
  const lower = code.toLowerCase().replace(/[.!]+$/, '');
  return NO_CODE.some((pattern) => pattern.test(lower)) ? null : code;
}

/** "https://www.Myntra.com/men" → "myntra.com"; null unless the value holds a domain name. */
export function bareDomain(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^\/\//, '')
    .split(/[/?#]/)[0]
    .replace(/^[^@]*@/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
    .replace(/^www\d*\./, '');
  return /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ? host : null;
}

/** An absolute https URL, upgrading http; null for anything else. */
function httpsUrl(value: unknown): string | null {
  const url = toHttps(value);
  return url !== null && /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:[/?#]\S*)?$/i.test(url) ? url : null;
}

/** A positive integer id as a string, or null. */
function idOf(value: unknown): string | null {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? String(value) : null;
  if (typeof value === 'string' && /^\d+$/.test(value.trim()) && Number(value) > 0) return value.trim();
  return null;
}

function categoryNames(categories: unknown): string[] {
  if (!Array.isArray(categories)) return [];
  const names = categories.map((category) => cleanText((category as CuelinksCategory | null)?.name, 80));
  return [...new Set(names.filter((name): name is string => name !== null))];
}

const PROMOTABLE = new Set(['open', 'approved']);

/** Active Indian campaign whose tracking links work for us (fields absent = not stated, allowed). */
function usableCampaign(campaign: CuelinksCampaign | undefined): campaign is CuelinksCampaign {
  if (!campaign) return false;
  const access = typeof campaign.access_status === 'string' ? campaign.access_status.trim().toLowerCase() : null;
  if (access !== null && !PROMOTABLE.has(access)) return false;
  const countries = Array.isArray(campaign.countries) ? campaign.countries : [];
  return countries.length === 0 || countries.some((country) => country?.iso?.trim().toUpperCase() === 'IN');
}

/** Live, with an id, and inside its window at `now`. */
export function isCurrentCuelinksOffer(offer: CuelinksOffer, now: Date): boolean {
  if (typeof offer !== 'object' || offer === null || idOf(offer.id) === null) return false;
  if (typeof offer.status !== 'string' || offer.status.trim().toLowerCase() !== 'live') return false;
  const window = cuelinksWindow(offer.start_date, offer.end_date);
  if (!window) return false;
  const at = now.getTime();
  return (window.start === null || window.start <= at) && (window.end === null || at <= window.end);
}

/**
 * Converts one offer, with the campaign it belongs to, into a normalised offer; null when it isn't
 * current, its campaign isn't usable, or it lacks a title, store name or link.
 */
export function parseCuelinksOffer(offer: CuelinksOffer, campaign: CuelinksCampaign | undefined, now: Date): NormalizedOffer | null {
  if (!isCurrentCuelinksOffer(offer, now) || !usableCampaign(campaign)) return null;
  const window = cuelinksWindow(offer.start_date, offer.end_date);
  const id = idOf(offer.id);
  const title = cleanText(offer.title, 200);
  const merchant = cleanText(offer.campaign_name, 80) ?? cleanText(campaign.name, 80);
  const url = httpsUrl(offer.tracking_url) ?? httpsUrl(campaign.url);
  if (!window || !id || !title || !merchant || !url) return null;

  const description = cleanText(offer.description, 600);
  const terms = cleanText(offer.terms, 600);
  const text = [description, terms && terms !== description ? `Terms: ${terms}` : null].filter(Boolean).join('\n');
  const percent = toAmount(offer.percent_off);
  const isDeal = typeof offer.offer_type === 'string' && offer.offer_type.trim().toLowerCase() === 'deal';
  const offerCategories = categoryNames(offer.categories);

  return {
    network: 'cuelinks',
    networkOfferId: id,
    merchant,
    merchantDomain: bareDomain(campaign.domain) ?? bareDomain(campaign.url),
    markets: ['IN'],
    title,
    description: text || null,
    code: isDeal ? null : cuelinksCode(offer.coupon_code),
    url,
    discountText: percent !== null && percent > 0 && percent <= 100 ? `${percent}% off` : null,
    minSpend: null,
    currency: null,
    startsAt: window.start === null ? null : new Date(window.start).toISOString(),
    endsAt: window.end === null ? null : new Date(window.end).toISOString(),
    categories: offerCategories.length > 0 ? offerCategories : categoryNames(campaign.categories),
    imageUrl: httpsUrl(campaign.image),
  };
}

export function createCuelinksProvider(apiKey: string, fetch: FetchLike, options: CuelinksOptions = {}): OfferProvider {
  const now = options.now ?? (() => new Date());
  const perPage = Math.max(1, Math.min(CUELINKS_MAX_PER_PAGE, Math.floor(options.perPage ?? CUELINKS_MAX_PER_PAGE)));
  const maxOfferPages = options.maxOfferPages ?? CUELINKS_MAX_OFFER_PAGES;
  const maxCampaignPages = options.maxCampaignPages ?? CUELINKS_MAX_CAMPAIGN_PAGES;
  const headers = { Authorization: `Token ${apiKey}`, Accept: 'application/json' };

  /**
   * Reads pages 1, 2, … following meta.next_page, at most `maxPages`, stopping early on an empty
   * page or when `onPage` returns true. Without meta, a short page is the last.
   */
  async function readPages<T>(path: string, query: string, label: string, maxPages: number, onPage: (items: T[]) => boolean | void) {
    let page = 1;
    for (let read = 0; read < maxPages; read++) {
      const url = `${CUELINKS_API_BASE}/${path}?${query}&per_page=${perPage}&page=${page}`;
      const body = await requestJson<CuelinksPage<T>>(url, { headers }, { fetch, label: `${label} (page ${page})` });
      const items = Array.isArray(body?.data) ? body.data : [];
      if (items.length === 0 || onPage(items) === true) return;
      const next = body?.meta ? body.meta.next_page : items.length >= perPage ? page + 1 : null;
      if (typeof next !== 'number' || !Number.isInteger(next) || next <= page) return;
      page = next;
    }
  }

  return {
    network: 'cuelinks',
    markets: ['IN'],

    async fetchOffers(market: Market) {
      if (market.toUpperCase() !== 'IN') return [];
      const at = now();

      const current: CuelinksOffer[] = [];
      await readPages<CuelinksOffer>('offers', `valid_on=${istDate(at)}&sort=id&order=desc`, 'Cuelinks offers', maxOfferPages, (items) => {
        current.push(...items.filter((offer) => isCurrentCuelinksOffer(offer, at)));
      });
      if (current.length === 0) return [];

      // Only the campaigns these offers name are needed; stop paging once all are found.
      const wanted = new Set(current.map((offer) => idOf(offer.campaign_id)).filter((id): id is string => id !== null));
      const campaigns = new Map<string, CuelinksCampaign>();
      if (wanted.size > 0) {
        await readPages<CuelinksCampaign>('campaigns', `country_id=${CUELINKS_INDIA_COUNTRY_ID}`, 'Cuelinks campaigns', maxCampaignPages, (items) => {
          for (const campaign of items) {
            const id = idOf(campaign?.id);
            if (id === null) continue;
            campaigns.set(id, campaign);
            wanted.delete(id);
          }
          return wanted.size === 0;
        });
      }

      const offers: NormalizedOffer[] = [];
      const seen = new Set<string>();
      for (const offer of current) {
        const parsed = parseCuelinksOffer(offer, campaigns.get(idOf(offer.campaign_id) ?? ''), at);
        if (!parsed || seen.has(parsed.networkOfferId)) continue;
        seen.add(parsed.networkOfferId);
        offers.push(parsed);
      }
      return offers;
    },
  };
}

export const cuelinksDefinition: OfferSourceDefinition = {
  network: 'cuelinks',
  env: ['CUELINKS_API_KEY'],
  create(env: EnvGetter, fetch: FetchLike) {
    const apiKey = env('CUELINKS_API_KEY')?.trim();
    if (!apiKey) {
      return { missing: 'Cuelinks is not connected: set CUELINKS_API_KEY (a V3 key with the read:offers and read:campaigns scopes).' };
    }
    return createCuelinksProvider(apiKey, fetch);
  },
};
