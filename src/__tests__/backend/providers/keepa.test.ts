import { createKeepaHistory, dailyPrices, keepaEvents, keepaMinutesToMs } from '../../../../supabase/functions/_shared/providers/keepa.ts';
import { recordingFetch } from '../../helpers/http';

const minutes = (iso: string) => Date.parse(iso) / 60_000 - 21564000;

describe('Keepa price history', () => {
  it('converts Keepa time (the documented example)', () => {
    expect(keepaMinutesToMs(411180)).toBe(1318510800000);
  });

  it('decodes pairs and shipping triples', () => {
    expect(keepaEvents([10, 4900, 20, -1], false).map((e) => e.price)).toEqual([4900, -1]);
    expect(keepaEvents([10, 4900, 500, 20, 4500, 0], true).map((e) => e.price)).toEqual([4900, 4500]);
    expect(keepaEvents(null, false)).toEqual([]);
  });

  it('samples the price in effect at noon UTC each day, skipping days without an offer', () => {
    const now = new Date('2026-11-05T18:00:00Z');
    const events = keepaEvents(
      [
        minutes('2026-11-01T08:00:00Z'), 129900,
        minutes('2026-11-02T13:00:00Z'), 99900, // after noon: applies from the 3rd
        minutes('2026-11-03T20:00:00Z'), -1, // out of stock from the 4th
        minutes('2026-11-05T06:00:00Z'), 109900,
      ],
      false,
    );
    expect(dailyPrices(events, 'INR', now)).toEqual([
      { date: '2026-11-01', price: 1299 },
      { date: '2026-11-02', price: 1299 },
      { date: '2026-11-03', price: 999 },
      { date: '2026-11-05', price: 1099 },
    ]);
    // Yen prices are whole units; only the last `days` days are returned.
    expect(dailyPrices(keepaEvents([minutes('2026-11-01T00:00:00Z'), 3980], false), 'JPY', now, 2)).toEqual([
      { date: '2026-11-04', price: 3980 },
      { date: '2026-11-05', price: 3980 },
    ]);
  });

  it('requests the product with history and prefers the buy box price', async () => {
    const { fetch, calls } = recordingFetch(() => [
      200,
      {
        tokensLeft: 99,
        products: [
          {
            asin: 'B0ABCDEF12',
            csv: Object.assign([], { 1: [minutes('2026-11-20T00:00:00Z'), 150000], 18: [minutes('2026-11-20T00:00:00Z'), 129900, 0] }),
          },
        ],
      },
    ]);
    const keepa = createKeepaHistory('KEY', fetch, () => new Date('2026-11-21T13:00:00Z'));
    const history = await keepa.history('B0ABCDEF12', 'IN');
    expect(history).toEqual({ currency: 'INR', points: [{ date: '2026-11-20', price: 1299 }, { date: '2026-11-21', price: 1299 }] });
    expect(calls[0].url).toBe('https://api.keepa.com/product?key=KEY&domain=10&asin=B0ABCDEF12&history=1&days=365');
    await expect(keepa.history('B0ABCDEF12', 'KR')).resolves.toBeNull();
    await expect(keepa.history('bad', 'IN')).resolves.toBeNull();
  });
});
