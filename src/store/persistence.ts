// ============================================================
// VibeVault – Persisted state: defaults, validation & migration
//
// Only user data is persisted. Catalogue/quest/badge definitions
// always come from the app bundle, so content updates reach
// existing installs. Everything read from storage is validated
// so corrupted or outdated data can never crash the app.
// ============================================================

import { QUEST_DEFINITIONS, BADGES } from '../data/content';
import { LEVEL_THRESHOLDS } from '../services/gamification';
import { computeStyleScores, computeVibeScore, generateVibeSummary } from '../services/styleEngine';
import {
  BudgetTier,
  MediaPreference,
  MusicGenre,
  PersonalityDimension,
  Platform,
  PriceAlert,
  ProfilerAnswers,
  Purchase,
  QuestProgress,
  StreakState,
  StyleArchetype,
  StyleScores,
  UserProfile,
} from '../types';
import { DAY_MS, toDateKey } from '../utils/date';
import { STYLE_ARCHETYPES, PLATFORMS } from '../constants/marketplaces';

export const STORE_NAME = 'vibevault-store-v1';
export const STORE_VERSION = 3;
export const MAX_NAME_LENGTH = 24;
export const DEFAULT_NAME = 'VibeVault User';

export interface PersistedState {
  profile: UserProfile;
  isProfileComplete: boolean;
  vibeSummary: string;
  priceAlerts: PriceAlert[];
  questProgress: Record<string, QuestProgress>;
  purchases: Purchase[];
  streak: StreakState;
}

export function createDefaultProfile(now: Date = new Date()): UserProfile {
  return {
    id: 'user-001',
    name: DEFAULT_NAME,
    personalityTraits: [],
    musicGenres: [],
    mediaPreferences: [],
    styleArchetypes: [],
    styleScores: {},
    vibeScore: 0,
    budgetTier: null,
    sustainabilityPriority: 50,
    profilerAnswers: {},
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

const PERSONALITY: PersonalityDimension[] = ['introvert', 'extrovert', 'analytical', 'creative', 'traditional', 'avant-garde'];
const MUSIC: MusicGenre[] = ['pop', 'rock', 'hip-hop', 'jazz', 'electronic', 'classical', 'indie', 'r&b', 'country', 'metal'];
const MEDIA: MediaPreference[] = ['action', 'romance', 'sci-fi', 'documentary', 'anime', 'comedy', 'thriller', 'drama'];
const BUDGETS: BudgetTier[] = ['budget-low', 'budget-mid', 'budget-high', 'budget-premium'];

/** Ids of live marketplace listings (`flipkart:…` / `ebay:…`); anything else (e.g. old mock items) is dropped. */
export const isListingId = (id: string) => /^(flipkart|ebay):[^\s]{1,200}$/.test(id);
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

function sanitizeAnswers(v: unknown): ProfilerAnswers {
  if (!isRecord(v)) return {};
  const answers: ProfilerAnswers = {};
  for (const [key, value] of Object.entries(v)) {
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) answers[key] = value;
    else if (Array.isArray(value)) answers[key] = value.filter((x): x is string => typeof x === 'string');
  }
  return answers;
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

  return {
    id: asString(v.id, fallback.id),
    name: name || fallback.name,
    personalityTraits: unique(asStringArray(v.personalityTraits).filter((x): x is PersonalityDimension => oneOf(PERSONALITY, x))),
    musicGenres: unique(asStringArray(v.musicGenres).filter((x): x is MusicGenre => oneOf(MUSIC, x))),
    mediaPreferences: unique(asStringArray(v.mediaPreferences).filter((x): x is MediaPreference => oneOf(MEDIA, x))),
    styleArchetypes: unique(asStringArray(v.styleArchetypes).filter((x): x is StyleArchetype => oneOf(STYLE_ARCHETYPES, x))),
    styleScores: sanitizeStyleScores(v.styleScores),
    vibeScore: Math.max(0, Math.min(100, Math.round(asNumber(v.vibeScore, 0)))),
    budgetTier: oneOf(BUDGETS, v.budgetTier) ? v.budgetTier : null,
    sustainabilityPriority: Math.max(0, Math.min(100, asNumber(v.sustainabilityPriority, fallback.sustainabilityPriority))),
    profilerAnswers: sanitizeAnswers(v.profilerAnswers),
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
    if (
      !itemId || seenItems.has(itemId) || !isListingId(itemId) || !(pricePaid >= 0) ||
      !oneOf(PLATFORMS as Platform[], raw.platform) || !isCurrency(raw.currency)
    ) {
      continue;
    }
    seenItems.add(itemId);
    const originalPrice = asNumber(raw.originalPrice, NaN);
    const inrRate = asNumber(raw.inrRate, NaN);
    purchases.push({
      id: asString(raw.id, `purchase-${itemId}`),
      itemId,
      title: asString(raw.title, 'Purchase'),
      platform: raw.platform,
      currency: raw.currency,
      pricePaid,
      originalPrice: originalPrice > 0 ? originalPrice : null,
      inrRate: inrRate > 0 ? inrRate : raw.currency === 'INR' ? 1 : null,
      secondhand: asBoolean(raw.secondhand, raw.platform !== 'Flipkart'),
      co2Saved: Math.max(0, asNumber(raw.co2Saved, 0)),
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

/**
 * Upgrades older persisted snapshots to the current shape.
 * v0 (pre-release) persisted the whole catalogue, quest
 * definitions and level/xp counters instead of lifetime XP.
 * v2 → v3 (live catalogue): wishlist items, alerts and purchases
 * that point at the old sample listings are dropped by the
 * sanitizer, since those items never existed on a marketplace.
 */
export function migratePersistedState(persisted: unknown, fromVersion: number): unknown {
  if (!isRecord(persisted)) return persisted;
  if (fromVersion >= 2) return persisted;

  const oldProfile = isRecord(persisted.profile) ? persisted.profile : {};

  // Lifetime XP from level + XP into level.
  const level = Math.max(1, Math.floor(asNumber(oldProfile.level, 1)));
  const xpIntoLevel = Math.max(0, asNumber(oldProfile.xp, 0));
  const totalXP = (LEVEL_THRESHOLDS[Math.min(level, LEVEL_THRESHOLDS.length) - 1] ?? 0) + xpIntoLevel;

  // Earned badges from the old Badge[] list.
  const earnedBadges: Record<string, string> = {};
  if (Array.isArray(oldProfile.badges)) {
    for (const badge of oldProfile.badges) {
      if (isRecord(badge) && typeof badge.id === 'string' && isDateKey(badge.earnedDate)) earnedBadges[badge.id] = badge.earnedDate;
    }
  }

  // Style scores weren't stored before; recompute from the stored signals.
  const signals = {
    personality: asStringArray(oldProfile.personalityTraits).filter((x): x is PersonalityDimension => oneOf(PERSONALITY, x)),
    music: asStringArray(oldProfile.musicGenres).filter((x): x is MusicGenre => oneOf(MUSIC, x)),
    media: asStringArray(oldProfile.mediaPreferences).filter((x): x is MediaPreference => oneOf(MEDIA, x)),
    palette: null,
    weekend: null,
  };
  const ranked = computeStyleScores(signals);
  const wasComplete = asBoolean(persisted.isProfileComplete, false) && ranked.length > 0;

  const completedQuests = asStringArray(oldProfile.completedQuests);
  const questProgress: Record<string, unknown> = {};
  if (Array.isArray(persisted.quests)) {
    for (const quest of persisted.quests) {
      if (!isRecord(quest) || typeof quest.id !== 'string') continue;
      if (quest.status === 'in-progress') {
        questProgress[quest.id] = { status: 'in-progress', completedSteps: quest.completedSteps, startedAt: new Date().toISOString() };
      } else if (quest.status === 'completed' && completedQuests.includes(quest.id)) {
        // Only quests the user actually completed (and was rewarded for) carry over;
        // the sanitizer sets completedSteps to the quest's full step count.
        const now = new Date().toISOString();
        questProgress[quest.id] = { status: 'completed', completedSteps: 0, startedAt: now, completedAt: now };
      }
    }
  }

  const priceAlerts = Array.isArray(persisted.priceAlerts)
    ? persisted.priceAlerts.map((alert) =>
        isRecord(alert)
          ? { ...alert, priceAtCreation: alert.currentPrice, status: 'active', acknowledged: true }
          : alert,
      )
    : [];

  return {
    profile: {
      ...oldProfile,
      totalXP,
      earnedBadges,
      styleScores: wasComplete ? Object.fromEntries(ranked) : {},
      styleArchetypes: wasComplete ? ranked.slice(0, 3).map(([s]) => s) : [],
      vibeScore: wasComplete ? computeVibeScore(signals) : 0,
      budgetTier: null,
      sustainabilityPriority: 50,
      profilerAnswers: {},
    },
    isProfileComplete: wasComplete,
    vibeSummary: wasComplete ? generateVibeSummary(ranked.slice(0, 3).map(([s]) => s)) : '',
    priceAlerts,
    questProgress,
    purchases: [],
    streak: { lastActiveDate: null, current: 0, longest: 0 },
  };
}
