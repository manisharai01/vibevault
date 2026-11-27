import { addDays, daysBetween, formatDate, formatShortDate, parseDateKey, toDateKey } from '../utils/date';
import {
  clamp,
  convertAmount,
  currencySymbol,
  formatMoney,
  formatMoneyWhole,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatTimeLeft,
  parsePriceInput,
  percentOff,
} from '../utils/format';

describe('format', () => {
  it('formats rupees with Indian digit grouping, dropping .00', () => {
    expect(formatMoney(0, 'INR')).toBe('₹0');
    expect(formatMoney(649, 'INR')).toBe('₹649');
    expect(formatMoney(1299.5, 'INR')).toBe('₹1,299.50');
    expect(formatMoney(129999, 'INR')).toBe('₹1,29,999');
    expect(formatMoney(12345678.9, 'INR')).toBe('₹1,23,45,678.90');
    expect(formatMoney(-3, 'INR')).toBe('-₹3');
    expect(formatMoneyWhole(1999.6, 'INR')).toBe('₹2,000');
    expect(formatMoneyWhole(1234567, 'INR')).toBe('₹12,34,567');
  });

  it('formats other currencies the way they are written', () => {
    expect(formatMoney(12.5, 'USD')).toBe('$12.50');
    expect(formatMoney(1234.567, 'USD')).toBe('$1,234.57');
    expect(formatMoney(5, 'GBP')).toBe('£5.00');
    expect(formatMoney(5, 'SGD')).toBe('S$5.00');
    expect(formatMoney(3980, 'JPY')).toBe('¥3,980');
    expect(formatMoney(25900.4, 'KRW')).toBe('₩25,900');
    expect(formatMoney(129.9, 'PLN')).toBe('129.90 zł');
    expect(formatMoney(10, 'XYZ')).toBe('XYZ 10.00');
    expect(formatMoneyWhole(1250.4, 'USD')).toBe('$1,250');
    expect(currencySymbol('EUR')).toBe('€');
  });

  it('converts through euro rates and never guesses a missing rate', () => {
    const rates = { EUR: 1, USD: 1.06, INR: 98.4 };
    expect(convertAmount(10, 'USD', 'USD', null)).toBe(10);
    expect(convertAmount(10.6, 'USD', 'EUR', rates)).toBeCloseTo(10, 10);
    expect(convertAmount(10, 'USD', 'INR', rates)).toBeCloseTo((10 / 1.06) * 98.4, 10);
    expect(convertAmount(10, 'USD', 'JPY', rates)).toBeNull();
    expect(convertAmount(10, 'USD', 'INR', null)).toBeNull();
    expect(convertAmount(Number.NaN, 'USD', 'INR', rates)).toBeNull();
  });

  it('formats percentages and time left', () => {
    expect(formatPercent(0.734)).toBe('73%');
    const now = new Date('2026-11-25T12:00:00Z');
    expect(formatTimeLeft(null, now)).toBeNull();
    expect(formatTimeLeft('2026-11-25T11:00:00Z', now)).toBe('ended');
    expect(formatTimeLeft('2026-11-25T12:30:00Z', now)).toBe('30 min left');
    expect(formatTimeLeft('2026-11-26T12:00:00Z', now)).toBe('24 h left');
    expect(formatTimeLeft('2026-11-30T12:00:00Z', now)).toBe('5 days left');
  });

  it('never prints NaN or Infinity', () => {
    expect(formatMoney(Number.NaN, 'INR')).toBe('₹0');
    expect(formatMoney(Number.POSITIVE_INFINITY, 'USD')).toBe('$0.00');
  });

  it('formats numbers', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(12.4)).toBe('12');
  });

  it('describes how long ago something happened', () => {
    const now = new Date(2026, 10, 25, 12, 0);
    const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
    expect(formatRelativeTime(null, now)).toBe('never');
    expect(formatRelativeTime('garbage', now)).toBe('unknown');
    expect(formatRelativeTime(ago(0), now)).toBe('just now');
    expect(formatRelativeTime(ago(5), now)).toBe('5 min ago');
    expect(formatRelativeTime(ago(180), now)).toBe('3 h ago');
    expect(formatRelativeTime(ago(60 * 24), now)).toBe('1 day ago');
    expect(formatRelativeTime(ago(60 * 24 * 3), now)).toBe('3 days ago');
    expect(formatRelativeTime(new Date(now.getTime() + 60_000).toISOString(), now)).toBe('just now'); // clock skew
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
    ['₹1,299', 1299],
    ['1,29,999', 129999],
    ['₹ 649', 649],
    ['.5', 0.5],
    ['7.', 7],
    ['3.456', 3.46],
    ['1.299,90', 1299.9],
    ['USD 12', 12],
    ['R$ 49,90', 49.9],
    ['129,90 zł', 129.9],
    ['¥3,980', 3980],
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
