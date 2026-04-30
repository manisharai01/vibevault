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

export interface ProfileQuestion {
  id: string;
  question: string;
  type: 'single' | 'multi' | 'slider';
  options?: { label: string; value: string; icon?: string }[];
  min?: number;
  max?: number;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar?: string;
  personalityTraits: PersonalityDimension[];
  musicGenres: MusicGenre[];
  mediaPreferences: MediaPreference[];
  styleArchetypes: StyleArchetype[];
  vibeScore: number; // 0-100
  level: number;
  xp: number;
  xpToNext: number;
  points: number;
  badges: Badge[];
  completedQuests: string[];
  wishlist: string[];
  joinedDate: string;
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

export type Platform = 'Depop' | 'Poshmark' | 'Vinted' | 'ThredUp' | 'Local Thrift';

export interface FashionItem {
  id: string;
  title: string;
  description: string;
  image: string;
  category: ItemCategory;
  styleArchetypes: StyleArchetype[];
  currentPrice: number;
  originalPrice: number;
  predictedPrice7d: number;
  predictedPrice30d: number;
  priceHistory: PricePoint[];
  condition: ItemCondition;
  size: string;
  brand: string;
  platform: Platform;
  sustainabilityScore: number; // 0-100
  co2Saved: number; // kg
  matchScore: number; // 0-100 relevance to user
  distance?: number; // km from user
  seller: string;
  listedDate: string;
  colors: string[];
}

export interface PricePoint {
  date: string;
  price: number;
}

export interface PriceAlert {
  id: string;
  itemId: string;
  targetPrice: number;
  currentPrice: number;
  active: boolean;
  createdAt: string;
}

// ---- Gamification ----

export type QuestDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Epic';
export type QuestStatus = 'available' | 'in-progress' | 'completed' | 'expired';

export interface Quest {
  id: string;
  title: string;
  description: string;
  type: 'mood-board' | 'styling-challenge' | 'thrift-hunt' | 'sustainability' | 'community';
  difficulty: QuestDifficulty;
  xpReward: number;
  pointsReward: number;
  badgeReward?: string;
  status: QuestStatus;
  progress: number; // 0-100
  totalSteps: number;
  completedSteps: number;
  deadline?: string;
  city?: string;
  requirements: string[];
  icon: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedDate?: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  avatar?: string;
  points: number;
  level: number;
  styleArchetype: StyleArchetype;
}

// ---- Sustainability ----

export interface SustainabilityMetrics {
  totalCO2Saved: number;
  itemsThrifted: number;
  fastFashionAvoided: number;
  moneysSaved: number;
  treesEquivalent: number;
}

// ---- Navigation ----

export type RootTabParamList = {
  Discover: undefined;
  Profiler: undefined;
  Prices: undefined;
  Quests: undefined;
  Profile: undefined;
};
