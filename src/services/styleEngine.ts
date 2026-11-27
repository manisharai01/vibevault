// ============================================================
// VibeVault – Style engine (Objective 1)
//
// 1. Profile: personality answers give six clothing-related traits;
//    traits, colours, fit and occasions point to style archetypes,
//    and the taste check (real listings the user liked or not) adds
//    direct evidence. Every score comes with the reasons behind it.
// 2. Matching: each listing is scored against the profile from its
//    own data (style tags, colours, occasion, fit, price in the
//    user's currency, the price model's advice), with reasons.
// No randomness: the same answers and listings give the same result.
// ============================================================

import { COLOR_FAMILY_LABELS, matchesShopFor, NEUTRAL_FAMILIES, OCCASION_LABELS, STYLE_ARCHETYPES } from '../constants/marketplaces';
import { countryByCode } from '../data/countries';
import { DEFAULT_SUSTAINABILITY_ANSWER, QUESTION_IDS } from '../data/profilerQuestions';
import {
  ColorFamily,
  FashionItem,
  FitPreference,
  Occasion,
  ProfilerAnswers,
  ShopFor,
  StyleArchetype,
  StyleReason,
  StyleScores,
  TasteRating,
  Trait,
  TraitScores,
  UserProfile,
} from '../types';
import { formatMoneyWhole, FxRates } from '../utils/format';
import { priceIn } from './catalog';
import { colorFamilies, fitOf, isPatterned, occasionsOf } from './itemTraits';
import { getBuyAdvice, getDealScore, isAtRecordLow } from './priceEngine';

type Affinity = Partial<Record<StyleArchetype, number>>;

// ---- Personality → traits ----------------------------------------------------
// Six traits from fashion-psychology research on dress and personality:
//   expressive (extraversion: attention-getting, bold dress), novelty (openness: new and
//   unconventional styles), polish (conscientiousness: neat, coordinated, classic dress),
//   warmth (agreeableness: soft, romantic dress), edge (non-conformity) and comfort.

export const TRAIT_LABELS: Record<Trait, string> = {
  expressive: 'expressive',
  novelty: 'drawn to new ideas',
  polish: 'polished',
  warmth: 'warm',
  edge: 'a rule-bender',
  comfort: 'comfort-first',
};

const TRAIT_EFFECTS: Record<string, Record<string, TraitScores>> = {
  [QUESTION_IDS.social]: {
    center: { expressive: 1 },
    'small-group': { expressive: -0.3, warmth: 0.4 },
    host: { warmth: 1, polish: 0.3 },
    observer: { expressive: -1 },
  },
  [QUESTION_IDS.trends]: {
    first: { novelty: 1, expressive: 0.4 },
    adapt: { novelty: 0.5, edge: 0.3 },
    wait: { novelty: -0.4, polish: 0.2 },
    never: { novelty: -1, polish: 0.4 },
  },
  [QUESTION_IDS.routine]: {
    planned: { polish: 1 },
    'go-tos': { polish: 0.4, novelty: -0.3 },
    mood: { novelty: 0.6, expressive: 0.4 },
    comfy: { comfort: 1, polish: -0.5 },
  },
  [QUESTION_IDS.compliment]: {
    'put-together': { polish: 1 },
    unique: { novelty: 1, expressive: 0.3 },
    cool: { edge: 1 },
    warm: { warmth: 1 },
    comfy: { comfort: 1 },
  },
  [QUESTION_IDS.rules]: {
    helpful: { polish: 0.6, edge: -0.6 },
    fine: { polish: 0.2, edge: -0.2 },
    bend: { edge: 0.6, novelty: 0.3 },
    break: { edge: 1, polish: -0.4 },
  },
  [QUESTION_IDS.freeDay]: {
    active: { comfort: 0.8 },
    cafe: { polish: 0.4, warmth: 0.3 },
    city: { edge: 0.5, expressive: 0.5 },
    nature: { warmth: 0.5, comfort: 0.5 },
    gallery: { novelty: 0.8 },
    thrift: { novelty: 0.5, edge: 0.3 },
  },
};

/** How each trait points to each archetype (negative = away from it). */
const TRAIT_LOADINGS: Record<Trait, Affinity> = {
  expressive: { Y2K: 0.8, Streetwear: 0.6, Bohemian: 0.3, Minimalist: -0.6, 'Dark Academia': -0.3 },
  novelty: { Y2K: 0.6, Streetwear: 0.5, Bohemian: 0.5, Vintage: 0.4, Grunge: 0.3, Preppy: -0.5, Minimalist: -0.3 },
  polish: { Preppy: 0.8, Minimalist: 0.6, 'Dark Academia': 0.6, Grunge: -0.6, Athleisure: -0.2 },
  warmth: { Cottagecore: 0.8, Bohemian: 0.5, Vintage: 0.3, Grunge: -0.4 },
  edge: { Grunge: 0.9, Streetwear: 0.6, Y2K: 0.3, Preppy: -0.6, Cottagecore: -0.4 },
  comfort: { Athleisure: 0.9, Streetwear: 0.3, Minimalist: 0.2, Preppy: -0.2, 'Dark Academia': -0.2 },
};

/** Each archetype's core colour families. */
export const ARCHETYPE_PALETTES: Record<StyleArchetype, ColorFamily[]> = {
  Minimalist: ['black', 'white', 'grey', 'neutral', 'navy'],
  Streetwear: ['black', 'white', 'grey', 'red', 'green', 'yellow'],
  Bohemian: ['brown', 'neutral', 'green', 'yellow', 'red'],
  Vintage: ['brown', 'neutral', 'red', 'green', 'navy', 'yellow'],
  Athleisure: ['black', 'grey', 'white', 'blue', 'navy'],
  Preppy: ['navy', 'white', 'red', 'green', 'pink', 'blue'],
  Grunge: ['black', 'grey', 'red', 'green', 'brown'],
  Cottagecore: ['white', 'neutral', 'pink', 'green', 'yellow', 'blue'],
  'Dark Academia': ['brown', 'black', 'navy', 'green', 'neutral', 'grey'],
  Y2K: ['pink', 'purple', 'metallic', 'blue', 'white', 'yellow'],
};

const OCCASION_AFFINITY: Record<Occasion, Affinity> = {
  work: { Preppy: 0.6, Minimalist: 0.6, 'Dark Academia': 0.5 },
  everyday: { Streetwear: 0.4, Minimalist: 0.3, Athleisure: 0.3, Vintage: 0.2 },
  evening: { Y2K: 0.6, Grunge: 0.3, Streetwear: 0.3, Minimalist: 0.2 },
  festive: { Bohemian: 0.5, Vintage: 0.3, Cottagecore: 0.2 },
  active: { Athleisure: 0.9 },
  outdoors: { Athleisure: 0.4, Bohemian: 0.3, Cottagecore: 0.3, Grunge: 0.2 },
};

const FIT_AFFINITY: Record<FitPreference, Affinity> = {
  fitted: { Preppy: 0.4, Minimalist: 0.4, 'Dark Academia': 0.4, Y2K: 0.2 },
  regular: { Minimalist: 0.2, Preppy: 0.2, Vintage: 0.2 },
  relaxed: { Bohemian: 0.4, Cottagecore: 0.4, Athleisure: 0.3, Vintage: 0.2 },
  oversized: { Streetwear: 0.7, Grunge: 0.4, Y2K: 0.3 },
};

const WEIGHTS = { traits: 1, colors: 0.8, occasions: 0.6, fit: 0.5, taste: 1.5 };

const SHOP_FOR: ShopFor[] = ['women', 'men', 'all'];
const FITS: FitPreference[] = ['fitted', 'regular', 'relaxed', 'oversized'];
const OCCASIONS = Object.keys(OCCASION_AFFINITY) as Occasion[];
const FAMILIES = Object.keys(COLOR_FAMILY_LABELS) as ColorFamily[];

export interface StyleSignals {
  country: string | null;
  shopFor: ShopFor | null;
  traits: TraitScores;
  likedColors: ColorFamily[];
  avoidColors: ColorFamily[];
  fit: FitPreference | null;
  occasions: Occasion[];
  budgetMax: number | null;
  sustainabilityPriority: number;
}

const asString = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const unique = <T,>(values: T[]): T[] => Array.from(new Set(values));
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

/** Converts raw profiler answers into validated signals. */
export function deriveSignals(answers: ProfilerAnswers): StyleSignals {
  const traits: TraitScores = {};
  for (const [questionId, effects] of Object.entries(TRAIT_EFFECTS)) {
    const value = asString(answers[questionId]);
    const effect = value ? effects[value] : undefined;
    if (!effect) continue;
    for (const [trait, delta] of Object.entries(effect) as [Trait, number][]) {
      traits[trait] = clamp1((traits[trait] ?? 0) + delta / 2);
    }
  }
  const country = asString(answers[QUESTION_IDS.country]);
  const shopFor = asString(answers[QUESTION_IDS.shopFor]);
  const fit = asString(answers[QUESTION_IDS.fit]);
  const budget = answers[QUESTION_IDS.budget];
  const sustainability = answers[QUESTION_IDS.sustainability];
  const liked = unique(asStrings(answers[QUESTION_IDS.colorsLove]).filter((c): c is ColorFamily => (FAMILIES as string[]).includes(c)));
  return {
    country: country && countryByCode(country) ? country.toUpperCase() : null,
    shopFor: shopFor && (SHOP_FOR as string[]).includes(shopFor) ? (shopFor as ShopFor) : null,
    traits,
    likedColors: liked,
    // A colour can't be both loved and avoided; loved wins.
    avoidColors: unique(
      asStrings(answers[QUESTION_IDS.colorsAvoid]).filter((c): c is ColorFamily => (FAMILIES as string[]).includes(c) && !liked.includes(c as ColorFamily)),
    ),
    fit: fit && (FITS as string[]).includes(fit) ? (fit as FitPreference) : null,
    occasions: unique(asStrings(answers[QUESTION_IDS.occasions]).filter((o): o is Occasion => (OCCASIONS as string[]).includes(o))),
    budgetMax: typeof budget === 'number' && Number.isFinite(budget) && budget > 0 ? budget : null,
    sustainabilityPriority:
      typeof sustainability === 'number' && Number.isFinite(sustainability)
        ? Math.max(0, Math.min(100, sustainability))
        : DEFAULT_SUSTAINABILITY_ANSWER,
  };
}

interface Contribution {
  archetype: StyleArchetype;
  amount: number;
  text: string;
}

const listText = (items: string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

function contributions(signals: StyleSignals, taste: TasteRating[]): Contribution[] {
  const out: Contribution[] = [];
  // Traits
  for (const archetype of STYLE_ARCHETYPES) {
    const positive: Trait[] = [];
    let total = 0;
    for (const [trait, score] of Object.entries(signals.traits) as [Trait, number][]) {
      const amount = score * (TRAIT_LOADINGS[trait][archetype] ?? 0) * WEIGHTS.traits;
      total += amount;
      if (amount > 0.05) positive.push(trait);
    }
    if (total !== 0) {
      out.push({ archetype, amount: total, text: positive.length ? `Your answers say you're ${listText(positive.map((t) => TRAIT_LABELS[t]))}` : '' });
    }
  }
  // Colours
  for (const archetype of STYLE_ARCHETYPES) {
    const palette = ARCHETYPE_PALETTES[archetype];
    const liked = signals.likedColors.filter((c) => palette.includes(c));
    const avoided = signals.avoidColors.filter((c) => palette.includes(c));
    const amount =
      ((signals.likedColors.length ? liked.length / signals.likedColors.length : 0) -
        (signals.avoidColors.length ? (avoided.length / signals.avoidColors.length) * 0.5 : 0)) *
      WEIGHTS.colors;
    if (amount !== 0) {
      out.push({ archetype, amount, text: liked.length ? `Its palette has the colours you love (${listText(liked.map((c) => COLOR_FAMILY_LABELS[c].toLowerCase()))})` : '' });
    }
  }
  // Occasions
  for (const occasion of signals.occasions) {
    for (const [archetype, value] of Object.entries(OCCASION_AFFINITY[occasion]) as [StyleArchetype, number][]) {
      out.push({ archetype, amount: (value / signals.occasions.length) * WEIGHTS.occasions, text: `You dress for ${OCCASION_LABELS[occasion].toLowerCase()}` });
    }
  }
  // Fit
  if (signals.fit) {
    for (const [archetype, value] of Object.entries(FIT_AFFINITY[signals.fit]) as [StyleArchetype, number][]) {
      out.push({ archetype, amount: value * WEIGHTS.fit, text: `You like a ${signals.fit} fit` });
    }
  }
  // Taste check: real listings the user said they'd wear (or not)
  const liked = new Map<StyleArchetype, number>();
  for (const rating of taste) {
    if (rating.archetypes.length === 0) continue;
    for (const archetype of rating.archetypes) {
      out.push({ archetype, amount: ((rating.liked ? 1 : -1) / rating.archetypes.length) * WEIGHTS.taste, text: '' });
      if (rating.liked) liked.set(archetype, (liked.get(archetype) ?? 0) + 1);
    }
  }
  for (const [archetype, count] of liked) {
    out.push({ archetype, amount: 0, text: `You'd wear ${count} ${archetype} piece${count === 1 ? '' : 's'} from the taste check` });
  }
  return out;
}

export interface StyleProfileResult extends StyleSignals {
  styleScores: StyleScores;
  topStyles: StyleArchetype[];
  reasons: StyleReason[];
  vibeScore: number;
  vibeSummary: string;
}

/** Full profile derivation from profiler answers and taste-check ratings. */
export function buildStyleProfile(answers: ProfilerAnswers, taste: TasteRating[] = []): StyleProfileResult {
  const signals = deriveSignals(answers);
  const parts = contributions(signals, taste);
  const raw = Object.fromEntries(STYLE_ARCHETYPES.map((a) => [a, 0])) as Record<StyleArchetype, number>;
  for (const part of parts) raw[part.archetype] += part.amount;

  const max = Math.max(...Object.values(raw));
  const ranked: [StyleArchetype, number][] =
    max > 0
      ? (Object.entries(raw) as [StyleArchetype, number][])
          .filter(([, v]) => v > 0)
          .map(([a, v]): [StyleArchetype, number] => [a, Math.round((v / max) * 100)])
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1] || STYLE_ARCHETYPES.indexOf(a[0]) - STYLE_ARCHETYPES.indexOf(b[0]))
      : [];
  const topStyles = ranked.slice(0, 3).map(([a]) => a);

  // Why: the strongest positive factors of each top style.
  const reasons: StyleReason[] = [];
  for (const archetype of topStyles) {
    const texts = parts
      .filter((p) => p.archetype === archetype && p.text && p.amount >= 0)
      .sort((a, b) => b.amount - a.amount)
      .map((p) => p.text);
    for (const text of unique(texts).slice(0, 3)) reasons.push({ archetype, text });
  }

  // Focus: how strongly everything agrees on the top three (spread-out answers score low).
  const positives = Object.values(raw).map((v) => Math.max(0, v)).sort((a, b) => b - a);
  const total = positives.reduce((s, v) => s + v, 0);
  const share = total > 0 ? (positives[0] + positives[1] + positives[2]) / total : 0;
  const vibeScore = total > 0 ? Math.round(40 + 60 * Math.max(0, Math.min(1, (share - 0.3) / 0.6))) : 0;

  return {
    ...signals,
    styleScores: Object.fromEntries(ranked) as StyleScores,
    topStyles,
    reasons,
    vibeScore,
    vibeSummary: generateVibeSummary(topStyles),
  };
}

export function generateVibeSummary(archetypes: StyleArchetype[]): string {
  const vibeMap: Record<StyleArchetype, string> = {
    Minimalist: 'clean lines and timeless basics',
    Streetwear: 'bold, relaxed street style',
    Bohemian: 'free-spirited prints and earthy warmth',
    Vintage: 'retro pieces with a story',
    Athleisure: 'sporty comfort you can wear anywhere',
    Preppy: 'polished classics',
    Grunge: 'raw edge and dark layers',
    Cottagecore: 'soft, romantic and handmade-feeling',
    'Dark Academia': 'moody tailoring and rich textures',
    Y2K: 'playful, shiny early-2000s energy',
  };
  if (archetypes.length === 0) return 'Take the Style Profiler to find your vibe.';
  const d = archetypes.slice(0, 3).map((a) => vibeMap[a]);
  if (d.length === 1) return `Your vibe: ${d[0]}.`;
  if (d.length === 2) return `Your vibe blends ${d[0]} with ${d[1]}.`;
  return `Your vibe mixes ${d[0]}, ${d[1]} and ${d[2]}.`;
}

// ---- Matching listings to the profile -----------------------------------------

type ScoringProfile = Pick<
  UserProfile,
  'styleScores' | 'shopFor' | 'likedColors' | 'avoidColors' | 'fit' | 'occasions' | 'budgetMax' | 'currency' | 'sustainabilityPriority' | 'tasteRatings'
>;

/** Pieces the user has shown they like or dislike (taste check + wishlist), for learning. */
export interface TasteSignal {
  archetypes: StyleArchetype[];
  colors: ColorFamily[];
  category: FashionItem['category'];
  liked: boolean;
}

export interface MatchContext {
  rates: FxRates | null;
  /** Saved/rated pieces; the wishlist keeps teaching the profile after the quiz. */
  signals?: TasteSignal[];
}

export const hasStyleProfile = (profile: Pick<UserProfile, 'styleScores'>): boolean => Object.keys(profile.styleScores ?? {}).length > 0;

function similarity(item: FashionItem, families: ColorFamily[], signal: TasteSignal): number {
  const shared = item.styleArchetypes.filter((a) => signal.archetypes.includes(a)).length;
  const union = new Set([...item.styleArchetypes, ...signal.archetypes]).size;
  const style = union > 0 ? shared / union : 0;
  const colorShared = families.filter((c) => signal.colors.includes(c)).length;
  const colorUnion = new Set([...families, ...signal.colors]).size;
  const color = colorUnion > 0 ? colorShared / colorUnion : 0;
  return style * 0.6 + color * 0.3 + (item.category === signal.category ? 0.1 : 0);
}

export interface Match {
  score: number;
  reasons: string[];
}

/** 0–100 match of a listing for the user, with the reasons that added most (0 without a profile). */
export function scoreItem(item: FashionItem, profile: ScoringProfile, context: MatchContext): Match {
  if (!hasStyleProfile(profile)) return { score: 0, reasons: [] };
  const reasons: { text: string; weight: number }[] = [];
  let score = 0;

  // Style (up to 45): best archetype match blended with the average.
  const archetypeScores = item.styleArchetypes.map((a) => profile.styleScores[a] ?? 0);
  if (archetypeScores.length) {
    const best = Math.max(...archetypeScores);
    const avg = archetypeScores.reduce((s, v) => s + v, 0) / archetypeScores.length;
    const style = ((best * 0.7 + avg * 0.3) / 100) * 45;
    score += style;
    const top = item.styleArchetypes[archetypeScores.indexOf(best)];
    if (best >= 50) reasons.push({ text: `Matches your ${top} style`, weight: style });
  }

  // Colours (up to 15, −15 for a colour the user never wears).
  const families = colorFamilies(item);
  const loved = families.filter((c) => profile.likedColors.includes(c));
  const avoided = families.filter((c) => profile.avoidColors.includes(c));
  if (families.length && loved.length) {
    const color = (loved.length / families.length) * 15;
    score += color;
    reasons.push({ text: `In colours you love (${loved.map((c) => COLOR_FAMILY_LABELS[c].toLowerCase()).join(', ')})`, weight: color });
  }
  if (avoided.length) score -= 15;

  // Occasion (up to 10) and fit (up to 5).
  const occasions = occasionsOf(item).filter((o) => profile.occasions.includes(o));
  if (occasions.length) {
    score += 10;
    reasons.push({ text: `Good for ${OCCASION_LABELS[occasions[0]].toLowerCase()}`, weight: 10 });
  }
  const fit = fitOf(item);
  if (fit && profile.fit && fit === profile.fit) {
    score += 5;
    reasons.push({ text: `${fit[0].toUpperCase()}${fit.slice(1)} fit, as you like`, weight: 5 });
  }

  // Budget (up to 10; up to −25 when well over the usual spend).
  if (profile.budgetMax) {
    const price = priceIn(item, profile.currency, context.rates);
    if (price !== null) {
      if (price <= profile.budgetMax) {
        score += 10;
        reasons.push({ text: `Within your ${formatMoneyWhole(profile.budgetMax, profile.currency)} budget`, weight: 6 });
      } else {
        score -= Math.min(25, ((price - profile.budgetMax) / profile.budgetMax) * 25);
      }
    }
  }

  // Timing (up to 10): the model says buy now, or it's at its lowest recorded price.
  const advice = getBuyAdvice(item);
  if (isAtRecordLow(item)) {
    score += 10;
    reasons.push({ text: 'At its lowest recorded price', weight: 9 });
  } else if (advice?.verdict === 'buy') {
    score += 6;
    reasons.push({ text: 'Unlikely to get cheaper soon', weight: 5 });
  }

  // Pre-owned preference (up to 5).
  if (item.secondhand) score += (Math.max(0, Math.min(100, profile.sustainabilityPriority)) / 100) * 5;

  // Learning (±10): closeness to pieces the user liked versus ones they didn't.
  const signals = context.signals ?? [];
  if (signals.length) {
    const sims = (liked: boolean) =>
      signals
        .filter((s) => s.liked === liked)
        .map((s) => similarity(item, families, s))
        .sort((a, b) => b - a)
        .slice(0, 3);
    const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
    const learned = (mean(sims(true)) - mean(sims(false))) * 10;
    score += learned;
    if (learned >= 3) reasons.push({ text: 'Like pieces you saved', weight: learned });
  }

  // A busy print loses a little for users who chose only neutral colours.
  if (isPatterned(item) && profile.likedColors.length > 0 && profile.likedColors.every((c) => NEUTRAL_FAMILIES.includes(c))) score -= 3;

  return {
    score: Math.round(Math.max(0, Math.min(100, score))),
    reasons: reasons.sort((a, b) => b.weight - a.weight).map((r) => r.text).slice(0, 3),
  };
}

/** Taste signals from the taste check plus the user's saved pieces. */
export function tasteSignals(profile: Pick<UserProfile, 'tasteRatings' | 'wishlist'>, catalog: FashionItem[]): TasteSignal[] {
  const byId = new Map(catalog.map((i) => [i.id, i]));
  const saved = profile.wishlist
    .map((id) => byId.get(id))
    .filter((i): i is FashionItem => !!i)
    .map((i): TasteSignal => ({ archetypes: i.styleArchetypes, colors: colorFamilies(i), category: i.category, liked: true }));
  const rated = profile.tasteRatings.map((r): TasteSignal => ({ archetypes: r.archetypes, colors: r.colors, category: r.category, liked: r.liked }));
  return [...rated, ...saved];
}

/**
 * Ranks listings for the user (best first) with match scores and reasons. Listings outside the
 * sections the user shops are kept (for the wishlist) but ranked last with a score of 0.
 */
export function getRecommendations(items: FashionItem[], profile: ScoringProfile & Pick<UserProfile, 'wishlist'>, rates: FxRates | null): FashionItem[] {
  const context: MatchContext = { rates, signals: tasteSignals(profile, items) };
  // Without a style profile, the best deals come first.
  const rank = hasStyleProfile(profile) ? (i: FashionItem) => i.matchScore : (i: FashionItem) => getDealScore(i);
  return items
    .map((item) => {
      if (!matchesShopFor(item.department, profile.shopFor)) return { ...item, matchScore: 0, matchReasons: [] };
      const match = scoreItem(item, profile, context);
      return { ...item, matchScore: match.score, matchReasons: match.reasons };
    })
    .sort(
      (a, b) =>
        Number(matchesShopFor(b.department, profile.shopFor)) - Number(matchesShopFor(a.department, profile.shopFor)) ||
        rank(b) - rank(a) ||
        a.id.localeCompare(b.id),
    );
}
