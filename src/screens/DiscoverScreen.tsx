// ============================================================
// VibeVault – Discovery Feed Screen (Objective 1 contd.)
//
// Personalized fashion discovery feed showing AI-ranked
// recommendations with sustainability scores, price predictions,
// and style match percentages.
// ============================================================

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Colors,
  Spacing,
  FontSize,
  BorderRadius,
  Shadows,
  STYLE_COLORS,
  PLATFORM_COLORS,
} from '../constants/theme';
import { useStore } from '../store/useStore';
import { FashionItem, ItemCategory, StyleArchetype } from '../types';
import Tag from '../components/common/Tag';
import ScoreBadge from '../components/common/ScoreBadge';
import { getDealScore } from '../services/priceEngine';

const CATEGORIES: (ItemCategory | 'All')[] = ['All', 'Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes', 'Accessories', 'Bags'];

export default function DiscoverScreen({ navigation }: any) {
  const { recommendedItems, profile, isProfileComplete, toggleWishlist, vibeSummary } = useStore();
  const [selectedCategory, setSelectedCategory] = useState<ItemCategory | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<'match' | 'price' | 'sustainability' | 'deal'>('match');

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  // Filter and sort items
  const filteredItems = recommendedItems
    .filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.brand.toLowerCase().includes(q) ||
          item.styleArchetypes.some((s) => s.toLowerCase().includes(q))
        );
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'price': return a.currentPrice - b.currentPrice;
        case 'sustainability': return b.sustainabilityScore - a.sustainabilityScore;
        case 'deal': return getDealScore(b) - getDealScore(a);
        default: return b.matchScore - a.matchScore;
      }
    });

  const renderItem = ({ item }: { item: FashionItem }) => {
    const isWishlisted = profile.wishlist.includes(item.id);
    const dealScore = getDealScore(item);
    const savingsPercent = Math.round((1 - item.currentPrice / item.originalPrice) * 100);

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.card}
        onPress={() => navigation?.navigate?.('ItemDetail', { item })}
      >
        {/* Image */}
        <View style={styles.imageContainer}>
          <Image source={{ uri: item.image }} style={styles.image} resizeMode="cover" />

          {/* Match Score */}
          <View style={styles.matchBadge}>
            <LinearGradient
              colors={
                item.matchScore >= 80
                  ? (Colors.gradientEco as unknown as [string, string])
                  : item.matchScore >= 60
                    ? (Colors.gradientPrimary as unknown as [string, string])
                    : (Colors.gradientAccent as unknown as [string, string])
              }
              style={styles.matchBadgeGradient}
            >
              <Text style={styles.matchScoreText}>{item.matchScore}%</Text>
              <Text style={styles.matchLabel}>match</Text>
            </LinearGradient>
          </View>

          {/* Wishlist */}
          <TouchableOpacity
            style={styles.wishlistBtn}
            onPress={() => toggleWishlist(item.id)}
          >
            <Text style={styles.wishlistIcon}>{isWishlisted ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>

          {/* Savings badge */}
          {savingsPercent >= 40 && (
            <View style={styles.savingsBadge}>
              <Text style={styles.savingsText}>-{savingsPercent}%</Text>
            </View>
          )}

          {/* Platform Tag */}
          <View style={[styles.platformTag, { backgroundColor: PLATFORM_COLORS[item.platform] || Colors.primary }]}>
            <Text style={styles.platformText}>{item.platform}</Text>
          </View>
        </View>

        {/* Info */}
        <View style={styles.cardInfo}>
          <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>

          <View style={styles.brandRow}>
            <Text style={styles.brandText}>{item.brand}</Text>
            <Text style={styles.conditionText}>· {item.condition}</Text>
            <Text style={styles.sizeText}>· {item.size}</Text>
          </View>

          {/* Style Tags */}
          <View style={styles.tagRow}>
            {item.styleArchetypes.slice(0, 3).map((s) => (
              <Tag key={s} label={s} color={STYLE_COLORS[s]} selected small />
            ))}
          </View>

          {/* Price & Sustainability Row */}
          <View style={styles.priceRow}>
            <View style={styles.priceInfo}>
              <Text style={styles.currentPrice}>${item.currentPrice.toFixed(2)}</Text>
              <Text style={styles.originalPrice}>${item.originalPrice.toFixed(2)}</Text>
            </View>

            <View style={styles.metricsRow}>
              {/* Sustainability */}
              <View style={styles.metricItem}>
                <Text style={styles.metricIcon}>🌿</Text>
                <Text style={styles.metricValue}>{item.sustainabilityScore}</Text>
              </View>
              {/* Deal Score */}
              <View style={styles.metricItem}>
                <Text style={styles.metricIcon}>🔥</Text>
                <Text style={styles.metricValue}>{dealScore}</Text>
              </View>
              {/* CO2 */}
              <View style={styles.metricItem}>
                <Text style={styles.metricIcon}>💨</Text>
                <Text style={styles.metricValue}>{item.co2Saved}kg</Text>
              </View>
            </View>
          </View>

          {/* Price prediction hint */}
          {item.predictedPrice7d < item.currentPrice && (
            <View style={styles.predictionHint}>
              <Text style={styles.predictionText}>
                📉 Price may drop to ${item.predictedPrice7d.toFixed(2)} in 7 days
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient colors={[Colors.primaryDark, Colors.background]} style={styles.header}>
        <Text style={styles.headerTitle}>✨ Discover</Text>
        {isProfileComplete && vibeSummary ? (
          <Text style={styles.headerSub} numberOfLines={2}>{vibeSummary}</Text>
        ) : (
          <Text style={styles.headerSub}>Complete your Style Profile to get personalized picks!</Text>
        )}

        {/* Search */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search brands, styles, items..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </LinearGradient>

      {/* Categories */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={CATEGORIES}
        keyExtractor={(item) => item}
        style={styles.categoryList}
        contentContainerStyle={styles.categoryContent}
        renderItem={({ item: cat }) => (
          <TouchableOpacity
            style={[styles.categoryChip, selectedCategory === cat && styles.categoryChipActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={[styles.categoryText, selectedCategory === cat && styles.categoryTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Sort buttons */}
      <View style={styles.sortRow}>
        {([
          { key: 'match', label: '🎯 Match', },
          { key: 'price', label: '💰 Price' },
          { key: 'sustainability', label: '🌿 Eco' },
          { key: 'deal', label: '🔥 Deal' },
        ] as const).map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.sortBtn, sortBy === s.key && styles.sortBtnActive]}
            onPress={() => setSortBy(s.key)}
          >
            <Text style={[styles.sortBtnText, sortBy === s.key && styles.sortBtnTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Item Grid */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={1}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🔍</Text>
            <Text style={styles.emptyText}>No items match your filters</Text>
            <Text style={styles.emptyHint}>Try adjusting your search or category</Text>
          </View>
        }
      />
    </View>
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
  headerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: { fontSize: 16, marginRight: Spacing.sm },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    paddingVertical: Spacing.sm,
  },

  // Categories
  categoryList: { maxHeight: 48 },
  categoryContent: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  categoryChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
  categoryTextActive: { color: '#FFF' },

  // Sort
  sortRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  sortBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
  },
  sortBtnActive: { backgroundColor: Colors.primaryDark },
  sortBtnText: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '600' },
  sortBtnTextActive: { color: Colors.primaryLight },

  // List
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },

  // Card
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadows.card,
  },
  imageContainer: {
    height: 200,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.surfaceLight,
  },

  // Badges
  matchBadge: { position: 'absolute', top: Spacing.sm, left: Spacing.sm },
  matchBadgeGradient: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  matchScoreText: { color: '#FFF', fontSize: FontSize.lg, fontWeight: '800' },
  matchLabel: { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.xs },

  wishlistBtn: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wishlistIcon: { fontSize: 18 },

  savingsBadge: {
    position: 'absolute',
    bottom: Spacing.sm,
    left: Spacing.sm,
    backgroundColor: Colors.error,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  savingsText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },

  platformTag: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  platformText: { color: '#FFF', fontSize: FontSize.xs, fontWeight: '700' },

  // Card Info
  cardInfo: { padding: Spacing.md },
  itemTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  brandRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  brandText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
  conditionText: { color: Colors.textMuted, fontSize: FontSize.sm, marginLeft: 4 },
  sizeText: { color: Colors.textMuted, fontSize: FontSize.sm, marginLeft: 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: Spacing.sm },

  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceInfo: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  currentPrice: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.success },
  originalPrice: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  metricsRow: { flexDirection: 'row', gap: Spacing.md },
  metricItem: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  metricIcon: { fontSize: 12 },
  metricValue: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600' },

  predictionHint: {
    marginTop: Spacing.sm,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.primaryDark + '30',
    borderRadius: BorderRadius.sm,
  },
  predictionText: { color: Colors.primaryLight, fontSize: FontSize.xs },

  // Empty
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: { color: Colors.textSecondary, fontSize: FontSize.lg, fontWeight: '600' },
  emptyHint: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 4 },
});
