// ============================================================
// VibeVault – Price Simulation & Prediction Engine (Objective 2)
//
// 1. Market simulation: every listing's price follows a
//    deterministic daily series (per-item demand cycles, mild
//    seasonality and weekday effects, small daily noise). It is
//    stable across launches and moves day to day, which is what
//    lets price alerts trigger.
// 2. Prediction: a damped linear trend fitted on the last two
//    weeks, adjusted by the seasonal and weekday factors relative
//    to the forecast's starting day.
// ============================================================

import { CatalogSeedItem, FashionItem, PriceAlert, PricePoint } from '../types';
import { addDays, dayNumber, parseDateKey, toDateKey } from '../utils/date';
import { hashString, mulberry32, noise01 } from '../utils/random';

export const HISTORY_DAYS = 30;
const REGRESSION_WINDOW = 14;
/** Days over which a detected trend fades out (damped-trend forecasting). */
const TREND_DAMPING_DAYS = 10;

// Thrift demand peaks in spring/autumn (Jan..Dec), and prices dip mid-week (Sun..Sat).
const SEASONAL_FACTORS = [0.95, 0.92, 0.98, 1.05, 1.08, 0.88, 0.85, 0.87, 1.03, 1.1, 1.12, 1.0];
const WEEKDAY_FACTORS = [0.98, 0.96, 0.94, 0.93, 0.97, 1.02, 1.05];
const SEASONAL_STRENGTH = 0.5;
const WEEKDAY_STRENGTH = 0.4;

export function seasonalFactor(date: Date): number {
  return 1 + (SEASONAL_FACTORS[date.getMonth()] - 1) * SEASONAL_STRENGTH;
}

export function weekdayFactor(date: Date): number {
  return 1 + (WEEKDAY_FACTORS[date.getDay()] - 1) * WEEKDAY_STRENGTH;
}

// ---- Market simulation ----

interface MarketParams {
  seed: number;
  longPeriod: number;
  longPhase: number;
  longAmplitude: number;
  shortPeriod: number;
  shortPhase: number;
  shortAmplitude: number;
}

const paramsCache = new Map<string, MarketParams>();

function marketParams(itemId: string): MarketParams {
  const cached = paramsCache.get(itemId);
  if (cached) return cached;
  const seed = hashString(itemId);
  const rand = mulberry32(seed);
  const params: MarketParams = {
    seed,
    longPeriod: 18 + rand() * 24,
    longPhase: rand() * Math.PI * 2,
    longAmplitude: 0.05 + rand() * 0.07,
    shortPeriod: 5 + rand() * 5,
    shortPhase: rand() * Math.PI * 2,
    shortAmplitude: 0.015 + rand() * 0.025,
  };
  paramsCache.set(itemId, params);
  return params;
}

/** Rounds to a retail-looking price ending in .49 or .99. */
function toRetailPrice(value: number): number {
  return Math.max(0.99, Math.round(value * 2) / 2 - 0.01);
}

type PricedSeed = Pick<CatalogSeedItem, 'id' | 'basePrice' | 'originalPrice'>;

/** Simulated listing price on a given calendar date. */
export function simulatedPrice(seed: PricedSeed, date: Date): number {
  const p = marketParams(seed.id);
  const day = dayNumber(date);
  const wave =
    p.longAmplitude * Math.sin((2 * Math.PI * day) / p.longPeriod + p.longPhase) +
    p.shortAmplitude * Math.sin((2 * Math.PI * day) / p.shortPeriod + p.shortPhase);
  const jitter = (noise01(p.seed, day) - 0.5) * 0.03;
  const raw = seed.basePrice * (1 + wave + jitter) * seasonalFactor(date) * weekdayFactor(date);
  const ceiling = seed.originalPrice > 0 ? seed.originalPrice * 0.95 : raw;
  return toRetailPrice(Math.max(seed.basePrice * 0.5, Math.min(raw, ceiling)));
}

/** Daily price history for the `days` days before `asOf`, ending with `asOf` itself. */
export function buildPriceHistory(seed: PricedSeed, asOf: Date, days: number = HISTORY_DAYS): PricePoint[] {
  const history: PricePoint[] = [];
  for (let offset = days; offset >= 0; offset--) {
    const date = addDays(asOf, -offset);
    history.push({ date: toDateKey(date), price: simulatedPrice(seed, date) });
  }
  return history;
}

// ---- Prediction ----

function regressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((sum, v) => sum + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }
  return den === 0 ? 0 : num / den;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Date of the last history point (falls back to today). */
function historyEndDate(history: PricePoint[]): Date {
  const last = history[history.length - 1];
  return (last && parseDateKey(last.date)) || new Date();
}

/**
 * Predict the price `daysAhead` days after the last history point.
 * Returns the latest price for daysAhead <= 0.
 */
export function predictFromHistory(history: PricePoint[], daysAhead: number): number {
  if (history.length === 0) return 0;
  const current = history[history.length - 1].price;
  if (daysAhead <= 0 || history.length < 2) return current;

  const asOf = historyEndDate(history);
  const recent = history.slice(-REGRESSION_WINDOW);
  // De-seasonalise before fitting so the trend isn't polluted by weekday swings.
  const adjusted = recent.map((point) => {
    const date = parseDateKey(point.date) ?? asOf;
    return point.price / (seasonalFactor(date) * weekdayFactor(date));
  });
  const slope = regressionSlope(adjusted);
  const dampedDays = TREND_DAMPING_DAYS * (1 - Math.exp(-daysAhead / TREND_DAMPING_DAYS));

  const target = addDays(asOf, daysAhead);
  const relativeSeason =
    (seasonalFactor(target) * weekdayFactor(target)) / (seasonalFactor(asOf) * weekdayFactor(asOf));
  const currentAdjusted = adjusted[adjusted.length - 1];
  const baseline = (currentAdjusted + slope * dampedDays) * seasonalFactor(asOf) * weekdayFactor(asOf);
  const predicted = baseline * relativeSeason;

  // Keep forecasts within a plausible band around today's price.
  return round2(Math.max(current * 0.5, Math.min(current * 1.25, predicted)));
}

export function predictPrice(item: Pick<FashionItem, 'priceHistory'>, daysAhead: number): number {
  return predictFromHistory(item.priceHistory, daysAhead);
}

/** Forecast for the next `days` days (excluding today). */
export function generateForecast(item: Pick<FashionItem, 'priceHistory'>, days: number = 30): PricePoint[] {
  const asOf = historyEndDate(item.priceHistory);
  const forecast: PricePoint[] = [];
  for (let d = 1; d <= days; d++) {
    forecast.push({ date: toDateKey(addDays(asOf, d)), price: predictFromHistory(item.priceHistory, d) });
  }
  return forecast;
}

/** Expected price range: uncertainty widens with the horizon. */
export function getPredictionConfidence(
  item: Pick<FashionItem, 'priceHistory'>,
  daysAhead: number,
): { low: number; high: number; predicted: number } {
  const predicted = predictPrice(item, daysAhead);
  const uncertainty = 0.03 + daysAhead * 0.004;
  return {
    predicted,
    low: round2(predicted * (1 - uncertainty)),
    high: round2(predicted * (1 + uncertainty)),
  };
}

export interface PurchaseWindow {
  bestDay: number;
  bestPrice: number;
  savings: number;
  savingsPercent: number;
  recommendation: string;
}

/** Share of the maximum predicted saving worth waiting for (earlier is better). */
const NEAR_BEST_SAVINGS = 0.85;

/**
 * Best day to buy within the next 30 days (0 = today): the earliest
 * day that captures most of the lowest predicted price's saving, so
 * users aren't told to wait weeks for an extra few cents.
 */
export function getOptimalPurchaseWindow(item: Pick<FashionItem, 'priceHistory' | 'currentPrice'>): PurchaseWindow {
  const predictions = Array.from({ length: 30 }, (_, i) => predictPrice(item, i + 1));
  const lowest = Math.min(item.currentPrice, ...predictions);
  const maxSaving = item.currentPrice - lowest;

  let bestDay = 0;
  let bestPrice = item.currentPrice;
  if (maxSaving > 0.005) {
    const target = item.currentPrice - maxSaving * NEAR_BEST_SAVINGS;
    const index = predictions.findIndex((p) => p <= target + 1e-9);
    bestDay = index + 1;
    bestPrice = predictions[index];
  }

  const savings = round2(Math.max(0, item.currentPrice - bestPrice));
  const savingsPercent = item.currentPrice > 0 ? Math.round((savings / item.currentPrice) * 100) : 0;

  // Drops under 1% aren't worth waiting for.
  if (bestDay === 0 || savingsPercent < 1) {
    return {
      bestDay: 0,
      bestPrice: item.currentPrice,
      savings: 0,
      savingsPercent: 0,
      recommendation: '🟢 Buy now — this is the lowest predicted price for the next 30 days.',
    };
  }

  let recommendation: string;
  if (bestDay <= 3) {
    recommendation = `⏳ Wait ${bestDay} day${bestDay > 1 ? 's' : ''} — the price is expected to drop by $${savings.toFixed(2)}.`;
  } else if (bestDay <= 7) {
    recommendation = `📊 Consider waiting ~${bestDay} days for about ${savingsPercent}% savings.`;
  } else {
    recommendation = `📈 Lowest price expected in ~${bestDay} days (${savingsPercent}% less) — set an alert to catch it.`;
  }

  return { bestDay, bestPrice, savings, savingsPercent, recommendation };
}

/** Active alerts whose item is now at or below the target price. */
export function checkAlerts(alerts: PriceAlert[], items: Pick<FashionItem, 'id' | 'currentPrice'>[]): PriceAlert[] {
  const prices = new Map(items.map((item) => [item.id, item.currentPrice]));
  return alerts.filter((alert) => {
    if (alert.status !== 'active') return false;
    const price = prices.get(alert.itemId);
    return price !== undefined && price <= alert.targetPrice;
  });
}

/** Deal score (0–100): discount, expected drop, sustainability and condition. */
export function getDealScore(
  item: Pick<FashionItem, 'currentPrice' | 'originalPrice' | 'predictedPrice7d' | 'sustainabilityScore' | 'condition'>,
): number {
  const discount = item.originalPrice > 0 ? Math.max(0, 1 - item.currentPrice / item.originalPrice) : 0;
  const expectedDrop =
    item.currentPrice > 0 ? Math.max(0, (item.currentPrice - item.predictedPrice7d) / item.currentPrice) : 0;
  const sustainBonus = (Math.max(0, Math.min(100, item.sustainabilityScore)) / 100) * 15;
  const conditionBonus =
    item.condition === 'New with tags'
      ? 15
      : item.condition === 'Like new'
        ? 12
        : item.condition === 'Good'
          ? 8
          : item.condition === 'Fair'
            ? 4
            : 2;

  return Math.max(0, Math.min(100, Math.round(discount * 40 + expectedDrop * 30 + sustainBonus + conditionBonus)));
}

/**
 * Backtest: predict each item's price `horizon` days ago and compare
 * with today's actual price. Returns accuracy (100 − MAPE) or null.
 */
export function backtestAccuracy(items: Pick<FashionItem, 'priceHistory'>[], horizon: number = 7): number | null {
  const errors: number[] = [];
  for (const item of items) {
    const history = item.priceHistory;
    if (history.length <= horizon + 2) continue;
    const past = history.slice(0, history.length - horizon);
    const actual = history[history.length - 1].price;
    if (actual <= 0) continue;
    errors.push(Math.abs(predictFromHistory(past, horizon) - actual) / actual);
  }
  if (errors.length === 0) return null;
  const mape = errors.reduce((sum, e) => sum + e, 0) / errors.length;
  return Math.max(0, Math.round((1 - mape) * 100));
}
