import { createEtsyProvider, etsyAmount, isEtsyVintage, parseEtsyListing } from '../../../../supabase/functions/_shared/providers/etsy.ts';
import { recordingFetch } from '../../helpers/http';

const NOW = new Date('2026-11-26T06:00:00Z');

const listing = {
  listing_id: 1234567890,
  title: 'Handmade linen wrap dress &amp; pockets',
  description: 'Soft washed linen.',
  state: 'active',
  url: 'https://www.etsy.com/listing/1234567890/handmade-linen-wrap-dress',
  price: { amount: 8900, divisor: 100, currency_code: 'GBP' },
  quantity: 3,
  who_made: 'i_did',
  when_made: 'made_to_order',
  created_timestamp: 1767225600,
};

describe('Etsy', () => {
  it('converts Etsy money and recognises vintage items', () => {
    expect(etsyAmount({ amount: 8900, divisor: 100, currency_code: 'GBP' })).toBe(89);
    expect(etsyAmount({ amount: 500, divisor: 0 })).toBeNull();
    expect(isEtsyVintage({ who_made: 'someone_else', when_made: '1990s' }, NOW)).toBe(true);
    expect(isEtsyVintage({ who_made: 'someone_else', when_made: 'before_2007' }, NOW)).toBe(true);
    expect(isEtsyVintage({ who_made: 'someone_else', when_made: '2010_2019' }, NOW)).toBe(false);
    expect(isEtsyVintage({ who_made: 'i_did', when_made: '1990s' }, NOW)).toBe(false);
  });

  it('parses a listing', () => {
    expect(parseEtsyListing({ ...listing, images: [{ url_570xN: 'https://i.etsystatic.com/1/il_570xN.jpg' }] }, 'GB', NOW)).toEqual({
      source: 'etsy',
      market: 'GB',
      sourceItemId: '1234567890',
      title: 'Handmade linen wrap dress & pockets',
      description: 'Soft washed linen.',
      brand: null,
      imageUrl: 'https://i.etsystatic.com/1/il_570xN.jpg',
      productUrl: 'https://www.etsy.com/listing/1234567890/handmade-linen-wrap-dress',
      condition: 'New with tags',
      size: null,
      colorText: null,
      seller: null,
      currency: 'GBP',
      price: 89,
      originalPrice: null,
      listedAt: '2026-01-01T00:00:00.000Z',
      available: true,
      department: null,
      categoryText: null,
      promo: null,
    });
    expect(parseEtsyListing({ ...listing, state: 'sold_out' }, 'GB', NOW)?.available).toBe(false);
    expect(parseEtsyListing({ ...listing, who_made: 'someone_else', when_made: '1980s' }, 'GB', NOW)?.condition).toBe('Pre-owned');
    expect(parseEtsyListing({ ...listing, price: undefined }, 'GB', NOW)).toBeNull();
  });

  it('searches shops in the shopper’s country, then fetches images in one batch', async () => {
    const { fetch, calls } = recordingFetch((url) =>
      url.includes('/listings/active')
        ? [200, { count: 1, results: [listing] }]
        : [200, { count: 1, results: [{ ...listing, images: [{ url_570xN: 'https://i.etsystatic.com/1/a.jpg' }] }] }],
    );
    const provider = createEtsyProvider({ keystring: 'KS', sharedSecret: 'SS', markets: ['GB', 'XX'] }, fetch, () => NOW);
    expect(provider.markets).toEqual(['GB']);
    const results = await provider.search({ query: 'x', queryEn: 'linen dress', category: 'Dresses', department: 'women', market: 'GB', limit: 10 });
    expect(results[0].imageUrl).toBe('https://i.etsystatic.com/1/a.jpg');
    expect(calls[0].url).toBe(
      'https://openapi.etsy.com/v3/application/listings/active?keywords=linen%20dress&limit=10&sort_on=score&shop_location=United%20Kingdom',
    );
    expect(calls[0].headers).toMatchObject({ 'x-api-key': 'KS:SS' });
    expect(calls[1].url).toBe('https://openapi.etsy.com/v3/application/listings/batch?listing_ids=1234567890&includes=Images');
  });

  it('treats listings missing from the batch response as gone', async () => {
    const { fetch } = recordingFetch(() => [200, { count: 0, results: [] }]);
    const provider = createEtsyProvider({ keystring: 'KS', sharedSecret: 'SS', markets: ['GB'] }, fetch, () => NOW);
    await expect(provider.lookup!('1234567890', 'GB')).resolves.toBeNull();
    await expect(provider.lookup!('not-a-number', 'GB')).resolves.toBeNull();
  });
});
