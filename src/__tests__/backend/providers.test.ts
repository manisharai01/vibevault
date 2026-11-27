import { mapLimit, requestJson } from '../../../supabase/functions/_shared/http.ts';
import {
  classifyCategory,
  classifyStyles,
  colorsFromText,
  detectDepartment,
  isNotFashion,
  toHttps,
} from '../../../supabase/functions/_shared/normalize.ts';
import { prepareListing } from '../../../supabase/functions/_shared/pipeline.ts';
import {
  createEbayProvider,
  ebayDepartment,
  ebaySiteFor,
  largerEbayImage,
  mapEbayCondition,
  parseEbayItem,
  parseMarketList,
} from '../../../supabase/functions/_shared/providers/ebay.ts';
import {
  createFlipkartProvider,
  departmentFromIdealFor,
  flipkartDefinition,
  parseFlipkartProduct,
} from '../../../supabase/functions/_shared/providers/flipkart.ts';
import type { NormalizedListing } from '../../../supabase/functions/_shared/types.ts';
import { fakeResponse, recordingFetch } from '../helpers/http';

// Shaped like the v1.0 examples in https://affiliate.flipkart.com/api-docs/af_prod_ref.html
const flipkartProduct = {
  productBaseInfoV1: {
    productId: 'JCKFXYZ123',
    title: 'Men Washed Denim Jacket  <b>Blue</b>',
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
    categoryPath: 'Apparels>Men>Winter Wear>Jackets',
    attributes: { size: 'M', color: 'Blue', storage: '', sizeUnit: '', displaySize: '' },
  },
  productShippingInfoV1: { shippingCharges: { amount: 0, currency: 'INR' }, sellerName: 'RetailNet' },
  categorySpecificInfoV1: { lifeStyleInfo: { idealFor: ['Men'] } },
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
  categories: [{ categoryId: '57988', categoryName: "Men's Coats & Jackets" }],
};

describe('normalize', () => {
  it('upgrades image links to https', () => {
    expect(toHttps('http://img.fkcdn.com/a.jpg')).toBe('https://img.fkcdn.com/a.jpg');
    expect(toHttps('//cdn.x/a.jpg')).toBe('https://cdn.x/a.jpg');
    expect(toHttps('ftp://x')).toBeNull();
    expect(toHttps(undefined)).toBeNull();
  });

  it('finds colours mentioned in text, in several languages', () => {
    expect(colorsFromText('Blue', 'Washed Denim Jacket')).toEqual(['#3A6EA5']);
    expect(colorsFromText('Black & white striped tee')).toEqual(['#1C1C1C', '#F5F5F5']);
    expect(colorsFromText('Damen Kleid schwarz')).toEqual(['#1C1C1C']);
    expect(colorsFromText(null)).toEqual([]);
  });

  it('reads the department from category paths and titles, and spots kids’ items', () => {
    expect(detectDepartment("Clothing, Shoes & Accessories>Women>Women's Clothing>Dresses", 'Floral dress')).toBe('women');
    expect(detectDepartment(null, "Men's Slim Fit Chinos")).toBe('men');
    expect(detectDepartment(null, 'Unisex bucket hat')).toBe('unisex');
    expect(detectDepartment(null, 'Mens and womens running shoes')).toBe('unisex');
    expect(detectDepartment('Kids>Boys>T-Shirts', 'Graphic tee')).toBe('kids');
    expect(detectDepartment(null, 'Boys cotton shorts')).toBe('kids');
    expect(detectDepartment(null, 'Girls party dress 4-5 years')).toBe('kids');
    expect(detectDepartment(null, 'Party wear dress for girls')).toBe('kids');
    expect(detectDepartment(null, 'Boyfriend jeans light wash')).toBeNull();
    expect(detectDepartment(null, 'Y2K baby tee pink')).toBeNull();
    expect(detectDepartment(null, 'レディース ワンピース')).toBe('women');
    expect(detectDepartment(null, 'Damen Bluse')).toBe('women');
    expect(detectDepartment(null, 'Man-made fibre scarf')).toBeNull();
  });

  it('classifies the category from the category path, else the title’s head noun', () => {
    expect(classifyCategory('Denim shirt dress', null)).toBe('Dresses');
    expect(classifyCategory('Formal dress shirt', null)).toBe('Tops');
    expect(classifyCategory('Leather shoe bag', null)).toBe('Bags');
    expect(classifyCategory('Anything', 'Apparels>Women>Western Wear>Dresses')).toBe('Dresses');
    expect(classifyCategory('Floral kurta set with dupatta', 'Apparels>Women>Ethnic Wear>Kurtas')).toBe('Tops');
    expect(classifyCategory('Laptop sleeve', null)).toBeNull();
    expect(classifyCategory('Vestido largo de flores', null)).toBe('Dresses');
    expect(classifyCategory('メンズ スニーカー', null)).toBe('Shoes');
  });

  it('rejects things that are not wearable fashion or are bulk lots', () => {
    expect(isNotFashion('iPhone 15 case leather')).toBe(true);
    expect(isNotFashion('Lot of 10 vintage t-shirts')).toBe(true);
    expect(isNotFashion('Halloween costume dress')).toBe(true);
    expect(isNotFashion('Cotton shirt', 'Home & Kitchen>Cushions')).toBe(true);
    expect(isNotFashion('Babydoll dress floral')).toBe(false);
    expect(isNotFashion('Lace-up combat boots')).toBe(false);
  });

  it('tags styles from the listing’s own words', () => {
    expect(classifyStyles('Oversized graphic hoodie', null)).toEqual(['Streetwear']);
    expect(classifyStyles('Vintage 90s mom jeans high waist')).toEqual(['Vintage']);
    expect(classifyStyles('Lace-up leather boots')).toEqual([]);
    expect(classifyStyles('Puff sleeve gingham dress with lace trim')).toEqual(['Cottagecore']);
    expect(classifyStyles('Plain white tee', 'organic basic')).toEqual(['Minimalist']);
  });
});

describe('pipeline', () => {
  const listing = (extra: Partial<NormalizedListing> = {}): NormalizedListing => ({
    source: 'ebay',
    market: 'GB',
    sourceItemId: '1',
    title: 'Floral maxi dress boho',
    description: null,
    brand: null,
    imageUrl: null,
    productUrl: 'https://www.ebay.co.uk/itm/1',
    condition: 'Good',
    size: null,
    colorText: 'Pink',
    seller: null,
    currency: 'GBP',
    price: 20,
    originalPrice: null,
    listedAt: null,
    available: true,
    department: null,
    categoryText: null,
    promo: null,
    ...extra,
  });
  const hint = { category: 'Dresses' as const, department: 'women' as const, archetypes: ['Bohemian' as const] };

  it('builds the catalogue row from the listing, falling back to the search for what the text doesn’t say', () => {
    const prepared = prepareListing(listing(), hint);
    expect('row' in prepared && prepared.row).toMatchObject({
      id: 'ebay:GB:1',
      market: 'GB',
      category: 'Dresses',
      department: 'women',
      style_archetypes: ['Bohemian'],
      colors: ['#E8A0B4'],
    });
  });

  it('trusts the listing over the search when they disagree', () => {
    const prepared = prepareListing(listing({ title: "Men's linen shirt", department: null }), hint);
    expect('row' in prepared && prepared.row).toMatchObject({ category: 'Tops', department: 'men' });
  });

  it('rejects kids’ items and non-fashion results', () => {
    expect(prepareListing(listing({ title: 'Girls floral dress age 6' }), hint)).toEqual({ rejected: 'kids' });
    expect(prepareListing(listing({ title: 'Phone case floral' }), hint)).toEqual({ rejected: 'not-fashion' });
  });
});

describe('Flipkart', () => {
  it('parses a product into a listing', () => {
    expect(parseFlipkartProduct(flipkartProduct)).toEqual({
      source: 'flipkart',
      market: 'IN',
      sourceItemId: 'JCKFXYZ123',
      title: 'Men Washed Denim Jacket Blue',
      description: 'A classic washed denim jacket.',
      brand: 'Roadster',
      imageUrl: 'https://img.fkcdn.com/image/jacket-800x800.jpeg',
      productUrl: 'https://dl.flipkart.com/dl/denim-jacket/p/itm123?pid=JCKFXYZ123&affid=me',
      condition: 'New with tags',
      size: 'M',
      colorText: 'Blue',
      seller: 'RetailNet',
      currency: 'INR',
      price: 1299,
      originalPrice: 2999,
      listedAt: null,
      available: true,
      department: 'men',
      categoryText: 'Apparels>Men>Winter Wear>Jackets',
      promo: null,
    });
  });

  it('reads "ideal for" and skips kids’ products', () => {
    expect(departmentFromIdealFor(['Women'])).toBe('women');
    expect(departmentFromIdealFor(['Men & Women'])).toBe('unisex');
    expect(departmentFromIdealFor(['Boys'])).toBe('kids');
    expect(departmentFromIdealFor([])).toBeNull();
    expect(parseFlipkartProduct({ ...flipkartProduct, categorySpecificInfoV1: { lifeStyleInfo: { idealFor: ['Baby Girls'] } } })).toBeNull();
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
    const { fetch, calls } = recordingFetch((url) =>
      url.includes('/search.json') ? [200, { productInfoList: [flipkartProduct, { productBaseInfoV1: {} }] }] : [200, flipkartProduct],
    );
    const provider = createFlipkartProvider({ affiliateId: 'aff', token: 'tok' }, fetch);
    expect(provider.markets).toEqual(['IN']);
    const results = await provider.search({ query: 'x', queryEn: 'denim jacket', category: 'Outerwear', department: 'men', market: 'IN', limit: 25 });
    expect(results).toHaveLength(1);
    expect(calls[0].url).toBe('https://affiliate-api.flipkart.net/affiliate/1.0/search.json?query=denim%20jacket&resultCount=10');
    expect(calls[0].headers).toMatchObject({ 'Fk-Affiliate-Id': 'aff', 'Fk-Affiliate-Token': 'tok' });
    expect(await provider.lookup!('JCKFXYZ123', 'IN')).toMatchObject({ sourceItemId: 'JCKFXYZ123', price: 1299 });
    expect(calls[1].url).toBe('https://affiliate-api.flipkart.net/affiliate/1.0/product.json?id=JCKFXYZ123');
  });

  it('returns null for products that no longer exist and surfaces auth errors', async () => {
    const provider = createFlipkartProvider({ affiliateId: 'a', token: 't' }, async (url) =>
      url.includes('product.json') ? fakeResponse(404, '') : fakeResponse(401, 'Unauthorized'),
    );
    await expect(provider.lookup!('GONE', 'IN')).resolves.toBeNull();
    await expect(provider.search({ query: 'x', queryEn: 'x', category: 'Tops', department: 'men', market: 'IN', limit: 5 })).rejects.toThrow(
      'Flipkart search failed with HTTP 401',
    );
  });

  it('explains which keys are missing', () => {
    expect(flipkartDefinition.create(() => undefined, fetch)).toEqual({
      missing: 'Flipkart is not connected: set FLIPKART_AFFILIATE_ID and FLIPKART_AFFILIATE_TOKEN.',
    });
  });
});

describe('eBay', () => {
  it('maps condition ids and gender fields', () => {
    expect(mapEbayCondition('1000', '')).toBe('New with tags');
    expect(mapEbayCondition('1500', '')).toBe('Like new');
    expect(mapEbayCondition('2990', '')).toBe('Like new');
    expect(mapEbayCondition('3000', 'Pre-owned')).toBe('Good');
    expect(mapEbayCondition('3010', '')).toBe('Fair');
    expect(mapEbayCondition(undefined, 'Pre-owned - Excellent')).toBe('Like new');
    expect(mapEbayCondition(undefined, 'Pre-owned')).toBe('Pre-owned');
    expect(ebayDepartment('Women', 'Adults')).toBe('women');
    expect(ebayDepartment('Unisex Adults', null)).toBe('unisex');
    expect(ebayDepartment('Boys', 'Kids')).toBe('kids');
    expect(ebayDepartment(undefined, undefined)).toBeNull();
  });

  it('maps shopper countries to eBay sites', () => {
    expect(ebaySiteFor('GB')).toBe('EBAY_GB');
    expect(ebaySiteFor('IN')).toBe('EBAY_US');
    expect(parseMarketList(' in, us,GB,xx1,US', ['US'])).toEqual(['IN', 'US', 'GB']);
    expect(parseMarketList('', ['US'])).toEqual(['US']);
  });

  it('requests larger images', () => {
    expect(largerEbayImage('https://i.ebayimg.com/images/g/abc/s-l225.jpg')).toBe('https://i.ebayimg.com/images/g/abc/s-l800.jpg');
    expect(largerEbayImage(null)).toBeNull();
  });

  it('parses an item summary for a market', () => {
    expect(parseEbayItem(ebaySummary, 'IN', new Date('2026-11-26T00:00:00Z'))).toEqual({
      source: 'ebay',
      market: 'IN',
      sourceItemId: 'v1|186000000001|0',
      title: 'Vintage Levis Trucker Denim Jacket Black Size L',
      description: null,
      brand: null,
      imageUrl: 'https://i.ebayimg.com/images/g/abc/s-l800.jpg',
      productUrl: 'https://www.ebay.com/itm/186000000001',
      condition: 'Like new',
      size: null,
      colorText: null,
      seller: 'thriftqueen',
      currency: 'USD',
      price: 42.5,
      originalPrice: 60,
      listedAt: '2026-11-01T10:00:00.000Z',
      available: true,
      department: null,
      categoryText: "Men's Coats & Jackets",
      promo: null,
    });
  });

  it('treats out-of-stock and ended items as unavailable, and skips kids’ items', () => {
    const now = new Date('2026-11-26T00:00:00Z');
    expect(parseEbayItem({ ...ebaySummary, estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'OUT_OF_STOCK' }] }, 'US', now)?.available).toBe(false);
    expect(parseEbayItem({ ...ebaySummary, itemEndDate: '2026-11-25T00:00:00Z' }, 'US', now)?.available).toBe(false);
    expect(parseEbayItem({ ...ebaySummary, price: { value: 'n/a', currency: 'USD' } }, 'US', now)).toBeNull();
    expect(parseEbayItem({ ...ebaySummary, gender: 'Girls', ageGroup: 'Kids' }, 'US', now)).toBeNull();
  });

  it('gets a token once and searches the right site with a delivery filter for each market', async () => {
    const { fetch, calls } = recordingFetch((url) => {
      if (url.endsWith('/oauth2/token')) return [200, { access_token: 'TOKEN', expires_in: 7200 }];
      if (url.includes('/item_summary/search')) return [200, { itemSummaries: [ebaySummary] }];
      return [404, ''];
    });
    const provider = createEbayProvider(
      { clientId: 'id', clientSecret: 'secret', markets: ['IN', 'GB'], conditions: ['USED'], campaignId: '5338' },
      fetch,
      () => new Date('2026-11-26T00:00:00Z'),
    );
    const request = { query: 'denim jacket', queryEn: 'denim jacket', category: 'Outerwear' as const, department: 'unisex' as const, limit: 5 };
    await provider.search({ ...request, market: 'IN' });
    await provider.search({ ...request, market: 'GB' });
    await expect(provider.lookup!('v1|999|0', 'GB')).resolves.toBeNull();

    const tokenCalls = calls.filter((c) => c.url.endsWith('/oauth2/token'));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0].headers.Authorization).toBe(`Basic ${btoa('id:secret')}`);

    const searches = calls.filter((c) => c.url.includes('/item_summary/search'));
    expect(new URL(searches[0].url).searchParams.get('filter')).toBe('buyingOptions:{FIXED_PRICE},conditions:{USED},deliveryCountry:IN');
    expect(searches[0].headers).toMatchObject({
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country%3DIN,affiliateCampaignId=5338',
    });
    expect(new URL(searches[1].url).searchParams.get('filter')).toBe('buyingOptions:{FIXED_PRICE},conditions:{USED},deliveryCountry:GB');
    expect(searches[1].headers['X-EBAY-C-MARKETPLACE-ID']).toBe('EBAY_GB');
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
