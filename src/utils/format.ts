// ============================================================
// VibeVault – Number & money formatting, currency conversion
// Listings keep their marketplace's currency; totals and budgets
// are converted to the user's currency with the ECB daily rates.
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

const PREFIX: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  KRW: '₩',
  CNY: 'CN¥',
  AUD: 'A$',
  CAD: 'C$',
  NZD: 'NZ$',
  SGD: 'S$',
  HKD: 'HK$',
  TWD: 'NT$',
  BRL: 'R$',
  MXN: 'MX$',
  ARS: 'AR$',
  CLP: 'CLP$',
  COP: 'COL$',
  PEN: 'S/',
  TRY: '₺',
  ILS: '₪',
  THB: '฿',
  PHP: '₱',
  IDR: 'Rp',
  VND: '₫',
  MYR: 'RM',
  ZAR: 'R',
  NGN: '₦',
  EGP: 'E£',
  PKR: 'Rs',
  LKR: 'Rs',
  NPR: 'Rs',
  BDT: '৳',
  KES: 'KSh',
};

/** Currencies written after the amount. */
const SUFFIX: Record<string, string> = { PLN: 'zł', SEK: 'kr', NOK: 'kr', DKK: 'kr', CZK: 'Kč', HUF: 'Ft', RON: 'lei' };

/** Currencies normally shown without minor units. */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'CLP', 'VND', 'IDR', 'COP', 'HUF', 'TWD', 'ISK', 'PYG', 'UGX']);

export function currencySymbol(currency: string): string {
  return PREFIX[currency] ?? SUFFIX[currency] ?? `${currency} `;
}

export function currencyDecimals(currency: string): number {
  return ZERO_DECIMAL.has(currency) ? 0 : 2;
}

function compose(sign: string, amount: string, currency: string): string {
  if (PREFIX[currency]) return `${sign}${PREFIX[currency]}${amount}`;
  if (SUFFIX[currency]) return `${sign}${amount} ${SUFFIX[currency]}`;
  return `${sign}${currency} ${amount}`;
}

/**
 * ₹1,299 · ₹1,299.50 · $42.50 · ¥3,980 · 129.90 zł
 * Rupee amounts drop ".00"; zero-decimal currencies (yen, won…) never show decimals.
 */
export function formatMoney(value: number, currency: string): string {
  const v = safe(value);
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  const decimals = currencyDecimals(currency);
  const [int, dec] = abs.toFixed(decimals).split('.');
  if (currency === 'INR') {
    return compose(sign, `${groupIndian(int)}${dec && dec !== '00' ? `.${dec}` : ''}`, currency);
  }
  return compose(sign, `${groupThousands(int)}${dec ? `.${dec}` : ''}`, currency);
}

/** Whole units, for totals and budgets: ₹12,34,567 · $1,250 */
export function formatMoneyWhole(value: number, currency: string): string {
  const rounded = Math.round(safe(value));
  const sign = rounded < 0 ? '-' : '';
  const int = String(Math.abs(rounded));
  return compose(sign, currency === 'INR' ? groupIndian(int) : groupThousands(int), currency);
}

/** Exchange rates as units of each currency per euro (ECB reference rates). */
export type FxRates = Record<string, number>;

/**
 * Converts `amount` between currencies through the euro rates; null when either rate is
 * unknown (never guessed).
 */
export function convertAmount(amount: number, from: string, to: string, rates: FxRates | null): number | null {
  if (!Number.isFinite(amount)) return null;
  if (from === to) return amount;
  if (!rates) return null;
  const fromRate = from === 'EUR' ? 1 : rates[from];
  const toRate = to === 'EUR' ? 1 : rates[to];
  if (!(fromRate > 0) || !(toRate > 0)) return null;
  return (amount / fromRate) * toRate;
}

/** 12,345 */
export function formatNumber(value: number): string {
  const v = Math.round(safe(value));
  const sign = v < 0 ? '-' : '';
  return `${sign}${groupThousands(String(Math.abs(v)))}`;
}

/** 0.734 → "73%" */
export function formatPercent(fraction: number): string {
  return `${Math.round(safe(fraction) * 100)}%`;
}

/** Percentage discount of `current` versus `original` (0 when unknown or not discounted). */
export function percentOff(current: number, original: number | null): number {
  if (original === null || !(original > 0) || !Number.isFinite(current)) return 0;
  return Math.max(0, Math.round((1 - current / original) * 100));
}

/**
 * Parses a user-entered price. Accepts "12", "12.5", "12,50", "₹1,299", "$12.50", "1,234.50",
 * "1.299,90", "¥3,980", "USD 12", "129,90 zł". Returns null for anything that is not a
 * positive amount (negative numbers, exponents and other text are rejected).
 */
export function parsePriceInput(raw: string): number | null {
  let text = raw.replace(/[^\x20-\x7E]/g, '').trim(); // drop ₹ € £ ¥ and other non-ASCII symbols
  text = text.replace(/^[A-Za-z]{1,3}\$?\s*/, '').replace(/\s*[A-Za-z]{1,3}$/, ''); // "USD 12", "R$ 12", "12 kr"
  text = text.replace(/[\s$]/g, '');
  if (!text || !/^[\d.,]+$/.test(text)) return null;
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Both separators: the last one is the decimal point ("1,234.50" or "1.234,50").
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
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

/** "in 3 h", "in 2 days", "today" – time left until an ISO date. */
export function formatTimeLeft(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const minutes = Math.round((then - now.getTime()) / 60_000);
  if (minutes <= 0) return 'ended';
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h left`;
  return `${Math.round(hours / 24)} days left`;
}
