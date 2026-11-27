// Helpers that turn raw marketplace fields into clean values, and classify listings
// (department, category, style) from the marketplace's own text.

import { STYLE_ARCHETYPES, type Category, type Department, type StyleArchetype } from './types.ts';

/** Android blocks plain-HTTP images, so upgrade marketplace URLs to HTTPS. */
export function toHttps(url: unknown): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('http://')) return `https://${trimmed.slice('http://'.length)}`;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return null;
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

export function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(nbsp|amp|quot|#39|apos|lt|gt);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

export function toAmount(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

// ---- Colours ----------------------------------------------------------------

const COLOR_WORDS: [RegExp, string][] = [
  [/\bblack\b|\bschwarz\b|\bnoir\b|\bnegro\b|\bnero\b|\bpreto\b|ブラック|블랙/i, '#1C1C1C'],
  [/\bwhite\b|\boff[- ]white\b|\bweiß\b|\bweiss\b|\bblanc\b|\bblanco\b|\bbianco\b|\bbranco\b|ホワイト|화이트/i, '#F5F5F5'],
  [/\bcream\b|\bivory\b|\becru\b/i, '#F3EAD3'],
  [/\bbeige\b|\bkhaki\b|\bsand\b|\bnude\b/i, '#D8C3A0'],
  [/\bbrown\b|\bchocolate\b|\bcoffee\b|\bbraun\b|\bmarron\b|\bmarrón\b/i, '#6B4226'],
  [/\btan\b|\bcamel\b|\bcognac\b/i, '#C19A6B'],
  [/\bgr[ae]y\b|\bcharcoal\b|\bgrau\b|\bgris\b|\bgrigio\b|\bcinza\b|グレー|그레이/i, '#7D7D7D'],
  [/\bnavy\b|\bmarine\b/i, '#1F2A44'],
  [/\bblue\b|\bdenim\b|\bindigo\b|\bblau\b|\bbleu\b|\bazul\b|\bblu\b|ブルー|블루/i, '#3A6EA5'],
  [/\bsky\b|\bpowder blue\b|\blight blue\b|\bbaby blue\b/i, '#A7C7E7'],
  [/\bgreen\b|\bolive\b|\bsage\b|\bgrün\b|\bvert\b|\bverde\b|グリーン|그린/i, '#556B2F'],
  [/\bred\b|\bscarlet\b|\brot\b|\brouge\b|\brojo\b|\brosso\b|\bvermelho\b|レッド|레드/i, '#C62828'],
  [/\bmaroon\b|\bburgundy\b|\bwine\b|\bbordeaux\b/i, '#6D1A36'],
  [/\bpink\b|\bblush\b|\brose\b|\brosa\b|ピンク|핑크/i, '#E8A0B4'],
  [/\bpurple\b|\blavender\b|\blilac\b|\bviolet\b|\bmauve\b/i, '#8E6BBF'],
  [/\byellow\b|\bmustard\b|\bgelb\b|\bjaune\b|\bamarillo\b|\bgiallo\b/i, '#E0B526'],
  [/\borange\b|\brust\b|\bterracotta\b/i, '#D9692B'],
  [/\bgold(en)?\b/i, '#D4AF37'],
  [/\bsilver\b/i, '#C0C0C0'],
];

/** Colour swatches mentioned in free text (colour attribute first, then title), at most three. */
export function colorsFromText(...texts: unknown[]): string[] {
  const haystack = texts.filter((t): t is string => typeof t === 'string').join(' ');
  const found: string[] = [];
  for (const [pattern, hex] of COLOR_WORDS) {
    if (pattern.test(haystack) && !found.includes(hex)) found.push(hex);
    if (found.length === 3) break;
  }
  return found;
}

// ---- Department ---------------------------------------------------------------

const KIDS_PATTERNS = [
  /\b(kids?|kid['’]s|children['’]?s?|toddlers?|infants?|newborns?)\b/i,
  /\bboys?['’]?s?\b/i,
  /\bbaby (boys?|girls?)\b|\bfor (babies|baby|kids|boys|girls)\b|\bgirls?['’]?s?\s+(\d|age)/i,
  /\b\d{1,2}\s*-\s*\d{1,2}\s*(y|yrs?|years?|months?)\b|\bage[sd]?\s*\d{1,2}\b|\b\d{1,2}\s*(yrs?|years?)\s*old\b/i,
  /\b(kinder|enfants?|niños?|niñas?|bambini|bambine|crianças?|infantil)\b/i,
];
const KIDS_CJK = ['キッズ', 'ベビー', '子供', '키즈', '유아', '아동', '童装', '儿童'];

const WOMEN_PATTERN =
  /\b(women['’]?s?|womens|woman['’]?s?|ladies['’]?|lady['’]?s?|female|damen|femmes?|mujer(es)?|donna|donne|feminin[oa]|dames|damskie)\b/i;
const MEN_PATTERN = /\b(men['’]?s?|mens|male|gents|herren|hommes?|hombres?|uomo|uomini|masculin[oa]|heren|męskie)\b/i;
const WOMEN_CJK = ['レディース', '婦人', '여성', '여자', '女装', '女士'];
const MEN_CJK = ['メンズ', '紳士', '남성', '남자', '男装', '男士'];

/**
 * Department stated in the listing's text (marketplace category path first, then title).
 * 'kids' means the item is for children and must not be shown; null when the text doesn't say.
 * "Girls" on its own is often used for young women (e.g. "party dress for girls"), so it only
 * counts as kids' with an age or "for girls"; "boys" is reliably kids'.
 */
export function detectDepartment(...texts: (string | null | undefined)[]): Department | 'kids' | null {
  for (const text of texts) {
    if (!text) continue;
    if (KIDS_PATTERNS.some((p) => p.test(text)) || KIDS_CJK.some((w) => text.includes(w))) return 'kids';
    const women = WOMEN_PATTERN.test(text) || WOMEN_CJK.some((w) => text.includes(w));
    const men = MEN_PATTERN.test(text) || MEN_CJK.some((w) => text.includes(w));
    if (/\bunisex\b|ユニセックス|남녀공용/i.test(text) || (women && men)) return 'unisex';
    if (women) return 'women';
    if (men) return 'men';
  }
  return null;
}

// ---- Category ------------------------------------------------------------------

/** Words naming each category (English plus the main languages of the markets we serve); plurals match too. */
const CATEGORY_WORDS: [Category, RegExp][] = [
  [
    'Dresses',
    /\b(?:dress|gown|jumpsuit|romper|playsuit|saree|sari|lehenga|anarkali|kaftan|caftan|abaya|sundress|kleid|vestido|vestito|abito|jurk)(?:e?s)?\b|ワンピース|원피스|드레스/gi,
  ],
  [
    'Outerwear',
    /\b(?:jacket|coat|blazer|parka|puffer|trench|overcoat|windbreaker|gilet|waistcoat|shacket|cardigan|shrug|poncho|cape|bomber|anorak|sherwani|jacke|mantel|veste|manteau|chaqueta|abrigo|giacca|cappotto|jaqueta|casaco|jas)(?:e?s)?\b|ジャケット|コート|カーディガン|자켓|재킷|코트|가디건/gi,
  ],
  [
    'Tops',
    /\b(?:shirt|t-shirt|tshirt|tee|top|blouse|tank|camisole|cami|polo|sweater|jumper|pullover|hoodie|sweatshirt|kurta|kurti|tunic|bodysuit|turtleneck|henley|hemd|bluse|chemise|chemisier|pull|camisa|blusa|sudadera|camicia|maglia|maglione|felpa|camiseta|trui)(?:e?s)?\b|シャツ|ブラウス|ニット|パーカー|トップス|셔츠|블라우스|니트|후드|맨투맨|티셔츠/gi,
  ],
  [
    'Bottoms',
    /\b(?:jean|trouser|pant|chino|jogger|short|skirt|legging|culotte|palazzo|cargo|sweatpant|salwar|churidar|dhoti|pyjama|pajama|jegging|hose|jupe|pantalon|pantalone|falda|pantaloni|gonna|calça|saia|rok|broek)(?:e?s)?\b|パンツ|スカート|デニム|ジーンズ|바지|팬츠|스커트|청바지/gi,
  ],
  [
    'Shoes',
    /\b(?:shoe|sneaker|trainer|boot|sandal|heel|loafer|flat|slipper|flip-flop|flip flop|mule|pump|brogue|derby|espadrille|clog|jutti|mojari|kolhapuri|wedge|stiletto|schuhe|stiefel|chaussure|botte|basket|zapato|zapatilla|bota|scarpe|stivali|sapato|tênis|sandália|schoenen)(?:e?s)?\b|スニーカー|シューズ|ブーツ|サンダル|パンプス|운동화|스니커즈|부츠|샌들|구두|로퍼/gi,
  ],
  [
    'Bags',
    /\b(?:bag|handbag|tote|backpack|satchel|clutch|purse|crossbody|duffle|duffel|messenger|tasche|sac|bolso|mochila|borsa|zaino|bolsa)(?:e?s)?\b|バッグ|リュック|가방|백팩|토트/gi,
  ],
  [
    'Accessories',
    /\b(?:belt|hat|cap|beanie|scarf|scarves|stole|dupatta|sunglass|watch|necklace|earring|bracelet|ring|jewellery|jewelry|tie|bowtie|sock|glove|wallet|cufflink|brooch|bandana|gürtel|mütze|ceinture|chapeau|écharpe|cinturón|sombrero|bufanda|cintura|cappello|sciarpa|cinto|chapéu)(?:e?s)?\b|ベルト|帽子|キャップ|マフラー|財布|벨트|모자|캡|머플러|지갑/gi,
  ],
];

/** Listings that aren't wearable fashion items, whatever the search was. */
const NOT_FASHION_TITLE = [
  /\b(iphone|ipad|airpods|samsung galaxy)\b/i,
  /\b(phone|mobile|laptop|tablet)\s+(case|cover|pouch|sleeve|stand)\b/i,
  /\b(sticker|stickers|poster|figurine|plush|soft toy|mug|cushion|pillow|bedsheet|curtain|keychain|key chain|hanger|hangers|mannequin)\b/i,
  /\b(shoe polish|shoe cleaner|cleaning kit|insoles?|shoelaces|shoe laces|shoe trees?)\b/i,
  /\b(sewing pattern|pattern only|fabric by the|unstitched|dress material)\b/i,
  /\b(costume|cosplay|wig|nightwear|sleepwear|nightgown|nightdress|bathrobe|night suit|lingerie)\b/i,
  /\b(for (dogs?|cats?|pets?)|dog (coat|jacket|harness|sweater)|doll clothes|doll outfit|for dolls?|barbie)\b/i,
  /\b(lot of \d+|\d+ ?pc lot|bundle of \d+|wholesale|job lot|bulk lot)\b/i,
];
const NOT_FASHION_CATEGORY =
  /\b(cell phones?|mobile phones?|phones (&|and) telecommunications|consumer electronics|computers?|toys?|dolls?|pet supplies|home (&|and) (garden|kitchen)|home improvement|automotive|automobiles|tools|furniture|lights|beauty|health|books|movies|music|costumes?|sleepwear|intimates|underwear)\b/i;

/** True for listings that aren't clothing, shoes, bags or accessories (or are bulk lots). */
export function isNotFashion(title: string, categoryText: string | null = null): boolean {
  if (NOT_FASHION_TITLE.some((p) => p.test(title))) return true;
  return categoryText !== null && NOT_FASHION_CATEGORY.test(categoryText);
}

/** Category named last in the text (the head noun: "shirt dress" → Dresses, "dress shirt" → Tops). */
function headCategoryIn(text: string): Category | null {
  let best: { category: Category; end: number } | null = null;
  for (const [category, pattern] of CATEGORY_WORDS) {
    for (const match of text.matchAll(pattern)) {
      const end = (match.index ?? 0) + match[0].length;
      if (!best || end > best.end) best = { category, end };
    }
  }
  return best?.category ?? null;
}

/**
 * Category from the marketplace's category path (its last segment that names one wins),
 * else from the title's head noun; null when neither names one.
 */
export function classifyCategory(title: string, categoryText: string | null): Category | null {
  if (categoryText) {
    const segments = categoryText.split(/\s*[>|/›»]\s*/).filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const found = headCategoryIn(segments[i]);
      if (found) return found;
    }
  }
  // "Kurta with dupatta", "Dress & belt": the item is named before what comes with it.
  const main = title.split(/\s(?:with|w\/|incl\.?|including|plus|\+|&|and)\s/i)[0];
  return headCategoryIn(main) ?? headCategoryIn(title);
}

// ---- Style ---------------------------------------------------------------------

/** Descriptive words that point to a style, matched against the listing's own text. */
const STYLE_WORDS: Record<StyleArchetype, RegExp> = {
  Minimalist: /\b(minimal|minimalist|basic|basics|essential|essentials|plain|solid|clean[- ]cut|monochrome|capsule|structured|tailored)\b/i,
  Streetwear: /\b(oversized|graphic|streetwear|cargo|baggy|chunky|bucket hat|skate|hip[- ]?hop|utility|drop[- ]shoulder|puffer|logo)\b/i,
  Bohemian: /\b(boho|bohemian|paisley|fringe|fringed|crochet|embroidered|tassel|peasant|kaftan|tie[- ]dye|block print|bell sleeves?|tiered|macrame)\b/i,
  Vintage: /\b(vintage|retro|60s|70s|80s|90s|1960s|1970s|1980s|1990s|corduroy|polka dots?|mom jeans?|bowling|trucker)\b/i,
  Athleisure: /\b(athletic|sports?|running|gym|yoga|training|track|jogger|joggers|dri[- ]?fit|performance|activewear|workout|sweatpants|trainers|tennis)\b/i,
  Preppy: /\b(preppy|polo|oxford|cable[- ]knit|pleated|loafers?|chinos?|argyle|varsity|button[- ]down|boat shoes?|seersucker|collared)\b/i,
  Grunge: /\b(grunge|ripped|distressed|flannel|combat boots?|band tee|studded|fishnet|punk|goth|gothic|dr\.? martens|doc martens)\b/i,
  Cottagecore: /\b(cottagecore|puff sleeves?|prairie|gingham|lace(?![- ]up)|ruffled?|ruffles|smocked|milkmaid|peter pan|straw|eyelet|broderie)\b/i,
  'Dark Academia': /\b(tweed|wool blazer|turtleneck|houndstooth|trench|brogues?|satchel|sweater vest|waistcoat|oxford shoes?|plaid trousers|pleated trousers)\b/i,
  Y2K: /\b(y2k|baby tee|low[- ]rise|crop top|butterfly|rhinestones?|metallic|platform|mini skirt|velour|flared?|bootcut|glitter|holographic)\b/i,
};

/** Style archetypes the listing's own words point to (in STYLE_ARCHETYPES order). */
export function classifyStyles(...texts: (string | null | undefined)[]): StyleArchetype[] {
  const haystack = texts.filter((t): t is string => typeof t === 'string').join(' ');
  if (!haystack) return [];
  return STYLE_ARCHETYPES.filter((style) => STYLE_WORDS[style].test(haystack));
}
