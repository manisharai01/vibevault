// ============================================================
// VibeVault – Global State Store (Zustand + AsyncStorage)
//
// Persisted: user data only (see store/persistence.ts).
// Runtime:   today's catalogue and the personalised ranking,
//            rebuilt on launch and whenever the date changes.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist, StateStorage } from 'zustand/middleware';
import { BADGE_IDS, QUEST_DEFINITIONS, STREAK_BADGE_DAYS } from '../data/mockData';
import { buildCatalog } from '../services/catalog';
import {
  BADGE_BY_ID,
  getLevelInfo,
  isQuestOverdue,
  startQuestProgress,
  updateStreak,
} from '../services/gamification';
import { checkAlerts } from '../services/priceEngine';
import { buildStyleProfile, getRecommendations } from '../services/styleEngine';
import { Badge, FashionItem, PriceAlert, ProfilerAnswers, Purchase, StreakState } from '../types';
import { toDateKey } from '../utils/date';
import {
  MAX_NAME_LENGTH,
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
  /** Today's catalogue (prices simulated for `catalogDate`). */
  catalog: FashionItem[];
  catalogDate: string;
  /** Catalogue ranked for the user, with match scores. */
  recommendedItems: FashionItem[];
  hasHydrated: boolean;
  /** False when saved data couldn't be read; changes then stay in memory only. */
  storageAvailable: boolean;
}

interface Actions {
  completeProfile: (answers: ProfilerAnswers, now?: Date) => { newBadges: Badge[] };
  setName: (name: string) => boolean;
  toggleWishlist: (itemId: string) => boolean;
  addPriceAlert: (itemId: string, targetPrice: number, now?: Date) => AddAlertResult;
  removePriceAlert: (alertId: string) => void;
  acknowledgeTriggeredAlerts: () => void;
  checkPriceAlerts: (now?: Date) => { triggered: TriggeredAlert[]; newBadges: Badge[] };
  logPurchase: (itemId: string, now?: Date) => Purchase | null;
  undoPurchase: (itemId: string) => void;
  startQuest: (questId: string, now?: Date) => boolean;
  completeQuestStep: (questId: string, now?: Date) => QuestStepResult;
  expireQuests: (now?: Date) => string[];
  recordDailyVisit: (now?: Date) => { newBadges: Badge[]; streak: StreakState };
  refreshCatalog: (now?: Date, force?: boolean) => void;
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

const initialNow = new Date();
const initialCatalog = buildCatalog(initialNow);
const initialPersisted = createDefaultPersistedState(initialNow);

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialPersisted,
      catalog: initialCatalog,
      catalogDate: toDateKey(initialNow),
      recommendedItems: getRecommendations(initialCatalog, initialPersisted.profile),
      hasHydrated: false,
      storageAvailable: true,

      // ---- Profile ----

      completeProfile: (answers, now = new Date()) => {
        const result = buildStyleProfile(answers);
        const state = get();
        const { earnedBadges, newBadges } = awardBadges(state.profile.earnedBadges, [BADGE_IDS.firstFind], toDateKey(now));
        const profile = {
          ...state.profile,
          personalityTraits: result.personality,
          musicGenres: result.music,
          mediaPreferences: result.media,
          styleArchetypes: result.topStyles,
          styleScores: result.styleScores,
          vibeScore: result.vibeScore,
          budgetTier: result.budgetTier,
          sustainabilityPriority: result.sustainabilityPriority,
          profilerAnswers: answers,
          earnedBadges,
        };
        set({
          profile,
          isProfileComplete: result.topStyles.length > 0,
          vibeSummary: result.vibeSummary,
          recommendedItems: getRecommendations(state.catalog, profile),
        });
        return { newBadges };
      },

      setName: (name) => {
        const trimmed = name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
        if (!trimmed) return false;
        set((state) => ({ profile: { ...state.profile, name: trimmed } }));
        return true;
      },

      // ---- Wishlist ----

      toggleWishlist: (itemId) => {
        const state = get();
        if (!state.catalog.some((item) => item.id === itemId)) return false;
        const isSaved = state.profile.wishlist.includes(itemId);
        const wishlist = isSaved ? state.profile.wishlist.filter((id) => id !== itemId) : [itemId, ...state.profile.wishlist];
        set({ profile: { ...state.profile, wishlist } });
        return !isSaved;
      },

      // ---- Price alerts ----

      addPriceAlert: (itemId, targetPrice, now = new Date()) => {
        const state = get();
        const item = state.catalog.find((i) => i.id === itemId);
        if (!item) return { ok: false, error: 'This item is no longer available.' };
        if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
          return { ok: false, error: 'Enter a target price greater than $0.' };
        }
        const target = Math.round(targetPrice * 100) / 100;
        if (target >= item.currentPrice) {
          return { ok: false, error: `Your target must be below the current price of $${item.currentPrice.toFixed(2)}.` };
        }
        const alert: PriceAlert = {
          id: makeId('alert'),
          itemId,
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

      // ---- Purchases (eco impact) ----

      logPurchase: (itemId, now = new Date()) => {
        const state = get();
        const item = state.catalog.find((i) => i.id === itemId);
        if (!item || state.purchases.some((p) => p.itemId === itemId)) return null;
        const purchase: Purchase = {
          id: makeId('purchase'),
          itemId,
          title: item.title,
          platform: item.platform,
          pricePaid: item.currentPrice,
          originalPrice: item.originalPrice,
          co2Saved: item.co2Saved,
          purchasedAt: now.toISOString(),
        };
        set({
          purchases: [purchase, ...state.purchases],
          // An alert for something you've bought is no longer useful.
          priceAlerts: state.priceAlerts.filter((a) => !(a.itemId === itemId && a.status === 'active')),
        });
        return purchase;
      },

      undoPurchase: (itemId) => {
        set((state) => ({ purchases: state.purchases.filter((p) => p.itemId !== itemId) }));
      },

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

      refreshCatalog: (now = new Date(), force = false) => {
        const state = get();
        const dateKey = toDateKey(now);
        if (!force && state.catalogDate === dateKey) return;
        const catalog = buildCatalog(now);
        set({ catalog, catalogDate: dateKey, recommendedItems: getRecommendations(catalog, state.profile) });
      },

      // ---- Data management ----

      resetAllData: (now = new Date()) => {
        const defaults = createDefaultPersistedState(now);
        const { catalog } = get();
        set({ ...defaults, streak: updateStreak(defaults.streak, toDateKey(now)), recommendedItems: getRecommendations(catalog, defaults.profile) });
      },

      finishHydration: (storageAvailable) => {
        const state = get();
        set({ hasHydrated: true, storageAvailable, recommendedItems: getRecommendations(state.catalog, state.profile) });
      },
    }),
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
