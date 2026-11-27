import {
  createDefaultPersistedState,
  createDefaultProfile,
  migrateListingId,
  migratePersistedState,
  sanitizePersistedState,
  sanitizePriceAlerts,
  sanitizeProfile,
  sanitizePurchases,
  sanitizeQuestProgress,
  sanitizeStreak,
} from '../store/persistence';

const NOW = new Date(2026, 10, 25, 10, 0);

describe('defaults', () => {
  it('guesses the currency from the device locale but leaves the country to the user', () => {
    expect(createDefaultProfile(NOW, 'en-IN')).toMatchObject({ country: null, currency: 'INR', shopFor: null, profilerVersion: 0 });
    expect(createDefaultProfile(NOW, 'de-DE').currency).toBe('EUR');
    expect(createDefaultProfile(NOW, 'xx').currency).toBe('INR');
  });
});

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
        country: 'zz',
        currency: 'rupees',
        shopFor: 'kids',
        traits: { polish: 3, edge: 'x', magic: 1 },
        likedColors: ['black', 'black', 'tartan', 'white'],
        avoidColors: ['white', 'yellow'],
        fit: 'baggy',
        occasions: ['work', 'party', 'work'],
        budgetMax: -5,
        tasteRatings: [
          { itemId: 'a', liked: true, archetypes: ['Bohemian', 'Fake'], colors: ['green', 'x'], category: 'Dresses' },
          { itemId: 'a', liked: false, archetypes: [], colors: [], category: 'Dresses' },
          { itemId: 'b', liked: 'yes', archetypes: [], colors: [], category: 'Tops' },
          { itemId: 'c', liked: true, archetypes: [], colors: [], category: 'Hats' },
        ],
        styleScores: { Y2K: 140, Grunge: -3, Fake: 50, Minimalist: 'x' },
        styleReasons: [{ archetype: 'Y2K', text: 'Because' }, { archetype: 'Nope', text: 'x' }, { archetype: 'Y2K', text: '' }],
        totalXP: -10,
        points: 'lots',
        earnedBadges: { 'badge-001': '2026-01-01', 'badge-999': '2026-01-01', 'badge-002': 'yesterday' },
        wishlist: ['flipkart:IN:SHTFX123', 'item-404', 'flipkart:IN:SHTFX123', null, 'ebay:US:v1|1|0', 'flipkart:SHTFX123', 'ebay:GB:has space'],
        completedQuests: ['quest-001', 'quest-x'],
        sustainabilityPriority: 900,
        joinedDate: 'Feb 1',
      },
      NOW,
    );
    expect(profile).toMatchObject({
      name: 'VibeVault User',
      country: null,
      shopFor: null,
      traits: { polish: 1 },
      likedColors: ['black', 'white'],
      // Loved colours can't also be avoided.
      avoidColors: ['yellow'],
      fit: null,
      occasions: ['work'],
      budgetMax: null,
      styleScores: { Y2K: 100 },
      styleReasons: [{ archetype: 'Y2K', text: 'Because' }],
      totalXP: 0,
      points: 0,
      earnedBadges: { 'badge-001': '2026-01-01' },
      // Old-format and sample ids are dropped; listing ids with a market are kept once.
      wishlist: ['flipkart:IN:SHTFX123', 'ebay:US:v1|1|0'],
      completedQuests: ['quest-001'],
      sustainabilityPriority: 100,
      joinedDate: '2026-11-25',
    });
    expect(profile.tasteRatings).toEqual([{ itemId: 'a', liked: true, archetypes: ['Bohemian'], colors: ['green'], category: 'Dresses' }]);
    expect(profile.currency).toMatch(/^[A-Z]{3}$/);
  });

  it('takes the country’s currency when the stored currency is unusable', () => {
    expect(sanitizeProfile({ country: 'gb', currency: 12 }, NOW)).toMatchObject({ country: 'GB', currency: 'GBP' });
  });

  it('drops invalid alerts, old sample items and duplicates', () => {
    const alerts = sanitizePriceAlerts([
      { id: 'a', itemId: 'flipkart:IN:A1', currency: 'INR', targetPrice: 10, priceAtCreation: 20, createdAt: '2026-01-01T00:00:00Z', status: 'active' },
      { id: 'a', itemId: 'flipkart:IN:A2', currency: 'INR', targetPrice: 10 },
      { id: 'b', itemId: 'item-404', currency: 'USD', targetPrice: 10 },
      { id: 'c', itemId: 'flipkart:IN:A2', currency: 'INR', targetPrice: 0 },
      { id: 'e', itemId: 'ebay:IN:v1|2|0', targetPrice: 10 },
      { id: 'd', itemId: 'ebay:IN:v1|3|0', currency: 'USD', targetPrice: 12, status: 'triggered', triggeredAt: 'garbage' },
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
      'quest-002': { status: 'in-progress', completedSteps: 1, startedAt },
      'quest-003': { status: 'in-progress', completedSteps: 1, startedAt },
    });
    expect(progress['quest-002'].deadline).toBe('2026-11-27T10:00:00.000Z');
    expect(progress['quest-003'].deadline).toBeUndefined();
  });

  it('keeps one purchase per item and validates ids and currencies', () => {
    const purchases = sanitizePurchases([
      { itemId: 'ebay:IN:v1|1|0', pricePaid: 20, platform: 'eBay', currency: 'USD', originalPrice: 80, homeCurrency: 'INR', paidInHome: 1856, savedInHome: 5568, secondhand: true },
      { itemId: 'ebay:IN:v1|1|0', pricePaid: 25, platform: 'eBay', currency: 'USD' },
      { itemId: 'flipkart:IN:A1', pricePaid: 649, platform: 'Flipkart', currency: 'INR', originalPrice: 0 },
      { itemId: 'item-002', pricePaid: 20, platform: 'Depop', currency: 'USD' },
      { itemId: 'ebay:IN:v1|3|0', pricePaid: -1, platform: 'eBay', currency: 'USD' },
      { itemId: 'ebay:IN:v1|5|0', pricePaid: 10, platform: 'eBay' },
    ]);
    expect(purchases.map((p) => p.itemId)).toEqual(['ebay:IN:v1|1|0', 'flipkart:IN:A1']);
    expect(purchases[0]).toMatchObject({ homeCurrency: 'INR', paidInHome: 1856, savedInHome: 5568, secondhand: true });
    expect(purchases[1]).toMatchObject({ originalPrice: null, homeCurrency: 'INR', paidInHome: 649, savedInHome: null, secondhand: false });
  });

  it('cleans streaks', () => {
    expect(sanitizeStreak({ lastActiveDate: 'x', current: 3, longest: 1 })).toEqual({ lastActiveDate: null, current: 3, longest: 3 });
    expect(sanitizeStreak(undefined)).toEqual({ lastActiveDate: null, current: 0, longest: 0 });
  });
});

describe('migratePersistedState', () => {
  it('leaves current-version data alone', () => {
    const state = createDefaultPersistedState(NOW);
    expect(migratePersistedState(state, 4)).toBe(state);
  });

  it('adds the market to v3 listing ids', () => {
    expect(migrateListingId('flipkart:SHTFX123')).toBe('flipkart:IN:SHTFX123');
    expect(migrateListingId('ebay:v1|1|0')).toBe('ebay:IN:v1|1|0');
    expect(migrateListingId('ebay:IN:v1|1|0')).toBe('ebay:IN:v1|1|0');
    expect(migrateListingId(5)).toBe(5);
  });

  it('moves a v3 (India-only) install to global listings, keeping its data', () => {
    const v3 = {
      profile: {
        ...createDefaultProfile(NOW),
        styleArchetypes: ['Minimalist'],
        styleScores: { Minimalist: 100 },
        budgetTier: 'budget-mid',
        wishlist: ['flipkart:SHTFX123', 'ebay:v1|1|0'],
      },
      isProfileComplete: true,
      vibeSummary: 'Your vibe: clean lines.',
      priceAlerts: [{ id: 'a', itemId: 'flipkart:SHTFX123', currency: 'INR', targetPrice: 500, status: 'active' }],
      purchases: [
        { id: 'p', itemId: 'ebay:v1|9|0', title: 'Jacket', platform: 'eBay', currency: 'USD', pricePaid: 30, originalPrice: 90, inrRate: 90, secondhand: true, co2Saved: 12 },
      ],
      questProgress: {},
      streak: { lastActiveDate: null, current: 0, longest: 0 },
    };
    const migrated = sanitizePersistedState(migratePersistedState(v3, 3), NOW);
    expect(migrated.isProfileComplete).toBe(true);
    expect(migrated.profile).toMatchObject({
      country: 'IN',
      currency: 'INR',
      budgetMax: 1500,
      profilerVersion: 1,
      styleScores: { Minimalist: 100 },
      wishlist: ['flipkart:IN:SHTFX123', 'ebay:IN:v1|1|0'],
    });
    expect(migrated.priceAlerts?.[0].itemId).toBe('flipkart:IN:SHTFX123');
    expect(migrated.purchases?.[0]).toMatchObject({ itemId: 'ebay:IN:v1|9|0', homeCurrency: 'INR', paidInHome: 2700, savedInHome: 5400, secondhand: true });
  });

  it('handles empty or odd legacy data without throwing', () => {
    expect(() => migratePersistedState(undefined, 0)).not.toThrow();
    expect(() => migratePersistedState({ profile: 'x', quests: 'y', priceAlerts: [1, null] }, 0)).not.toThrow();
    const migrated = sanitizePersistedState(migratePersistedState({}, 0), NOW);
    expect(migrated.isProfileComplete).toBe(false);
    expect(migrated.profile?.totalXP).toBe(0);
  });
});
