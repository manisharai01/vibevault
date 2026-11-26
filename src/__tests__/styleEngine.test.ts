import { QUESTION_IDS } from '../data/profilerQuestions';
import {
  buildStyleProfile,
  computeStyleScores,
  computeVibeScore,
  deriveSignals,
  generateVibeSummary,
  getRecommendations,
  scoreItem,
} from '../services/styleEngine';
import { getDealScore } from '../services/priceEngine';
import { createDefaultProfile } from '../store/persistence';
import { ProfilerAnswers } from '../types';
import { makeEbayItem, sampleCatalog } from './helpers/fixtures';

const NOW = new Date(2026, 10, 25, 10, 0);
const catalog = sampleCatalog();

const darkAcademia: ProfilerAnswers = {
  [QUESTION_IDS.personality]: 'introvert',
  [QUESTION_IDS.thinking]: 'analytical',
  [QUESTION_IDS.music]: ['classical', 'jazz'],
  [QUESTION_IDS.media]: ['documentary', 'thriller'],
  [QUESTION_IDS.palette]: 'dark-academia',
  [QUESTION_IDS.weekend]: 'dark-academia',
  [QUESTION_IDS.sustainability]: 75,
  [QUESTION_IDS.budget]: 'budget-mid',
};

const streetwear: ProfilerAnswers = {
  [QUESTION_IDS.personality]: 'extrovert',
  [QUESTION_IDS.thinking]: 'avant-garde',
  [QUESTION_IDS.music]: ['hip-hop', 'electronic'],
  [QUESTION_IDS.media]: ['anime', 'action'],
  [QUESTION_IDS.palette]: 'streetwear',
  [QUESTION_IDS.weekend]: 'streetwear',
  [QUESTION_IDS.sustainability]: 25,
  [QUESTION_IDS.budget]: 'budget-high',
};

const profileFrom = (answers: ProfilerAnswers) => {
  const result = buildStyleProfile(answers);
  return {
    ...createDefaultProfile(NOW),
    styleScores: result.styleScores,
    budgetTier: result.budgetTier,
    sustainabilityPriority: result.sustainabilityPriority,
  };
};

describe('deriveSignals', () => {
  it('extracts every answer and ignores invalid values', () => {
    const signals = deriveSignals({
      ...darkAcademia,
      [QUESTION_IDS.music]: ['jazz', 'not-a-genre', 'jazz'],
      [QUESTION_IDS.media]: 'documentary',
      [QUESTION_IDS.budget]: 'budget-unknown',
    });
    expect(signals.personality).toEqual(['introvert', 'analytical']);
    expect(signals.music).toEqual(['jazz']);
    expect(signals.media).toEqual([]);
    expect(signals.palette).toBe('dark-academia');
    expect(signals.weekend).toBe('dark-academia');
    expect(signals.budgetTier).toBeNull();
    expect(signals.sustainabilityPriority).toBe(75);
  });

  it('defaults sustainability to 50 and clamps out-of-range values', () => {
    expect(deriveSignals({}).sustainabilityPriority).toBe(50);
    expect(deriveSignals({ [QUESTION_IDS.sustainability]: 400 }).sustainabilityPriority).toBe(100);
  });
});

describe('style scores', () => {
  it('normalises to 0–100 with the strongest archetype first', () => {
    const scores = computeStyleScores(deriveSignals(darkAcademia));
    expect(scores[0]).toEqual(['Dark Academia', 100]);
    for (let i = 1; i < scores.length; i++) expect(scores[i][1]).toBeLessThanOrEqual(scores[i - 1][1]);
    scores.forEach(([, v]) => {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });

  it('lets palette and weekend answers shift the result', () => {
    const base = { ...darkAcademia, [QUESTION_IDS.palette]: 'cottagecore', [QUESTION_IDS.weekend]: 'cottagecore' };
    const withCottage = Object.fromEntries(computeStyleScores(deriveSignals(base)));
    const withDark = Object.fromEntries(computeStyleScores(deriveSignals(darkAcademia)));
    expect(withCottage.Cottagecore).toBeGreaterThan(withDark.Cottagecore ?? 0);
  });

  it('returns nothing for an empty profile', () => {
    expect(computeStyleScores(deriveSignals({}))).toEqual([]);
    expect(computeVibeScore(deriveSignals({}))).toBe(0);
  });

  it('gives focused profiles a higher vibe strength than eclectic ones', () => {
    const eclectic: ProfilerAnswers = {
      [QUESTION_IDS.personality]: 'creative',
      [QUESTION_IDS.thinking]: 'creative',
      [QUESTION_IDS.music]: ['pop', 'rock', 'hip-hop', 'jazz', 'electronic', 'classical', 'indie', 'r&b', 'country', 'metal'],
      [QUESTION_IDS.media]: ['action', 'romance', 'sci-fi', 'documentary', 'anime', 'comedy', 'thriller', 'drama'],
    };
    const focused = computeVibeScore(deriveSignals(darkAcademia));
    const wide = computeVibeScore(deriveSignals(eclectic));
    expect(focused).toBeGreaterThan(wide);
    expect(focused).toBeLessThanOrEqual(100);
    expect(wide).toBeGreaterThanOrEqual(40);
  });

  it('builds a complete profile result', () => {
    const result = buildStyleProfile(streetwear);
    expect(result.topStyles[0]).toBe('Streetwear');
    expect(result.topStyles).toHaveLength(3);
    expect(result.vibeSummary).toMatch(/^Your vibe fuses/);
    expect(result.budgetTier).toBe('budget-high');
  });

  it('writes summaries for 0–3 archetypes', () => {
    expect(generateVibeSummary([])).toBe('Express yourself through fashion!');
    expect(generateVibeSummary(['Y2K'])).toMatch(/^Your vibe:/);
    expect(generateVibeSummary(['Y2K', 'Grunge'])).toMatch(/^Your vibe blends/);
  });
});

describe('scoring & recommendations', () => {
  it('keeps every match score within 0–100', () => {
    for (const answers of [darkAcademia, streetwear]) {
      const profile = profileFrom(answers);
      for (const item of catalog) {
        const score = scoreItem(item, profile);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('ranks on-style items above off-style items', () => {
    const recs = getRecommendations(catalog, profileFrom(streetwear));
    expect(recs[0].styleArchetypes.some((s) => s === 'Streetwear' || s === 'Y2K')).toBe(true);
    for (let i = 1; i < recs.length; i++) expect(recs[i].matchScore).toBeLessThanOrEqual(recs[i - 1].matchScore);
    const dark = getRecommendations(catalog, profileFrom(darkAcademia));
    expect(dark.slice(0, 3).every((item) => item.styleArchetypes.some((s) => ['Dark Academia', 'Minimalist', 'Preppy'].includes(s)))).toBe(true);
  });

  it('penalises items above the user’s budget (in rupees, converting other currencies)', () => {
    const item = { ...catalog[0], currentPrice: 2500 };
    const base = profileFrom(darkAcademia);
    expect(scoreItem(item, { ...base, budgetTier: 'budget-low' })).toBeLessThan(scoreItem(item, { ...base, budgetTier: 'budget-premium' }));
    // $30 ≈ ₹2,767: over a ₹500 budget, within ₹3,000+.
    const usd = makeEbayItem({ current_price: 30 });
    expect(scoreItem(usd, { ...base, budgetTier: 'budget-low' })).toBeLessThan(scoreItem(usd, { ...base, budgetTier: 'budget-premium' }));
    // Unknown exchange rate: no budget penalty either way.
    const unknown = makeEbayItem({ current_price: 30, inr_rate: null });
    expect(scoreItem(unknown, { ...base, budgetTier: 'budget-low' })).toBe(scoreItem(unknown, { ...base, budgetTier: 'budget-premium' }));
  });

  it('weights sustainability by how much the user cares', () => {
    const item = { ...catalog[0], sustainabilityScore: 100 };
    const base = profileFrom(darkAcademia);
    expect(scoreItem(item, { ...base, sustainabilityPriority: 100 })).toBeGreaterThan(scoreItem(item, { ...base, sustainabilityPriority: 0 }));
  });

  it('without a style profile, ranks by deal score with no match scores', () => {
    const recs = getRecommendations(catalog, createDefaultProfile(NOW));
    expect(recs.every((i) => i.matchScore === 0)).toBe(true);
    for (let i = 1; i < recs.length; i++) expect(getDealScore(recs[i])).toBeLessThanOrEqual(getDealScore(recs[i - 1]));
  });

  it('does not mutate the catalogue', () => {
    const before = JSON.stringify(catalog);
    getRecommendations(catalog, profileFrom(streetwear));
    expect(JSON.stringify(catalog)).toBe(before);
  });
});
