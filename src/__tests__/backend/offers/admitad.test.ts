import { HttpError } from '../../../../supabase/functions/_shared/http.ts';
import {
  ADMITAD_DEFAULT_MARKETS,
  ADMITAD_MAX_PAGES,
  admitadCouponCode,
  admitadDefinition,
  admitadRegions,
  admitadTimeToIso,
  createAdmitadProvider,
  parseAdmitadCoupon,
  type AdmitadCoupon,
} from '../../../../supabase/functions/_shared/offers/admitad.ts';
import { isConfigured, type OfferProvider } from '../../../../supabase/functions/_shared/types.ts';
import { recordingFetch } from '../../helpers/http.ts';

// Shaped exactly like the example response of "List of coupons for the ad space"
// (GET https://api.admitad.com/coupons/website/{w_id}/) in
// https://developers.mitgo.com/hc/en-us/articles/34481340467730-Coupons – dates, regions and ids vary per test.
function coupon(overrides: Partial<AdmitadCoupon> & Record<string, unknown> = {}): AdmitadCoupon {
  return {
    status: 'active',
    rating: '2.50',
    date_start: '2026-11-10T00:00:00',
    campaign: { id: 8, name: 'Campaign_8', site_url: 'http://example.com/' },
    short_name: 'coupon',
    exclusive: false,
    name: 'Coupon1',
    date_end: '2026-12-25T23:59:59',
    promocode: 'PRABCABC',
    id: 3,
    regions: ['IN'],
    language: 'en',
    discount: '20%',
    types: [
      { id: 1, name: 'Type name 1' },
      { id: 2, name: 'Type name 2' },
    ],
    image: '//cdn.admitad.com/media/campaign/images/2018/06/13/1d37869cf370a26b091f726cc4b24025.jpg',
    frameset_link: 'http://ad.admitad.com/coupon/292e71c4f659505879f503dd58751b/',
    goto_link: 'http://ad.admitad.com/goto/4cd0ab308859505879f503dd58751b/',
    species: 'promocode',
    categories: [
      { id: 1, name: 'Category name 1' },
      { id: 2, name: 'Category name 2' },
    ],
    description: 'description',
    ...overrides,
  } as AdmitadCoupon;
}

const page = (results: AdmitadCoupon[], count: number, offset = 0) => ({ results, _meta: { count, limit: 500, offset } });

// Shaped like the token response example in
// https://developers.mitgo.com/hc/en-us/articles/34481345606546-Client-authorization
const tokenResponse = (accessToken = '4b8b33955a') => ({
  username: 'webmaster1',
  first_name: 'name',
  last_name: 'surname',
  language: 'ru',
  access_token: accessToken,
  token_type: 'bearer',
  expires_in: 604800,
  refresh_token: 'ea957cce42',
  scope: 'coupons_for_website',
  group: 'webmaster',
});

// The client_id / client_secret pair used in the documentation's Basic-auth example.
const CONFIG = {
  clientId: 'cb281d918a37e346b45e9aea1c6eb7',
  clientSecret: 'a0f8a8b24de8b8182a0ddd2e89f5b1',
  websiteId: '22',
  markets: ['IN', 'US'],
};
const NOW = new Date('2026-11-26T12:00:00Z');

const isTokenCall = (url: string) => url === 'https://api.admitad.com/token/';
const couponCalls = <T extends { url: string }>(calls: T[]) => calls.filter((c) => c.url.includes('/coupons/website/'));
const offsetOf = (url: string) => Number(new URL(url).searchParams.get('offset'));

describe('Admitad coupon parsing', () => {
  it('maps the documented coupon fields to an offer', () => {
    expect(parseAdmitadCoupon(coupon(), 'IN', NOW)).toEqual({
      network: 'admitad',
      networkOfferId: '3',
      merchant: 'Campaign_8',
      merchantDomain: 'example.com',
      markets: ['IN'],
      title: 'Coupon1',
      description: 'description',
      code: 'PRABCABC',
      url: 'https://ad.admitad.com/goto/4cd0ab308859505879f503dd58751b/',
      discountText: '20%',
      minSpend: null,
      currency: null,
      startsAt: '2026-11-09T21:00:00.000Z', // 00:00 in UTC+3
      endsAt: '2026-12-25T20:59:59.000Z', // 23:59:59 in UTC+3
      categories: ['Category name 1', 'Category name 2'],
      imageUrl: 'https://cdn.admitad.com/media/campaign/images/2018/06/13/1d37869cf370a26b091f726cc4b24025.jpg',
    });
  });

  it('reads coupon times as UTC+3', () => {
    expect(admitadTimeToIso('2018-11-10T00:00:00')).toBe('2018-11-09T21:00:00.000Z');
    expect(admitadTimeToIso('2026-03-01')).toBe('2026-02-28T21:00:00.000Z');
    expect(admitadTimeToIso('2026-11-26 14:30:00.5')).toBe('2026-11-26T11:30:00.500Z');
    // An explicit offset in the value wins.
    expect(admitadTimeToIso('2026-11-26T14:30:00Z')).toBe('2026-11-26T14:30:00.000Z');
    expect(admitadTimeToIso('2026-11-26T14:30:00+05:30')).toBe('2026-11-26T09:00:00.000Z');
    expect(admitadTimeToIso(null)).toBeNull();
    expect(admitadTimeToIso('')).toBeNull();
    expect(admitadTimeToIso('soon')).toBeUndefined();
    expect(admitadTimeToIso('2026-02-30T00:00:00')).toBeUndefined();
    expect(admitadTimeToIso(1764158400)).toBeUndefined();
  });

  it('applies the UTC+3 offset when deciding whether a coupon is live', () => {
    // 14:30 UTC+3 is 11:30 UTC: ended half an hour before NOW (12:00 UTC), though "14:30" read as UTC wouldn't have.
    expect(parseAdmitadCoupon(coupon({ date_end: '2026-11-26T14:30:00' }), 'IN', NOW)).toBeNull();
    // …and a coupon starting at 14:30 UTC+3 has already started.
    expect(parseAdmitadCoupon(coupon({ date_start: '2026-11-26T14:30:00' }), 'IN', NOW)?.startsAt).toBe('2026-11-26T11:30:00.000Z');
    // Not yet started: 15:30 UTC+3 = 12:30 UTC.
    expect(parseAdmitadCoupon(coupon({ date_start: '2026-11-26T15:30:00' }), 'IN', NOW)).toBeNull();
  });

  it('keeps coupons without an end date, with endsAt null', () => {
    expect(parseAdmitadCoupon(coupon({ date_end: null }), 'IN', NOW)?.endsAt).toBeNull();
  });

  it('drops coupons that are not active, expired, not started or have unreadable dates', () => {
    expect(parseAdmitadCoupon(coupon({ status: 'inactive' }), 'IN', NOW)).toBeNull();
    expect(parseAdmitadCoupon(coupon({ status: undefined }), 'IN', NOW)).toBeNull();
    expect(parseAdmitadCoupon(coupon({ date_start: '2018-11-10T00:00:00', date_end: '2018-07-25T23:59:59' }), 'IN', NOW)).toBeNull();
    expect(parseAdmitadCoupon(coupon({ date_start: '2026-12-01T00:00:00' }), 'IN', NOW)).toBeNull();
    expect(parseAdmitadCoupon(coupon({ date_end: 'until stocks last' }), 'IN', NOW)).toBeNull();
  });

  it('keeps only coupons valid in the requested region', () => {
    expect(parseAdmitadCoupon(coupon({ regions: ['KZ'] }), 'IN', NOW)).toBeNull();
    expect(parseAdmitadCoupon(coupon({ regions: [] }), 'IN', NOW)).toBeNull();
    expect(parseAdmitadCoupon(coupon({ regions: ['US', 'IN'] }), 'in', NOW)?.markets).toEqual(['US', 'IN']);
    // "00" = all regions: valid everywhere, so no country list.
    expect(parseAdmitadCoupon(coupon({ regions: ['00'] }), 'BR', NOW)?.markets).toEqual([]);
    // "01" = CIS is not a country and never matches one.
    expect(parseAdmitadCoupon(coupon({ regions: ['01'] }), 'KZ', NOW)).toBeNull();
    expect(admitadRegions(['ru', '01', { region: 'BY' }, 7])).toEqual({ all: false, markets: ['RU', 'BY'] });
  });

  it('treats "no code needed" values as no code, and drops promo codes it was not given', () => {
    for (const promocode of ['NOT REQUIRED', 'No code needed', '', '  ', 'Не нужен', 'n/a']) {
      expect(parseAdmitadCoupon(coupon({ species: 'action', promocode }), 'IN', NOW)?.code).toBeNull();
      expect(parseAdmitadCoupon(coupon({ species: 'promocode', promocode }), 'IN', NOW)?.code).toBeNull();
    }
    expect(parseAdmitadCoupon(coupon({ species: 'action', promocode: undefined }), 'IN', NOW)?.code).toBeNull();
    expect(parseAdmitadCoupon(coupon({ species: 'promocode', promocode: undefined }), 'IN', NOW)).toBeNull();
    expect(parseAdmitadCoupon(coupon({ species: 'promocode', promocode: null }), 'IN', NOW)).toBeNull();
    expect(admitadCouponCode('  SAVE 10 ')).toBe('SAVE 10');
    expect(admitadCouponCode('Not required.')).toBeNull();
    expect(admitadCouponCode('no promo code needed')).toBeNull();
    expect(admitadCouponCode('NOCODE10')).toBe('NOCODE10');
  });

  it('falls back to the store site when there is no tracking link, and needs an https url', () => {
    expect(parseAdmitadCoupon(coupon({ goto_link: null }), 'IN', NOW)?.url).toBe('https://example.com/');
    expect(parseAdmitadCoupon(coupon({ goto_link: 'ftp://x', campaign: { id: 8, name: 'Campaign_8' } }), 'IN', NOW)).toBeNull();
    expect(parseAdmitadCoupon(coupon({ campaign: { id: 8, name: 'Shop', site_url: 'https://WWW.Shop.Example.co.uk/sale?x=1' } }), 'IN', NOW)).toMatchObject({
      merchant: 'Shop',
      merchantDomain: 'shop.example.co.uk',
    });
  });
});

describe('Admitad provider', () => {
  it('requests a token with client credentials, then the ad space coupons for the region', async () => {
    const { fetch, calls } = recordingFetch((url) => (isTokenCall(url) ? [200, tokenResponse()] : [200, page([coupon()], 1)]));
    const provider = createAdmitadProvider(CONFIG, fetch, () => NOW);

    const offers = await provider.fetchOffers('IN');

    expect(offers.map((o) => o.networkOfferId)).toEqual(['3']);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe('https://api.admitad.com/token/');
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].headers).toEqual({
      // The base64 value printed in the documentation for this client_id:client_secret pair.
      Authorization: 'Basic Y2IyODFkOTE4YTM3ZTM0NmI0NWU5YWVhMWM2ZWI3OmEwZjhhOGIyNGRlOGI4MTgyYTBkZGQyZTg5ZjViMQ==',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Accept: 'application/json',
    });
    expect(calls[0].init?.body).toBe('grant_type=client_credentials&client_id=cb281d918a37e346b45e9aea1c6eb7&scope=coupons_for_website');
    expect(calls[1].url).toBe('https://api.admitad.com/coupons/website/22/?region=IN&limit=500&offset=0');
    expect(calls[1].init?.method).toBeUndefined();
    expect(calls[1].headers).toEqual({ Authorization: 'Bearer 4b8b33955a', Accept: 'application/json' });
  });

  it('filters each page by validity and region', async () => {
    const results = [
      coupon({ id: 1 }),
      coupon({ id: 2, status: 'inactive' }),
      coupon({ id: 3, date_end: '2026-11-01T23:59:59' }),
      coupon({ id: 4, regions: ['US'] }),
      coupon({ id: 5, regions: ['00'], species: 'action', promocode: 'NOT REQUIRED', date_end: null }),
      coupon({ id: 1 }), // repeated across pages
    ];
    const { fetch } = recordingFetch((url) => (isTokenCall(url) ? [200, tokenResponse()] : [200, page(results, results.length)]));
    const offers = await createAdmitadProvider(CONFIG, fetch, () => NOW).fetchOffers('IN');
    expect(offers.map((o) => [o.networkOfferId, o.code, o.markets, o.endsAt])).toEqual([
      ['1', 'PRABCABC', ['IN'], '2026-12-25T20:59:59.000Z'],
      ['5', null, [], null],
    ]);
  });

  it('caches the token until it is about to expire, and shares one token request', async () => {
    let now = NOW;
    let issued = 0;
    const { fetch, calls } = recordingFetch((url) => (isTokenCall(url) ? [200, tokenResponse(`token-${++issued}`)] : [200, page([coupon()], 1)]));
    const provider = createAdmitadProvider(CONFIG, fetch, () => now);

    await Promise.all([provider.fetchOffers('IN'), provider.fetchOffers('US')]);
    await provider.fetchOffers('IN');
    expect(calls.filter((c) => isTokenCall(c.url))).toHaveLength(1);
    expect(couponCalls(calls).map((c) => c.headers.Authorization)).toEqual(['Bearer token-1', 'Bearer token-1', 'Bearer token-1']);

    now = new Date(NOW.getTime() + (604800 - 30) * 1000); // within a minute of expiry
    await provider.fetchOffers('IN');
    expect(calls.filter((c) => isTokenCall(c.url))).toHaveLength(2);
    expect(couponCalls(calls).at(-1)?.headers.Authorization).toBe('Bearer token-2');
  });

  it('gets a new token once when a cached one is rejected', async () => {
    let issued = 0;
    let rejectNext = false;
    const { fetch, calls } = recordingFetch((url, init) => {
      if (isTokenCall(url)) return [200, tokenResponse(`token-${++issued}`)];
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (rejectNext && auth === 'Bearer token-1') return [401, { error: 'invalid_token', error_code: 1 }];
      return [200, page([coupon()], 1)];
    });
    const provider = createAdmitadProvider(CONFIG, fetch, () => NOW);
    await provider.fetchOffers('IN');
    rejectNext = true;
    expect(await provider.fetchOffers('IN')).toHaveLength(1);
    expect(calls.map((c) => (isTokenCall(c.url) ? 'token' : c.headers.Authorization))).toEqual([
      'token',
      'Bearer token-1',
      'Bearer token-1',
      'token',
      'Bearer token-2',
    ]);
  });

  it('reads pages until the reported count', async () => {
    const all = Array.from({ length: 501 }, (_, i) => coupon({ id: 1000 + i }));
    const { fetch, calls } = recordingFetch((url) => {
      if (isTokenCall(url)) return [200, tokenResponse()];
      const offset = offsetOf(url);
      return [200, page(all.slice(offset, offset + 500), all.length, offset)];
    });
    const offers = await createAdmitadProvider(CONFIG, fetch, () => NOW).fetchOffers('IN');
    expect(offers).toHaveLength(501);
    expect(couponCalls(calls).map((c) => offsetOf(c.url))).toEqual([0, 500]);
  });

  it('stops on a short page when there is no count, and on an empty page', async () => {
    const short = recordingFetch((url) => (isTokenCall(url) ? [200, tokenResponse()] : [200, { results: [coupon()] }]));
    await createAdmitadProvider(CONFIG, short.fetch, () => NOW).fetchOffers('IN');
    expect(couponCalls(short.calls)).toHaveLength(1);

    const empty = recordingFetch((url) => (isTokenCall(url) ? [200, tokenResponse()] : [200, page([], 0)]));
    expect(await createAdmitadProvider(CONFIG, empty.fetch, () => NOW).fetchOffers('IN')).toEqual([]);
    expect(couponCalls(empty.calls)).toHaveLength(1);
  });

  it('caps the number of pages', async () => {
    const full = Array.from({ length: 500 }, (_, i) => coupon({ id: i }));
    const { fetch, calls } = recordingFetch((url) => (isTokenCall(url) ? [200, tokenResponse()] : [200, page(full, 1_000_000, offsetOf(url))]));
    await createAdmitadProvider(CONFIG, fetch, () => NOW).fetchOffers('IN');
    expect(couponCalls(calls)).toHaveLength(ADMITAD_MAX_PAGES);
    expect(offsetOf(couponCalls(calls).at(-1)!.url)).toBe((ADMITAD_MAX_PAGES - 1) * 500);
  });

  it('rejects on HTTP errors and unusable token responses', async () => {
    const forbidden = recordingFetch((url) => (isTokenCall(url) ? [200, tokenResponse()] : [403, { error: 'insufficient_scope', error_code: 2 }]));
    const forbiddenCall = createAdmitadProvider(CONFIG, forbidden.fetch, () => NOW).fetchOffers('IN');
    await expect(forbiddenCall).rejects.toBeInstanceOf(HttpError);
    await expect(forbiddenCall).rejects.toMatchObject({ status: 403 });

    const badCredentials = recordingFetch(() => [401, { error: 'invalid_client' }]);
    await expect(createAdmitadProvider(CONFIG, badCredentials.fetch, () => NOW).fetchOffers('IN')).rejects.toMatchObject({ status: 401 });
    expect(badCredentials.calls).toHaveLength(1);

    // A freshly issued token that is rejected isn't retried with yet another token.
    const rejected = recordingFetch((url) => (isTokenCall(url) ? [200, tokenResponse()] : [401, { error: 'invalid_token' }]));
    await expect(createAdmitadProvider(CONFIG, rejected.fetch, () => NOW).fetchOffers('IN')).rejects.toMatchObject({ status: 401 });
    expect(rejected.calls.filter((c) => isTokenCall(c.url))).toHaveLength(1);

    const noToken = recordingFetch(() => [200, { error: 'invalid_scope' }]);
    await expect(createAdmitadProvider(CONFIG, noToken.fetch, () => NOW).fetchOffers('IN')).rejects.toThrow('no access_token');
  });

  it('ignores markets that are not ISO country codes', async () => {
    const { fetch, calls } = recordingFetch(() => [200, tokenResponse()]);
    expect(await createAdmitadProvider(CONFIG, fetch, () => NOW).fetchOffers('IND')).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('admitadDefinition', () => {
  const env = (values: Record<string, string>) => (key: string) => values[key];
  const { fetch } = recordingFetch(() => [500, '']);

  it('reports the missing settings', () => {
    const slot = admitadDefinition.create(env({ ADMITAD_CLIENT_ID: 'id', ADMITAD_CLIENT_SECRET: 'secret' }), fetch);
    expect(isConfigured(slot)).toBe(false);
    expect(slot).toEqual({ missing: 'Admitad is not connected: set ADMITAD_CLIENT_ID, ADMITAD_CLIENT_SECRET and ADMITAD_WEBSITE_ID.' });
    const badId = admitadDefinition.create(env({ ADMITAD_CLIENT_ID: 'id', ADMITAD_CLIENT_SECRET: 'secret', ADMITAD_WEBSITE_ID: 'my-site' }), fetch);
    expect(badId).toEqual({ missing: 'ADMITAD_WEBSITE_ID must be the numeric id of your Admitad ad space.' });
  });

  it('builds a provider for the configured markets', () => {
    const base = { ADMITAD_CLIENT_ID: 'id', ADMITAD_CLIENT_SECRET: 'secret', ADMITAD_WEBSITE_ID: ' 22 ' };
    const slot = admitadDefinition.create(env(base), fetch);
    expect(isConfigured(slot)).toBe(true);
    expect((slot as OfferProvider).network).toBe('admitad');
    expect((slot as OfferProvider).markets).toEqual(ADMITAD_DEFAULT_MARKETS);
    expect(ADMITAD_DEFAULT_MARKETS).toEqual(['IN', 'US', 'GB', 'DE', 'FR', 'ES', 'IT', 'BR', 'MX', 'PL']);
    const custom = admitadDefinition.create(env({ ...base, ADMITAD_MARKETS: 'in, us,gb' }), fetch) as OfferProvider;
    expect(custom.markets).toEqual(['IN', 'US', 'GB']);
    expect(admitadDefinition.env).toEqual(['ADMITAD_CLIENT_ID', 'ADMITAD_CLIENT_SECRET', 'ADMITAD_WEBSITE_ID', 'ADMITAD_MARKETS']);
  });
});
