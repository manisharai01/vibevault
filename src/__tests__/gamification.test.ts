import { QUEST_DEFINITIONS } from '../data/content';
import {
  computeSustainability,
  describeTimeLeft,
  getLevelInfo,
  isQuestOverdue,
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  mergeQuest,
  startQuestProgress,
  updateStreak,
} from '../services/gamification';
import { Purchase, StreakState } from '../types';

describe('getLevelInfo', () => {
  it('starts at level 1 with 0/100 XP', () => {
    expect(getLevelInfo(0)).toMatchObject({ level: 1, xpIntoLevel: 0, xpForLevel: 100, progress: 0, isMaxLevel: false });
  });

  it('levels up exactly at each threshold', () => {
    LEVEL_THRESHOLDS.forEach((threshold, index) => {
      expect(getLevelInfo(threshold).level).toBe(index + 1);
      if (threshold > 0) expect(getLevelInfo(threshold - 1).level).toBe(index);
    });
    expect(getLevelInfo(150)).toMatchObject({ level: 2, xpIntoLevel: 50, xpForLevel: 200, progress: 25 });
  });

  it('handles the max level without NaN or Infinity', () => {
    const info = getLevelInfo(10_000_000);
    expect(info).toMatchObject({ level: MAX_LEVEL, xpForLevel: 0, progress: 100, isMaxLevel: true });
    expect(Number.isFinite(info.xpIntoLevel)).toBe(true);
    expect(getLevelInfo(LEVEL_THRESHOLDS[MAX_LEVEL - 1]).isMaxLevel).toBe(true);
  });

  it('sanitises bad input', () => {
    expect(getLevelInfo(-50).level).toBe(1);
    expect(getLevelInfo(Number.NaN).level).toBe(1);
  });
});

describe('updateStreak', () => {
  const empty: StreakState = { lastActiveDate: null, current: 0, longest: 0 };

  it('starts, extends, keeps and resets streaks', () => {
    let s = updateStreak(empty, '2026-11-25');
    expect(s).toEqual({ lastActiveDate: '2026-11-25', current: 1, longest: 1 });
    expect(updateStreak(s, '2026-11-25')).toBe(s); // same day: unchanged
    s = updateStreak(s, '2026-11-26');
    s = updateStreak(s, '2026-11-27');
    expect(s).toMatchObject({ current: 3, longest: 3 });
    s = updateStreak(s, '2026-11-30');
    expect(s).toMatchObject({ current: 1, longest: 3 });
  });

  it('counts consecutive days across month/year boundaries', () => {
    let s = updateStreak(empty, '2026-12-31');
    s = updateStreak(s, '2027-01-01');
    expect(s.current).toBe(2);
  });

  it('re-anchors on today when the clock moves backwards, without losing the streak', () => {
    const s = updateStreak(updateStreak(empty, '2026-11-25'), '2026-11-26');
    const rewound = updateStreak(s, '2026-11-24');
    expect(rewound).toEqual({ lastActiveDate: '2026-11-24', current: 2, longest: 2 });
    // Visits keep being recorded from the new anchor instead of freezing.
    expect(updateStreak(rewound, '2026-11-25')).toMatchObject({ lastActiveDate: '2026-11-25', current: 3 });
  });
});

describe('quests', () => {
  const sustainableWeek = QUEST_DEFINITIONS.find((q) => q.id === 'quest-002')!;
  const now = new Date(2026, 10, 25, 9, 0);

  it('merges definitions with progress', () => {
    const available = mergeQuest(sustainableWeek, undefined);
    expect(available).toMatchObject({ status: 'available', progress: 0, completedSteps: 0, totalSteps: 7 });
    const merged = mergeQuest(sustainableWeek, { status: 'in-progress', completedSteps: 99, startedAt: now.toISOString() });
    expect(merged.completedSteps).toBe(7);
    expect(merged.progress).toBe(100);
  });

  it('sets a deadline for timed quests and detects overdue progress', () => {
    const progress = startQuestProgress(sustainableWeek, now);
    expect(new Date(progress.deadline!).getTime() - now.getTime()).toBe(7 * 86_400_000);
    expect(isQuestOverdue(progress, new Date(2026, 11, 1, 9, 0))).toBe(false);
    expect(isQuestOverdue(progress, new Date(2026, 11, 2, 9, 1))).toBe(true);
    expect(isQuestOverdue({ ...progress, status: 'completed' }, new Date(2027, 0, 1))).toBe(false);
    const untimed = startQuestProgress(QUEST_DEFINITIONS[0], now);
    expect(untimed.deadline).toBeUndefined();
    expect(isQuestOverdue(untimed, new Date(2030, 0, 1))).toBe(false);
  });

  it('describes time left', () => {
    const deadline = new Date(2026, 10, 28, 9, 0).toISOString();
    expect(describeTimeLeft(deadline, now)).toBe('3 days left');
    expect(describeTimeLeft(deadline, new Date(2026, 10, 27, 9, 0))).toBe('Ends tomorrow');
    expect(describeTimeLeft(deadline, new Date(2026, 10, 28, 8, 0))).toBe('Ends today');
    expect(describeTimeLeft(deadline, new Date(2026, 10, 29))).toBe('Time is up');
  });
});

describe('computeSustainability', () => {
  const base = { title: 'X', purchasedAt: '2026-11-25T10:00:00.000Z' };

  it('is zero without purchases', () => {
    expect(computeSustainability([], 'INR', null)).toEqual({ purchases: 0, itemsThrifted: 0, moneySaved: 0, currency: 'INR' });
  });

  it('counts purchases and pre-owned finds, and adds up savings in the user’s currency', () => {
    const purchases: Purchase[] = [
      // Pre-owned eBay find: $30 paid vs $90 list price, recorded as ₹5,400 saved at the time.
      { ...base, id: '1', itemId: 'ebay:IN:1', platform: 'eBay', currency: 'USD', pricePaid: 30, originalPrice: 90, homeCurrency: 'INR', paidInHome: 2700, savedInHome: 5400, secondhand: true },
      // New Flipkart item: ₹1,299 MRP, paid ₹649 → ₹650 saved.
      { ...base, id: '2', itemId: 'flipkart:IN:2', platform: 'Flipkart', currency: 'INR', pricePaid: 649, originalPrice: 1299, homeCurrency: 'INR', paidInHome: 649, savedInHome: 650, secondhand: false },
      // Logged while the user's currency was euros: converted at today's rate.
      { ...base, id: '3', itemId: 'ebay:DE:3', platform: 'eBay', currency: 'EUR', pricePaid: 20, originalPrice: 30, homeCurrency: 'EUR', paidInHome: 20, savedInHome: 10, secondhand: true },
      // No list price: nothing saved to count.
      { ...base, id: '4', itemId: 'flipkart:IN:4', platform: 'Flipkart', currency: 'INR', pricePaid: 500, originalPrice: null, homeCurrency: 'INR', paidInHome: 500, savedInHome: null, secondhand: false },
    ];
    expect(computeSustainability(purchases, 'INR', { EUR: 1, INR: 98.4 })).toEqual({
      purchases: 4,
      itemsThrifted: 2,
      moneySaved: 5400 + 650 + 984,
      currency: 'INR',
    });
    // Without a rate the euro purchase can't be converted and is left out (never guessed).
    expect(computeSustainability(purchases, 'INR', null).moneySaved).toBe(6050);
  });
});
