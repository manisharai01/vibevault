// ============================================================
// VibeVault – Style Matching Engine (Objective 1)
//
// Translates personality traits, music genres, media taste,
// colour palette and lifestyle answers into style-archetype
// affinities, then ranks listings against them (factoring in
// sustainability priority and budget).
// ============================================================

import { STYLE_ARCHETYPES } from '../constants/marketplaces';
import { DEFAULT_SUSTAINABILITY_ANSWER, QUESTION_IDS } from '../data/profilerQuestions';
import {
  BudgetTier,
  FashionItem,
  MediaPreference,
  MusicGenre,
  PersonalityDimension,
  ProfilerAnswers,
  StyleArchetype,
  StyleScores,
  UserProfile,
} from '../types';
import { getDealScore } from './priceEngine';

type Affinity = Partial<Record<StyleArchetype, number>>;

// ---- Mapping matrices (signal → style affinity) ----

const PERSONALITY_STYLE_MAP: Record<PersonalityDimension, Affinity> = {
  introvert: { Minimalist: 0.9, 'Dark Academia': 0.8, Cottagecore: 0.7, Vintage: 0.6 },
  extrovert: { Streetwear: 0.9, Y2K: 0.8, Bohemian: 0.7, Athleisure: 0.6 },
  analytical: { Minimalist: 0.9, Preppy: 0.7, 'Dark Academia': 0.8 },
  creative: { Bohemian: 0.9, Vintage: 0.8, Y2K: 0.7, Grunge: 0.6, Streetwear: 0.5 },
  traditional: { Preppy: 0.9, Vintage: 0.8, 'Dark Academia': 0.7, Minimalist: 0.5 },
  'avant-garde': { Y2K: 0.9, Streetwear: 0.8, Grunge: 0.7, Bohemian: 0.6 },
};

const MUSIC_STYLE_MAP: Record<MusicGenre, Affinity> = {
  pop: { Y2K: 0.8, Athleisure: 0.6, Streetwear: 0.5 },
  rock: { Grunge: 0.9, Vintage: 0.7, Streetwear: 0.5 },
  'hip-hop': { Streetwear: 0.95, Y2K: 0.6, Athleisure: 0.5 },
  jazz: { Vintage: 0.9, 'Dark Academia': 0.8, Minimalist: 0.6 },
  electronic: { Y2K: 0.8, Streetwear: 0.7, Minimalist: 0.5 },
  classical: { 'Dark Academia': 0.9, Preppy: 0.8, Minimalist: 0.7 },
  indie: { Bohemian: 0.9, Vintage: 0.8, Cottagecore: 0.7, Grunge: 0.5 },
  'r&b': { Streetwear: 0.7, Y2K: 0.7, Bohemian: 0.5 },
  country: { Cottagecore: 0.9, Bohemian: 0.7, Vintage: 0.6 },
  metal: { Grunge: 0.95, Streetwear: 0.6 },
};

const MEDIA_STYLE_MAP: Record<MediaPreference, Affinity> = {
  action: { Streetwear: 0.7, Athleisure: 0.8, Grunge: 0.5 },
  romance: { Cottagecore: 0.8, Bohemian: 0.7, Vintage: 0.6 },
  'sci-fi': { Y2K: 0.9, Minimalist: 0.7, Streetwear: 0.5 },
  documentary: { Minimalist: 0.8, 'Dark Academia': 0.7, Preppy: 0.5 },
  anime: { Y2K: 0.9, Streetwear: 0.7, Grunge: 0.5 },
  comedy: { Athleisure: 0.6, Bohemian: 0.6, Preppy: 0.5, Streetwear: 0.5 },
  thriller: { 'Dark Academia': 0.8, Grunge: 0.7, Minimalist: 0.6 },
  drama: { Vintage: 0.8, 'Dark Academia': 0.7, Bohemian: 0.6, Preppy: 0.5 },
};

/** Colour palette answer → direct archetype affinity. */
const PALETTE_STYLE_MAP: Record<string, Affinity> = {
  minimalist: { Minimalist: 1 },
  streetwear: { Streetwear: 0.8, Y2K: 0.6 },
  bohemian: { Bohemian: 1 },
  vintage: { Vintage: 1, 'Dark Academia': 0.3 },
  'dark-academia': { 'Dark Academia': 1, Grunge: 0.4 },
  cottagecore: { Cottagecore: 1, Preppy: 0.3 },
};

/** Weekend activity answer → direct archetype affinity. */
const WEEKEND_STYLE_MAP: Record<string, Affinity> = {
  'dark-academia': { 'Dark Academia': 0.9, Preppy: 0.4 },
  streetwear: { Streetwear: 0.9, Grunge: 0.4 },
  cottagecore: { Cottagecore: 0.9, Bohemian: 0.4 },
  athleisure: { Athleisure: 1 },
  'avant-garde': { Y2K: 0.7, Grunge: 0.5, Streetwear: 0.4 },
  vintage: { Vintage: 0.9, Bohemian: 0.3 },
};

const WEIGHTS = { personality: 0.4, music: 0.35, media: 0.25, palette: 0.45, weekend: 0.45 };

/** Upper bound of each budget tier in USD (per item). */
export const BUDGET_LIMITS: Record<BudgetTier, number> = {
  'budget-low': 10,
  'budget-mid': 30,
  'budget-high': 60,
  'budget-premium': Number.POSITIVE_INFINITY,
};

export const BUDGET_LABELS: Record<BudgetTier, string> = {
  'budget-low': 'Under $10',
  'budget-mid': '$10 – $30',
  'budget-high': '$30 – $60',
  'budget-premium': '$60+',
};

const PERSONALITY_VALUES = Object.keys(PERSONALITY_STYLE_MAP) as PersonalityDimension[];
const MUSIC_VALUES = Object.keys(MUSIC_STYLE_MAP) as MusicGenre[];
const MEDIA_VALUES = Object.keys(MEDIA_STYLE_MAP) as MediaPreference[];
const BUDGET_VALUES = Object.keys(BUDGET_LIMITS) as BudgetTier[];

export interface StyleSignals {
  personality: PersonalityDimension[];
  music: MusicGenre[];
  media: MediaPreference[];
  palette: string | null;
  weekend: string | null;
  budgetTier: BudgetTier | null;
  sustainabilityPriority: number;
}

const asString = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const asStringArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const unique = <T,>(values: T[]): T[] => Array.from(new Set(values));

/** Converts raw profiler answers into validated style signals. */
export function deriveSignals(answers: ProfilerAnswers): StyleSignals {
  const personality: PersonalityDimension[] = [];
  for (const id of [QUESTION_IDS.personality, QUESTION_IDS.thinking]) {
    const value = asString(answers[id]);
    if (value && (PERSONALITY_VALUES as string[]).includes(value)) personality.push(value as PersonalityDimension);
  }

  const weekend = asString(answers[QUESTION_IDS.weekend]);
  const palette = asString(answers[QUESTION_IDS.palette]);
  const budget = asString(answers[QUESTION_IDS.budget]);
  const rawSustainability = answers[QUESTION_IDS.sustainability];
  const sustainability =
    typeof rawSustainability === 'number' && Number.isFinite(rawSustainability)
      ? Math.max(0, Math.min(100, rawSustainability))
      : DEFAULT_SUSTAINABILITY_ANSWER;

  return {
    personality: unique(personality),
    music: unique(asStringArray(answers[QUESTION_IDS.music]).filter((m): m is MusicGenre => (MUSIC_VALUES as string[]).includes(m))),
    media: unique(asStringArray(answers[QUESTION_IDS.media]).filter((m): m is MediaPreference => (MEDIA_VALUES as string[]).includes(m))),
    palette: palette && PALETTE_STYLE_MAP[palette] ? palette : null,
    weekend: weekend && WEEKEND_STYLE_MAP[weekend] ? weekend : null,
    budgetTier: budget && (BUDGET_VALUES as string[]).includes(budget) ? (budget as BudgetTier) : null,
    sustainabilityPriority: sustainability,
  };
}

/** Raw (unnormalised) affinity per archetype. */
export function computeRawStyleAffinity(signals: Pick<StyleSignals, 'personality' | 'music' | 'media' | 'palette' | 'weekend'>): Record<StyleArchetype, number> {
  const raw = Object.fromEntries(STYLE_ARCHETYPES.map((a) => [a, 0])) as Record<StyleArchetype, number>;
  const add = (map: Affinity | undefined, weight: number) => {
    if (!map) return;
    for (const [style, score] of Object.entries(map) as [StyleArchetype, number][]) {
      raw[style] += score * weight;
    }
  };
  signals.personality.forEach((p) => add(PERSONALITY_STYLE_MAP[p], WEIGHTS.personality));
  signals.music.forEach((m) => add(MUSIC_STYLE_MAP[m], WEIGHTS.music));
  signals.media.forEach((m) => add(MEDIA_STYLE_MAP[m], WEIGHTS.media));
  if (signals.palette) add(PALETTE_STYLE_MAP[signals.palette], WEIGHTS.palette);
  if (signals.weekend) add(WEEKEND_STYLE_MAP[signals.weekend], WEIGHTS.weekend);
  if (signals.weekend === 'avant-garde') add(PERSONALITY_STYLE_MAP['avant-garde'], WEIGHTS.personality / 2);
  return raw;
}

/** Archetypes with a normalised 0–100 score, strongest first (zero scores omitted). */
export function computeStyleScores(
  signals: Pick<StyleSignals, 'personality' | 'music' | 'media' | 'palette' | 'weekend'>,
): [StyleArchetype, number][] {
  const raw = computeRawStyleAffinity(signals);
  const max = Math.max(...Object.values(raw));
  if (!(max > 0)) return [];
  return (Object.entries(raw) as [StyleArchetype, number][])
    .filter(([, value]) => value > 0)
    .map(([style, value]): [StyleArchetype, number] => [style, Math.round((value / max) * 100)])
    .sort((a, b) => b[1] - a[1] || STYLE_ARCHETYPES.indexOf(a[0]) - STYLE_ARCHETYPES.indexOf(b[0]));
}

/**
 * Vibe strength (0–100): how strongly the answers agree on the top
 * three archetypes. Evenly spread answers score low; a focused,
 * consistent profile scores high.
 */
export function computeVibeScore(signals: Pick<StyleSignals, 'personality' | 'music' | 'media' | 'palette' | 'weekend'>): number {
  const values = Object.values(computeRawStyleAffinity(signals)).sort((a, b) => b - a);
  const total = values.reduce((sum, v) => sum + v, 0);
  if (!(total > 0)) return 0;
  const top3Share = (values[0] + values[1] + values[2]) / total; // 0.3 (uniform) … 1 (focused)
  const normalised = Math.max(0, Math.min(1, (top3Share - 0.3) / 0.6));
  return Math.round(40 + 60 * normalised);
}

export function generateVibeSummary(archetypes: StyleArchetype[]): string {
  const vibeMap: Record<StyleArchetype, string> = {
    Minimalist: 'clean lines and timeless elegance',
    Streetwear: 'bold urban expression and hype culture',
    Bohemian: 'free-spirited creativity and earth-toned warmth',
    Vintage: 'nostalgic charm and retro sophistication',
    Athleisure: 'sporty comfort meets everyday versatility',
    Preppy: 'polished classics with academic flair',
    Grunge: 'raw edge and rebellious authenticity',
    Cottagecore: 'pastoral romance and handcrafted beauty',
    'Dark Academia': 'intellectual depth and moody sophistication',
    Y2K: 'futuristic nostalgia and playful maximalism',
  };

  if (archetypes.length === 0) return 'Express yourself through fashion!';
  const descriptions = archetypes.slice(0, 3).map((a) => vibeMap[a] ?? a);
  if (descriptions.length === 1) return `Your vibe: ${descriptions[0]}.`;
  if (descriptions.length === 2) return `Your vibe blends ${descriptions[0]} with ${descriptions[1]}.`;
  return `Your vibe fuses ${descriptions[0]}, ${descriptions[1]}, and ${descriptions[2]}.`;
}

export interface StyleProfileResult {
  personality: PersonalityDimension[];
  music: MusicGenre[];
  media: MediaPreference[];
  styleScores: StyleScores;
  topStyles: StyleArchetype[];
  vibeScore: number;
  vibeSummary: string;
  budgetTier: BudgetTier | null;
  sustainabilityPriority: number;
}

/** Full profile derivation from raw profiler answers. */
export function buildStyleProfile(answers: ProfilerAnswers): StyleProfileResult {
  const signals = deriveSignals(answers);
  const ranked = computeStyleScores(signals);
  const topStyles = ranked.slice(0, 3).map(([style]) => style);
  return {
    personality: signals.personality,
    music: signals.music,
    media: signals.media,
    styleScores: Object.fromEntries(ranked) as StyleScores,
    topStyles,
    vibeScore: computeVibeScore(signals),
    vibeSummary: generateVibeSummary(topStyles),
    budgetTier: signals.budgetTier,
    sustainabilityPriority: signals.sustainabilityPriority,
  };
}

type ScoringProfile = Pick<UserProfile, 'styleScores' | 'budgetTier' | 'sustainabilityPriority'>;

export const hasStyleProfile = (profile: Pick<UserProfile, 'styleScores'>): boolean =>
  Object.keys(profile.styleScores ?? {}).length > 0;

/** 0–100 match score of a listing for the user (0 without a style profile). */
export function scoreItem(item: FashionItem, profile: ScoringProfile): number {
  if (!hasStyleProfile(profile)) return 0;

  // Style overlap (max 70): best archetype match blended with the average.
  const archetypeScores = item.styleArchetypes.map((a) => profile.styleScores[a] ?? 0);
  const best = archetypeScores.length ? Math.max(...archetypeScores) : 0;
  const avg = archetypeScores.length ? archetypeScores.reduce((s, v) => s + v, 0) / archetypeScores.length : 0;
  const styleMatch = ((best * 0.6 + avg * 0.4) / 100) * 70;

  // Sustainability (max 5–20 depending on how much the user cares).
  const priority = Math.max(0, Math.min(100, profile.sustainabilityPriority)) / 100;
  const sustainBonus = (item.sustainabilityScore / 100) * (5 + 15 * priority);

  // Discount vs retail (max 12) and expected price drop (max 8).
  const discount = item.originalPrice > 0 ? Math.max(0, 1 - item.currentPrice / item.originalPrice) : 0;
  const drop7d = item.currentPrice > 0 ? Math.max(0, (item.currentPrice - item.predictedPrice7d) / item.currentPrice) : 0;
  const dealBonus = discount * 12 + Math.min(1, drop7d * 5) * 8;

  // Budget fit: penalise listings well above the user's per-item budget.
  let budgetPenalty = 0;
  if (profile.budgetTier) {
    const limit = BUDGET_LIMITS[profile.budgetTier];
    if (Number.isFinite(limit) && item.currentPrice > limit) {
      budgetPenalty = Math.min(20, ((item.currentPrice - limit) / limit) * 20);
    }
  }

  return Math.round(Math.max(0, Math.min(100, styleMatch + sustainBonus + dealBonus - budgetPenalty)));
}

/**
 * Ranks listings for the user. Without a style profile, items are
 * ordered by deal score and carry a matchScore of 0.
 */
export function getRecommendations(items: FashionItem[], profile: ScoringProfile): FashionItem[] {
  if (!hasStyleProfile(profile)) {
    return items
      .map((item) => ({ ...item, matchScore: 0 }))
      .sort((a, b) => getDealScore(b) - getDealScore(a) || a.id.localeCompare(b.id));
  }
  return items
    .map((item) => ({ ...item, matchScore: scoreItem(item, profile) }))
    .sort((a, b) => b.matchScore - a.matchScore || getDealScore(b) - getDealScore(a) || a.id.localeCompare(b.id));
}
