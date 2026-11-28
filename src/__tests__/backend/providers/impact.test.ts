import { createImpactProvider, impactDefinition, impactItemKey, parseImpactItem } from '../../../../supabase/functions/_shared/providers/impact.ts';
import { recordingFetch } from '../../helpers/http';

const item = {
  Id: '7788-SKU-001',
  CatalogId: '4521',
  CampaignName: 'Northwind Apparel',
  Name: 'Relaxed linen shirt &amp; pocket',
  Description: 'Washed linen, regular fit.',
  Manufacturer: 'Northwind',
  Url: 'https://northwind.sjv.io/c/111/222/333?u=https%3A%2F%2Fnorthwind.example%2Fshirt',
  ImageUrl: 'http://cdn.northwind.example/shirt.jpg',
  CurrentPrice: '39.50',
  OriginalPrice: '59.00',
  Currency: 'usd',
  StockAvailability: 'InStock',
  Condition: 'New',
  Gender: 'Female',
  AgeGroup: 'Adult',
  Colors: ['Sage', 'Green'],
  Size: 'M',
  Category: 'Apparel',
  SubCategory: 'Shirts',
};

describe('impact.com', () => {
  it('parses a catalog item into a listing under the brand’s name', () => {
    expect(parseImpactItem(item, 'US')).toEqual({
      source: 'impact',
      market: 'US',
      sourceItemId: '4521:7788-SKU-001',
      title: 'Relaxed linen shirt & pocket',
      description: 'Washed linen, regular fit.',
      brand: 'Northwind',
      imageUrl: 'https://cdn.northwind.example/shirt.jpg',
      productUrl: 'https://northwind.sjv.io/c/111/222/333?u=https%3A%2F%2Fnorthwind.example%2Fshirt',
      condition: 'New with tags',
      size: 'M',
      colorText: 'Sage, Green',
      seller: 'Northwind Apparel',
      currency: 'USD',
      price: 39.5,
      originalPrice: 59,
      listedAt: null,
      available: true,
      department: 'women',
      categoryText: 'Apparel>Shirts',
      promo: null,
    });
  });

  it('only offers items priced in the shopper’s currency, and never kids’ items', () => {
    expect(parseImpactItem(item, 'GB')).toBeNull();
    expect(parseImpactItem(item, 'XX')).toBeNull();
    expect(parseImpactItem({ ...item, AgeGroup: 'Kids' }, 'US')).toBeNull();
    expect(parseImpactItem({ ...item, CurrentPrice: '' }, 'US')).toBeNull();
    expect(parseImpactItem({ ...item, Url: undefined }, 'US')).toBeNull();
    expect(parseImpactItem({ ...item, OriginalPrice: '39.50' }, 'US')?.originalPrice).toBeNull();
    expect(parseImpactItem({ ...item, StockAvailability: 'OutOfStock' }, 'US')?.available).toBe(false);
    expect(parseImpactItem({ ...item, Condition: 'Used', Gender: 'Male' }, 'US')).toMatchObject({ condition: 'Pre-owned', department: 'men' });
    expect(impactItemKey({ CatalogId: 4521, Id: 'has space' })).toBeNull();
  });

  it('searches every approved catalog with Basic auth and keeps in-stock items in the right currency', async () => {
    const { fetch, calls } = recordingFetch(() => [
      200,
      {
        Items: [
          item,
          { ...item, Id: 'GBP-1', Currency: 'GBP' },
          { ...item, Id: 'OOS-1', StockAvailability: 'OutOfStock' },
          item,
          { ...item, Id: 'B-2', CurrentPrice: '25' },
        ],
      },
    ]);
    const provider = createImpactProvider({ accountSid: 'IRabc', authToken: 'tok', markets: ['US', 'ZZ'] }, fetch);
    expect(provider.markets).toEqual(['US']);
    const results = await provider.search({ query: 'x', queryEn: 'linen shirt', category: 'Tops', department: 'women', market: 'US', limit: 5 });
    expect(results.map((r) => r.sourceItemId)).toEqual(['4521:7788-SKU-001', '4521:B-2']);
    expect(calls[0].url).toBe('https://api.impact.com/Mediapartners/IRabc/Catalogs/ItemSearch?Keyword=linen%20shirt&PageSize=100&Page=1');
    expect(calls[0].headers).toMatchObject({ Authorization: `Basic ${btoa('IRabc:tok')}`, Accept: 'application/json' });
  });

  it('re-checks one item in its catalog and treats a missing item as gone', async () => {
    const { fetch, calls } = recordingFetch((url) => (url.includes('/Items/GONE') ? [404, { Message: 'Not found' }] : [200, { ...item, CurrentPrice: '35' }]));
    const provider = createImpactProvider({ accountSid: 'IRabc', authToken: 'tok', markets: ['US'] }, fetch);
    expect((await provider.lookup!('4521:7788-SKU-001', 'US'))?.price).toBe(35);
    expect(calls[0].url).toBe('https://api.impact.com/Mediapartners/IRabc/Catalogs/4521/Items/7788-SKU-001');
    await expect(provider.lookup!('4521:GONE', 'US')).resolves.toBeNull();
    await expect(provider.lookup!('no-catalog', 'US')).resolves.toBeNull();
  });

  it('says which keys are missing', () => {
    const slot = impactDefinition.create(() => undefined, recordingFetch(() => [200, {}]).fetch);
    expect(slot).toEqual({ missing: 'impact.com is not connected: set IMPACT_ACCOUNT_SID and IMPACT_AUTH_TOKEN.' });
  });
});
