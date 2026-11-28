import { buildOutfits, buildWardrobe, completeTheLook, wardrobePlan } from '../services/composer';
import { similarForLess } from '../services/suggestions';
import { compareLinks, marketplaceCtaLabel, marketplaceSearchUrl, searchQueryFor } from '../services/linking';
import { getRecommendations } from '../services/styleEngine';
import { createDefaultProfile } from '../store/persistence';
import { MarketplaceStatus, UserProfile } from '../types';
import { makeEbayItem, makeItem, NOW, RATES, sampleCatalog } from './helpers/fixtures';

function stylistProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    ...createDefaultProfile(NOW),
    country: 'IN',
    currency: 'INR',
    shopFor: 'women',
    likedColors: ['black', 'white', 'neutral'],
    styleArchetypes: ['Minimalist', 'Dark Academia', 'Preppy'],
    styleScores: { Minimalist: 100, 'Dark Academia': 70, Preppy: 55 },
    occasions: ['work', 'everyday'],
    budgetMax: 2500,
    ...overrides,
  };
}

const ranked = (profile: UserProfile) => getRecommendations(sampleCatalog(), profile, RATES);

describe('outfits', () => {
  it('builds complete, coherent looks from the user’s sections only', () => {
    const profile = stylistProfile();
    const outfits = buildOutfits(ranked(profile), profile, { wishlist: new Set(), rates: RATES }, 3);
    expect(outfits.length).toBeGreaterThan(0);
    for (const outfit of outfits) {
      const slots = outfit.pieces.map((p) => p.slot);
      const hasBase = (slots.includes('top') && slots.includes('bottom')) || slots.includes('dress');
      expect(hasBase).toBe(true);
      expect(slots).toContain('shoes');
      expect(outfit.pieces.every((p) => p.item.department !== 'men')).toBe(true);
      // Never three or more accent colours.
      expect(outfit.accents.length).toBeLessThanOrEqual(2);
    }
    expect(outfits[0].reasons.join(' ')).toMatch(/Minimalist|palette|accent/);
  });

  it('is deterministic and each next look differs by at least two pieces', () => {
    const profile = stylistProfile();
    const a = buildOutfits(ranked(profile), profile, { wishlist: new Set(), rates: RATES }, 4);
    const b = buildOutfits(ranked(profile), profile, { wishlist: new Set(), rates: RATES }, 4);
    expect(a.map((o) => o.pieces.map((p) => p.item.id))).toEqual(b.map((o) => o.pieces.map((p) => p.item.id)));
    for (let i = 1; i < a.length; i++) {
      const prev = new Set(a[i - 1].pieces.map((p) => p.item.id));
      expect(a[i].pieces.filter((p) => !prev.has(p.item.id)).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('puts saved pieces first and follows the occasion and style filters', () => {
    const profile = stylistProfile();
    const items = ranked(profile);
    const blazer = items.find((i) => i.title.includes('Blazer'))!;
    const withSaved = buildOutfits(items, profile, { wishlist: new Set([blazer.id]), rates: RATES }, 1);
    expect(withSaved[0].pieces.some((p) => p.item.id === blazer.id && p.fromWishlist)).toBe(true);

    const boho = buildOutfits(items, profile, { wishlist: new Set(), rates: RATES, style: 'Bohemian' }, 1);
    expect(boho[0].pieces.find((p) => p.slot === 'dress')?.item.styleArchetypes).toContain('Bohemian');
  });

  it('dresses menswear profiles from the men’s section', () => {
    const profile = stylistProfile({ shopFor: 'men', likedColors: ['white', 'navy', 'neutral'] });
    const [look] = buildOutfits(ranked(profile), profile, { wishlist: new Set(), rates: RATES }, 1);
    expect(look.pieces.every((p) => p.item.department !== 'women')).toBe(true);
    expect(look.pieces.some((p) => p.slot === 'dress')).toBe(false);
  });

  it('returns nothing rather than half a look when a section has no listings', () => {
    const profile = stylistProfile();
    expect(buildOutfits([], profile, { wishlist: new Set(), rates: RATES })).toEqual([]);
  });
});

describe('complete the look', () => {
  it('builds outfits around one piece, in its own slot', () => {
    const profile = stylistProfile();
    const items = ranked(profile);
    const shirt = items.find((i) => i.title === 'Women White Linen Shirt')!;
    const [look] = completeTheLook(shirt, items, profile, { wishlist: new Set(), rates: RATES });
    expect(look.pieces.find((p) => p.slot === 'top')?.item.id).toBe(shirt.id);
    expect(look.pieces.some((p) => p.slot === 'bottom')).toBe(true);
    expect(look.pieces.some((p) => p.slot === 'dress')).toBe(false);
    expect(look.pieces.filter((p) => p.item.id === shirt.id)).toHaveLength(1);
  });

  it('builds a base around shoes, and nothing for a listing that has sold', () => {
    const profile = stylistProfile();
    const items = ranked(profile);
    const sneakers = items.find((i) => i.category === 'Shoes' && i.department !== 'men')!;
    const [look] = completeTheLook(sneakers, items, profile, { wishlist: new Set(), rates: RATES });
    expect(look.pieces.find((p) => p.slot === 'shoes')?.item.id).toBe(sneakers.id);
    expect(look.pieces.some((p) => p.slot === 'top' || p.slot === 'dress')).toBe(true);
    expect(completeTheLook({ ...sneakers, available: false }, items, profile, { wishlist: new Set(), rates: RATES })).toEqual([]);
  });
});

describe('whole wardrobe', () => {
  it('sizes the wardrobe from sections, occasions and personality, with the reasons', () => {
    const plan = wardrobePlan({ shopFor: 'women', occasions: ['work', 'evening'], traits: { polish: 0.8, comfort: 0.1 } });
    expect(plan.targets).toEqual({ top: 8, bottom: 5, dress: 4, layer: 3, shoes: 4, bag: 2, accessory: 3 });
    expect(plan.reasons).toEqual([
      'Work & office: two more shirts or blouses and smart trousers.',
      'Nights out: a going-out piece and a pair of shoes for it.',
      'You come across as polished: a second tailored layer.',
    ]);
    const men = wardrobePlan({ shopFor: 'men', occasions: ['evening'], traits: { warmth: 0.9 } });
    expect(men.targets.dress).toBe(0);
    expect(men.targets.top).toBe(9);
  });

  it('fills the plan with live pieces in one palette that mix into many outfits', () => {
    const profile = stylistProfile();
    const wardrobe = buildWardrobe(ranked(profile), profile, { wishlist: new Set(), rates: RATES, owned: [] })!;
    expect(wardrobe.palette.neutrals).toEqual(['black', 'white', 'neutral']);
    expect(wardrobe.pieces).toBe(Object.values(wardrobePlan(profile).targets).reduce((a, b) => a + b, 0));
    expect(wardrobe.picks.length).toBeGreaterThanOrEqual(8);
    expect(wardrobe.outfitCount).toBeGreaterThanOrEqual(4);
    expect(wardrobe.examples.length).toBeGreaterThan(0);
    expect(wardrobe.picks.every((p) => p.item.department !== 'men')).toBe(true);
    for (const slot of wardrobe.slots) expect(slot.owned.length + slot.picks.length).toBeLessThanOrEqual(Math.max(slot.target, slot.owned.length));
    expect(wardrobe.total.currency).toBe('INR');
  });

  it('counts what the user owns and doesn’t suggest buying it again', () => {
    const profile = stylistProfile();
    const items = ranked(profile);
    const shirt = items.find((i) => i.title === 'Women White Linen Shirt')!;
    const owned = [
      { id: 'purchase:x', slot: 'top' as const, title: shirt.title, colors: ['white' as const], itemId: shirt.id, image: null, addedAt: NOW.toISOString() },
      { id: 'owned-1', slot: 'shoes' as const, title: 'My white trainers', colors: ['white' as const], itemId: null, image: null, addedAt: NOW.toISOString() },
    ];
    const wardrobe = buildWardrobe(items, profile, { wishlist: new Set(), rates: RATES, owned })!;
    expect(wardrobe.ownedCount).toBe(2);
    expect(wardrobe.picks.some((p) => p.item.id === shirt.id)).toBe(false);
    const shoes = wardrobe.slots.find((s) => s.slot === 'shoes')!;
    expect(shoes.owned.map((o) => o.title)).toEqual(['My white trainers']);
    expect(shoes.picks.length).toBeLessThanOrEqual(shoes.target - 1);
    expect(wardrobe.examples.some((look) => look.pieces.some((p) => p.owned))).toBe(true);
  });

  it('returns nothing without listings or owned pieces', () => {
    expect(buildWardrobe([], stylistProfile(), { wishlist: new Set(), rates: RATES, owned: [] })).toBeNull();
  });
});

describe('similar for less', () => {
  it('finds the same kind of piece in a shared style or colour, at least 5% cheaper', () => {
    const profile = stylistProfile();
    const items = ranked(profile);
    const trousers = items.find((i) => i.title === 'Women High Waist Black Jeans')!;
    const cheaper = similarForLess(trousers, items, 'INR', RATES);
    expect(cheaper.map((i) => i.title)).toEqual(['Women Straight Leg Beige Trousers']);
    for (const item of cheaper) {
      expect(item.category).toBe('Bottoms');
      expect(item.id).not.toBe(trousers.id);
      expect(item.currentPrice).toBeLessThanOrEqual(trousers.currentPrice * 0.95);
    }
    expect(similarForLess({ ...trousers, currentPrice: 1 }, items, 'INR', RATES)).toEqual([]);
  });
});

describe('links', () => {
  const marketplaces: MarketplaceStatus[] = [
    { source: 'flipkart', name: 'Flipkart', attribution: null, lastSuccessAt: null, availableListings: 10, markets: ['IN'] },
    { source: 'amazon', name: 'Amazon', attribution: null, lastSuccessAt: null, availableListings: 5, markets: ['IN', 'US'] },
    { source: 'ebay', name: 'eBay', attribution: null, lastSuccessAt: null, availableListings: 5, markets: ['US'] },
    { source: 'google_shopping', name: 'Google Shopping', attribution: null, lastSuccessAt: null, availableListings: 5, markets: ['IN'] },
  ];

  it('builds a clean search query', () => {
    expect(searchQueryFor({ title: 'Oxford Shirt | Slim — White', brand: 'Roadster' })).toBe('Roadster Oxford Shirt Slim White');
    expect(searchQueryFor({ title: 'Roadster Oxford Shirt', brand: 'Roadster' })).toBe('Roadster Oxford Shirt');
  });

  it('links to the other marketplaces with listings in the item’s country, then Google Shopping', () => {
    const links = compareLinks(makeItem(), marketplaces);
    expect(links.map((l) => l.source)).toEqual(['amazon', 'google_shopping']);
    expect(links[0].url).toBe('https://www.amazon.in/s?k=Roadster%20Men%20Slim%20Fit%20Oxford%20Shirt');
    expect(links[1].url).toContain('https://www.google.co.in/search?tbm=shop&q=');
  });

  it('knows each marketplace’s search page per country', () => {
    expect(marketplaceSearchUrl('ebay', 'GB', 'jeans')).toBe('https://www.ebay.co.uk/sch/i.html?_nkw=jeans');
    expect(marketplaceSearchUrl('flipkart', 'US', 'jeans')).toBeNull();
    expect(marketplaceSearchUrl('unknown', 'US', 'jeans')).toBeNull();
  });

  it('labels the store button with the site or, for Google Shopping, the store', () => {
    expect(marketplaceCtaLabel(makeEbayItem())).toBe('View on eBay (ships to India)');
    expect(marketplaceCtaLabel({ siteName: 'Google Shopping', source: 'google_shopping', seller: 'Myntra' })).toBe('View at Myntra');
    // impact.com listings come from each brand's own store.
    expect(marketplaceCtaLabel({ siteName: 'Brand stores', source: 'impact', seller: 'Northwind Apparel' })).toBe('View at Northwind Apparel');
    expect(marketplaceCtaLabel({ siteName: 'Brand stores', source: 'impact', seller: null })).toBe('View on Brand stores');
  });
});
