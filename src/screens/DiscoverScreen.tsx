// ============================================================
// VibeVault – Discovery Feed Screen (Objective 1)
//
// Personalised discovery feed: live listings for the user's
// country, ranked by style match, with deal scores, the price
// model's buy-or-wait advice and the reasons each piece matches.
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, FontSize, PLATFORM_COLORS, STYLE_COLORS, Shadows, Spacing } from '../constants/theme';
import { CATEGORIES } from '../constants/marketplaces';
import { useAvailableItems } from '../store/hooks';
import { useStore } from '../store/useStore';
import { FashionItem, ItemCategory } from '../types';
import { DiscoverStackParamList, RootTabParamList } from '../navigation/types';
import Tag from '../components/common/Tag';
import ChipRow from '../components/common/ChipRow';
import EmptyState from '../components/common/EmptyState';
import ProductImage from '../components/common/ProductImage';
import ScreenHeader from '../components/common/ScreenHeader';
import CatalogStatusBanner from '../components/common/CatalogStatusBanner';
import { priceIn } from '../services/catalog';
import { refreshAndNotify } from '../services/lifecycle';
import { getBuyAdvice, getDealScore, isAtRecordLow } from '../services/priceEngine';
import { formatMoney, percentOff } from '../utils/format';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<DiscoverStackParamList, 'DiscoverFeed'>,
  BottomTabNavigationProp<RootTabParamList>
>;

type SortKey = 'match' | 'deal' | 'price' | 'newest';
type ConditionFilter = 'All' | 'New' | 'Pre-owned';

const CATEGORY_OPTIONS: ('All' | ItemCategory)[] = ['All', ...CATEGORIES];
const CONDITION_OPTIONS: ConditionFilter[] = ['All', 'New', 'Pre-owned'];
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'match', label: 'Best Match' },
  { key: 'deal', label: 'Best Deal Now' },
  { key: 'price', label: 'Lowest Price' },
  { key: 'newest', label: 'Newest' },
];

export default function DiscoverScreen() {
  const navigation = useNavigation<Nav>();
  const recommendedItems = useAvailableItems();
  const { wishlist, isProfileComplete, vibeSummary, toggleWishlist, marketplaces, homeCurrency, rates } = useStore(
    useShallow((s) => ({
      wishlist: s.profile.wishlist,
      isProfileComplete: s.isProfileComplete,
      vibeSummary: s.vibeSummary,
      toggleWishlist: s.toggleWishlist,
      marketplaces: s.marketplaces,
      homeCurrency: s.profile.currency,
      rates: s.fxRates,
    })),
  );

  const [category, setCategory] = useState<'All' | ItemCategory>('All');
  const [platform, setPlatform] = useState<string>('All');
  const [condition, setCondition] = useState<ConditionFilter>('All');
  const [sortBy, setSortBy] = useState<SortKey>('match');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  // "Best Match" needs a style profile; fall back to deal score until then.
  const effectiveSort: SortKey = !isProfileComplete && sortBy === 'match' ? 'deal' : sortBy;
  const sortOptions = isProfileComplete ? SORT_OPTIONS : SORT_OPTIONS.filter((o) => o.key !== 'match');
  const wishlistSet = useMemo(() => new Set(wishlist), [wishlist]);
  const hasFilters = category !== 'All' || platform !== 'All' || condition !== 'All' || query.trim().length > 0;
  // Marketplaces that have listings in this feed.
  const platformOptions = useMemo(() => ['All', ...new Set(recommendedItems.map((i) => i.source))], [recommendedItems]);
  const platformName = useCallback((source: string) => marketplaces.find((m) => m.source === source)?.name ?? source, [marketplaces]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = recommendedItems.filter((item) => {
      if (category !== 'All' && item.category !== category) return false;
      if (platform !== 'All' && item.source !== platform) return false;
      if (condition === 'New' && item.secondhand) return false;
      if (condition === 'Pre-owned' && !item.secondhand) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        (item.brand ?? '').toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.platform.toLowerCase().includes(q) ||
        item.styleArchetypes.some((s) => s.toLowerCase().includes(q))
      );
    });
    const sorted = [...items];
    switch (effectiveSort) {
      case 'price':
        // Compare in the user's currency so listings in different currencies sort together.
        sorted.sort((a, b) => (priceIn(a, homeCurrency, rates) ?? Infinity) - (priceIn(b, homeCurrency, rates) ?? Infinity));
        break;
      case 'newest':
        sorted.sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.id.localeCompare(b.id));
        break;
      case 'deal':
        sorted.sort((a, b) => getDealScore(b) - getDealScore(a));
        break;
      default:
        break; // already ranked by match
    }
    return sorted;
  }, [recommendedItems, category, platform, condition, query, effectiveSort, homeCurrency, rates]);

  const clearFilters = useCallback(() => {
    setCategory('All');
    setPlatform('All');
    setCondition('All');
    setQuery('');
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Download the latest prices, then run alert checks and daily tasks.
    try {
      await refreshAndNotify({ force: true });
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  const retry = useCallback(() => {
    refreshAndNotify({ force: true }).catch(() => undefined);
  }, []);

  const openItem = useCallback((itemId: string) => navigation.navigate('ItemDetail', { itemId }), [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: FashionItem }) => (
      <DiscoverCard
        item={item}
        isWishlisted={wishlistSet.has(item.id)}
        showMatch={isProfileComplete}
        onPress={openItem}
        onToggleWishlist={toggleWishlist}
      />
    ),
    [wishlistSet, isProfileComplete, openItem, toggleWishlist],
  );

  const listHeader = (
    <View>
      {!isProfileComplete && (
        <TouchableOpacity
          style={styles.profileCta}
          onPress={() => navigation.navigate('Profiler')}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <LinearGradient colors={Colors.gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.profileCtaInner}>
            <Ionicons name="sparkles" size={22} color="#FFF" />
            <View style={{ flex: 1 }}>
              <Text style={styles.profileCtaTitle}>Find your vibe in 2 minutes</Text>
              <Text style={styles.profileCtaText}>Take the Style Profiler to unlock personalised match scores.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
      )}
      <ChipRow options={CATEGORY_OPTIONS} selected={category} onSelect={setCategory} accessibilityLabel="Category" />
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
      <ChipRow options={CONDITION_OPTIONS} selected={condition} onSelect={setCondition} accessibilityLabel="Condition" compact />
      {recommendedItems.length > 0 && <CatalogStatusBanner itemCount={recommendedItems.length} onRetry={retry} />}
      <View style={styles.sortRow}>
        {sortOptions.map((option) => {
          const active = effectiveSort === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.sortBtn, active && styles.sortBtnActive]}
              onPress={() => setSortBy(option.key)}
              accessibilityRole="button"
              aria-selected={active}
            >
              <Text style={[styles.sortBtnText, active && styles.sortBtnTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.resultsRow}>
        <Text style={styles.resultsText}>
          {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
        </Text>
        {/* With no results, the empty state below carries the only "Clear filters" button. */}
        {hasFilters && filteredItems.length > 0 && (
          <TouchableOpacity onPress={clearFilters} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.clearText}>Clear filters</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Discover"
        subtitle={isProfileComplete && vibeSummary ? vibeSummary : 'Live prices from real marketplaces, ranked for you.'}
      >
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search brands, styles, items..."
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search listings"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </ScreenHeader>

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={4}
        windowSize={7}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
        ListEmptyComponent={
          recommendedItems.length === 0 ? (
            <CatalogStatusBanner itemCount={0} onRetry={retry} />
          ) : (
            <EmptyState
              icon="search-outline"
              title="No items match your filters"
              message="Try a different search, category, marketplace or condition."
              actionLabel="Clear filters"
              onAction={clearFilters}
            />
          )
        }
      />
    </View>
  );
}

interface DiscoverCardProps {
  item: FashionItem;
  isWishlisted: boolean;
  showMatch: boolean;
  onPress: (itemId: string) => void;
  onToggleWishlist: (itemId: string) => void;
}

const DiscoverCard = React.memo(function DiscoverCard({ item, isWishlisted, showMatch, onPress, onToggleWishlist }: DiscoverCardProps) {
  const dealScore = getDealScore(item);
  const savings = percentOff(item.currentPrice, item.originalPrice);
  const advice = getBuyAdvice(item);
  const recordLow = isAtRecordLow(item);
  const matchGradient =
    item.matchScore >= 80 ? Colors.gradientEco : item.matchScore >= 60 ? Colors.gradientPrimary : Colors.gradientAccent;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.card}
      onPress={() => onPress(item.id)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${formatMoney(item.currentPrice, item.currency)} on ${item.platform}${showMatch ? `, ${item.matchScore}% match` : ''}`}
      // Screen readers treat the card as one element, so expose the heart as an action.
      accessibilityActions={[
        { name: 'activate' },
        { name: 'toggleWishlist', label: isWishlisted ? 'Remove from wishlist' : 'Save to wishlist' },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'toggleWishlist') onToggleWishlist(item.id);
        else if (event.nativeEvent.actionName === 'activate') onPress(item.id);
      }}
    >
      <View style={styles.imageContainer}>
        <ProductImage uri={item.image} style={styles.image} category={item.category} colors={item.colors} iconSize={40} />

        {showMatch && (
          <View style={styles.matchBadge}>
            <LinearGradient colors={matchGradient} style={styles.matchBadgeGradient}>
              <Text style={styles.matchScoreText}>{item.matchScore}%</Text>
              <Text style={styles.matchLabel}>match</Text>
            </LinearGradient>
          </View>
        )}

        <TouchableOpacity
          style={styles.wishlistBtn}
          onPress={() => onToggleWishlist(item.id)}
          accessibilityRole="button"
          accessibilityLabel={isWishlisted ? `Remove ${item.title} from wishlist` : `Save ${item.title} to wishlist`}
          aria-selected={isWishlisted}
          hitSlop={6}
        >
          <Text style={styles.wishlistIcon}>{isWishlisted ? '❤️' : '🤍'}</Text>
        </TouchableOpacity>

        {savings >= 40 && (
          <View style={styles.savingsBadge}>
            <Text style={styles.savingsText}>-{savings}%</Text>
          </View>
        )}

        <View style={[styles.platformTag, { backgroundColor: PLATFORM_COLORS[item.source] || Colors.primary }]}>
          <Text style={styles.platformText}>{item.source === 'google_shopping' && item.seller ? item.seller : item.siteName}</Text>
        </View>
      </View>

      <View style={styles.cardInfo}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.brandText} numberOfLines={1}>
          {[item.brand, item.secondhand ? item.condition : 'New', item.size].filter(Boolean).join(' · ')}
        </Text>

        <View style={styles.tagRow}>
          {item.styleArchetypes.slice(0, 3).map((s) => (
            <Tag key={s} label={s} color={STYLE_COLORS[s]} selected small />
          ))}
        </View>

        <View style={styles.priceRow}>
          <View style={styles.priceInfo}>
            <Text style={styles.currentPrice}>{formatMoney(item.currentPrice, item.currency)}</Text>
            {item.originalPrice !== null && (
              <Text style={styles.originalPrice}>{formatMoney(item.originalPrice, item.currency)}</Text>
            )}
          </View>
          <View style={styles.metricsRow}>
            <Text style={styles.metric} accessibilityLabel={`Deal score ${dealScore}`}>
              🔥 {dealScore}
            </Text>
            {item.secondhand && <Text style={styles.metric}>♻️ Pre-owned</Text>}
          </View>
        </View>

        {(recordLow || advice) && (
          <View style={[styles.predictionHint, advice?.verdict === 'buy' || recordLow ? styles.hintBuy : null]}>
            <Text style={styles.predictionText}>
              {recordLow
                ? '🏷️ Lowest price recorded for this listing'
                : advice?.verdict === 'wait'
                  ? `⏳ ${Math.round(advice.pDrop * 100)}% chance it gets ≥5% cheaper within ${advice.horizon} days`
                  : advice?.verdict === 'buy'
                    ? `🟢 Buy now — only ${Math.round(advice.pDrop * 100)}% chance of a 5%+ drop in ${advice.horizon} days`
                    : `⚖️ ${Math.round(advice!.pDrop * 100)}% chance of a 5%+ drop in ${advice!.horizon} days`}
            </Text>
          </View>
        )}
        {showMatch && item.matchReasons[0] && <Text style={styles.reasonText}>✓ {item.matchReasons.slice(0, 2).join(' · ')}</Text>}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.md,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md, paddingVertical: Spacing.sm + 2 },

  profileCta: { marginHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.sm, borderRadius: BorderRadius.lg, overflow: 'hidden' },
  profileCtaInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  profileCtaTitle: { color: '#FFF', fontSize: FontSize.md, fontWeight: '800' },
  profileCtaText: { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.sm, marginTop: 2 },

  sortRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, gap: Spacing.xs },
  sortBtn: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full, backgroundColor: Colors.surface },
  sortBtnActive: { backgroundColor: Colors.primaryDark },
  sortBtnText: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '600' },
  sortBtnTextActive: { color: Colors.primaryLight },

  resultsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  resultsText: { color: Colors.textMuted, fontSize: FontSize.sm },
  clearText: { color: Colors.primaryLight, fontSize: FontSize.sm, fontWeight: '700' },

  listContent: { paddingBottom: Spacing.xxl },

  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadows.card,
  },
  imageContainer: { height: 220 },
  image: { width: '100%', height: '100%' },

  matchBadge: { position: 'absolute', top: Spacing.sm, left: Spacing.sm },
  matchBadgeGradient: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.sm, alignItems: 'center' },
  matchScoreText: { color: '#FFF', fontSize: FontSize.lg, fontWeight: '800' },
  matchLabel: { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.xs },

  wishlistBtn: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 40,
    height: 40,
    borderRadius: 20,
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

  cardInfo: { padding: Spacing.md },
  itemTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  brandText: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: Spacing.sm },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: Spacing.sm },

  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.sm },
  priceInfo: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  currentPrice: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.success },
  originalPrice: { fontSize: FontSize.sm, color: Colors.textMuted, textDecorationLine: 'line-through' },
  metricsRow: { flexDirection: 'row', gap: Spacing.md },
  metric: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600' },

  predictionHint: {
    marginTop: Spacing.sm,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.primaryDark + '30',
    borderRadius: BorderRadius.sm,
  },
  predictionText: { color: Colors.primaryLight, fontSize: FontSize.xs },
  hintBuy: { backgroundColor: Colors.success + '25' },
  reasonText: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: Spacing.sm },
});
