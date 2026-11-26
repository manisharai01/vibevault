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
        wishlist: ['flipkart:SHTFX123', 'item-404', 'flipkart:SHTFX123', null, 'ebay:v1|1|0', 'amazon:B0X', 'ebay:has space'],
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
    // Old sample ids and unknown sources are dropped; live listing ids are kept once.
    expect(profile.wishlist).toEqual(['flipkart:SHTFX123', 'ebay:v1|1|0']);
    expect(profile.completedQuests).toEqual(['quest-001']);
    expect(profile.budgetTier).toBeNull();
    expect(profile.sustainabilityPriority).toBe(100);
    expect(profile.joinedDate).toBe('2026-11-25');
  });

  it('drops invalid alerts, old sample items and duplicates', () => {
    const alerts = sanitizePriceAlerts([
      { id: 'a', itemId: 'flipkart:A1', currency: 'INR', targetPrice: 10, priceAtCreation: 20, createdAt: '2026-01-01T00:00:00Z', status: 'active' },
      { id: 'a', itemId: 'flipkart:A2', currency: 'INR', targetPrice: 10 },
      { id: 'b', itemId: 'item-404', currency: 'USD', targetPrice: 10 }, // old sample listing
      { id: 'c', itemId: 'flipkart:A2', currency: 'INR', targetPrice: 0 },
      { id: 'e', itemId: 'ebay:v1|2|0', targetPrice: 10 }, // no currency (pre-v3)
      { id: 'f', itemId: 'ebay:v1|2|0', currency: 'usd', targetPrice: 10 },
      { id: 'd', itemId: 'ebay:v1|3|0', currency: 'USD', targetPrice: 12, status: 'triggered', triggeredAt: 'garbage' },
      'junk',
    ]);
    expect(alerts.map((a) => a.id)).toEqual(['a', 'd']);
    expect(alerts[0]).toMatchObject({ currency: 'INR', priceAtCreation: 20, acknowledged: true });
    expect(alerts[1]).toMatchObject({ currency: 'USD', status: 'triggered', triggeredAt: undefined, acknowledged: false });
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

  it('keeps one purchase per item and validates platforms and currencies', () => {
    const purchases = sanitizePurchases([
      { itemId: 'ebay:v1|1|0', pricePaid: 20, platform: 'eBay', currency: 'USD', originalPrice: 80, inrRate: 92.24, co2Saved: 5 },
      { itemId: 'ebay:v1|1|0', pricePaid: 25, platform: 'eBay', currency: 'USD' },
      { itemId: 'flipkart:A1', pricePaid: 649, platform: 'Flipkart', currency: 'INR', originalPrice: 0 },
      { itemId: 'item-002', pricePaid: 20, platform: 'Depop', currency: 'USD' }, // old sample listing
      { itemId: 'ebay:v1|3|0', pricePaid: -1, platform: 'eBay', currency: 'USD' },
      { itemId: 'ebay:v1|4|0', pricePaid: 10, platform: 'Vinted', currency: 'USD' },
      { itemId: 'ebay:v1|5|0', pricePaid: 10, platform: 'eBay' },
    ]);
    expect(purchases.map((p) => p.itemId)).toEqual(['ebay:v1|1|0', 'flipkart:A1']);
    expect(purchases[0]).toMatchObject({ pricePaid: 20, currency: 'USD', originalPrice: 80, inrRate: 92.24, secondhand: true, co2Saved: 5 });
    expect(purchases[1]).toMatchObject({ currency: 'INR', originalPrice: null, inrRate: 1, secondhand: false, co2Saved: 0 });
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
    expect(migratePersistedState(state, 3)).toBe(state);
  });

  it('handles empty or odd legacy data without throwing', () => {
    expect(() => migratePersistedState(undefined, 0)).not.toThrow();
    expect(() => migratePersistedState({ profile: 'x', quests: 'y', priceAlerts: [1, null] }, 0)).not.toThrow();
    const migrated = sanitizePersistedState(migratePersistedState({}, 0), NOW);
    expect(migrated.isProfileComplete).toBe(false);
    expect(migrated.profile?.totalXP).toBe(0);
  });
});
