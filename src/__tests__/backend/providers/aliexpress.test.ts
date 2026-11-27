import { createHash } from 'node:crypto';
import {
  aliexpressCurrency,
  aliexpressProducts,
  aliexpressSign,
  createAliexpressProvider,
  parseAliexpressProduct,
  promoInstant,
} from '../../../../supabase/functions/_shared/providers/aliexpress.ts';
import { recordingFetch } from '../../helpers/http';

const NOW = new Date('2026-11-26T06:00:00Z');

const product = {
  product_id: 1005006123456789,
  product_title: "Women's Bohemian Floral Maxi Dress",
  product_main_image_url: 'https://ae01.alicdn.com/kf/S123.jpg',
  product_detail_url: 'https://www.aliexpress.com/item/1005006123456789.html',
  promotion_link: 'https://s.click.aliexpress.com/e/_abc',
  target_sale_price: '1250.50',
  target_sale_price_currency: 'INR',
  target_original_price: '2501.00',
  target_original_price_currency: 'INR',
  first_level_category_name: "Women's Clothing",
  second_level_category_name: 'Dresses',
  promo_code_info: {
    promo_code: 'AEFASHION5',
    code_value: 'US $5',
    code_mini_spend: 'US $30',
    code_availabletime_start: '2026-11-01 00:00:00',
    code_availabletime_end: '2026-11-30 23:59:59',
  },
};

const queryResponse = (products: unknown[]) => ({
  aliexpress_affiliate_product_query_response: {
    resp_result: { resp_code: 200, resp_msg: 'success', result: { current_record_count: products.length, products: { product: products } } },
  },
});

describe('AliExpress affiliate API', () => {
  it('signs TOP-style: MD5 of secret + sorted key/values + secret, upper-case', () => {
    const params = { method: 'm', app_key: 'k', timestamp: '1' };
    const expected = createHash('md5').update('SECRETapp_keykmethodmtimestamp1SECRET').digest('hex').toUpperCase();
    expect(aliexpressSign(params, 'SECRET')).toBe(expected);
  });

  it('prices in the shopper’s currency where supported', () => {
    expect(aliexpressCurrency('IN')).toBe('INR');
    expect(aliexpressCurrency('DE')).toBe('EUR');
    expect(aliexpressCurrency('AE')).toBe('USD');
  });

  it('parses a product with its promo code', () => {
    expect(parseAliexpressProduct(product, 'IN', NOW)).toEqual({
      source: 'aliexpress',
      market: 'IN',
      sourceItemId: '1005006123456789',
      title: "Women's Bohemian Floral Maxi Dress",
      description: null,
      brand: null,
      imageUrl: 'https://ae01.alicdn.com/kf/S123.jpg',
      productUrl: 'https://s.click.aliexpress.com/e/_abc',
      condition: 'New with tags',
      size: null,
      colorText: null,
      seller: null,
      currency: 'INR',
      price: 1250.5,
      originalPrice: 2501,
      listedAt: null,
      available: true,
      department: null,
      categoryText: "Women's Clothing>Dresses",
      promo: {
        code: 'AEFASHION5',
        description: 'US $5 off with code AEFASHION5',
        minSpend: 30,
        currency: 'INR',
        startsAt: '2026-11-01T08:00:00.000Z',
        endsAt: '2026-11-30T15:59:59.000Z',
      },
    });
  });

  it('reads zone-less promo times so the window is never longer than it might be', () => {
    expect(promoInstant('2026-11-30 23:59:59', 'end')).toBe('2026-11-30T15:59:59.000Z');
    expect(promoInstant('2026-11-01 00:00:00', 'start')).toBe('2026-11-01T08:00:00.000Z');
    expect(promoInstant('2026-11-30T23:59:59Z', 'end')).toBe('2026-11-30T23:59:59.000Z');
    expect(promoInstant('soon', 'end')).toBeNull();
    const expired = { ...product, promo_code_info: { ...product.promo_code_info, code_availabletime_end: '2026-11-25 23:59:59' } };
    expect(parseAliexpressProduct(expired, 'IN', NOW)?.promo).toBeNull();
    const noEnd = { ...product, promo_code_info: { promo_code: 'X' } };
    expect(parseAliexpressProduct(noEnd, 'IN', NOW)?.promo).toBeNull();
  });

  it('rejects unusable products and surfaces API errors', () => {
    expect(parseAliexpressProduct({ ...product, target_sale_price: undefined, sale_price: undefined }, 'IN', NOW)).toBeNull();
    expect(parseAliexpressProduct({ ...product, product_id: 'abc' }, 'IN', NOW)).toBeNull();
    expect(() => aliexpressProducts({ error_response: { code: 'IncompleteSignature', msg: 'bad sign' } }, 'aliexpress.affiliate.product.query')).toThrow(
      'AliExpress aliexpress.affiliate.product.query: IncompleteSignature bad sign',
    );
    expect(
      aliexpressProducts(
        { aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 405, resp_msg: 'The result is empty' } } },
        'aliexpress.affiliate.product.query',
      ),
    ).toEqual([]);
  });

  it('posts signed requests to the sync gateway with the market’s shipping country and currency', async () => {
    const { fetch, calls } = recordingFetch((url) =>
      url.includes('product.query')
        ? [200, queryResponse([product, { product_id: 'x' }])]
        : [200, { aliexpress_affiliate_productdetail_get_response: { resp_result: { resp_code: 200, result: { current_record_count: 0, products: { product: [] } } } } }],
    );
    const provider = createAliexpressProvider({ appKey: 'KEY', appSecret: 'SECRET', trackingId: 'vibe', markets: ['IN', 'DE'] }, fetch, () => NOW);
    const results = await provider.search({ query: 'x', queryEn: 'floral maxi dress', category: 'Dresses', department: 'women', market: 'IN', limit: 20 });
    expect(results).toHaveLength(1);
    await expect(provider.lookup!('1005006999999999', 'DE')).resolves.toBeNull();

    const url = new URL(calls[0].url);
    expect(`${url.origin}${url.pathname}`).toBe('https://api-sg.aliexpress.com/sync');
    expect(calls[0].init?.method).toBe('POST');
    const system = Object.fromEntries(url.searchParams);
    const body = Object.fromEntries(new URLSearchParams(String(calls[0].init?.body)));
    expect(system).toMatchObject({ app_key: 'KEY', method: 'aliexpress.affiliate.product.query', sign_method: 'md5', format: 'json', v: '2.0', timestamp: String(NOW.getTime()) });
    expect(body).toEqual({
      keywords: 'floral maxi dress',
      page_no: '1',
      page_size: '20',
      ship_to_country: 'IN',
      target_currency: 'INR',
      target_language: 'EN',
      tracking_id: 'vibe',
    });
    const { sign, ...unsigned } = system;
    expect(sign).toBe(aliexpressSign({ ...unsigned, ...body }, 'SECRET'));
    expect(Object.fromEntries(new URLSearchParams(String(calls[1].init?.body)))).toMatchObject({ product_ids: '1005006999999999', country: 'DE', target_currency: 'EUR' });
  });
});
