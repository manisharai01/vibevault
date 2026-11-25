import { Linking } from 'react-native';
import { PLATFORMS } from '../constants/marketplaces';
import { buildCatalog } from '../services/catalog';
import { composeLook } from '../services/composer';
import { getMarketplaceUrl, marketplaceCtaLabel, openUrl, searchQueryFor } from '../services/linking';

const catalog = buildCatalog(new Date(2026, 10, 25, 10, 0));

describe('composeLook', () => {
  it('is deterministic for a seed and fills every slot from the full catalogue', () => {
    const a = composeLook(catalog, new Set(), 1);
    expect(composeLook(catalog, new Set(), 1)).toEqual(a);
    expect(a.every((slot) => slot.item !== null)).toBe(true);
    expect(a.map((s) => s.key).slice(-3)).toEqual(['layer', 'shoes', 'extra']);
  });

  it('never combines a dress with separates and matches slot categories', () => {
    for (let seed = 0; seed < 40; seed++) {
      const look = composeLook(catalog, new Set(), seed);
      const keys = look.map((s) => s.key);
      const hasDress = keys.includes('dress');
      expect(hasDress ? !keys.includes('top') && !keys.includes('bottom') : keys.includes('top') && keys.includes('bottom')).toBe(true);
      for (const slot of look) {
        if (!slot.item) continue;
        const expected = { top: ['Tops'], bottom: ['Bottoms'], dress: ['Dresses'], layer: ['Outerwear'], shoes: ['Shoes'], extra: ['Accessories', 'Bags'] }[slot.key];
        expect(expected).toContain(slot.item.category);
      }
    }
  });

  it('prefers wishlist pieces', () => {
    const savedShoes = catalog.filter((i) => i.category === 'Shoes').at(-1)!;
    const look = composeLook(catalog, new Set([savedShoes.id]), 3);
    const shoes = look.find((s) => s.key === 'shoes')!;
    expect(shoes.item?.id).toBe(savedShoes.id);
    expect(shoes.fromWishlist).toBe(true);
  });

  it('returns empty slots when nothing matches', () => {
    expect(composeLook([], new Set(), 1).every((slot) => slot.item === null)).toBe(true);
  });
});

describe('marketplace links', () => {
  const item = catalog[0];

  it('builds an https search URL for every platform', () => {
    for (const platform of PLATFORMS) {
      const url = getMarketplaceUrl({ ...item, platform });
      expect(url).toMatch(/^https:\/\/[\w.-]+\//);
      expect(url).not.toMatch(/\s/);
    }
    expect(getMarketplaceUrl({ ...item, platform: 'Local Thrift' })).toContain('google.com/maps');
    expect(getMarketplaceUrl({ ...item, platform: 'Myntra' })).toMatch(/^https:\/\/www\.myntra\.com\/[a-z0-9-]+\?rawQuery=/);
  });

  it('builds clean queries without duplicating the brand', () => {
    expect(searchQueryFor({ title: "Vintage Levi's 501 High-Waist Jeans", brand: "Levi's" })).toBe("Vintage Levi's 501 High-Waist Jeans");
    expect(searchQueryFor({ title: 'Oxford Button-Down – Burgundy', brand: 'Tommy Hilfiger' })).toBe('Tommy Hilfiger Oxford Button-Down Burgundy');
    expect(searchQueryFor({ title: 'Gold Chain', brand: 'Unknown' })).toBe('Gold Chain');
  });

  it('labels calls to action', () => {
    expect(marketplaceCtaLabel('Depop')).toBe('View on Depop');
    expect(marketplaceCtaLabel('Local Thrift')).toBe('Find Nearby Thrift Stores');
  });

  it('reports whether a URL could be opened', async () => {
    const spy = jest.spyOn(Linking, 'openURL');
    spy.mockResolvedValueOnce(true);
    await expect(openUrl('https://example.com')).resolves.toBe(true);
    spy.mockRejectedValueOnce(new Error('no handler'));
    await expect(openUrl('https://example.com')).resolves.toBe(false);
    spy.mockRestore();
  });
});
