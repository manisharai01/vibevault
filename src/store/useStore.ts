// ============================================================
// VibeVault – Global State Store (Zustand + AsyncStorage)
//
// Persisted: user data only (see store/persistence.ts).
// Runtime:   the live catalogue for the user's country, exchange
//            rates, coupons and the prediction model's track record
//            from the VibeVault backend, and the personalised
//            ranking. The last download is cached for offline starts.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist, StateStorage } from 'zustand/middleware';
import { backendConfig } from '../config';
import { BADGE_IDS, QUEST_DEFINITIONS, STREAK_BADGE_DAYS } from '../data/content';
import { countryByCode } from '../data/countries';
import { PROFILER_VERSION } from '../data/profilerQuestions';
import { priceIn, toFashionItem, toFashionItems } from '../services/catalog';
import {
  fetchAvailableMarkets,
  fetchCatalogRows,
  fetchCatalogStatus,
  fetchFxRates,
  fetchOffers,
  fetchTrackRecord,
  fetchUpcomingOffers,
  liveCheckListing,
  type LiveCheck,
} from '../services/catalogApi';
import { BADGE_BY_ID, getLevelInfo, isQuestOverdue, startQuestProgress, updateStreak } from '../services/gamification';
import { slotForCategory } from '../services/composer';
import { colorFamilies } from '../services/itemTraits';
import { checkAlerts } from '../services/priceEngine';
import { buildStyleProfile, getRecommendations } from '../services/styleEngine';
import {
  Badge,
  CalibrationBucket,
  CatalogStatus,
  FashionItem,
  MarketplaceStatus,
  ColorFamily,
  Offer,
  OwnedPiece,
  PriceAlert,
  ProfilerAnswers,
  Purchase,
  ShopFor,
  StreakState,
  TasteRating,
  TrackRecord,
  WardrobeSlot,
} from '../types';
import { toDateKey } from '../utils/date';
import { convertAmount, formatMoney, FxRates } from '../utils/format';
import { readCatalogCache, writeCatalogCache } from './catalogCache';
import {
  MAX_NAME_LENGTH,
  MAX_OWNED_PIECES,
  MAX_RECENTLY_VIEWED,
  PersistedState,
  STORE_NAME,
  STORE_VERSION,
  createDefaultPersistedState,
  migratePersistedState,
  sanitizePersistedState,
} from './persistence';

export type { PersistedState } from './persistence';

const QUEST_BY_ID = Object.fromEntries(QUEST_DEFINITIONS.map((q) => [q.id, q]));

export interface TriggeredAlert {
  alert: PriceAlert;
  item: FashionItem;
}

export type AddAlertResult = { ok: true; alert: PriceAlert } | { ok: false; error: string };

export type QuestStepResult =
  | { status: 'progressed'; completedSteps: number; totalSteps: number }
  | { status: 'completed'; xp: number; points: number; badge: Badge | null; newLevel: number | null }
  | { status: 'expired' }
  | { status: 'invalid' };

interface RuntimeState {
  /** Live listings for the user's country (plus unavailable ones the user saved or tracks). */
  catalog: FashionItem[];
  /** Country the catalogue was downloaded for (null = all countries). */
  catalogMarket: string | null;
  catalogStatus: CatalogStatus;
  catalogError: string | null;
  /** When the app last downloaded the catalogue (ISO). */
  catalogFetchedAt: string | null;
  /** When the backend last refreshed prices from the marketplaces (ISO). */
  catalogUpdatedAt: string | null;
  /** Catalogue ranked for the user, with match scores and reasons. */
  recommendedItems: FashionItem[];
  /** ECB reference rates (units per euro) and their publication date. */
  fxRates: FxRates | null;
  fxDate: string | null;
  /** Coupons/offers valid for the catalogue's country. */
  offers: Offer[];
  /** Sales stores have announced (starting within 90 days) in their official feeds. */
  upcomingOffers: Offer[];
  marketplaces: MarketplaceStatus[];
  /** Countries with live listings. */
  availableMarkets: { market: string; listings: number; sources: string[] }[];
  trackRecord: TrackRecord[];
  calibration: CalibrationBucket[];
  hasHydrated: boolean;
  /** False when saved data couldn't be read; changes then stay in memory only. */
  storageAvailable: boolean;
}

interface Actions {
  completeProfile: (answers: ProfilerAnswers, taste?: TasteRating[], now?: Date) => { newBadges: Badge[] };
  setName: (name: string) => boolean;
  setCountry: (country: string) => boolean;
  setCurrency: (currency: string) => boolean;
  setShopFor: (shopFor: ShopFor) => void;
  toggleWishlist: (itemId: string) => boolean;
  addPriceAlert: (itemId: string, targetPrice: number, now?: Date) => AddAlertResult;
  removePriceAlert: (alertId: string) => void;
  acknowledgeTriggeredAlerts: () => void;
  checkPriceAlerts: (now?: Date) => { triggered: TriggeredAlert[]; newBadges: Badge[] };
  logPurchase: (itemId: string, now?: Date) => Purchase | null;
  undoPurchase: (itemId: string) => void;
  /** Adds a piece the user owns; null when the title is empty or the wardrobe is full. */
  addOwnedPiece: (input: { slot: WardrobeSlot; title: string; colors: ColorFamily[]; itemId?: string | null; image?: string | null }, now?: Date) => OwnedPiece | null;
  removeOwnedPiece: (id: string) => void;
  /** Remembers that a listing was opened (for "Recently viewed"). */
  recordView: (itemId: string) => void;
  clearRecentlyViewed: () => void;
  startQuest: (questId: string, now?: Date) => boolean;
  completeQuestStep: (questId: string, now?: Date) => QuestStepResult;
  expireQuests: (now?: Date) => string[];
  recordDailyVisit: (now?: Date) => { newBadges: Badge[]; streak: StreakState };
  loadCachedCatalog: () => Promise<void>;
  syncCatalog: (options?: { force?: boolean; now?: Date }) => Promise<boolean>;
  checkItemLive: (itemId: string) => Promise<{ item: FashionItem | null; checked: LiveCheck } | null>;
  resetAllData: (now?: Date) => void;
  finishHydration: (storageAvailable: boolean) => void;
}

export type AppState = PersistedState & RuntimeState & Actions;

/** Adds badges that aren't earned yet. */
function awardBadges(
  earned: Record<string, string>,
  badgeIds: string[],
  dateKey: string,
): { earnedBadges: Record<string, string>; newBadges: Badge[] } {
  const newBadges: Badge[] = [];
  let earnedBadges = earned;
  for (const id of badgeIds) {
    const badge = BADGE_BY_ID[id];
    if (badge && !earnedBadges[id]) {
      earnedBadges = { ...earnedBadges, [id]: dateKey };
      newBadges.push(badge);
    }
  }
  return { earnedBadges, newBadges };
}

let idCounter = 0;
const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

// ---- Storage guard ----
// Writes stay disabled until saved data has been read successfully, so a
// failed read can never overwrite the user's data with defaults.
// Unparseable data is backed up and then replaced with a fresh start.

export const CORRUPT_BACKUP_SUFFIX = ':corrupt-backup';
const READ_RETRY_DELAY_MS = 150;
let persistenceEnabled = false;

const guardedStorage: StateStorage = {
  getItem: async (name) => {
    let raw: string | null;
    try {
      raw = await AsyncStorage.getItem(name);
    } catch {
      // One retry for transient I/O errors; a second failure aborts hydration.
      await new Promise((resolve) => setTimeout(resolve, READ_RETRY_DELAY_MS));
      raw = await AsyncStorage.getItem(name);
    }
    if (raw !== null) {
      try {
        JSON.parse(raw);
      } catch {
        console.warn('[VibeVault] Saved data was unreadable; starting fresh (a backup copy was kept).');
        await AsyncStorage.setItem(`${name}${CORRUPT_BACKUP_SUFFIX}`, raw).catch(() => undefined);
        return null;
      }
    }
    return raw;
  },
  setItem: async (name, value) => {
    if (persistenceEnabled) await AsyncStorage.setItem(name, value);
  },
  removeItem: (name) => AsyncStorage.removeItem(name),
};

/** How long a downloaded catalogue counts as fresh before the app syncs again. */
export const CATALOG_SYNC_INTERVAL_MS = 15 * 60_000;
let syncInFlight: Promise<boolean> | null = null;
let syncMarket: string | null = null;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong.');
const latestSuccess = (rows: MarketplaceStatus[]) =>
  rows
    .map((r) => r.lastSuccessAt)
    .filter((v): v is string => !!v)
    .sort()
    .at(-1) ?? null;

const initialPersisted = createDefaultPersistedState(new Date());

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      /** Re-ranks the catalogue for the current profile and exchange rates. */
      const rank = (catalog: FashionItem[], profile = get().profile, rates = get().fxRates) => getRecommendations(catalog, profile, rates);

      return {
        ...initialPersisted,
        catalog: [],
        catalogMarket: null,
        catalogStatus: backendConfig ? 'idle' : 'unconfigured',
        catalogError: null,
        catalogFetchedAt: null,
        catalogUpdatedAt: null,
        recommendedItems: [],
        fxRates: null,
        fxDate: null,
        offers: [],
        upcomingOffers: [],
        marketplaces: [],
        availableMarkets: [],
        trackRecord: [],
        calibration: [],
        hasHydrated: false,
        storageAvailable: true,

        // ---- Profile ----

        completeProfile: (answers, taste = [], now = new Date()) => {
          const result = buildStyleProfile(answers, taste);
          const state = get();
          const { earnedBadges, newBadges } = awardBadges(state.profile.earnedBadges, [BADGE_IDS.firstFind], toDateKey(now));
          const country = result.country ?? state.profile.country;
          const countryChanged = country !== state.profile.country;
          const profile = {
            ...state.profile,
            country,
            // A new country brings its own currency; the user can change it in Profile.
            currency: countryChanged ? (countryByCode(country)?.currency ?? state.profile.currency) : state.profile.currency,
            shopFor: result.shopFor ?? state.profile.shopFor,
            traits: result.traits,
            likedColors: result.likedColors,
            avoidColors: result.avoidColors,
            fit: result.fit,
            occasions: result.occasions,
            budgetMax: result.budgetMax,
            tasteRatings: taste,
            styleArchetypes: result.topStyles,
            styleScores: result.styleScores,
            styleReasons: result.reasons,
            vibeScore: result.vibeScore,
            sustainabilityPriority: result.sustainabilityPriority,
            profilerAnswers: answers,
            profilerVersion: PROFILER_VERSION,
            earnedBadges,
          };
          set({
            profile,
            isProfileComplete: result.topStyles.length > 0,
            vibeSummary: result.vibeSummary,
            recommendedItems: rank(state.catalog, profile),
          });
          if (countryChanged) get().syncCatalog({ force: true }).catch(() => undefined);
          return { newBadges };
        },

        setName: (name) => {
          const trimmed = name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
          if (!trimmed) return false;
          set((state) => ({ profile: { ...state.profile, name: trimmed } }));
          return true;
        },

        setCountry: (country) => {
          const info = countryByCode(country);
          if (!info) return false;
          const state = get();
          if (state.profile.country === info.code) return true;
          set({ profile: { ...state.profile, country: info.code, currency: info.currency } });
          get().syncCatalog({ force: true }).catch(() => undefined);
          return true;
        },

        setCurrency: (currency) => {
          if (!/^[A-Z]{3}$/.test(currency)) return false;
          const state = get();
          const profile = {
            ...state.profile,
            currency,
            // Keep the budget meaning the same amount of money.
            budgetMax:
              state.profile.budgetMax === null
                ? null
                : (convertAmount(state.profile.budgetMax, state.profile.currency, currency, state.fxRates) ?? null),
          };
          set({ profile, recommendedItems: rank(state.catalog, profile) });
          return true;
        },

        setShopFor: (shopFor) => {
          const state = get();
          const profile = { ...state.profile, shopFor };
          set({ profile, recommendedItems: rank(state.catalog, profile) });
        },

        // ---- Wishlist ----

        toggleWishlist: (itemId) => {
          const state = get();
          const isSaved = state.profile.wishlist.includes(itemId);
          // Saving needs a known listing; removing always works (even if it has since sold).
          if (!isSaved && !state.catalog.some((item) => item.id === itemId)) return false;
          const wishlist = isSaved ? state.profile.wishlist.filter((id) => id !== itemId) : [itemId, ...state.profile.wishlist];
          const profile = { ...state.profile, wishlist };
          // Saved pieces teach the ranking what the user likes.
          set({ profile, recommendedItems: rank(state.catalog, profile) });
          return !isSaved;
        },

        // ---- Price alerts ----

        addPriceAlert: (itemId, targetPrice, now = new Date()) => {
          const state = get();
          const item = state.catalog.find((i) => i.id === itemId);
          if (!item || !item.available) return { ok: false, error: 'This item is no longer available.' };
          if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
            return { ok: false, error: 'Enter a target price greater than zero.' };
          }
          const target = Math.round(targetPrice * 100) / 100;
          if (target >= item.currentPrice) {
            return {
              ok: false,
              error: `Your target must be below the current price of ${formatMoney(item.currentPrice, item.currency)}.`,
            };
          }
          const alert: PriceAlert = {
            id: makeId('alert'),
            itemId,
            currency: item.currency,
            targetPrice: target,
            priceAtCreation: item.currentPrice,
            createdAt: now.toISOString(),
            status: 'active',
            acknowledged: true,
          };
          // One active alert per item: a new target replaces the old one.
          const others = state.priceAlerts.filter((a) => !(a.itemId === itemId && a.status === 'active'));
          set({ priceAlerts: [alert, ...others] });
          return { ok: true, alert };
        },

        removePriceAlert: (alertId) => {
          set((state) => ({ priceAlerts: state.priceAlerts.filter((a) => a.id !== alertId) }));
        },

        acknowledgeTriggeredAlerts: () => {
          const { priceAlerts } = get();
          if (!priceAlerts.some((a) => a.status === 'triggered' && !a.acknowledged)) return;
          set({ priceAlerts: priceAlerts.map((a) => (a.status === 'triggered' && !a.acknowledged ? { ...a, acknowledged: true } : a)) });
        },

        checkPriceAlerts: (now = new Date()) => {
          const state = get();
          const hits = checkAlerts(state.priceAlerts, state.catalog);
          if (hits.length === 0) return { triggered: [], newBadges: [] };

          const itemsById = new Map(state.catalog.map((item) => [item.id, item]));
          const hitIds = new Set(hits.map((a) => a.id));
          const triggered: TriggeredAlert[] = [];
          const priceAlerts = state.priceAlerts.map((alert) => {
            if (!hitIds.has(alert.id)) return alert;
            const item = itemsById.get(alert.itemId)!;
            const updated: PriceAlert = {
              ...alert,
              status: 'triggered',
              triggeredAt: now.toISOString(),
              triggeredPrice: item.currentPrice,
              acknowledged: false,
            };
            triggered.push({ alert: updated, item });
            return updated;
          });
          const { earnedBadges, newBadges } = awardBadges(state.profile.earnedBadges, [BADGE_IDS.priceProphet], toDateKey(now));
          set({ priceAlerts, profile: { ...state.profile, earnedBadges } });
          return { triggered, newBadges };
        },

        // ---- Purchases ----

        logPurchase: (itemId, now = new Date()) => {
          const state = get();
          const item = state.catalog.find((i) => i.id === itemId);
          if (!item || state.purchases.some((p) => p.itemId === itemId)) return null;
          const home = state.profile.currency;
          const paidInHome = priceIn(item, home, state.fxRates);
          const saving = item.originalPrice !== null ? item.originalPrice - item.currentPrice : null;
          const savedInHome = saving !== null && saving > 0 ? convertAmount(saving, item.currency, home, state.fxRates) : null;
          const round2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
          const purchase: Purchase = {
            id: makeId('purchase'),
            itemId,
            title: item.title,
            platform: item.platform,
            currency: item.currency,
            pricePaid: item.currentPrice,
            originalPrice: item.originalPrice,
            homeCurrency: home,
            paidInHome: round2(paidInHome),
            savedInHome: round2(savedInHome),
            secondhand: item.secondhand,
            purchasedAt: now.toISOString(),
          };
          // What you buy becomes part of your wardrobe.
          const owned: OwnedPiece = {
            id: `purchase:${itemId}`,
            slot: slotForCategory(item.category),
            title: item.title.slice(0, 120),
            colors: colorFamilies(item).slice(0, 4),
            itemId,
            image: item.image,
            addedAt: now.toISOString(),
          };
          set({
            purchases: [purchase, ...state.purchases],
            ownedPieces: [owned, ...state.ownedPieces.filter((p) => p.id !== owned.id)].slice(0, MAX_OWNED_PIECES),
            // An alert for something you've bought is no longer useful.
            priceAlerts: state.priceAlerts.filter((a) => !(a.itemId === itemId && a.status === 'active')),
          });
          return purchase;
        },

        undoPurchase: (itemId) => {
          set((state) => ({
            purchases: state.purchases.filter((p) => p.itemId !== itemId),
            ownedPieces: state.ownedPieces.filter((p) => p.id !== `purchase:${itemId}`),
          }));
        },

        // ---- Wardrobe ----

        addOwnedPiece: (input, now = new Date()) => {
          const title = input.title.trim().slice(0, 120);
          const state = get();
          if (!title || state.ownedPieces.length >= MAX_OWNED_PIECES) return null;
          const piece: OwnedPiece = {
            id: makeId('owned'),
            slot: input.slot,
            title,
            colors: [...new Set(input.colors)].slice(0, 4),
            itemId: input.itemId ?? null,
            image: input.image ?? null,
            addedAt: now.toISOString(),
          };
          set({ ownedPieces: [piece, ...state.ownedPieces] });
          return piece;
        },

        removeOwnedPiece: (id) => {
          set((state) => ({ ownedPieces: state.ownedPieces.filter((p) => p.id !== id) }));
        },

        recordView: (itemId) => {
          const state = get();
          if (state.recentlyViewed[0] === itemId) return;
          set({ recentlyViewed: [itemId, ...state.recentlyViewed.filter((id) => id !== itemId)].slice(0, MAX_RECENTLY_VIEWED) });
        },

        clearRecentlyViewed: () => set({ recentlyViewed: [] }),

        // ---- Quests ----

        startQuest: (questId, now = new Date()) => {
          const definition = QUEST_BY_ID[questId];
          const state = get();
          const progress = state.questProgress[questId];
          if (!definition || (progress && progress.status !== 'expired')) return false;
          set({ questProgress: { ...state.questProgress, [questId]: startQuestProgress(definition, now) } });
          return true;
        },

        completeQuestStep: (questId, now = new Date()) => {
          const definition = QUEST_BY_ID[questId];
          const state = get();
          const progress = state.questProgress[questId];
          if (!definition || !progress) return { status: 'invalid' };
          if (progress.status === 'expired') return { status: 'expired' };
          if (progress.status !== 'in-progress') return { status: 'invalid' };
          if (isQuestOverdue(progress, now)) {
            set({ questProgress: { ...state.questProgress, [questId]: { ...progress, status: 'expired' } } });
            return { status: 'expired' };
          }

          const totalSteps = definition.steps.length;
          const completedSteps = Math.min(totalSteps, progress.completedSteps + 1);
          if (completedSteps < totalSteps) {
            set({ questProgress: { ...state.questProgress, [questId]: { ...progress, completedSteps } } });
            return { status: 'progressed', completedSteps, totalSteps };
          }

          // Final step: mark complete and pay out rewards exactly once.
          const alreadyRewarded = state.profile.completedQuests.includes(questId);
          const levelBefore = getLevelInfo(state.profile.totalXP).level;
          let profile = state.profile;
          let badge: Badge | null = null;
          const xp = alreadyRewarded ? 0 : definition.xpReward;
          const points = alreadyRewarded ? 0 : definition.pointsReward;
          if (!alreadyRewarded) {
            const { earnedBadges, newBadges } = awardBadges(
              profile.earnedBadges,
              definition.badgeId ? [definition.badgeId] : [],
              toDateKey(now),
            );
            badge = newBadges[0] ?? null;
            profile = {
              ...profile,
              totalXP: profile.totalXP + xp,
              points: profile.points + points,
              earnedBadges,
              completedQuests: [...profile.completedQuests, questId],
            };
          }
          const levelAfter = getLevelInfo(profile.totalXP).level;
          set({
            profile,
            questProgress: {
              ...state.questProgress,
              [questId]: { ...progress, completedSteps, status: 'completed', completedAt: now.toISOString() },
            },
          });
          return { status: 'completed', xp, points, badge, newLevel: levelAfter > levelBefore ? levelAfter : null };
        },

        expireQuests: (now = new Date()) => {
          const state = get();
          const expired = Object.entries(state.questProgress)
            .filter(([, progress]) => isQuestOverdue(progress, now))
            .map(([questId]) => questId);
          if (expired.length === 0) return [];
          const questProgress = { ...state.questProgress };
          for (const questId of expired) questProgress[questId] = { ...questProgress[questId], status: 'expired' };
          set({ questProgress });
          return expired;
        },

        // ---- Daily streak ----

        recordDailyVisit: (now = new Date()) => {
          const state = get();
          const streak = updateStreak(state.streak, toDateKey(now));
          if (streak === state.streak) return { newBadges: [], streak };
          const { earnedBadges, newBadges } =
            streak.current >= STREAK_BADGE_DAYS
              ? awardBadges(state.profile.earnedBadges, [BADGE_IDS.thriftStreak], toDateKey(now))
              : { earnedBadges: state.profile.earnedBadges, newBadges: [] as Badge[] };
          set({ streak, profile: { ...state.profile, earnedBadges } });
          return { newBadges, streak };
        },

        // ---- Catalogue ----

        loadCachedCatalog: async () => {
          if (get().catalog.length > 0) return;
          const cache = await readCatalogCache();
          if (!cache || get().catalog.length > 0) return;
          // A cache for another country is no use after the user moved.
          if (get().profile.country && cache.market && cache.market !== get().profile.country) return;
          const catalog = toFashionItems(cache.rows);
          set({
            catalog,
            catalogMarket: cache.market,
            fxRates: cache.fxRates,
            fxDate: cache.fxDate,
            offers: cache.offers,
            upcomingOffers: cache.upcomingOffers ?? [],
            marketplaces: cache.marketplaces,
            recommendedItems: rank(catalog, get().profile, cache.fxRates),
            catalogFetchedAt: cache.fetchedAt,
            catalogUpdatedAt: cache.updatedAt,
          });
        },

        syncCatalog: ({ force = false, now = new Date() } = {}) => {
          const config = backendConfig;
          if (!config) {
            set({ catalogStatus: 'unconfigured' });
            return Promise.resolve(false);
          }
          const state = get();
          const market = state.profile.country;
          const fetchedAt = state.catalogFetchedAt ? new Date(state.catalogFetchedAt).getTime() : 0;
          if (
            !force &&
            state.catalogStatus === 'ready' &&
            state.catalogMarket === market &&
            now.getTime() - fetchedAt < CATALOG_SYNC_INTERVAL_MS
          ) {
            return Promise.resolve(true);
          }
          if (syncInFlight && syncMarket === market) return syncInFlight;

          set({ catalogStatus: 'loading', catalogError: null });
          syncMarket = market;
          let run: Promise<boolean> | null = null;
          run = (async () => {
            try {
              const current = get();
              const tracked = [
                ...current.profile.wishlist,
                ...current.priceAlerts.filter((a) => a.status === 'active').map((a) => a.itemId),
              ];
              const [rows, status, fx, offers, upcomingOffers, record, markets] = await Promise.all([
                fetchCatalogRows(config, market, tracked),
                fetchCatalogStatus(config).catch(() => get().marketplaces),
                fetchFxRates(config).catch(() => ({ rates: get().fxRates, date: get().fxDate })),
                market ? fetchOffers(config, market).catch(() => get().offers) : Promise.resolve([] as Offer[]),
                market ? fetchUpcomingOffers(config, market).catch(() => get().upcomingOffers) : Promise.resolve([] as Offer[]),
                fetchTrackRecord(config).catch(() => ({ records: get().trackRecord, calibration: get().calibration })),
                fetchAvailableMarkets(config).catch(() => get().availableMarkets),
              ]);
              // The user changed country while this was loading: a newer sync takes over.
              if (get().profile.country !== market) return false;
              const catalog = toFashionItems(rows, now);
              const fetchedIso = now.toISOString();
              const updatedAt = latestSuccess(status);
              set({
                catalog,
                catalogMarket: market,
                recommendedItems: rank(catalog, get().profile, fx.rates),
                fxRates: fx.rates,
                fxDate: fx.date,
                offers,
                upcomingOffers,
                marketplaces: status,
                availableMarkets: markets,
                trackRecord: record.records,
                calibration: record.calibration,
                catalogStatus: 'ready',
                catalogError: null,
                catalogFetchedAt: fetchedIso,
                catalogUpdatedAt: updatedAt,
              });
              await writeCatalogCache({
                fetchedAt: fetchedIso,
                updatedAt,
                market,
                rows,
                fxRates: fx.rates,
                fxDate: fx.date,
                offers,
                upcomingOffers,
                marketplaces: status,
              });
              return true;
            } catch (error) {
              set({ catalogStatus: 'error', catalogError: errorMessage(error) });
              return false;
            } finally {
              if (syncInFlight === run) syncInFlight = null;
            }
          })();
          syncInFlight = run;
          return run;
        },

        checkItemLive: async (itemId) => {
          const config = backendConfig;
          if (!config) return null;
          const result = await liveCheckListing(config, itemId);
          const item = result.row ? toFashionItem(result.row) : null;
          if (item) {
            const state = get();
            const exists = state.catalog.some((i) => i.id === item.id);
            const catalog = exists ? state.catalog.map((i) => (i.id === item.id ? item : i)) : [...state.catalog, item];
            set({ catalog, recommendedItems: rank(catalog) });
          }
          return { item, checked: result.checked };
        },

        // ---- Data management ----

        resetAllData: (now = new Date()) => {
          const defaults = createDefaultPersistedState(now);
          const { catalog } = get();
          set({ ...defaults, streak: updateStreak(defaults.streak, toDateKey(now)), recommendedItems: rank(catalog, defaults.profile) });
        },

        finishHydration: (storageAvailable) => {
          const state = get();
          set({ hasHydrated: true, storageAvailable, recommendedItems: rank(state.catalog, state.profile) });
        },
      };
    },
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => guardedStorage),
      partialize: (state): PersistedState => ({
        profile: state.profile,
        isProfileComplete: state.isProfileComplete,
        vibeSummary: state.vibeSummary,
        priceAlerts: state.priceAlerts,
        questProgress: state.questProgress,
        purchases: state.purchases,
        streak: state.streak,
        ownedPieces: state.ownedPieces,
        recentlyViewed: state.recentlyViewed,
      }),
      migrate: (persisted, version) => migratePersistedState(persisted, version) as PersistedState,
      merge: (persisted, current) => ({ ...current, ...sanitizePersistedState(persisted) }),
      onRehydrateStorage: () => {
        persistenceEnabled = false; // no writes while (re)loading saved data
        return (_state, error) => {
          if (error) {
            // Keep working in memory, but never overwrite data we couldn't read.
            console.warn('[VibeVault] Could not load saved data; changes this session will not be saved:', error);
          } else {
            persistenceEnabled = true;
          }
          useStore.getState().finishHydration(!error);
        };
      },
    },
  ),
);
