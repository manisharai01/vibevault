// ============================================================
// VibeVault – Deal Detector (Objective 2)
//
// Best deals right now (ranked by the deal score and the price
// model's advice), coupons valid today and price alerts, plus the
// model's measured track record. Saved items live on the Wishlist
// screen (Profile).
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CompositeNavigationProp, RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';
import { countryName } from '../data/countries';
import { useAvailableItems, useOffers, useTrackRecord } from '../store/hooks';
import { useStore } from '../store/useStore';
import { FashionItem, PriceAlert } from '../types';
import { DealsStackParamList, DealsView, RootTabParamList } from '../navigation/types';
import CatalogStatusBanner from '../components/common/CatalogStatusBanner';
import ChipRow from '../components/common/ChipRow';
import EmptyState from '../components/common/EmptyState';
import GradientCard from '../components/common/GradientCard';
import OfferRow from '../components/common/OfferRow';
import ProductImage from '../components/common/ProductImage';
import ScreenHeader from '../components/common/ScreenHeader';
import { refreshAndNotify } from '../services/lifecycle';
import { getBuyAdvice, getDealScore, isAtRecordLow, MAIN_HORIZON } from '../services/priceEngine';
import { formatDate } from '../utils/date';
import { formatMoney, formatPercent } from '../utils/format';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<DealsStackParamList, 'DealsFeed'>,
  BottomTabNavigationProp<RootTabParamList>
>;
type ViewMode = DealsView;
const VIEW_MODES: readonly ViewMode[] = ['deals', 'coupons', 'alerts'];

const TOP_DEALS_LIMIT = 12;

/** Marketplace id of an alert whose listing details aren't loaded (id is `<source>:<market>:<item id>`). */
function sourceFromId(itemId: string): string {
  return itemId.split(':')[0];
}

function showsStrikePrice(item: FashionItem): item is FashionItem & { originalPrice: number } {
  return item.originalPrice !== null && item.originalPrice > item.currentPrice;
}

/** One line of price advice for a listing, from real data only. */
function adviceHint(item: FashionItem): string {
  if (!item.available) return `No longer available on ${item.platform} — it sold out or was removed.`;
  if (isAtRecordLow(item)) return '🏷️ Lowest price recorded for this listing.';
  const advice = getBuyAdvice(item);
  if (!advice) return '📊 Price recorded daily — a buy-or-wait call appears once the model has enough outcomes.';
  return `${advice.verdict === 'buy' ? '🟢' : advice.verdict === 'wait' ? '⏳' : '⚖️'} ${advice.headline}: ${formatPercent(advice.pDrop)} chance of a 5%+ drop in ${advice.horizon} days.`;
}

export default function PriceScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<DealsStackParamList, 'DealsFeed'>>();
  const { priceAlerts, recommendedItems, removePriceAlert, acknowledgeTriggeredAlerts, marketplaces, country } = useStore(
    useShallow((s) => ({
      priceAlerts: s.priceAlerts,
      recommendedItems: s.recommendedItems,
      removePriceAlert: s.removePriceAlert,
      acknowledgeTriggeredAlerts: s.acknowledgeTriggeredAlerts,
      marketplaces: s.marketplaces,
      country: s.profile.country,
    })),
  );
  const availableItems = useAvailableItems();
  const offers = useOffers();
  const record = useTrackRecord(MAIN_HORIZON);

  const [viewMode, setViewMode] = useState<ViewMode>(route.params?.view ?? 'deals');
  const [platform, setPlatform] = useState<string>('All');
  const [copiedOfferId, setCopiedOfferId] = useState<string | null>(null);
  const platformName = useCallback((source: string) => marketplaces.find((m) => m.source === source)?.name ?? source, [marketplaces]);
  const platformOptions = useMemo(() => ['All', ...new Set(recommendedItems.map((i) => i.source))], [recommendedItems]);

  // Allow other screens (e.g. alert notifications) to open a specific view.
  const requestedView = route.params?.view;
  useEffect(() => {
    if (requestedView) {
      setViewMode(requestedView);
      navigation.setParams({ view: undefined });
    }
  }, [requestedView, navigation]);

  // Seeing the alerts list clears the "new" badge on the Deals tab
  // (re-run when alerts change so hits arriving while it's open are cleared too).
  useFocusEffect(
    useCallback(() => {
      if (viewMode === 'alerts' && priceAlerts.length > 0) acknowledgeTriggeredAlerts();
    }, [viewMode, acknowledgeTriggeredAlerts, priceAlerts]),
  );

  const retry = useCallback(() => {
    refreshAndNotify({ force: true }).catch(() => undefined);
  }, []);

  const matchesFilters = useCallback((item: FashionItem) => platform === 'All' || item.source === platform, [platform]);
  const filtersActive = platform !== 'All';

  const topDeals = useMemo(
    () =>
      availableItems
        .filter(matchesFilters)
        .map((item) => ({ item, dealScore: getDealScore(item) }))
        .sort((a, b) => b.dealScore - a.dealScore || a.item.id.localeCompare(b.item.id))
        .slice(0, TOP_DEALS_LIMIT),
    [availableItems, matchesFilters],
  );

  const couponRows = useMemo(
    () =>
      offers
        .filter((o) => !o.listingId && (platform === 'All' || o.source === platform))
        // Codes first, then the ones ending soonest.
        .sort((a, b) => Number(!!b.code) - Number(!!a.code) || (a.endsAt ?? '9999').localeCompare(b.endsAt ?? '9999')),
    [offers, platform],
  );

  const itemsById = useMemo(() => new Map(recommendedItems.map((item) => [item.id, item])), [recommendedItems]);

  const alertRows = useMemo(() => {
    const rows: { alert: PriceAlert; item: FashionItem | undefined }[] = priceAlerts
      .map((alert) => ({ alert, item: itemsById.get(alert.itemId) }))
      // Alerts whose listing isn't loaded stay visible (when unfiltered) so they can still be removed.
      .filter((row) => (row.item ? matchesFilters(row.item) : !filtersActive));
    // Triggered (newest first), then active (newest first).
    return rows.sort((a, b) => {
      if (a.alert.status !== b.alert.status) return a.alert.status === 'triggered' ? -1 : 1;
      const aTime = a.alert.triggeredAt ?? a.alert.createdAt;
      const bTime = b.alert.triggeredAt ?? b.alert.createdAt;
      return bTime.localeCompare(aTime);
    });
  }, [priceAlerts, itemsById, matchesFilters, filtersActive]);

  const alertItemIds = useMemo(
    () => new Set(priceAlerts.filter((a) => a.status === 'active').map((a) => a.itemId)),
    [priceAlerts],
  );

  const insights = useMemo(() => {
    const advised = availableItems.map((item) => getBuyAdvice(item)).filter((a) => a !== null);
    const discounted = availableItems.filter(showsStrikePrice);
    const avgDiscount =
      discounted.length > 0
        ? Math.round((discounted.reduce((sum, item) => sum + (1 - item.currentPrice / item.originalPrice), 0) / discounted.length) * 100)
        : null;
    return {
      tracked: availableItems.length,
      predicted: advised.length,
      buyNow: advised.filter((a) => a!.verdict === 'buy').length,
      wait: advised.filter((a) => a!.verdict === 'wait').length,
      avgDiscount,
    };
  }, [availableItems]);

  // From deals and alerts, open the item on its Price tab (advice, history, alert).
  const openDetail = (itemId: string) => navigation.navigate('ItemDetail', { itemId, tab: 'price' });
  const activeCount = priceAlerts.filter((a) => a.status === 'active').length;
  const triggeredCount = priceAlerts.filter((a) => a.status === 'triggered').length;

  const toggleLabel = (mode: ViewMode) =>
    // "Top deals", not "Deals": the tab bar already has a "Deals" button.
    mode === 'deals' ? 'Top deals' : mode === 'coupons' ? `Coupons (${couponRows.length})` : `Alerts (${activeCount + triggeredCount})`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Spacing.xxl }} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Deal Detector" subtitle="Live prices recorded daily, when-to-buy advice with a public track record, and valid coupons." />

      <View style={styles.toggleRow} accessibilityRole="tablist">
        {VIEW_MODES.map((mode) => {
          const active = viewMode === mode;
          return (
            <TouchableOpacity
              key={mode}
              style={[styles.toggleBtn, active && styles.toggleBtnActive]}
              onPress={() => setViewMode(mode)}
              accessibilityRole="tab"
              aria-selected={active}
            >
              <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{toggleLabel(mode)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {platformOptions.length > 2 && (
        <ChipRow
          options={platformOptions}
          selected={platform}
          onSelect={setPlatform}
          accessibilityLabel="Marketplace"
          getLabel={(source) => (source === 'All' ? 'All marketplaces' : platformName(source))}
          compact
        />
      )}

      {viewMode === 'deals' && (
        <View style={styles.listSection}>
          <Text style={styles.listTitle}>Best Deals Right Now</Text>
          {availableItems.length === 0 ? (
            <CatalogStatusBanner itemCount={0} onRetry={retry} />
          ) : topDeals.length === 0 ? (
            <EmptyState icon="pricetags-outline" title="No deals for this marketplace" message="Try another marketplace." />
          ) : (
            topDeals.map(({ item, dealScore }) => (
              <TouchableOpacity
                key={item.id}
                style={styles.dealCard}
                onPress={() => openDetail(item.id)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${formatMoney(item.currentPrice, item.currency)} on ${item.platform}, deal score ${dealScore}`}
              >
                <ProductImage uri={item.image} style={styles.dealImage} category={item.category} colors={item.colors} iconSize={20} />
                <View style={styles.dealInfo}>
                  <Text style={styles.dealTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.dealBrand} numberOfLines={1}>
                    {[item.brand, item.siteName, item.secondhand ? 'Pre-owned' : 'New'].filter(Boolean).join(' · ')}
                  </Text>
                  <View style={styles.dealPriceRow}>
                    <Text style={styles.dealPrice}>{formatMoney(item.currentPrice, item.currency)}</Text>
                    {showsStrikePrice(item) && <Text style={styles.dealOriginal}>{formatMoney(item.originalPrice, item.currency)}</Text>}
                    {alertItemIds.has(item.id) && <Text style={styles.bell}>🔔</Text>}
                  </View>
                  <Text style={styles.dealHint} numberOfLines={2}>
                    {adviceHint(item)}
                  </Text>
                </View>
                <View style={styles.dealScoreBadge}>
                  <Text style={styles.dealScoreNum}>{dealScore}</Text>
                  <Text style={styles.dealScoreLabel}>deal</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      {viewMode === 'coupons' && (
        <View style={styles.listSection}>
          <Text style={styles.listTitle}>Coupons valid today{country ? ` in ${countryName(country)}` : ''}</Text>
          {!country ? (
            // Coupons are issued per country, so they're only loaded once the user picks one.
            <EmptyState
              icon="globe-outline"
              title="Choose your country for coupons"
              message="Coupons only work in the country they're issued for."
              actionLabel="Choose country"
              onAction={() => navigation.navigate('Profile', { screen: 'ProfileMain', params: { pick: 'country' } })}
            />
          ) : couponRows.length === 0 ? (
            <EmptyState
              icon="ticket-outline"
              title="No valid coupons right now"
              message="Coupons come from the stores' and affiliate networks' live feeds. Nothing is listed unless a feed confirms it today."
            />
          ) : (
            couponRows.map((offer) => <OfferRow key={offer.id} offer={offer} copied={copiedOfferId === offer.id} onCopied={setCopiedOfferId} />)
          )}
          <Text style={styles.insightFootnote}>
            Tap an offer to copy its code and open the store. Every coupon here is from an official store or affiliate-network feed, was still
            listed by that feed within the last day, and is inside its start and end dates. Stores apply their own conditions (minimum spend,
            new customers, one use) at checkout.
          </Text>
        </View>
      )}

      {viewMode === 'alerts' && (
        <View style={styles.listSection}>
          <Text style={styles.listTitle}>Price Alerts</Text>
          {alertRows.length === 0 ? (
            // No button here: "Top deals" is right above.
            <EmptyState
              icon="notifications-outline"
              title={priceAlerts.length === 0 ? 'No price alerts yet' : 'No alerts for these filters'}
              message={priceAlerts.length === 0 ? 'Open any item and set a target price on its Price tab.' : undefined}
            />
          ) : (
            alertRows.map(({ alert, item }) => {
              const target = formatMoney(alert.targetPrice, alert.currency);
              const title = item?.title ?? `${platformName(sourceFromId(alert.itemId))} listing`;
              return (
                <View key={alert.id} style={[styles.alertCard, alert.status === 'triggered' && styles.alertCardTriggered]}>
                  <TouchableOpacity
                    style={styles.alertMain}
                    onPress={() => openDetail(alert.itemId)}
                    accessibilityRole="button"
                    accessibilityLabel={`${title} alert`}
                  >
                    <ProductImage
                      uri={item?.image ?? null}
                      style={styles.alertImage}
                      category={item?.category}
                      colors={item?.colors}
                      iconSize={16}
                    />
                    <View style={styles.alertInfo}>
                      <Text style={styles.alertItemTitle} numberOfLines={1}>
                        {title}
                      </Text>
                      {alert.status === 'triggered' ? (
                        <>
                          <Text style={styles.alertTriggered}>
                            🎯 Target hit — {formatMoney(alert.triggeredPrice ?? alert.targetPrice, alert.currency)}
                          </Text>
                          <Text style={styles.alertMeta}>
                            Target {target}
                            {alert.triggeredAt ? ` · ${formatDate(alert.triggeredAt)}` : ''}
                            {item ? (item.available ? ` · now ${formatMoney(item.currentPrice, item.currency)}` : ' · no longer available') : ''}
                          </Text>
                        </>
                      ) : !item ? (
                        <>
                          <Text style={styles.alertMetaStrong}>Target {target}</Text>
                          <Text style={styles.alertMeta}>Listing details aren’t loaded right now · set {formatDate(alert.createdAt)}</Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.alertMetaStrong}>
                            Now {formatMoney(item.currentPrice, item.currency)} → target {target}
                          </Text>
                          <Text style={styles.alertMeta}>
                            {!item.available
                              ? `No longer available on ${item.platform}`
                              : item.currentPrice <= alert.targetPrice
                                ? 'At your target now'
                                : `${formatMoney(item.currentPrice - alert.targetPrice, item.currency)} to go`}{' '}
                            · set {formatDate(alert.createdAt)}
                          </Text>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => removePriceAlert(alert.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete alert for ${title}`}
                    hitSlop={8}
                  >
                    <Text style={styles.removeAlertBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      )}

      <GradientCard style={styles.insightCard}>
        <Text style={styles.sectionTitle}>Market Insights</Text>
        <View style={styles.insightGrid}>
          <View style={styles.insightItem}>
            <Text style={styles.insightValue}>{insights.tracked}</Text>
            <Text style={styles.insightLabel}>Live listings</Text>
          </View>
          <View style={styles.insightItem}>
            <Text style={styles.insightValue}>{insights.predicted}</Text>
            <Text style={styles.insightLabel}>With a prediction</Text>
          </View>
          <View style={styles.insightItem}>
            <Text style={styles.insightValue}>{insights.buyNow}</Text>
            <Text style={styles.insightLabel}>Buy-now calls</Text>
          </View>
          <View style={styles.insightItem}>
            <Text style={styles.insightValue}>{insights.avgDiscount === null ? '—' : `${insights.avgDiscount}%`}</Text>
            <Text style={styles.insightLabel}>Avg. discount</Text>
          </View>
        </View>
        <Text style={styles.recordTitle}>How accurate are the predictions?</Text>
        {record && record.resolved > 0 ? (
          <>
            <Text style={styles.recordLine}>
              {record.waitCalls > 0
                ? `When VibeVault said "wait", the price dropped 5%+ within ${record.horizon} days ${formatPercent(record.waitCorrect / record.waitCalls)} of the time (${record.waitCalls} calls).`
                : 'No "wait" calls have been scored yet.'}
            </Text>
            <Text style={styles.recordLine}>
              {record.buyCalls > 0
                ? `When it said "buy now", the price didn't drop 5%+ ${formatPercent(record.buyCorrect / record.buyCalls)} of the time (${record.buyCalls} calls).`
                : 'No "buy now" calls have been scored yet.'}
            </Text>
            {record.brier !== null && record.brierBaseRate !== null && (
              <Text style={styles.insightFootnote}>
                Brier score {record.brier.toFixed(3)} vs {record.brierBaseRate.toFixed(3)} for always guessing the average (lower is better) ·{' '}
                {record.resolved} predictions scored{record.since ? ` since ${formatDate(record.since)}` : ''}.
              </Text>
            )}
          </>
        ) : (
          <Text style={styles.recordLine}>
            Every prediction is stored and scored when its {MAIN_HORIZON}-day window closes; the measured accuracy shows here once the first ones
            are scored. No prediction is ever 100% certain — prices are set by sellers — so VibeVault shows its real hit rate instead.
          </Text>
        )}
        <Text style={styles.insightFootnote}>Discounts are against the list price or MRP the marketplace reports.</Text>
      </GradientCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  toggleRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.sm },
  toggleBtn: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleBtnActive: { backgroundColor: Colors.primaryDark, borderColor: Colors.primary },
  toggleText: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '700', textAlign: 'center' },
  toggleTextActive: { color: Colors.primaryLight },

  listSection: { paddingHorizontal: Spacing.lg, marginTop: Spacing.md },
  listTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },

  dealCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  dealImage: { width: 64, height: 64, borderRadius: BorderRadius.sm },
  dealInfo: { flex: 1, marginLeft: Spacing.md, marginRight: Spacing.sm },
  dealTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  dealBrand: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  dealPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm, marginTop: 4 },
  dealPrice: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.success },
  dealOriginal: { fontSize: FontSize.xs, color: Colors.textMuted, textDecorationLine: 'line-through' },
  bell: { fontSize: FontSize.xs },
  dealHint: { fontSize: FontSize.xs, color: Colors.primaryLight, marginTop: 4, lineHeight: 16 },
  dealScoreBadge: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  dealScoreNum: { color: '#FFF', fontSize: FontSize.md, fontWeight: '800' },
  dealScoreLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 9 },

  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  alertCardTriggered: { borderColor: Colors.success, backgroundColor: Colors.success + '14' },
  alertMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  alertImage: { width: 48, height: 48, borderRadius: BorderRadius.sm },
  alertInfo: { flex: 1, marginLeft: Spacing.md },
  alertItemTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  alertMetaStrong: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4, fontWeight: '600' },
  alertMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  alertTriggered: { fontSize: FontSize.sm, color: Colors.success, fontWeight: '800', marginTop: 4 },
  removeAlertBtn: { fontSize: FontSize.lg, color: Colors.textMuted, paddingHorizontal: Spacing.sm },

  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  insightCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg },
  insightGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  insightItem: { alignItems: 'center', flex: 1 },
  insightValue: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.primaryLight },
  insightLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4, textAlign: 'center' },
  insightFootnote: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.md, lineHeight: 16 },
  recordTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginTop: Spacing.lg },
  recordLine: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.sm, lineHeight: 19 },
});
