import {
  createSerpapiProvider,
  parseShoppingResult,
  priceInMarketCurrency,
  SERPAPI_MARKETS,
  shoppingItemId,
} from '../../../../supabase/functions/_shared/providers/serpapi.ts';
import { recordingFetch } from '../../helpers/http';

// Shaped like the shopping_results example on https://serpapi.com/shopping-results
const result = {
  position: 1,
  title: 'Roadster Men Black Slim Fit Jeans',
  product_id: '4887235756540435899',
  product_link: 'https://www.google.com/shopping/product/4887235756540435899?gl=in',
  source: 'Myntra',
  price: '₹1,099.00',
  extracted_price: 1099,
  old_price: '₹2,199',
  extracted_old_price: 2199,
  thumbnail: 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:abc',
};

describe('Google Shopping via SerpApi', () => {
  it('accepts only prices written in the market’s currency', () => {
    expect(priceInMarketCurrency('₹1,099.00', SERPAPI_MARKETS.IN)).toBe(true);
    expect(priceInMarketCurrency('US$12.00', SERPAPI_MARKETS.IN)).toBe(false);
    expect(priceInMarketCurrency('$42.99', SERPAPI_MARKETS.US)).toBe(true);
    expect(priceInMarketCurrency('CA$42.99', SERPAPI_MARKETS.US)).toBe(false);
    expect(priceInMarketCurrency('42,99 €', SERPAPI_MARKETS.DE)).toBe(true);
    expect(priceInMarketCurrency(undefined, SERPAPI_MARKETS.DE)).toBe(false);
  });

  it('gives each store’s offer of a product a stable id', () => {
    expect(shoppingItemId(result)).toBe(shoppingItemId({ ...result, price: '₹999' }));
    expect(shoppingItemId(result)).not.toBe(shoppingItemId({ ...result, source: 'Ajio' }));
    expect(shoppingItemId({ ...result, product_id: undefined })).toMatch(/^h[0-9a-f]{24}$/);
    expect(shoppingItemId({ ...result, source: '' })).toBeNull();
  });

  it('parses a result', () => {
    expect(parseShoppingResult(result, 'IN')).toMatchObject({
      source: 'google_shopping',
      market: 'IN',
      title: 'Roadster Men Black Slim Fit Jeans',
      seller: 'Myntra',
      currency: 'INR',
      price: 1099,
      originalPrice: 2199,
      condition: 'New with tags',
      productUrl: 'https://www.google.com/shopping/product/4887235756540435899?gl=in',
      available: true,
    });
    expect(parseShoppingResult({ ...result, second_hand_condition: 'used' }, 'IN')?.condition).toBe('Pre-owned');
    expect(parseShoppingResult({ ...result, price: 'US$13.00' }, 'IN')).toBeNull();
    expect(parseShoppingResult(result, 'KR')).toBeNull();
  });

  it('searches with the market’s Google domain and treats "no results" as empty', async () => {
    const { fetch, calls } = recordingFetch((url) =>
      url.includes('q=none') ? [200, { error: "Google hasn't returned any results for this query." }] : [200, { shopping_results: [result, result] }],
    );
    const provider = createSerpapiProvider({ apiKey: 'KEY', markets: ['IN', 'DE', 'KR'] }, fetch);
    expect(provider.markets).toEqual(['IN', 'DE']);
    expect(provider.lookup).toBeUndefined();
    const found = await provider.search({ query: 'men black jeans', queryEn: 'men black jeans', category: 'Bottoms', department: 'men', market: 'IN', limit: 10 });
    expect(found).toHaveLength(1);
    const params = new URL(calls[0].url).searchParams;
    expect(Object.fromEntries(params)).toEqual({
      engine: 'google_shopping',
      q: 'men black jeans',
      gl: 'in',
      hl: 'en',
      google_domain: 'google.co.in',
      api_key: 'KEY',
    });
    await expect(provider.search({ query: 'none', queryEn: 'none', category: 'Tops', department: 'men', market: 'IN', limit: 5 })).resolves.toEqual([]);
  });

  it('surfaces other errors without exposing the key', async () => {
    const { fetch } = recordingFetch(() => [401, { error: 'Invalid API key.' }]);
    const provider = createSerpapiProvider({ apiKey: 'SECRET-KEY', markets: ['US'] }, fetch);
    const error = await provider.search({ query: 'x', queryEn: 'x', category: 'Tops', department: 'men', market: 'US', limit: 5 }).catch((e) => e);
    expect(String(error.message)).toContain('HTTP 401');
    expect(String(error.message)).not.toContain('SECRET-KEY');
  });
});
