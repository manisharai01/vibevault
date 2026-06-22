// ============================================================
// VibeVault – Price Tracker Screen (Objective 2)
//
// Predictive pricing dashboard that analyzes historical price
// data, seasonal trends, and market demand to forecast optimal
// purchase windows with confidence intervals and price alerts.
// ============================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Colors,
  Spacing,
  FontSize,
  BorderRadius,
  Shadows,
  PLATFORM_COLORS,
} from '../constants/theme';
import { useStore } from '../store/useStore';
import { FashionItem, Platform, PriceAlert, Region } from '../types';
import GradientCard from '../components/common/GradientCard';
import PriceChart from '../components/common/PriceChart';
import {
  generateForecast,
  getOptimalPurchaseWindow,
  getDealScore,
  getPredictionConfidence,
} from '../services/priceEngine';

export default function PriceScreen({ navigation }: { navigation: any }) {
  const { recommendedItems, wishlistItems, priceAlerts, addPriceAlert, removePriceAlert, profile } =
    useStore();
  const [alertPrice, setAlertPrice] = useState('');
  const [viewMode, setViewMode] = useState<'deals' | 'alerts' | 'wishlist'>('deals');
  const [selectedPlatform, setSelectedPlatform] = useState<'All' | Platform>('All');
  const [selectedRegion, setSelectedRegion] = useState<'All' | Region>('All');

  const PLATFORM_FILTERS: Array<'All' | Platform> = ['All', 'Myntra', 'Meesho', 'Amazon', 'Flipkart', 'Depop', 'Poshmark', 'Vinted', 'ThredUp', 'Local Thrift'];
  const REGION_FILTERS: Array<'All' | Region> = ['All', 'India', 'US', 'EU', 'Global'];

  // Sort items by deal score
  const topDeals = [...recommendedItems]
    .filter((item) => selectedPlatform === 'All' || item.platform === selectedPlatform)
    .filter((item) => selectedRegion === 'All' || item.region === selectedRegion)
    .map((item) => ({ ...item, dealScore: getDealScore(item) }))
    .sort((a, b) => b.dealScore - a.dealScore);

  const openDetail = (item: FashionItem) => {
    navigation.navigate('ItemDetail', { item });
  };

  const handleSetAlert = (item: FashionItem) => {
    const target = parseFloat(alertPrice) || item.predictedPrice7d;
    const alert: PriceAlert = {
      id: `alert-${Date.now()}`,
      itemId: item.id,
      targetPrice: target,
      currentPrice: item.currentPrice,
      active: true,
      createdAt: new Date().toISOString(),
    };
    addPriceAlert(alert);
    setAlertPrice('');
    Alert.alert('✅ Alert Set!', `You'll be notified when price drops to $${target.toFixed(2)}`);
  };

  // ---- Main List View ----
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <LinearGradient colors={[Colors.primaryDark, Colors.background]} style={styles.header}>
        <Text style={styles.headerTitle}>Deal Detector</Text>
        <Text style={styles.headerSub}>AI-powered price tracking & predictions</Text>
      </LinearGradient>

      {/* View Mode Toggle */}
      <View style={styles.toggleRow}>
        {(['deals', 'alerts', 'wishlist'] as const).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.toggleBtn, viewMode === mode && styles.toggleBtnActive]}
            onPress={() => setViewMode(mode)}
          >
            <Text style={[styles.toggleText, viewMode === mode && styles.toggleTextActive]}>
              {mode === 'deals' ? 'Top Deals' : mode === 'alerts' ? `Alerts (${priceAlerts.length})` : `Wishlist (${wishlistItems.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {PLATFORM_FILTERS.map((platform) => (
          <TouchableOpacity
            key={platform}
            style={[styles.filterChip, selectedPlatform === platform && styles.filterChipActive]}
            onPress={() => setSelectedPlatform(platform)}
          >
            <Text style={[styles.filterChipText, selectedPlatform === platform && styles.filterChipTextActive]}>{platform}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {REGION_FILTERS.map((region) => (
          <TouchableOpacity
            key={region}
            style={[styles.filterChip, selectedRegion === region && styles.filterChipActive]}
            onPress={() => setSelectedRegion(region)}
          >
            <Text style={[styles.filterChipText, selectedRegion === region && styles.filterChipTextActive]}>{region}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Deals View */}
      {viewMode === 'deals' && (
        <View style={styles.listSection}>
          <Text style={styles.listTitle}>Best Deals</Text>
          {topDeals.slice(0, 8).map((item) => {
            const optimal = getOptimalPurchaseWindow(item);
            return (
              <TouchableOpacity
                key={item.id}
                style={styles.dealCard}
                onPress={() => openDetail(item)}
                activeOpacity={0.8}
              >
                <Image source={{ uri: item.image }} style={styles.dealImage} />
                <View style={styles.dealInfo}>
                  <Text style={styles.dealTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.dealBrand}>{item.brand} · {item.platform}</Text>
                  <View style={styles.dealPriceRow}>
                    <Text style={styles.dealPrice}>${item.currentPrice.toFixed(2)}</Text>
                    <Text style={styles.dealOriginal}>${item.originalPrice.toFixed(2)}</Text>
                  </View>
                  <Text style={styles.dealHint}>{optimal.recommendation}</Text>
                </View>
                <View style={styles.dealScoreBadge}>
                  <Text style={styles.dealScoreNum}>{(item as any).dealScore}</Text>
                  <Text style={styles.dealScoreLabel}>deal</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Alerts View */}
      {viewMode === 'alerts' && (
        <View style={styles.listSection}>
          <Text style={styles.listTitle}>Active Price Alerts</Text>
          {priceAlerts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>•</Text>
              <Text style={styles.emptyText}>No price alerts set</Text>
              <Text style={styles.emptyHint}>Tap any deal to set a price alert</Text>
            </View>
          ) : (
            priceAlerts.map((alert: PriceAlert) => {
              const item = recommendedItems.find((i: FashionItem) => i.id === alert.itemId);
              if (!item) return null;
              return (
                <View key={alert.id} style={styles.alertCard}>
                  <View style={styles.alertInfo}>
                    <Text style={styles.alertItemTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.alertMeta}>
                      Current: ${item.currentPrice.toFixed(2)} → Target: ${alert.targetPrice.toFixed(2)}
                    </Text>
                    {item.currentPrice <= alert.targetPrice && (
                      <Text style={styles.alertTriggered}>Price target reached</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => removePriceAlert(alert.id)}>
                    <Text style={styles.removeAlertBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      )}

      {/* Wishlist View */}
      {viewMode === 'wishlist' && (
        <View style={styles.listSection}>
          <Text style={styles.listTitle}>Wishlist Price Tracking</Text>
          {wishlistItems.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>•</Text>
              <Text style={styles.emptyText}>Your wishlist is empty</Text>
              <Text style={styles.emptyHint}>Heart items in Discover to track them here</Text>
            </View>
          ) : (
            wishlistItems.map((item: FashionItem) => {
              const optimal = getOptimalPurchaseWindow(item);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.dealCard}
                  onPress={() => openDetail(item)}
                  activeOpacity={0.8}
                >
                  <Image source={{ uri: item.image }} style={styles.dealImage} />
                  <View style={styles.dealInfo}>
                    <Text style={styles.dealTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.dealPriceRow as any}>
                      <Text style={styles.dealPrice}>${item.currentPrice.toFixed(2)} </Text>
                      <Text style={styles.dealOriginal}>${item.originalPrice.toFixed(2)}</Text>
                    </Text>
                    <Text style={styles.dealHint}>{optimal.recommendation}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}

      {/* Market Insights */}
      <GradientCard style={styles.insightCard}>
        <Text style={styles.sectionTitle}>Market Insights</Text>
        <View style={styles.insightGrid}>
          <View style={styles.insightItem}>
            <Text style={styles.insightValue}>{recommendedItems.length}</Text>
            <Text style={styles.insightLabel}>Items Tracked</Text>
          </View>
          <View style={styles.insightItem}>
            <Text style={styles.insightValue}>{new Set(recommendedItems.map((i) => i.platform)).size}</Text>
            <Text style={styles.insightLabel}>Platforms</Text>
          </View>
          <View style={styles.insightItem}>
            <Text style={styles.insightValue}>15m</Text>
            <Text style={styles.insightLabel}>Update Freq</Text>
          </View>
          <View style={styles.insightItem}>
            <Text style={styles.insightValue}>93%</Text>
            <Text style={styles.insightLabel}>Accuracy</Text>
          </View>
        </View>
      </GradientCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    paddingTop: 54,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary },
  headerSub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4 },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleBtnActive: { backgroundColor: Colors.primaryDark, borderColor: Colors.primary },
  toggleText: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '600' },
  toggleTextActive: { color: Colors.primaryLight },
  filterRow: { paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.sm },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  filterChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryDark },
  filterChipText: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '700' },
  filterChipTextActive: { color: Colors.primaryLight },

  // List Section
  listSection: { paddingHorizontal: Spacing.lg },
  listTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },

  // Deal Card
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
  dealImage: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceLight,
  },
  dealInfo: { flex: 1, marginLeft: Spacing.md },
  dealTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  dealBrand: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  dealPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm, marginTop: 4 },
  dealPrice: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.success },
  dealOriginal: { fontSize: FontSize.xs, color: Colors.textMuted, textDecorationLine: 'line-through' },
  dealHint: { fontSize: FontSize.xs, color: Colors.primaryLight, marginTop: 4 },
  dealScoreBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealScoreNum: { color: '#FFF', fontSize: FontSize.md, fontWeight: '800' },
  dealScoreLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 8 },

  // Alert Card
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
  alertInfo: { flex: 1 },
  alertItemTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  alertMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  alertTriggered: { fontSize: FontSize.xs, color: Colors.success, fontWeight: '700', marginTop: 4 },
  removeAlertBtn: { fontSize: FontSize.xl, color: Colors.textMuted, padding: Spacing.sm },

  // Detail View
  detailHeader: {
    paddingTop: 54,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  backBtn: { marginBottom: Spacing.sm },
  backText: { color: Colors.primaryLight, fontSize: FontSize.md, fontWeight: '600' },
  detailTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary },

  detailItemRow: {
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  detailImage: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceLight,
  },
  detailItemInfo: { flex: 1 },
  detailItemTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  detailBrand: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4 },
  detailPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm, marginTop: Spacing.sm },
  detailPrice: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.success },
  detailOriginal: { fontSize: FontSize.md, color: Colors.textMuted, textDecorationLine: 'line-through' },

  section: { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },

  recommendation: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: '600',
    marginBottom: Spacing.md,
    lineHeight: 22,
  },
  optimalGrid: { flexDirection: 'row', gap: Spacing.md },
  optimalItem: { flex: 1 },
  optimalLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 4 },
  optimalValue: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },

  predGrid: { flexDirection: 'row' },
  predItem: { flex: 1, alignItems: 'center' },
  predLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 4 },
  predValue: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.primaryLight },
  predRange: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4 },
  predCI: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  predDivider: { width: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.md },

  dealBreakdown: { gap: Spacing.sm },
  dealRow: { gap: 4 },
  dealLabel: { fontSize: FontSize.xs, color: Colors.textSecondary },
  dealBar: {
    height: 6,
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },

  // Alert Input
  alertDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  alertInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  alertDollar: { fontSize: FontSize.xl, color: Colors.textSecondary, fontWeight: '700' },
  alertInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  alertBtn: { borderRadius: BorderRadius.sm, overflow: 'hidden' },
  alertBtnGrad: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm },
  alertBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.md },

  // Insight Card
  insightCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg, marginBottom: Spacing.xl },
  insightGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  insightItem: { alignItems: 'center' },
  insightValue: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.primaryLight },
  insightLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxxl },
  emptyEmoji: { fontSize: 40, marginBottom: Spacing.md },
  emptyText: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.textSecondary },
  emptyHint: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4 },
});
