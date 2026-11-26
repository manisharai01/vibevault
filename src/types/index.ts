// ============================================================
// VibeVault – Core Type Definitions
// ============================================================

// ---- Personality / Style Profiler ----

export type PersonalityDimension =
  | 'introvert'
  | 'extrovert'
  | 'analytical'
  | 'creative'
  | 'traditional'
  | 'avant-garde';

export type MusicGenre =
  | 'pop'
  | 'rock'
  | 'hip-hop'
  | 'jazz'
  | 'electronic'
  | 'classical'
  | 'indie'
  | 'r&b'
  | 'country'
  | 'metal';

export type MediaPreference =
  | 'action'
  | 'romance'
  | 'sci-fi'
  | 'documentary'
  | 'anime'
  | 'comedy'
  | 'thriller'
  | 'drama';

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

export type BudgetTier = 'budget-low' | 'budget-mid' | 'budget-high' | 'budget-premium';

export interface ProfileQuestion {
  id: string;
  question: string;
  type: 'single' | 'multi' | 'slider';
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
  minLabel?: string;
  maxLabel?: string;
}

/** Raw answers captured by the Style Profiler, keyed by question id. */
export type ProfilerAnswers = Record<string, string | string[] | number>;

/** Normalised (0–100) affinity per style archetype. */
export type StyleScores = Partial<Record<StyleArchetype, number>>;

export interface UserProfile {
  id: string;
  name: string;
  personalityTraits: PersonalityDimension[];
  musicGenres: MusicGenre[];
  mediaPreferences: MediaPreference[];
  /** Top archetypes, strongest first. */
  styleArchetypes: StyleArchetype[];
  styleScores: StyleScores;
  vibeScore: number; // 0-100
  budgetTier: BudgetTier | null;
  sustainabilityPriority: number; // 0-100
  profilerAnswers: ProfilerAnswers;
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

// ---- Fashion Items ----

export type ItemCondition = 'New with tags' | 'Like new' | 'Good' | 'Fair' | 'Well-loved';

export type ItemCategory =
  | 'Tops'
  | 'Bottoms'
  | 'Dresses'
  | 'Outerwear'
  | 'Shoes'
  | 'Accessories'
  | 'Bags';

/** Marketplaces with live prices (official APIs, via the VibeVault backend). */
export type ListingSource = 'flipkart' | 'ebay';
export type Platform = 'Flipkart' | 'eBay';

/** India: sold in India. Global: international listings that ship to India. */
export type Region = 'India' | 'Global';

export interface PricePoint {
  date: string; // YYYY-MM-DD
  price: number;
}

/** A live marketplace listing. Prices come from the marketplace; nothing is simulated. */
export interface FashionItem {
  id: string; // `${source}:${marketplace item id}`
  source: ListingSource;
  platform: Platform;
  title: string;
  description: string | null;
  image: string | null;
  category: ItemCategory;
  styleArchetypes: StyleArchetype[];
  brand: string | null;
  condition: ItemCondition;
  size: string | null;
  colors: string[];
  seller: string | null;
  region: Region;
  productUrl: string;
  currency: string; // ISO 4217, e.g. INR, USD
  currentPrice: number;
  /** Retail price / MRP when the marketplace reports one above the current price. */
  originalPrice: number | null;
  /** Rupees per one unit of `currency` (1 for INR); null until an exchange rate is known. */
  inrRate: number | null;
  /** Recorded daily prices (oldest first). */
  priceHistory: PricePoint[];
  /** Forecasts from the recorded history; null until there is enough of it. */
  predictedPrice7d: number | null;
  predictedPrice30d: number | null;
  /** Pre-owned marketplace listing (vs. new retail). */
  secondhand: boolean;
  sustainabilityScore: number; // 0-100 (estimate)
  co2Saved: number; // kg (estimate)
  /** 0-100 relevance to the user (0 until the Style Profile is complete). */
  matchScore: number;
  available: boolean;
  listedDate: string | null; // YYYY-MM-DD
  firstSeen: string; // YYYY-MM-DD, when VibeVault started tracking it
  lastChecked: string; // ISO timestamp of the latest price check
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

export interface Purchase {
  id: string;
  itemId: string;
  title: string;
  platform: Platform;
  currency: string;
  pricePaid: number;
  originalPrice: number | null;
  /** Exchange rate to INR at purchase time (null if unknown). */
  inrRate: number | null;
  /** Pre-owned purchase (counts towards eco impact). */
  secondhand: boolean;
  co2Saved: number;
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

export interface SustainabilityMetrics {
  totalCO2Saved: number;
  /** Pre-owned purchases logged. */
  itemsThrifted: number;
  waterSavedLiters: number;
  /** Savings versus retail price, in rupees (purchases with a known exchange rate). */
  moneySavedInr: number;
  treesEquivalent: number;
}
