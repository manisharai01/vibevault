import { Linking } from 'react-native';
import { EXTERNAL_STORES } from '../constants/marketplaces';
import { composeLook } from '../services/composer';
import { externalSearchUrl, marketplaceCtaLabel, openItemOnMarketplace, openUrl, searchQueryFor } from '../services/linking';
import { makeItem, sampleCatalog } from './helpers/fixtures';

const catalog = [
  ...sampleCatalog(),
  makeItem({ id: 'flipkart:SHOFX2', source_item_id: 'SHOFX2', title: 'White Leather Loafers', category: 'Shoes', current_price: 1999 }),
];

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
  it('opens the listing’s own product page', async () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(true);
    await expect(openItemOnMarketplace(catalog[0])).resolves.toBe(true);
    expect(spy).toHaveBeenCalledWith(catalog[0].productUrl);
    spy.mockRestore();
  });

  it('builds an https search URL for every store without a price API', () => {
    for (const store of EXTERNAL_STORES) {
      const url = externalSearchUrl(store, "Levi's 501 jeans & more");
      expect(url).toMatch(/^https:\/\/[\w.-]+\//);
      expect(url).not.toMatch(/\s/);
      expect(url).not.toContain('&more');
    }
    expect(externalSearchUrl('Myntra', "Levi's 501 Jeans")).toMatch(/^https:\/\/www\.myntra\.com\/levis-501-jeans\?rawQuery=/);
    expect(externalSearchUrl('Amazon', 'oxford shirt')).toBe('https://www.amazon.in/s?k=oxford%20shirt');
  });

  it('builds clean queries without duplicating the brand', () => {
    expect(searchQueryFor({ title: "Vintage Levi's 501 High-Waist Jeans", brand: "Levi's" })).toBe("Vintage Levi's 501 High-Waist Jeans");
    expect(searchQueryFor({ title: 'Oxford Button-Down – Burgundy', brand: 'Tommy Hilfiger' })).toBe('Tommy Hilfiger Oxford Button-Down Burgundy');
    expect(searchQueryFor({ title: 'Gold Chain', brand: null })).toBe('Gold Chain');
    expect(searchQueryFor({ title: 'x'.repeat(300), brand: null })).toHaveLength(100);
  });

  it('labels calls to action', () => {
    expect(marketplaceCtaLabel('Flipkart')).toBe('View on Flipkart');
    expect(marketplaceCtaLabel('eBay')).toBe('View on eBay');
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
