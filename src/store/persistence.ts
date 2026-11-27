// ============================================================
// VibeVault – Persisted state: defaults, validation & migration
//
// Only user data is persisted. Catalogue/quest/badge definitions
// always come from the app bundle, so content updates reach
// existing installs. Everything read from storage is validated
// so corrupted or outdated data can never crash the app.
// ============================================================

import { COLOR_FAMILIES, CATEGORIES, STYLE_ARCHETYPES } from '../constants/marketplaces';
import { QUEST_DEFINITIONS, BADGES } from '../data/content';
import { countryByCode, guessCountryFromLocale } from '../data/countries';
import { LEVEL_THRESHOLDS } from '../services/gamification';
import {
  ColorFamily,
  FitPreference,
  ItemCategory,
  Occasion,
  PriceAlert,
  ProfilerAnswers,
  Purchase,
  QuestProgress,
  ShopFor,
  StreakState,
  StyleArchetype,
  StyleReason,
  StyleScores,
  TasteRating,
  Trait,
  TraitScores,
  UserProfile,
} from '../types';
import { DAY_MS, toDateKey } from '../utils/date';

export const STORE_NAME = 'vibevault-store-v1';
export const STORE_VERSION = 4;
export const MAX_NAME_LENGTH = 24;
export const DEFAULT_NAME = 'VibeVault User';
const DEFAULT_CURRENCY = 'INR';

export interface PersistedState {
  profile: UserProfile;
  isProfileComplete: boolean;
  vibeSummary: string;
  priceAlerts: PriceAlert[];
  questProgress: Record<string, QuestProgress>;
  purchases: Purchase[];
  streak: StreakState;
}

export function createDefaultProfile(now: Date = new Date(), locale?: string): UserProfile {
  const guessed = countryByCode(guessCountryFromLocale(locale));
  return {
    id: 'user-001',
    name: DEFAULT_NAME,
    country: null,
    currency: guessed?.currency ?? DEFAULT_CURRENCY,
    shopFor: null,
    traits: {},
    likedColors: [],
    avoidColors: [],
    fit: null,
    occasions: [],
    budgetMax: null,
    tasteRatings: [],
    styleArchetypes: [],
    styleScores: {},
    styleReasons: [],
    vibeScore: 0,
    sustainabilityPriority: 50,
    profilerAnswers: {},
    profilerVersion: 0,
    totalXP: 0,
    points: 0,
    earnedBadges: {},
    completedQuests: [],
    wishlist: [],
    joinedDate: toDateKey(now),
  };
}

export function createDefaultPersistedState(now: Date = new Date()): PersistedState {
  return {
    profile: createDefaultProfile(now),
    isProfileComplete: false,
    vibeSummary: '',
    priceAlerts: [],
    questProgress: {},
    purchases: [],
    streak: { lastActiveDate: null, current: 0, longest: 0 },
  };
}

// ---- Primitive validators ----

type UnknownRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is UnknownRecord => typeof v === 'object' && v !== null && !Array.isArray(v);
const asString = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const asNumber = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const asBoolean = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const asStringArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const isDateKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isIsoDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(new Date(v).getTime());
const oneOf = <T extends string>(values: readonly T[], v: unknown): v is T => typeof v === 'string' && (values as readonly string[]).includes(v);
const unique = <T,>(values: T[]) => Array.from(new Set(values));

const SHOP_FOR: ShopFor[] = ['women', 'men', 'all'];
const FITS: FitPreference[] = ['fitted', 'regular', 'relaxed', 'oversized'];
const OCCASIONS: Occasion[] = ['work', 'everyday', 'evening', 'festive', 'active', 'outdoors'];
const TRAITS: Trait[] = ['expressive', 'novelty', 'polish', 'warmth', 'edge', 'comfort'];

/** Ids of live marketplace listings: `<source>:<market>:<item id>`. Anything else is dropped. */
export const isListingId = (id: string) => /^[a-z][a-z0-9_]{1,30}:[A-Z]{2}:\S{1,160}$/.test(id);
const isCurrency = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{3}$/.test(v);
const QUEST_STEPS = new Map(QUEST_DEFINITIONS.map((q) => [q.id, q.steps.length]));
const QUEST_DURATIONS = new Map(QUEST_DEFINITIONS.map((q) => [q.id, q.durationDays]));
const KNOWN_BADGE_IDS = new Set(BADGES.map((b) => b.id));

// ---- Field sanitizers ----

function sanitizeStyleScores(v: unknown): StyleScores {
  if (!isRecord(v)) return {};
  const scores: StyleScores = {};
  for (const style of STYLE_ARCHETYPES) {
    const value = v[style];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) scores[style] = Math.min(100, Math.round(value));
  }
  return scores;
}

function sanitizeTraits(v: unknown): TraitScores {
  if (!isRecord(v)) return {};
  const traits: TraitScores = {};
  for (const trait of TRAITS) {
    const value = v[trait];
    if (typeof value === 'number' && Number.isFinite(value)) traits[trait] = Math.max(-1, Math.min(1, value));
  }
  return traits;
}

function sanitizeAnswers(v: unknown): ProfilerAnswers {
  if (!isRecord(v)) return {};
  const answers: ProfilerAnswers = {};
  for (const [key, value] of Object.entries(v)) {
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) || value === null) answers[key] = value;
    else if (Array.isArray(value)) answers[key] = value.filter((x): x is string => typeof x === 'string');
  }
  return answers;
}

const colorList = (v: unknown) => unique(asStringArray(v).filter((c): c is ColorFamily => oneOf(COLOR_FAMILIES, c)));

function sanitizeTasteRatings(v: unknown): TasteRating[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const ratings: TasteRating[] = [];
  for (const raw of v) {
    if (!isRecord(raw) || typeof raw.itemId !== 'string' || seen.has(raw.itemId) || typeof raw.liked !== 'boolean') continue;
    if (!oneOf(CATEGORIES, raw.category)) continue;
    seen.add(raw.itemId);
    ratings.push({
      itemId: raw.itemId,
      liked: raw.liked,
      archetypes: unique(asStringArray(raw.archetypes).filter((x): x is StyleArchetype => oneOf(STYLE_ARCHETYPES, x))),
      colors: colorList(raw.colors),
      category: raw.category as ItemCategory,
    });
  }
  return ratings.slice(0, 50);
}

function sanitizeReasons(v: unknown): StyleReason[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r): r is UnknownRecord => isRecord(r) && oneOf(STYLE_ARCHETYPES, r.archetype) && typeof r.text === 'string' && r.text.length > 0)
    .map((r) => ({ archetype: r.archetype as StyleArchetype, text: String(r.text).slice(0, 160) }))
    .slice(0, 12);
}

export function sanitizeProfile(v: unknown, now: Date = new Date()): UserProfile {
  const fallback = createDefaultProfile(now);
  if (!isRecord(v)) return fallback;

  const earnedBadges: Record<string, string> = {};
  if (isRecord(v.earnedBadges)) {
    for (const [id, date] of Object.entries(v.earnedBadges)) {
      if (KNOWN_BADGE_IDS.has(id) && isDateKey(date)) earnedBadges[id] = date;
    }
  }

  const name = asString(v.name, fallback.name).trim().slice(0, MAX_NAME_LENGTH);
  const country = typeof v.country === 'string' && countryByCode(v.country) ? v.country.toUpperCase() : null;
  const liked = colorList(v.likedColors);
  const budgetMax = asNumber(v.budgetMax, NaN);

  return {
    id: asString(v.id, fallback.id),
    name: name || fallback.name,
    country,
    currency: isCurrency(v.currency) ? v.currency : (countryByCode(country)?.currency ?? fallback.currency),
    shopFor: oneOf(SHOP_FOR, v.shopFor) ? v.shopFor : null,
    traits: sanitizeTraits(v.traits),
    likedColors: liked,
    avoidColors: colorList(v.avoidColors).filter((c) => !liked.includes(c)),
    fit: oneOf(FITS, v.fit) ? v.fit : null,
    occasions: unique(asStringArray(v.occasions).filter((x): x is Occasion => oneOf(OCCASIONS, x))),
    budgetMax: budgetMax > 0 ? budgetMax : null,
    tasteRatings: sanitizeTasteRatings(v.tasteRatings),
    styleArchetypes: unique(asStringArray(v.styleArchetypes).filter((x): x is StyleArchetype => oneOf(STYLE_ARCHETYPES, x))),
    styleScores: sanitizeStyleScores(v.styleScores),
    styleReasons: sanitizeReasons(v.styleReasons),
    vibeScore: Math.max(0, Math.min(100, Math.round(asNumber(v.vibeScore, 0)))),
    sustainabilityPriority: Math.max(0, Math.min(100, asNumber(v.sustainabilityPriority, fallback.sustainabilityPriority))),
    profilerAnswers: sanitizeAnswers(v.profilerAnswers),
    profilerVersion: Math.max(0, Math.floor(asNumber(v.profilerVersion, 0))),
    totalXP: Math.max(0, Math.floor(asNumber(v.totalXP, 0))),
    points: Math.max(0, Math.floor(asNumber(v.points, 0))),
    earnedBadges,
    completedQuests: unique(asStringArray(v.completedQuests).filter((id) => QUEST_STEPS.has(id))),
    wishlist: unique(asStringArray(v.wishlist).filter(isListingId)),
    joinedDate: isDateKey(v.joinedDate) ? v.joinedDate : fallback.joinedDate,
  };
}

export function sanitizePriceAlerts(v: unknown): PriceAlert[] {
  if (!Array.isArray(v)) return [];
  const alerts: PriceAlert[] = [];
  const seenIds = new Set<string>();
  for (const raw of v) {
    if (!isRecord(raw)) continue;
    const id = asString(raw.id, '');
    const itemId = asString(raw.itemId, '');
    const targetPrice = asNumber(raw.targetPrice, NaN);
    if (!id || seenIds.has(id) || !isListingId(itemId) || !(targetPrice > 0) || !isCurrency(raw.currency)) continue;
    seenIds.add(id);
    const status = raw.status === 'triggered' ? 'triggered' : 'active';
    alerts.push({
      id,
      itemId,
      currency: raw.currency,
      targetPrice,
      priceAtCreation: asNumber(raw.priceAtCreation, asNumber(raw.currentPrice, targetPrice)),
      createdAt: isIsoDate(raw.createdAt) ? raw.createdAt : new Date(0).toISOString(),
      status,
      triggeredAt: status === 'triggered' && isIsoDate(raw.triggeredAt) ? raw.triggeredAt : undefined,
      triggeredPrice: status === 'triggered' ? asNumber(raw.triggeredPrice, targetPrice) : undefined,
      acknowledged: asBoolean(raw.acknowledged, status === 'active'),
    });
  }
  return alerts;
}

export function sanitizeQuestProgress(v: unknown): Record<string, QuestProgress> {
  if (!isRecord(v)) return {};
  const result: Record<string, QuestProgress> = {};
  for (const [questId, raw] of Object.entries(v)) {
    const totalSteps = QUEST_STEPS.get(questId);
    if (totalSteps === undefined || !isRecord(raw)) continue;
    if (raw.status !== 'in-progress' && raw.status !== 'completed' && raw.status !== 'expired') continue;
    const stepsDone = Math.max(0, Math.min(totalSteps, Math.floor(asNumber(raw.completedSteps, 0))));
    // Completion (and its rewards) only ever happens through the store's
    // final-step action, so an in-progress quest is never auto-completed here
    // (e.g. after a content update shortened it); the last step stays claimable.
    const completedSteps =
      raw.status === 'completed' ? totalSteps : raw.status === 'in-progress' ? Math.min(stepsDone, totalSteps - 1) : stepsDone;
    const startedAt = isIsoDate(raw.startedAt) ? raw.startedAt : new Date().toISOString();
    const durationDays = QUEST_DURATIONS.get(questId);
    let deadline = isIsoDate(raw.deadline) ? raw.deadline : undefined;
    if (!deadline && raw.status === 'in-progress' && durationDays) {
      // Timed quests always carry a deadline (older data may lack one).
      deadline = new Date(new Date(startedAt).getTime() + durationDays * DAY_MS).toISOString();
    }
    result[questId] = {
      status: raw.status,
      completedSteps,
      startedAt,
      deadline,
      completedAt: isIsoDate(raw.completedAt) ? raw.completedAt : undefined,
    };
  }
  return result;
}

export function sanitizePurchases(v: unknown): Purchase[] {
  if (!Array.isArray(v)) return [];
  const purchases: Purchase[] = [];
  const seenItems = new Set<string>();
  for (const raw of v) {
    if (!isRecord(raw)) continue;
    const itemId = asString(raw.itemId, '');
    const pricePaid = asNumber(raw.pricePaid, NaN);
    if (!itemId || seenItems.has(itemId) || !isListingId(itemId) || !(pricePaid >= 0) || !isCurrency(raw.currency)) continue;
    seenItems.add(itemId);
    const originalPrice = asNumber(raw.originalPrice, NaN);
    const paidInHome = asNumber(raw.paidInHome, NaN);
    const savedInHome = asNumber(raw.savedInHome, NaN);
    purchases.push({
      id: asString(raw.id, `purchase-${itemId}`),
      itemId,
      title: asString(raw.title, 'Purchase').slice(0, 200),
      platform: asString(raw.platform, 'Marketplace').slice(0, 60),
      currency: raw.currency,
      pricePaid,
      originalPrice: originalPrice > 0 ? originalPrice : null,
      homeCurrency: isCurrency(raw.homeCurrency) ? raw.homeCurrency : raw.currency,
      paidInHome: paidInHome >= 0 ? paidInHome : isCurrency(raw.homeCurrency) ? null : pricePaid,
      savedInHome: savedInHome >= 0 ? savedInHome : null,
      secondhand: asBoolean(raw.secondhand, false),
      purchasedAt: isIsoDate(raw.purchasedAt) ? raw.purchasedAt : new Date().toISOString(),
    });
  }
  return purchases;
}

export function sanitizeStreak(v: unknown): StreakState {
  if (!isRecord(v)) return { lastActiveDate: null, current: 0, longest: 0 };
  const current = Math.max(0, Math.floor(asNumber(v.current, 0)));
  return {
    lastActiveDate: isDateKey(v.lastActiveDate) ? v.lastActiveDate : null,
    current,
    longest: Math.max(current, Math.floor(asNumber(v.longest, 0))),
  };
}

/** Validates a persisted snapshot. Returns {} for anything unusable. */
export function sanitizePersistedState(v: unknown, now: Date = new Date()): Partial<PersistedState> {
  if (!isRecord(v)) return {};
  const profile = sanitizeProfile(v.profile, now);
  const isProfileComplete = asBoolean(v.isProfileComplete, false) && Object.keys(profile.styleScores).length > 0;
  return {
    profile,
    isProfileComplete,
    vibeSummary: isProfileComplete ? asString(v.vibeSummary, '') : '',
    priceAlerts: sanitizePriceAlerts(v.priceAlerts),
    questProgress: sanitizeQuestProgress(v.questProgress),
    purchases: sanitizePurchases(v.purchases),
    streak: sanitizeStreak(v.streak),
  };
}

// ---- Migration ----

/** v3 listing ids had no market; every listing then was offered to shoppers in India. */
export function migrateListingId(id: unknown): unknown {
  return typeof id === 'string' ? id.replace(/^(flipkart|ebay):(?![A-Z]{2}:)/, '$1:IN:') : id;
}

const BUDGET_TIER_MAX_INR: Record<string, number | null> = {
  'budget-low': 500,
  'budget-mid': 1500,
  'budget-high': 3000,
  'budget-premium': null,
};

/** v0/v1 (pre-release): level/xp counters, badge lists and quest copies → v2 shapes. */
function migrateFromV1(persisted: UnknownRecord): UnknownRecord {
  const oldProfile = isRecord(persisted.profile) ? persisted.profile : {};
  const level = Math.max(1, Math.floor(asNumber(oldProfile.level, 1)));
  const xpIntoLevel = Math.max(0, asNumber(oldProfile.xp, 0));
  const totalXP = (LEVEL_THRESHOLDS[Math.min(level, LEVEL_THRESHOLDS.length) - 1] ?? 0) + xpIntoLevel;

  const earnedBadges: Record<string, string> = {};
  if (Array.isArray(oldProfile.badges)) {
    for (const badge of oldProfile.badges) {
      if (isRecord(badge) && typeof badge.id === 'string' && isDateKey(badge.earnedDate)) earnedBadges[badge.id] = badge.earnedDate;
    }
  }

  const completedQuests = asStringArray(oldProfile.completedQuests);
  const questProgress: Record<string, unknown> = {};
  if (Array.isArray(persisted.quests)) {
    for (const quest of persisted.quests) {
      if (!isRecord(quest) || typeof quest.id !== 'string') continue;
      if (quest.status === 'in-progress') {
        questProgress[quest.id] = { status: 'in-progress', completedSteps: quest.completedSteps, startedAt: new Date().toISOString() };
      } else if (quest.status === 'completed' && completedQuests.includes(quest.id)) {
        const now = new Date().toISOString();
        questProgress[quest.id] = { status: 'completed', completedSteps: 0, startedAt: now, completedAt: now };
      }
    }
  }

  return {
    // The old profile's style came from a different quiz; it is retaken.
    profile: { ...oldProfile, totalXP, earnedBadges, styleScores: {}, styleArchetypes: [], vibeScore: 0, profilerAnswers: {} },
    isProfileComplete: false,
    vibeSummary: '',
    priceAlerts: Array.isArray(persisted.priceAlerts)
      ? persisted.priceAlerts.map((a) => (isRecord(a) ? { ...a, priceAtCreation: a.currentPrice, status: 'active', acknowledged: true } : a))
      : [],
    questProgress,
    purchases: [],
    streak: { lastActiveDate: null, current: 0, longest: 0 },
  };
}

/**
 * Upgrades older persisted snapshots to the current shape.
 *  v0/v1 → v2: lifetime XP, badge map, quest progress (pre-release data).
 *  v2/v3 → v4: global marketplaces. Listing ids gain their market ("flipkart:IN:…"), purchases
 *  keep their rupee amounts, the budget tier becomes a rupee budget, and the profile is marked
 *  for an update (the profiler now asks about country, sections, colours, fit and occasions).
 *  Style scores from v3 are kept until then.
 */
export function migratePersistedState(persisted: unknown, fromVersion: number): unknown {
  if (!isRecord(persisted)) return persisted;
  let state: UnknownRecord = fromVersion < 2 ? migrateFromV1(persisted) : persisted;
  if (fromVersion >= 4) return state;

  const profile = isRecord(state.profile) ? state.profile : {};
  const budgetTier = typeof profile.budgetTier === 'string' ? profile.budgetTier : null;
  state = {
    ...state,
    profile: {
      ...profile,
      country: 'IN',
      currency: 'INR',
      budgetMax: budgetTier && budgetTier in BUDGET_TIER_MAX_INR ? BUDGET_TIER_MAX_INR[budgetTier] : null,
      profilerVersion: 1,
      wishlist: asStringArray(profile.wishlist).map((id) => migrateListingId(id)),
    },
    priceAlerts: Array.isArray(state.priceAlerts)
      ? state.priceAlerts.map((a) => (isRecord(a) ? { ...a, itemId: migrateListingId(a.itemId) } : a))
      : [],
    purchases: Array.isArray(state.purchases)
      ? state.purchases.map((p) => {
          if (!isRecord(p)) return p;
          const rate = asNumber(p.inrRate, p.currency === 'INR' ? 1 : NaN);
          const paid = asNumber(p.pricePaid, NaN);
          const original = asNumber(p.originalPrice, NaN);
          return {
            ...p,
            itemId: migrateListingId(p.itemId),
            homeCurrency: 'INR',
            paidInHome: rate > 0 && paid >= 0 ? Math.round(paid * rate * 100) / 100 : null,
            savedInHome: rate > 0 && original > paid ? Math.round((original - paid) * rate * 100) / 100 : null,
            secondhand: asBoolean(p.secondhand, p.platform !== 'Flipkart'),
          };
        })
      : [],
  };
  return state;
}
