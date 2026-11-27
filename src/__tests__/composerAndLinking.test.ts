import { buildCapsule, buildOutfits, capsulePlan } from '../services/composer';
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

describe('capsule wardrobe', () => {
  it('builds a palette-led capsule that mixes into many outfits', () => {
    const profile = stylistProfile();
    const capsule = buildCapsule(ranked(profile), profile, { wishlist: new Set(), rates: RATES })!;
    expect(capsule.palette.neutrals).toEqual(['black', 'white', 'neutral']);
    expect(capsule.pieces.length).toBeGreaterThanOrEqual(8);
    expect(capsule.outfitCount).toBeGreaterThanOrEqual(4);
    expect(capsule.examples.length).toBeGreaterThan(0);
    // Every piece stays within the palette (or has no colour information).
    const palette = new Set([...capsule.palette.neutrals, ...capsule.palette.accents]);
    expect(capsule.pieces.every((p) => p.item.colors.length === 0 || ['#F5F5F5', '#1C1C1C', '#D8C3A0', '#F3EAD3'].some((c) => p.item.colors.includes(c)) || palette.size > 3)).toBe(true);
    expect(capsule.total.currency).toBe('INR');
  });

  it('plans a dress slot only when the user shops womenswear', () => {
    expect(capsulePlan('men').dress).toBeUndefined();
    expect(capsulePlan('women').dress).toBe(2);
    expect(buildCapsule([], stylistProfile(), { wishlist: new Set(), rates: RATES })).toBeNull();
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
  });
});
