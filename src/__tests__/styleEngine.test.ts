import { QUESTION_IDS } from '../data/profilerQuestions';
import { colorFamilies, fitOf, formalityOf, occasionsOf } from '../services/itemTraits';
import { buildStyleProfile, deriveSignals, getRecommendations, scoreItem } from '../services/styleEngine';
import { createDefaultProfile } from '../store/persistence';
import { ProfilerAnswers, TasteRating, UserProfile } from '../types';
import { makeEbayItem, makeItem, NOW, predictionJson, RATES, sampleCatalog } from './helpers/fixtures';

const Q = QUESTION_IDS;

/** A polished, minimal-leaning person who works in an office. */
const polishedAnswers: ProfilerAnswers = {
  [Q.country]: 'IN',
  [Q.shopFor]: 'women',
  [Q.social]: 'observer',
  [Q.trends]: 'wait',
  [Q.routine]: 'planned',
  [Q.compliment]: 'put-together',
  [Q.rules]: 'helpful',
  [Q.freeDay]: 'cafe',
  [Q.colorsLove]: ['black', 'white', 'neutral'],
  [Q.colorsAvoid]: ['yellow'],
  [Q.fit]: 'fitted',
  [Q.occasions]: ['work', 'everyday'],
  [Q.budget]: 1500,
  [Q.sustainability]: 25,
};

/** An expressive, rule-breaking person who goes out a lot. */
const boldAnswers: ProfilerAnswers = {
  [Q.country]: 'IN',
  [Q.shopFor]: 'men',
  [Q.social]: 'center',
  [Q.trends]: 'first',
  [Q.routine]: 'mood',
  [Q.compliment]: 'cool',
  [Q.rules]: 'break',
  [Q.freeDay]: 'city',
  [Q.colorsLove]: ['black', 'red'],
  [Q.fit]: 'oversized',
  [Q.occasions]: ['evening'],
  [Q.budget]: null,
};

function profileFrom(answers: ProfilerAnswers, taste: TasteRating[] = []): UserProfile {
  const result = buildStyleProfile(answers, taste);
  return {
    ...createDefaultProfile(NOW),
    country: result.country,
    currency: 'INR',
    shopFor: result.shopFor,
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
  };
}

describe('profiler answers → signals', () => {
  it('reads every answer and ignores invalid ones', () => {
    const signals = deriveSignals({ ...polishedAnswers, [Q.colorsAvoid]: ['yellow', 'black', 'tartan'], [Q.fit]: 'baggy', [Q.country]: 'XX' });
    expect(signals).toMatchObject({
      country: null,
      shopFor: 'women',
      likedColors: ['black', 'white', 'neutral'],
      // A colour can't be loved and avoided; unknown colours are dropped.
      avoidColors: ['yellow'],
      fit: null,
      occasions: ['work', 'everyday'],
      budgetMax: 1500,
      sustainabilityPriority: 25,
    });
    expect(signals.traits.polish).toBeGreaterThan(0.9);
    expect(signals.traits.expressive).toBeLessThan(0);
  });

  it('defaults missing answers', () => {
    expect(deriveSignals({})).toMatchObject({ country: null, shopFor: null, budgetMax: null, sustainabilityPriority: 50, traits: {} });
  });
});

describe('style profile', () => {
  it('turns a polished personality into Minimalist / Preppy / Dark Academia, with reasons', () => {
    const result = buildStyleProfile(polishedAnswers);
    expect(result.topStyles[0]).toBe('Minimalist');
    expect(result.topStyles).toEqual(expect.arrayContaining(['Preppy']));
    expect(result.styleScores.Minimalist).toBe(100);
    expect(result.styleScores.Grunge ?? 0).toBe(0);
    const why = result.reasons.filter((r) => r.archetype === 'Minimalist').map((r) => r.text);
    expect(why.join(' ')).toMatch(/polished/);
    expect(why.join(' ')).toMatch(/colours you love/);
    expect(result.vibeSummary).toMatch(/^Your vibe/);
  });

  it('turns an expressive rule-breaker into Streetwear / Grunge / Y2K', () => {
    const result = buildStyleProfile(boldAnswers);
    expect(result.topStyles).toEqual(expect.arrayContaining(['Streetwear', 'Grunge']));
    expect(result.styleScores.Preppy ?? 0).toBe(0);
  });

  it('lets the taste check on real listings move the result', () => {
    const lovesBoho: TasteRating[] = [
      { itemId: 'a', liked: true, archetypes: ['Bohemian'], colors: ['green'], category: 'Dresses' },
      { itemId: 'b', liked: true, archetypes: ['Bohemian', 'Cottagecore'], colors: ['pink'], category: 'Tops' },
      { itemId: 'c', liked: true, archetypes: ['Bohemian'], colors: ['brown'], category: 'Bags' },
      { itemId: 'd', liked: false, archetypes: ['Minimalist'], colors: ['black'], category: 'Tops' },
    ];
    const before = buildStyleProfile(polishedAnswers);
    const after = buildStyleProfile(polishedAnswers, lovesBoho);
    expect((after.styleScores.Bohemian ?? 0) > (before.styleScores.Bohemian ?? 0)).toBe(true);
    expect(after.reasons.some((r) => r.text === "You'd wear 3 Bohemian pieces from the taste check")).toBe(true);
  });

  it('is deterministic', () => {
    expect(buildStyleProfile(polishedAnswers)).toEqual(buildStyleProfile(polishedAnswers));
  });
});

describe('listing traits', () => {
  it('reads colour families, occasions, formality and fit from the listing', () => {
    const blazer = makeItem({ title: 'Women Slim Fit Wool Blazer', description: null, category: 'Outerwear', colors: ['#1C1C1C', '#C19A6B'] });
    expect(colorFamilies(blazer)).toEqual(['black', 'brown']);
    expect(occasionsOf(blazer)).toEqual(['work']);
    expect(formalityOf(blazer)).toBe(3);
    expect(fitOf(blazer)).toBe('fitted');
    const joggers = makeItem({ title: 'Men Running Joggers', description: null, category: 'Bottoms', style_archetypes: ['Athleisure'] });
    expect(occasionsOf(joggers)).toEqual(['active']);
    expect(formalityOf(joggers)).toBe(1);
    expect(occasionsOf(makeItem({ title: 'Women Kurta Set with Dupatta', description: null }))).toEqual(['festive']);
    expect(occasionsOf(makeItem({ title: 'Plain top', description: null }))).toEqual(['everyday']);
  });
});

describe('matching listings', () => {
  const profile = profileFrom(polishedAnswers);

  it('scores a listing with the reasons that added most', () => {
    const shirt = makeItem({
      title: 'Women White Linen Shirt for work',
      department: 'women',
      style_archetypes: ['Minimalist'],
      colors: ['#F5F5F5'],
      current_price: 899,
      prediction: predictionJson(899, 0.1),
    });
    const match = scoreItem(shirt, profile, { rates: RATES });
    expect(match.score).toBeGreaterThan(70);
    expect(match.reasons).toEqual(['Matches your Minimalist style', 'In colours you love (white)', 'Good for work & office']);
  });

  it('penalises colours the user never wears and pieces well over budget', () => {
    const base = { department: 'women', style_archetypes: ['Minimalist'], current_price: 899 };
    const ok = scoreItem(makeItem({ ...base, colors: ['#F5F5F5'] }), profile, { rates: RATES }).score;
    const avoided = scoreItem(makeItem({ ...base, colors: ['#E0B526'] }), profile, { rates: RATES }).score;
    const pricey = scoreItem(makeItem({ ...base, colors: ['#F5F5F5'], current_price: 4500 }), profile, { rates: RATES }).score;
    expect(avoided).toBeLessThan(ok - 20);
    expect(pricey).toBeLessThan(ok - 25);
  });

  it('converts foreign prices before comparing with the budget, and never guesses without a rate', () => {
    const dollars = makeEbayItem({ department: 'women', style_archetypes: ['Minimalist'], current_price: 12 });
    const withRate = scoreItem(dollars, profile, { rates: RATES });
    const noRate = scoreItem(dollars, profile, { rates: null });
    expect(withRate.reasons).toContain('Within your ₹1,500 budget');
    expect(noRate.reasons).not.toContain('Within your ₹1,500 budget');
  });

  it('learns from saved pieces', () => {
    const item = makeItem({ title: 'Floral boho dress', department: 'women', style_archetypes: ['Bohemian'], colors: ['#556B2F'] });
    const plain = scoreItem(item, profile, { rates: RATES }).score;
    const learnt = scoreItem(item, profile, {
      rates: RATES,
      signals: [{ archetypes: ['Bohemian'], colors: ['green'], category: 'Dresses', liked: true }],
    });
    expect(learnt.score).toBeGreaterThan(plain);
    expect(learnt.reasons).toContain('Like pieces you saved');
  });

  it('ranks the user’s sections first and is 0 without a profile', () => {
    const catalog = sampleCatalog();
    const ranked = getRecommendations(catalog, profile, RATES);
    const firstMen = ranked.findIndex((i) => i.department === 'men');
    const lastWomen = ranked.map((i) => i.department).lastIndexOf('women');
    expect(lastWomen).toBeLessThan(firstMen);
    expect(ranked.filter((i) => i.department === 'men').every((i) => i.matchScore === 0)).toBe(true);
    expect(ranked[0].matchScore).toBeGreaterThan(50);

    const anonymous = getRecommendations(catalog, createDefaultProfile(NOW), RATES);
    expect(anonymous.every((i) => i.matchScore === 0)).toBe(true);
  });
});
