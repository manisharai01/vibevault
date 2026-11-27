// ============================================================
// VibeVault – Core Type Definitions
// ============================================================

// ---- Style profile ----

export type StyleArchetype =
  | 'Minimalist'
  | 'Streetwear'
  | 'Bohemian'
  | 'Vintage'
  | 'Athleisure'
  | 'Preppy'
  | 'Grunge'
  | 'Cottagecore'
  | 'Dark Academia'
  | 'Y2K';

/** Store sections the user wants to be styled from. */
export type ShopFor = 'women' | 'men' | 'all';

/** Personality traits measured by the Style Profiler, each from -1 to 1. */
export type Trait = 'expressive' | 'novelty' | 'polish' | 'warmth' | 'edge' | 'comfort';
export type TraitScores = Partial<Record<Trait, number>>;

export type ColorFamily =
  | 'black'
  | 'white'
  | 'grey'
  | 'neutral'
  | 'brown'
  | 'navy'
  | 'blue'
  | 'green'
  | 'red'
  | 'pink'
  | 'purple'
  | 'yellow'
  | 'metallic';

export type Occasion = 'work' | 'everyday' | 'evening' | 'festive' | 'active' | 'outdoors';
export type FitPreference = 'fitted' | 'regular' | 'relaxed' | 'oversized';

export interface ProfileQuestion {
  id: string;
  question: string;
  help?: string;
  type: 'single' | 'multi' | 'slider' | 'country' | 'colors' | 'budget' | 'taste';
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
  minLabel?: string;
  maxLabel?: string;
  /** Multi-select questions may be skipped (no selection). */
  optional?: boolean;
}

/** Raw answers captured by the Style Profiler, keyed by question id. */
export type ProfilerAnswers = Record<string, string | string[] | number | null>;

/** Normalised (0–100) affinity per style archetype. */
export type StyleScores = Partial<Record<StyleArchetype, number>>;

/** A real listing the user rated during the taste check (stored with what the rating says). */
export interface TasteRating {
  itemId: string;
  liked: boolean;
  archetypes: StyleArchetype[];
  colors: ColorFamily[];
  category: ItemCategory;
}

/** One factor that contributed to a style score, for "why you got this" explanations. */
export interface StyleReason {
  archetype: StyleArchetype;
  text: string;
}

export interface UserProfile {
  id: string;
  name: string;
  /** Shopper country (ISO 3166-1 alpha-2); null until chosen. */
  country: string | null;
  /** Currency for budgets, totals and conversions (ISO 4217). */
  currency: string;
  shopFor: ShopFor | null;
  traits: TraitScores;
  likedColors: ColorFamily[];
  avoidColors: ColorFamily[];
  fit: FitPreference | null;
  occasions: Occasion[];
  /** Usual maximum per piece, in `currency`; null = no limit. */
  budgetMax: number | null;
  tasteRatings: TasteRating[];
  /** Top archetypes, strongest first. */
  styleArchetypes: StyleArchetype[];
  styleScores: StyleScores;
  styleReasons: StyleReason[];
  vibeScore: number; // 0-100
  sustainabilityPriority: number; // 0-100
  profilerAnswers: ProfilerAnswers;
  /** Version of the profiler the answers came from (older profiles are asked to update). */
  profilerVersion: number;
  /** Lifetime XP; level is derived from it. */
  totalXP: number;
  points: number;
  /** badgeId -> date earned (YYYY-MM-DD) */
  earnedBadges: Record<string, string>;
  completedQuests: string[];
  /** Wishlisted item ids, most recently saved first. */
  wishlist: string[];
  joinedDate: string; // YYYY-MM-DD
}

// ---- Listings ----

/** 'New with tags' = new; the others are pre-owned grades ('Pre-owned' = not graded by the marketplace). */
export type ItemCondition = 'New with tags' | 'Like new' | 'Good' | 'Fair' | 'Well-loved' | 'Pre-owned';

export type ItemCategory = 'Tops' | 'Bottoms' | 'Dresses' | 'Outerwear' | 'Shoes' | 'Accessories' | 'Bags';

export type Department = 'women' | 'men' | 'unisex';

export interface PricePoint {
  date: string; // YYYY-MM-DD
  price: number;
}

/** Statistics over every price VibeVault has recorded (or imported) for a listing. */
export interface PriceStats {
  days: number;
  since: string; // YYYY-MM-DD
  lowest: number;
  lowestOn: string; // YYYY-MM-DD
  highest: number;
  median: number;
}

export type PredictionHorizon = 7 | 14 | 30;
export type Verdict = 'wait' | 'buy' | 'unclear';
/** What the estimate rests on, most specific first. */
export type PredictionBasis = 'listing' | 'category' | 'marketplace' | 'situation' | 'all';

export interface HorizonPrediction {
  /** Chance the price is at least 5% lower at some point in the window, while still for sale. */
  pDrop: number;
  /** Chance the listing sells out / is removed before getting cheaper. */
  pGone: number;
  /** Typical lowest price over the window, in the listing's currency. */
  expectedLow: number;
  basis: PredictionBasis;
  /** How many tracked listings the estimate is based on. */
  basisListings: number;
  verdict: Verdict;
}

/**
 * How prices move through the year, learnt from recorded and archived price history
 * (see compute_seasonality in supabase/migrations). Most specific available basis wins.
 */
export interface SeasonProfile {
  /** This listing's own history, its category on this marketplace in this country, or the whole marketplace there. */
  basis: 'listing' | 'category' | 'marketplace';
  /** How many listings' histories the pattern combines (1 for a listing's own). */
  listings: number;
  /** Years of price history behind it (median across those listings). */
  years: number;
  /**
   * Typical price in each calendar month relative to the yearly typical price (1 = typical,
   * 0.85 = 15% cheaper); null where there wasn't enough data. Index 0 = January.
   */
  months: (number | null)[];
}

/** Published by the backend's price model (see supabase/migrations). */
export interface Prediction {
  madeOn: string; // YYYY-MM-DD
  /** Price the prediction was made for. */
  price: number;
  horizons: Partial<Record<PredictionHorizon, HorizonPrediction>>;
}

/** A live marketplace listing. Prices come from the marketplace; nothing is simulated. */
export interface FashionItem {
  id: string; // `${source}:${market}:${marketplace item id}`
  /** Marketplace id, e.g. "ebay". */
  source: string;
  /** Marketplace name, e.g. "eBay". */
  platform: string;
  /** Site for this market, e.g. "Amazon.in". */
  siteName: string;
  /** Shopper country the price and delivery apply to (ISO 3166-1 alpha-2). */
  market: string;
  title: string;
  description: string | null;
  image: string | null;
  category: ItemCategory;
  department: Department;
  styleArchetypes: StyleArchetype[];
  brand: string | null;
  condition: ItemCondition;
  size: string | null;
  colors: string[];
  seller: string | null;
  productUrl: string;
  currency: string; // ISO 4217
  currentPrice: number;
  /** List price / MRP when the marketplace reports one above the current price. */
  originalPrice: number | null;
  /** Recorded daily prices over the last 30 days (oldest first). */
  priceHistory: PricePoint[];
  stats: PriceStats | null;
  /** The model's latest prediction for this listing; null while it is still learning. */
  prediction: Prediction | null;
  /** How its price usually moves through the year; null until there is a year of history behind it. */
  season: SeasonProfile | null;
  /** Pre-owned listing (vs. new retail). */
  secondhand: boolean;
  /** 0-100 relevance to the user (0 until the Style Profile is complete). */
  matchScore: number;
  /** Why it matches the user, strongest first. */
  matchReasons: string[];
  available: boolean;
  /** Why it stopped being available: sold/removed ('gone') or no longer confirmed ('stale'). */
  endReason: 'gone' | 'stale' | null;
  listedDate: string | null; // YYYY-MM-DD
  firstSeen: string; // YYYY-MM-DD, when VibeVault started tracking it
  lastChecked: string; // ISO timestamp of the latest price check
}

export interface MarketplaceStatus {
  source: string;
  name: string;
  attribution: string | null;
  lastSuccessAt: string | null;
  availableListings: number;
  markets: string[];
}

/** A coupon or offer from an official merchant / affiliate-network feed. */
export interface Offer {
  id: string;
  network: string;
  market: string;
  merchant: string;
  merchantDomain: string | null;
  /** Marketplace id when the store is one of VibeVault's marketplaces. */
  source: string | null;
  /** Set when the marketplace attached the promo to one listing. */
  listingId: string | null;
  title: string;
  description: string | null;
  code: string | null;
  url: string;
  discountText: string | null;
  minSpend: number | null;
  currency: string | null;
  startsAt: string | null; // ISO
  endsAt: string | null; // ISO
  /** Last time the network's feed still listed it (ISO). */
  lastSeenAt: string;
}

/** How the model's published predictions turned out. */
export interface TrackRecord {
  horizon: PredictionHorizon;
  /** null = all marketplaces. */
  source: string | null;
  resolved: number;
  dropped: number;
  brier: number | null;
  brierBaseRate: number | null;
  waitCalls: number;
  waitCorrect: number;
  buyCalls: number;
  buyCorrect: number;
  since: string | null;
}

export interface CalibrationBucket {
  horizon: PredictionHorizon;
  bucket: number; // 1..5 (0–20% … 80–100%)
  resolved: number;
  predicted: number;
  observed: number;
}

export type PriceAlertStatus = 'active' | 'triggered';

export interface PriceAlert {
  id: string;
  itemId: string;
  currency: string;
  targetPrice: number;
  priceAtCreation: number;
  createdAt: string; // ISO timestamp
  status: PriceAlertStatus;
  triggeredAt?: string; // ISO timestamp
  triggeredPrice?: number;
  /** Whether the user has seen a triggered alert in the Alerts list. */
  acknowledged: boolean;
}

/** Wardrobe slots the Stylist plans (one category each). */
export type WardrobeSlot = 'top' | 'bottom' | 'dress' | 'layer' | 'shoes' | 'bag' | 'accessory';

/** A piece the user already owns, so the wardrobe plan doesn't suggest buying it again. */
export interface OwnedPiece {
  id: string;
  slot: WardrobeSlot;
  title: string;
  colors: ColorFamily[];
  /** The listing it came from (bought through VibeVault or marked "I own one like this"). */
  itemId: string | null;
  image: string | null;
  addedAt: string; // ISO timestamp
}

export interface Purchase {
  id: string;
  itemId: string;
  title: string;
  platform: string;
  currency: string;
  pricePaid: number;
  originalPrice: number | null;
  /** The user's currency at purchase time and the amounts converted into it (null if no rate). */
  homeCurrency: string;
  paidInHome: number | null;
  savedInHome: number | null;
  /** Pre-owned purchase (counts towards second-hand impact). */
  secondhand: boolean;
  purchasedAt: string; // ISO timestamp
}

export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unconfigured';

// ---- Gamification ----

export type QuestDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Epic';
export type QuestStatus = 'available' | 'in-progress' | 'completed' | 'expired';
export type QuestType = 'mood-board' | 'styling-challenge' | 'thrift-hunt' | 'sustainability' | 'community';

/** Shortcut offered on a quest's detail screen. */
export type QuestHelperAction = 'find-thrift-stores' | 'open-composer' | 'open-deals' | 'open-profiler';

export interface QuestDefinition {
  id: string;
  title: string;
  description: string;
  type: QuestType;
  difficulty: QuestDifficulty;
  xpReward: number;
  pointsReward: number;
  badgeId?: string;
  /** One entry per step; the quest has steps.length steps. */
  steps: string[];
  /** Time limit once started, in days. */
  durationDays?: number;
  helperAction?: QuestHelperAction;
  icon: string;
}

/** Persisted per-quest progress (absent = available). */
export interface QuestProgress {
  status: Exclude<QuestStatus, 'available'>;
  completedSteps: number;
  startedAt: string; // ISO timestamp
  deadline?: string; // ISO timestamp
  completedAt?: string; // ISO timestamp
}

/** A quest definition merged with the user's progress. */
export interface Quest extends QuestDefinition {
  status: QuestStatus;
  progress: number; // 0-100
  totalSteps: number;
  completedSteps: number;
  startedAt?: string;
  deadline?: string;
  completedAt?: string;
}

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: BadgeRarity;
}

export interface StreakState {
  lastActiveDate: string | null; // YYYY-MM-DD
  current: number;
  longest: number;
}

// ---- Sustainability ----

/** Facts from the purchases the user logged (no estimates). */
export interface SustainabilityMetrics {
  /** Purchases logged. */
  purchases: number;
  /** Pre-owned purchases logged: garments kept in use instead of new ones being made. */
  itemsThrifted: number;
  /** Savings versus the listings' list/MRP prices, in the user's currency (where a rate was known). */
  moneySaved: number;
  currency: string;
}
