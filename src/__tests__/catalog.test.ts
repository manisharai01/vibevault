import { formatTotal, parsePrediction, priceIn, toFashionItem, toFashionItems, totalIn } from '../services/catalog';
import { makeEbayRow, makeRow, NOW, predictionJson, RATES, TODAY } from './helpers/fixtures';

describe('catalogue rows → items', () => {
  it('maps a row to a listing with its marketplace, market and department', () => {
    const item = toFashionItem(makeRow(), NOW)!;
    expect(item).toMatchObject({
      id: 'flipkart:IN:SHTFX123',
      source: 'flipkart',
      platform: 'Flipkart',
      siteName: 'Flipkart',
      market: 'IN',
      department: 'men',
      category: 'Tops',
      condition: 'New with tags',
      secondhand: false,
      currency: 'INR',
      currentPrice: 649,
      originalPrice: 1299,
      available: true,
      endReason: null,
      matchScore: 0,
      matchReasons: [],
    });
    expect(item.stats).toEqual({ days: 1, since: TODAY, lowest: 649, lowestOn: TODAY, highest: 649, median: 649 });
  });

  it('treats every graded or ungraded used condition as pre-owned', () => {
    expect(toFashionItem(makeEbayRow(), NOW)!.secondhand).toBe(true);
    expect(toFashionItem(makeEbayRow({ condition: 'Pre-owned' }), NOW)!.condition).toBe('Pre-owned');
  });

  it('rejects rows that are missing essentials or have unknown values', () => {
    const bad = [
      makeRow({ id: 'flipkart:SHTFX123' }), // old id format without market
      makeRow({ market: 'India' }),
      makeRow({ product_url: 'http://insecure.example/x' }),
      makeRow({ current_price: 0 }),
      makeRow({ currency: 'rupees' }),
      makeRow({ category: 'Hats' }),
      makeRow({ condition: 'Mint' }),
      makeRow({ department: 'kids' }),
      makeRow({ last_checked_at: '' }),
    ];
    for (const row of bad) expect(toFashionItem(row, NOW)).toBeNull();
  });

  it('drops an original price that is not above the current price and cleans history, colours and styles', () => {
    const item = toFashionItem(
      makeRow({
        original_price: 600,
        colors: ['#F5F5F5', 'blue', '#123456', '#ABCDEF', '#000000', '#111111'],
        style_archetypes: ['Minimalist', 'Gothic'],
        price_history: [
          { date: '2026-11-25', price: 649 },
          { date: '2026-11-23', price: '700' },
          { date: 'yesterday', price: 1 },
          { date: '2026-11-24', price: -5 },
        ],
      }),
      NOW,
    )!;
    expect(item.originalPrice).toBeNull();
    expect(item.colors).toEqual(['#F5F5F5', '#123456', '#ABCDEF', '#000000']);
    expect(item.styleArchetypes).toEqual(['Minimalist']);
    expect(item.priceHistory).toEqual([
      { date: '2026-11-23', price: 700 },
      { date: '2026-11-25', price: 649 },
    ]);
  });

  it('keeps the latest prediction only while it is recent and for today’s price', () => {
    const fresh = parsePrediction(predictionJson(649, 0.7) as never, 649, TODAY)!;
    expect(fresh.madeOn).toBe(TODAY);
    expect(fresh.horizons[14]).toMatchObject({ pDrop: 0.7, verdict: 'wait', basis: 'category', basisListings: 42 });
    expect(fresh.horizons[7]?.verdict).toBe('wait');
    expect(parsePrediction(predictionJson(649, 0.7, { madeOn: '2026-11-20' }) as never, 649, TODAY)).toBeNull();
    // The price changed since the prediction was made: it no longer applies.
    expect(parsePrediction(predictionJson(699, 0.7) as never, 649, TODAY)).toBeNull();
    expect(parsePrediction(null, 649, TODAY)).toBeNull();
    const broken = predictionJson(649, 0.7) as { horizons: Record<string, Record<string, unknown>> };
    broken.horizons['14'].p_drop = 1.4;
    broken.horizons['7'].verdict = 'maybe';
    expect(Object.keys(parsePrediction(broken as never, 649, TODAY)!.horizons)).toEqual(['30']);
  });

  it('shows no prediction for listings that are no longer for sale', () => {
    expect(toFashionItem(makeRow({ prediction: predictionJson(649, 0.7), available: false }), NOW)!.prediction).toBeNull();
    expect(toFashionItem(makeRow({ prediction: predictionJson(649, 0.7) }), NOW)!.prediction).not.toBeNull();
  });

  it('skips duplicates and junk in a list of rows', () => {
    const items = toFashionItems([makeRow(), makeRow(), makeEbayRow(), null, 'x', { id: 1 }], NOW);
    expect(items.map((i) => i.id)).toEqual(['flipkart:IN:SHTFX123', 'ebay:IN:v1|1234567890|0']);
    expect(toFashionItems('nope')).toEqual([]);
  });
});

describe('currency conversion', () => {
  const rupee = toFashionItem(makeRow(), NOW)!;
  const dollar = toFashionItem(makeEbayRow(), NOW)!;

  it('converts through the euro rates and never guesses a missing rate', () => {
    expect(priceIn(rupee, 'INR', null)).toBe(649);
    expect(priceIn(dollar, 'INR', RATES)).toBeCloseTo((42.5 / 1.06) * 98.4, 6);
    expect(priceIn(dollar, 'JPY', RATES)).toBeNull();
    expect(priceIn(dollar, 'INR', null)).toBeNull();
  });

  it('totals mixed currencies and marks converted totals as approximate', () => {
    const total = totalIn([rupee, dollar], 'INR', RATES);
    expect(total.approximate).toBe(true);
    expect(total.missing).toBe(0);
    expect(formatTotal(total, 2)).toBe(`≈ ₹${Math.round(649 + (42.5 / 1.06) * 98.4).toLocaleString('en-IN')}`);
    expect(formatTotal(totalIn([rupee], 'INR', null), 1)).toBe('₹649');
    expect(formatTotal(totalIn([dollar], 'INR', null), 1)).toBe('—');
    expect(totalIn([rupee, dollar], 'INR', null)).toEqual({ total: 649, currency: 'INR', approximate: false, missing: 1 });
  });
});
