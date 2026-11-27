// Awin publisher API – "Retrieve Offers": promotions and voucher codes of advertisers the
// publisher has joined. Docs (checked 2026-11-26):
//   Offers:     POST https://api.awin.com/publisher/{publisherId}/promotions with a JSON body
//               {filters: {membership, regionCodes, status, type, …}, pagination: {page, pageSize}}.
//               status "active" = "Offers which are currently valid"; "upcoming" = "Offers which are not yet
//               valid (their startDate is in the future)"; pageSize 10–200 (default 200);
//               startDate/endDate are "YYYY-MM-DDT00:00:00.000" and "Time is in UTC"; voucher.code is
//               null when the publisher hasn't joined the advertiser.
//               https://help.awin.com/apidocs/promotions (OpenAPI: https://help.awin.com/apidocs/promotions.md)
//               The current page has no example response; the envelope {data: [...], pagination:
//               {page, pageSize, total}} is from the example on Awin's original page for this endpoint:
//               https://web.archive.org/web/20221129142811/https://wiki.awin.com/index.php/API_Post_Offers
//   Programmes: GET https://api.awin.com/publishers/{publisherId}/programmes?relationship=joined – the
//               advertiser's website (displayUrl), logo and sector, which offers don't carry.
//               https://help.awin.com/apidocs/get-program-information
//   Auth:       "Authorization: Bearer <token>" (classic API token or Personal Access Token).
//               https://help.awin.com/apidocs/api-authentication
//   Limits:     both are "Legacy APIs" (https://api.awin.com, no /public): 20 calls per minute per user,
//               so one paginated sweep serves every configured market.
//               https://help.awin.com/apidocs/introduction-to-awins-apis
//   Regions:    ISO 3166 alpha-2, except BU = Brazil (USD) and XP = Mexico (MXN).
//               https://help.awin.com/apidocs/region-codes

import { requestJson } from '../http.ts';
import { cleanText, toHttps } from '../normalize.ts';
import { parseMarketList } from '../providers/ebay.ts';
import { UPCOMING_OFFER_MS } from '../types.ts';
import type { EnvGetter, FetchLike, Market, NormalizedOffer, OfferProvider, OfferSourceDefinition } from '../types.ts';

export const AWIN_API_BASE = 'https://api.awin.com';
/** Largest page the offers endpoint serves. */
export const AWIN_PAGE_SIZE = 200;
/** Pages read per sweep at most (3,000 offers; 16 calls with the programme list, under 20/minute). */
export const AWIN_MAX_PAGES = 15;
/** How long one sweep serves fetchOffers calls for other markets. */
export const AWIN_SWEEP_TTL_MS = 5 * 60_000;
export const AWIN_DEFAULT_MARKETS: Market[] = ['GB', 'US', 'DE', 'FR', 'IT', 'ES', 'NL', 'AU'];

/** Awin region codes that aren't the ISO code of their country. */
const ISO_BY_AWIN_REGION: Record<string, Market> = { BU: 'BR', XP: 'MX' };

export interface AwinOffer {
  promotionId?: number | string;
  /** "promotion" or "voucher". */
  type?: string | null;
  advertiser?: { id?: number | string; name?: string | null; joined?: boolean } | null;
  title?: string | null;
  description?: string | null;
  terms?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  dateAdded?: string | null;
  url?: string | null;
  urlTracking?: string | null;
  campaign?: string | null;
  regions?: { all?: boolean; list?: { name?: string | null; countryCode?: string | null }[] | null } | null;
  /** Only on vouchers. */
  voucher?: { code?: string | null; exclusive?: boolean; attributable?: boolean } | null;
}

export interface AwinOffersPage {
  data?: AwinOffer[];
  pagination?: { page?: number; pageSize?: number; total?: number };
}

export interface AwinProgramme {
  id?: number | string;
  name?: string | null;
  displayUrl?: string | null;
  clickThroughUrl?: string | null;
  logoUrl?: string | null;
  primarySector?: string | null;
  validDomains?: { domain?: string | null }[] | null;
}

export interface AwinConfig {
  token: string;
  publisherId: string;
  /** Shopper countries to serve, e.g. ["GB", "US"]. */
  markets: Market[];
}

/** Awin region codes to ask for when serving `market` (Brazil and Mexico have two each). */
export function awinRegionCodesFor(market: Market): string[] {
  const iso = market.toUpperCase();
  return [iso, ...Object.keys(ISO_BY_AWIN_REGION).filter((code) => ISO_BY_AWIN_REGION[code] === iso)];
}

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/**
 * Awin offer time ("2026-11-20T00:00:00.000", or "2022-04-21" in older responses) → ISO UTC. The
 * time is UTC unless the value carries its own "Z"/"±hh:mm" (never read as the server's local time).
 * Absent → null; unreadable → undefined (the offer's validity can't be checked).
 */
export function awinTimeToIso(value: unknown): string | null | undefined {
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
  let offset = 0;
  const zone = m[8]?.toUpperCase();
  if (zone && zone !== 'Z') {
    const digits = zone.slice(1).replace(':', '');
    offset = (zone.startsWith('-') ? -1 : 1) * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || '0'));
  }
  return new Date(wall - offset * 60_000).toISOString();
}

/** Placeholders feeds put in the code field of offers that need no code. */
const NO_CODE =
  /^(?:-+|—|n\/?a|none|null|not (?:required|needed|necessary)|(?:no|without) (?:(?:promo|coupon|voucher|discount) )?(?:code|promocode|promo code|coupon)s?(?: (?:is )?(?:needed|required|necessary))?|(?:promo |coupon |voucher )?code (?:is )?not (?:required|needed|necessary))$/;

/** Voucher code to type at checkout; null when the feed says none is needed, undefined when it's hidden/absent. */
export function awinVoucherCode(value: unknown): string | null | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const code = value.replace(/\s+/g, ' ').trim();
  const words = code.toLowerCase().replace(/[.!]+$/, '').trim();
  return words === '' || NO_CODE.test(words) ? null : code;
}

/** Store website → bare lowercase domain ("www.Example.co.uk/x" → "example.co.uk"). */
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

/** Offer regions → ISO countries; `all` when the offer applies in every region. */
export function awinMarkets(regions: AwinOffer['regions']): { all: boolean; markets: Market[] } {
  if (regions?.all === true) return { all: true, markets: [] };
  const codes = (Array.isArray(regions?.list) ? regions.list : [])
    .map((region) => (typeof region?.countryCode === 'string' ? region.countryCode.trim().toUpperCase() : ''))
    .map((code) => ISO_BY_AWIN_REGION[code] ?? code)
    .filter((code) => /^[A-Z]{2}$/.test(code));
  return { all: false, markets: [...new Set(codes)] };
}

/**
 * Converts one offer into an offer for shoppers in `market`, or null when it isn't usable there at
 * `now`: not started, expired, not valid in that region, from an advertiser the publisher hasn't
 * joined, a voucher whose code is hidden, or missing the fields an offer needs. `programme` (from
 * the joined-programmes list) supplies the store's domain, logo and sector.
 */
export function parseAwinOffer(offer: AwinOffer, market: Market, now: Date, programme?: AwinProgramme | null): NormalizedOffer | null {
  if (!offer || typeof offer !== 'object') return null;
  const type = String(offer.type ?? '').trim().toLowerCase();
  if (type !== 'voucher' && type !== 'promotion') return null;
  // Codes and tracking links only work for advertisers the publisher has joined.
  if (offer.advertiser?.joined === false) return null;

  const id = typeof offer.promotionId === 'number' || typeof offer.promotionId === 'string' ? String(offer.promotionId).trim() : '';
  const merchant = cleanText(offer.advertiser?.name, 80);
  const title = cleanText(offer.title, 160);
  const url = toHttps(offer.urlTracking) ?? toHttps(offer.url);
  if (!id || !merchant || !title || !url) return null;

  const regions = awinMarkets(offer.regions);
  if (!regions.all && !regions.markets.includes(market.toUpperCase())) return null;

  const startsAt = awinTimeToIso(offer.startDate);
  const endsAt = awinTimeToIso(offer.endDate);
  if (startsAt === undefined || endsAt === undefined) return null;
  // Announced offers are kept (shown as upcoming sales) when they start within 90 days.
  if (startsAt !== null && Date.parse(startsAt) > now.getTime() + UPCOMING_OFFER_MS) return null;
  if (endsAt !== null && Date.parse(endsAt) <= now.getTime()) return null;

  let code: string | null = null;
  if (type === 'voucher') {
    const voucherCode = awinVoucherCode(offer.voucher?.code);
    if (voucherCode === undefined) return null; // hidden until the publisher joins: unusable
    code = voucherCode;
  }

  const merchantDomain =
    domainOf(programme?.displayUrl) ??
    domainOf((Array.isArray(programme?.validDomains) ? programme.validDomains : [])[0]?.domain) ??
    domainOf(offer.url);
  const sector = cleanText(programme?.primarySector, 60);

  return {
    network: 'awin',
    networkOfferId: id,
    merchant,
    merchantDomain,
    markets: regions.markets,
    title,
    description: cleanText(offer.description, 600) ?? cleanText(offer.terms, 600),
    code,
    url,
    discountText: null,
    minSpend: null,
    currency: null,
    startsAt,
    endsAt,
    categories: sector ? [sector] : [],
    imageUrl: toHttps(programme?.logoUrl),
  };
}

interface Sweep {
  offers: AwinOffer[];
  programmes: Map<string, AwinProgramme>;
}

export function createAwinProvider(config: AwinConfig, fetch: FetchLike, now: () => Date = () => new Date()): OfferProvider {
  const auth = { Authorization: `Bearer ${config.token}`, Accept: 'application/json' };
  const publisher = encodeURIComponent(config.publisherId);
  const sweeps = new Map<string, { startedAt: number; result: Promise<Sweep> }>();

  async function offersWithStatus(regionCodes: string[], status: 'active' | 'upcoming'): Promise<AwinOffer[]> {
    const offers: AwinOffer[] = [];
    for (let page = 1; page <= AWIN_MAX_PAGES; page++) {
      const body = await requestJson<AwinOffersPage>(
        `${AWIN_API_BASE}/publisher/${publisher}/promotions`,
        {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filters: { membership: 'joined', regionCodes, status, type: 'all' },
            pagination: { page, pageSize: AWIN_PAGE_SIZE },
          }),
        },
        { fetch, label: 'Awin offers' },
      );
      const data = Array.isArray(body?.data) ? body.data : [];
      offers.push(...data);
      const total = body?.pagination?.total;
      if (data.length === 0 || (typeof total === 'number' ? offers.length >= total : data.length < AWIN_PAGE_SIZE)) break;
    }
    return offers;
  }

  async function joinedProgrammes(): Promise<Map<string, AwinProgramme>> {
    const byId = new Map<string, AwinProgramme>();
    try {
      const body = await requestJson<AwinProgramme[]>(
        `${AWIN_API_BASE}/publishers/${publisher}/programmes?relationship=joined`,
        { headers: auth },
        { fetch, label: 'Awin programmes' },
      );
      for (const programme of Array.isArray(body) ? body : []) {
        if (typeof programme?.id === 'number' || typeof programme?.id === 'string') byId.set(String(programme.id), programme);
      }
    } catch {
      // Only adds the store's domain, logo and sector; the offers are complete without it.
    }
    return byId;
  }

  /** Paginated reads of the active and upcoming offers for `markets`, shared by concurrent and nearby calls. */
  function sweep(markets: Market[]): Promise<Sweep> {
    const key = markets.join(',');
    const startedAt = now().getTime();
    const cached = sweeps.get(key);
    if (cached && startedAt - cached.startedAt < AWIN_SWEEP_TTL_MS) return cached.result;
    const result = (async () => {
      const regionCodes = [...new Set(markets.flatMap(awinRegionCodesFor))];
      const offers = [...(await offersWithStatus(regionCodes, 'active')), ...(await offersWithStatus(regionCodes, 'upcoming'))];
      return { offers, programmes: offers.length ? await joinedProgrammes() : new Map<string, AwinProgramme>() };
    })();
    sweeps.set(key, { startedAt, result });
    // A failed sweep isn't reused: the next call tries again.
    result.catch(() => {
      if (sweeps.get(key)?.result === result) sweeps.delete(key);
    });
    return result;
  }

  return {
    network: 'awin',
    markets: config.markets,

    async fetchOffers(market) {
      const target = market.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(target)) return [];
      const { offers, programmes } = await sweep(config.markets.includes(target) ? config.markets : [target]);
      const at = now();
      const found = new Map<string, NormalizedOffer>();
      for (const raw of offers) {
        const advertiserId = raw?.advertiser?.id;
        const programme = advertiserId === undefined || advertiserId === null ? undefined : programmes.get(String(advertiserId));
        const offer = parseAwinOffer(raw, target, at, programme);
        if (offer && !found.has(offer.networkOfferId)) found.set(offer.networkOfferId, offer);
      }
      return [...found.values()];
    },
  };
}

export const awinDefinition: OfferSourceDefinition = {
  network: 'awin',
  env: ['AWIN_API_TOKEN', 'AWIN_PUBLISHER_ID', 'AWIN_MARKETS'],
  create(env: EnvGetter, fetch: FetchLike) {
    const token = env('AWIN_API_TOKEN')?.trim();
    const publisherId = env('AWIN_PUBLISHER_ID')?.trim();
    if (!token || !publisherId) return { missing: 'Awin is not connected: set AWIN_API_TOKEN and AWIN_PUBLISHER_ID.' };
    if (!/^\d+$/.test(publisherId)) return { missing: 'AWIN_PUBLISHER_ID must be the numeric id of your Awin publisher account.' };
    return createAwinProvider({ token, publisherId, markets: parseMarketList(env('AWIN_MARKETS'), AWIN_DEFAULT_MARKETS) }, fetch);
  },
};
