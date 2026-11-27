// ============================================================
// VibeVault – Game content: badges and quests.
// These are app design (rules and copy), not marketplace data.
// ============================================================

import { Badge, QuestDefinition } from '../types';

// ---- Badges ----

export const BADGES: Badge[] = [
  { id: 'badge-001', name: 'First Find', description: 'Complete your Style Profile to unlock your first matches.', icon: 'sparkles-outline', rarity: 'common' },
  { id: 'badge-002', name: 'Eco Warrior', description: 'Complete the Sustainable Week Challenge.', icon: 'leaf-outline', rarity: 'rare' },
  { id: 'badge-003', name: 'Style Chameleon', description: 'Complete the Style Remix Challenge.', icon: 'color-palette-outline', rarity: 'rare' },
  { id: 'badge-004', name: 'Treasure Hunter', description: 'Complete the Hidden Gems Explorer quest.', icon: 'diamond-outline', rarity: 'epic' },
  { id: 'badge-005', name: 'Deal Detective', description: 'Complete the Budget Detective quest.', icon: 'search-outline', rarity: 'epic' },
  { id: 'badge-006', name: 'Community Champion', description: 'Complete the Community Swap Organizer quest.', icon: 'people-outline', rarity: 'legendary' },
  { id: 'badge-007', name: 'Capsule Master', description: 'Complete the Capsule Wardrobe Challenge.', icon: 'briefcase-outline', rarity: 'legendary' },
  { id: 'badge-008', name: 'Vintage Scholar', description: 'Complete the Vintage Story Teller quest.', icon: 'book-outline', rarity: 'rare' },
  { id: 'badge-009', name: 'Price Prophet', description: 'Have one of your price alerts hit its target.', icon: 'trending-down-outline', rarity: 'epic' },
  { id: 'badge-010', name: 'Thrift Streak', description: 'Open VibeVault 7 days in a row.', icon: 'flame-outline', rarity: 'common' },
];

export const BADGE_IDS = {
  firstFind: 'badge-001',
  priceProphet: 'badge-009',
  thriftStreak: 'badge-010',
} as const;

export const STREAK_BADGE_DAYS = 7;

// ---- Quests ----

export const QUEST_DEFINITIONS: QuestDefinition[] = [
  {
    id: 'quest-001',
    title: 'Build Your Vibe Board',
    description: 'Curate a mood board of thrift finds that captures your style archetype, then turn it into a complete look.',
    type: 'mood-board',
    difficulty: 'Easy',
    xpReward: 50,
    pointsReward: 100,
    steps: [
      'Complete your Style Profile',
      'Save 5 items that match your vibe to your wishlist',
      'Include at least 2 different categories',
      'Build a look with the Stylist',
      'Share your look with a friend',
    ],
    helperAction: 'open-composer',
    icon: 'color-palette-outline',
  },
  {
    id: 'quest-002',
    title: 'Sustainable Week Challenge',
    description: 'Go an entire week buying only second-hand. Log your thrift purchases in VibeVault and earn eco-warrior status.',
    type: 'sustainability',
    difficulty: 'Medium',
    xpReward: 150,
    pointsReward: 300,
    badgeId: 'badge-002',
    durationDays: 7,
    steps: [
      'Day 1 – buy nothing new',
      'Day 2 – repair or restyle something you own',
      'Day 3 – log your first second-hand purchase',
      'Day 4 – donate or swap one item',
      'Day 5 – log a second second-hand purchase',
      'Day 6 – wash cold and air-dry a load',
      'Day 7 – log a third second-hand purchase',
    ],
    icon: 'leaf-outline',
  },
  {
    id: 'quest-003',
    title: 'Style Remix Challenge',
    description: 'Take one thrifted piece and style it three different ways to prove how versatile second-hand can be.',
    type: 'styling-challenge',
    difficulty: 'Medium',
    xpReward: 120,
    pointsReward: 250,
    badgeId: 'badge-003',
    steps: [
      'Choose one thrifted piece to remix',
      'Style it in 3 different outfits',
      'Share your favourite outfit with friends',
    ],
    icon: 'shirt-outline',
  },
  {
    id: 'quest-004',
    title: 'Hidden Gems Explorer',
    description: 'Visit three local thrift stores and find at least one item at each. Use the store finder to plan your route.',
    type: 'thrift-hunt',
    difficulty: 'Hard',
    xpReward: 200,
    pointsReward: 500,
    badgeId: 'badge-004',
    steps: [
      'Visit thrift store #1 and find an item',
      'Visit thrift store #2 and find an item',
      'Visit thrift store #3 and find an item',
    ],
    helperAction: 'find-thrift-stores',
    icon: 'map-outline',
  },
  {
    id: 'quest-005',
    title: 'Community Swap Organizer',
    description: 'Organize or join a clothing swap. Connect with friends and exchange fashion finds instead of buying new.',
    type: 'community',
    difficulty: 'Epic',
    xpReward: 350,
    pointsReward: 800,
    badgeId: 'badge-006',
    steps: [
      'Create or join a clothing swap event',
      'Invite 3 friends',
      'Bring at least 2 items to swap',
      'Swap at least 2 items',
      'Rate the experience',
    ],
    icon: 'people-outline',
  },
  {
    id: 'quest-006',
    title: 'Budget Detective',
    description: 'Use VibeVault price alerts to track deals and buy at your target price. Master the art of deal hunting!',
    type: 'thrift-hunt',
    difficulty: 'Easy',
    xpReward: 80,
    pointsReward: 150,
    badgeId: 'badge-005',
    steps: [
      'Set your first price alert',
      'Track 5 items with price alerts',
      'Wait for a price drop',
      'Compare the deal across platforms',
      'Buy one item at your target price',
    ],
    helperAction: 'open-deals',
    icon: 'search-outline',
  },
  {
    id: 'quest-007',
    title: 'Capsule Wardrobe Challenge',
    description: 'Build a 10-piece capsule wardrobe entirely from thrifted items and mix it into at least 15 outfits.',
    type: 'styling-challenge',
    difficulty: 'Epic',
    xpReward: 400,
    pointsReward: 1000,
    badgeId: 'badge-007',
    steps: [
      'Plan your capsule colour palette',
      'Thrift a versatile top',
      'Thrift a second top',
      'Thrift a pair of bottoms',
      'Thrift a second pair of bottoms',
      'Thrift a layering piece',
      'Thrift a pair of shoes',
      'Add one accessory',
      'Create 15 outfit combinations',
      'Stay within your budget',
    ],
    icon: 'briefcase-outline',
  },
  {
    id: 'quest-008',
    title: 'Vintage Story Teller',
    description: 'Research the history behind three vintage items in your wardrobe and share their stories.',
    type: 'community',
    difficulty: 'Medium',
    xpReward: 100,
    pointsReward: 200,
    badgeId: 'badge-008',
    steps: [
      'Research the history of 3 vintage items',
      'Write a short story for each',
      'Share the stories with friends',
    ],
    icon: 'book-outline',
  },
];
