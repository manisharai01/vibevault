import AsyncStorage from '@react-native-async-storage/async-storage';
import { BADGE_IDS, QUEST_DEFINITIONS, SEED_ITEMS } from '../data/mockData';
import { QUESTION_IDS } from '../data/profilerQuestions';
import { simulatedPrice } from '../services/priceEngine';
import { STORE_NAME, STORE_VERSION } from '../store/persistence';
import { CORRUPT_BACKUP_SUFFIX, useStore } from '../store/useStore';
import { ProfilerAnswers } from '../types';
import { addDays } from '../utils/date';

const NOW = new Date(2026, 10, 25, 10, 0);
const answers: ProfilerAnswers = {
  [QUESTION_IDS.personality]: 'extrovert',
  [QUESTION_IDS.thinking]: 'avant-garde',
  [QUESTION_IDS.music]: ['hip-hop'],
  [QUESTION_IDS.media]: ['anime'],
  [QUESTION_IDS.palette]: 'streetwear',
  [QUESTION_IDS.weekend]: 'streetwear',
  [QUESTION_IDS.sustainability]: 50,
  [QUESTION_IDS.budget]: 'budget-high',
};

const store = () => useStore.getState();
const itemById = (id: string) => store().catalog.find((i) => i.id === id)!;

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeAll(async () => {
  await flush(); // initial hydration from the (empty) mock storage
  expect(store().hasHydrated).toBe(true);
});

beforeEach(() => {
  store().refreshCatalog(NOW, true);
  store().resetAllData(NOW);
});

describe('profile', () => {
  it('completes the profile, personalises recommendations and awards First Find once', () => {
    expect(store().recommendedItems.every((i) => i.matchScore === 0)).toBe(true);
    const first = store().completeProfile(answers, NOW);
    expect(first.newBadges.map((b) => b.id)).toEqual([BADGE_IDS.firstFind]);
    expect(store().isProfileComplete).toBe(true);
    expect(store().profile.styleArchetypes[0]).toBe('Streetwear');
    expect(store().profile.profilerAnswers).toEqual(answers);
    expect(store().vibeSummary).toMatch(/Your vibe/);
    expect(store().recommendedItems[0].matchScore).toBeGreaterThan(0);
    // Retaking the quiz doesn't award the badge again.
    expect(store().completeProfile(answers, NOW).newBadges).toEqual([]);
  });

  it('validates display names', () => {
    expect(store().setName('   ')).toBe(false);
    expect(store().profile.name).toBe('VibeVault User');
    expect(store().setName('  Riya   Sharma  ')).toBe(true);
    expect(store().profile.name).toBe('Riya Sharma');
    store().setName('x'.repeat(100));
    expect(store().profile.name).toHaveLength(24);
  });
});

describe('wishlist', () => {
  it('toggles items, newest first, and ignores unknown ids', () => {
    expect(store().toggleWishlist('item-001')).toBe(true);
    expect(store().toggleWishlist('item-002')).toBe(true);
    expect(store().profile.wishlist).toEqual(['item-002', 'item-001']);
    expect(store().toggleWishlist('item-001')).toBe(false);
    expect(store().profile.wishlist).toEqual(['item-002']);
    expect(store().toggleWishlist('does-not-exist')).toBe(false);
    expect(store().profile.wishlist).toEqual(['item-002']);
  });
});

describe('price alerts', () => {
  it('rejects invalid targets', () => {
    const item = itemById('item-001');
    expect(store().addPriceAlert('item-001', 0).ok).toBe(false);
    expect(store().addPriceAlert('item-001', -5).ok).toBe(false);
    expect(store().addPriceAlert('item-001', Number.NaN).ok).toBe(false);
    expect(store().addPriceAlert('item-001', item.currentPrice).ok).toBe(false);
    expect(store().addPriceAlert('nope', 5).ok).toBe(false);
    expect(store().priceAlerts).toHaveLength(0);
  });

  it('keeps one active alert per item', () => {
    const item = itemById('item-001');
    const a = store().addPriceAlert('item-001', item.currentPrice - 1, NOW);
    const b = store().addPriceAlert('item-001', item.currentPrice - 2, NOW);
    expect(a.ok && b.ok).toBe(true);
    expect(store().priceAlerts).toHaveLength(1);
    expect(store().priceAlerts[0].targetPrice).toBeCloseTo(item.currentPrice - 2, 2);
  });

  it('triggers when the simulated price drops to the target, awards Price Prophet and supports acknowledging', () => {
    const seed = SEED_ITEMS[0];
    const today = simulatedPrice(seed, NOW);
    // Find the first upcoming day with a lower price.
    let dropDay = 0;
    for (let d = 1; d <= 60 && !dropDay; d++) if (simulatedPrice(seed, addDays(NOW, d)) < today) dropDay = d;
    expect(dropDay).toBeGreaterThan(0);
    const dropPrice = simulatedPrice(seed, addDays(NOW, dropDay));

    const result = store().addPriceAlert(seed.id, dropPrice, NOW);
    expect(result.ok).toBe(true);
    expect(store().checkPriceAlerts(NOW).triggered).toHaveLength(0);

    const later = addDays(NOW, dropDay);
    store().refreshCatalog(later);
    const { triggered, newBadges } = store().checkPriceAlerts(later);
    expect(triggered).toHaveLength(1);
    expect(triggered[0].item.id).toBe(seed.id);
    expect(triggered[0].alert).toMatchObject({ status: 'triggered', triggeredPrice: dropPrice, acknowledged: false });
    expect(newBadges.map((b) => b.id)).toEqual([BADGE_IDS.priceProphet]);

    // A triggered alert never fires twice.
    expect(store().checkPriceAlerts(later).triggered).toHaveLength(0);

    store().acknowledgeTriggeredAlerts();
    expect(store().priceAlerts[0].acknowledged).toBe(true);
  });

  it('removes alerts', () => {
    const item = itemById('item-002');
    const res = store().addPriceAlert(item.id, item.currentPrice - 1);
    if (!res.ok) throw new Error(res.error);
    store().removePriceAlert(res.alert.id);
    expect(store().priceAlerts).toHaveLength(0);
  });
});

describe('purchases', () => {
  it('logs a purchase once, clears its active alert and can be undone', () => {
    const item = itemById('item-005');
    store().addPriceAlert(item.id, item.currentPrice - 1);
    const purchase = store().logPurchase(item.id, NOW);
    expect(purchase).toMatchObject({ itemId: item.id, pricePaid: item.currentPrice, co2Saved: item.co2Saved });
    expect(store().priceAlerts).toHaveLength(0);
    expect(store().logPurchase(item.id, NOW)).toBeNull();
    expect(store().purchases).toHaveLength(1);
    store().undoPurchase(item.id);
    expect(store().purchases).toHaveLength(0);
    expect(store().logPurchase('missing')).toBeNull();
  });
});

describe('quests', () => {
  const quest = QUEST_DEFINITIONS.find((q) => q.id === 'quest-003')!; // 3 steps, badge reward

  it('starts, progresses and completes, paying rewards exactly once', () => {
    expect(store().completeQuestStep(quest.id, NOW)).toEqual({ status: 'invalid' });
    expect(store().startQuest(quest.id, NOW)).toBe(true);
    expect(store().startQuest(quest.id, NOW)).toBe(false);

    expect(store().completeQuestStep(quest.id, NOW)).toEqual({ status: 'progressed', completedSteps: 1, totalSteps: 3 });
    expect(store().completeQuestStep(quest.id, NOW)).toEqual({ status: 'progressed', completedSteps: 2, totalSteps: 3 });
    const done = store().completeQuestStep(quest.id, NOW);
    expect(done).toMatchObject({ status: 'completed', xp: quest.xpReward, points: quest.pointsReward, newLevel: 2 });
    if (done.status === 'completed') expect(done.badge?.id).toBe(quest.badgeId);

    // Rapid double taps can't pay out twice.
    expect(store().completeQuestStep(quest.id, NOW)).toEqual({ status: 'invalid' });
    expect(store().profile.totalXP).toBe(quest.xpReward);
    expect(store().profile.points).toBe(quest.pointsReward);
    expect(store().profile.completedQuests).toEqual([quest.id]);
    expect(store().profile.earnedBadges[quest.badgeId!]).toBe('2026-11-25');
    expect(store().questProgress[quest.id].status).toBe('completed');
    expect(store().startQuest(quest.id, NOW)).toBe(false);
  });

  it('expires timed quests and lets them be restarted', () => {
    const timed = QUEST_DEFINITIONS.find((q) => q.durationDays)!;
    store().startQuest(timed.id, NOW);
    store().completeQuestStep(timed.id, NOW);
    const late = addDays(NOW, timed.durationDays! + 1);
    expect(store().completeQuestStep(timed.id, late)).toEqual({ status: 'expired' });
    expect(store().questProgress[timed.id].status).toBe('expired');
    expect(store().profile.totalXP).toBe(0);

    expect(store().startQuest(timed.id, late)).toBe(true);
    expect(store().questProgress[timed.id]).toMatchObject({ status: 'in-progress', completedSteps: 0 });
  });

  it('expireQuests marks only overdue in-progress quests', () => {
    const timed = QUEST_DEFINITIONS.find((q) => q.durationDays)!;
    const untimed = QUEST_DEFINITIONS.find((q) => !q.durationDays)!;
    store().startQuest(timed.id, NOW);
    store().startQuest(untimed.id, NOW);
    expect(store().expireQuests(addDays(NOW, 1))).toEqual([]);
    expect(store().expireQuests(addDays(NOW, 30))).toEqual([timed.id]);
    expect(store().questProgress[untimed.id].status).toBe('in-progress');
  });
});

describe('daily streak', () => {
  it('awards Thrift Streak after 7 consecutive days, and only once', () => {
    let badges: string[] = [];
    for (let d = 0; d < 7; d++) {
      badges = badges.concat(store().recordDailyVisit(addDays(NOW, d)).newBadges.map((b) => b.id));
    }
    expect(store().streak.current).toBe(7);
    expect(badges).toEqual([BADGE_IDS.thriftStreak]);
    expect(store().recordDailyVisit(addDays(NOW, 7)).newBadges).toEqual([]);
    store().recordDailyVisit(addDays(NOW, 10));
    expect(store().streak).toMatchObject({ current: 1, longest: 8 });
  });
});

describe('catalogue refresh', () => {
  it('only rebuilds when the day changes (or when forced)', () => {
    const before = store().catalog;
    store().refreshCatalog(new Date(2026, 10, 25, 22, 0));
    expect(store().catalog).toBe(before);
    store().refreshCatalog(addDays(NOW, 1));
    expect(store().catalog).not.toBe(before);
    expect(store().catalogDate).toBe('2026-11-26');
  });
});

describe('reset & persistence', () => {
  it('reset wipes user data', () => {
    store().completeProfile(answers, NOW);
    store().toggleWishlist('item-001');
    store().startQuest('quest-001', NOW);
    store().resetAllData(NOW);
    expect(store().isProfileComplete).toBe(false);
    expect(store().profile.wishlist).toEqual([]);
    expect(store().questProgress).toEqual({});
    expect(store().profile.earnedBadges).toEqual({});
  });

  it('persists only user data (never the catalogue)', async () => {
    store().toggleWishlist('item-003');
    await flush();
    const raw = await AsyncStorage.getItem(STORE_NAME);
    const saved = JSON.parse(raw!);
    expect(saved.version).toBe(STORE_VERSION);
    expect(Object.keys(saved.state).sort()).toEqual(
      ['isProfileComplete', 'priceAlerts', 'profile', 'purchases', 'questProgress', 'streak', 'vibeSummary'].sort(),
    );
    expect(saved.state.profile.wishlist).toEqual(['item-003']);
  });

  it('rehydrates and migrates a legacy (v0) snapshot', async () => {
    const legacy = {
      version: 0,
      state: {
        profile: {
          id: 'user-001',
          name: 'Legacy',
          personalityTraits: ['introvert', 'analytical'],
          musicGenres: ['jazz'],
          mediaPreferences: ['documentary'],
          styleArchetypes: ['Minimalist'],
          vibeScore: 100,
          level: 2,
          xp: 50,
          xpToNext: 200,
          points: 120,
          badges: [{ id: 'badge-003', name: 'Style Chameleon', earnedDate: '2026-03-01' }],
          completedQuests: ['quest-003'],
          wishlist: ['item-001', 'item-999'],
          joinedDate: '2026-02-01',
        },
        isProfileComplete: true,
        vibeSummary: 'old',
        allItems: [{ id: 'item-001' }],
        recommendedItems: [],
        wishlistItems: [],
        priceAlerts: [{ id: 'alert-1', itemId: 'item-001', targetPrice: 10, currentPrice: 30, active: true, createdAt: '2026-03-01T00:00:00.000Z' }],
        quests: [
          { id: 'quest-003', status: 'completed', completedSteps: 3 },
          { id: 'quest-001', status: 'in-progress', completedSteps: 2 },
          { id: 'quest-008', status: 'completed', completedSteps: 3 },
        ],
        sustainability: { totalCO2Saved: 2.8 },
      },
    };
    await AsyncStorage.setItem(STORE_NAME, JSON.stringify(legacy));
    await useStore.persist.rehydrate();

    const s = store();
    expect(s.profile.name).toBe('Legacy');
    expect(s.profile.totalXP).toBe(150);
    expect(s.profile.earnedBadges).toEqual({ 'badge-003': '2026-03-01' });
    expect(s.profile.wishlist).toEqual(['item-001']);
    expect(s.isProfileComplete).toBe(true);
    expect(s.profile.styleArchetypes[0]).toBe('Minimalist');
    expect(s.priceAlerts[0]).toMatchObject({ id: 'alert-1', priceAtCreation: 30, status: 'active' });
    expect(s.questProgress['quest-003'].status).toBe('completed');
    expect(s.questProgress['quest-001']).toMatchObject({ status: 'in-progress', completedSteps: 2 });
    expect(s.questProgress['quest-008']).toBeUndefined(); // never actually rewarded
    expect(s.purchases).toEqual([]);
    expect(s.catalog.length).toBe(SEED_ITEMS.length);
    expect(s.recommendedItems[0].matchScore).toBeGreaterThan(0);
  });

  it('backs up unreadable data, starts fresh and keeps saving', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.setItem(STORE_NAME, '{not json');
    await useStore.persist.rehydrate();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unreadable'));
    expect(store().hasHydrated).toBe(true);
    expect(store().storageAvailable).toBe(true);
    expect(store().catalog.length).toBe(SEED_ITEMS.length);
    expect(await AsyncStorage.getItem(`${STORE_NAME}${CORRUPT_BACKUP_SUFFIX}`)).toBe('{not json');
    store().toggleWishlist('item-002');
    await flush();
    expect(JSON.parse((await AsyncStorage.getItem(STORE_NAME))!).state.profile.wishlist).toEqual(['item-002']);
    warn.mockRestore();
  });

  const savedSnapshot = () =>
    JSON.stringify({
      version: STORE_VERSION,
      state: { profile: { name: 'Keep Me', totalXP: 2500, wishlist: ['item-004'] }, streak: { lastActiveDate: '2026-11-24', current: 30, longest: 30 } },
    });

  const getItemMock = AsyncStorage.getItem as jest.Mock;
  const failRead = () => getItemMock.mockImplementationOnce(() => Promise.reject(new Error('disk I/O error')));

  it('never overwrites saved data it could not read', async () => {
    const saved = savedSnapshot();
    await AsyncStorage.setItem(STORE_NAME, saved);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      failRead();
      failRead(); // the retry fails too
      const callsBefore = getItemMock.mock.calls.length;
      await useStore.persist.rehydrate();
      expect(getItemMock.mock.calls.length - callsBefore).toBe(2);
      expect(store().hasHydrated).toBe(true);
      expect(store().storageAvailable).toBe(false);

      // The app keeps working in memory, but nothing is written over the saved data.
      store().toggleWishlist('item-001');
      store().resetAllData(NOW);
      await flush();
      expect(await AsyncStorage.getItem(STORE_NAME)).toBe(saved);

      // Once storage reads work again, the data is intact and saving resumes.
      await useStore.persist.rehydrate();
      expect(store().storageAvailable).toBe(true);
      expect(store().profile).toMatchObject({ name: 'Keep Me', totalXP: 2500, wishlist: ['item-004'] });
      expect(store().streak.current).toBe(30);
    } finally {
      warn.mockRestore();
    }
  });

  it('retries a transient read failure', async () => {
    await AsyncStorage.setItem(STORE_NAME, savedSnapshot());
    failRead(); // only the first attempt fails
    await useStore.persist.rehydrate();
    expect(store().storageAvailable).toBe(true);
    expect(store().profile.name).toBe('Keep Me');
  });
});
