// ============================================================
// VibeVault – Derived-state hooks
// Selectors return stable slices; anything computed is memoised
// so components only re-render when their inputs change.
// ============================================================

import { useMemo } from 'react';
import { matchesShopFor } from '../constants/marketplaces';
import { QUEST_DEFINITIONS } from '../data/content';
import { BuyTiming, getBuyTiming } from '../services/buyTiming';
import { computeSustainability, getLevelInfo, LevelInfo, mergeQuest } from '../services/gamification';
import { FashionItem, Offer, PriceAlert, Quest, SustainabilityMetrics, TrackRecord } from '../types';
import { useStore } from './useStore';

export function useItem(itemId: string | undefined): FashionItem | undefined {
  return useStore((s) => (itemId ? s.recommendedItems.find((item) => item.id === itemId) : undefined));
}

/**
 * Ranked listings the user can buy now: available, offered in their country and in the
 * sections they shop (sold items kept for the wishlist/alerts are left out).
 */
export function useAvailableItems(): FashionItem[] {
  const items = useStore((s) => s.recommendedItems);
  const shopFor = useStore((s) => s.profile.shopFor);
  const country = useStore((s) => s.profile.country);
  return useMemo(
    () => items.filter((item) => item.available && matchesShopFor(item.department, shopFor) && (!country || item.market === country)),
    [items, shopFor, country],
  );
}

export function useWishlistItems(): FashionItem[] {
  const wishlist = useStore((s) => s.profile.wishlist);
  const items = useStore((s) => s.recommendedItems);
  return useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    return wishlist.map((id) => byId.get(id)).filter((item): item is FashionItem => item !== undefined);
  }, [wishlist, items]);
}

/** Offers that are in date and were confirmed by their feed in the last 26 hours. */
export function isOfferCurrent(offer: Offer, now: Date = new Date()): boolean {
  const t = now.getTime();
  if (offer.endsAt && new Date(offer.endsAt).getTime() <= t) return false;
  if (offer.startsAt && new Date(offer.startsAt).getTime() > t) return false;
  return t - new Date(offer.lastSeenAt).getTime() <= 26 * 3_600_000;
}

export function useOffers(): Offer[] {
  const offers = useStore((s) => s.offers);
  return useMemo(() => offers.filter((o) => isOfferCurrent(o)), [offers]);
}

/** Sales announced in official feeds, still listed in the last 26 hours and not started yet. */
export function useUpcomingSales(): Offer[] {
  const offers = useStore((s) => s.upcomingOffers);
  return useMemo(() => {
    const now = Date.now();
    return offers.filter((o) => !!o.startsAt && Date.parse(o.startsAt) > now && now - Date.parse(o.lastSeenAt) <= 26 * 3_600_000);
  }, [offers]);
}

/** When to buy this listing (see services/buyTiming). */
export function useBuyTiming(item: FashionItem | undefined): BuyTiming | null {
  const sales = useUpcomingSales();
  return useMemo(() => (item ? getBuyTiming(item, { now: new Date(), upcomingSales: sales }) : null), [item, sales]);
}

/** Recently opened listings that are still loaded, most recent first. */
export function useRecentlyViewedItems(): FashionItem[] {
  const ids = useStore((s) => s.recentlyViewed);
  const items = useStore((s) => s.recommendedItems);
  return useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    return ids.map((id) => byId.get(id)).filter((item): item is FashionItem => item !== undefined);
  }, [ids, items]);
}

/** Coupons for one listing: the marketplace's promo on it, then the marketplace's store-wide offers. */
export function useOffersForItem(item: Pick<FashionItem, 'id' | 'source' | 'market'> | undefined): Offer[] {
  const offers = useOffers();
  return useMemo(() => {
    if (!item) return [];
    const own = offers.filter((o) => o.listingId === item.id);
    const store = offers.filter((o) => !o.listingId && o.source === item.source && o.market === item.market);
    return [...own, ...store];
  }, [offers, item]);
}

/** The model's track record for a horizon (overall, or for one marketplace when it has enough). */
export function useTrackRecord(horizon: number, source?: string): TrackRecord | null {
  const records = useStore((s) => s.trackRecord);
  return useMemo(() => {
    const forSource = source ? records.find((r) => r.horizon === horizon && r.source === source) : undefined;
    if (forSource && forSource.resolved >= 30) return forSource;
    return records.find((r) => r.horizon === horizon && r.source === null) ?? null;
  }, [records, horizon, source]);
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
  const currency = useStore((s) => s.profile.currency);
  const rates = useStore((s) => s.fxRates);
  return useMemo(() => computeSustainability(purchases, currency, rates), [purchases, currency, rates]);
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
