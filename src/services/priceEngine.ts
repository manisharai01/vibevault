// ============================================================
// VibeVault – Price analysis (Objective 2)
//
// Works only on prices actually recorded from the marketplaces
// (one per day, by the backend). Forecasts use a damped linear trend
// fitted to the recorded history and are shown only once enough
// history exists; nothing is simulated.
// ============================================================

import { FashionItem, PriceAlert, PricePoint } from '../types';
import { addDays, dayNumber, parseDateKey, toDateKey } from '../utils/date';

/** Minimum recorded days before any forecast is shown. */
export const MIN_HISTORY_POINTS = 7;
const MIN_HISTORY_SPAN_DAYS = 6;
const REGRESSION_WINDOW_DAYS = 21;
/** Days over which a detected trend fades out (damped-trend forecasting). */
const TREND_DAMPING_DAYS = 10;

interface Sample {
  x: number; // day number
  y: number; // price
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function samples(history: PricePoint[]): Sample[] {
  const points: Sample[] = [];
  for (const p of history) {
    const date = parseDateKey(p.date);
    if (date && Number.isFinite(p.price) && p.price > 0) points.push({ x: dayNumber(date), y: p.price });
  }
  return points.sort((a, b) => a.x - b.x);
}

interface Fit {
  slope: number;
  intercept: number;
  residualStd: number;
  n: number;
  lastX: number;
  lastY: number;
}

function fit(history: PricePoint[]): Fit | null {
  const all = samples(history);
  if (all.length < MIN_HISTORY_POINTS) return null;
  const lastX = all[all.length - 1].x;
  if (lastX - all[0].x < MIN_HISTORY_SPAN_DAYS) return null;
  const pts = all.filter((p) => p.x > lastX - REGRESSION_WINDOW_DAYS);
  const n = pts.length;
  if (n < MIN_HISTORY_POINTS) return null;
  const xMean = pts.reduce((s, p) => s + p.x, 0) / n;
  const yMean = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of pts) {
    sxy += (p.x - xMean) * (p.y - yMean);
    sxx += (p.x - xMean) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = yMean - slope * xMean;
  const sse = pts.reduce((s, p) => s + (p.y - (intercept + slope * p.x)) ** 2, 0);
  return {
    slope,
    intercept,
    residualStd: n > 2 ? Math.sqrt(sse / (n - 2)) : 0,
    n,
    lastX,
    lastY: all[all.length - 1].y,
  };
}

/** Number of distinct recorded days. */
export function historyDays(history: PricePoint[]): number {
  return samples(history).length;
}

export function hasForecast(history: PricePoint[]): boolean {
  return fit(history) !== null;
}

/**
 * Forecast `daysAhead` days after the latest recorded price, or null when
 * there isn't enough recorded history yet.
 */
export function predictFromHistory(history: PricePoint[], daysAhead: number): number | null {
  const f = fit(history);
  if (!f) return null;
  if (daysAhead <= 0) return f.lastY;
  const dampedDays = TREND_DAMPING_DAYS * (1 - Math.exp(-daysAhead / TREND_DAMPING_DAYS));
  const predicted = f.lastY + f.slope * dampedDays;
  return round2(Math.max(f.lastY * 0.5, Math.min(f.lastY * 1.25, predicted)));
}

/** Daily forecast for the `days` days after the latest recorded price (empty without enough history). */
export function generateForecast(item: Pick<FashionItem, 'priceHistory'>, days: number = 30): PricePoint[] {
  const last = item.priceHistory[item.priceHistory.length - 1];
  const start = last ? parseDateKey(last.date) : null;
  if (!start || !hasForecast(item.priceHistory)) return [];
  const out: PricePoint[] = [];
  for (let d = 1; d <= days; d++) {
    const price = predictFromHistory(item.priceHistory, d);
    if (price !== null) out.push({ date: toDateKey(addDays(start, d)), price });
  }
  return out;
}

/** ~95% range from the scatter of recorded prices around the trend; widens with the horizon. */
export function getPredictionRange(
  item: Pick<FashionItem, 'priceHistory'>,
  daysAhead: number,
): { predicted: number; low: number; high: number } | null {
  const f = fit(item.priceHistory);
  const predicted = predictFromHistory(item.priceHistory, daysAhead);
  if (!f || predicted === null) return null;
  const spread = Math.max(1.96 * f.residualStd * Math.sqrt(1 + daysAhead / f.n), predicted * 0.01);
  return { predicted, low: round2(Math.max(0, predicted - spread)), high: round2(predicted + spread) };
}

export interface PurchaseWindow {
  hasForecast: boolean;
  bestDay: number;
  bestPrice: number;
  savings: number;
  savingsPercent: number;
  recommendation: string;
}

/** Share of the maximum predicted saving worth waiting for (earlier is better). */
const NEAR_BEST_SAVINGS = 0.85;

/** Earliest day in the next 30 that captures most of the predicted saving (0 = buy now). */
export function getOptimalPurchaseWindow(item: Pick<FashionItem, 'priceHistory' | 'currentPrice'>): PurchaseWindow {
  const days = historyDays(item.priceHistory);
  if (!hasForecast(item.priceHistory)) {
    const remaining = Math.max(1, MIN_HISTORY_POINTS - days);
    return {
      hasForecast: false,
      bestDay: 0,
      bestPrice: item.currentPrice,
      savings: 0,
      savingsPercent: 0,
      recommendation: `📊 Tracking this price — a forecast appears after ${remaining} more day${remaining === 1 ? '' : 's'} of data.`,
    };
  }

  const predictions = Array.from({ length: 30 }, (_, i) => predictFromHistory(item.priceHistory, i + 1) ?? item.currentPrice);
  const lowest = Math.min(item.currentPrice, ...predictions);
  const maxSaving = item.currentPrice - lowest;
  const buyNow: PurchaseWindow = {
    hasForecast: true,
    bestDay: 0,
    bestPrice: item.currentPrice,
    savings: 0,
    savingsPercent: 0,
    recommendation: '🟢 Buy now — the recorded trend doesn’t point to a lower price in the next 30 days.',
  };
  if (!(maxSaving > 0.005)) return buyNow;

  const target = item.currentPrice - maxSaving * NEAR_BEST_SAVINGS;
  const index = predictions.findIndex((p) => p <= target + 1e-9);
  const bestDay = index + 1;
  const bestPrice = predictions[index];
  const savings = round2(item.currentPrice - bestPrice);
  const savingsPercent = item.currentPrice > 0 ? Math.round((savings / item.currentPrice) * 100) : 0;
  if (savingsPercent < 1) return buyNow;

  const recommendation =
    bestDay <= 7
      ? `⏳ Prices have been falling — waiting ~${bestDay} day${bestDay > 1 ? 's' : ''} could save about ${savingsPercent}%.`
      : `📈 Downward trend — about ${savingsPercent}% lower is possible in ~${bestDay} days. Set an alert to catch it.`;
  return { hasForecast: true, bestDay, bestPrice, savings, savingsPercent, recommendation };
}

/** Price change since tracking started (from recorded history). */
export function priceChangeSinceFirst(history: PricePoint[]): { percent: number; since: string } | null {
  const pts = history.filter((p) => p.price > 0);
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  return { percent: Math.round(((last.price - first.price) / first.price) * 100), since: first.date };
}

/** Active alerts whose item is available at or below the target price. */
export function checkAlerts(
  alerts: PriceAlert[],
  items: Pick<FashionItem, 'id' | 'currentPrice' | 'currency' | 'available'>[],
): PriceAlert[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return alerts.filter((alert) => {
    if (alert.status !== 'active') return false;
    const item = byId.get(alert.itemId);
    return !!item && item.available && item.currency === alert.currency && item.currentPrice <= alert.targetPrice;
  });
}

/** Deal score (0–100): discount vs retail, expected drop, sustainability and condition. */
export function getDealScore(
  item: Pick<FashionItem, 'currentPrice' | 'originalPrice' | 'predictedPrice7d' | 'sustainabilityScore' | 'condition'>,
): number {
  const discount =
    item.originalPrice !== null && item.originalPrice > 0 ? Math.max(0, 1 - item.currentPrice / item.originalPrice) : 0;
  const expectedDrop =
    item.predictedPrice7d !== null && item.currentPrice > 0
      ? Math.max(0, (item.currentPrice - item.predictedPrice7d) / item.currentPrice)
      : 0;
  const sustainBonus = (Math.max(0, Math.min(100, item.sustainabilityScore)) / 100) * 15;
  const conditionBonus =
    item.condition === 'New with tags' ? 15 : item.condition === 'Like new' ? 12 : item.condition === 'Good' ? 8 : item.condition === 'Fair' ? 4 : 2;
  return Math.max(0, Math.min(100, Math.round(discount * 40 + expectedDrop * 30 + sustainBonus + conditionBonus)));
}

/**
 * Backtest on recorded prices: forecast each item's price `horizon` days
 * before its latest record and compare with what was actually recorded.
 * Returns accuracy (100 − mean absolute % error), or null without enough history.
 */
export function backtestAccuracy(items: Pick<FashionItem, 'priceHistory'>[], horizon: number = 7): number | null {
  const errors: number[] = [];
  for (const item of items) {
    const pts = samples(item.priceHistory);
    if (pts.length === 0) continue;
    const lastX = pts[pts.length - 1].x;
    const past = item.priceHistory.filter((p) => {
      const d = parseDateKey(p.date);
      return d !== null && dayNumber(d) <= lastX - horizon;
    });
    const pastPts = samples(past);
    if (pastPts.length === 0) continue;
    const predicted = predictFromHistory(past, lastX - pastPts[pastPts.length - 1].x);
    const actual = pts[pts.length - 1].y;
    if (predicted !== null && actual > 0) errors.push(Math.abs(predicted - actual) / actual);
  }
  if (errors.length < 3) return null;
  const mape = errors.reduce((sum, e) => sum + e, 0) / errors.length;
  return Math.max(0, Math.round((1 - mape) * 100));
}
