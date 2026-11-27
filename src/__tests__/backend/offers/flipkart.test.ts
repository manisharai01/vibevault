import { HttpError } from '../../../../supabase/functions/_shared/http.ts';
import {
  createFlipkartOffersProvider,
  FLIPKART_OFFER_URLS,
  flipkartOffersDefinition,
  flipkartTime,
  parseFlipkartOffer,
  pickFlipkartOfferImage,
  type FlipkartOffer,
} from '../../../../supabase/functions/_shared/offers/flipkart.ts';
import { isConfigured } from '../../../../supabase/functions/_shared/types.ts';
import { recordingFetch } from '../../helpers/http.ts';

// Verbatim "Sample JSON Response" of the All Offer API:
// https://affiliate.flipkart.com/api-docs/af_offer_ref.html#all-offer-api
const allOffersExample = {
  allOffersList: [
    {
      startTime: 1447785000000,
      endTime: 1448821800000,
      title: 'Up to 30% off',
      description: 'From Formula1',
      url: 'http://dl.flipkart.com/dl/automotive/accessories-spare-parts/car-bike-care/pr?p%5B%5D=facets.brand%255B%255D%3DFormula%2B1&p%5B%5D=facets.brand%255B%255D%3DFormula1&sid=0hx%2Cbwd%2Cbyn&filterNone=true&affid=keshav',
      category: 'automotive',
      imageUrls: [
        {
          url: 'http://img.fkcdn.com/image/scratch-remover-wax/a/h/v/formula-1-227-scratch-out-original-imae3728msy6fh4v.jpeg',
          resolutionType: 'default',
        },
        {
          url: 'https://rukminim1.flixcart.com/image/200/200/scratch-remover-wax/a/h/v/formula-1-227-scratch-out-original-imae3728msy6fh4v.jpeg?q=90',
          resolutionType: 'low',
        },
        {
          url: 'https://rukminim1.flixcart.com/image/400/400/scratch-remover-wax/a/h/v/formula-1-227-scratch-out-original-imae3728msy6fh4v.jpeg?q=90',
          resolutionType: 'mid',
        },
        {
          url: 'https://rukminim1.flixcart.com/image/800/800/scratch-remover-wax/a/h/v/formula-1-227-scratch-out-original-imae3728msy6fh4v.jpeg?q=90',
          resolutionType: 'high',
        },
      ],
      availability: 'LIVE',
    },
  ],
};

// Verbatim "Sample JSON Response" of the Deals of the Day (DOTD) Offer API:
// https://affiliate.flipkart.com/api-docs/af_offer_ref.html#deals-of-the-day-dotd-offer-api
const dotdExample = {
  dotdList: [
    {
      title: 'Just Rs. 249',
      description: 'Bluetooth selfie sticks',
      url: 'http://dl.flipkart.com/dl/camera-accessories/smile-n-click~brand/pr?p%5B%5D=facets.price_range%255B%255D%3DBelow%2BRs.%2B1000&sid=jek%2C6l2&filterNone=true&offer=ns%3A10e40dc418&affid=keshav',
      imageUrls: [
        {
          url: 'http://img.fkcdn.com/image/selfie-stick/z/u/7/h-s203-smile-n-click-original-imaeagh9yg8k2t8z.jpeg',
          resolutionType: 'default',
        },
        {
          url: 'https://rukminim1.flixcart.com/image/200/200/selfie-stick/z/u/7/h-s203-smile-n-click-original-imaeagh9yg8k2t8z.jpeg?q=90',
          resolutionType: 'low',
        },
        {
          url: 'https://rukminim1.flixcart.com/image/400/400/selfie-stick/z/u/7/h-s203-smile-n-click-original-imaeagh9yg8k2t8z.jpeg?q=90',
          resolutionType: 'mid',
        },
        {
          url: 'https://rukminim1.flixcart.com/image/800/800/selfie-stick/z/u/7/h-s203-smile-n-click-original-imaeagh9yg8k2t8z.jpeg?q=90',
          resolutionType: 'high',
        },
      ],
      availability: 'LIVE',
    },
  ],
};

const docOffer: FlipkartOffer = allOffersExample.allOffersList[0];
const docDeal: FlipkartOffer = dotdExample.dotdList[0];
const variant = (overrides: Partial<FlipkartOffer>): FlipkartOffer => ({ ...docOffer, ...overrides });

const START = 1447785000000; // 2015-11-18T00:00:00+05:30
const END = 1448821800000; // 2015-11-30T00:00:00+05:30
const DURING = new Date('2015-11-20T06:30:00.000Z');

const ALL_URL = 'https://affiliate-api.flipkart.net/affiliate/offers/v1/all/json';
const DOTD_URL = 'https://affiliate-api.flipkart.net/affiliate/offers/v1/dotd/json';

/** Fake Flipkart: each list answers with `[status, body]`, or 200 and the given body. */
function feeds(all: unknown, dotd: unknown) {
  const answer = (value: unknown): [number, unknown] => (Array.isArray(value) ? (value as [number, unknown]) : [200, value]);
  return recordingFetch((url) => {
    if (url === ALL_URL) return answer(all);
    if (url === DOTD_URL) return answer(dotd);
    return [404, 'unexpected URL'];
  });
}

describe('Flipkart offers: parsing', () => {
  it('parses the documented all-offers example, with its IST window in UTC', async () => {
    const offer = await parseFlipkartOffer(docOffer, 'all', DURING);
    expect(offer).toEqual({
      network: 'flipkart',
      networkOfferId: expect.stringMatching(/^all:[0-9a-f]{32}$/),
      merchant: 'Flipkart',
      merchantDomain: 'flipkart.com',
      markets: ['IN'],
      title: 'Up to 30% off',
      description: 'From Formula1',
      code: null,
      url: 'https://dl.flipkart.com/dl/automotive/accessories-spare-parts/car-bike-care/pr?p%5B%5D=facets.brand%255B%255D%3DFormula%2B1&p%5B%5D=facets.brand%255B%255D%3DFormula1&sid=0hx%2Cbwd%2Cbyn&filterNone=true&affid=keshav',
      discountText: null,
      minSpend: null,
      currency: null,
      startsAt: '2015-11-17T18:30:00.000Z',
      endsAt: '2015-11-29T18:30:00.000Z',
      categories: ['automotive'],
      imageUrl: 'https://img.fkcdn.com/image/scratch-remover-wax/a/h/v/formula-1-227-scratch-out-original-imae3728msy6fh4v.jpeg',
    });
    // The XML version of the same documented example states the window in Indian time.
    expect(offer?.startsAt).toBe(new Date('2015-11-18T00:00:00+05:30').toISOString());
    expect(offer?.endsAt).toBe(new Date('2015-11-30T00:00:00+05:30').toISOString());
  });

  it('parses the documented deal of the day, which has no window or category', async () => {
    expect(await parseFlipkartOffer(docDeal, 'dotd', DURING)).toEqual({
      network: 'flipkart',
      networkOfferId: expect.stringMatching(/^dotd:[0-9a-f]{32}$/),
      merchant: 'Flipkart',
      merchantDomain: 'flipkart.com',
      markets: ['IN'],
      title: 'Just Rs. 249',
      description: 'Bluetooth selfie sticks',
      code: null,
      url: 'https://dl.flipkart.com/dl/camera-accessories/smile-n-click~brand/pr?p%5B%5D=facets.price_range%255B%255D%3DBelow%2BRs.%2B1000&sid=jek%2C6l2&filterNone=true&offer=ns%3A10e40dc418&affid=keshav',
      discountText: null,
      minSpend: null,
      currency: null,
      startsAt: null,
      endsAt: null,
      categories: [],
      imageUrl: 'https://img.fkcdn.com/image/selfie-stick/z/u/7/h-s203-smile-n-click-original-imaeagh9yg8k2t8z.jpeg',
    });
  });

  it('reads offer times as Unix milliseconds, seconds, digit strings or zoned ISO strings', () => {
    expect(flipkartTime(START)).toBe(START);
    expect(flipkartTime(START / 1000)).toBe(START);
    expect(flipkartTime(String(START))).toBe(START);
    expect(flipkartTime('2015-11-18T00:00:00+05:30')).toBe(START);
    expect(flipkartTime(null)).toBeNull();
    expect(flipkartTime(undefined)).toBeNull();
    expect(flipkartTime('  ')).toBeNull();
    for (const bad of [0, -5, Number.NaN, 'soon', '2015-11-18 00:00:00', {}, true]) {
      expect(flipkartTime(bad)).toBeNaN();
    }
  });

  it('picks the largest https image', () => {
    const [byDefault, low, mid, high] = docOffer.imageUrls!;
    expect(pickFlipkartOfferImage([low, mid, high, byDefault])).toBe(
      'https://img.fkcdn.com/image/scratch-remover-wax/a/h/v/formula-1-227-scratch-out-original-imae3728msy6fh4v.jpeg',
    );
    expect(pickFlipkartOfferImage([low, mid, high])).toBe(high.url);
    expect(pickFlipkartOfferImage([low, mid])).toBe(mid.url);
    expect(pickFlipkartOfferImage([{ url: 'ftp://img.fkcdn.com/x.jpeg', resolutionType: 'default' }, low])).toBe(low.url);
    expect(pickFlipkartOfferImage([{ url: 'https://img.fkcdn.com/a.jpeg', resolutionType: 'huge' }, null])).toBe(
      'https://img.fkcdn.com/a.jpeg',
    );
    expect(pickFlipkartOfferImage([])).toBeNull();
    expect(pickFlipkartOfferImage(undefined)).toBeNull();
  });
});

describe('Flipkart offers: validity', () => {
  it('keeps only offers the feed marks LIVE', async () => {
    expect(await parseFlipkartOffer(variant({ availability: ' live ' }), 'all', DURING)).not.toBeNull();
    for (const availability of ['OOS', 'EXPIRED', '', null, undefined]) {
      expect(await parseFlipkartOffer(variant({ availability }), 'all', DURING)).toBeNull();
    }
    expect(await parseFlipkartOffer({ ...docDeal, availability: 'OOS' }, 'dotd', DURING)).toBeNull();
  });

  it('drops offers before their start time and from their end time on', async () => {
    const at = (ms: number) => parseFlipkartOffer(docOffer, 'all', new Date(ms));
    expect(await at(START - 1)).toBeNull();
    expect(await at(START)).not.toBeNull();
    expect(await at(END - 1)).not.toBeNull();
    expect(await at(END)).toBeNull();
    expect(await at(Date.parse('2026-11-26T00:00:00Z'))).toBeNull();
  });

  it('keeps an offer with no end time, with endsAt null', async () => {
    const offer = await parseFlipkartOffer(variant({ endTime: undefined }), 'all', new Date('2026-11-26T00:00:00Z'));
    expect(offer).toMatchObject({ startsAt: '2015-11-17T18:30:00.000Z', endsAt: null });
    expect(await parseFlipkartOffer(variant({ endTime: null, startTime: '' }), 'all', DURING)).toMatchObject({
      startsAt: null,
      endsAt: null,
    });
  });

  it('drops offers whose window is unreadable or inverted', async () => {
    expect(await parseFlipkartOffer(variant({ endTime: 'soon' }), 'all', DURING)).toBeNull();
    expect(await parseFlipkartOffer(variant({ startTime: 0 }), 'all', DURING)).toBeNull();
    expect(await parseFlipkartOffer(variant({ startTime: END, endTime: START }), 'all', DURING)).toBeNull();
  });

  it('drops offers without a title or an https link', async () => {
    expect(await parseFlipkartOffer(variant({ title: ' <b> </b> ' }), 'all', DURING)).toBeNull();
    expect(await parseFlipkartOffer(variant({ url: 'javascript:alert(1)' }), 'all', DURING)).toBeNull();
    expect(await parseFlipkartOffer(variant({ url: '/dl/relative/link' }), 'all', DURING)).toBeNull();
    expect(await parseFlipkartOffer(variant({ url: undefined }), 'all', DURING)).toBeNull();
    expect(await parseFlipkartOffer(null as unknown as FlipkartOffer, 'all', DURING)).toBeNull();
  });
});

describe('Flipkart offers: ids', () => {
  it('gives an offer the same id on every fetch', async () => {
    const first = await parseFlipkartOffer(docOffer, 'all', DURING);
    const later = await parseFlipkartOffer(
      // Same offer fetched later: images reordered, times sent in seconds.
      variant({ imageUrls: [...docOffer.imageUrls!].reverse(), startTime: START / 1000, endTime: END / 1000 }),
      'all',
      new Date(END - 1),
    );
    expect(later?.networkOfferId).toBe(first?.networkOfferId);
    // Extending the end date keeps the id.
    expect((await parseFlipkartOffer(variant({ endTime: END + 86_400_000 }), 'all', DURING))?.networkOfferId).toBe(first?.networkOfferId);
  });

  it('gives different offers different ids', async () => {
    const id = async (offer: FlipkartOffer, list: 'all' | 'dotd' = 'all') => (await parseFlipkartOffer(offer, list, DURING))?.networkOfferId;
    const base = await id(docOffer);
    expect(await id(variant({ url: `${docOffer.url}&x=1` }))).not.toBe(base);
    expect(await id(variant({ title: 'Up to 40% off' }))).not.toBe(base);
    expect(await id(variant({ startTime: START + 1000 }))).not.toBe(base);
    expect(await id(docOffer, 'dotd')).toMatch(/^dotd:/);
  });
});

describe('Flipkart offers provider', () => {
  const credentials = { affiliateId: 'myaffid', token: 'tok-123' };

  it('calls both documented endpoints with the affiliate headers', async () => {
    const { fetch, calls } = feeds(allOffersExample, dotdExample);
    const provider = createFlipkartOffersProvider(credentials, fetch, { now: () => DURING });
    expect(provider).toMatchObject({ network: 'flipkart', markets: ['IN'] });

    const offers = await provider.fetchOffers('IN');

    expect(FLIPKART_OFFER_URLS).toEqual({ all: ALL_URL, dotd: DOTD_URL });
    expect(calls.map((call) => call.url).sort()).toEqual([ALL_URL, DOTD_URL]);
    for (const call of calls) {
      expect(call.init?.method ?? 'GET').toBe('GET');
      expect(call.headers).toEqual({ 'Fk-Affiliate-Id': 'myaffid', 'Fk-Affiliate-Token': 'tok-123', Accept: 'application/json' });
    }
    expect(offers.map((offer) => offer.title)).toEqual(['Up to 30% off', 'Just Rs. 249']);
  });

  it('returns only live, current offers from both lists, once each', async () => {
    const { fetch } = feeds(
      {
        allOffersList: [
          docOffer,
          variant({ availability: 'OOS', url: `${docOffer.url}&oos=1` }),
          variant({ endTime: DURING.getTime(), url: `${docOffer.url}&ended=1` }),
          variant({ startTime: DURING.getTime() + 1, url: `${docOffer.url}&later=1` }),
          docOffer, // listed twice
          'not an offer',
        ],
      },
      {
        dotdList: [
          docDeal,
          { ...docDeal, availability: 'OOS', url: `${docDeal.url}&oos=1` },
          // The same deal as the all-offers entry, without its window.
          { ...docDeal, title: docOffer.title, url: docOffer.url },
        ],
      },
    );
    const offers = await createFlipkartOffersProvider(credentials, fetch, { now: () => DURING }).fetchOffers('IN');

    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ title: 'Up to 30% off', endsAt: '2015-11-29T18:30:00.000Z' });
    expect(offers[1]).toMatchObject({ title: 'Just Rs. 249', endsAt: null });
    expect(new Set(offers.map((offer) => offer.networkOfferId)).size).toBe(2);
  });

  it('treats a response without the list as no offers', async () => {
    const { fetch } = feeds({}, '');
    expect(await createFlipkartOffersProvider(credentials, fetch, { now: () => DURING }).fetchOffers('IN')).toEqual([]);
  });

  it('serves India only', async () => {
    const { fetch, calls } = feeds(allOffersExample, dotdExample);
    expect(await createFlipkartOffersProvider(credentials, fetch).fetchOffers('US')).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('rejects when either endpoint fails', async () => {
    const unauthorized = feeds([401, 'Invalid Headers'], dotdExample);
    const failed = createFlipkartOffersProvider(credentials, unauthorized.fetch, { now: () => DURING }).fetchOffers('IN');
    await expect(failed).rejects.toBeInstanceOf(HttpError);
    await expect(failed).rejects.toMatchObject({ status: 401 });

    const down = feeds(allOffersExample, [503, 'Service unavailable']);
    await expect(createFlipkartOffersProvider(credentials, down.fetch, { now: () => DURING }).fetchOffers('IN')).rejects.toMatchObject({
      name: 'HttpError',
      status: 503,
    });
    // 503 is retried once before giving up.
    expect(down.calls.filter((call) => call.url === DOTD_URL)).toHaveLength(2);
  });
});

describe('flipkartOffersDefinition', () => {
  it('needs the affiliate id and token', () => {
    const { fetch } = feeds(allOffersExample, dotdExample);
    expect(flipkartOffersDefinition.network).toBe('flipkart');
    expect(flipkartOffersDefinition.env).toEqual(['FLIPKART_AFFILIATE_ID', 'FLIPKART_AFFILIATE_TOKEN']);
    const missing = flipkartOffersDefinition.create((key) => (key === 'FLIPKART_AFFILIATE_ID' ? 'myaffid' : undefined), fetch);
    expect(missing).toEqual({ missing: expect.stringContaining('FLIPKART_AFFILIATE_TOKEN') });
  });

  it('creates a provider for India from the environment', async () => {
    const { fetch, calls } = feeds(allOffersExample, dotdExample);
    const env: Record<string, string> = { FLIPKART_AFFILIATE_ID: ' myaffid ', FLIPKART_AFFILIATE_TOKEN: 'tok-123\n' };
    const slot = flipkartOffersDefinition.create((key) => env[key], fetch);
    if (!isConfigured(slot)) throw new Error(slot.missing);
    expect(slot).toMatchObject({ network: 'flipkart', markets: ['IN'] });
    // Its clock is the real one, so the 2015 example offer has expired; the deal of the day has no window.
    const offers = await slot.fetchOffers('IN');
    expect(offers.map((offer) => offer.title)).toEqual(['Just Rs. 249']);
    expect(calls[0].headers).toMatchObject({ 'Fk-Affiliate-Id': 'myaffid', 'Fk-Affiliate-Token': 'tok-123' });
  });
});
