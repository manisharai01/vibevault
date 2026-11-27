// Admitad Coupons API – coupons and deals that advertisers publish for the publisher's ad space.
// Docs (developers.admitad.com now redirects to the Mitgo developer portal; checked 2026-11-26):
//   Token:   POST https://api.admitad.com/token/ – grant_type=client_credentials with HTTP Basic
//            client_id:client_secret and scope "coupons_for_website"; the token lives `expires_in` s.
//            https://developers.mitgo.com/hc/en-us/articles/34481345606546-Client-authorization
//            https://developers.mitgo.com/hc/en-us/articles/34481337268626-Help-on-access-settings
//   Coupons: GET https://api.admitad.com/coupons/website/{w_id}/?region=…&limit=…&offset=…
//            https://developers.mitgo.com/hc/en-us/articles/34481340467730-Coupons
//            ("List of coupons for the ad space"; a null date_end means the coupon is permanent)
//   Paging:  limit defaults to 20 and is at most 500.
//            https://developers.mitgo.com/hc/en-us/articles/34481350125970-Limit-offset-parameters
//   Limits:  600 requests per minute per application (HTTP 503 beyond that); error_code 6 means too
//            many tokens were issued, so the token is cached until it expires.
//            https://developers.mitgo.com/hc/en-us/articles/34481344279442-Help-on-API-response-codes
//   Regions: two-letter country codes, plus "00" (all regions) and "01" (CIS).
//            https://developers.mitgo.com/hc/en-us/articles/34481348463634-Auxiliary-information
//   Times:   date_start/date_end carry no offset: Admitad sets coupon start and end times "according
//            to UTC+3, regardless of your time zone".
//            https://support.mitgo.com/hc/en-us/articles/33312000259090-How-to-add-coupon-or-deal-to-affiliate-program

import { base64Encode } from '../crypto.ts';
import { HttpError, requestJson } from '../http.ts';
import { cleanText, toHttps } from '../normalize.ts';
import { parseMarketList } from '../providers/ebay.ts';
import type { EnvGetter, FetchLike, Market, NormalizedOffer, OfferProvider, OfferSourceDefinition } from '../types.ts';

export const ADMITAD_API_BASE = 'https://api.admitad.com';
export const ADMITAD_SCOPE = 'coupons_for_website';
/** Largest page the API serves. */
export const ADMITAD_PAGE_SIZE = 500;
/** Pages read per market at most (5,000 coupons). */
export const ADMITAD_MAX_PAGES = 10;
/** Admitad's coupon times are wall-clock times in UTC+3. */
export const ADMITAD_UTC_OFFSET_MINUTES = 180;
export const ADMITAD_DEFAULT_MARKETS: Market[] = ['IN', 'US', 'GB', 'DE', 'FR', 'ES', 'IT', 'BR', 'MX', 'PL'];
/** Region code for "valid in all regions". ("01" = CIS is a group, not a country, and is ignored.) */
const ALL_REGIONS = '00';

export interface AdmitadCoupon {
  id?: number | string;
  name?: string | null;
  short_name?: string | null;
  description?: string | null;
  /** "active" for coupons that are running. */
  status?: string | null;
  /** "promocode" (enter a code) or "action" (a deal that needs no code). */
  species?: string | null;
  promocode?: string | null;
  discount?: string | null;
  date_start?: string | null;
  date_end?: string | null;
  regions?: unknown[] | null;
  categories?: { id?: number; name?: string | null }[] | null;
  image?: string | null;
  goto_link?: string | null;
  frameset_link?: string | null;
  campaign?: { id?: number; name?: string | null; site_url?: string | null } | null;
}

export interface AdmitadCouponPage {
  results?: AdmitadCoupon[];
  _meta?: { count?: number; limit?: number; offset?: number };
}

interface AdmitadToken {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

export interface AdmitadConfig {
  clientId: string;
  clientSecret: string;
  /** Ad space ("website") id, the w_id of the coupons endpoint. */
  websiteId: string;
  /** Shopper countries to serve, e.g. ["IN", "US"]. */
  markets: Market[];
}

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/**
 * Wall-clock time written at `offsetMinutes` from UTC → ISO UTC; an explicit "Z"/"±hh:mm" in the
 * value wins. Absent → null; unreadable → undefined (the coupon's validity can't be checked).
 */
function wallClockToIso(value: unknown, offsetMinutes: number): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text) return null;
  const m = TIMESTAMP.exec(text);
  if (!m) return undefined;
  const [year, month, day, hour, minute, second] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0', m[6] ?? '0'].map(Number);
  const millis = Number(`${m[7] ?? ''}000`.slice(0, 3));
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  const check = new Date(wall);
  const sameDay = check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
  if (!sameDay || hour > 23 || minute > 59 || second > 59) return undefined;
  let offset = offsetMinutes;
  const zone = m[8]?.toUpperCase();
  if (zone === 'Z') offset = 0;
  else if (zone) {
    const digits = zone.slice(1).replace(':', '');
    offset = (zone.startsWith('-') ? -1 : 1) * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || '0'));
  }
  return new Date(wall - offset * 60_000).toISOString();
}

/** Admitad coupon time ("2018-11-10T00:00:00", UTC+3) → ISO UTC; null when absent, undefined when unreadable. */
export const admitadTimeToIso = (value: unknown): string | null | undefined => wallClockToIso(value, ADMITAD_UTC_OFFSET_MINUTES);

/** Placeholders feeds put in the code field of offers that need no code. */
const NO_CODE =
  /^(?:-+|—|n\/?a|none|null|not (?:required|needed|necessary)|(?:no|without) (?:(?:promo|coupon|voucher|discount) )?(?:code|promocode|promo code|coupon)s?(?: (?:is )?(?:needed|required|necessary))?|(?:promo |coupon |voucher )?code (?:is )?not (?:required|needed|necessary)|не (?:нужен|нужно|требуется)|без промокода)$/;

/** The code to type at checkout; null when the feed says none is needed, undefined when it gives none. */
export function admitadCouponCode(value: unknown): string | null | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const code = value.replace(/\s+/g, ' ').trim();
  const words = code.toLowerCase().replace(/[.!]+$/, '').trim();
  return words === '' || NO_CODE.test(words) ? null : code;
}

/** Store website → bare lowercase domain ("http://www.Example.com/x" → "example.com"). */
function domainOf(url: unknown): string | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  const raw = url.trim();
  const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`;
  try {
    const host = new URL(absolute).hostname.toLowerCase().replace(/\.$/, '').replace(/^www\d*\./, '');
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

/**
 * Coupon regions → ISO countries, `all` when the coupon is valid everywhere ("00").
 * Coupons list regions as strings (["KZ"]); the affiliate-programs endpoint of the same API uses
 * {"region": "KZ"} objects, so both are read.
 */
export function admitadRegions(regions: unknown): { all: boolean; markets: Market[] } {
  const codes = (Array.isArray(regions) ? regions : [])
    .map((r) => (typeof r === 'string' ? r : typeof r === 'object' && r !== null ? (r as { region?: unknown }).region : null))
    .filter((r): r is string => typeof r === 'string')
    .map((r) => r.trim().toUpperCase());
  return { all: codes.includes(ALL_REGIONS), markets: [...new Set(codes.filter((c) => /^[A-Z]{2}$/.test(c)))] };
}

/**
 * Converts one coupon into an offer for shoppers in `market`, or null when it isn't usable there at
 * `now`: not "active", not started, expired, not valid in that region, missing its code, or
 * missing the fields an offer needs.
 */
export function parseAdmitadCoupon(coupon: AdmitadCoupon, market: Market, now: Date): NormalizedOffer | null {
  if (!coupon || typeof coupon !== 'object') return null;
  if (String(coupon.status ?? '').trim().toLowerCase() !== 'active') return null;

  const id = typeof coupon.id === 'number' || typeof coupon.id === 'string' ? String(coupon.id).trim() : '';
  const merchant = cleanText(coupon.campaign?.name, 80);
  const title = cleanText(coupon.name, 160) ?? cleanText(coupon.short_name, 160);
  // goto_link is the ad space's tracking link; the store's own site is the fallback.
  const url = toHttps(coupon.goto_link) ?? toHttps(coupon.campaign?.site_url);
  if (!id || !merchant || !title || !url) return null;

  const regions = admitadRegions(coupon.regions);
  if (!regions.all && !regions.markets.includes(market.toUpperCase())) return null;

  const startsAt = admitadTimeToIso(coupon.date_start);
  const endsAt = admitadTimeToIso(coupon.date_end);
  if (startsAt === undefined || endsAt === undefined) return null;
  if (startsAt !== null && Date.parse(startsAt) > now.getTime()) return null;
  if (endsAt !== null && Date.parse(endsAt) <= now.getTime()) return null;

  // An "action" is a deal that applies without a code; a promo code coupon without its code is useless.
  const code = admitadCouponCode(coupon.promocode);
  const isDeal = String(coupon.species ?? '').trim().toLowerCase() === 'action';
  if (code === undefined && !isDeal) return null;

  const categories = (Array.isArray(coupon.categories) ? coupon.categories : [])
    .map((c) => cleanText(c?.name, 60))
    .filter((name): name is string => name !== null);

  return {
    network: 'admitad',
    networkOfferId: id,
    merchant,
    merchantDomain: domainOf(coupon.campaign?.site_url),
    markets: regions.all ? [] : regions.markets,
    title,
    description: cleanText(coupon.description, 600),
    code: code ?? null,
    url,
    discountText: cleanText(coupon.discount, 40),
    minSpend: null,
    currency: null,
    startsAt,
    endsAt,
    categories: [...new Set(categories)],
    imageUrl: toHttps(coupon.image),
  };
}

const formBody = (fields: Record<string, string>) =>
  Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

export function createAdmitadProvider(config: AdmitadConfig, fetch: FetchLike, now: () => Date = () => new Date()): OfferProvider {
  let token: { value: string; expiresAt: number } | null = null;
  let pendingToken: Promise<string> | null = null;

  async function requestToken(): Promise<string> {
    const body = await requestJson<AdmitadToken>(
      `${ADMITAD_API_BASE}/token/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${base64Encode(`${config.clientId}:${config.clientSecret}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          Accept: 'application/json',
        },
        body: formBody({ grant_type: 'client_credentials', client_id: config.clientId, scope: ADMITAD_SCOPE }),
      },
      { fetch, label: 'Admitad token' },
    );
    if (!body?.access_token) throw new Error('Admitad token response had no access_token');
    const lifetime = typeof body.expires_in === 'number' && body.expires_in > 0 ? body.expires_in : 3600;
    token = { value: body.access_token, expiresAt: now().getTime() + lifetime * 1000 };
    return token.value;
  }

  /** The cached token (fresh: false) or a newly issued one; concurrent callers share one request. */
  async function accessToken(): Promise<{ value: string; fresh: boolean }> {
    if (token && token.expiresAt > now().getTime() + 60_000) return { value: token.value, fresh: false };
    pendingToken ??= requestToken().finally(() => {
      pendingToken = null;
    });
    return { value: await pendingToken, fresh: true };
  }

  async function couponPage(region: Market, offset: number): Promise<AdmitadCouponPage | null> {
    const url =
      `${ADMITAD_API_BASE}/coupons/website/${encodeURIComponent(config.websiteId)}/` +
      `?region=${encodeURIComponent(region)}&limit=${ADMITAD_PAGE_SIZE}&offset=${offset}`;
    const get = (bearer: string) =>
      requestJson<AdmitadCouponPage>(
        url,
        { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' } },
        { fetch, label: 'Admitad coupons' },
      );
    const current = await accessToken();
    try {
      return await get(current.value);
    } catch (error) {
      // A cached token can be revoked or expire early (error_code 0/1): get a new one, once.
      if (!(error instanceof HttpError && error.status === 401) || current.fresh) throw error;
      token = null;
      return get((await accessToken()).value);
    }
  }

  return {
    network: 'admitad',
    markets: config.markets,

    async fetchOffers(market) {
      const region = market.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(region)) return [];
      const offers = new Map<string, NormalizedOffer>();
      let offset = 0;
      for (let page = 0; page < ADMITAD_MAX_PAGES; page++) {
        const body = await couponPage(region, offset);
        const results = Array.isArray(body?.results) ? body.results : [];
        const at = now();
        for (const coupon of results) {
          const offer = parseAdmitadCoupon(coupon, region, at);
          if (offer && !offers.has(offer.networkOfferId)) offers.set(offer.networkOfferId, offer);
        }
        offset += results.length;
        const count = body?._meta?.count;
        const limit = typeof body?._meta?.limit === 'number' && body._meta.limit > 0 ? body._meta.limit : ADMITAD_PAGE_SIZE;
        if (results.length === 0 || (typeof count === 'number' ? offset >= count : results.length < limit)) break;
      }
      return [...offers.values()];
    },
  };
}

export const admitadDefinition: OfferSourceDefinition = {
  network: 'admitad',
  env: ['ADMITAD_CLIENT_ID', 'ADMITAD_CLIENT_SECRET', 'ADMITAD_WEBSITE_ID', 'ADMITAD_MARKETS'],
  create(env: EnvGetter, fetch: FetchLike) {
    const clientId = env('ADMITAD_CLIENT_ID')?.trim();
    const clientSecret = env('ADMITAD_CLIENT_SECRET')?.trim();
    const websiteId = env('ADMITAD_WEBSITE_ID')?.trim();
    if (!clientId || !clientSecret || !websiteId) {
      return { missing: 'Admitad is not connected: set ADMITAD_CLIENT_ID, ADMITAD_CLIENT_SECRET and ADMITAD_WEBSITE_ID.' };
    }
    if (!/^\d+$/.test(websiteId)) return { missing: 'ADMITAD_WEBSITE_ID must be the numeric id of your Admitad ad space.' };
    return createAdmitadProvider(
      { clientId, clientSecret, websiteId, markets: parseMarketList(env('ADMITAD_MARKETS'), ADMITAD_DEFAULT_MARKETS) },
      fetch,
    );
  },
};
