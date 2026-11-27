// ============================================================
// VibeVault – Stylist: outfits and a capsule wardrobe
//
// Deterministic: candidates are the user's best matches (already
// scored by the style engine); outfits are searched exhaustively
// over the top candidates per slot and scored for colour harmony,
// one print at most, matching formality, a shared style, wishlist
// pieces and budget. "Another look" walks down the ranking.
// ============================================================

import { COLOR_FAMILY_LABELS, matchesShopFor, OCCASION_LABELS } from '../constants/marketplaces';
import { ColorFamily, FashionItem, ItemCategory, Occasion, StyleArchetype, UserProfile } from '../types';
import { formatMoneyWhole, FxRates } from '../utils/format';
import { priceIn, totalIn, type MoneyTotal } from './catalog';
import { colorFamilies, formalityOf, isNeutral, isPatterned, occasionsOf } from './itemTraits';

export type SlotKey = 'top' | 'bottom' | 'dress' | 'layer' | 'shoes' | 'bag' | 'accessory';

export const SLOT_CATEGORY: Record<SlotKey, ItemCategory> = {
  top: 'Tops',
  bottom: 'Bottoms',
  dress: 'Dresses',
  layer: 'Outerwear',
  shoes: 'Shoes',
  bag: 'Bags',
  accessory: 'Accessories',
};

export const SLOT_LABELS: Record<SlotKey, string> = {
  top: 'Top',
  bottom: 'Bottom',
  dress: 'Dress / one-piece',
  layer: 'Layer',
  shoes: 'Shoes',
  bag: 'Bag',
  accessory: 'Accessory',
};

export interface OutfitPiece {
  slot: SlotKey;
  item: FashionItem;
  fromWishlist: boolean;
}

export interface Outfit {
  pieces: OutfitPiece[];
  score: number;
  /** Shared style of the look (null when the pieces don't share one). */
  archetype: StyleArchetype | null;
  accents: ColorFamily[];
  reasons: string[];
  total: MoneyTotal;
}

type StylistProfile = Pick<UserProfile, 'shopFor' | 'budgetMax' | 'currency' | 'styleArchetypes' | 'occasions'>;

export interface StylistOptions {
  wishlist: Set<string>;
  rates: FxRates | null;
  /** Only pieces suited to this occasion. */
  occasion?: Occasion | null;
  /** Only pieces tagged with this style. */
  style?: StyleArchetype | null;
}

const PER_SLOT = 6;
const OPTIONAL_PER_SLOT = 4;

interface Candidate {
  item: FashionItem;
  families: ColorFamily[];
  formality: number;
  patterned: boolean;
  fromWishlist: boolean;
}

function candidatesFor(items: FashionItem[], slot: SlotKey, options: StylistOptions, limit: number): Candidate[] {
  return items
    .filter((i) => i.available && i.category === SLOT_CATEGORY[slot])
    .filter((i) => !options.style || i.styleArchetypes.includes(options.style))
    .filter((i) => !options.occasion || occasionsOf(i).includes(options.occasion))
    .map((item) => ({
      item,
      families: colorFamilies(item),
      formality: formalityOf(item),
      patterned: isPatterned(item),
      fromWishlist: options.wishlist.has(item.id),
    }))
    // Saved pieces first, then the best matches.
    .sort((a, b) => Number(b.fromWishlist) - Number(a.fromWishlist) || b.item.matchScore - a.item.matchScore || a.item.id.localeCompare(b.item.id))
    .slice(0, limit);
}

interface Scored {
  score: number;
  archetype: StyleArchetype | null;
  accents: ColorFamily[];
  notes: string[];
}

/** Coherence of a set of pieces, plus the reasons for the user. */
function scoreLook(pieces: Candidate[], profile: StylistProfile, options: StylistOptions): Scored {
  const notes: string[] = [];
  let score = pieces.reduce((s, p) => s + p.item.matchScore, 0) / pieces.length;

  // Colour: neutrals go with anything; one accent colour reads as deliberate, three as a clash.
  const accents = [...new Set(pieces.flatMap((p) => p.families.filter((f) => !isNeutral(f))))];
  if (accents.length === 0 && pieces.some((p) => p.families.length)) {
    score += 6;
    notes.push('All-neutral palette');
  } else if (accents.length === 1) {
    score += 8;
    notes.push(`Neutral base with a ${COLOR_FAMILY_LABELS[accents[0]].toLowerCase()} accent`);
  } else if (accents.length === 2) {
    score += 2;
  } else if (accents.length >= 3) {
    score -= 12;
  }

  // At most one print.
  const prints = pieces.filter((p) => p.patterned).length;
  if (prints > 1) score -= 8 * (prints - 1);

  // Formality within one step (no gym shoes with a blazer).
  const levels = pieces.map((p) => p.formality);
  const spread = Math.max(...levels) - Math.min(...levels);
  score += spread <= 1 ? 6 : spread === 2 ? -4 : -14;

  // A shared style.
  const counts = new Map<StyleArchetype, number>();
  for (const p of pieces) for (const a of p.item.styleArchetypes) counts.set(a, (counts.get(a) ?? 0) + 1);
  const preferred = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || profile.styleArchetypes.indexOf(a[0]) - profile.styleArchetypes.indexOf(b[0]),
  )[0];
  const archetype = preferred && preferred[1] >= 2 ? preferred[0] : null;
  if (archetype) {
    score += preferred[1] >= 3 ? 6 : 3;
    if (profile.styleArchetypes.includes(archetype)) notes.unshift(`Built around your ${archetype} style`);
    else notes.unshift(`${archetype} look`);
  }

  // Saved pieces and budget.
  const saved = pieces.filter((p) => p.fromWishlist).length;
  if (saved) {
    score += 12 * saved;
    notes.push(`${saved} piece${saved === 1 ? '' : 's'} from your wishlist`);
  }
  if (profile.budgetMax) {
    const over = pieces.filter((p) => {
      const price = priceIn(p.item, profile.currency, options.rates);
      return price !== null && price > profile.budgetMax!;
    }).length;
    score -= over * 5;
    if (over === 0) notes.push(`Every piece within ${formatMoneyWhole(profile.budgetMax, profile.currency)}`);
  }
  if (options.occasion) notes.push(`For ${OCCASION_LABELS[options.occasion].toLowerCase()}`);
  return { score, archetype, accents, notes };
}

function toOutfit(slots: [SlotKey, Candidate][], scored: Scored, profile: StylistProfile, options: StylistOptions): Outfit {
  const pieces = slots.map(([slot, c]) => ({ slot, item: c.item, fromWishlist: c.fromWishlist }));
  return {
    pieces,
    score: Math.round(scored.score),
    archetype: scored.archetype,
    accents: scored.accents,
    reasons: scored.notes.slice(0, 4),
    total: totalIn(pieces.map((p) => p.item), profile.currency, options.rates),
  };
}

const ids = (o: Outfit) => new Set(o.pieces.map((p) => p.item.id));

/**
 * The best outfits from `items` (scored listings), best first, each differing from the ones
 * before it by at least two pieces. Base is top + bottom or a one-piece; then shoes, and a
 * layer, bag or accessory when they make the look better.
 */
export function buildOutfits(items: FashionItem[], profile: StylistProfile, options: StylistOptions, count = 5): Outfit[] {
  const pool = items.filter((i) => matchesShopFor(i.department, profile.shopFor));
  const tops = candidatesFor(pool, 'top', options, PER_SLOT);
  const bottoms = candidatesFor(pool, 'bottom', options, PER_SLOT);
  const dresses = candidatesFor(pool, 'dress', options, PER_SLOT);
  const shoes = candidatesFor(pool, 'shoes', { ...options, occasion: null }, PER_SLOT);
  const layers = options.occasion === 'active' ? [] : candidatesFor(pool, 'layer', { ...options, occasion: null }, OPTIONAL_PER_SLOT);
  const extras = [
    ...candidatesFor(pool, 'bag', { ...options, occasion: null }, OPTIONAL_PER_SLOT).map((c) => ['bag', c] as [SlotKey, Candidate]),
    ...candidatesFor(pool, 'accessory', { ...options, occasion: null }, OPTIONAL_PER_SLOT).map((c) => ['accessory', c] as [SlotKey, Candidate]),
  ];

  const bases: [SlotKey, Candidate][][] = [
    ...tops.flatMap((t) => bottoms.map((b): [SlotKey, Candidate][] => [['top', t], ['bottom', b]])),
    ...dresses.map((d): [SlotKey, Candidate][] => [['dress', d]]),
  ];
  const shoeOptions: ([SlotKey, Candidate] | null)[] = shoes.length ? shoes.map((s) => ['shoes', s] as [SlotKey, Candidate]) : [null];
  const layerOptions: ([SlotKey, Candidate] | null)[] = [null, ...layers.map((l) => ['layer', l] as [SlotKey, Candidate])];
  const extraOptions: ([SlotKey, Candidate] | null)[] = [null, ...extras];

  const all: { slots: [SlotKey, Candidate][]; scored: Scored; key: string }[] = [];
  for (const base of bases) {
    for (const shoe of shoeOptions) {
      for (const layer of layerOptions) {
        for (const extra of extraOptions) {
          const slots = [...base, shoe, layer, extra].filter((s): s is [SlotKey, Candidate] => s !== null);
          const scored = scoreLook(slots.map(([, c]) => c), profile, options);
          all.push({ slots, scored, key: slots.map(([, c]) => c.item.id).join() });
        }
      }
    }
  }
  all.sort((a, b) => b.scored.score - a.scored.score || a.key.localeCompare(b.key));

  const chosen: Outfit[] = [];
  for (const look of all) {
    const pieceIds = look.slots.map(([, c]) => c.item.id);
    const distinct = chosen.every((c) => {
      const prev = ids(c);
      return pieceIds.filter((id) => !prev.has(id)).length >= 2;
    });
    if (distinct) chosen.push(toOutfit(look.slots, look.scored, profile, options));
    if (chosen.length >= count) break;
  }
  return chosen;
}

// ---- Capsule wardrobe ----------------------------------------------------------------

export interface Capsule {
  pieces: OutfitPiece[];
  /** Outfits (top + bottom + shoes, or one-piece + shoes) that work within the capsule. */
  outfitCount: number;
  examples: Outfit[];
  palette: { neutrals: ColorFamily[]; accents: ColorFamily[] };
  total: MoneyTotal;
}

/** Pieces per slot in the capsule (a standard ~14-piece capsule; no dress slot for menswear-only). */
export function capsulePlan(shopFor: UserProfile['shopFor']): Partial<Record<SlotKey, number>> {
  return shopFor === 'men'
    ? { top: 5, bottom: 3, layer: 2, shoes: 2, bag: 1, accessory: 1 }
    : { top: 4, bottom: 3, dress: 2, layer: 2, shoes: 2, bag: 1, accessory: 1 };
}

/** A look works when colours, prints and formality don't clash. */
function compatible(look: Candidate[]): boolean {
  const accents = new Set(look.flatMap((p) => p.families.filter((f) => !isNeutral(f))));
  const levels = look.map((p) => p.formality);
  return accents.size <= 2 && look.filter((p) => p.patterned).length <= 1 && Math.max(...levels) - Math.min(...levels) <= 1;
}

/** Working looks (base + shoes) in a selection; with `only`, just the looks that include it. */
function looksIn(selected: Map<SlotKey, Candidate[]>, only?: Candidate): [SlotKey, Candidate][][] {
  const looks: [SlotKey, Candidate][][] = [];
  const shoes = selected.get('shoes') ?? [];
  const shoeChoices: ([SlotKey, Candidate] | null)[] = shoes.length ? shoes.map((c): [SlotKey, Candidate] => ['shoes', c]) : [null];
  const bases: [SlotKey, Candidate][][] = [
    ...(selected.get('top') ?? []).flatMap((t) => (selected.get('bottom') ?? []).map((b): [SlotKey, Candidate][] => [['top', t], ['bottom', b]])),
    ...(selected.get('dress') ?? []).map((d): [SlotKey, Candidate][] => [['dress', d]]),
  ];
  for (const base of bases) {
    for (const shoe of shoeChoices) {
      const look = shoe ? [...base, shoe] : base;
      if (only && !look.some(([, c]) => c === only)) continue;
      if (compatible(look.map(([, c]) => c))) looks.push(look);
    }
  }
  return looks;
}

/**
 * A capsule wardrobe built around the user's palette: pieces are added one at a time, each time
 * picking the candidate that adds the most (its match plus how many new working outfits it makes).
 */
export function buildCapsule(items: FashionItem[], profile: StylistProfile & Pick<UserProfile, 'likedColors'>, options: StylistOptions): Capsule | null {
  const pool = items.filter((i) => i.available && matchesShopFor(i.department, profile.shopFor));
  if (pool.length === 0) return null;
  const plan = capsulePlan(profile.shopFor);

  // Palette: the user's loved neutrals (or the commonest among their best matches) plus up to two accents.
  const top = [...pool].sort((a, b) => b.matchScore - a.matchScore).slice(0, 40);
  const tally = (pick: (f: ColorFamily) => boolean) => {
    const counts = new Map<ColorFamily, number>();
    for (const i of top) for (const f of colorFamilies(i).filter(pick)) counts.set(f, (counts.get(f) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  };
  const lovedNeutrals = profile.likedColors.filter(isNeutral);
  const lovedAccents = profile.likedColors.filter((f) => !isNeutral(f));
  const neutrals = (lovedNeutrals.length ? lovedNeutrals : tally(isNeutral)).slice(0, 3);
  const accents = (lovedAccents.length ? lovedAccents : tally((f) => !isNeutral(f))).slice(0, 2);
  const palette = new Set([...neutrals, ...accents]);
  const inPalette = (c: Candidate) => c.families.length === 0 || c.families.every((f) => palette.has(f));

  const selected = new Map<SlotKey, Candidate[]>();
  const slots = Object.keys(plan) as SlotKey[];
  const candidates = new Map(slots.map((slot) => [slot, candidatesFor(pool, slot, options, 12).filter(inPalette)]));
  const target = slots.reduce((sum, slot) => sum + (plan[slot] ?? 0), 0);
  for (let step = 0; step < target; step++) {
    let best: { slot: SlotKey; candidate: Candidate; gain: number } | null = null;
    for (const slot of slots) {
      const have = selected.get(slot) ?? [];
      if (have.length >= (plan[slot] ?? 0)) continue;
      for (const candidate of candidates.get(slot) ?? []) {
        if (have.includes(candidate)) continue;
        const trial = new Map(selected);
        trial.set(slot, [...have, candidate]);
        // New working outfits this piece would create with what's already in the capsule.
        const added = looksIn(trial, candidate).length;
        const gain = candidate.item.matchScore / 100 + added * 0.25 + (candidate.fromWishlist ? 0.3 : 0);
        if (!best || gain > best.gain || (gain === best.gain && candidate.item.id < best.candidate.item.id)) {
          best = { slot, candidate, gain };
        }
      }
    }
    if (!best) break;
    selected.set(best.slot, [...(selected.get(best.slot) ?? []), best.candidate]);
  }

  const pieces: OutfitPiece[] = slots.flatMap((slot) =>
    (selected.get(slot) ?? []).map((c) => ({ slot, item: c.item, fromWishlist: c.fromWishlist })),
  );
  if (pieces.length === 0) return null;
  const looks = looksIn(selected);
  const examples = looks
    .map((look) => toOutfit(look, scoreLook(look.map(([, c]) => c), profile, options), profile, options))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  return {
    pieces,
    outfitCount: looks.length,
    examples,
    palette: { neutrals, accents },
    total: totalIn(pieces.map((p) => p.item), profile.currency, options.rates),
  };
}
