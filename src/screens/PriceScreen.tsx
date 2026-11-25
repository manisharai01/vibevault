// ============================================================
// VibeVault – Deal Detector (Objective 2)
//
// Top deals ranked by deal score, price alerts (active and
// triggered) and wishlist price tracking, plus live market
// insights computed from the catalogue.
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CompositeNavigationProp, RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';
import { PLATFORMS, REGIONS } from '../constants/marketplaces';
import { useWishlistItems } from '../store/hooks';
import { useStore } from '../store/useStore';
import { FashionItem, Platform, PriceAlert, Region } from '../types';
import { DealsStackParamList, RootTabParamList } from '../navigation/types';
import ChipRow from '../components/common/ChipRow';
import EmptyState from '../components/common/EmptyState';
import GradientCard from '../components/common/GradientCard';
import ProductImage from '../components/common/ProductImage';
import ScreenHeader from '../components/common/ScreenHeader';
import { backtestAccuracy, getDealScore, getOptimalPurchaseWindow } from '../services/priceEngine';
import { formatDate } from '../utils/date';
import { formatPrice } from '../utils/format';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<DealsStackParamList, 'DealsFeed'>,
  BottomTabNavigationProp<RootTabParamList>
>;
type ViewMode = 'deals' | 'alerts' | 'wishlist';

const PLATFORM_OPTIONS: ('All' | Platform)[] = ['All', ...PLATFORMS];
const REGION_OPTIONS: ('All' | Region)[] = ['All', ...REGIONS];
const TOP_DEALS_LIMIT = 10;

export default function PriceScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<DealsStackParamList, 'DealsFeed'>>();
  const { recommendedItems, catalog, priceAlerts, removePriceAlert, acknowledgeTriggeredAlerts } = useStore(
    useShallow((s) => ({
      recommendedItems: s.recommendedItems,
      catalog: s.catalog,
      priceAlerts: s.priceAlerts,
      removePriceAlert: s.removePriceAlert,
      acknowledgeTriggeredAlerts: s.acknowledgeTriggeredAlerts,
    })),
  );
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

  const matchesFilters = useCallback(
    (item: FashionItem) => (platform === 'All' || item.platform === platform) && (region === 'All' || item.region === region),
    [platform, region],
  );

  const topDeals = useMemo(
    () =>
      recommendedItems
        .filter(matchesFilters)
        .map((item) => ({ item, dealScore: getDealScore(item), window: getOptimalPurchaseWindow(item) }))
        .sort((a, b) => b.dealScore - a.dealScore)
        .slice(0, TOP_DEALS_LIMIT),
    [recommendedItems, matchesFilters],
  );

  const itemsById = useMemo(() => new Map(recommendedItems.map((item) => [item.id, item])), [recommendedItems]);

  const alertRows = useMemo(() => {
    const rows = priceAlerts
      .map((alert) => ({ alert, item: itemsById.get(alert.itemId) }))
      .filter((row): row is { alert: PriceAlert; item: FashionItem } => row.item !== undefined && matchesFilters(row.item));
    // Triggered (newest first), then active (newest first).
    return rows.sort((a, b) => {
      if (a.alert.status !== b.alert.status) return a.alert.status === 'triggered' ? -1 : 1;
      const aTime = a.alert.triggeredAt ?? a.alert.createdAt;
      const bTime = b.alert.triggeredAt ?? b.alert.createdAt;
      return bTime.localeCompare(aTime);
    });
  }, [priceAlerts, itemsById, matchesFilters]);

  const wishlistRows = useMemo(
    () => wishlistItems.filter(matchesFilters).map((item) => ({ item, window: getOptimalPurchaseWindow(item) })),
    [wishlistItems, matchesFilters],
  );

  const alertItemIds = useMemo(
    () => new Set(priceAlerts.filter((a) => a.status === 'active').map((a) => a.itemId)),
    [priceAlerts],
  );

  const insights = useMemo(() => {
    const droppingSoon = catalog.filter((item) => item.predictedPrice7d < item.currentPrice * 0.99).length;
    const avgDiscount =
      catalog.length > 0
        ? Math.round((catalog.reduce((sum, item) => sum + Math.max(0, 1 - item.currentPrice / item.originalPrice), 0) / catalog.length) * 100)
        : 0;
    return {
      tracked: catalog.length,
      platforms: new Set(catalog.map((i) => i.platform)).size,
      droppingSoon,
      avgDiscount,
      accuracy: backtestAccuracy(catalog, 7),
    };
  }, [catalog]);

  const openDetail = (itemId: string) => navigation.navigate('ItemDetail', { itemId });
  const activeCount = priceAlerts.filter((a) => a.status === 'active').length;
  const triggeredCount = priceAlerts.filter((a) => a.status === 'triggered').length;

  const toggleLabel = (mode: ViewMode) =>
    mode === 'deals' ? 'Top Deals' : mode === 'alerts' ? `Alerts (${activeCount + triggeredCount})` : `Wishlist (${wishlistItems.length})`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Spacing.xxl }} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Deal Detector" subtitle="Price tracking, forecasts and alerts across marketplaces" />

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
        getLabel={(r) => (r === 'All' ? 'All regions' : r)}
        compact
      />

      {viewMode === 'deals' && (
        <View style={styles.listSection}>
          <Text style={styles.listTitle}>Best Deals Right Now</Text>
          {topDeals.length === 0 ? (
            <EmptyState icon="pricetags-outline" title="No deals for these filters" message="Try another platform or region." />
          ) : (
            topDeals.map(({ item, dealScore, window }) => (
              <TouchableOpacity
                key={item.id}
                style={styles.dealCard}
                onPress={() => openDetail(item.id)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${formatPrice(item.currentPrice)}, deal score ${dealScore}`}
              >
                <ProductImage uri={item.image} style={styles.dealImage} category={item.category} colors={item.colors} iconSize={20} />
                <View style={styles.dealInfo}>
                  <Text style={styles.dealTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.dealBrand} numberOfLines={1}>
                    {item.brand} · {item.platform}
                  </Text>
                  <View style={styles.dealPriceRow}>
                    <Text style={styles.dealPrice}>{formatPrice(item.currentPrice)}</Text>
                    <Text style={styles.dealOriginal}>{formatPrice(item.originalPrice)}</Text>
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
            alertRows.map(({ alert, item }) => (
              <View key={alert.id} style={[styles.alertCard, alert.status === 'triggered' && styles.alertCardTriggered]}>
                <TouchableOpacity
                  style={styles.alertMain}
                  onPress={() => openDetail(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title} alert`}
                >
                  <ProductImage uri={item.image} style={styles.alertImage} category={item.category} colors={item.colors} iconSize={16} />
                  <View style={styles.alertInfo}>
                    <Text style={styles.alertItemTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {alert.status === 'triggered' ? (
                      <>
                        <Text style={styles.alertTriggered}>🎯 Target hit — {formatPrice(alert.triggeredPrice ?? item.currentPrice)}</Text>
                        <Text style={styles.alertMeta}>
                          Target {formatPrice(alert.targetPrice)} · {alert.triggeredAt ? formatDate(alert.triggeredAt) : ''} · now{' '}
                          {formatPrice(item.currentPrice)}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.alertMetaStrong}>
                          Now {formatPrice(item.currentPrice)} → target {formatPrice(alert.targetPrice)}
                        </Text>
                        <Text style={styles.alertMeta}>
                          {item.currentPrice <= alert.targetPrice
                            ? 'At your target now'
                            : `${formatPrice(item.currentPrice - alert.targetPrice)} to go`}{' '}
                          · set {formatDate(alert.createdAt)}
                        </Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removePriceAlert(alert.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete alert for ${item.title}`}
                  hitSlop={8}
                >
                  <Text style={styles.removeAlertBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
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
                style={styles.dealCard}
                onPress={() => openDetail(item.id)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${formatPrice(item.currentPrice)}`}
              >
                <ProductImage uri={item.image} style={styles.dealImage} category={item.category} colors={item.colors} iconSize={20} />
                <View style={styles.dealInfo}>
                  <Text style={styles.dealTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={styles.dealPriceRow}>
                    <Text style={styles.dealPrice}>{formatPrice(item.currentPrice)}</Text>
                    <Text style={styles.dealOriginal}>{formatPrice(item.originalPrice)}</Text>
                    {alertItemIds.has(item.id) && <Text style={styles.bell}>🔔</Text>}
                  </View>
                  <Text style={styles.dealHint} numberOfLines={2}>
                    {window.recommendation}
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
            <Text style={styles.insightLabel}>Items tracked</Text>
          </View>
          <View style={styles.insightItem}>
            <Text style={styles.insightValue}>{insights.platforms}</Text>
            <Text style={styles.insightLabel}>Platforms</Text>
          </View>
          <View style={styles.insightItem}>
            <Text style={styles.insightValue}>{insights.droppingSoon}</Text>
            <Text style={styles.insightLabel}>Dropping in 7d</Text>
          </View>
          <View style={styles.insightItem}>
            <Text style={styles.insightValue}>{insights.avgDiscount}%</Text>
            <Text style={styles.insightLabel}>Avg. discount</Text>
          </View>
        </View>
        {insights.accuracy !== null && (
          <Text style={styles.insightFootnote}>
            7-day forecast accuracy: {insights.accuracy}% (backtested against the last week of prices).
          </Text>
        )}
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
});
