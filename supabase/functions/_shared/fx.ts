// Daily reference exchange rates from the European Central Bank via frankfurter.dev
// (free, no key). Stored as units of each currency per euro; the app derives cross rates.

import { requestJson } from './http.ts';
import type { FetchLike } from './types.ts';

export interface EcbRates {
  observedOn: string; // YYYY-MM-DD (ECB publication date)
  /** Units of each currency per 1 EUR (EUR itself included as 1). */
  perEur: Record<string, number>;
}

export const FX_URL = 'https://api.frankfurter.dev/v1/latest?base=EUR';

export async function fetchEcbRates(fetch: FetchLike): Promise<EcbRates> {
  const body = await requestJson<{ date?: string; rates?: Record<string, unknown> }>(FX_URL, {}, { fetch, label: 'ECB exchange rates' });
  const date = body?.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !body?.rates || typeof body.rates !== 'object') {
    throw new Error('ECB exchange rates: unexpected response');
  }
  const perEur: Record<string, number> = { EUR: 1 };
  for (const [currency, rate] of Object.entries(body.rates)) {
    if (/^[A-Z]{3}$/.test(currency) && typeof rate === 'number' && rate > 0 && Number.isFinite(rate)) perEur[currency] = rate;
  }
  if (Object.keys(perEur).length < 2) throw new Error('ECB exchange rates: no rates in response');
  return { observedOn: date, perEur };
}
