import { buyCalendar, getBuyTiming, inCheapSeasonNow, seasonalWindow, upcomingSaleFor } from '../services/buyTiming';
import { parseSeason } from '../services/catalog';
import { Offer, SeasonProfile } from '../types';
import { makeItem, NOW, predictionJson, TODAY } from './helpers/fixtures';

// NOW is 25 November 2026.
const season = (overrides: Partial<SeasonProfile> = {}, months: (number | null)[] = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.8]): SeasonProfile => ({
  basis: 'category',
  listings: 40,
  years: 2,
  months,
  ...overrides,
});
const stats = (median: number) => ({ days: 120, since: '2026-07-28', lowest: median * 0.8, lowest_on: '2025-12-10', highest: median * 1.1, median });

function sale(overrides: Partial<Offer> = {}): Offer {
  return {
    id: 'awin:IN:1',
    network: 'awin',
    market: 'IN',
    merchant: 'Flipkart',
    merchantDomain: 'flipkart.com',
    source: 'flipkart',
    listingId: null,
    title: 'Big End of Season Sale',
    description: null,
    code: null,
    url: 'https://www.flipkart.com/sale',
    discountText: 'Up to 70% off',
    minSpend: null,
    currency: null,
    startsAt: '2026-12-05T00:00:00.000Z',
    endsAt: '2026-12-12T00:00:00.000Z',
    lastSeenAt: NOW.toISOString(),
    ...overrides,
  };
}

describe('season parsing', () => {
  it('reads the yearly pattern and rejects thin or implausible data', () => {
    const months = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), i === 11 ? 0.82 : 1.01]));
    expect(parseSeason({ basis: 'category', listings: 40, years: 2.34, months })).toEqual({
      basis: 'category',
      listings: 40,
      years: 2.3,
      months: [1.01, 1.01, 1.01, 1.01, 1.01, 1.01, 1.01, 1.01, 1.01, 1.01, 1.01, 0.82],
    });
    expect(parseSeason({ basis: 'category', listings: 40, years: 2, months: { '1': 0.9, '2': 1 } })).toBeNull(); // too few months
    expect(parseSeason({ basis: 'shop', listings: 40, years: 2, months })).toBeNull();
    expect(parseSeason({ basis: 'listing', listings: 1, years: 0, months })).toBeNull();
    expect(parseSeason({ basis: 'listing', listings: 1, years: 1, months: { ...months, '12': 9 } })?.months[11]).toBeNull();
    expect(parseSeason(null)).toBeNull();
  });
});

describe('seasonal window', () => {
  it('finds the cheaper month ahead when the saving is worth the wait', () => {
    const item = makeItem({ current_price: 1000, stats: stats(1000) }, { season: season() });
    expect(seasonalWindow(item, NOW)).toEqual({ month: 11, monthsAhead: 1, expectedPrice: 800, saving: 0.2 });
  });

  it('ignores patterns without enough listings or history, and savings that are too small', () => {
    expect(seasonalWindow(makeItem({ current_price: 1000, stats: stats(1000) }, { season: season({ listings: 4 }) }), NOW)).toBeNull();
    expect(seasonalWindow(makeItem({ current_price: 1000, stats: stats(1000) }, { season: season({ years: 0.5 }) }), NOW)).toBeNull();
    const small = season({}, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.97]);
    expect(seasonalWindow(makeItem({ current_price: 1000, stats: stats(1000) }, { season: small }), NOW)).toBeNull();
    // Already at the seasonal price: nothing to wait for.
    expect(seasonalWindow(makeItem({ current_price: 800, stats: stats(1000) }, { season: season() }), NOW)).toBeNull();
  });

  it('knows when today is already the cheap season', () => {
    const december = new Date(2026, 11, 10);
    expect(inCheapSeasonNow(makeItem({ current_price: 800, stats: stats(1000) }, { season: season() }), december)).toBe(true);
    expect(inCheapSeasonNow(makeItem({ current_price: 1000, stats: stats(1000) }, { season: season() }), december)).toBe(false);
  });
});

describe('when to buy', () => {
  it('says to wait for an announced sale first', () => {
    const item = makeItem({ current_price: 1000, stats: stats(1000) }, { season: season() });
    const timing = getBuyTiming(item, { now: NOW, upcomingSales: [sale()] });
    expect(timing).toMatchObject({ kind: 'wait-sale', badge: 'Sale 5 Dec', headline: 'Sale starts 5 Dec', buyFrom: '2026-12-05' });
    expect(timing.detail).toContain('Big End of Season Sale');
  });

  it('only counts sales from the item’s store, in its country, within 60 days', () => {
    const item = makeItem();
    expect(upcomingSaleFor(item, [sale({ source: 'amazon' })], NOW)).toBeNull();
    expect(upcomingSaleFor(item, [sale({ market: 'US' })], NOW)).toBeNull();
    expect(upcomingSaleFor(item, [sale({ startsAt: '2027-03-01T00:00:00.000Z' })], NOW)).toBeNull();
    expect(upcomingSaleFor(item, [sale({ startsAt: '2026-11-01T00:00:00.000Z' })], NOW)).toBeNull();
    expect(upcomingSaleFor(item, [sale({ source: null, listingId: item.id })], NOW)?.id).toBe('awin:IN:1');
  });

  it('then follows the short-term model when a drop within two weeks is likely', () => {
    const item = makeItem({ current_price: 1000, stats: stats(1000), prediction: predictionJson(1000, 0.72, { expectedLow: 880 }) });
    expect(getBuyTiming(item, { now: NOW })).toMatchObject({ kind: 'wait-days', badge: 'Wait ~2 wks', expectedPrice: 880, saving: 0.12 });
  });

  it('then the yearly pattern: "wait for December"', () => {
    const item = makeItem({ current_price: 1000, stats: stats(1000), prediction: predictionJson(1000, 0.2) }, { season: season() });
    const timing = getBuyTiming(item, { now: NOW });
    expect(timing).toMatchObject({ kind: 'wait-month', badge: 'Wait for Dec', headline: 'Wait for December', month: 11, expectedPrice: 800, buyFrom: '2026-12-01' });
    expect(timing.evidence[0]).toBe('40 tops listings on Flipkart, over 2 years of prices.');
  });

  it('says buy now with the reasons when the signals agree', () => {
    const item = makeItem({ current_price: 800, stats: { ...stats(1000), lowest: 800 }, prediction: predictionJson(800, 0.1) }, { season: season() });
    const timing = getBuyTiming(item, { now: new Date(2026, 11, 10) });
    expect(timing.kind).toBe('buy-now');
    expect(timing.detail).toContain('Only 10% chance');
    expect(timing.detail).toContain('lowest price in 120 recorded days');
    expect(timing.detail).toContain('usually its cheapest time of year');
  });

  it('admits when there is no signal yet, and when the item is gone', () => {
    const fresh = makeItem();
    expect(getBuyTiming(fresh, { now: NOW })).toMatchObject({ kind: 'no-signal', badge: null, headline: 'No clear signal yet' });
    const gone = makeItem({ available: false });
    expect(getBuyTiming(gone, { now: NOW }).kind).toBe('unavailable');
    const unclear = makeItem({ current_price: 1000, stats: stats(1000), prediction: predictionJson(1000, 0.45) });
    expect(getBuyTiming(unclear, { now: NOW }).headline).toBe('Too close to call');
  });

  it('groups saved items into a buying calendar', () => {
    const now = makeItem({ id: 'flipkart:IN:A', current_price: 800, stats: { ...stats(1000), lowest: 800 }, prediction: predictionJson(800, 0.1) });
    const soon = makeItem({ id: 'flipkart:IN:B', current_price: 1000, stats: stats(1000), prediction: predictionJson(1000, 0.72) });
    const dec = makeItem({ id: 'flipkart:IN:C', current_price: 1000, stats: stats(1000), prediction: predictionJson(1000, 0.2) }, { season: season() });
    const none = makeItem({ id: 'flipkart:IN:D', price_history: [{ date: TODAY, price: 649 }] });
    const groups = buyCalendar([none, dec, soon, now], { now: NOW });
    expect(groups.map((g) => [g.title, g.items.map((e) => e.item.id)])).toEqual([
      ['Buy now', ['flipkart:IN:A']],
      ['Within two weeks', ['flipkart:IN:B']],
      ['December', ['flipkart:IN:C']],
      ['No clear signal yet', ['flipkart:IN:D']],
    ]);
  });
});
