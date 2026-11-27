// ============================================================
// VibeVault – When to buy
// One recommendation per listing, from real signals only:
//   1. a sale the store has announced in its official feed (dated),
//   2. the price model's short-term prediction (next 14 days),
//   3. how the price usually moves through the year (seasonal
//      pattern learnt from recorded/archived price history),
//   4. where today's price sits in its own recorded range.
// When none of these has enough data, it says so — nothing is
// guessed.
// ============================================================

import { FashionItem, Offer } from '../types';
import { getBuyAdvice, isAtRecordLow, MAIN_HORIZON, predictionFor } from './priceEngine';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** How far ahead an announced sale or a cheaper month is worth waiting for. */
export const SALE_LOOKAHEAD_DAYS = 60;
export const SEASON_LOOKAHEAD_MONTHS = 6;
/** Minimum expected saving to recommend waiting for a month (next month / later months). */
const SEASON_MIN_SAVING_SOON = 0.05;
const SEASON_MIN_SAVING_LATER = 0.07;
/** A season pattern needs this many listings behind it unless it's the listing's own history. */
const SEASON_MIN_LISTINGS = 10;

export type TimingKind = 'buy-now' | 'wait-sale' | 'wait-days' | 'wait-month' | 'no-signal' | 'unavailable';

export interface BuyTiming {
  kind: TimingKind;
  /** Short label for badges ("Buy now", "Wait for Dec"); null when there's nothing to say. */
  badge: string | null;
  headline: string;
  detail: string;
  /** For waits: the first day worth buying on (YYYY-MM-DD). */
  buyFrom: string | null;
  /** For waits: the expected price then, in the listing's currency. */
  expectedPrice: number | null;
  /** For waits: the expected saving against today's price (0.15 = 15%). */
  saving: number | null;
  /** For seasonal waits: the month to buy in (0 = January). */
  month: number | null;
  /** The announced sale, for wait-sale. */
  sale: Offer | null;
  /** Where the recommendation comes from, one line each. */
  evidence: string[];
}

export interface SeasonWindow {
  month: number;
  monthsAhead: number;
  expectedPrice: number;
  saving: number;
}

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

/** The yearly typical price a seasonal ratio applies to: the recorded median, else today's price. */
function typicalPrice(item: Pick<FashionItem, 'stats' | 'currentPrice'>): number {
  return item.stats && item.stats.median > 0 ? item.stats.median : item.currentPrice;
}

/** True when the pattern is solid enough to act on. */
function trustworthySeason(item: Pick<FashionItem, 'season'>): boolean {
  const s = item.season;
  return !!s && (s.basis === 'listing' || s.listings >= SEASON_MIN_LISTINGS) && s.years >= 0.9;
}

/**
 * The month (this one or up to six ahead) when the item is usually cheapest, if waiting for it
 * would save a meaningful amount compared with today's price.
 */
export function seasonalWindow(item: Pick<FashionItem, 'season' | 'stats' | 'currentPrice'>, now: Date): SeasonWindow | null {
  if (!trustworthySeason(item)) return null;
  const typical = typicalPrice(item);
  const thisMonth = now.getMonth();
  let best: SeasonWindow | null = null;
  for (let ahead = 0; ahead <= SEASON_LOOKAHEAD_MONTHS; ahead++) {
    const month = (thisMonth + ahead) % 12;
    const ratio = item.season!.months[month];
    if (ratio === null || ratio === undefined) continue;
    const expectedPrice = Math.round(typical * ratio * 100) / 100;
    const saving = (item.currentPrice - expectedPrice) / item.currentPrice;
    if (saving < (ahead <= 1 ? SEASON_MIN_SAVING_SOON : SEASON_MIN_SAVING_LATER)) continue;
    if (!best || expectedPrice < best.expectedPrice) best = { month, monthsAhead: ahead, expectedPrice, saving };
  }
  return best;
}

/** True when this month is usually among the cheapest and today's price already reflects it. */
export function inCheapSeasonNow(item: Pick<FashionItem, 'season' | 'stats' | 'currentPrice'>, now: Date): boolean {
  if (!trustworthySeason(item)) return false;
  const ratio = item.season!.months[now.getMonth()];
  return ratio !== null && ratio !== undefined && ratio <= 0.95 && item.currentPrice <= typicalPrice(item) * ratio * 1.02;
}

/** Plain-language source of a seasonal pattern. */
export function seasonEvidence(item: Pick<FashionItem, 'season' | 'category' | 'siteName'>): string | null {
  const s = item.season;
  if (!s) return null;
  const span = s.years >= 1.5 ? `${Math.round(s.years * 10) / 10} years` : 'a year';
  if (s.basis === 'listing') return `This listing's own price over ${span}.`;
  if (s.basis === 'category') return `${s.listings} ${item.category.toLowerCase()} listings on ${item.siteName}, over ${span} of prices.`;
  return `${s.listings} listings on ${item.siteName}, over ${span} of prices.`;
}

/** Sales announced in an official feed that apply to this listing and start within the lookahead. */
export function upcomingSaleFor(
  item: Pick<FashionItem, 'id' | 'source' | 'market'>,
  sales: Offer[],
  now: Date,
): Offer | null {
  const until = now.getTime() + SALE_LOOKAHEAD_DAYS * 86_400_000;
  return (
    sales
      .filter((o) => (o.listingId === item.id || (!o.listingId && o.source === item.source)) && o.market === item.market)
      .filter((o) => o.startsAt !== null && Date.parse(o.startsAt) > now.getTime() && Date.parse(o.startsAt) <= until)
      .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''))[0] ?? null
  );
}

const formatDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};

type TimingItem = Pick<
  FashionItem,
  'id' | 'source' | 'market' | 'available' | 'currentPrice' | 'currency' | 'stats' | 'prediction' | 'season' | 'secondhand' | 'category' | 'siteName' | 'platform'
>;

export function getBuyTiming(item: TimingItem, options: { now: Date; upcomingSales?: Offer[] }): BuyTiming {
  const { now } = options;
  const base: BuyTiming = { kind: 'no-signal', badge: null, headline: '', detail: '', buyFrom: null, expectedPrice: null, saving: null, month: null, sale: null, evidence: [] };

  if (!item.available) {
    return { ...base, kind: 'unavailable', headline: 'No longer for sale', detail: `${item.platform} no longer lists it.` };
  }

  const advice = getBuyAdvice(item);
  const prediction = predictionFor(item);
  const season = seasonalWindow(item, now);
  const recordLow = isAtRecordLow(item) && (item.stats?.days ?? 0) >= 7;
  const seasonLine = seasonEvidence(item);
  const modelLine = prediction
    ? `Learnt from what happened to ${prediction.basisListings} similar tracked listings (14-day outlook).`
    : null;

  // 1. A dated sale from the store's own feed.
  const sale = upcomingSaleFor(item, options.upcomingSales ?? [], now);
  if (sale && sale.startsAt) {
    return {
      ...base,
      kind: 'wait-sale',
      badge: `Sale ${formatDay(sale.startsAt)}`,
      headline: `Sale starts ${formatDay(sale.startsAt)}`,
      detail: `${sale.merchant} has announced “${sale.title}” from ${formatDay(sale.startsAt)}${sale.discountText ? ` (${sale.discountText})` : ''}. Check the price then before buying.`,
      buyFrom: sale.startsAt.slice(0, 10),
      sale,
      evidence: [`${sale.merchant}'s official offer feed, re-confirmed in the last day.`],
    };
  }

  // 2. The short-term model says a drop is likely within two weeks.
  if (advice?.verdict === 'wait') {
    return {
      ...base,
      kind: 'wait-days',
      badge: 'Wait ~2 wks',
      headline: 'Wait about two weeks',
      detail: `${pct(advice.pDrop)} chance it gets at least 5% cheaper within ${MAIN_HORIZON} days — typically down to about the expected low.`,
      buyFrom: dateKey(addDays(now, 1)),
      expectedPrice: advice.expectedLow,
      saving: advice.expectedLow < item.currentPrice ? (item.currentPrice - advice.expectedLow) / item.currentPrice : null,
      evidence: [modelLine, seasonLine && season ? seasonLine : null].filter((x): x is string => !!x),
    };
  }

  // 3. The yearly pattern says a cheaper month is coming.
  if (season) {
    const thisMonth = season.monthsAhead === 0;
    const first = new Date(now.getFullYear(), now.getMonth() + season.monthsAhead, thisMonth ? now.getDate() : 1);
    return {
      ...base,
      kind: 'wait-month',
      badge: thisMonth ? 'Dips this month' : `Wait for ${MONTHS_SHORT[season.month]}`,
      headline: thisMonth ? `Usually cheaper in ${MONTHS[season.month]}` : `Wait for ${MONTHS[season.month]}`,
      detail: thisMonth
        ? `Prices like this usually sit about ${pct(season.saving)} lower in ${MONTHS[season.month]}, and it hasn't dropped yet. Set an alert for the expected price.`
        : `In ${MONTHS[season.month]} it's typically about ${pct(season.saving)} cheaper than today's price.`,
      buyFrom: dateKey(first),
      expectedPrice: season.expectedPrice,
      saving: season.saving,
      month: season.month,
      evidence: [seasonLine, modelLine].filter((x): x is string => !!x),
    };
  }

  // 4. Signals that today is a good price.
  const reasons: string[] = [];
  if (advice?.verdict === 'buy') reasons.push(`Only ${pct(advice.pDrop)} chance of a 5%+ drop in the next ${MAIN_HORIZON} days.`);
  if (recordLow) reasons.push(`The lowest price in ${item.stats!.days} recorded days.`);
  if (inCheapSeasonNow(item, now)) reasons.push('This is usually its cheapest time of year.');
  if (reasons.length > 0) {
    if (trustworthySeason(item) && !season) reasons.push(`No cheaper month expected in the next ${SEASON_LOOKAHEAD_MONTHS} months.`);
    if (advice && item.secondhand && advice.pGone >= 0.25) reasons.push(`It's a one-off: ${pct(advice.pGone)} of similar listings sold before getting cheaper.`);
    return {
      ...base,
      kind: 'buy-now',
      badge: 'Buy now',
      headline: 'Buy now',
      detail: reasons.join(' '),
      evidence: [modelLine, trustworthySeason(item) ? seasonLine : null].filter((x): x is string => !!x),
    };
  }

  // 5. Not enough to go on.
  const days = item.stats?.days ?? 0;
  return {
    ...base,
    kind: 'no-signal',
    headline: advice ? 'Too close to call' : 'No clear signal yet',
    detail: advice
      ? `${pct(advice.pDrop)} chance of a 5%+ drop within ${MAIN_HORIZON} days. Buy when you need it, or set an alert for your price.`
      : days > 0
        ? `Tracked for ${days} day${days === 1 ? '' : 's'} — the timing call appears once there's enough price history. Set an alert in the meantime.`
        : 'Tracking just started. Set an alert for your price in the meantime.',
    evidence: modelLine ? [modelLine] : [],
  };
}

export interface TimingGroup {
  key: string;
  title: string;
  items: { item: FashionItem; timing: BuyTiming }[];
}

/** Groups listings into a buying calendar: now, soon, by month, then no signal / unavailable. */
export function buyCalendar(items: FashionItem[], options: { now: Date; upcomingSales?: Offer[] }): TimingGroup[] {
  const groups = new Map<string, TimingGroup>();
  const order: string[] = [];
  const add = (key: string, title: string, entry: { item: FashionItem; timing: BuyTiming }) => {
    if (!groups.has(key)) {
      groups.set(key, { key, title, items: [] });
      order.push(key);
    }
    groups.get(key)!.items.push(entry);
  };
  const entries = items.map((item) => ({ item, timing: getBuyTiming(item, options) }));
  const rank = (t: BuyTiming) =>
    t.kind === 'buy-now' ? 0 : t.kind === 'wait-days' ? 1 : t.kind === 'wait-sale' || t.kind === 'wait-month' ? 2 : t.kind === 'no-signal' ? 3 : 4;
  entries.sort((a, b) => rank(a.timing) - rank(b.timing) || (a.timing.buyFrom ?? '').localeCompare(b.timing.buyFrom ?? '') || a.item.id.localeCompare(b.item.id));
  for (const entry of entries) {
    const t = entry.timing;
    if (t.kind === 'buy-now') add('now', 'Buy now', entry);
    else if (t.kind === 'wait-days') add('soon', 'Within two weeks', entry);
    else if ((t.kind === 'wait-month' || t.kind === 'wait-sale') && t.buyFrom) {
      const d = new Date(`${t.buyFrom}T12:00:00`);
      add(`m-${d.getFullYear()}-${d.getMonth()}`, `${MONTHS[d.getMonth()]}${d.getFullYear() !== options.now.getFullYear() ? ` ${d.getFullYear()}` : ''}`, entry);
    } else if (t.kind === 'no-signal') add('none', 'No clear signal yet', entry);
    else add('gone', 'No longer for sale', entry);
  }
  return order.map((k) => groups.get(k)!);
}
