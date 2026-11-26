// ============================================================
// VibeVault – Gamification (Objective 3)
// Levels, quests, streaks and eco-impact metrics.
// All functions are pure so they are easy to test.
// ============================================================

import { BADGES } from '../data/content';
import { CO2_KG_PER_TREE_YEAR, WATER_LITERS_PER_KG_CO2 } from './sustainability';
import {
  Badge,
  Purchase,
  Quest,
  QuestDefinition,
  QuestProgress,
  StreakState,
  SustainabilityMetrics,
} from '../types';
import { DAY_MS, daysBetween, parseDateKey } from '../utils/date';

// ---- Levels ----

/** Lifetime XP required to reach level (index + 1). */
export const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500, 7500, 10000];
export const MAX_LEVEL = LEVEL_THRESHOLDS.length;

const LEVEL_TITLES = [
  'Thrift Rookie',
  'Rack Raider',
  'Bargain Hunter',
  'Style Scout',
  'Vibe Curator',
  'Deal Detective',
  'Trend Alchemist',
  'Eco Icon',
  'Vintage Virtuoso',
  'Style Sage',
  'Thrift Legend',
  'VibeVault Master',
];

export interface LevelInfo {
  level: number;
  title: string;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP needed to complete the current level (0 at max level). */
  xpForLevel: number;
  /** 0–100 progress towards the next level (100 at max level). */
  progress: number;
  isMaxLevel: boolean;
}

export function getLevelInfo(totalXP: number): LevelInfo {
  const xp = Math.max(0, Number.isFinite(totalXP) ? Math.floor(totalXP) : 0);
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }
  const title = LEVEL_TITLES[level - 1] ?? LEVEL_TITLES[LEVEL_TITLES.length - 1];
  if (level >= MAX_LEVEL) {
    return { level: MAX_LEVEL, title, xpIntoLevel: xp - LEVEL_THRESHOLDS[MAX_LEVEL - 1], xpForLevel: 0, progress: 100, isMaxLevel: true };
  }
  const floor = LEVEL_THRESHOLDS[level - 1];
  const xpForLevel = LEVEL_THRESHOLDS[level] - floor;
  const xpIntoLevel = xp - floor;
  return { level, title, xpIntoLevel, xpForLevel, progress: Math.round((xpIntoLevel / xpForLevel) * 100), isMaxLevel: false };
}

// ---- Badges ----

export const BADGE_BY_ID: Record<string, Badge> = Object.fromEntries(BADGES.map((b) => [b.id, b]));

// ---- Quests ----

export function isQuestOverdue(progress: QuestProgress | undefined, now: Date): boolean {
  if (!progress || progress.status !== 'in-progress' || !progress.deadline) return false;
  return now.getTime() > new Date(progress.deadline).getTime();
}

export function mergeQuest(definition: QuestDefinition, progress: QuestProgress | undefined): Quest {
  const totalSteps = definition.steps.length;
  if (!progress) {
    return { ...definition, status: 'available', progress: 0, totalSteps, completedSteps: 0 };
  }
  const completedSteps = Math.max(0, Math.min(totalSteps, progress.completedSteps));
  return {
    ...definition,
    status: progress.status,
    progress: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
    totalSteps,
    completedSteps,
    startedAt: progress.startedAt,
    deadline: progress.deadline,
    completedAt: progress.completedAt,
  };
}

export function startQuestProgress(definition: QuestDefinition, now: Date): QuestProgress {
  return {
    status: 'in-progress',
    completedSteps: 0,
    startedAt: now.toISOString(),
    deadline: definition.durationDays ? new Date(now.getTime() + definition.durationDays * DAY_MS).toISOString() : undefined,
  };
}

/** Human friendly time left, e.g. "3 days left", "Ends today". */
export function describeTimeLeft(deadlineIso: string, now: Date): string {
  const deadline = new Date(deadlineIso);
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) return 'Time is up';
  const days = daysBetween(now, deadline);
  if (days <= 0) return 'Ends today';
  if (days === 1) return 'Ends tomorrow';
  return `${days} days left`;
}

// ---- Streaks ----

/** Updates the daily streak for a visit on `todayKey` (YYYY-MM-DD). */
export function updateStreak(streak: StreakState, todayKey: string): StreakState {
  if (streak.lastActiveDate === todayKey) return streak;
  const today = parseDateKey(todayKey);
  const last = streak.lastActiveDate ? parseDateKey(streak.lastActiveDate) : null;
  let current = 1;
  if (today && last) {
    const gap = daysBetween(last, today);
    if (gap === 1) current = streak.current + 1;
    // Clock moved backwards (e.g. it was set ahead earlier): re-anchor on today
    // without penalising the user, so later visits keep counting normally.
    else if (gap < 0) return { ...streak, lastActiveDate: todayKey };
  }
  return { lastActiveDate: todayKey, current, longest: Math.max(streak.longest, current) };
}

// ---- Sustainability ----

export function computeSustainability(purchases: Purchase[]): SustainabilityMetrics {
  const thrifted = purchases.filter((p) => p.secondhand);
  const co2 = thrifted.reduce((sum, p) => sum + Math.max(0, p.co2Saved), 0);
  // Savings vs retail, converted to rupees with the rate recorded at purchase time.
  const savedInr = purchases.reduce((sum, p) => {
    if (p.originalPrice === null || p.inrRate === null) return sum;
    return sum + Math.max(0, p.originalPrice - p.pricePaid) * p.inrRate;
  }, 0);
  return {
    totalCO2Saved: Math.round(co2 * 10) / 10,
    itemsThrifted: thrifted.length,
    waterSavedLiters: Math.round(co2 * WATER_LITERS_PER_KG_CO2),
    moneySavedInr: Math.round(savedInr),
    treesEquivalent: Math.round((co2 / CO2_KG_PER_TREE_YEAR) * 100) / 100,
  };
}
