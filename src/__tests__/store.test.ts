import AsyncStorage from '@react-native-async-storage/async-storage';
import { BADGE_IDS, QUEST_DEFINITIONS } from '../data/content';
import { QUESTION_IDS } from '../data/profilerQuestions';
import { CatalogRow } from '../services/catalog';
import { readCatalogCache } from '../store/catalogCache';
import { STORE_NAME, STORE_VERSION } from '../store/persistence';
import { CATALOG_SYNC_INTERVAL_MS, CORRUPT_BACKUP_SUFFIX, useStore } from '../store/useStore';
import { ProfilerAnswers } from '../types';
import { addDays } from '../utils/date';
import { dailyHistory, makeRow, NOW, sampleCatalogRows } from './helpers/fixtures';

jest.mock('../config', () => ({
  backendConfig: { url: 'https://vibevault-test.supabase.co', anonKey: 'sb_publishable_test' },
}));

// ---- Fake VibeVault backend (Supabase REST + live-item function) ----

let serverRows: CatalogRow[] = [];
let serverDown = false;
let serverStatus = 200;
let liveRow: CatalogRow | null = null;
const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (serverDown) throw new TypeError('Network request failed');
  const respond = (body: unknown, status = serverStatus) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
  if (url.includes('/rest/v1/catalog_items')) return respond(serverRows);
  if (url.includes('/rest/v1/catalog_status')) {
    return respond([{ source: 'flipkart', last_success_at: '2026-11-25T00:31:00Z', last_status: 'ok', last_message: null, available_listings: 5 }]);
  }
  if (url.includes('/functions/v1/live-item')) {
    const { id } = JSON.parse(String(init?.body));
    const row = liveRow ?? serverRows.find((r) => r.id === id);
    return row ? respond({ item: row, checked: 'live' }) : respond({ error: 'Listing not found.' }, 404);
  }
  return respond({ message: 'not found' }, 404);
});
global.fetch = fetchMock as unknown as typeof fetch;

const catalogCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/rest/v1/catalog_items'));

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

const SHIRT = 'flipkart:SHTFX123';
const JEANS = 'flipkart:JEAFX1';
const JACKET = 'ebay:v1|1234567890|0';

const store = () => useStore.getState();
const itemById = (id: string) => store().catalog.find((i) => i.id === id)!;

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Changes a listing on the fake server. */
function updateServerRow(id: string, patch: Partial<CatalogRow>) {
  serverRows = serverRows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

beforeAll(async () => {
  await flush(); // initial hydration from the (empty) mock storage
  expect(store().hasHydrated).toBe(true);
});

beforeEach(async () => {
  serverRows = sampleCatalogRows();
  serverDown = false;
  serverStatus = 200;
  liveRow = null;
  await store().syncCatalog({ force: true, now: NOW });
  store().resetAllData(NOW);
  fetchMock.mockClear();
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

describe('live catalogue sync', () => {
  it('loads real listings from the backend with their server refresh time', () => {
    expect(store().catalogStatus).toBe('ready');
    expect(store().catalog).toHaveLength(sampleCatalogRows().length);
    expect(store().catalogFetchedAt).toBe(NOW.toISOString());
    expect(store().catalogUpdatedAt).toBe('2026-11-25T00:31:00Z');
    expect(itemById(JACKET)).toMatchObject({ platform: 'eBay', currency: 'USD', currentPrice: 42.5 });
  });

  it('sends the public key, and asks for tracked listings even if they sold out', async () => {
    store().toggleWishlist(SHIRT);
    store().addPriceAlert(JACKET, 40, NOW);
    await store().syncCatalog({ force: true, now: NOW });
    const [url, init] = catalogCalls()[0];
    expect(decodeURIComponent(String(url))).toContain(`id.in.("${SHIRT}","${JACKET}")`);
    expect(String(url)).toContain('available.is.true');
    expect((init?.headers as Record<string, string>).apikey).toBe('sb_publishable_test');
    // Publishable (non-JWT) keys never go in the Authorization header.
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('does not refetch while fresh, unless forced', async () => {
    await store().syncCatalog({ now: new Date(NOW.getTime() + 60_000) });
    expect(catalogCalls()).toHaveLength(0);
    await store().syncCatalog({ now: new Date(NOW.getTime() + CATALOG_SYNC_INTERVAL_MS + 1) });
    expect(catalogCalls()).toHaveLength(1);
    await store().syncCatalog({ force: true, now: NOW });
    expect(catalogCalls()).toHaveLength(2);
  });

  it('shares one request between overlapping syncs', async () => {
    const [a, b] = await Promise.all([store().syncCatalog({ force: true, now: NOW }), store().syncCatalog({ force: true, now: NOW })]);
    expect(a && b).toBe(true);
    expect(catalogCalls()).toHaveLength(1);
  });

  it('keeps the last known prices when the server is unreachable', async () => {
    serverDown = true;
    expect(await store().syncCatalog({ force: true, now: NOW })).toBe(false);
    expect(store().catalogStatus).toBe('error');
    expect(store().catalogError).toMatch(/couldn't reach/);
    expect(store().catalog).toHaveLength(sampleCatalogRows().length);
  });

  it('reports HTTP errors', async () => {
    serverStatus = 500;
    expect(await store().syncCatalog({ force: true, now: NOW })).toBe(false);
    expect(store().catalogError).toMatch(/HTTP 500/);
  });

  it('caches the download and restores it on an offline start', async () => {
    const cache = await readCatalogCache();
    expect(cache?.rows).toHaveLength(sampleCatalogRows().length);
    expect(cache?.fetchedAt).toBe(NOW.toISOString());
    useStore.setState({ catalog: [], recommendedItems: [], catalogFetchedAt: null });
    await store().loadCachedCatalog();
    expect(store().catalog).toHaveLength(sampleCatalogRows().length);
    expect(store().catalogFetchedAt).toBe(NOW.toISOString());
  });

  it('skips rows that fail validation instead of failing the whole sync', async () => {
    serverRows = [...sampleCatalogRows(), makeRow({ id: 'flipkart:BAD', current_price: 'n/a' }), { junk: true } as never];
    expect(await store().syncCatalog({ force: true, now: NOW })).toBe(true);
    expect(store().catalog).toHaveLength(sampleCatalogRows().length);
  });

  it('keeps sold-out listings the user tracks, marked unavailable', async () => {
    store().toggleWishlist(SHIRT);
    updateServerRow(SHIRT, { available: false });
    await store().syncCatalog({ force: true, now: NOW });
    expect(itemById(SHIRT).available).toBe(false);
    expect(store().recommendedItems.find((i) => i.id === SHIRT)?.available).toBe(false);
  });
});

describe('live price check', () => {
  it('replaces the listing with the freshly checked one', async () => {
    liveRow = makeRow({ current_price: 599, last_checked_at: new Date(NOW.getTime() + 60_000).toISOString() });
    const result = await store().checkItemLive(SHIRT);
    expect(result?.checked).toBe('live');
    expect(result?.item?.currentPrice).toBe(599);
    expect(itemById(SHIRT).currentPrice).toBe(599);
    expect(store().recommendedItems.find((i) => i.id === SHIRT)?.currentPrice).toBe(599);
  });

  it('adds a listing that was not in the catalogue yet', async () => {
    liveRow = makeRow({ id: 'flipkart:NEW1', source_item_id: 'NEW1', title: 'New Listing' });
    await store().checkItemLive('flipkart:NEW1');
    expect(itemById('flipkart:NEW1').title).toBe('New Listing');
  });

  it('rejects when the backend fails (the screen keeps the recorded price)', async () => {
    await expect(store().checkItemLive('flipkart:UNKNOWN')).rejects.toThrow(/HTTP 404/);
    serverDown = true;
    await expect(store().checkItemLive(SHIRT)).rejects.toThrow();
    expect(itemById(SHIRT).currentPrice).toBe(649);
  });
});

describe('wishlist', () => {
  it('toggles listings, newest first, and ignores unknown ids', () => {
    expect(store().toggleWishlist(SHIRT)).toBe(true);
    expect(store().toggleWishlist(JEANS)).toBe(true);
    expect(store().profile.wishlist).toEqual([JEANS, SHIRT]);
    expect(store().toggleWishlist(SHIRT)).toBe(false);
    expect(store().profile.wishlist).toEqual([JEANS]);
    expect(store().toggleWishlist('flipkart:does-not-exist')).toBe(false);
    expect(store().profile.wishlist).toEqual([JEANS]);
  });

  it('can always remove a saved listing, even one no longer in the catalogue', () => {
    useStore.setState({ profile: { ...store().profile, wishlist: ['ebay:v1|gone|0'] } });
    expect(store().toggleWishlist('ebay:v1|gone|0')).toBe(false);
    expect(store().profile.wishlist).toEqual([]);
  });
});

describe('price alerts', () => {
  it('rejects invalid targets and unavailable listings', async () => {
    const item = itemById(SHIRT);
    expect(store().addPriceAlert(SHIRT, 0).ok).toBe(false);
    expect(store().addPriceAlert(SHIRT, -5).ok).toBe(false);
    expect(store().addPriceAlert(SHIRT, Number.NaN).ok).toBe(false);
    const atPrice = store().addPriceAlert(SHIRT, item.currentPrice);
    expect(atPrice.ok).toBe(false);
    if (!atPrice.ok) expect(atPrice.error).toContain('₹649');
    expect(store().addPriceAlert('flipkart:nope', 5).ok).toBe(false);

    store().toggleWishlist(JEANS);
    updateServerRow(JEANS, { available: false });
    await store().syncCatalog({ force: true, now: NOW });
    expect(store().addPriceAlert(JEANS, 100).ok).toBe(false);
    expect(store().priceAlerts).toHaveLength(0);
  });

  it('keeps one active alert per item, in the listing’s currency', () => {
    const a = store().addPriceAlert(JACKET, 40, NOW);
    const b = store().addPriceAlert(JACKET, 39.999, NOW);
    expect(a.ok && b.ok).toBe(true);
    expect(store().priceAlerts).toHaveLength(1);
    expect(store().priceAlerts[0]).toMatchObject({ targetPrice: 40, currency: 'USD', priceAtCreation: 42.5 });
  });

  it('triggers when the live price drops to the target, awards Price Prophet once and supports acknowledging', async () => {
    expect(store().addPriceAlert(SHIRT, 600, NOW).ok).toBe(true);
    expect(store().checkPriceAlerts(NOW).triggered).toHaveLength(0);

    // The marketplace price drops; the next sync picks it up.
    const later = addDays(NOW, 1);
    updateServerRow(SHIRT, { current_price: 599, price_history: dailyHistory([649, 599], later) });
    await store().syncCatalog({ force: true, now: later });
    const { triggered, newBadges } = store().checkPriceAlerts(later);
    expect(triggered).toHaveLength(1);
    expect(triggered[0].item.id).toBe(SHIRT);
    expect(triggered[0].alert).toMatchObject({ status: 'triggered', triggeredPrice: 599, acknowledged: false });
    expect(newBadges.map((b) => b.id)).toEqual([BADGE_IDS.priceProphet]);

    // A triggered alert never fires twice.
    expect(store().checkPriceAlerts(later).triggered).toHaveLength(0);

    store().acknowledgeTriggeredAlerts();
    expect(store().priceAlerts[0].acknowledged).toBe(true);
  });

  it('does not trigger for a listing that sold out', async () => {
    store().addPriceAlert(SHIRT, 600, NOW);
    updateServerRow(SHIRT, { current_price: 500, available: false });
    await store().syncCatalog({ force: true, now: NOW });
    expect(store().checkPriceAlerts(NOW).triggered).toHaveLength(0);
  });

  it('removes alerts', () => {
    const res = store().addPriceAlert(JEANS, 1500);
    if (!res.ok) throw new Error(res.error);
    store().removePriceAlert(res.alert.id);
    expect(store().priceAlerts).toHaveLength(0);
  });
});

describe('purchases', () => {
  it('logs a purchase once with its currency, clears its active alert and can be undone', () => {
    const item = itemById(JACKET);
    store().addPriceAlert(item.id, 40);
    const purchase = store().logPurchase(item.id, NOW);
    expect(purchase).toMatchObject({
      itemId: item.id,
      platform: 'eBay',
      currency: 'USD',
      pricePaid: 42.5,
      inrRate: 92.24,
      secondhand: true,
      co2Saved: item.co2Saved,
    });
    expect(store().priceAlerts).toHaveLength(0);
    expect(store().logPurchase(item.id, NOW)).toBeNull();
    expect(store().purchases).toHaveLength(1);
    store().undoPurchase(item.id);
    expect(store().purchases).toHaveLength(0);
    expect(store().logPurchase('flipkart:missing')).toBeNull();
  });

  it('records new retail purchases without CO₂ savings', () => {
    expect(store().logPurchase(SHIRT, NOW)).toMatchObject({ currency: 'INR', secondhand: false, co2Saved: 0, originalPrice: 1299 });
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

describe('reset & persistence', () => {
  it('reset wipes user data but keeps the live catalogue', () => {
    store().completeProfile(answers, NOW);
    store().toggleWishlist(SHIRT);
    store().startQuest('quest-001', NOW);
    store().resetAllData(NOW);
    expect(store().isProfileComplete).toBe(false);
    expect(store().profile.wishlist).toEqual([]);
    expect(store().questProgress).toEqual({});
    expect(store().profile.earnedBadges).toEqual({});
    expect(store().catalog).toHaveLength(sampleCatalogRows().length);
  });

  it('persists only user data (never the catalogue)', async () => {
    store().toggleWishlist(JACKET);
    await flush();
    const raw = await AsyncStorage.getItem(STORE_NAME);
    const saved = JSON.parse(raw!);
    expect(saved.version).toBe(STORE_VERSION);
    expect(Object.keys(saved.state).sort()).toEqual(
      ['isProfileComplete', 'priceAlerts', 'profile', 'purchases', 'questProgress', 'streak', 'vibeSummary'].sort(),
    );
    expect(saved.state.profile.wishlist).toEqual([JACKET]);
  });

  it('rehydrates and migrates a legacy (v0) snapshot, dropping old sample listings', async () => {
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
    expect(s.profile.wishlist).toEqual([]); // sample items never existed on a marketplace
    expect(s.priceAlerts).toEqual([]);
    expect(s.isProfileComplete).toBe(true);
    expect(s.profile.styleArchetypes[0]).toBe('Minimalist');
    expect(s.questProgress['quest-003'].status).toBe('completed');
    expect(s.questProgress['quest-001']).toMatchObject({ status: 'in-progress', completedSteps: 2 });
    expect(s.questProgress['quest-008']).toBeUndefined(); // never actually rewarded
    expect(s.purchases).toEqual([]);
    expect(s.catalog).toHaveLength(sampleCatalogRows().length);
    expect(s.recommendedItems[0].matchScore).toBeGreaterThan(0);
  });

  it('migrates a v2 snapshot, keeping progress and dropping sample-listing references', async () => {
    const v2 = {
      version: 2,
      state: {
        profile: { name: 'Two', totalXP: 900, points: 40, wishlist: ['item-001'], earnedBadges: { 'badge-001': '2026-10-01' } },
        priceAlerts: [{ id: 'a1', itemId: 'item-002', targetPrice: 10, priceAtCreation: 20, createdAt: '2026-10-01T00:00:00.000Z', status: 'active' }],
        purchases: [{ id: 'p1', itemId: 'item-003', title: 'Old', platform: 'Depop', pricePaid: 12, originalPrice: 40, co2Saved: 5, purchasedAt: '2026-10-01T00:00:00.000Z' }],
        streak: { lastActiveDate: '2026-11-24', current: 4, longest: 9 },
      },
    };
    await AsyncStorage.setItem(STORE_NAME, JSON.stringify(v2));
    await useStore.persist.rehydrate();
    expect(store().profile).toMatchObject({ name: 'Two', totalXP: 900, points: 40, wishlist: [], earnedBadges: { 'badge-001': '2026-10-01' } });
    expect(store().priceAlerts).toEqual([]);
    expect(store().purchases).toEqual([]);
    expect(store().streak).toMatchObject({ current: 4, longest: 9 });
  });

  it('backs up unreadable data, starts fresh and keeps saving', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.setItem(STORE_NAME, '{not json');
    await useStore.persist.rehydrate();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unreadable'));
    expect(store().hasHydrated).toBe(true);
    expect(store().storageAvailable).toBe(true);
    expect(store().catalog).toHaveLength(sampleCatalogRows().length);
    expect(await AsyncStorage.getItem(`${STORE_NAME}${CORRUPT_BACKUP_SUFFIX}`)).toBe('{not json');
    store().toggleWishlist(JEANS);
    await flush();
    expect(JSON.parse((await AsyncStorage.getItem(STORE_NAME))!).state.profile.wishlist).toEqual([JEANS]);
    warn.mockRestore();
  });

  const savedSnapshot = () =>
    JSON.stringify({
      version: STORE_VERSION,
      state: { profile: { name: 'Keep Me', totalXP: 2500, wishlist: [JEANS] }, streak: { lastActiveDate: '2026-11-24', current: 30, longest: 30 } },
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
      store().toggleWishlist(SHIRT);
      store().resetAllData(NOW);
      await flush();
      expect(await AsyncStorage.getItem(STORE_NAME)).toBe(saved);

      // Once storage reads work again, the data is intact and saving resumes.
      await useStore.persist.rehydrate();
      expect(store().storageAvailable).toBe(true);
      expect(store().profile).toMatchObject({ name: 'Keep Me', totalXP: 2500, wishlist: [JEANS] });
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

describe('unconfigured build', () => {
  it('reports that live prices are not connected and makes no requests', async () => {
    const config = jest.requireMock('../config') as { backendConfig: unknown };
    const original = config.backendConfig;
    config.backendConfig = null;
    try {
      expect(await store().syncCatalog({ force: true })).toBe(false);
      expect(store().catalogStatus).toBe('unconfigured');
      expect(await store().checkItemLive(SHIRT)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      config.backendConfig = original;
    }
  });
});
