import { QUEST_DEFINITIONS } from '../data/mockData';
import {
  buildLeaderboard,
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

describe('buildLeaderboard', () => {
  it('includes the user, ranked by points with contiguous ranks', () => {
    const board = buildLeaderboard({ name: 'Sam', points: 3000, level: 4, styleArchetype: 'Y2K' });
    expect(board).toHaveLength(11);
    expect(board.map((e) => e.rank)).toEqual(Array.from({ length: 11 }, (_, i) => i + 1));
    const me = board.find((e) => e.isCurrentUser)!;
    expect(me).toMatchObject({ name: 'Sam', rank: 5 });
    for (let i = 1; i < board.length; i++) expect(board[i].points).toBeLessThanOrEqual(board[i - 1].points);
  });

  it('places a brand-new user last and keeps community members ahead on ties', () => {
    expect(buildLeaderboard({ name: 'New', points: 0, level: 1, styleArchetype: null }).at(-1)?.isCurrentUser).toBe(true);
    const tie = buildLeaderboard({ name: 'Tie', points: 4850, level: 9, styleArchetype: null });
    expect(tie[0].isCurrentUser).toBe(false);
    expect(tie[1].isCurrentUser).toBe(true);
  });
});

describe('computeSustainability', () => {
  it('is zero without purchases and sums purchases otherwise', () => {
    expect(computeSustainability([])).toEqual({ totalCO2Saved: 0, itemsThrifted: 0, waterSavedLiters: 0, moneySaved: 0, treesEquivalent: 0 });
    const purchases: Purchase[] = [
      { id: '1', itemId: 'a', title: 'A', platform: 'Depop', pricePaid: 30, originalPrice: 90, co2Saved: 12.4, purchasedAt: '2026-11-25T10:00:00.000Z' },
      { id: '2', itemId: 'b', title: 'B', platform: 'Vinted', pricePaid: 10, originalPrice: 8, co2Saved: 8.6, purchasedAt: '2026-11-25T10:00:00.000Z' },
    ];
    expect(computeSustainability(purchases)).toEqual({
      totalCO2Saved: 21,
      itemsThrifted: 2,
      waterSavedLiters: 3780,
      moneySaved: 60, // a purchase above retail never counts as negative savings
      treesEquivalent: 1,
    });
  });
});
