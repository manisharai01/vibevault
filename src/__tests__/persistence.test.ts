import {
  createDefaultPersistedState,
  migratePersistedState,
  sanitizePersistedState,
  sanitizePriceAlerts,
  sanitizeProfile,
  sanitizePurchases,
  sanitizeQuestProgress,
  sanitizeStreak,
} from '../store/persistence';

const NOW = new Date(2026, 10, 25, 10, 0);

describe('sanitizePersistedState', () => {
  it.each([undefined, null, 42, 'text', [], true])('returns {} for unusable input %p', (input) => {
    expect(sanitizePersistedState(input, NOW)).toEqual({});
  });

  it('round-trips a valid default state', () => {
    const state = createDefaultPersistedState(NOW);
    expect(sanitizePersistedState(JSON.parse(JSON.stringify(state)), NOW)).toEqual(state);
  });

  it('only treats the profile as complete when it has style scores', () => {
    const result = sanitizePersistedState({ isProfileComplete: true, profile: {}, vibeSummary: 'x' }, NOW);
    expect(result.isProfileComplete).toBe(false);
    expect(result.vibeSummary).toBe('');
  });
});

describe('field sanitizers', () => {
  it('cleans a corrupted profile', () => {
    const profile = sanitizeProfile(
      {
        name: '   ',
        personalityTraits: ['introvert', 7, 'nope', 'introvert'],
        styleScores: { Y2K: 140, Grunge: -3, Fake: 50, Minimalist: 'x' },
        totalXP: -10,
        points: 'lots',
        earnedBadges: { 'badge-001': '2026-01-01', 'badge-999': '2026-01-01', 'badge-002': 'yesterday' },
        wishlist: ['item-001', 'item-404', 'item-001', null],
        completedQuests: ['quest-001', 'quest-x'],
        budgetTier: 'budget-huge',
        sustainabilityPriority: 900,
        joinedDate: 'Feb 1',
      },
      NOW,
    );
    expect(profile.name).toBe('VibeVault User');
    expect(profile.personalityTraits).toEqual(['introvert']);
    expect(profile.styleScores).toEqual({ Y2K: 100 });
    expect(profile.totalXP).toBe(0);
    expect(profile.points).toBe(0);
    expect(profile.earnedBadges).toEqual({ 'badge-001': '2026-01-01' });
    expect(profile.wishlist).toEqual(['item-001']);
    expect(profile.completedQuests).toEqual(['quest-001']);
    expect(profile.budgetTier).toBeNull();
    expect(profile.sustainabilityPriority).toBe(100);
    expect(profile.joinedDate).toBe('2026-11-25');
  });

  it('drops invalid alerts and duplicates', () => {
    const alerts = sanitizePriceAlerts([
      { id: 'a', itemId: 'item-001', targetPrice: 10, priceAtCreation: 20, createdAt: '2026-01-01T00:00:00Z', status: 'active' },
      { id: 'a', itemId: 'item-002', targetPrice: 10 },
      { id: 'b', itemId: 'item-404', targetPrice: 10 },
      { id: 'c', itemId: 'item-002', targetPrice: 0 },
      { id: 'd', itemId: 'item-003', targetPrice: 12, status: 'triggered', triggeredAt: 'garbage' },
      'junk',
    ]);
    expect(alerts.map((a) => a.id)).toEqual(['a', 'd']);
    expect(alerts[1]).toMatchObject({ status: 'triggered', triggeredAt: undefined, acknowledged: false });
  });

  it('clamps quest progress to the definition without auto-completing (rewards stay claimable)', () => {
    const progress = sanitizeQuestProgress({
      'quest-003': { status: 'in-progress', completedSteps: 50, startedAt: '2026-01-01T00:00:00Z' },
      'quest-001': { status: 'completed', completedSteps: 1 },
      'quest-002': { status: 'weird' },
      'quest-999': { status: 'in-progress' },
    });
    expect(progress['quest-003']).toMatchObject({ status: 'in-progress', completedSteps: 2 });
    expect(progress['quest-001']).toMatchObject({ status: 'completed', completedSteps: 5 });
    expect(progress['quest-002']).toBeUndefined();
    expect(progress['quest-999']).toBeUndefined();
  });

  it('gives timed quests a deadline when stored data lacks one', () => {
    const startedAt = '2026-11-20T10:00:00.000Z';
    const progress = sanitizeQuestProgress({
      'quest-002': { status: 'in-progress', completedSteps: 1, startedAt }, // 7-day quest
      'quest-003': { status: 'in-progress', completedSteps: 1, startedAt }, // untimed
    });
    expect(progress['quest-002'].deadline).toBe('2026-11-27T10:00:00.000Z');
    expect(progress['quest-003'].deadline).toBeUndefined();
  });

  it('keeps one purchase per item and validates platforms', () => {
    const purchases = sanitizePurchases([
      { itemId: 'item-001', pricePaid: 20, platform: 'Depop', originalPrice: 80, co2Saved: 5 },
      { itemId: 'item-001', pricePaid: 25, platform: 'Depop' },
      { itemId: 'item-002', pricePaid: 20, platform: 'eBay' },
      { itemId: 'item-003', pricePaid: -1, platform: 'Vinted' },
    ]);
    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toMatchObject({ itemId: 'item-001', pricePaid: 20, co2Saved: 5 });
  });

  it('cleans streaks', () => {
    expect(sanitizeStreak({ lastActiveDate: 'x', current: 3, longest: 1 })).toEqual({ lastActiveDate: null, current: 3, longest: 3 });
    expect(sanitizeStreak(undefined)).toEqual({ lastActiveDate: null, current: 0, longest: 0 });
  });
});

describe('migratePersistedState', () => {
  it('leaves current-version data alone', () => {
    const state = createDefaultPersistedState(NOW);
    expect(migratePersistedState(state, 2)).toBe(state);
  });

  it('handles empty or odd legacy data without throwing', () => {
    expect(() => migratePersistedState(undefined, 0)).not.toThrow();
    expect(() => migratePersistedState({ profile: 'x', quests: 'y', priceAlerts: [1, null] }, 0)).not.toThrow();
    const migrated = sanitizePersistedState(migratePersistedState({}, 0), NOW);
    expect(migrated.isProfileComplete).toBe(false);
    expect(migrated.profile?.totalXP).toBe(0);
  });
});
