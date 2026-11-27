import { HttpError } from '../../../../supabase/functions/_shared/http.ts';
import {
  AWIN_DEFAULT_MARKETS,
  AWIN_MAX_PAGES,
  AWIN_SWEEP_TTL_MS,
  awinDefinition,
  awinMarkets,
  awinRegionCodesFor,
  awinTimeToIso,
  awinVoucherCode,
  createAwinProvider,
  parseAwinOffer,
  type AwinOffer,
  type AwinProgramme,
} from '../../../../supabase/functions/_shared/offers/awin.ts';
import { isConfigured, type OfferProvider } from '../../../../supabase/functions/_shared/types.ts';
import { recordingFetch } from '../../helpers/http.ts';

// Shaped exactly like the example response on Awin's page for POST /publisher/{publisherId}/promotions
// (https://web.archive.org/web/20221129142811/https://wiki.awin.com/index.php/API_Post_Offers), with dates
// in the format the current page documents – "YYYY-MM-DDT00:00:00.000", "Time is in UTC"
// (https://help.awin.com/apidocs/promotions).
function offer(overrides: Partial<AwinOffer> = {}): AwinOffer {
  return {
    promotionId: 123456,
    type: 'voucher',
    advertiser: { id: 1001, name: 'Example Advertiser', joined: true },
    title: '10% Off',
    description: 'An Extra 10% off Everything!',
    terms: 'Limited time only, see website for details',
    startDate: '2026-11-20T00:00:00.000',
    endDate: '2026-11-30T23:59:59.000',
    url: 'https://www.example.com/',
    urlTracking: 'https://www.awin1.com/cread.php?awinmid=1001&awinaffid=45628&ued=https%3A%2F%2Fwww.example.com%2F',
    dateAdded: '2026-11-19T00:00:00.000',
    campaign: '',
    regions: { all: false, list: [{ name: 'United Kingdom', countryCode: 'GB' }] },
    voucher: { code: 'EXTRA10', exclusive: false, attributable: false },
    ...overrides,
  };
}

const page = (data: AwinOffer[], total: number, pageNumber = 1) => ({ data, pagination: { page: pageNumber, pageSize: 200, total } });

// Fields of the 200 response of GET /publishers/{publisherId}/programmes
// (https://help.awin.com/apidocs/get-program-information).
const programme: AwinProgramme & Record<string, unknown> = {
  clickThroughUrl: 'https://www.awin1.com/awclick.php?mid=1001&id=45628',
  currencyCode: 'GBP',
  description: 'Fashion for everyone',
  displayUrl: 'https://www.Example.com',
  id: 1001,
  linkStatus: 'online',
  logoUrl: 'http://ui.awin.com/images/upload/merchant/profile/1001.png',
  name: 'Example Advertiser',
  primaryRegion: { countryCode: 'GB', name: 'United Kingdom' },
  primarySector: 'Clothing & Accessories',
  status: 'Active',
  validDomains: [{ domain: 'example.com' }],
};

const CONFIG = { token: 'awin-test-token', publisherId: '45628', markets: ['GB', 'US', 'BR'] };
const NOW = new Date('2026-11-26T12:00:00Z');
const OFFERS_URL = 'https://api.awin.com/publisher/45628/promotions';
const PROGRAMMES_URL = 'https://api.awin.com/publishers/45628/programmes?relationship=joined';

const offerCalls = <T extends { url: string }>(calls: T[]) => calls.filter((c) => c.url === OFFERS_URL);
const requestBody = (call: { init?: RequestInit }) => JSON.parse(String(call.init?.body));

describe('Awin offer parsing', () => {
  it('maps a voucher, taking the store domain, logo and sector from its programme', () => {
    expect(parseAwinOffer(offer(), 'GB', NOW, programme)).toEqual({
      network: 'awin',
      networkOfferId: '123456',
      merchant: 'Example Advertiser',
      merchantDomain: 'example.com',
      markets: ['GB'],
      title: '10% Off',
      description: 'An Extra 10% off Everything!',
      code: 'EXTRA10',
      url: 'https://www.awin1.com/cread.php?awinmid=1001&awinaffid=45628&ued=https%3A%2F%2Fwww.example.com%2F',
      discountText: null,
      minSpend: null,
      currency: null,
      startsAt: '2026-11-20T00:00:00.000Z',
      endsAt: '2026-11-30T23:59:59.000Z',
      categories: ['Clothing & Accessories'],
      imageUrl: 'https://ui.awin.com/images/upload/merchant/profile/1001.png',
    });
  });

  it('maps a promotion without a programme: no code, domain from the landing page', () => {
    const promotion = offer({ promotionId: 98765, type: 'promotion', title: 'Free delivery', voucher: undefined, url: 'http://www.Shop.example.de/sale?x=1' });
    expect(parseAwinOffer(promotion, 'GB', NOW)).toMatchObject({
      networkOfferId: '98765',
      code: null,
      merchantDomain: 'shop.example.de',
      categories: [],
      imageUrl: null,
    });
    // Without a tracking link the landing page is used, upgraded to https.
    expect(parseAwinOffer({ ...promotion, urlTracking: null }, 'GB', NOW)?.url).toBe('https://www.Shop.example.de/sale?x=1');
    expect(parseAwinOffer({ ...promotion, urlTracking: null, url: 'ftp://x' }, 'GB', NOW)).toBeNull();
  });

  it('reads offer times as UTC, never as the local time of the server', () => {
    expect(awinTimeToIso('2026-11-26T15:00:00.000')).toBe('2026-11-26T15:00:00.000Z');
    expect(awinTimeToIso('2022-04-21')).toBe('2022-04-21T00:00:00.000Z'); // older responses
    expect(awinTimeToIso('2026-11-26T15:00:00+01:00')).toBe('2026-11-26T14:00:00.000Z');
    expect(awinTimeToIso(null)).toBeNull();
    expect(awinTimeToIso('next week')).toBeUndefined();
    expect(awinTimeToIso('2026-13-01T00:00:00.000')).toBeUndefined();
    // Live until 15:00 UTC, not started until 13:00 UTC.
    expect(parseAwinOffer(offer({ endDate: '2026-11-26T15:00:00.000' }), 'GB', NOW)?.endsAt).toBe('2026-11-26T15:00:00.000Z');
    expect(parseAwinOffer(offer({ endDate: '2026-11-26T11:59:59.000' }), 'GB', NOW)).toBeNull();
    expect(parseAwinOffer(offer({ startDate: '2026-11-26T13:00:00.000' }), 'GB', NOW)?.startsAt).toBe('2026-11-26T13:00:00.000Z');
  });

  it('drops expired, far-off and unreadable offers; keeps upcoming ones and offers without an end date', () => {
    expect(parseAwinOffer(offer({ endDate: '2026-11-25T23:59:59.000' }), 'GB', NOW)).toBeNull();
    expect(parseAwinOffer(offer({ startDate: '2026-12-01T00:00:00.000' }), 'GB', NOW)?.startsAt).toBe('2026-12-01T00:00:00.000Z');
    expect(parseAwinOffer(offer({ startDate: '2027-04-01T00:00:00.000' }), 'GB', NOW)).toBeNull();
    expect(parseAwinOffer(offer({ endDate: 'soon' }), 'GB', NOW)).toBeNull();
    expect(parseAwinOffer(offer({ endDate: null }), 'GB', NOW)?.endsAt).toBeNull();
  });

  it('drops offers of advertisers not joined, hidden voucher codes and unknown offer types', () => {
    expect(parseAwinOffer(offer({ advertiser: { id: 1001, name: 'Example Advertiser', joined: false } }), 'GB', NOW)).toBeNull();
    expect(parseAwinOffer(offer({ voucher: { code: null, exclusive: false, attributable: false } }), 'GB', NOW)).toBeNull();
    expect(parseAwinOffer(offer({ voucher: undefined }), 'GB', NOW)).toBeNull();
    expect(parseAwinOffer(offer({ type: 'cashback' }), 'GB', NOW)).toBeNull();
  });

  it('treats "no code needed" voucher values as no code', () => {
    for (const code of ['', 'NOT REQUIRED', 'No code needed', 'No voucher code required.']) {
      expect(parseAwinOffer(offer({ voucher: { code, exclusive: false, attributable: false } }), 'GB', NOW)?.code).toBeNull();
    }
    expect(awinVoucherCode(' EXTRA 10 ')).toBe('EXTRA 10');
    expect(awinVoucherCode(undefined)).toBeUndefined();
  });

  it('keeps only offers valid in the requested region', () => {
    const germanOnly = offer({ regions: { all: false, list: [{ name: 'Germany', countryCode: 'DE' }] } });
    expect(parseAwinOffer(germanOnly, 'GB', NOW)).toBeNull();
    expect(parseAwinOffer(germanOnly, 'de', NOW)?.markets).toEqual(['DE']);
    expect(parseAwinOffer(offer({ regions: null }), 'GB', NOW)).toBeNull();
    // Valid in all regions: kept everywhere, with no country list.
    expect(parseAwinOffer(offer({ regions: { all: true } }), 'AU', NOW)?.markets).toEqual([]);
    // BU = Brazil (USD) and XP = Mexico (MXN) are Awin's own codes.
    expect(awinMarkets({ all: false, list: [{ name: 'Brazil USD', countryCode: 'BU' }, { countryCode: 'xp' }, { countryCode: 'BR' }] })).toEqual({
      all: false,
      markets: ['BR', 'MX'],
    });
    expect(awinRegionCodesFor('BR')).toEqual(['BR', 'BU']);
    expect(awinRegionCodesFor('MX')).toEqual(['MX', 'XP']);
    expect(awinRegionCodesFor('GB')).toEqual(['GB']);
  });
});

describe('Awin provider', () => {
  const statusOf = (init?: RequestInit) => JSON.parse(String(init?.body)).filters.status as 'active' | 'upcoming';
  const activeCalls = <T extends { url: string; init?: RequestInit }>(calls: T[]) => offerCalls(calls).filter((c) => statusOf(c.init) === 'active');

  it('posts the documented filter bodies (active, then upcoming) with the bearer token, then reads the joined programmes', async () => {
    const soon = offer({ promotionId: 777, startDate: '2026-12-05T00:00:00.000', endDate: '2026-12-12T00:00:00.000' });
    const { fetch, calls } = recordingFetch((url, init) =>
      url === OFFERS_URL ? [200, statusOf(init) === 'active' ? page([offer()], 1) : page([soon], 1)] : [200, [programme]],
    );
    const offers = await createAwinProvider(CONFIG, fetch, () => NOW).fetchOffers('GB');

    expect(offers.map((o) => [o.networkOfferId, o.startsAt])).toEqual([
      ['123456', offer().startDate ? parseAwinOffer(offer(), 'GB', NOW)?.startsAt : null],
      ['777', '2026-12-05T00:00:00.000Z'],
    ]);
    expect(offers.every((o) => o.merchantDomain === 'example.com')).toBe(true);
    expect(calls.map((c) => c.url)).toEqual([OFFERS_URL, OFFERS_URL, PROGRAMMES_URL]);
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].headers).toEqual({
      Authorization: 'Bearer awin-test-token',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    expect(requestBody(calls[0])).toEqual({
      filters: { membership: 'joined', regionCodes: ['GB', 'US', 'BR', 'BU'], status: 'active', type: 'all' },
      pagination: { page: 1, pageSize: 200 },
    });
    expect(requestBody(calls[1]).filters.status).toBe('upcoming');
    expect(calls[2].init?.method).toBeUndefined();
    expect(calls[2].headers).toEqual({ Authorization: 'Bearer awin-test-token', Accept: 'application/json' });
  });

  it('serves every configured market from one sweep, split by region', async () => {
    let now = NOW;
    const data = [
      offer({ promotionId: 1 }),
      offer({ promotionId: 2, regions: { all: false, list: [{ name: 'United States', countryCode: 'US' }] } }),
      offer({ promotionId: 3, type: 'promotion', voucher: undefined, regions: { all: true } }),
      offer({ promotionId: 4, endDate: '2026-11-26T12:02:00.000' }),
    ];
    const { fetch, calls } = recordingFetch((url, init) =>
      url === OFFERS_URL ? [200, statusOf(init) === 'active' ? page(data, data.length) : page([], 0)] : [200, [programme]],
    );
    const provider = createAwinProvider(CONFIG, fetch, () => now);

    const [gb, us] = await Promise.all([provider.fetchOffers('GB'), provider.fetchOffers('US')]);
    expect(gb.map((o) => o.networkOfferId)).toEqual(['1', '3', '4']);
    expect(us.map((o) => o.networkOfferId)).toEqual(['2', '3']);
    expect(calls).toHaveLength(3);

    // Within the cache window the sweep is reused, but validity is checked at the current time.
    now = new Date(NOW.getTime() + AWIN_SWEEP_TTL_MS / 2);
    expect((await provider.fetchOffers('GB')).map((o) => o.networkOfferId)).toEqual(['1', '3']);
    expect(calls).toHaveLength(3);

    now = new Date(NOW.getTime() + AWIN_SWEEP_TTL_MS);
    await provider.fetchOffers('GB');
    expect(activeCalls(calls)).toHaveLength(2);

    // A market outside the configured list gets its own sweep.
    await provider.fetchOffers('DE');
    expect(requestBody(activeCalls(calls)[2]).filters.regionCodes).toEqual(['DE']);
  });

  it('reads pages until the reported total', async () => {
    const all = Array.from({ length: 450 }, (_, i) => offer({ promotionId: 5000 + i }));
    const { fetch, calls } = recordingFetch((url, init) => {
      if (url !== OFFERS_URL) return [200, []];
      if (statusOf(init) === 'upcoming') return [200, page([], 0)];
      const { page: n } = JSON.parse(String(init?.body)).pagination;
      return [200, page(all.slice((n - 1) * 200, n * 200), all.length, n)];
    });
    const offers = await createAwinProvider(CONFIG, fetch, () => NOW).fetchOffers('GB');
    expect(offers).toHaveLength(450);
    expect(activeCalls(calls).map((c) => requestBody(c).pagination)).toEqual([
      { page: 1, pageSize: 200 },
      { page: 2, pageSize: 200 },
      { page: 3, pageSize: 200 },
    ]);
  });

  it('stops on an empty page, on a short page without a total, and at the page cap', async () => {
    const empty = recordingFetch(() => [200, page([], 0)]);
    expect(await createAwinProvider(CONFIG, empty.fetch, () => NOW).fetchOffers('GB')).toEqual([]);
    expect(empty.calls.map((c) => c.url)).toEqual([OFFERS_URL, OFFERS_URL]); // no programme lookup without offers

    const short = recordingFetch((url, init) => (url === OFFERS_URL ? [200, statusOf(init) === 'active' ? { data: [offer()] } : page([], 0)] : [200, []]));
    await createAwinProvider(CONFIG, short.fetch, () => NOW).fetchOffers('GB');
    expect(activeCalls(short.calls)).toHaveLength(1);

    const full = Array.from({ length: 200 }, (_, i) => offer({ promotionId: i }));
    const endless = recordingFetch((url, init) => (url === OFFERS_URL ? [200, statusOf(init) === 'active' ? page(full, 1_000_000) : page([], 0)] : [200, []]));
    await createAwinProvider(CONFIG, endless.fetch, () => NOW).fetchOffers('GB');
    expect(activeCalls(endless.calls)).toHaveLength(AWIN_MAX_PAGES);
  });

  it('rejects on HTTP errors and retries a failed sweep on the next call', async () => {
    let fail = true;
    const { fetch, calls } = recordingFetch((url, init) => {
      if (url !== OFFERS_URL) return [200, [programme]];
      if (fail) return [401, { error: 'Unauthorized' }];
      return [200, statusOf(init) === 'active' ? page([offer()], 1) : page([], 0)];
    });
    const provider = createAwinProvider(CONFIG, fetch, () => NOW);
    const failed = provider.fetchOffers('GB');
    await expect(failed).rejects.toBeInstanceOf(HttpError);
    await expect(failed).rejects.toMatchObject({ status: 401 });

    fail = false;
    expect(await provider.fetchOffers('GB')).toHaveLength(1);
    expect(activeCalls(calls)).toHaveLength(2);
  });

  it('still returns offers when the programme list fails', async () => {
    const { fetch } = recordingFetch((url, init) =>
      url === OFFERS_URL ? [200, statusOf(init) === 'active' ? page([offer()], 1) : page([], 0)] : [403, { error: 'Forbidden' }],
    );
    const [only] = await createAwinProvider(CONFIG, fetch, () => NOW).fetchOffers('GB');
    expect(only).toMatchObject({ merchantDomain: 'example.com', imageUrl: null, categories: [], code: 'EXTRA10' });
  });

  it('ignores markets that are not ISO country codes', async () => {
    const { fetch, calls } = recordingFetch(() => [200, page([], 0)]);
    expect(await createAwinProvider(CONFIG, fetch, () => NOW).fetchOffers('GBR')).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('awinDefinition', () => {
  const env = (values: Record<string, string>) => (key: string) => values[key];
  const { fetch } = recordingFetch(() => [500, '']);

  it('reports the missing settings', () => {
    const slot = awinDefinition.create(env({ AWIN_API_TOKEN: 'token' }), fetch);
    expect(isConfigured(slot)).toBe(false);
    expect(slot).toEqual({ missing: 'Awin is not connected: set AWIN_API_TOKEN and AWIN_PUBLISHER_ID.' });
    expect(awinDefinition.create(env({ AWIN_API_TOKEN: 'token', AWIN_PUBLISHER_ID: 'abc' }), fetch)).toEqual({
      missing: 'AWIN_PUBLISHER_ID must be the numeric id of your Awin publisher account.',
    });
  });

  it('builds a provider for the configured markets', () => {
    const base = { AWIN_API_TOKEN: 'token', AWIN_PUBLISHER_ID: ' 45628 ' };
    const slot = awinDefinition.create(env(base), fetch);
    expect(isConfigured(slot)).toBe(true);
    expect((slot as OfferProvider).network).toBe('awin');
    expect((slot as OfferProvider).markets).toEqual(AWIN_DEFAULT_MARKETS);
    expect(AWIN_DEFAULT_MARKETS).toEqual(['GB', 'US', 'DE', 'FR', 'IT', 'ES', 'NL', 'AU']);
    expect((awinDefinition.create(env({ ...base, AWIN_MARKETS: 'gb, de' }), fetch) as OfferProvider).markets).toEqual(['GB', 'DE']);
    expect(awinDefinition.env).toEqual(['AWIN_API_TOKEN', 'AWIN_PUBLISHER_ID', 'AWIN_MARKETS']);
  });
});
