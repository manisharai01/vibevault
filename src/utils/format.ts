// ============================================================
// VibeVault – Number & money formatting
// Listings keep their marketplace currency (₹ for Flipkart, $ for
// eBay); totals across currencies are converted to rupees.
// ============================================================

const safe = (value: number) => (Number.isFinite(value) ? value : 0);

/** 1234567 → "1,234,567" */
function groupThousands(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 1234567 → "12,34,567" (Indian lakh/crore grouping) */
function groupIndian(integer: string): string {
  if (integer.length <= 3) return integer;
  const last3 = integer.slice(-3);
  const rest = integer.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

const SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$' };

export function currencySymbol(currency: string): string {
  return SYMBOLS[currency] ?? `${currency} `;
}

/**
 * ₹1,299 · ₹1,299.50 · $42.50
 * Rupee amounts drop ".00"; other currencies always show cents.
 */
export function formatMoney(value: number, currency: string): string {
  const v = safe(value);
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (currency === 'INR') {
    const rounded = Math.round(abs * 100) / 100;
    const [int, dec] = rounded.toFixed(2).split('.');
    return `${sign}₹${groupIndian(int)}${dec === '00' ? '' : `.${dec}`}`;
  }
  const [int, dec] = abs.toFixed(2).split('.');
  return `${sign}${currencySymbol(currency)}${groupThousands(int)}.${dec}`;
}

/** Whole rupees: ₹12,34,567 */
export function formatInr(value: number): string {
  return formatMoney(Math.round(safe(value)), 'INR');
}

/** Converts an amount to rupees; null when the rate is unknown. */
export function toInr(amount: number, inrRate: number | null): number | null {
  return inrRate !== null && Number.isFinite(inrRate) && inrRate > 0 ? amount * inrRate : null;
}

/** 12,345 */
export function formatNumber(value: number): string {
  const v = Math.round(safe(value));
  const sign = v < 0 ? '-' : '';
  return `${sign}${groupThousands(String(Math.abs(v)))}`;
}

/** Percentage discount of `current` versus `original` (0 when unknown or not discounted). */
export function percentOff(current: number, original: number | null): number {
  if (original === null || !(original > 0) || !Number.isFinite(current)) return 0;
  return Math.max(0, Math.round((1 - current / original) * 100));
}

/**
 * Parses a user-entered price. Accepts "12", "12.5", "12,50", "₹1,299", "$12.50",
 * "1,234.50". Returns null for anything that is not a positive amount.
 */
export function parsePriceInput(raw: string): number | null {
  let text = raw.trim().replace(/[$₹€£\s]/g, '');
  if (!text) return null;
  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/,/g, ''); // comma used as thousands separator
  } else if (/^\d{1,2}(,\d{2})*,\d{3}$|^\d{1,3}(,\d{3})+$/.test(text)) {
    text = text.replace(/,/g, ''); // grouped thousands, e.g. 1,299 or 1,29,999
  } else if (text.includes(',')) {
    text = text.replace(',', '.'); // comma used as decimal separator
  }
  if (!/^\d+(\.\d+)?$|^\d+\.$|^\.\d+$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** "just now", "5 min ago", "3 h ago", "2 days ago" */
export function formatRelativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'unknown';
  const minutes = Math.max(0, Math.round((now.getTime() - then) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}
