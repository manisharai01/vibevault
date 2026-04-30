// ============================================================
// VibeVault – Style Matching Engine (Objective 1)
//
// Translates personality traits, music genres, and media
// preferences into personalized fashion recommendations
// using multi-dimensional scoring and collaborative filtering.
// ============================================================

import {
  UserProfile,
  FashionItem,
  StyleArchetype,
  PersonalityDimension,
  MusicGenre,
  MediaPreference,
} from '../types';

// ---- Mapping matrices (personality → style affinity) ----

const PERSONALITY_STYLE_MAP: Record<PersonalityDimension, Partial<Record<StyleArchetype, number>>> = {
  introvert: { Minimalist: 0.9, 'Dark Academia': 0.8, Cottagecore: 0.7, Vintage: 0.6 },
  extrovert: { Streetwear: 0.9, Y2K: 0.8, Bohemian: 0.7, Athleisure: 0.6 },
  analytical: { Minimalist: 0.9, Preppy: 0.7, 'Dark Academia': 0.8 },
  creative: { Bohemian: 0.9, Vintage: 0.8, Y2K: 0.7, Grunge: 0.6, Streetwear: 0.5 },
  traditional: { Preppy: 0.9, Vintage: 0.8, 'Dark Academia': 0.7, Minimalist: 0.5 },
  'avant-garde': { Y2K: 0.9, Streetwear: 0.8, Grunge: 0.7, Bohemian: 0.6 },
};

const MUSIC_STYLE_MAP: Record<MusicGenre, Partial<Record<StyleArchetype, number>>> = {
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

const MEDIA_STYLE_MAP: Record<MediaPreference, Partial<Record<StyleArchetype, number>>> = {
  action: { Streetwear: 0.7, Athleisure: 0.8, Grunge: 0.5 },
  romance: { Cottagecore: 0.8, Bohemian: 0.7, Vintage: 0.6 },
  'sci-fi': { Y2K: 0.9, Minimalist: 0.7, Streetwear: 0.5 },
  documentary: { Minimalist: 0.8, 'Dark Academia': 0.7, Preppy: 0.5 },
  anime: { Y2K: 0.9, Streetwear: 0.7, Grunge: 0.5 },
  comedy: { Athleisure: 0.6, Bohemian: 0.6, Preppy: 0.5, Streetwear: 0.5 },
  thriller: { 'Dark Academia': 0.8, Grunge: 0.7, Minimalist: 0.6 },
  drama: { Vintage: 0.8, 'Dark Academia': 0.7, Bohemian: 0.6, Preppy: 0.5 },
};

// ---- Core matching functions ----

/**
 * Compute style archetype scores from user profile inputs.
 * Returns sorted array of [archetype, score] pairs.
 */
export function computeStyleScores(
  personality: PersonalityDimension[],
  music: MusicGenre[],
  media: MediaPreference[],
): [StyleArchetype, number][] {
  const scores: Partial<Record<StyleArchetype, number>> = {};

  const addScores = (map: Partial<Record<StyleArchetype, number>>, weight: number) => {
    for (const [style, score] of Object.entries(map)) {
      const s = style as StyleArchetype;
      scores[s] = (scores[s] || 0) + (score || 0) * weight;
    }
  };

  // Personality contributes 40%
  personality.forEach((p) => {
    if (PERSONALITY_STYLE_MAP[p]) addScores(PERSONALITY_STYLE_MAP[p], 0.4);
  });

  // Music contributes 35%
  music.forEach((m) => {
    if (MUSIC_STYLE_MAP[m]) addScores(MUSIC_STYLE_MAP[m], 0.35);
  });

  // Media contributes 25%
  media.forEach((md) => {
    if (MEDIA_STYLE_MAP[md]) addScores(MEDIA_STYLE_MAP[md], 0.25);
  });

  // Normalize to 0–100 and sort descending
  const entries = Object.entries(scores) as [StyleArchetype, number][];
  const maxScore = Math.max(...entries.map(([, v]) => v), 1);

  return entries
    .map(([archetype, score]): [StyleArchetype, number] => [archetype, Math.round((score / maxScore) * 100)])
    .sort((a, b) => b[1] - a[1]);
}

/**
 * Get the top N style archetypes for the user
 */
export function getTopStyles(
  personality: PersonalityDimension[],
  music: MusicGenre[],
  media: MediaPreference[],
  topN: number = 3,
): StyleArchetype[] {
  return computeStyleScores(personality, music, media)
    .slice(0, topN)
    .map(([s]) => s);
}

/**
 * Score a single fashion item against a user profile.
 * Returns 0–100 match score.
 */
export function scoreItem(item: FashionItem, profile: UserProfile): number {
  const styleScores = computeStyleScores(
    profile.personalityTraits,
    profile.musicGenres,
    profile.mediaPreferences,
  );

  const styleMap = new Map(styleScores);

  // Style overlap score (max 60 pts)
  let styleMatch = 0;
  for (const arch of item.styleArchetypes) {
    styleMatch += (styleMap.get(arch) || 0);
  }
  styleMatch = Math.min(60, (styleMatch / Math.max(item.styleArchetypes.length, 1)) * 0.6);

  // Sustainability bonus (max 15 pts)
  const sustainBonus = (item.sustainabilityScore / 100) * 15;

  // Deal score – how good is the discount (max 15 pts)
  const discount = Math.max(0, 1 - item.currentPrice / item.originalPrice);
  const dealScore = discount * 15;

  // Price prediction bonus – will it get cheaper? (max 10 pts)
  const priceDrop7d = Math.max(0, (item.currentPrice - item.predictedPrice7d) / item.currentPrice);
  const priceBonus = priceDrop7d * 10;

  return Math.round(Math.min(100, styleMatch + sustainBonus + dealScore + priceBonus));
}

/**
 * Rank and return recommended items for a user profile
 */
export function getRecommendations(items: FashionItem[], profile: UserProfile): FashionItem[] {
  return items
    .map((item) => ({
      ...item,
      matchScore: scoreItem(item, profile),
    }))
    .sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Generate a "vibe summary" text from profile archetypes
 */
export function generateVibeSummary(archetypes: StyleArchetype[]): string {
  const vibeMap: Record<string, string> = {
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

  const descriptions = archetypes.slice(0, 3).map((a) => vibeMap[a] || a);
  if (descriptions.length === 1) return `Your vibe: ${descriptions[0]}.`;
  if (descriptions.length === 2) return `Your vibe blends ${descriptions[0]} with ${descriptions[1]}.`;
  return `Your vibe fuses ${descriptions[0]}, ${descriptions[1]}, and ${descriptions[2]}.`;
}
