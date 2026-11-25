import { buildCatalog } from '../services/catalog';
import {
  backtestAccuracy,
  checkAlerts,
  generateForecast,
  getDealScore,
  getOptimalPurchaseWindow,
  getPredictionConfidence,
  predictFromHistory,
} from '../services/priceEngine';
import { FashionItem, PriceAlert, PricePoint } from '../types';
import { addDays, toDateKey } from '../utils/date';

const NOW = new Date(2026, 10, 25, 10, 0);
const catalog = buildCatalog(NOW);

function flatHistory(price: number, days = 30, end = NOW): PricePoint[] {
  return Array.from({ length: days + 1 }, (_, i) => ({ date: toDateKey(addDays(end, i - days)), price }));
}

describe('predictFromHistory', () => {
  it('returns the latest price for today and for empty/short histories', () => {
    const item = catalog[0];
    expect(predictFromHistory(item.priceHistory, 0)).toBe(item.currentPrice);
    expect(predictFromHistory([], 7)).toBe(0);
    expect(predictFromHistory([{ date: '2026-11-25', price: 10 }], 7)).toBe(10);
  });

  it('keeps forecasts within 50%–125% of the current price', () => {
    for (const item of catalog) {
      for (const d of [1, 7, 14, 30, 90]) {
        const p = predictFromHistory(item.priceHistory, d);
        expect(p).toBeGreaterThanOrEqual(item.currentPrice * 0.5 - 0.01);
        expect(p).toBeLessThanOrEqual(item.currentPrice * 1.25 + 0.01);
      }
    }
  });

  it('follows a clear downward trend and stays near flat prices', () => {
    const falling = Array.from({ length: 31 }, (_, i) => ({ date: toDateKey(addDays(NOW, i - 30)), price: 60 - i }));
    expect(predictFromHistory(falling, 7)).toBeLessThan(30);
    const flat = predictFromHistory(flatHistory(20), 7);
    expect(flat).toBeGreaterThan(18);
    expect(flat).toBeLessThan(22);
  });

  it('matches the item’s stored 7- and 30-day predictions (single source of truth)', () => {
    for (const item of catalog) {
      expect(predictFromHistory(item.priceHistory, 7)).toBe(item.predictedPrice7d);
      expect(getPredictionConfidence(item, 30).predicted).toBe(item.predictedPrice30d);
    }
  });
});

describe('forecast & confidence', () => {
  it('generates consecutive future days', () => {
    const item = catalog[3];
    const forecast = generateForecast(item, 30);
    expect(forecast).toHaveLength(30);
    expect(forecast[0].date).toBe(toDateKey(addDays(NOW, 1)));
    expect(forecast[29].date).toBe(toDateKey(addDays(NOW, 30)));
  });

  it('widens the expected range with the horizon', () => {
    const item = catalog[5];
    const near = getPredictionConfidence(item, 7);
    const far = getPredictionConfidence(item, 30);
    expect(near.low).toBeLessThanOrEqual(near.predicted);
    expect(near.high).toBeGreaterThanOrEqual(near.predicted);
    expect((far.high - far.low) / far.predicted).toBeGreaterThan((near.high - near.low) / near.predicted);
  });
});

describe('getOptimalPurchaseWindow', () => {
  it('never recommends paying more than today and reports consistent savings', () => {
    for (const item of catalog) {
      const w = getOptimalPurchaseWindow(item);
      expect(w.bestPrice).toBeLessThanOrEqual(item.currentPrice);
      expect(w.savings).toBeCloseTo(Math.max(0, item.currentPrice - w.bestPrice), 2);
      expect(w.bestDay).toBeGreaterThanOrEqual(0);
      expect(w.bestDay).toBeLessThanOrEqual(30);
      if (w.bestDay === 0) {
        expect(w.savings).toBe(0);
        expect(w.recommendation).toMatch(/Buy now/);
      }
    }
  });

  it('recommends the earliest day that captures most of the possible saving', () => {
    const falling = Array.from({ length: 31 }, (_, i) => ({ date: toDateKey(addDays(NOW, i - 30)), price: 80 - i }));
    const item = { priceHistory: falling, currentPrice: 50 } as Pick<FashionItem, 'priceHistory' | 'currentPrice'>;
    const w = getOptimalPurchaseWindow(item);
    const lowest = Math.min(...Array.from({ length: 30 }, (_, d) => predictFromHistory(falling, d + 1)));
    expect(w.bestDay).toBeGreaterThan(0);
    expect(w.bestDay).toBeLessThan(30);
    expect(w.savings).toBeGreaterThanOrEqual((50 - lowest) * 0.85 - 0.01);
  });

  it('says buy now when prices are expected to rise', () => {
    const rising = Array.from({ length: 31 }, (_, i) => ({ date: toDateKey(addDays(NOW, i - 30)), price: 20 + i }));
    const item = { priceHistory: rising, currentPrice: 50 } as Pick<FashionItem, 'priceHistory' | 'currentPrice'>;
    expect(getOptimalPurchaseWindow(item).bestDay).toBe(0);
  });
});

describe('getDealScore', () => {
  it('stays within 0–100 for every listing', () => {
    for (const item of catalog) {
      const score = getDealScore(item);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('handles zero/odd prices without NaN', () => {
    const base = catalog[0];
    expect(Number.isNaN(getDealScore({ ...base, originalPrice: 0 }))).toBe(false);
    expect(Number.isNaN(getDealScore({ ...base, currentPrice: 0 }))).toBe(false);
  });

  it('rewards bigger discounts', () => {
    const base = catalog[0];
    expect(getDealScore({ ...base, currentPrice: base.originalPrice * 0.2 })).toBeGreaterThan(
      getDealScore({ ...base, currentPrice: base.originalPrice * 0.9 }),
    );
  });
});

describe('checkAlerts', () => {
  const alert = (id: string, itemId: string, targetPrice: number, status: PriceAlert['status'] = 'active'): PriceAlert => ({
    id,
    itemId,
    targetPrice,
    priceAtCreation: 100,
    createdAt: NOW.toISOString(),
    status,
    acknowledged: true,
  });

  it('returns only active alerts whose item is at or below target', () => {
    const items = [
      { id: 'a', currentPrice: 10 },
      { id: 'b', currentPrice: 30 },
    ];
    const hits = checkAlerts(
      [alert('1', 'a', 10), alert('2', 'b', 20), alert('3', 'a', 15, 'triggered'), alert('4', 'missing', 99)],
      items,
    );
    expect(hits.map((h) => h.id)).toEqual(['1']);
  });
});

describe('backtestAccuracy', () => {
  it('reports an honest, bounded accuracy', () => {
    const accuracy = backtestAccuracy(catalog, 7);
    expect(accuracy).not.toBeNull();
    expect(accuracy!).toBeGreaterThanOrEqual(70);
    expect(accuracy!).toBeLessThanOrEqual(100);
    expect(backtestAccuracy([], 7)).toBeNull();
    // A flat series is near-perfectly predictable (the model still applies weekday priors).
    expect(backtestAccuracy([{ priceHistory: flatHistory(10) }], 7)).toBeGreaterThanOrEqual(95);
  });
});
