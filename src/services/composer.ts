// ============================================================
// VibeVault – Stylist: outfits, "complete the look" and a whole
// wardrobe plan
//
// Deterministic: candidates are the user's best matches (already
// scored by the style engine); outfits are searched exhaustively
// over the top candidates per slot and scored for colour harmony,
// one print at most, matching formality, a shared style, wishlist
// pieces and budget. "Next look" walks down the ranking.
//
// The wardrobe plan sizes a complete wardrobe from the user's
// sections, occasions and personality traits, counts what they
// already own, and fills the gaps with live listings chosen to mix
// into as many outfits as possible within one palette.
// ============================================================

import { COLOR_FAMILY_LABELS, matchesShopFor, OCCASION_LABELS } from '../constants/marketplaces';
import { ColorFamily, FashionItem, ItemCategory, Occasion, OwnedPiece, StyleArchetype, TraitScores, UserProfile, WardrobeSlot } from '../types';
import { formatMoneyWhole, FxRates } from '../utils/format';
import { priceIn, totalIn, type MoneyTotal } from './catalog';
import { colorFamilies, formalityOf, isNeutral, isPatterned, occasionsOf } from './itemTraits';

export type SlotKey = WardrobeSlot;

export const SLOTS: SlotKey[] = ['top', 'bottom', 'dress', 'layer', 'shoes', 'bag', 'accessory'];

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

/** Plural section titles for the wardrobe. */
export const SLOT_SECTION: Record<SlotKey, string> = {
  top: 'Tops',
  bottom: 'Bottoms',
  dress: 'Dresses & one-pieces',
  layer: 'Layers',
  shoes: 'Shoes',
  bag: 'Bags',
  accessory: 'Accessories',
};

export function slotForCategory(category: ItemCategory): SlotKey {
  return (Object.keys(SLOT_CATEGORY) as SlotKey[]).find((slot) => SLOT_CATEGORY[slot] === category) ?? 'accessory';
}

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

function toCandidate(item: FashionItem, options: Pick<StylistOptions, 'wishlist'>): Candidate {
  return {
    item,
    families: colorFamilies(item),
    formality: formalityOf(item),
    patterned: isPatterned(item),
    fromWishlist: options.wishlist.has(item.id),
  };
}

function candidatesFor(items: FashionItem[], slot: SlotKey, options: StylistOptions, limit: number): Candidate[] {
  return items
    .filter((i) => i.available && i.category === SLOT_CATEGORY[slot])
    .filter((i) => !options.style || i.styleArchetypes.includes(options.style))
    .filter((i) => !options.occasion || occasionsOf(i).includes(options.occasion))
    .map((item) => toCandidate(item, options))
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
 * Every look over the top candidates, best first. With `fixed`, that piece is in every look (in
 * its slot), which is how "complete the look" works.
 */
function searchLooks(
  items: FashionItem[],
  profile: StylistProfile,
  options: StylistOptions,
  count: number,
  fixed?: { slot: SlotKey; candidate: Candidate },
): Outfit[] {
  const pool = items.filter((i) => matchesShopFor(i.department, profile.shopFor) && i.id !== fixed?.candidate.item.id);
  const pick = (slot: SlotKey, opts: StylistOptions, limit: number) =>
    fixed?.slot === slot ? [fixed.candidate] : candidatesFor(pool, slot, opts, limit);
  const free = { ...options, occasion: null };
  const tops = pick('top', options, PER_SLOT);
  const bottoms = pick('bottom', options, PER_SLOT);
  const dresses = pick('dress', options, PER_SLOT);
  const shoes = pick('shoes', free, PER_SLOT);
  const layers = options.occasion === 'active' && fixed?.slot !== 'layer' ? [] : pick('layer', free, OPTIONAL_PER_SLOT);
  const extras = [
    ...pick('bag', free, OPTIONAL_PER_SLOT).map((c) => ['bag', c] as [SlotKey, Candidate]),
    ...pick('accessory', free, OPTIONAL_PER_SLOT).map((c) => ['accessory', c] as [SlotKey, Candidate]),
  ];

  // A fixed top/bottom pairs only with the other half; a fixed dress is its own base.
  const bases: [SlotKey, Candidate][][] =
    fixed?.slot === 'dress'
      ? dresses.map((d): [SlotKey, Candidate][] => [['dress', d]])
      : fixed?.slot === 'top' || fixed?.slot === 'bottom'
        ? tops.flatMap((t) => bottoms.map((b): [SlotKey, Candidate][] => [['top', t], ['bottom', b]]))
        : [
            ...tops.flatMap((t) => bottoms.map((b): [SlotKey, Candidate][] => [['top', t], ['bottom', b]])),
            ...dresses.map((d): [SlotKey, Candidate][] => [['dress', d]]),
          ];
  const shoeOptions: ([SlotKey, Candidate] | null)[] = shoes.length ? shoes.map((s) => ['shoes', s] as [SlotKey, Candidate]) : [null];
  const layerOptions: ([SlotKey, Candidate] | null)[] =
    fixed?.slot === 'layer' ? layers.map((l) => ['layer', l] as [SlotKey, Candidate]) : [null, ...layers.map((l) => ['layer', l] as [SlotKey, Candidate])];
  const extraOptions: ([SlotKey, Candidate] | null)[] =
    fixed?.slot === 'bag' || fixed?.slot === 'accessory' ? extras.filter(([slot]) => slot === fixed.slot) : [null, ...extras];

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

/**
 * The best outfits from `items` (scored listings), best first, each differing from the ones
 * before it by at least two pieces. Base is top + bottom or a one-piece; then shoes, and a
 * layer, bag or accessory when they make the look better.
 */
export function buildOutfits(items: FashionItem[], profile: StylistProfile, options: StylistOptions, count = 5): Outfit[] {
  return searchLooks(items, profile, options, count);
}

/** Outfits built around one listing ("complete the look"), best first. */
export function completeTheLook(anchor: FashionItem, items: FashionItem[], profile: StylistProfile, options: StylistOptions, count = 1): Outfit[] {
  if (!anchor.available) return [];
  const slot = slotForCategory(anchor.category);
  return searchLooks(items, profile, { ...options, occasion: null, style: null }, count, { slot, candidate: toCandidate(anchor, options) }).filter(
    (o) => o.pieces.length >= 2,
  );
}

// ---- Whole wardrobe ----------------------------------------------------------------

export interface WardrobePlan {
  targets: Record<SlotKey, number>;
  /** Why the plan looks the way it does, one line per adjustment. */
  reasons: string[];
}

const CAPS: Record<SlotKey, number> = { top: 10, bottom: 6, dress: 5, layer: 4, shoes: 5, bag: 3, accessory: 5 };

/**
 * How many pieces of each kind a complete wardrobe needs, from the user's sections, the
 * occasions they dress for and their personality traits.
 */
export function wardrobePlan(profile: Pick<UserProfile, 'shopFor' | 'occasions'> & { traits?: TraitScores }): WardrobePlan {
  const menOnly = profile.shopFor === 'men';
  const targets: Record<SlotKey, number> = menOnly
    ? { top: 7, bottom: 4, dress: 0, layer: 2, shoes: 3, bag: 1, accessory: 3 }
    : { top: 6, bottom: 4, dress: profile.shopFor === 'women' ? 3 : 2, layer: 2, shoes: 3, bag: 2, accessory: 3 };
  const reasons: string[] = [];
  const add = (changes: Partial<Record<SlotKey, number>>, reason: string) => {
    let applied = false;
    for (const [slot, n] of Object.entries(changes) as [SlotKey, number][]) {
      if (slot === 'dress' && menOnly) continue;
      const next = Math.min(CAPS[slot], targets[slot] + n);
      if (next !== targets[slot]) applied = true;
      targets[slot] = next;
    }
    if (applied) reasons.push(reason);
  };
  const statement = (n: number): Partial<Record<SlotKey, number>> => (menOnly ? { top: n } : { dress: n });

  const occasions = new Set(profile.occasions);
  if (occasions.has('work')) add({ top: 2, bottom: 1 }, 'Work & office: two more shirts or blouses and smart trousers.');
  if (occasions.has('everyday')) add({ top: 1 }, 'Everyday: an extra easy top for rotation.');
  if (occasions.has('evening')) add({ ...statement(1), shoes: 1 }, 'Nights out: a going-out piece and a pair of shoes for it.');
  if (occasions.has('festive')) add({ ...statement(1), accessory: 1 }, 'Festive & weddings: an occasion outfit and jewellery.');
  if (occasions.has('active')) add({ bottom: 1, shoes: 1 }, 'Gym & sport: activewear bottoms and trainers.');
  if (occasions.has('outdoors')) add({ layer: 1, shoes: 1 }, 'Travel & outdoors: a weatherproof layer and walking shoes.');

  const t = profile.traits ?? {};
  const strong = (x: number | undefined) => (x ?? 0) >= 0.5;
  if (strong(t.polish)) add({ layer: 1 }, 'You come across as polished: a second tailored layer.');
  if (strong(t.comfort)) add({ bottom: 1 }, 'Comfort matters to you: an extra easy-fit bottom.');
  if (strong(t.expressive)) add({ accessory: 1 }, 'You like to stand out: a statement accessory.');
  if (strong(t.novelty)) add({ top: 1 }, 'Trend-curious: one trend piece to rotate in.');
  if (strong(t.edge)) add({ layer: 1 }, 'An edgy streak: a stand-out jacket.');
  if (strong(t.warmth)) add(statement(1), 'Warm and approachable: a soft, easy piece.');

  return { targets, reasons };
}

export interface WardrobeSlotPlan {
  slot: SlotKey;
  target: number;
  owned: OwnedPiece[];
  picks: OutfitPiece[];
}

export interface WardrobeLook {
  pieces: { slot: SlotKey; title: string; item: FashionItem | null; owned: boolean }[];
}

export interface Wardrobe {
  plan: WardrobePlan;
  slots: WardrobeSlotPlan[];
  palette: { neutrals: ColorFamily[]; accents: ColorFamily[] };
  /** Target pieces in total. */
  pieces: number;
  ownedCount: number;
  picks: OutfitPiece[];
  /** Outfits (top + bottom or one-piece, with shoes) the planned wardrobe mixes into. */
  outfitCount: number;
  /** Cost of the suggested pieces (not what's already owned). */
  total: MoneyTotal;
  examples: WardrobeLook[];
}

interface Entry {
  key: string;
  slot: SlotKey;
  families: ColorFamily[];
  formality: number;
  patterned: boolean;
  match: number;
  item: FashionItem | null;
  owned: OwnedPiece | null;
  fromWishlist: boolean;
}

/** A look works when colours, prints and formality don't clash. */
function compatible(look: Entry[]): boolean {
  const accents = new Set(look.flatMap((p) => p.families.filter((f) => !isNeutral(f))));
  const levels = look.map((p) => p.formality);
  return accents.size <= 2 && look.filter((p) => p.patterned).length <= 1 && Math.max(...levels) - Math.min(...levels) <= 1;
}

/** Working looks (base + shoes) in a selection; with `only`, just the looks that include it. */
function looksIn(selected: Map<SlotKey, Entry[]>, only?: Entry): Entry[][] {
  const looks: Entry[][] = [];
  const shoes = selected.get('shoes') ?? [];
  const shoeChoices: (Entry | null)[] = shoes.length ? shoes : [null];
  const bases: Entry[][] = [
    ...(selected.get('top') ?? []).flatMap((t) => (selected.get('bottom') ?? []).map((b) => [t, b])),
    ...(selected.get('dress') ?? []).map((d) => [d]),
  ];
  for (const base of bases) {
    for (const shoe of shoeChoices) {
      const look = shoe ? [...base, shoe] : base;
      if (only && !look.includes(only)) continue;
      if (compatible(look)) looks.push(look);
    }
  }
  return looks;
}

/** How a piece counts in outfit maths: owned pieces use what we know about them. */
function ownedEntry(piece: OwnedPiece, itemsById: Map<string, FashionItem>): Entry {
  const item = piece.itemId ? itemsById.get(piece.itemId) ?? null : null;
  return {
    key: piece.id,
    slot: piece.slot,
    families: piece.colors,
    formality: item ? formalityOf(item) : 2,
    patterned: item ? isPatterned(item) : false,
    match: 100,
    item,
    owned: piece,
    fromWishlist: false,
  };
}

/**
 * A complete wardrobe: the plan's pieces per slot, counting what the user owns, with the gaps
 * filled one piece at a time by the live listing that adds the most (its match plus how many
 * new working outfits it makes with everything chosen or owned so far), within one palette.
 */
export function buildWardrobe(
  items: FashionItem[],
  profile: StylistProfile & Pick<UserProfile, 'likedColors'> & { traits?: TraitScores },
  options: StylistOptions & { owned: OwnedPiece[] },
): Wardrobe | null {
  const pool = items.filter((i) => i.available && matchesShopFor(i.department, profile.shopFor));
  const plan = wardrobePlan(profile);
  if (pool.length === 0 && options.owned.length === 0) return null;

  // Palette: the user's loved neutrals (or the commonest among their best matches) plus up to two accents.
  const best = [...pool].sort((a, b) => b.matchScore - a.matchScore).slice(0, 40);
  const tally = (keep: (f: ColorFamily) => boolean) => {
    const counts = new Map<ColorFamily, number>();
    for (const i of best) for (const f of colorFamilies(i).filter(keep)) counts.set(f, (counts.get(f) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([f]) => f);
  };
  const lovedNeutrals = profile.likedColors.filter(isNeutral);
  const lovedAccents = profile.likedColors.filter((f) => !isNeutral(f));
  const neutrals = (lovedNeutrals.length ? lovedNeutrals : tally(isNeutral)).slice(0, 3);
  const accents = (lovedAccents.length ? lovedAccents : tally((f) => !isNeutral(f))).slice(0, 2);
  const palette = new Set([...neutrals, ...accents]);

  const itemsById = new Map(items.map((i) => [i.id, i]));
  const ownedItemIds = new Set(options.owned.map((o) => o.itemId).filter((x): x is string => !!x));
  const selected = new Map<SlotKey, Entry[]>(SLOTS.map((slot) => [slot, [] as Entry[]]));
  for (const piece of options.owned) selected.get(piece.slot)!.push(ownedEntry(piece, itemsById));

  const candidates = new Map<SlotKey, Entry[]>(
    SLOTS.map((slot) => [
      slot,
      candidatesFor(pool, slot, { ...options, occasion: null, style: null }, 14)
        .filter((c) => !ownedItemIds.has(c.item.id))
        .filter((c) => c.families.length === 0 || c.families.every((f) => palette.has(f)))
        .map((c) => ({
          key: c.item.id,
          slot,
          families: c.families,
          formality: c.formality,
          patterned: c.patterned,
          match: c.item.matchScore,
          item: c.item,
          owned: null,
          fromWishlist: c.fromWishlist,
        })),
    ]),
  );

  const outfitSlots = new Set<SlotKey>(['top', 'bottom', 'dress', 'shoes']);
  const remaining = (slot: SlotKey) => plan.targets[slot] - selected.get(slot)!.length;
  const toFill = SLOTS.reduce((sum, slot) => sum + Math.max(0, remaining(slot)), 0);
  for (let step = 0; step < toFill; step++) {
    let pick: { slot: SlotKey; entry: Entry; gain: number } | null = null;
    for (const slot of SLOTS) {
      if (remaining(slot) <= 0) continue;
      const have = selected.get(slot)!;
      for (const entry of candidates.get(slot)!) {
        if (have.includes(entry)) continue;
        let added = 0;
        if (outfitSlots.has(slot)) {
          const trial = new Map(selected);
          trial.set(slot, [...have, entry]);
          added = looksIn(trial, entry).length;
        }
        const gain = entry.match / 100 + Math.min(added, 12) * 0.25 + (entry.fromWishlist ? 0.3 : 0);
        if (!pick || gain > pick.gain || (gain === pick.gain && entry.key < pick.entry.key)) pick = { slot, entry, gain };
      }
    }
    if (!pick) break;
    selected.get(pick.slot)!.push(pick.entry);
  }

  const slots: WardrobeSlotPlan[] = SLOTS.filter((slot) => plan.targets[slot] > 0 || selected.get(slot)!.length > 0).map((slot) => ({
    slot,
    target: plan.targets[slot],
    owned: selected.get(slot)!.filter((e) => e.owned).map((e) => e.owned!),
    picks: selected
      .get(slot)!
      .filter((e) => e.item && !e.owned)
      .map((e) => ({ slot, item: e.item!, fromWishlist: e.fromWishlist })),
  }));
  const picks = slots.flatMap((s) => s.picks);
  const looks = looksIn(selected);
  const examples: WardrobeLook[] = [...looks]
    .sort((a, b) => b.reduce((s, e) => s + e.match, 0) / b.length - a.reduce((s, e) => s + e.match, 0) / a.length || a.map((e) => e.key).join().localeCompare(b.map((e) => e.key).join()))
    .slice(0, 4)
    .map((look) => ({
      pieces: look.map((e) => ({ slot: e.slot, title: e.owned ? e.owned.title : e.item!.title, item: e.item, owned: !!e.owned })),
    }));

  return {
    plan,
    slots,
    palette: { neutrals, accents },
    pieces: SLOTS.reduce((sum, slot) => sum + plan.targets[slot], 0),
    ownedCount: options.owned.length,
    picks,
    outfitCount: looks.length,
    total: totalIn(picks.map((p) => p.item), profile.currency, options.rates),
    examples,
  };
}
