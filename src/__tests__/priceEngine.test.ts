import {
  checkAlerts,
  getBuyAdvice,
  getDealScore,
  historyDays,
  isAtRecordLow,
  priceChangeSinceFirst,
  pricePosition,
  seasonalInsight,
  suggestedTarget,
} from '../services/priceEngine';
import { PriceAlert, PricePoint } from '../types';
import { dailyHistory, makeEbayItem, makeItem, predictionJson, TODAY } from './helpers/fixtures';

const stats = (lowest: number, highest: number, days = 30) => ({ days, since: '2026-10-27', lowest, lowest_on: TODAY, highest, median: (lowest + highest) / 2 });

describe('buy-or-wait advice', () => {
  it('is absent while the model has no prediction for the listing', () => {
    expect(getBuyAdvice(makeItem())).toBeNull();
  });

  it('says wait, buy now or too close to call from the 14-day prediction', () => {
    const wait = getBuyAdvice(makeItem({ prediction: predictionJson(649, 0.72, { expectedLow: 580 }) }))!;
    expect(wait).toMatchObject({ verdict: 'wait', horizon: 14, pDrop: 0.72, expectedLow: 580, saving: 69, headline: 'Wait' });
    expect(wait.detail).toBe('72% chance it gets at least 5% cheaper within 14 days.');

    const buy = getBuyAdvice(makeItem({ prediction: predictionJson(649, 0.12) }))!;
    expect(buy.verdict).toBe('buy');
    expect(buy.detail).toBe('Only 12% chance of a 5%+ lower price in the next 14 days.');

    const unclear = getBuyAdvice(makeItem({ prediction: predictionJson(649, 0.45) }))!;
    expect(unclear.verdict).toBe('unclear');
    expect(unclear.headline).toBe('Too close to call');
  });

  it('warns that one-off pre-owned items often sell before getting cheaper', () => {
    const advice = getBuyAdvice(makeEbayItem({ prediction: predictionJson(42.5, 0.65, { pGone: 0.4 }) }))!;
    expect(advice.detail).toContain('40% of similar listings sold before getting cheaper');
    // New retail stock doesn't get the warning.
    expect(getBuyAdvice(makeItem({ prediction: predictionJson(649, 0.65, { pGone: 0.4 }) }))!.detail).not.toContain('one-off');
  });
});

describe('recorded-price facts', () => {
  it('places today’s price in its recorded range once there is a week of history', () => {
    expect(pricePosition(makeItem({ current_price: 700, stats: stats(600, 1000) }))).toBe(0.25);
    expect(pricePosition(makeItem({ stats: stats(600, 1000, 3) }))).toBeNull();
    expect(pricePosition(makeItem({ stats: stats(649, 649) }))).toBeNull();
  });

  it('spots a record low', () => {
    expect(isAtRecordLow(makeItem({ current_price: 600, stats: stats(600, 1000) }))).toBe(true);
    expect(isAtRecordLow(makeItem({ current_price: 700, stats: stats(600, 1000) }))).toBe(false);
    expect(isAtRecordLow(makeItem({ current_price: 600, stats: stats(600, 1000, 2) }))).toBe(false);
  });

  it('counts recorded days and the change since tracking started', () => {
    expect(historyDays(dailyHistory([10, 9, 8]))).toBe(3);
    expect(historyDays([{ date: 'x', price: 1 }])).toBe(0);
    expect(priceChangeSinceFirst(dailyHistory([100, 90, 80]))).toMatchObject({ percent: -20 });
    expect(priceChangeSinceFirst(dailyHistory([100]))).toBeNull();
  });

  it('finds the month an item has been cheapest in, from a year of history', () => {
    // 400 days ending on 25 Nov 2026: 1000 normally, 800 in every October.
    const history: PricePoint[] = dailyHistory(Array.from({ length: 400 }, () => 1000)).map((p) =>
      p.date.slice(5, 7) === '10' ? { ...p, price: 800 } : p,
    );
    expect(seasonalInsight(history)).toEqual({ month: 9, below: 0.2, years: 1 });
    expect(seasonalInsight(dailyHistory(Array.from({ length: 100 }, () => 1000)))).toBeNull();
    expect(seasonalInsight(dailyHistory(Array.from({ length: 400 }, () => 1000)))).toBeNull();
  });
});

describe('deal score', () => {
  it('rewards a low price in the item’s own history, a real discount and a buy-now call', () => {
    const atLow = makeItem({ current_price: 600, original_price: 1200, stats: stats(600, 1000), prediction: predictionJson(600, 0.1) });
    const atHigh = makeItem({ current_price: 1000, original_price: 1200, stats: stats(600, 1000), prediction: predictionJson(1000, 0.8) });
    expect(getDealScore(atLow)).toBe(95); // 40 + min(30, 50% × 0.5) + 30
    expect(getDealScore(atHigh)).toBe(9); // 0 + 17% × 0.5 + 0
    // Without history or a prediction it stays neutral rather than guessing.
    expect(getDealScore(makeItem({ original_price: null }))).toBe(30);
  });
});

describe('alert targets and checks', () => {
  it('suggests the model’s typical low when it expects a drop, else 10% off', () => {
    expect(suggestedTarget(makeItem({ prediction: predictionJson(649, 0.7, { expectedLow: 580.75 }) }))).toBe(580);
    expect(suggestedTarget(makeItem())).toBe(584);
    expect(suggestedTarget(makeEbayItem())).toBe(38.25);
  });

  it('triggers only active alerts whose available item is at or below target in the same currency', () => {
    const alert = (id: string, itemId: string, target: number, extra: Partial<PriceAlert> = {}): PriceAlert => ({
      id,
      itemId,
      currency: 'INR',
      targetPrice: target,
      priceAtCreation: 700,
      createdAt: '2026-11-01T00:00:00Z',
      status: 'active',
      acknowledged: true,
      ...extra,
    });
    const items = [
      { id: 'a', currentPrice: 600, currency: 'INR', available: true },
      { id: 'b', currentPrice: 600, currency: 'INR', available: false },
      { id: 'c', currentPrice: 600, currency: 'USD', available: true },
    ];
    const hits = checkAlerts(
      [alert('1', 'a', 650), alert('2', 'a', 500), alert('3', 'b', 650), alert('4', 'c', 650), alert('5', 'a', 650, { status: 'triggered' }), alert('6', 'zz', 650)],
      items,
    );
    expect(hits.map((h) => h.id)).toEqual(['1']);
  });
});
