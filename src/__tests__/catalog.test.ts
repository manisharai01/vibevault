import { CATEGORIES, STYLE_ARCHETYPES } from '../constants/marketplaces';
import { BADGES, QUEST_DEFINITIONS } from '../data/content';
import { formatInrTotal, priceInInr, toFashionItem, toFashionItems, totalInInr } from '../services/catalog';
import { NEW_ITEM_FOOTPRINT_KG } from '../services/sustainability';
import { dailyHistory, makeEbayItem, makeEbayRow, makeItem, makeRow, NOW, sampleCatalog } from './helpers/fixtures';

describe('static content integrity', () => {
  it('defines quests whose badges exist and badges with unique ids', () => {
    const badgeIds = new Set(BADGES.map((b) => b.id));
    expect(badgeIds.size).toBe(BADGES.length);
    const questIds = QUEST_DEFINITIONS.map((q) => q.id);
    expect(new Set(questIds).size).toBe(questIds.length);
    for (const quest of QUEST_DEFINITIONS) {
      expect(quest.steps.length).toBeGreaterThan(0);
      expect(new Set(quest.steps).size).toBe(quest.steps.length);
      if (quest.badgeId) expect(badgeIds.has(quest.badgeId)).toBe(true);
    }
  });

  it('has a CO₂ footprint for every category', () => {
    for (const category of CATEGORIES) expect(NEW_ITEM_FOOTPRINT_KG[category]).toBeGreaterThan(0);
  });
});

describe('toFashionItem', () => {
  it('maps a Flipkart row to a new-retail item priced in rupees', () => {
    const item = makeItem();
    expect(item).toMatchObject({
      id: 'flipkart:SHTFX123',
      source: 'flipkart',
      platform: 'Flipkart',
      currency: 'INR',
      currentPrice: 649,
      originalPrice: 1299,
      inrRate: 1,
      secondhand: false,
      co2Saved: 0,
      region: 'India',
      available: true,
      matchScore: 0,
      firstSeen: '2026-11-25',
    });
    expect(item.predictedPrice7d).toBeNull(); // one day of history is not enough to forecast
  });

  it('maps an eBay row to a pre-owned item in its own currency', () => {
    const item = makeEbayItem();
    expect(item).toMatchObject({
      platform: 'eBay',
      currency: 'USD',
      currentPrice: 42.5,
      originalPrice: null,
      inrRate: 92.24,
      secondhand: true,
      region: 'Global',
      description: null,
    });
    expect(item.co2Saved).toBe(NEW_ITEM_FOOTPRINT_KG.Outerwear);
    expect(item.sustainabilityScore).toBeGreaterThan(80);
  });

  it('parses numeric strings from Postgres numeric columns', () => {
    const item = toFashionItem(makeRow({ current_price: '649.00', original_price: '1299.00', inr_rate: '1' }));
    expect(item?.currentPrice).toBe(649);
    expect(item?.originalPrice).toBe(1299);
  });

  it('drops an original price that is not above the current price', () => {
    expect(makeItem({ original_price: 649 }).originalPrice).toBeNull();
    expect(makeItem({ original_price: 500 }).originalPrice).toBeNull();
  });

  it('keeps the exchange rate unknown when the backend has none', () => {
    expect(makeEbayItem({ inr_rate: null }).inrRate).toBeNull();
    expect(makeEbayItem({ inr_rate: 0 }).inrRate).toBeNull();
  });

  it('rejects rows that cannot be shown safely', () => {
    expect(toFashionItem(makeRow({ id: '' }))).toBeNull();
    expect(toFashionItem(makeRow({ title: '  ' }))).toBeNull();
    expect(toFashionItem(makeRow({ product_url: 'http://insecure.example/item' }))).toBeNull();
    expect(toFashionItem(makeRow({ product_url: 'javascript:alert(1)' }))).toBeNull();
    expect(toFashionItem(makeRow({ current_price: 0 }))).toBeNull();
    expect(toFashionItem(makeRow({ current_price: 'abc' }))).toBeNull();
    expect(toFashionItem(makeRow({ source: 'amazon' }))).toBeNull();
    expect(toFashionItem(makeRow({ category: 'Hats' }))).toBeNull();
    expect(toFashionItem(makeRow({ condition: 'Broken' }))).toBeNull();
    expect(toFashionItem(makeRow({ region: 'Mars' }))).toBeNull();
    expect(toFashionItem(null as never)).toBeNull();
  });

  it('cleans optional fields instead of rejecting the row', () => {
    const item = makeItem({
      image_url: 'http://rukminim1.flixcart.com/image.jpeg',
      style_archetypes: ['Minimalist', 'Unknown'],
      colors: ['#FFFFFF', 'red', '#12345'],
      brand: '  ',
      description: '',
    });
    expect(item.image).toBeNull();
    expect(item.styleArchetypes).toEqual(['Minimalist']);
    expect(item.colors).toEqual(['#FFFFFF']);
    expect(item.brand).toBeNull();
    expect(item.description).toBeNull();
    for (const style of item.styleArchetypes) expect(STYLE_ARCHETYPES).toContain(style);
  });

  it('sorts history, drops bad points and forecasts once there is a week of data', () => {
    const history = dailyHistory([900, 880, 860, 840, 820, 800, 780, 760]);
    const shuffled = [history[3], { date: 'bad', price: 1 }, { date: history[0].date, price: -5 }, ...history.slice(0, 3), ...history.slice(4)];
    const item = makeItem({ price_history: shuffled, current_price: 760 });
    expect(item.priceHistory).toEqual(history);
    expect(item.predictedPrice7d).not.toBeNull();
    expect(item.predictedPrice7d!).toBeLessThan(760);
  });

  it('keeps plain listing dates without a timezone shift', () => {
    expect(makeItem({ listed_at: '2026-11-20' }).listedDate).toBe('2026-11-20');
    expect(makeItem({ listed_at: null }).listedDate).toBeNull();
  });

  it('reads availability strictly', () => {
    expect(makeItem({ available: false }).available).toBe(false);
    expect(makeItem({ available: 'true' as never }).available).toBe(false);
  });
});

describe('toFashionItems', () => {
  it('skips invalid rows and duplicate ids', () => {
    const rows = [makeRow(), makeRow(), makeRow({ category: 'Nope' }), makeEbayRow()];
    expect(toFashionItems(rows).map((i) => i.id)).toEqual(['flipkart:SHTFX123', 'ebay:v1|1234567890|0']);
  });

  it('returns nothing for a non-array response', () => {
    expect(toFashionItems({ message: 'error' })).toEqual([]);
    expect(toFashionItems(null)).toEqual([]);
  });

  it('builds a catalogue covering every category', () => {
    const catalog = sampleCatalog();
    for (const category of CATEGORIES) expect(catalog.some((i) => i.category === category)).toBe(true);
    expect(NOW.getFullYear()).toBe(2026);
  });
});

describe('rupee conversion', () => {
  it('converts prices with the recorded rate', () => {
    expect(priceInInr(makeItem())).toBe(649);
    expect(priceInInr(makeEbayItem())).toBeCloseTo(42.5 * 92.24);
    expect(priceInInr(makeEbayItem({ inr_rate: null }))).toBeNull();
  });

  it('totals mixed currencies, marking converted totals as approximate', () => {
    const inrOnly = totalInInr([makeItem(), makeItem({ current_price: 351 })]);
    expect(inrOnly).toEqual({ total: 1000, approximate: false, missing: 0 });
    expect(formatInrTotal(inrOnly, 2)).toBe('₹1,000');

    const mixed = totalInInr([makeItem(), makeEbayItem()]);
    expect(mixed.approximate).toBe(true);
    expect(mixed.total).toBe(Math.round(649 + 42.5 * 92.24));
    expect(formatInrTotal(mixed, 2)).toMatch(/^≈ ₹/);

    const unknown = totalInInr([makeEbayItem({ inr_rate: null })]);
    expect(unknown).toEqual({ total: 0, approximate: false, missing: 1 });
    expect(formatInrTotal(unknown, 1)).toBe('—');
  });
});
