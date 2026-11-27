// ============================================================
// VibeVault – Price analysis (Objective 2: when to buy)
//
// Everything here works on prices actually recorded from the
// marketplaces and on the backend model's published predictions,
// which are learnt from what really happened to tracked prices and
// scored afterwards (see supabase/migrations). Nothing is simulated.
// ============================================================

import { FashionItem, HorizonPrediction, PredictionHorizon, PriceAlert, PricePoint, Verdict } from '../types';
import { parseDateKey } from '../utils/date';
import { percentOff } from '../utils/format';

/** The horizon the app's headline advice is based on. */
export const MAIN_HORIZON: PredictionHorizon = 14;
/** A "drop" in the model is at least this much below today's price. */
export const DROP_THRESHOLD = 0.05;
/** Days of history needed before the app compares today's price with the item's own history. */
export const MIN_HISTORY_DAYS = 7;

/** Number of distinct recorded days. */
export function historyDays(history: PricePoint[]): number {
  return new Set(history.filter((p) => p.price > 0 && parseDateKey(p.date)).map((p) => p.date)).size;
}

/** Price change since tracking started (from recorded history). */
export function priceChangeSinceFirst(history: PricePoint[]): { percent: number; since: string } | null {
  const pts = history.filter((p) => p.price > 0);
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  return { percent: Math.round(((last.price - first.price) / first.price) * 100), since: first.date };
}

export function predictionFor(
  item: Pick<FashionItem, 'prediction'>,
  horizon: PredictionHorizon = MAIN_HORIZON,
): HorizonPrediction | null {
  return item.prediction?.horizons[horizon] ?? null;
}

export interface BuyAdvice {
  verdict: Verdict;
  horizon: PredictionHorizon;
  /** Chance of a 5%+ lower price within the horizon (while still for sale). */
  pDrop: number;
  /** Chance it sells out or is removed before getting cheaper. */
  pGone: number;
  /** Typical lowest price over the horizon. */
  expectedLow: number;
  /** Expected saving from waiting (current − typical low), never negative. */
  saving: number;
  headline: string;
  detail: string;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

/** Headline "buy now / wait" advice from the model, or null while it is still learning. */
export function getBuyAdvice(item: Pick<FashionItem, 'prediction' | 'currentPrice' | 'secondhand'>): BuyAdvice | null {
  const p = predictionFor(item);
  if (!p) return null;
  const saving = Math.max(0, Math.round((item.currentPrice - p.expectedLow) * 100) / 100);
  const days = MAIN_HORIZON;
  const sellsOut = item.secondhand && p.pGone >= 0.25 ? ` It's a one-off — ${pct(p.pGone)} of similar listings sold before getting cheaper.` : '';
  switch (p.verdict) {
    case 'buy':
      return {
        verdict: 'buy',
        horizon: days,
        pDrop: p.pDrop,
        pGone: p.pGone,
        expectedLow: p.expectedLow,
        saving,
        headline: 'Buy now',
        detail: `Only ${pct(p.pDrop)} chance of a 5%+ lower price in the next ${days} days.${sellsOut}`,
      };
    case 'wait':
      return {
        verdict: 'wait',
        horizon: days,
        pDrop: p.pDrop,
        pGone: p.pGone,
        expectedLow: p.expectedLow,
        saving,
        headline: 'Wait',
        detail: `${pct(p.pDrop)} chance it gets at least 5% cheaper within ${days} days.${sellsOut}`,
      };
    default:
      return {
        verdict: 'unclear',
        horizon: days,
        pDrop: p.pDrop,
        pGone: p.pGone,
        expectedLow: p.expectedLow,
        saving,
        headline: 'Too close to call',
        detail: `${pct(p.pDrop)} chance of a 5%+ drop within ${days} days — set a price alert instead of guessing.${sellsOut}`,
      };
  }
}

/** Where today's price sits in the item's recorded range: 0 = lowest ever, 1 = highest. */
export function pricePosition(item: Pick<FashionItem, 'stats' | 'currentPrice'>): number | null {
  const s = item.stats;
  if (!s || s.days < MIN_HISTORY_DAYS || s.highest <= s.lowest) return null;
  return Math.max(0, Math.min(1, (item.currentPrice - s.lowest) / (s.highest - s.lowest)));
}

/** True when today's price is the lowest VibeVault has recorded for the listing (with enough history). */
export function isAtRecordLow(item: Pick<FashionItem, 'stats' | 'currentPrice'>): boolean {
  const s = item.stats;
  return !!s && s.days >= MIN_HISTORY_DAYS && item.currentPrice <= s.lowest + 0.005;
}

export interface SeasonalInsight {
  /** 0 = January. */
  month: number;
  /** How much lower that month's prices were than the item's typical price (0.18 = 18%). */
  below: number;
  years: number;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * The calendar month when this item has been cheapest, from at least ~11 months of recorded or
 * archived history; null when there isn't enough history or no month stands out (≥ 5% below).
 */
export function seasonalInsight(history: PricePoint[]): SeasonalInsight | null {
  const pts = history.filter((p) => p.price > 0 && parseDateKey(p.date));
  if (pts.length < 200) return null;
  const spanDays = (Date.parse(pts[pts.length - 1].date) - Date.parse(pts[0].date)) / 86_400_000;
  if (spanDays < 330) return null;
  const typical = median(pts.map((p) => p.price));
  const byMonth = new Map<number, number[]>();
  for (const p of pts) {
    const month = Number(p.date.slice(5, 7)) - 1;
    byMonth.set(month, [...(byMonth.get(month) ?? []), p.price]);
  }
  let best: { month: number; below: number } | null = null;
  for (const [month, prices] of byMonth) {
    if (prices.length < 10) continue;
    const below = 1 - median(prices) / typical;
    if (!best || below > best.below) best = { month, below };
  }
  if (!best || best.below < DROP_THRESHOLD) return null;
  return { ...best, below: Math.round(best.below * 100) / 100, years: Math.max(1, Math.round(spanDays / 365)) };
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

/**
 * Deal score (0–100): how good buying now is, from real data only —
 *   • where today's price sits in the item's own recorded history (up to 40),
 *   • the discount against the marketplace's list price / MRP (up to 30),
 *   • the model's advice (buy now 30, too close to call 15, wait 0; 15 while it's learning).
 */
export function getDealScore(item: Pick<FashionItem, 'currentPrice' | 'originalPrice' | 'stats' | 'prediction' | 'secondhand'>): number {
  const position = pricePosition(item);
  const history = position === null ? 15 : (1 - position) * 40;
  const discount = Math.min(30, percentOff(item.currentPrice, item.originalPrice) * 0.5);
  const advice = getBuyAdvice(item);
  const model = !advice ? 15 : advice.verdict === 'buy' ? 30 : advice.verdict === 'unclear' ? 15 : 0;
  return Math.max(0, Math.min(100, Math.round(history + discount + model)));
}

/** Suggested alert target: the model's typical low if waiting, else 10% below today's price. */
export function suggestedTarget(item: Pick<FashionItem, 'currentPrice' | 'prediction' | 'currency'>): number {
  const p = predictionFor(item);
  const raw = p && p.expectedLow < item.currentPrice ? p.expectedLow : item.currentPrice * 0.9;
  const decimals = ['JPY', 'KRW', 'INR', 'CLP', 'VND', 'IDR', 'HUF', 'COP', 'TWD'].includes(item.currency) ? 0 : 2;
  const factor = 10 ** decimals;
  return Math.max(1 / factor, Math.floor(raw * factor) / factor);
}
