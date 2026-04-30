// ============================================================
// VibeVault – Price Prediction Service (Objective 2)
//
// Simulates a predictive pricing engine that analyzes
// historical price data, seasonal trends, and market demand
// to forecast optimal purchase windows.
// ============================================================

import { FashionItem, PricePoint, PriceAlert } from '../types';

/** Seasonal multiplier based on month */
function getSeasonalFactor(month: number): number {
  // Thrift demand peaks in spring/fall
  const factors = [0.95, 0.92, 0.98, 1.05, 1.08, 0.88, 0.85, 0.87, 1.03, 1.1, 1.12, 1.0];
  return factors[month] || 1;
}

/** Day-of-week effect (prices drop mid-week) */
function getDayOfWeekFactor(day: number): number {
  const factors = [0.98, 0.96, 0.94, 0.93, 0.97, 1.02, 1.05]; // Sun=0
  return factors[day] || 1;
}

/**
 * Predict price for N days ahead using trend decomposition.
 * Combines: linear trend + seasonal + day-of-week + noise
 */
export function predictPrice(item: FashionItem, daysAhead: number): number {
  const history = item.priceHistory;
  if (history.length < 2) return item.currentPrice;

  // Compute linear trend from recent history
  const recent = history.slice(-14);
  const n = recent.length;
  const xMean = (n - 1) / 2;
  const yMean = recent.reduce((s, p) => s + p.price, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (recent[i].price - yMean);
    den += (i - xMean) * (i - xMean);
  }
  const slope = den === 0 ? 0 : num / den;

  // Project forward
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysAhead);

  const basePrediction = item.currentPrice + slope * daysAhead;
  const seasonal = getSeasonalFactor(targetDate.getMonth());
  const dayEffect = getDayOfWeekFactor(targetDate.getDay());

  const predicted = basePrediction * seasonal * dayEffect;

  // Clamp to reasonable bounds (30%–110% of current price)
  return Math.round(Math.max(item.currentPrice * 0.3, Math.min(item.currentPrice * 1.1, predicted)) * 100) / 100;
}

/**
 * Generate forecast array for chart display
 */
export function generateForecast(item: FashionItem, days: number = 30): PricePoint[] {
  const forecast: PricePoint[] = [];
  for (let d = 1; d <= days; d++) {
    const date = new Date();
    date.setDate(date.getDate() + d);
    forecast.push({
      date: date.toISOString().split('T')[0],
      price: predictPrice(item, d),
    });
  }
  return forecast;
}

/**
 * Compute confidence interval for prediction
 */
export function getPredictionConfidence(item: FashionItem, daysAhead: number): { low: number; high: number; predicted: number } {
  const predicted = predictPrice(item, daysAhead);
  // Wider confidence interval for further predictions
  const uncertainty = 0.05 + daysAhead * 0.005;
  return {
    predicted,
    low: Math.round(predicted * (1 - uncertainty) * 100) / 100,
    high: Math.round(predicted * (1 + uncertainty) * 100) / 100,
  };
}

/**
 * Determine optimal purchase timing within next 30 days
 */
export function getOptimalPurchaseWindow(item: FashionItem): {
  bestDay: number;
  bestPrice: number;
  savings: number;
  savingsPercent: number;
  recommendation: string;
} {
  let bestDay = 0;
  let bestPrice = item.currentPrice;

  for (let d = 1; d <= 30; d++) {
    const predicted = predictPrice(item, d);
    if (predicted < bestPrice) {
      bestPrice = predicted;
      bestDay = d;
    }
  }

  const savings = Math.round((item.currentPrice - bestPrice) * 100) / 100;
  const savingsPercent = Math.round((savings / item.currentPrice) * 100);

  let recommendation: string;
  if (bestDay === 0) {
    recommendation = '🟢 Buy now — price is at its lowest predicted point!';
  } else if (bestDay <= 3) {
    recommendation = `⏳ Wait ${bestDay} day${bestDay > 1 ? 's' : ''} — price expected to drop by $${savings.toFixed(2)}`;
  } else if (bestDay <= 7) {
    recommendation = `📊 Consider waiting ~${bestDay} days for a ${savingsPercent}% savings`;
  } else {
    recommendation = `📈 Best price in ~${bestDay} days, but monitor trends closely`;
  }

  return { bestDay, bestPrice, savings, savingsPercent, recommendation };
}

/**
 * Check all alerts against current predictions
 */
export function checkAlerts(alerts: PriceAlert[], items: FashionItem[]): PriceAlert[] {
  return alerts.filter((alert) => {
    const item = items.find((i) => i.id === alert.itemId);
    if (!item || !alert.active) return false;
    return item.currentPrice <= alert.targetPrice;
  });
}

/**
 * Calculate deal score (0–100) for an item
 */
export function getDealScore(item: FashionItem): number {
  const discountFromOriginal = (1 - item.currentPrice / item.originalPrice) * 40;
  const futureSavings7d = Math.max(0, (item.currentPrice - item.predictedPrice7d) / item.currentPrice) * 30;
  const sustainBonus = (item.sustainabilityScore / 100) * 15;
  const conditionBonus =
    item.condition === 'New with tags' ? 15 :
    item.condition === 'Like new' ? 12 :
    item.condition === 'Good' ? 8 :
    item.condition === 'Fair' ? 4 : 2;

  return Math.min(100, Math.round(discountFromOriginal + futureSavings7d + sustainBonus + conditionBonus));
}
