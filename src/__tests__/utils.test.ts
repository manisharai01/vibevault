import { addDays, daysBetween, formatDate, formatShortDate, parseDateKey, toDateKey } from '../utils/date';
import { clamp, formatNumber, formatPrice, formatPriceRounded, parsePriceInput, percentOff } from '../utils/format';
import { hashString, mulberry32, noise01 } from '../utils/random';

describe('format', () => {
  it('formats prices with two decimals and thousands separators', () => {
    expect(formatPrice(0)).toBe('$0.00');
    expect(formatPrice(12.5)).toBe('$12.50');
    expect(formatPrice(1234.567)).toBe('$1,234.57');
    expect(formatPrice(-3)).toBe('-$3.00');
    expect(formatPrice(Number.NaN)).toBe('$0.00');
    expect(formatPrice(Number.POSITIVE_INFINITY)).toBe('$0.00');
  });

  it('formats rounded prices and numbers', () => {
    expect(formatPriceRounded(1999.6)).toBe('$2,000');
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(12.4)).toBe('12');
  });

  it('computes percent off safely', () => {
    expect(percentOff(25, 100)).toBe(75);
    expect(percentOff(120, 100)).toBe(0);
    expect(percentOff(10, 0)).toBe(0);
    expect(percentOff(Number.NaN, 10)).toBe(0);
  });

  it.each([
    ['12', 12],
    ['12.5', 12.5],
    ['12,50', 12.5],
    ['$ 19.99', 19.99],
    ['1,234.50', 1234.5],
    ['.5', 0.5],
    ['7.', 7],
    ['3.456', 3.46],
  ])('parses price input %p', (input, expected) => {
    expect(parsePriceInput(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '-5', '0', '0.00', '1.2.3', '12e3', '$'])('rejects invalid price input %p', (input) => {
    expect(parsePriceInput(input)).toBeNull();
  });

  it('clamps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
});

describe('date', () => {
  it('uses the local calendar date (no UTC shift)', () => {
    const lateEvening = new Date(2026, 0, 31, 23, 59);
    expect(toDateKey(lateEvening)).toBe('2026-01-31');
    const earlyMorning = new Date(2026, 1, 1, 0, 5);
    expect(toDateKey(earlyMorning)).toBe('2026-02-01');
  });

  it('parses date keys as local dates and rejects malformed keys', () => {
    const d = parseDateKey('2026-02-15')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(15);
    expect(parseDateKey('15/02/2026')).toBeNull();
    expect(parseDateKey('')).toBeNull();
  });

  it('counts calendar days between dates, across month and DST boundaries', () => {
    expect(daysBetween(new Date(2026, 1, 28, 23), new Date(2026, 2, 1, 1))).toBe(1);
    expect(daysBetween(new Date(2026, 2, 1), new Date(2026, 3, 1))).toBe(31);
    expect(daysBetween(new Date(2026, 9, 25), new Date(2026, 10, 2))).toBe(8);
    expect(toDateKey(addDays(new Date(2026, 11, 31), 1))).toBe('2027-01-01');
  });

  it('formats dates from keys, ISO timestamps and Date objects', () => {
    expect(formatDate('2026-02-15')).toBe('Feb 15, 2026');
    expect(formatDate(new Date(2026, 10, 25))).toBe('Nov 25, 2026');
    expect(formatShortDate('2026-03-01')).toBe('Mar 1');
    expect(formatDate(new Date(2026, 4, 3, 12).toISOString())).toBe('May 3, 2026');
    expect(formatDate('not a date')).toBe('not a date');
  });
});

describe('random', () => {
  it('is deterministic', () => {
    expect(hashString('item-001')).toBe(hashString('item-001'));
    expect(hashString('item-001')).not.toBe(hashString('item-002'));
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(noise01(7, 100)).toBe(noise01(7, 100));
  });

  it('produces values in [0, 1)', () => {
    const rand = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
