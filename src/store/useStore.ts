// ============================================================
// VibeVault – Global State Store (Zustand)
// ============================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  UserProfile,
  FashionItem,
  PriceAlert,
  Quest,
  Badge,
  StyleArchetype,
  PersonalityDimension,
  MusicGenre,
  MediaPreference,
  LeaderboardEntry,
  SustainabilityMetrics,
} from '../types';
import { MOCK_ITEMS, MOCK_QUESTS, MOCK_BADGES, MOCK_LEADERBOARD } from '../data/mockData';
import { getRecommendations, getTopStyles, computeStyleScores, generateVibeSummary } from '../services/styleEngine';
import { LEVEL_THRESHOLDS } from '../constants/theme';

interface AppState {
  // ---- User ----
  profile: UserProfile;
  isProfileComplete: boolean;
  vibeSummary: string;

  // ---- Fashion ----
  allItems: FashionItem[];
  recommendedItems: FashionItem[];
  wishlistItems: FashionItem[];

  // ---- Price Alerts ----
  priceAlerts: PriceAlert[];

  // ---- Gamification ----
  quests: Quest[];
  badges: Badge[];
  leaderboard: LeaderboardEntry[];
  sustainability: SustainabilityMetrics;

  // ---- Actions ----
  completeProfile: (
    personality: PersonalityDimension[],
    music: MusicGenre[],
    media: MediaPreference[],
    answers: Record<string, string>,
  ) => void;
  refreshRecommendations: () => void;
  toggleWishlist: (itemId: string) => void;
  addPriceAlert: (alert: PriceAlert) => void;
  removePriceAlert: (alertId: string) => void;
  startQuest: (questId: string) => void;
  progressQuest: (questId: string) => void;
  completeQuest: (questId: string) => void;
  addXP: (amount: number) => void;
  addPoints: (amount: number) => void;
}

const DEFAULT_PROFILE: UserProfile = {
  id: 'user-001',
  name: 'VibeVault User',
  personalityTraits: [],
  musicGenres: [],
  mediaPreferences: [],
  styleArchetypes: [],
  vibeScore: 0,
  level: 1,
  xp: 0,
  xpToNext: 100,
  points: 0,
  badges: [],
  completedQuests: [],
  wishlist: [],
  joinedDate: '2026-02-01',
};

export const useStore = create<AppState>()(persist((set, get) => ({
  // ---- Initial state ----
  profile: DEFAULT_PROFILE,
  isProfileComplete: false,
  vibeSummary: '',
  allItems: MOCK_ITEMS,
  recommendedItems: MOCK_ITEMS,
  wishlistItems: [],
  priceAlerts: [],
  quests: MOCK_QUESTS,
  badges: MOCK_BADGES,
  leaderboard: MOCK_LEADERBOARD,
  sustainability: {
    totalCO2Saved: 0,
    itemsThrifted: 0,
    fastFashionAvoided: 0,
    moneysSaved: 0,
    treesEquivalent: 0,
  },

  // ---- Actions ----

  completeProfile: (personality, music, media, answers) => {
    const topStyles = getTopStyles(personality, music, media, 3);
    const vibeSummary = generateVibeSummary(topStyles);
    const styleScores = computeStyleScores(personality, music, media);
    const vibeScore = styleScores.length > 0 ? styleScores[0][1] : 50;

    set((state) => {
      const profile: UserProfile = {
        ...state.profile,
        personalityTraits: personality,
        musicGenres: music,
        mediaPreferences: media,
        styleArchetypes: topStyles,
        vibeScore,
      };

      const recommendedItems = getRecommendations(state.allItems, profile);

      return {
        profile,
        isProfileComplete: true,
        vibeSummary,
        recommendedItems,
      };
    });
  },

  refreshRecommendations: () => {
    const { allItems, profile } = get();
    const recommendedItems = getRecommendations(allItems, profile);
    set({ recommendedItems });
  },

  toggleWishlist: (itemId: string) => {
    set((state) => {
      const isInWishlist = state.profile.wishlist.includes(itemId);
      const wishlist = isInWishlist
        ? state.profile.wishlist.filter((id) => id !== itemId)
        : [...state.profile.wishlist, itemId];

      const wishlistItems = state.allItems.filter((i) => wishlist.includes(i.id));

      return {
        profile: { ...state.profile, wishlist },
        wishlistItems,
      };
    });
  },

  addPriceAlert: (alert: PriceAlert) => {
    set((state) => ({ priceAlerts: [...state.priceAlerts, alert] }));
  },

  removePriceAlert: (alertId: string) => {
    set((state) => ({
      priceAlerts: state.priceAlerts.filter((a) => a.id !== alertId),
    }));
  },

  startQuest: (questId: string) => {
    set((state) => ({
      quests: state.quests.map((q) =>
        q.id === questId ? { ...q, status: 'in-progress' as const } : q,
      ),
    }));
  },

  progressQuest: (questId: string) => {
    set((state) => ({
      quests: state.quests.map((q) => {
        if (q.id !== questId || q.status !== 'in-progress') return q;
        const completedSteps = Math.min(q.completedSteps + 1, q.totalSteps);
        const progress = Math.round((completedSteps / q.totalSteps) * 100);
        const status = completedSteps >= q.totalSteps ? 'completed' as const : 'in-progress' as const;
        return { ...q, completedSteps, progress, status };
      }),
    }));
  },

  completeQuest: (questId: string) => {
    const quest = get().quests.find((q) => q.id === questId);
    if (!quest) return;

    set((state) => {
      const quests = state.quests.map((q) =>
        q.id === questId ? { ...q, status: 'completed' as const, progress: 100, completedSteps: q.totalSteps } : q,
      );

      const completedQuests = [...state.profile.completedQuests, questId];
      let badges = [...state.profile.badges];
      if (quest.badgeReward) {
        const badge = state.badges.find((b) => b.name === quest.badgeReward);
        if (badge && !badges.find((b) => b.id === badge.id)) {
          badges.push({ ...badge, earnedDate: new Date().toISOString().split('T')[0] });
        }
      }

      return {
        quests,
        profile: { ...state.profile, completedQuests, badges },
        sustainability: {
          ...state.sustainability,
          itemsThrifted: state.sustainability.itemsThrifted + 1,
          fastFashionAvoided: state.sustainability.fastFashionAvoided + 1,
          totalCO2Saved: Math.round((state.sustainability.totalCO2Saved + 2.8) * 10) / 10,
          moneysSaved: Math.round((state.sustainability.moneysSaved + 18) * 100) / 100,
          treesEquivalent: Math.round(((state.sustainability.totalCO2Saved + 2.8) / 21) * 100) / 100,
        },
      };
    });

    get().addXP(quest.xpReward);
    get().addPoints(quest.pointsReward);
  },

  addXP: (amount: number) => {
    set((state) => {
      let xp = state.profile.xp + amount;
      let level = state.profile.level;
      let xpToNext = state.profile.xpToNext;

      // Level up logic
      while (level < LEVEL_THRESHOLDS.length && xp >= xpToNext) {
        xp -= xpToNext;
        level += 1;
        xpToNext = (LEVEL_THRESHOLDS[level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]) - (LEVEL_THRESHOLDS[level - 1] || 0);
      }

      return { profile: { ...state.profile, xp, level, xpToNext } };
    });
  },

  addPoints: (amount: number) => {
    set((state) => ({
      profile: { ...state.profile, points: state.profile.points + amount },
    }));
  },
}), {
  name: 'vibevault-store-v1',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (state) => ({
    profile: state.profile,
    isProfileComplete: state.isProfileComplete,
    vibeSummary: state.vibeSummary,
    allItems: state.allItems,
    recommendedItems: state.recommendedItems,
    wishlistItems: state.wishlistItems,
    priceAlerts: state.priceAlerts,
    quests: state.quests,
    sustainability: state.sustainability,
  }),
}));
