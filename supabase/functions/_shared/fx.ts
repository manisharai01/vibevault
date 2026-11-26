// Daily exchange rates from the European Central Bank via frankfurter.dev (free, no key).

import { requestJson } from './http.ts';
import type { FetchLike } from './types.ts';

export interface FxRate {
  base: string;
  quote: string;
  observedOn: string; // YYYY-MM-DD (ECB publication date)
  rate: number;
}

export async function fetchFxRate(base: string, quote: string, fetch: FetchLike): Promise<FxRate> {
  const url = `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(quote)}`;
  const body = await requestJson<{ date?: string; rates?: Record<string, number> }>(url, {}, { fetch, label: `FX ${base}/${quote}` });
  const rate = body?.rates?.[quote];
  if (typeof rate !== 'number' || !(rate > 0) || typeof body?.date !== 'string') {
    throw new Error(`FX ${base}/${quote}: unexpected response`);
  }
  return { base, quote, observedOn: body.date, rate };
}
