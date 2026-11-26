// ============================================================
// VibeVault – Deal Detector (Objective 2)
//
// Top deals ranked by deal score, price alerts (active and
// triggered) and wishlist price tracking, plus market insights
// computed from the live catalogue and its recorded prices.
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CompositeNavigationProp, RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';
import { PLATFORM_BY_SOURCE, PLATFORMS, REGION_LABELS, REGIONS } from '../constants/marketplaces';
import { useAvailableItems, useWishlistItems } from '../store/hooks';
import { useStore } from '../store/useStore';
import { FashionItem, ListingSource, Platform, PriceAlert, Region } from '../types';
import { DealsStackParamList, RootTabParamList } from '../navigation/types';
import CatalogStatusBanner from '../components/common/CatalogStatusBanner';
import ChipRow from '../components/common/ChipRow';
import EmptyState from '../components/common/EmptyState';
import GradientCard from '../components/common/GradientCard';
import ProductImage from '../components/common/ProductImage';
import ScreenHeader from '../components/common/ScreenHeader';
import { refreshAndNotify } from '../services/lifecycle';
import { backtestAccuracy, getDealScore, getOptimalPurchaseWindow, PurchaseWindow } from '../services/priceEngine';
import { formatDate } from '../utils/date';
import { formatMoney } from '../utils/format';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<DealsStackParamList, 'DealsFeed'>,
  BottomTabNavigationProp<RootTabParamList>
>;
type ViewMode = 'deals' | 'alerts' | 'wishlist';

const PLATFORM_OPTIONS: ('All' | Platform)[] = ['All', ...PLATFORMS];
const REGION_OPTIONS: ('All' | Region)[] = ['All', ...REGIONS];
const TOP_DEALS_LIMIT = 10;

/** Platform for an alert whose listing details aren't loaded (id is `<source>:<item id>`). */
function platformFromId(itemId: string): Platform | null {
  const source = itemId.split(':')[0] as ListingSource;
  return PLATFORM_BY_SOURCE[source] ?? null;
}

function showsStrikePrice(item: FashionItem): item is FashionItem & { originalPrice: number } {
  return item.originalPrice !== null && item.originalPrice > item.currentPrice;
}

function trackingHint(item: FashionItem, window: PurchaseWindow): string {
  return item.available ? window.recommendation : `No longer available on ${item.platform} — it may have sold out.`;
}

export default function PriceScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<DealsStackParamList, 'DealsFeed'>>();
  const { priceAlerts, recommendedItems, removePriceAlert, acknowledgeTriggeredAlerts } = useStore(
    useShallow((s) => ({
      priceAlerts: s.priceAlerts,
      recommendedItems: s.recommendedItems,
      removePriceAlert: s.removePriceAlert,
      acknowledgeTriggeredAlerts: s.acknowledgeTriggeredAlerts,
    })),
  );
  const availableItems = useAvailableItems();
  const wishlistItems = useWishlistItems();

  const [viewMode, setViewMode] = useState<ViewMode>(route.params?.view ?? 'deals');
  const [platform, setPlatform] = useState<'All' | Platform>('All');
  const [region, setRegion] = useState<'All' | Region>('All');

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

  const matchesFilters = useCallback(
    (item: FashionItem) => (platform === 'All' || item.platform === platform) && (region === 'All' || item.region === region),
    [platform, region],
  );
  const filtersActive = platform !== 'All' || region !== 'All';

  const topDeals = useMemo(
    () =>
      availableItems
        .filter(matchesFilters)
        .map((item) => ({ item, dealScore: getDealScore(item), window: getOptimalPurchaseWindow(item) }))
        .sort((a, b) => b.dealScore - a.dealScore)
        .slice(0, TOP_DEALS_LIMIT),
    [availableItems, matchesFilters],
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

  const wishlistRows = useMemo(
    () => wishlistItems.filter(matchesFilters).map((item) => ({ item, window: getOptimalPurchaseWindow(item) })),
    [wishlistItems, matchesFilters],
  );

  const alertItemIds = useMemo(
    () => new Set(priceAlerts.filter((a) => a.status === 'active').map((a) => a.itemId)),
    [priceAlerts],
  );

  const insights = useMemo(() => {
    const droppingSoon = availableItems.filter(
      (item) => item.predictedPrice7d !== null && item.predictedPrice7d < item.currentPrice * 0.99,
    ).length;
    const discounted = availableItems.filter(showsStrikePrice);
    const avgDiscount =
      discounted.length > 0
        ? Math.round((discounted.reduce((sum, item) => sum + (1 - item.currentPrice / item.originalPrice), 0) / discounted.length) * 100)
        : null;
    return {
      tracked: availableItems.length,
      forecastable: availableItems.filter((item) => item.predictedPrice7d !== null).length,
      droppingSoon,
      avgDiscount,
      accuracy: backtestAccuracy(availableItems, 7),
    };
  }, [availableItems]);

  const openDetail = (itemId: string) => navigation.navigate('ItemDetail', { itemId });
  const activeCount = priceAlerts.filter((a) => a.status === 'active').length;
  const triggeredCount = priceAlerts.filter((a) => a.status === 'triggered').length;

  const toggleLabel = (mode: ViewMode) =>
    mode === 'deals' ? 'Top Deals' : mode === 'alerts' ? `Alerts (${activeCount + triggeredCount})` : `Wishlist (${wishlistItems.length})`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Spacing.xxl }} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Deal Detector" subtitle="Live Flipkart & eBay prices, recorded daily — forecasts, alerts and tracking" />

      <View style={styles.toggleRow} accessibilityRole="tablist">
        {(['deals', 'alerts', 'wishlist'] as const).map((mode) => {
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

      <ChipRow options={PLATFORM_OPTIONS} selected={platform} onSelect={setPlatform} accessibilityLabel="Platform" compact />
      <ChipRow
        options={REGION_OPTIONS}
        selected={region}
        onSelect={setRegion}
        accessibilityLabel="Region"
        getLabel={(r) => (r === 'All' ? 'All regions' : REGION_LABELS[r])}
        compact
      />

      {viewMode === 'deals' && (
        <View style={styles.listSection}>
          <Text style={styles.listTitle}>Best Deals Right Now</Text>
          {availableItems.length === 0 ? (
            <CatalogStatusBanner itemCount={0} onRetry={retry} />
          ) : topDeals.length === 0 ? (
            <EmptyState icon="pricetags-outline" title="No deals for these filters" message="Try another platform or region." />
          ) : (
            topDeals.map(({ item, dealScore, window }) => (
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
                    {[item.brand, item.platform, item.secondhand ? 'Pre-owned' : 'New'].filter(Boolean).join(' · ')}
                  </Text>
                  <View style={styles.dealPriceRow}>
                    <Text style={styles.dealPrice}>{formatMoney(item.currentPrice, item.currency)}</Text>
                    {showsStrikePrice(item) && <Text style={styles.dealOriginal}>{formatMoney(item.originalPrice, item.currency)}</Text>}
                    {alertItemIds.has(item.id) && <Text style={styles.bell}>🔔</Text>}
                  </View>
                  <Text style={styles.dealHint} numberOfLines={2}>
                    {window.recommendation}
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

      {viewMode === 'alerts' && (
        <View style={styles.listSection}>
          <Text style={styles.listTitle}>Price Alerts</Text>
          {alertRows.length === 0 ? (
            <EmptyState
              icon="notifications-outline"
              title={priceAlerts.length === 0 ? 'No price alerts yet' : 'No alerts for these filters'}
              message={priceAlerts.length === 0 ? 'Open any item and set a target price on its Price tab.' : undefined}
              actionLabel={priceAlerts.length === 0 ? 'Browse Top Deals' : undefined}
              onAction={priceAlerts.length === 0 ? () => setViewMode('deals') : undefined}
            />
          ) : (
            alertRows.map(({ alert, item }) => {
              const target = formatMoney(alert.targetPrice, alert.currency);
              const title = item?.title ?? `${platformFromId(alert.itemId) ?? 'Marketplace'} listing`;
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

      {viewMode === 'wishlist' && (
        <View style={styles.listSection}>
          <Text style={styles.listTitle}>Wishlist Price Tracking</Text>
          {wishlistRows.length === 0 ? (
            <EmptyState
              icon="heart-outline"
              title={wishlistItems.length === 0 ? 'Your wishlist is empty' : 'No wishlist items for these filters'}
              message={wishlistItems.length === 0 ? 'Tap the heart on any item to track its price here.' : undefined}
              actionLabel={wishlistItems.length === 0 ? 'Browse Discover' : undefined}
              onAction={wishlistItems.length === 0 ? () => navigation.navigate('Discover') : undefined}
            />
          ) : (
            wishlistRows.map(({ item, window }) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.dealCard, !item.available && styles.cardUnavailable]}
                onPress={() => openDetail(item.id)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${formatMoney(item.currentPrice, item.currency)}${item.available ? '' : ', no longer available'}`}
              >
                <ProductImage uri={item.image} style={styles.dealImage} category={item.category} colors={item.colors} iconSize={20} />
                <View style={styles.dealInfo}>
                  <Text style={styles.dealTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={styles.dealPriceRow}>
                    <Text style={[styles.dealPrice, !item.available && styles.priceUnavailable]}>
                      {formatMoney(item.currentPrice, item.currency)}
                    </Text>
                    {item.available && showsStrikePrice(item) && (
                      <Text style={styles.dealOriginal}>{formatMoney(item.originalPrice, item.currency)}</Text>
                    )}
                    {alertItemIds.has(item.id) && <Text style={styles.bell}>🔔</Text>}
                  </View>
                  <Text style={[styles.dealHint, !item.available && { color: Colors.warning }]} numberOfLines={2}>
                    {trackingHint(item, window)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
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
            <Text style={styles.insightValue}>{insights.forecastable}</Text>
            <Text style={styles.insightLabel}>With forecasts</Text>
          </View>
          <View style={styles.insightItem}>
            <Text style={styles.insightValue}>{insights.droppingSoon}</Text>
            <Text style={styles.insightLabel}>Dropping in 7d</Text>
          </View>
          <View style={styles.insightItem}>
            <Text style={styles.insightValue}>{insights.avgDiscount === null ? '—' : `${insights.avgDiscount}%`}</Text>
            <Text style={styles.insightLabel}>Avg. discount</Text>
          </View>
        </View>
        <Text style={styles.insightFootnote}>
          {insights.accuracy !== null ? `7-day forecast accuracy: ${insights.accuracy}% (backtested on recorded prices). ` : ''}
          Forecasts appear after a week of recorded prices. Discounts are against the MRP or retail price the marketplace reports.
        </Text>
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
  toggleText: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '700' },
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
  cardUnavailable: { opacity: 0.75 },
  priceUnavailable: { color: Colors.textMuted, textDecorationLine: 'line-through' },
});
