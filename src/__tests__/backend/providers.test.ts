import { createEbayProvider, largerEbayImage, mapEbayCondition, parseEbayItem } from '../../../supabase/functions/_shared/ebay.ts';
import { createFlipkartProvider, parseFlipkartProduct } from '../../../supabase/functions/_shared/flipkart.ts';
import { mapLimit, requestJson } from '../../../supabase/functions/_shared/http.ts';
import { colorsFromText, toHttps } from '../../../supabase/functions/_shared/normalize.ts';

// Shaped like the v1.0 examples in https://affiliate.flipkart.com/api-docs/af_prod_ref.html
const flipkartProduct = {
  productBaseInfoV1: {
    productId: 'JCKFXYZ123',
    title: "Men Washed Denim Jacket  <b>Blue</b>",
    productDescription: 'A classic <i>washed</i> denim jacket.',
    imageUrls: {
      '400x400': 'http://img.fkcdn.com/image/jacket-400x400.jpeg',
      '200x200': 'http://img.fkcdn.com/image/jacket-200x200.jpeg',
      unknown: 'http://img.fkcdn.com/image/jacket-original.jpeg',
      '800x800': 'http://img.fkcdn.com/image/jacket-800x800.jpeg',
    },
    maximumRetailPrice: { amount: 2999, currency: 'INR' },
    flipkartSellingPrice: { amount: 1499, currency: 'INR' },
    flipkartSpecialPrice: { amount: 1299, currency: 'INR' },
    productUrl: 'http://dl.flipkart.com/dl/denim-jacket/p/itm123?pid=JCKFXYZ123&affid=me',
    productBrand: 'Roadster',
    inStock: true,
    discountPercentage: 56,
    attributes: { size: 'M', color: 'Blue', storage: '', sizeUnit: '', displaySize: '' },
  },
  productShippingInfoV1: { shippingCharges: { amount: 0, currency: 'INR' }, sellerName: 'RetailNet' },
};

const ebaySummary = {
  itemId: 'v1|186000000001|0',
  title: 'Vintage Levis Trucker Denim Jacket Black Size L',
  price: { value: '42.50', currency: 'USD' },
  marketingPrice: { originalPrice: { value: '60.00', currency: 'USD' }, discountPercentage: '29' },
  condition: 'Pre-owned - Excellent',
  conditionId: '2990',
  image: { imageUrl: 'https://i.ebayimg.com/images/g/abc/s-l225.jpg' },
  itemWebUrl: 'https://www.ebay.com/itm/186000000001',
  seller: { username: 'thriftqueen', feedbackPercentage: '99.8' },
  itemCreationDate: '2026-11-01T10:00:00.000Z',
  buyingOptions: ['FIXED_PRICE'],
};

function fakeResponse(status: number, body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text } as unknown as Response;
}

describe('normalize', () => {
  it('upgrades image links to https', () => {
    expect(toHttps('http://img.fkcdn.com/a.jpg')).toBe('https://img.fkcdn.com/a.jpg');
    expect(toHttps('//cdn.x/a.jpg')).toBe('https://cdn.x/a.jpg');
    expect(toHttps('ftp://x')).toBeNull();
    expect(toHttps(undefined)).toBeNull();
  });

  it('finds colours mentioned in text', () => {
    expect(colorsFromText('Blue', 'Washed Denim Jacket')).toEqual(['#3A6EA5']);
    expect(colorsFromText('Black & white striped tee')).toEqual(['#1C1C1C', '#F5F5F5']);
    expect(colorsFromText(null)).toEqual([]);
  });
});

describe('Flipkart', () => {
  it('parses a product into a listing', () => {
    expect(parseFlipkartProduct(flipkartProduct)).toEqual({
      id: 'flipkart:JCKFXYZ123',
      source: 'flipkart',
      sourceItemId: 'JCKFXYZ123',
      title: 'Men Washed Denim Jacket Blue',
      description: 'A classic washed denim jacket.',
      brand: 'Roadster',
      imageUrl: 'https://img.fkcdn.com/image/jacket-800x800.jpeg',
      productUrl: 'https://dl.flipkart.com/dl/denim-jacket/p/itm123?pid=JCKFXYZ123&affid=me',
      condition: 'New with tags',
      size: 'M',
      colors: ['#3A6EA5'],
      seller: 'RetailNet',
      region: 'India',
      currency: 'INR',
      price: 1299,
      originalPrice: 2999,
      listedAt: null,
      available: true,
    });
  });

  it('falls back to the selling price, ignores MRP below the price and rejects unusable products', () => {
    const base = flipkartProduct.productBaseInfoV1;
    const noSpecial = parseFlipkartProduct({ ...flipkartProduct, productBaseInfoV1: { ...base, flipkartSpecialPrice: null, maximumRetailPrice: { amount: 100, currency: 'INR' } } });
    expect(noSpecial).toMatchObject({ price: 1499, originalPrice: null });
    expect(parseFlipkartProduct({ ...flipkartProduct, productBaseInfoV1: { ...base, inStock: false } })?.available).toBe(false);
    expect(parseFlipkartProduct({ ...flipkartProduct, productBaseInfoV1: { ...base, inStock: null } })?.available).toBe(true);
    expect(parseFlipkartProduct({ productBaseInfoV1: { ...base, productId: '' } })).toBeNull();
    expect(parseFlipkartProduct({ productBaseInfoV1: { ...base, flipkartSpecialPrice: null, flipkartSellingPrice: null } })).toBeNull();
    expect(parseFlipkartProduct({} as never)).toBeNull();
  });

  it('calls the documented endpoints with the auth headers', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetch = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: init?.headers as Record<string, string> });
      return url.includes('/search.json')
        ? fakeResponse(200, { productInfoList: [flipkartProduct, { productBaseInfoV1: {} }] })
        : fakeResponse(200, flipkartProduct);
    });
    const provider = createFlipkartProvider({ affiliateId: 'aff', token: 'tok' }, fetch);
    const results = await provider.search('denim jacket', 25);
    expect(results).toHaveLength(1);
    expect(calls[0].url).toBe('https://affiliate-api.flipkart.net/affiliate/1.0/search.json?query=denim%20jacket&resultCount=10');
    expect(calls[0].headers).toMatchObject({ 'Fk-Affiliate-Id': 'aff', 'Fk-Affiliate-Token': 'tok' });
    expect(await provider.lookup('JCKFXYZ123')).toMatchObject({ id: 'flipkart:JCKFXYZ123', price: 1299 });
    expect(calls[1].url).toBe('https://affiliate-api.flipkart.net/affiliate/1.0/product.json?id=JCKFXYZ123');
  });

  it('returns null for products that no longer exist and surfaces auth errors', async () => {
    const provider = createFlipkartProvider({ affiliateId: 'a', token: 't' }, async (url) =>
      url.includes('product.json') ? fakeResponse(404, '') : fakeResponse(401, 'Unauthorized'),
    );
    await expect(provider.lookup('GONE')).resolves.toBeNull();
    await expect(provider.search('x', 5)).rejects.toThrow('Flipkart search failed with HTTP 401');
  });
});

describe('eBay', () => {
  it('maps condition ids', () => {
    expect(mapEbayCondition('1000', '')).toBe('New with tags');
    expect(mapEbayCondition('2990', '')).toBe('Like new');
    expect(mapEbayCondition('3000', 'Pre-owned')).toBe('Good');
    expect(mapEbayCondition('3010', '')).toBe('Fair');
    expect(mapEbayCondition(undefined, 'Pre-owned - Excellent')).toBe('Like new');
    expect(mapEbayCondition(undefined, undefined)).toBe('Good');
  });

  it('requests larger images', () => {
    expect(largerEbayImage('https://i.ebayimg.com/images/g/abc/s-l225.jpg')).toBe('https://i.ebayimg.com/images/g/abc/s-l800.jpg');
    expect(largerEbayImage(null)).toBeNull();
  });

  it('parses an item summary', () => {
    expect(parseEbayItem(ebaySummary, new Date('2026-11-26T00:00:00Z'))).toEqual({
      id: 'ebay:v1|186000000001|0',
      source: 'ebay',
      sourceItemId: 'v1|186000000001|0',
      title: 'Vintage Levis Trucker Denim Jacket Black Size L',
      description: null,
      brand: null,
      imageUrl: 'https://i.ebayimg.com/images/g/abc/s-l800.jpg',
      productUrl: 'https://www.ebay.com/itm/186000000001',
      condition: 'Like new',
      size: null,
      colors: ['#1C1C1C', '#3A6EA5'],
      seller: 'thriftqueen',
      region: 'Global',
      currency: 'USD',
      price: 42.5,
      originalPrice: 60,
      listedAt: '2026-11-01T10:00:00.000Z',
      available: true,
    });
  });

  it('treats out-of-stock and ended items as unavailable', () => {
    const now = new Date('2026-11-26T00:00:00Z');
    expect(parseEbayItem({ ...ebaySummary, estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'OUT_OF_STOCK' }] }, now)?.available).toBe(false);
    expect(parseEbayItem({ ...ebaySummary, itemEndDate: '2026-11-25T00:00:00Z' }, now)?.available).toBe(false);
    expect(parseEbayItem({ ...ebaySummary, price: { value: 'n/a', currency: 'USD' } }, now)).toBeNull();
  });

  it('gets a client-credentials token once and sends the marketplace context', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetch = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/oauth2/token')) return fakeResponse(200, { access_token: 'TOKEN', expires_in: 7200 });
      if (url.includes('/item_summary/search')) return fakeResponse(200, { itemSummaries: [ebaySummary] });
      return fakeResponse(404, '');
    });
    const provider = createEbayProvider(
      { clientId: 'id', clientSecret: 'secret', marketplaceId: 'EBAY_US', deliveryCountry: 'IN', campaignId: '5338' },
      fetch,
      () => new Date('2026-11-26T00:00:00Z'),
    );
    await provider.search('denim jacket', 5);
    await provider.search('cargo pants', 5);
    await expect(provider.lookup('v1|999|0')).resolves.toBeNull();

    const tokenCalls = calls.filter((c) => c.url.endsWith('/oauth2/token'));
    expect(tokenCalls).toHaveLength(1);
    expect((tokenCalls[0].init?.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa('id:secret')}`);
    expect(tokenCalls[0].init?.body).toBe('grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope');

    const search = calls.find((c) => c.url.includes('/item_summary/search'))!;
    const url = new URL(search.url);
    expect(url.searchParams.get('q')).toBe('denim jacket');
    expect(url.searchParams.get('category_ids')).toBe('11450');
    expect(url.searchParams.get('filter')).toBe('buyingOptions:{FIXED_PRICE},conditions:{USED},deliveryCountry:IN');
    expect(search.init?.headers).toMatchObject({
      Authorization: 'Bearer TOKEN',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country%3DIN,affiliateCampaignId=5338',
    });
    expect(calls.at(-1)!.url).toBe('https://api.ebay.com/buy/browse/v1/item/v1%7C999%7C0');
  });
});

describe('http helpers', () => {
  it('retries transient failures once', async () => {
    const fetch = jest.fn().mockResolvedValueOnce(fakeResponse(503, 'busy')).mockResolvedValueOnce(fakeResponse(200, { ok: 1 }));
    await expect(requestJson('https://x', {}, { fetch, label: 'test' })).resolves.toEqual({ ok: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry client errors', async () => {
    const fetch = jest.fn().mockResolvedValue(fakeResponse(400, 'bad'));
    await expect(requestJson('https://x', {}, { fetch, label: 'test' })).rejects.toMatchObject({ status: 400, body: 'bad' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('maps with limited concurrency and keeps order', async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 3, 2, 4], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, n));
      active--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 30, 20, 40]);
    expect(peak).toBe(2);
  });
});
