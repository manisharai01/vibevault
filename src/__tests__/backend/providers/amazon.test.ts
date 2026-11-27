import {
  AMAZON_RESOURCES,
  amazonDefinition,
  browsePath,
  createAmazonProvider,
  mapAmazonCondition,
  parseAmazonItem,
  parsePartnerTags,
} from '../../../../supabase/functions/_shared/providers/amazon.ts';
import { recordingFetch } from '../../helpers/http';

const NOW = new Date('2026-11-26T06:00:00Z');

// Shaped like the Creators API GetItems/SearchItems examples (itemsResult.items[], offersV2.listings[]).
const item = {
  asin: 'B0ABCDEF12',
  detailPageURL: 'https://www.amazon.in/dp/B0ABCDEF12?tag=vibe-21&linkCode=ogi',
  images: { primary: { large: { url: 'https://m.media-amazon.com/images/I/abc._SL500_.jpg', height: 500, width: 500 } } },
  itemInfo: {
    title: { displayValue: 'Women Floral Print Maxi Dress' },
    byLineInfo: { brand: { displayValue: 'Libas' } },
    productInfo: { color: { displayValue: 'Pink' }, size: { displayValue: 'M' } },
    classifications: { productGroup: { displayValue: 'Apparel' } },
  },
  browseNodeInfo: {
    browseNodes: [
      { id: '1', displayName: 'Dresses', contextFreeName: "Women's Dresses", ancestor: { displayName: 'Western Wear', ancestor: { displayName: 'Women', ancestor: { displayName: 'Clothing & Accessories' } } } },
    ],
  },
  offersV2: {
    listings: [
      { isBuyBoxWinner: false, price: { money: { amount: 1599, currency: 'INR' } } },
      {
        isBuyBoxWinner: true,
        price: { money: { amount: 1299, currency: 'INR', displayAmount: '₹1,299.00' }, savingBasis: { money: { amount: 2499, currency: 'INR' }, savingBasisType: 'LIST_PRICE' } },
        availability: { type: 'IN_STOCK' },
        condition: { value: 'New' },
        merchantInfo: { name: 'Cloudtail' },
        dealDetails: { badge: 'Limited time deal', endTime: '2026-11-27T18:30:00Z' },
      },
    ],
  },
};

describe('Amazon Creators API', () => {
  it('parses the buy-box offer of an item', () => {
    expect(parseAmazonItem(item, 'IN', NOW)).toEqual({
      source: 'amazon',
      market: 'IN',
      sourceItemId: 'B0ABCDEF12',
      title: 'Women Floral Print Maxi Dress',
      description: null,
      brand: 'Libas',
      imageUrl: 'https://m.media-amazon.com/images/I/abc._SL500_.jpg',
      productUrl: 'https://www.amazon.in/dp/B0ABCDEF12?tag=vibe-21&linkCode=ogi',
      condition: 'New with tags',
      size: 'M',
      colorText: 'Pink',
      seller: 'Cloudtail',
      currency: 'INR',
      price: 1299,
      originalPrice: 2499,
      listedAt: null,
      available: true,
      department: null,
      categoryText: "Clothing & Accessories>Women>Western Wear>Women's Dresses",
      promo: { code: null, description: 'Limited time deal', minSpend: null, currency: 'INR', startsAt: null, endsAt: '2026-11-27T18:30:00Z' },
    });
  });

  it('only treats list/was prices as the original price and reads availability and condition', () => {
    const listing = item.offersV2.listings[1];
    const variant = (patch: object) => ({ ...item, offersV2: { listings: [{ ...listing, ...patch }] } });
    expect(parseAmazonItem(variant({ price: { ...listing.price, savingBasis: { money: { amount: 1999 }, savingBasisType: 'LOWEST_PRICE' } } }), 'IN', NOW)?.originalPrice).toBeNull();
    expect(parseAmazonItem(variant({ availability: { type: 'OUT_OF_STOCK' } }), 'IN', NOW)?.available).toBe(false);
    expect(parseAmazonItem(variant({ dealDetails: { badge: 'Deal', endTime: '2026-11-25T00:00:00Z' } }), 'IN', NOW)?.promo).toBeNull();
    expect(parseAmazonItem({ ...item, offersV2: { listings: [] } }, 'IN', NOW)).toBeNull();
    expect(mapAmazonCondition('Used', 'LikeNew')).toBe('Like new');
    expect(mapAmazonCondition('Used', 'Acceptable')).toBe('Fair');
    expect(mapAmazonCondition('Used', 'Unknown')).toBe('Pre-owned');
    expect(browsePath(undefined)).toBeNull();
  });

  it('reads partner tags per market', () => {
    expect(parsePartnerTags('IN:vibe-21, us:vibe-20,XX:bad,GB')).toEqual({ IN: 'vibe-21', US: 'vibe-20' });
    expect(amazonDefinition.create(() => undefined, fetch)).toHaveProperty('missing');
  });

  it('gets an LwA token, then searches and looks items up 10 per call with the marketplace header', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const { fetch, calls } = recordingFetch((url, init) => {
        if (url.endsWith('/auth/o2/token')) return [200, { access_token: 'Atc|TOKEN', token_type: 'bearer', expires_in: 3600 }];
        if (url.endsWith('/searchItems')) return [200, { searchResult: { items: [item], totalResultCount: 1 } }];
        const ids = JSON.parse(String(init?.body)).itemIds as string[];
        return ids.includes('B0ABCDEF12') ? [200, { itemsResult: { items: [item] } }] : [404, { type: 'ResourceNotFoundException' }];
      });
      const provider = createAmazonProvider(
        { clientId: 'cid', clientSecret: 'secret', credentialVersion: '3.2', partnerTags: { IN: 'vibe-21' } },
        fetch,
        () => NOW,
      );
      expect(provider.markets).toEqual(['IN']);
      const search = provider.search({ query: 'floral maxi dress', queryEn: 'floral maxi dress', category: 'Dresses', department: 'women', market: 'IN', limit: 25 });
      await jest.runAllTimersAsync();
      expect(await search).toHaveLength(1);

      const ids = ['B0ABCDEF12', ...Array.from({ length: 11 }, (_, i) => `B0GONE${String(i).padStart(4, '0')}`)];
      const lookups = provider.lookupMany!(ids, 'IN');
      await jest.runAllTimersAsync();
      const found = await lookups;
      expect(found.get('B0ABCDEF12')?.price).toBe(1299);
      expect(found.get('B0GONE0000')).toBeNull();
      expect(found.size).toBe(12);

      const token = calls.filter((c) => c.url.endsWith('/auth/o2/token'));
      expect(token).toHaveLength(1);
      expect(token[0].url).toBe('https://api.amazon.co.uk/auth/o2/token');
      expect(JSON.parse(String(token[0].init?.body))).toEqual({
        grant_type: 'client_credentials',
        client_id: 'cid',
        client_secret: 'secret',
        scope: 'creatorsapi::default',
      });

      const searchCall = calls.find((c) => c.url.endsWith('/searchItems'))!;
      expect(searchCall.url).toBe('https://creatorsapi.amazon/catalog/v1/searchItems');
      expect(searchCall.headers).toMatchObject({ Authorization: 'Bearer Atc|TOKEN', 'x-marketplace': 'www.amazon.in', 'Content-Type': 'application/json' });
      expect(JSON.parse(String(searchCall.init?.body))).toEqual({
        keywords: 'floral maxi dress',
        searchIndex: 'Fashion',
        itemCount: 10,
        availability: 'Available',
        partnerTag: 'vibe-21',
        marketplace: 'www.amazon.in',
        resources: AMAZON_RESOURCES,
      });
      const getItems = calls.filter((c) => c.url.endsWith('/getItems'));
      expect(getItems.map((c) => JSON.parse(String(c.init?.body)).itemIds.length)).toEqual([10, 2]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('falls back to searching everything where the Fashion index is rejected', async () => {
    const { fetch, calls } = recordingFetch((url, init) => {
      if (url.endsWith('/auth/o2/token')) return [200, { access_token: 'T', expires_in: 3600 }];
      return JSON.parse(String(init?.body)).searchIndex === 'Fashion'
        ? [400, { type: 'ValidationException', reason: 'FieldValidationFailed' }]
        : [200, { searchResult: { items: [] } }];
    });
    const provider = createAmazonProvider({ clientId: 'c', clientSecret: 's', credentialVersion: '3.3', partnerTags: { JP: 'tag-22' } }, fetch, () => NOW);
    await provider.search({ query: 'ワンピース', queryEn: 'dress', category: 'Dresses', department: 'women', market: 'JP', limit: 5 });
    await provider.search({ query: 'ワンピース', queryEn: 'dress', category: 'Dresses', department: 'women', market: 'JP', limit: 5 });
    const indexes = calls.filter((c) => c.url.endsWith('/searchItems')).map((c) => JSON.parse(String(c.init?.body)).searchIndex);
    expect(indexes).toEqual(['Fashion', 'All', 'All']);
  });
});
