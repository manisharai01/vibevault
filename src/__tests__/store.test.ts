import AsyncStorage from '@react-native-async-storage/async-storage';
import { BADGE_IDS, QUEST_DEFINITIONS } from '../data/content';
import { PROFILER_VERSION, QUESTION_IDS as Q } from '../data/profilerQuestions';
import { CatalogRow } from '../services/catalog';
import { readCatalogCache } from '../store/catalogCache';
import { STORE_NAME, STORE_VERSION } from '../store/persistence';
import { CATALOG_SYNC_INTERVAL_MS, CORRUPT_BACKUP_SUFFIX, useStore } from '../store/useStore';
import { ProfilerAnswers } from '../types';
import { addDays } from '../utils/date';
import { dailyHistory, makeRow, NOW, predictionJson, sampleCatalogRows } from './helpers/fixtures';

jest.mock('../config', () => ({
  backendConfig: { url: 'https://vibevault-test.supabase.co', anonKey: 'sb_publishable_test' },
}));

// ---- Fake VibeVault backend (Supabase REST + live-item function) ----

let serverRows: CatalogRow[] = [];
let serverDown = false;
let serverStatus = 200;
let liveRow: CatalogRow | null = null;
const offerRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id: `cuelinks:IN:${id}`,
  network: 'cuelinks',
  market: 'IN',
  merchant: 'Myntra',
  merchant_domain: 'myntra.com',
  source: null,
  listing_id: null,
  title: `Offer ${id}`,
  description: null,
  code: 'MYN10',
  url: `https://linksredirect.com/${id}`,
  discount_text: '10% off',
  min_spend: null,
  currency: null,
  starts_at: null,
  ends_at: '2099-01-01T00:00:00Z',
  last_seen_at: new Date().toISOString(),
  ...extra,
});
const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = decodeURIComponent(String(input));
  if (serverDown) throw new TypeError('Network request failed');
  const respond = (body: unknown, status = serverStatus) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
  if (url.includes('/rest/v1/catalog_items')) {
    const market = /market\.eq\.([A-Z]{2})/.exec(url)?.[1];
    return respond(market ? serverRows.filter((r) => r.market === market || url.includes(`"${r.id}"`)) : serverRows);
  }
  if (url.includes('/rest/v1/catalog_status')) {
    return respond([
      { source: 'flipkart', name: 'Flipkart', attribution: null, last_success_at: '2026-11-25T00:31:00Z', available_listings: 19, markets: ['IN'] },
      { source: 'ebay', name: 'eBay', attribution: null, last_success_at: '2026-11-25T00:45:00Z', available_listings: 1, markets: ['IN'] },
    ]);
  }
  if (url.includes('/rest/v1/fx_latest')) {
    return respond([
      { currency: 'INR', per_eur: '98.4', observed_on: '2026-11-24' },
      { currency: 'USD', per_eur: 1.06, observed_on: '2026-11-24' },
    ]);
  }
  if (url.includes('/rest/v1/active_offers')) return respond([offerRow('a'), offerRow('b', { code: null }), { junk: true }]);
  if (url.includes('/rest/v1/prediction_track_record')) {
    return respond([{ horizon_days: 14, source: null, resolved: 120, dropped: 50, brier: 0.18, brier_base_rate: 0.24, wait_calls: 40, wait_correct: 29, buy_calls: 60, buy_correct: 51, since: '2026-10-01' }]);
  }
  if (url.includes('/rest/v1/prediction_calibration')) return respond([{ horizon_days: 14, bucket: 4, resolved: 30, predicted: 0.7, observed: 0.66 }]);
  if (url.includes('/rest/v1/available_markets')) return respond([{ market: 'IN', listings: 20, sources: ['ebay', 'flipkart'] }]);
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
  [Q.country]: 'IN',
  [Q.shopFor]: 'women',
  [Q.social]: 'observer',
  [Q.trends]: 'wait',
  [Q.routine]: 'planned',
  [Q.compliment]: 'put-together',
  [Q.rules]: 'helpful',
  [Q.freeDay]: 'cafe',
  [Q.colorsLove]: ['black', 'white', 'neutral'],
  [Q.fit]: 'fitted',
  [Q.occasions]: ['work'],
  [Q.budget]: 1500,
  [Q.sustainability]: 50,
};

const SHIRT = 'flipkart:IN:P000'; // Women White Linen Shirt, ₹899
const JEANS = 'flipkart:IN:P004'; // Women High Waist Black Jeans
const JACKET = 'ebay:IN:v1|1234567890|0'; // $42.50, pre-owned

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
  store().resetAllData(NOW);
  await store().syncCatalog({ force: true, now: NOW });
  fetchMock.mockClear();
});

describe('profile', () => {
  it('completes the profile from the new profiler, personalises recommendations and awards First Find once', () => {
    expect(store().recommendedItems.every((i) => i.matchScore === 0)).toBe(true);
    const first = store().completeProfile(answers, [], NOW);
    expect(first.newBadges.map((b) => b.id)).toEqual([BADGE_IDS.firstFind]);
    expect(store().isProfileComplete).toBe(true);
    expect(store().profile).toMatchObject({
      country: 'IN',
      currency: 'INR',
      shopFor: 'women',
      likedColors: ['black', 'white', 'neutral'],
      fit: 'fitted',
      occasions: ['work'],
      budgetMax: 1500,
      profilerVersion: PROFILER_VERSION,
    });
    expect(store().profile.styleArchetypes[0]).toBe('Minimalist');
    expect(store().profile.styleReasons.length).toBeGreaterThan(0);
    const top = store().recommendedItems[0];
    expect(top.department).not.toBe('men');
    expect(top.matchScore).toBeGreaterThan(50);
    expect(top.matchReasons.length).toBeGreaterThan(0);
    // Retaking the quiz doesn't award the badge again.
    expect(store().completeProfile(answers, [], NOW).newBadges).toEqual([]);
  });

  it('stores the taste-check ratings', () => {
    const taste = [{ itemId: SHIRT, liked: true, archetypes: ['Minimalist' as const], colors: ['white' as const], category: 'Tops' as const }];
    store().completeProfile(answers, taste, NOW);
    expect(store().profile.tasteRatings).toEqual(taste);
  });

  it('validates display names', () => {
    expect(store().setName('   ')).toBe(false);
    expect(store().profile.name).toBe('VibeVault User');
    expect(store().setName('  Riya   Sharma  ')).toBe(true);
    expect(store().profile.name).toBe('Riya Sharma');
    store().setName('x'.repeat(100));
    expect(store().profile.name).toHaveLength(24);
  });

  it('changes country (with its currency) and downloads that country’s listings', async () => {
    expect(store().setCountry('ZZ')).toBe(false);
    expect(store().setCountry('GB')).toBe(true);
    expect(store().profile).toMatchObject({ country: 'GB', currency: 'GBP' });
    await flush();
    await flush();
    expect(decodeURIComponent(String(catalogCalls().at(-1)?.[0]))).toContain('market.eq.GB');
  });

  it('keeps the budget meaning the same money when the currency changes', () => {
    store().completeProfile(answers, [], NOW);
    expect(store().setCurrency('usd')).toBe(false);
    expect(store().setCurrency('USD')).toBe(true);
    expect(store().profile.budgetMax).toBeCloseTo((1500 / 98.4) * 1.06, 6);
  });

  it('only shows the sections the user shops', () => {
    store().setShopFor('men');
    expect(store().profile.shopFor).toBe('men');
    expect(store().recommendedItems.filter((i) => i.department === 'women').every((i) => i.matchScore === 0)).toBe(true);
  });
});

describe('live catalogue sync', () => {
  it('loads listings, exchange rates, coupons, status and the model’s track record', async () => {
    // Coupons are per country, so they load once the user has one.
    store().setCountry('IN');
    await store().syncCatalog({ force: true, now: NOW });
    expect(store().catalogStatus).toBe('ready');
    expect(store().catalog).toHaveLength(sampleCatalogRows().length);
    expect(Number.isNaN(Date.parse(store().catalogFetchedAt!))).toBe(false);
    expect(store().catalogUpdatedAt).toBe('2026-11-25T00:45:00Z');
    expect(itemById(JACKET)).toMatchObject({ platform: 'eBay', siteName: 'eBay (ships to India)', currency: 'USD', currentPrice: 42.5 });
    expect(store().fxRates).toEqual({ EUR: 1, INR: 98.4, USD: 1.06 });
    expect(store().offers.map((o) => o.id)).toEqual(['cuelinks:IN:a', 'cuelinks:IN:b']);
    expect(store().offers[1].code).toBeNull();
    expect(store().trackRecord[0]).toMatchObject({ horizon: 14, source: null, waitCalls: 40, waitCorrect: 29 });
    expect(store().calibration).toHaveLength(1);
    expect(store().availableMarkets).toEqual([{ market: 'IN', listings: 20, sources: ['ebay', 'flipkart'] }]);
    expect(store().marketplaces.map((m) => m.source)).toEqual(['flipkart', 'ebay']);
  });

  it('asks for the user’s country plus tracked listings, with the public key only', async () => {
    store().completeProfile(answers, [], NOW);
    // Choosing a country starts a download; wait for it before changing what's tracked.
    await store().syncCatalog({ force: true, now: NOW });
    store().toggleWishlist(SHIRT);
    store().addPriceAlert(JACKET, 40, NOW);
    await store().syncCatalog({ force: true, now: NOW });
    const [url, init] = catalogCalls().at(-1)!;
    const decoded = decodeURIComponent(String(url));
    expect(decoded).toContain(`and(available.is.true,market.eq.IN)`);
    expect(decoded).toContain(`id.in.("${SHIRT}","${JACKET}")`);
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

  it('caches the download (with rates and coupons) and restores it on an offline start', async () => {
    const cache = await readCatalogCache();
    expect(cache?.rows).toHaveLength(sampleCatalogRows().length);
    expect(cache?.fxRates?.USD).toBe(1.06);
    useStore.setState({ catalog: [], recommendedItems: [], catalogFetchedAt: null, fxRates: null });
    await store().loadCachedCatalog();
    expect(store().catalog).toHaveLength(sampleCatalogRows().length);
    expect(store().fxRates?.USD).toBe(1.06);
    expect(store().catalogFetchedAt).toBe(NOW.toISOString());
  });

  it('skips rows that fail validation instead of failing the whole sync', async () => {
    serverRows = [...sampleCatalogRows(), makeRow({ id: 'flipkart:IN:BAD', current_price: 'n/a' }), { junk: true } as never];
    expect(await store().syncCatalog({ force: true, now: NOW })).toBe(true);
    expect(store().catalog).toHaveLength(sampleCatalogRows().length);
  });

  it('keeps sold-out listings the user tracks, marked unavailable with the reason', async () => {
    store().toggleWishlist(SHIRT);
    updateServerRow(SHIRT, { available: false, end_reason: 'gone' });
    await store().syncCatalog({ force: true, now: NOW });
    expect(itemById(SHIRT)).toMatchObject({ available: false, endReason: 'gone' });
  });

  it('shows the model’s prediction only for today’s price', async () => {
    updateServerRow(SHIRT, { prediction: predictionJson(899, 0.7) });
    await store().syncCatalog({ force: true, now: NOW });
    expect(itemById(SHIRT).prediction?.horizons[14]?.verdict).toBe('wait');
    updateServerRow(SHIRT, { current_price: 799 });
    await store().syncCatalog({ force: true, now: NOW });
    expect(itemById(SHIRT).prediction).toBeNull();
  });
});

describe('live price check', () => {
  it('replaces the listing with the freshly checked one', async () => {
    liveRow = { ...serverRows[0], current_price: 849, last_checked_at: new Date(NOW.getTime() + 60_000).toISOString() };
    const result = await store().checkItemLive(SHIRT);
    expect(result?.checked).toBe('live');
    expect(result?.item?.currentPrice).toBe(849);
    expect(itemById(SHIRT).currentPrice).toBe(849);
    expect(store().recommendedItems.find((i) => i.id === SHIRT)?.currentPrice).toBe(849);
  });

  it('adds a listing that was not in the catalogue yet', async () => {
    liveRow = makeRow({ id: 'flipkart:IN:NEW1', source_item_id: 'NEW1', title: 'New Listing' });
    await store().checkItemLive('flipkart:IN:NEW1');
    expect(itemById('flipkart:IN:NEW1').title).toBe('New Listing');
  });

  it('rejects when the backend fails (the screen keeps the recorded price)', async () => {
    await expect(store().checkItemLive('flipkart:IN:UNKNOWN')).rejects.toThrow(/HTTP 404/);
    serverDown = true;
    await expect(store().checkItemLive(SHIRT)).rejects.toThrow();
    expect(itemById(SHIRT).currentPrice).toBe(899);
  });
});

describe('wishlist', () => {
  it('toggles listings, newest first, and ignores unknown ids', () => {
    expect(store().toggleWishlist(SHIRT)).toBe(true);
    expect(store().toggleWishlist(JEANS)).toBe(true);
    expect(store().profile.wishlist).toEqual([JEANS, SHIRT]);
    expect(store().toggleWishlist(SHIRT)).toBe(false);
    expect(store().profile.wishlist).toEqual([JEANS]);
    expect(store().toggleWishlist('flipkart:IN:does-not-exist')).toBe(false);
    expect(store().profile.wishlist).toEqual([JEANS]);
  });

  it('can always remove a saved listing, even one no longer in the catalogue', () => {
    useStore.setState({ profile: { ...store().profile, wishlist: ['ebay:IN:v1|gone|0'] } });
    expect(store().toggleWishlist('ebay:IN:v1|gone|0')).toBe(false);
    expect(store().profile.wishlist).toEqual([]);
  });

  it('learns from saved pieces', () => {
    store().completeProfile(answers, [], NOW);
    const dress = store().recommendedItems.find((i) => i.title === 'Floral Tiered Maxi Dress')!;
    store().toggleWishlist(dress.id);
    const similar = store().recommendedItems.find((i) => i.title === 'Women Pink Puff Sleeve Blouse')!;
    expect(similar.matchReasons).toContain('Like pieces you saved');
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
    if (!atPrice.ok) expect(atPrice.error).toContain('₹899');
    expect(store().addPriceAlert('flipkart:IN:nope', 5).ok).toBe(false);

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
    expect(store().addPriceAlert(SHIRT, 800, NOW).ok).toBe(true);
    expect(store().checkPriceAlerts(NOW).triggered).toHaveLength(0);

    const later = addDays(NOW, 1);
    updateServerRow(SHIRT, { current_price: 799, price_history: dailyHistory([899, 799], later) });
    await store().syncCatalog({ force: true, now: later });
    const { triggered, newBadges } = store().checkPriceAlerts(later);
    expect(triggered).toHaveLength(1);
    expect(triggered[0].item.id).toBe(SHIRT);
    expect(triggered[0].alert).toMatchObject({ status: 'triggered', triggeredPrice: 799, acknowledged: false });
    expect(newBadges.map((b) => b.id)).toEqual([BADGE_IDS.priceProphet]);
    expect(store().checkPriceAlerts(later).triggered).toHaveLength(0);
    store().acknowledgeTriggeredAlerts();
    expect(store().priceAlerts[0].acknowledged).toBe(true);
  });

  it('does not trigger for a listing that sold out', async () => {
    store().addPriceAlert(SHIRT, 800, NOW);
    updateServerRow(SHIRT, { current_price: 500, available: false });
    await store().syncCatalog({ force: true, now: NOW });
    expect(store().checkPriceAlerts(NOW).triggered).toHaveLength(0);
  });

  it('removes alerts', () => {
    const res = store().addPriceAlert(JEANS, 1000);
    if (!res.ok) throw new Error(res.error);
    store().removePriceAlert(res.alert.id);
    expect(store().priceAlerts).toHaveLength(0);
  });
});

describe('purchases', () => {
  it('logs a purchase once with what was paid and saved in the user’s currency, clears its alert and can be undone', () => {
    store().completeProfile(answers, [], NOW);
    const item = itemById(JACKET);
    store().addPriceAlert(item.id, 40);
    const purchase = store().logPurchase(item.id, NOW);
    expect(purchase).toMatchObject({ itemId: item.id, platform: 'eBay', currency: 'USD', pricePaid: 42.5, homeCurrency: 'INR', secondhand: true, savedInHome: null });
    expect(purchase!.paidInHome).toBeCloseTo((42.5 / 1.06) * 98.4, 1);
    expect(store().priceAlerts).toHaveLength(0);
    expect(store().logPurchase(item.id, NOW)).toBeNull();
    expect(store().purchases).toHaveLength(1);
    store().undoPurchase(item.id);
    expect(store().purchases).toHaveLength(0);
    expect(store().logPurchase('flipkart:IN:missing')).toBeNull();
  });

  it('records the saving against the list price for new retail purchases', () => {
    store().completeProfile(answers, [], NOW);
    expect(store().logPurchase(SHIRT, NOW)).toMatchObject({ currency: 'INR', secondhand: false, originalPrice: 1618, paidInHome: 899, savedInHome: 719 });
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
    expect(store().completeQuestStep(quest.id, NOW)).toEqual({ status: 'invalid' });
    expect(store().profile.totalXP).toBe(quest.xpReward);
    expect(store().profile.completedQuests).toEqual([quest.id]);
    expect(store().profile.earnedBadges[quest.badgeId!]).toBe('2026-11-25');
  });

  it('expires timed quests and lets them be restarted', () => {
    const timed = QUEST_DEFINITIONS.find((q) => q.durationDays)!;
    store().startQuest(timed.id, NOW);
    store().completeQuestStep(timed.id, NOW);
    const late = addDays(NOW, timed.durationDays! + 1);
    expect(store().completeQuestStep(timed.id, late)).toEqual({ status: 'expired' });
    expect(store().questProgress[timed.id].status).toBe('expired');
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
    for (let d = 0; d < 7; d++) badges = badges.concat(store().recordDailyVisit(addDays(NOW, d)).newBadges.map((b) => b.id));
    expect(store().streak.current).toBe(7);
    expect(badges).toEqual([BADGE_IDS.thriftStreak]);
    expect(store().recordDailyVisit(addDays(NOW, 7)).newBadges).toEqual([]);
    store().recordDailyVisit(addDays(NOW, 10));
    expect(store().streak).toMatchObject({ current: 1, longest: 8 });
  });
});

describe('reset & persistence', () => {
  it('reset wipes user data but keeps the live catalogue', () => {
    store().completeProfile(answers, [], NOW);
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
    const saved = JSON.parse((await AsyncStorage.getItem(STORE_NAME))!);
    expect(saved.version).toBe(STORE_VERSION);
    expect(Object.keys(saved.state).sort()).toEqual(['isProfileComplete', 'priceAlerts', 'profile', 'purchases', 'questProgress', 'streak', 'vibeSummary'].sort());
    expect(saved.state.profile.wishlist).toEqual([JACKET]);
  });

  it('migrates a v3 (India-only) snapshot: listing ids gain their market and the profile asks to be updated', async () => {
    const v3 = {
      version: 3,
      state: {
        profile: { name: 'Three', styleArchetypes: ['Minimalist'], styleScores: { Minimalist: 100 }, budgetTier: 'budget-low', wishlist: ['flipkart:P000'] },
        isProfileComplete: true,
        vibeSummary: 'Your vibe: clean lines.',
        priceAlerts: [{ id: 'a1', itemId: 'flipkart:P000', currency: 'INR', targetPrice: 500, priceAtCreation: 899, createdAt: '2026-11-01T00:00:00.000Z', status: 'active' }],
        purchases: [],
        streak: { lastActiveDate: '2026-11-24', current: 4, longest: 9 },
      },
    };
    await AsyncStorage.setItem(STORE_NAME, JSON.stringify(v3));
    await useStore.persist.rehydrate();
    expect(store().profile).toMatchObject({ name: 'Three', country: 'IN', currency: 'INR', budgetMax: 500, profilerVersion: 1, wishlist: [SHIRT] });
    expect(store().isProfileComplete).toBe(true);
    expect(store().priceAlerts[0].itemId).toBe(SHIRT);
    expect(store().streak).toMatchObject({ current: 4, longest: 9 });
  });

  it('migrates a legacy (v0) snapshot: progress kept, the old quiz result retaken', async () => {
    const legacy = {
      version: 0,
      state: {
        profile: {
          id: 'user-001',
          name: 'Legacy',
          personalityTraits: ['introvert'],
          styleArchetypes: ['Minimalist'],
          level: 2,
          xp: 50,
          points: 120,
          badges: [{ id: 'badge-003', name: 'Style Chameleon', earnedDate: '2026-03-01' }],
          completedQuests: ['quest-003'],
          wishlist: ['item-001'],
          joinedDate: '2026-02-01',
        },
        isProfileComplete: true,
        quests: [
          { id: 'quest-003', status: 'completed', completedSteps: 3 },
          { id: 'quest-001', status: 'in-progress', completedSteps: 2 },
        ],
      },
    };
    await AsyncStorage.setItem(STORE_NAME, JSON.stringify(legacy));
    await useStore.persist.rehydrate();
    const s = store();
    expect(s.profile.name).toBe('Legacy');
    expect(s.profile.totalXP).toBe(150);
    expect(s.profile.earnedBadges).toEqual({ 'badge-003': '2026-03-01' });
    expect(s.profile.wishlist).toEqual([]);
    expect(s.isProfileComplete).toBe(false);
    expect(s.questProgress['quest-003'].status).toBe('completed');
    expect(s.questProgress['quest-001']).toMatchObject({ status: 'in-progress', completedSteps: 2 });
  });

  it('backs up unreadable data, starts fresh and keeps saving', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.setItem(STORE_NAME, '{not json');
    await useStore.persist.rehydrate();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unreadable'));
    expect(store().hasHydrated).toBe(true);
    expect(store().storageAvailable).toBe(true);
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
      expect(store().storageAvailable).toBe(false);
      store().toggleWishlist(SHIRT);
      store().resetAllData(NOW);
      await flush();
      expect(await AsyncStorage.getItem(STORE_NAME)).toBe(saved);
      await useStore.persist.rehydrate();
      expect(store().storageAvailable).toBe(true);
      expect(store().profile).toMatchObject({ name: 'Keep Me', totalXP: 2500, wishlist: [JEANS] });
    } finally {
      warn.mockRestore();
    }
  });

  it('retries a transient read failure', async () => {
    await AsyncStorage.setItem(STORE_NAME, savedSnapshot());
    failRead();
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
