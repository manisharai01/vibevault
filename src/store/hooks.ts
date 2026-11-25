// ============================================================
// VibeVault – Derived-state hooks
// Selectors return stable slices; anything computed is memoised
// so components only re-render when their inputs change.
// ============================================================

import { useMemo } from 'react';
import { QUEST_DEFINITIONS } from '../data/mockData';
import {
  buildLeaderboard,
  computeSustainability,
  getLevelInfo,
  LevelInfo,
  mergeQuest,
} from '../services/gamification';
import { FashionItem, LeaderboardEntry, PriceAlert, Quest, SustainabilityMetrics } from '../types';
import { useStore } from './useStore';

export function useItem(itemId: string | undefined): FashionItem | undefined {
  return useStore((s) => (itemId ? s.recommendedItems.find((item) => item.id === itemId) : undefined));
}

export function useWishlistItems(): FashionItem[] {
  const wishlist = useStore((s) => s.profile.wishlist);
  const items = useStore((s) => s.recommendedItems);
  return useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    return wishlist.map((id) => byId.get(id)).filter((item): item is FashionItem => item !== undefined);
  }, [wishlist, items]);
}

export function useQuests(): Quest[] {
  const progress = useStore((s) => s.questProgress);
  return useMemo(() => QUEST_DEFINITIONS.map((definition) => mergeQuest(definition, progress[definition.id])), [progress]);
}

export function useQuest(questId: string | undefined): Quest | undefined {
  const progress = useStore((s) => (questId ? s.questProgress[questId] : undefined));
  return useMemo(() => {
    const definition = QUEST_DEFINITIONS.find((q) => q.id === questId);
    return definition ? mergeQuest(definition, progress) : undefined;
  }, [questId, progress]);
}

export function useLevelInfo(): LevelInfo {
  const totalXP = useStore((s) => s.profile.totalXP);
  return useMemo(() => getLevelInfo(totalXP), [totalXP]);
}

export function useSustainability(): SustainabilityMetrics {
  const purchases = useStore((s) => s.purchases);
  return useMemo(() => computeSustainability(purchases), [purchases]);
}

export function useLeaderboard(): LeaderboardEntry[] {
  const name = useStore((s) => s.profile.name);
  const points = useStore((s) => s.profile.points);
  const totalXP = useStore((s) => s.profile.totalXP);
  const topStyle = useStore((s) => s.profile.styleArchetypes[0] ?? null);
  return useMemo(
    () => buildLeaderboard({ name, points, level: getLevelInfo(totalXP).level, styleArchetype: topStyle }),
    [name, points, totalXP, topStyle],
  );
}

export function useUnseenTriggeredAlertCount(): number {
  return useStore((s) => s.priceAlerts.reduce((count, a) => (a.status === 'triggered' && !a.acknowledged ? count + 1 : count), 0));
}

export function useActiveAlertForItem(itemId: string | undefined): PriceAlert | undefined {
  return useStore((s) => s.priceAlerts.find((a) => a.itemId === itemId && a.status === 'active'));
}

export function useIsPurchased(itemId: string | undefined): boolean {
  return useStore((s) => s.purchases.some((p) => p.itemId === itemId));
}

export function useIsWishlisted(itemId: string | undefined): boolean {
  return useStore((s) => (itemId ? s.profile.wishlist.includes(itemId) : false));
}
