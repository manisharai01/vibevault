import { CATEGORIES, PLATFORMS, REGION_BY_PLATFORM, REGIONS, STYLE_ARCHETYPES } from '../constants/marketplaces';
import { BADGES, QUEST_DEFINITIONS, SEED_ITEMS } from '../data/mockData';
import { buildCatalog } from '../services/catalog';
import { simulatedPrice } from '../services/priceEngine';
import { addDays, toDateKey } from '../utils/date';

const NOW = new Date(2026, 10, 25, 10, 0);

describe('seed data integrity', () => {
  it('has unique item ids and unique, well-formed image URLs', () => {
    const ids = SEED_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const images = SEED_ITEMS.map((i) => i.image);
    expect(new Set(images).size).toBe(images.length);
    images.forEach((url) => expect(url).toMatch(/^https:\/\/images\.unsplash\.com\/photo-[\w-]+\?/));
  });

  it('uses only known categories, platforms and archetypes', () => {
    for (const item of SEED_ITEMS) {
      expect(CATEGORIES).toContain(item.category);
      expect(PLATFORMS).toContain(item.platform);
      expect(item.styleArchetypes.length).toBeGreaterThan(0);
      item.styleArchetypes.forEach((s) => expect(STYLE_ARCHETYPES).toContain(s));
      expect(item.basePrice).toBeGreaterThan(0);
      expect(item.originalPrice).toBeGreaterThan(item.basePrice);
      expect(item.sustainabilityScore).toBeGreaterThanOrEqual(0);
      expect(item.sustainabilityScore).toBeLessThanOrEqual(100);
      expect(item.listedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      item.colors.forEach((c) => expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/));
    }
  });

  it('only gives a distance to in-person listings', () => {
    for (const item of SEED_ITEMS) {
      if (item.distance !== undefined) expect(item.platform).toBe('Local Thrift');
    }
  });

  it('has listings for every filter chip (category, platform, region, style)', () => {
    for (const category of CATEGORIES) expect(SEED_ITEMS.some((i) => i.category === category)).toBe(true);
    for (const platform of PLATFORMS) expect(SEED_ITEMS.some((i) => i.platform === platform)).toBe(true);
    for (const region of REGIONS) expect(SEED_ITEMS.some((i) => REGION_BY_PLATFORM[i.platform] === region)).toBe(true);
    for (const style of STYLE_ARCHETYPES) expect(SEED_ITEMS.some((i) => i.styleArchetypes.includes(style))).toBe(true);
  });

  it('defines quests whose badges exist and badges with unique ids', () => {
    const badgeIds = new Set(BADGES.map((b) => b.id));
    expect(badgeIds.size).toBe(BADGES.length);
    const questIds = QUEST_DEFINITIONS.map((q) => q.id);
    expect(new Set(questIds).size).toBe(questIds.length);
    for (const quest of QUEST_DEFINITIONS) {
      expect(quest.steps.length).toBeGreaterThan(0);
      expect(new Set(quest.steps).size).toBe(quest.steps.length);
      if (quest.badgeId) expect(badgeIds.has(quest.badgeId)).toBe(true);
    }
  });
});

describe('buildCatalog', () => {
  const catalog = buildCatalog(NOW);

  it('builds every seed item with region, link and 31 days of history ending today', () => {
    expect(catalog).toHaveLength(SEED_ITEMS.length);
    for (const item of catalog) {
      expect(item.region).toBe(REGION_BY_PLATFORM[item.platform]);
      expect(item.productUrl).toMatch(/^https:\/\//);
      expect(item.priceHistory).toHaveLength(31);
      expect(item.priceHistory[30].date).toBe(toDateKey(NOW));
      expect(item.priceHistory[0].date).toBe(toDateKey(addDays(NOW, -30)));
      expect(item.currentPrice).toBe(item.priceHistory[30].price);
      expect(item.currentPrice).toBeLessThan(item.originalPrice);
      expect(item.matchScore).toBe(0);
      expect(Number.isFinite(item.predictedPrice7d)).toBe(true);
      expect(Number.isFinite(item.predictedPrice30d)).toBe(true);
      expect((item as unknown as Record<string, unknown>).basePrice).toBeUndefined();
    }
  });

  it('is deterministic for the same day (stable across launches)', () => {
    expect(buildCatalog(new Date(2026, 10, 25, 23, 30))).toEqual(catalog);
  });

  it('shifts history by one day and keeps overlapping prices identical', () => {
    const tomorrow = buildCatalog(addDays(NOW, 1));
    for (let i = 0; i < catalog.length; i++) {
      expect(tomorrow[i].priceHistory.slice(0, 30)).toEqual(catalog[i].priceHistory.slice(1));
    }
  });

  it('moves prices over time (so alerts can trigger) within sane bounds', () => {
    for (const seed of SEED_ITEMS) {
      const prices = Array.from({ length: 90 }, (_, d) => simulatedPrice(seed, addDays(NOW, d)));
      expect(new Set(prices).size).toBeGreaterThan(5);
      for (const price of prices) {
        expect(price).toBeGreaterThanOrEqual(seed.basePrice * 0.5 - 0.01);
        expect(price).toBeLessThanOrEqual(seed.originalPrice * 0.95);
        expect(Math.round(price * 100) % 50).toBe(49); // retail endings .49 / .99
      }
    }
  });
});
