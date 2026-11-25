// ============================================================
// VibeVault – Number & price formatting
// All catalogue prices are stored and displayed in USD.
// ============================================================

const safe = (value: number) => (Number.isFinite(value) ? value : 0);

/** Adds thousands separators to an integer string. */
function groupThousands(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** $1,234.50 */
export function formatPrice(value: number): string {
  const v = safe(value);
  const sign = v < 0 ? '-' : '';
  const [int, dec] = Math.abs(v).toFixed(2).split('.');
  return `${sign}$${groupThousands(int)}.${dec}`;
}

/** $1,235 — rounded to whole dollars. */
export function formatPriceRounded(value: number): string {
  const v = Math.round(safe(value));
  const sign = v < 0 ? '-' : '';
  return `${sign}$${groupThousands(String(Math.abs(v)))}`;
}

/** 12,345 */
export function formatNumber(value: number): string {
  const v = Math.round(safe(value));
  const sign = v < 0 ? '-' : '';
  return `${sign}${groupThousands(String(Math.abs(v)))}`;
}

/** Percentage discount of `current` versus `original` (0 when not discounted). */
export function percentOff(current: number, original: number): number {
  if (!(original > 0) || !Number.isFinite(current)) return 0;
  return Math.max(0, Math.round((1 - current / original) * 100));
}

/**
 * Parses a user-entered price. Accepts "12", "12.5", "12,50", "$12.50",
 * "1,234.50". Returns null for anything that is not a positive amount.
 */
export function parsePriceInput(raw: string): number | null {
  let text = raw.trim().replace(/[$\s]/g, '');
  if (!text) return null;
  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/,/g, ''); // comma used as thousands separator
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
