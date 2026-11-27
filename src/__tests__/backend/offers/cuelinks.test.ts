import { HttpError } from '../../../../supabase/functions/_shared/http.ts';
import {
  bareDomain,
  createCuelinksProvider,
  cuelinksCode,
  cuelinksDefinition,
  cuelinksWindow,
  istDate,
  parseCuelinksOffer,
  type CuelinksCampaign,
  type CuelinksOffer,
  type CuelinksOptions,
} from '../../../../supabase/functions/_shared/offers/cuelinks.ts';
import { isConfigured } from '../../../../supabase/functions/_shared/types.ts';
import { recordingFetch } from '../../helpers/http.ts';

// Verbatim "200 OK" example of List Offers: https://developers.cuelinks.com/docs/reference/offers
const offersExample = {
  data: [
    {
      id: 1234,
      title: '10% Off + Free Shipping on Orders Above Rs.999',
      description: 'Get 10% off on all products...',
      terms: 'Minimum order Rs.999. Not valid on...',
      coupon_code: 'MIXF10',
      offer_type: 'coupon',
      campaign_id: 4821,
      campaign_name: 'HealthKart',
      categories: [{ id: 8, name: 'Health & Beauty' }],
      tracking_url: 'https://clnk.in/?cid=3424&source=api&url=https%3A%2F%2F...',
      status: 'live',
      start_date: '2026-01-01',
      end_date: '2026-03-31',
      original_price: 999.0,
      discount_price: 899.0,
      percent_off: 10.0,
      shipping_charge: null,
      created_at: '2026-01-15T08:00:00Z',
      updated_at: '2026-03-20T12:00:00Z',
    },
  ],
  meta: { page: 1, per_page: 30, total: 5100, total_pages: 170, next_page: 2, prev_page: null },
};

// Verbatim "200 OK" example of List Campaigns: https://developers.cuelinks.com/docs/reference/campaigns
const campaignsExample = {
  data: [
    {
      id: 4821,
      name: 'Flipkart',
      url: 'https://www.flipkart.com',
      domain: 'flipkart.com',
      image: 'https://cdn.cuelinks.com/...',
      payout_type: 'Per Sale',
      payout: '4.50',
      payout_currency: 'INR',
      campaign_type: 'CPS',
      access_status: 'open',
      categories: [{ id: 1, name: 'Shopping' }],
      countries: [{ id: 252, iso: 'IN', name: 'India' }],
      reporting_type: 'standard',
      deeplink_allowed: true,
      sub_ids_allowed: true,
      cashback_publishers_allowed: false,
      social_media_publishers_allowed: true,
      missing_transactions_accepted: false,
      cookie_duration: 30,
      is_featured: true,
      epc_7d: '3.21',
      epc_90d: '2.94',
      tracking_url: 'https://clnk.in/?cid=456&...',
      updated_at: '2026-03-20T10:00:00Z',
    },
  ],
  meta: { page: 1, per_page: 20, total: 10482, total_pages: 525, next_page: 2, prev_page: null },
};

const docOffer: CuelinksOffer = offersExample.data[0];
// The two documented examples use campaign 4821 for different stores (HealthKart in the offer,
// Flipkart in the campaign list), so the campaign here keeps the documented shape with the
// offer's store in it.
const healthKart: CuelinksCampaign = {
  ...campaignsExample.data[0],
  name: 'HealthKart',
  url: 'https://www.healthkart.com',
  domain: 'healthkart.com',
  categories: [{ id: 8, name: 'Health & Beauty' }],
};

const offer = (overrides: Partial<CuelinksOffer>): CuelinksOffer => ({ ...docOffer, ...overrides });
const campaign = (overrides: Partial<CuelinksCampaign>): CuelinksCampaign => ({ ...healthKart, ...overrides });
/** A list response shaped like the documented ones, for page `pageNo`. */
const page = <T>(data: T[], pageNo: number, nextPage: number | null) => ({
  data,
  meta: { page: pageNo, per_page: 500, total: 0, total_pages: 0, next_page: nextPage, prev_page: pageNo > 1 ? pageNo - 1 : null },
});

const DURING = new Date('2026-02-15T06:30:00.000Z'); // noon in India
const KEY = 'test-key';
const HEADERS = { Authorization: 'Token test-key', Accept: 'application/json' };
const OFFERS_URL = 'https://developers.cuelinks.com/pub_api/v3/offers?valid_on=2026-02-15&sort=id&order=desc&per_page=500&page=';
const CAMPAIGNS_URL = 'https://developers.cuelinks.com/pub_api/v3/campaigns?country_id=252&per_page=500&page=';

type Answer = [number, unknown];

/** Fake Cuelinks: `offers(page)` and `campaigns(page)` answer each page request. */
function cuelinks(offers: (page: number) => Answer, campaigns: (page: number) => Answer = () => [200, page([healthKart], 1, null)]) {
  return recordingFetch((url) => {
    const pageNo = Number(/[?&]page=(\d+)/.exec(url)?.[1]);
    if (url.includes('/pub_api/v3/offers?')) return offers(pageNo);
    if (url.includes('/pub_api/v3/campaigns?')) return campaigns(pageNo);
    return [404, { error: 'Not found' }];
  });
}

const provider = (fetch: ReturnType<typeof cuelinks>['fetch'], options: CuelinksOptions = {}) =>
  createCuelinksProvider(KEY, fetch, { now: () => DURING, ...options });

describe('Cuelinks offers: parsing', () => {
  it('parses the documented offer with its campaign', () => {
    expect(parseCuelinksOffer(docOffer, healthKart, DURING)).toEqual({
      network: 'cuelinks',
      networkOfferId: '1234',
      merchant: 'HealthKart',
      merchantDomain: 'healthkart.com',
      markets: ['IN'],
      title: '10% Off + Free Shipping on Orders Above Rs.999',
      description: 'Get 10% off on all products...\nTerms: Minimum order Rs.999. Not valid on...',
      code: 'MIXF10',
      url: 'https://clnk.in/?cid=3424&source=api&url=https%3A%2F%2F...',
      discountText: '10% off',
      minSpend: null,
      currency: null,
      // 00:00 UTC on 1 Jan to 23:59:59.999 IST on 31 Mar (see cuelinksWindow).
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-03-31T18:29:59.999Z',
      categories: ['Health & Beauty'],
      imageUrl: 'https://cdn.cuelinks.com/...',
    });
  });

  it('falls back to the campaign for the store name, link and categories', () => {
    const parsed = parseCuelinksOffer(
      offer({ campaign_name: null, tracking_url: null, categories: [], percent_off: null, terms: null }),
      campaign({ categories: [{ id: 1, name: 'Fashion' }] }),
      DURING,
    );
    expect(parsed).toMatchObject({
      merchant: 'HealthKart',
      url: 'https://www.healthkart.com',
      categories: ['Fashion'],
      discountText: null,
      description: 'Get 10% off on all products...',
    });
    expect(parseCuelinksOffer(offer({ tracking_url: 'http://clnk.in/?cid=1' }), healthKart, DURING)?.url).toBe('https://clnk.in/?cid=1');
    expect(parseCuelinksOffer(offer({ tracking_url: null }), campaign({ url: null }), DURING)).toBeNull();
    expect(parseCuelinksOffer(offer({ tracking_url: 'javascript:void(0)' }), campaign({ url: 'not a url' }), DURING)).toBeNull();
  });

  it('reduces store domains to the bare host', () => {
    expect(bareDomain('flipkart.com')).toBe('flipkart.com');
    expect(bareDomain('https://www.Myntra.com/men?src=x')).toBe('myntra.com');
    expect(bareDomain('WWW.AJIO.COM:443')).toBe('ajio.com');
    expect(bareDomain('//shop.example.in/')).toBe('shop.example.in');
    expect(parseCuelinksOffer(docOffer, campaign({ domain: null, url: 'https://www.healthkart.com/' }), DURING)?.merchantDomain).toBe(
      'healthkart.com',
    );
    for (const bad of ['', 'HealthKart', 'not a domain', null, 42]) expect(bareDomain(bad)).toBeNull();
  });
});

describe('Cuelinks offers: dates', () => {
  it('ends an offer at the end of its end_date in India', () => {
    expect(parseCuelinksOffer(docOffer, healthKart, new Date('2026-03-31T18:29:59.999Z'))?.endsAt).toBe('2026-03-31T18:29:59.999Z');
    expect(parseCuelinksOffer(docOffer, healthKart, new Date('2026-03-31T18:30:00.000Z'))).toBeNull(); // 00:00 IST, 1 Apr
    expect(parseCuelinksOffer(docOffer, healthKart, new Date('2026-11-26T00:00:00.000Z'))).toBeNull();
  });

  it('starts an offer once its start_date has begun in UTC as well as in India', () => {
    const later = offer({ start_date: '2026-02-16' });
    expect(parseCuelinksOffer(later, healthKart, new Date('2026-02-15T18:30:00.000Z'))).toBeNull(); // 00:00 IST, 16 Feb
    expect(parseCuelinksOffer(later, healthKart, new Date('2026-02-15T23:59:59.999Z'))).toBeNull();
    expect(parseCuelinksOffer(later, healthKart, new Date('2026-02-16T00:00:00.000Z'))?.startsAt).toBe('2026-02-16T00:00:00.000Z');
  });

  it('reads timestamps with a zone exactly and zone-less ones conservatively', () => {
    expect(cuelinksWindow('2026-01-01T10:00:00+05:30', '2026-03-31T12:00:00Z')).toEqual({
      start: Date.parse('2026-01-01T04:30:00Z'),
      end: Date.parse('2026-03-31T12:00:00Z'),
    });
    // Zone-less: the start read as UTC (later), the end read as IST (earlier).
    expect(cuelinksWindow('2026-01-01 10:00:00', '2026-03-31 10:00')).toEqual({
      start: Date.parse('2026-01-01T10:00:00Z'),
      end: Date.parse('2026-03-31T04:30:00Z'),
    });
    expect(cuelinksWindow('2026-03-31', '2026-03-31')).toEqual({
      start: Date.parse('2026-03-31T00:00:00Z'),
      end: Date.parse('2026-03-31T18:29:59.999Z'),
    });
  });

  it('keeps an offer with no end date, with endsAt null', () => {
    expect(parseCuelinksOffer(offer({ end_date: null }), healthKart, new Date('2026-11-26T00:00:00Z'))).toMatchObject({
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: null,
    });
    expect(cuelinksWindow(undefined, ' ')).toEqual({ start: null, end: null });
  });

  it('drops offers whose dates are unreadable or inverted', () => {
    for (const bad of ['2026-02-30', '31/03/2026', '2026-03-31T25:00:00Z', 'soon']) {
      expect(cuelinksWindow('2026-01-01', bad)).toBeNull();
      expect(parseCuelinksOffer(offer({ end_date: bad }), healthKart, DURING)).toBeNull();
    }
    expect(cuelinksWindow(20260101, null)).toBeNull();
    expect(cuelinksWindow('2026-03-31', '2026-01-01')).toBeNull();
  });

  it('asks for offers valid on the Indian calendar date', () => {
    expect(istDate(new Date('2026-02-15T18:29:59.999Z'))).toBe('2026-02-15');
    expect(istDate(new Date('2026-02-15T18:30:00.000Z'))).toBe('2026-02-16');
  });
});

describe('Cuelinks offers: validity', () => {
  it('treats "no code needed" values as no code', () => {
    for (const none of ['NOT REQUIRED', 'No code needed', 'No code needed.', 'No Coupon Code Required', 'no coupon', 'N/A', 'NA', '-', '', '   ', null, 'Auto Applied']) {
      expect(cuelinksCode(none)).toBeNull();
      expect(parseCuelinksOffer(offer({ coupon_code: none }), healthKart, DURING)?.code).toBeNull();
    }
    expect(cuelinksCode('  MIXF10 ')).toBe('MIXF10');
    expect(cuelinksCode('NOTREQUIRED10')).toBe('NOTREQUIRED10');
  });

  it('never shows a code on a deal', () => {
    expect(parseCuelinksOffer(offer({ offer_type: 'deal', coupon_code: 'NOT REQUIRED' }), healthKart, DURING)?.code).toBeNull();
    expect(parseCuelinksOffer(offer({ offer_type: 'deal', coupon_code: 'MIXF10' }), healthKart, DURING)?.code).toBeNull();
    expect(parseCuelinksOffer(offer({ offer_type: undefined }), healthKart, DURING)?.code).toBe('MIXF10');
  });

  it('keeps only live offers', () => {
    for (const status of ['paused', 'expired', 'inactive', '', null, undefined]) {
      expect(parseCuelinksOffer(offer({ status }), healthKart, DURING)).toBeNull();
    }
    expect(parseCuelinksOffer(offer({ status: 'LIVE' }), healthKart, DURING)).not.toBeNull();
  });

  it('keeps only offers of active Indian campaigns we may promote', () => {
    expect(parseCuelinksOffer(docOffer, undefined, DURING)).toBeNull();
    for (const access_status of ['blocked', 'rejected', 'pending', 'not_applied']) {
      expect(parseCuelinksOffer(docOffer, campaign({ access_status }), DURING)).toBeNull();
    }
    expect(parseCuelinksOffer(docOffer, campaign({ access_status: 'approved' }), DURING)).not.toBeNull();
    expect(parseCuelinksOffer(docOffer, campaign({ countries: [{ id: 233, iso: 'US', name: 'United States' }] }), DURING)).toBeNull();
    expect(parseCuelinksOffer(docOffer, campaign({ countries: [] }), DURING)).not.toBeNull();
  });

  it('drops offers without an id, title or store name', () => {
    expect(parseCuelinksOffer(offer({ id: null }), healthKart, DURING)).toBeNull();
    expect(parseCuelinksOffer(offer({ id: 0 }), healthKart, DURING)).toBeNull();
    expect(parseCuelinksOffer(offer({ title: '  ' }), healthKart, DURING)).toBeNull();
    expect(parseCuelinksOffer(offer({ campaign_name: null }), campaign({ name: null }), DURING)).toBeNull();
  });
});

describe('Cuelinks provider', () => {
  it('requests offers and Indian campaigns from the documented endpoints with the token header', async () => {
    const { fetch, calls } = cuelinks(() => [200, { ...offersExample, meta: { ...offersExample.meta, next_page: null } }]);
    const offers = await provider(fetch).fetchOffers('IN');

    expect(calls.map((call) => call.url)).toEqual([`${OFFERS_URL}1`, `${CAMPAIGNS_URL}1`]);
    for (const call of calls) {
      expect(call.init?.method ?? 'GET').toBe('GET');
      expect(call.headers).toEqual(HEADERS);
    }
    expect(offers).toEqual([parseCuelinksOffer(docOffer, healthKart, DURING)]);
  });

  it('asks for the offers valid on the current Indian date', async () => {
    const { fetch, calls } = cuelinks(() => [200, page([], 1, null)]);
    await provider(fetch, { now: () => new Date('2026-02-15T19:00:00Z') }).fetchOffers('IN');
    expect(calls[0].url).toContain('valid_on=2026-02-16&');
  });

  it('follows next_page until it is null', async () => {
    const { fetch, calls } = cuelinks((n) => [200, page([offer({ id: n })], n, n < 3 ? n + 1 : null)]);
    const offers = await provider(fetch).fetchOffers('IN');
    expect(calls.filter((call) => call.url.includes('/offers?')).map((call) => call.url)).toEqual([`${OFFERS_URL}1`, `${OFFERS_URL}2`, `${OFFERS_URL}3`]);
    expect(offers.map((o) => o.networkOfferId)).toEqual(['1', '2', '3']);
  });

  it('stops at the page cap', async () => {
    const { fetch, calls } = cuelinks((n) => [200, page([offer({ id: n })], n, n + 1)]);
    const offers = await provider(fetch, { maxOfferPages: 2 }).fetchOffers('IN');
    expect(calls.filter((call) => call.url.includes('/offers?'))).toHaveLength(2);
    expect(offers).toHaveLength(2);
  });

  it('stops at an empty page, and after a short page when there is no meta', async () => {
    const empty = cuelinks((n) => [200, page(n === 1 ? [docOffer] : [], n, n + 1)]);
    await provider(empty.fetch).fetchOffers('IN');
    expect(empty.calls.filter((call) => call.url.includes('/offers?'))).toHaveLength(2);

    const noMeta = cuelinks((n) => [200, { data: n === 1 ? [offer({ id: 1 }), offer({ id: 2 })] : [offer({ id: 3 })] }]);
    const offers = await provider(noMeta.fetch, { perPage: 2 }).fetchOffers('IN');
    expect(noMeta.calls.filter((call) => call.url.includes('/offers?')).map((call) => call.url)).toEqual([
      'https://developers.cuelinks.com/pub_api/v3/offers?valid_on=2026-02-15&sort=id&order=desc&per_page=2&page=1',
      'https://developers.cuelinks.com/pub_api/v3/offers?valid_on=2026-02-15&sort=id&order=desc&per_page=2&page=2',
    ]);
    expect(offers).toHaveLength(3);
  });

  it('pages through campaigns only until every needed one is found', async () => {
    const other = campaign({ id: 77, name: 'Myntra', domain: 'myntra.com' });
    const found = cuelinks(
      () => [200, page([docOffer], 1, null)],
      (n) => [200, page(n === 1 ? [other] : [healthKart], n, n + 1)],
    );
    expect(await provider(found.fetch).fetchOffers('IN')).toHaveLength(1);
    expect(found.calls.filter((call) => call.url.includes('/campaigns?')).map((call) => call.url)).toEqual([`${CAMPAIGNS_URL}1`, `${CAMPAIGNS_URL}2`]);

    // An offer whose store isn't among India's active campaigns is dropped.
    const absent = cuelinks(
      () => [200, page([docOffer], 1, null)],
      (n) => [200, page([other], n, n < 2 ? n + 1 : null)],
    );
    expect(await provider(absent.fetch).fetchOffers('IN')).toEqual([]);
    expect(absent.calls.filter((call) => call.url.includes('/campaigns?'))).toHaveLength(2);
  });

  it('drops expired, not-started and non-live offers, and repeats', async () => {
    const { fetch, calls } = cuelinks(() => [
      200,
      page(
        [
          docOffer,
          offer({ id: 2, end_date: '2026-02-14' }),
          offer({ id: 3, start_date: '2026-02-16' }),
          offer({ id: 4, status: 'paused' }),
          offer({ id: 5, coupon_code: 'NOT REQUIRED', offer_type: 'deal' }),
          docOffer,
        ],
        1,
        null,
      ),
    ]);
    const offers = await provider(fetch).fetchOffers('IN');
    expect(offers.map((o) => [o.networkOfferId, o.code])).toEqual([
      ['1234', 'MIXF10'],
      ['5', null],
    ]);
    expect(calls).toHaveLength(2);
  });

  it('skips the campaign lookup when no offer is current', async () => {
    const { fetch, calls } = cuelinks(() => [200, page([offer({ end_date: '2026-01-31' })], 1, null)]);
    expect(await provider(fetch).fetchOffers('IN')).toEqual([]);
    expect(calls.map((call) => call.url)).toEqual([`${OFFERS_URL}1`]);
  });

  it('serves India only', async () => {
    const { fetch, calls } = cuelinks(() => [200, offersExample]);
    expect(await provider(fetch).fetchOffers('US')).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('rejects on HTTP errors', async () => {
    const unauthorized = cuelinks(() => [401, { error: 'Invalid or expired API key' }]);
    const failed = provider(unauthorized.fetch).fetchOffers('IN');
    await expect(failed).rejects.toBeInstanceOf(HttpError);
    await expect(failed).rejects.toMatchObject({ status: 401 });
    expect(unauthorized.calls).toHaveLength(1);

    const noScope = cuelinks(
      () => [200, page([docOffer], 1, null)],
      () => [403, { error: "This API key lacks the 'read:campaigns' scope" }],
    );
    await expect(provider(noScope.fetch).fetchOffers('IN')).rejects.toMatchObject({ name: 'HttpError', status: 403 });

    const laterPage = cuelinks((n) => (n === 1 ? [200, page([docOffer], 1, 2)] : [500, { error: 'Something went wrong' }]));
    await expect(provider(laterPage.fetch).fetchOffers('IN')).rejects.toMatchObject({ status: 500 });
  });
});

describe('cuelinksDefinition', () => {
  it('needs an API key', () => {
    const { fetch } = cuelinks(() => [200, offersExample]);
    expect(cuelinksDefinition.network).toBe('cuelinks');
    expect(cuelinksDefinition.env).toEqual(['CUELINKS_API_KEY']);
    expect(cuelinksDefinition.create(() => '  ', fetch)).toEqual({ missing: expect.stringContaining('CUELINKS_API_KEY') });
  });

  it('creates a provider for India that sends the trimmed key', async () => {
    const { fetch, calls } = cuelinks(() => [200, page([], 1, null)]);
    const slot = cuelinksDefinition.create((key) => (key === 'CUELINKS_API_KEY' ? ' test-key\n' : undefined), fetch);
    if (!isConfigured(slot)) throw new Error(slot.missing);
    expect(slot).toMatchObject({ network: 'cuelinks', markets: ['IN'] });
    expect(await slot.fetchOffers('IN')).toEqual([]);
    expect(calls[0].headers).toEqual(HEADERS);
  });
});
