import {
  backtestAccuracy,
  checkAlerts,
  generateForecast,
  getDealScore,
  getOptimalPurchaseWindow,
  getPredictionRange,
  hasForecast,
  historyDays,
  MIN_HISTORY_POINTS,
  predictFromHistory,
  priceChangeSinceFirst,
} from '../services/priceEngine';
import { FashionItem, PriceAlert } from '../types';
import { addDays, toDateKey } from '../utils/date';
import { dailyHistory, makeEbayItem, makeItem, NOW } from './helpers/fixtures';

const flat = (price: number, days = 30) => dailyHistory(Array.from({ length: days }, () => price));
const falling = (from: number, days = 30, step = 1) => dailyHistory(Array.from({ length: days }, (_, i) => from - i * step));
const rising = (from: number, days = 30, step = 1) => dailyHistory(Array.from({ length: days }, (_, i) => from + i * step));

describe('history requirements', () => {
  it('needs at least a week of recorded days before forecasting', () => {
    expect(MIN_HISTORY_POINTS).toBe(7);
    expect(hasForecast(flat(100, 6))).toBe(false);
    expect(hasForecast(flat(100, 7))).toBe(true);
    expect(predictFromHistory(flat(100, 6), 7)).toBeNull();
    expect(predictFromHistory([], 7)).toBeNull();
  });

  it('needs the points to span at least six days', () => {
    // Seven points crammed into three days (duplicates) are not a week of data.
    const crammed = [0, 0, 1, 1, 2, 2, 3].map((d, i) => ({ date: toDateKey(addDays(NOW, d - 3)), price: 100 + i }));
    expect(hasForecast(crammed)).toBe(false);
  });

  it('counts recorded days and ignores invalid points', () => {
    expect(historyDays(flat(10, 12))).toBe(12);
    expect(historyDays([{ date: 'nope', price: 10 }, { date: '2026-11-25', price: 0 }])).toBe(0);
  });
});

describe('predictFromHistory', () => {
  it('returns the latest recorded price for day 0', () => {
    expect(predictFromHistory(falling(100), 0)).toBe(71);
  });

  it('follows a clear downward trend (damped) and stays near flat prices', () => {
    const p7 = predictFromHistory(falling(100), 7)!;
    expect(p7).toBeLessThan(71);
    expect(p7).toBeGreaterThan(71 - 7); // damped: less than the raw slope × 7
    const flat7 = predictFromHistory(flat(20), 7)!;
    expect(flat7).toBeCloseTo(20, 1);
  });

  it('keeps forecasts within 50%–125% of the latest price', () => {
    for (const d of [1, 7, 30, 365]) {
      expect(predictFromHistory(falling(100, 30, 3), d)!).toBeGreaterThanOrEqual(13 * 0.5 - 0.01);
      expect(predictFromHistory(rising(10, 30, 3), d)!).toBeLessThanOrEqual(97 * 1.25 + 0.01);
    }
  });

  it('matches the item’s stored predictions (single source of truth)', () => {
    const item = makeItem({ price_history: falling(900, 14, 10), current_price: 770 });
    expect(item.predictedPrice7d).toBe(predictFromHistory(item.priceHistory, 7));
    expect(getPredictionRange(item, 30)?.predicted).toBe(item.predictedPrice30d);
  });
});

describe('forecast & range', () => {
  it('generates consecutive days after the latest record', () => {
    const forecast = generateForecast({ priceHistory: falling(100) }, 30);
    expect(forecast).toHaveLength(30);
    expect(forecast[0].date).toBe(toDateKey(addDays(NOW, 1)));
    expect(forecast[29].date).toBe(toDateKey(addDays(NOW, 30)));
  });

  it('is empty without enough history', () => {
    expect(generateForecast({ priceHistory: flat(100, 3) }, 30)).toEqual([]);
    expect(getPredictionRange({ priceHistory: flat(100, 3) }, 7)).toBeNull();
  });

  it('widens the likely range with the horizon', () => {
    const noisy = dailyHistory([100, 96, 99, 93, 95, 90, 92, 88, 91, 86, 87, 84, 85, 80]);
    const near = getPredictionRange({ priceHistory: noisy }, 7)!;
    const far = getPredictionRange({ priceHistory: noisy }, 30)!;
    expect(near.low).toBeLessThanOrEqual(near.predicted);
    expect(near.high).toBeGreaterThanOrEqual(near.predicted);
    expect(far.high - far.low).toBeGreaterThan(near.high - near.low);
  });
});

describe('getOptimalPurchaseWindow', () => {
  it('explains that it is still collecting data', () => {
    const w = getOptimalPurchaseWindow({ priceHistory: flat(500, 3), currentPrice: 500 });
    expect(w.hasForecast).toBe(false);
    expect(w.bestDay).toBe(0);
    expect(w.savings).toBe(0);
    expect(w.recommendation).toMatch(/4 more days/);
  });

  it('recommends the earliest day that captures most of the possible saving', () => {
    const history = falling(80, 31);
    const current = history[history.length - 1].price;
    const w = getOptimalPurchaseWindow({ priceHistory: history, currentPrice: current });
    const lowest = Math.min(...Array.from({ length: 30 }, (_, d) => predictFromHistory(history, d + 1)!));
    expect(w.hasForecast).toBe(true);
    expect(w.bestDay).toBeGreaterThan(0);
    expect(w.bestDay).toBeLessThan(30);
    expect(w.bestPrice).toBeLessThan(current);
    expect(w.savings).toBeCloseTo(current - w.bestPrice, 2);
    expect(w.savings).toBeGreaterThanOrEqual((current - lowest) * 0.85 - 0.01);
  });

  it('says buy now when prices are rising or flat', () => {
    for (const history of [rising(20), flat(50)]) {
      const w = getOptimalPurchaseWindow({ priceHistory: history, currentPrice: history[history.length - 1].price });
      expect(w.bestDay).toBe(0);
      expect(w.recommendation).toMatch(/Buy now/);
    }
  });
});

describe('priceChangeSinceFirst', () => {
  it('reports the change since tracking started', () => {
    expect(priceChangeSinceFirst(dailyHistory([1000, 900, 800]))).toEqual({ percent: -20, since: toDateKey(addDays(NOW, -2)) });
    expect(priceChangeSinceFirst(dailyHistory([1000]))).toBeNull();
  });
});

describe('getDealScore', () => {
  it('stays within 0–100 and handles missing or odd prices', () => {
    const base = makeItem();
    for (const item of [base, makeEbayItem(), { ...base, originalPrice: 0 }, { ...base, currentPrice: 0 }, { ...base, originalPrice: null }]) {
      const score = getDealScore(item);
      expect(Number.isNaN(score)).toBe(false);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('rewards bigger discounts and expected drops', () => {
    const base = makeItem();
    expect(getDealScore({ ...base, currentPrice: 260 })).toBeGreaterThan(getDealScore({ ...base, currentPrice: 1200 }));
    expect(getDealScore({ ...base, predictedPrice7d: 500 })).toBeGreaterThan(getDealScore({ ...base, predictedPrice7d: null }));
  });
});

describe('checkAlerts', () => {
  const alert = (id: string, itemId: string, targetPrice: number, extra: Partial<PriceAlert> = {}): PriceAlert => ({
    id,
    itemId,
    currency: 'INR',
    targetPrice,
    priceAtCreation: 100,
    createdAt: NOW.toISOString(),
    status: 'active',
    acknowledged: true,
    ...extra,
  });
  type AlertItem = Pick<FashionItem, 'id' | 'currentPrice' | 'currency' | 'available'>;
  const items: AlertItem[] = [
    { id: 'a', currentPrice: 10, currency: 'INR', available: true },
    { id: 'b', currentPrice: 30, currency: 'INR', available: true },
    { id: 'c', currentPrice: 5, currency: 'INR', available: false },
    { id: 'd', currentPrice: 5, currency: 'USD', available: true },
  ];

  it('returns active alerts whose available item is at or below target in the same currency', () => {
    const hits = checkAlerts(
      [
        alert('1', 'a', 10),
        alert('2', 'b', 20),
        alert('3', 'a', 15, { status: 'triggered' }),
        alert('4', 'missing', 99),
        alert('5', 'c', 10), // sold out
        alert('6', 'd', 10), // currency changed since the alert was set
      ],
      items,
    );
    expect(hits.map((h) => h.id)).toEqual(['1']);
  });
});

describe('backtestAccuracy', () => {
  it('needs at least three items with enough history', () => {
    expect(backtestAccuracy([], 7)).toBeNull();
    expect(backtestAccuracy([{ priceHistory: flat(10, 20) }, { priceHistory: flat(20, 20) }], 7)).toBeNull();
  });

  it('is near-perfect on steady series and bounded on noisy ones', () => {
    expect(backtestAccuracy([{ priceHistory: flat(10, 20) }, { priceHistory: flat(20, 20) }, { priceHistory: falling(100, 20) }], 7)).toBeGreaterThanOrEqual(95);
    const noisy = [100, 140, 90, 150, 80, 160, 70, 170, 95, 130, 85, 145, 90, 150, 100, 120, 60, 180, 100, 110];
    const accuracy = backtestAccuracy([{ priceHistory: dailyHistory(noisy) }, { priceHistory: flat(10, 20) }, { priceHistory: flat(20, 20) }], 7)!;
    expect(accuracy).toBeGreaterThanOrEqual(0);
    expect(accuracy).toBeLessThanOrEqual(100);
  });
});
