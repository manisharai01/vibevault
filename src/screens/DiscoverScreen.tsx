// ============================================================
// VibeVault – Discover
// Live listings for the user's country, ranked for them, with
// editorial rails (your edit, good time to buy, worth the wait,
// recently viewed) above a filterable grid. Every card says when
// to buy it.
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, Fonts, FontSize, Spacing, Type } from '../constants/theme';
import { CATEGORIES } from '../constants/marketplaces';
import { useAvailableItems, useRecentlyViewedItems, useUpcomingSales } from '../store/hooks';
import { useStore } from '../store/useStore';
import { FashionItem, ItemCategory } from '../types';
import { DiscoverStackParamList, RootTabParamList } from '../navigation/types';
import CatalogStatusBanner from '../components/common/CatalogStatusBanner';
import EmptyState from '../components/common/EmptyState';
import Button from '../components/ui/Button';
import { PageTitle, SectionHeader } from '../components/ui/Layout';
import { ListingCard } from '../components/ui/Listing';
import Pill, { PillRow } from '../components/ui/Pill';
import { Sheet } from '../components/ui/Visuals';
import { priceIn } from '../services/catalog';
import { BuyTiming, getBuyTiming } from '../services/buyTiming';
import { refreshAndNotify } from '../services/lifecycle';
import { getDealScore } from '../services/priceEngine';

type Nav = CompositeNavigationProp<NativeStackNavigationProp<DiscoverStackParamList, 'DiscoverFeed'>, BottomTabNavigationProp<RootTabParamList>>;

type SortKey = 'match' | 'deal' | 'price' | 'newest';
type ConditionFilter = 'All' | 'New' | 'Pre-owned';

const CATEGORY_OPTIONS: ('All' | ItemCategory)[] = ['All', ...CATEGORIES];
const CONDITION_OPTIONS: ConditionFilter[] = ['All', 'New', 'Pre-owned'];
const SORT_LABELS: Record<SortKey, string> = { match: 'Best match', deal: 'Best deal', price: 'Lowest price', newest: 'Newest' };
const RAIL_SIZE = 10;

export default function DiscoverScreen() {
  const navigation = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const items = useAvailableItems();
  const recentlyViewed = useRecentlyViewedItems();
  const sales = useUpcomingSales();
  const { wishlist, isProfileComplete, vibeSummary, toggleWishlist, marketplaces, homeCurrency, rates, clearRecentlyViewed } = useStore(
    useShallow((s) => ({
      wishlist: s.profile.wishlist,
      isProfileComplete: s.isProfileComplete,
      vibeSummary: s.vibeSummary,
      toggleWishlist: s.toggleWishlist,
      marketplaces: s.marketplaces,
      homeCurrency: s.profile.currency,
      rates: s.fxRates,
      clearRecentlyViewed: s.clearRecentlyViewed,
    })),
  );

  const [category, setCategory] = useState<'All' | ItemCategory>('All');
  const [platform, setPlatform] = useState<string>('All');
  const [condition, setCondition] = useState<ConditionFilter>('All');
  const [sortBy, setSortBy] = useState<SortKey>('match');
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const saved = useMemo(() => new Set(wishlist), [wishlist]);
  const timings = useMemo(() => {
    const now = new Date();
    return new Map<string, BuyTiming>(items.map((item) => [item.id, getBuyTiming(item, { now, upcomingSales: sales })]));
  }, [items, sales]);

  // "Best match" needs a style profile; fall back to the deal score until then.
  const sortKeys: SortKey[] = isProfileComplete ? ['match', 'deal', 'price', 'newest'] : ['deal', 'price', 'newest'];
  const effectiveSort: SortKey = !isProfileComplete && sortBy === 'match' ? 'deal' : sortBy;
  const filterCount = [category !== 'All', platform !== 'All', condition !== 'All'].filter(Boolean).length;
  const searching = query.trim().length > 0;
  const platformOptions = useMemo(() => ['All', ...new Set(items.map((i) => i.source))], [items]);
  const platformName = useCallback((source: string) => marketplaces.find((m) => m.source === source)?.name ?? source, [marketplaces]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (category !== 'All' && item.category !== category) return false;
      if (platform !== 'All' && item.source !== platform) return false;
      if (condition === 'New' && item.secondhand) return false;
      if (condition === 'Pre-owned' && !item.secondhand) return false;
      if (!q) return true;
      return [item.title, item.brand ?? '', item.category, item.platform, item.seller ?? '', ...item.styleArchetypes].some((field) => field.toLowerCase().includes(q));
    });
    const sorted = [...filtered];
    if (effectiveSort === 'price') sorted.sort((a, b) => (priceIn(a, homeCurrency, rates) ?? Infinity) - (priceIn(b, homeCurrency, rates) ?? Infinity));
    else if (effectiveSort === 'newest') sorted.sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.id.localeCompare(b.id));
    else if (effectiveSort === 'deal') sorted.sort((a, b) => getDealScore(b) - getDealScore(a) || a.id.localeCompare(b.id));
    return sorted;
  }, [items, category, platform, condition, query, effectiveSort, homeCurrency, rates]);

  // Browsing (no search, filter or custom sort): editorial rails above the rest of the grid.
  // Each piece appears once on the page, so no listing (or its save button) shows twice.
  const defaultSort: SortKey = isProfileComplete ? 'match' : 'deal';
  const browsing = !searching && filterCount === 0 && effectiveSort === defaultSort;
  const rails = useMemo(() => {
    if (!browsing) return null;
    const used = new Set<string>();
    const take = (list: FashionItem[]) => {
      const picked = list.filter((i) => !used.has(i.id)).slice(0, RAIL_SIZE);
      for (const i of picked) used.add(i.id);
      return picked;
    };
    // Recently viewed first: picking up where you left off is the most useful rail.
    const recent = take(recentlyViewed);
    const byTiming = (kinds: BuyTiming['kind'][]) => items.filter((i) => kinds.includes(timings.get(i.id)!.kind));
    const buyNow = take(
      byTiming(['buy-now']).sort((a, b) => (isProfileComplete ? b.matchScore - a.matchScore : getDealScore(b) - getDealScore(a)) || a.id.localeCompare(b.id)),
    );
    const wait = take(byTiming(['wait-sale', 'wait-days', 'wait-month']).sort((a, b) => (timings.get(b.id)!.saving ?? 0) - (timings.get(a.id)!.saving ?? 0) || a.id.localeCompare(b.id)));
    const edit = isProfileComplete ? take(items) : [];
    return { buyNow, wait, edit, recent, used };
  }, [browsing, items, timings, isProfileComplete, recentlyViewed]);
  const grid = useMemo(() => (rails ? results.filter((i) => !rails.used.has(i.id)) : results), [rails, results]);

  const clearFilters = useCallback(() => {
    setCategory('All');
    setPlatform('All');
    setCondition('All');
    setQuery('');
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
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
  const gridWidth = Math.min(width, 900);
  const columns = gridWidth >= 700 ? 3 : 2;
  const cardWidth = (gridWidth - Spacing.lg * 2 - Spacing.md * (columns - 1)) / columns;

  const rail = (title: string, eyebrow: string, list: FashionItem[], action?: { label: string; onPress: () => void; a11y: string }) =>
    list.length > 0 ? (
      <View>
        <SectionHeader eyebrow={eyebrow} title={title} action={action?.label} onAction={action?.onPress} actionLabel={action?.a11y} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {list.map((item) => (
            <ListingCard
              key={item.id}
              item={item}
              timing={timings.get(item.id) ?? null}
              saved={saved.has(item.id)}
              showMatch={isProfileComplete}
              onOpen={openItem}
              onToggleSave={toggleWishlist}
              width={156}
            />
          ))}
        </ScrollView>
      </View>
    ) : null;

  const header = (
    <View>
      <PageTitle
        eyebrow={isProfileComplete ? 'Picked for you' : 'Live prices'}
        title="Discover"
        subtitle={isProfileComplete && vibeSummary ? vibeSummary : 'Real listings from real shops, with when to buy each one.'}
      >
        <View style={styles.searchRow}>
          <View style={styles.search}>
            <Ionicons name="search" size={17} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search brands, styles, pieces"
              placeholderTextColor={Colors.textMuted}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Search listings"
            />
            {query.length > 0 ? (
              <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            style={[styles.filterButton, filterCount > 0 && styles.filterButtonActive]}
            onPress={() => setFiltersOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={filterCount > 0 ? `Filters, ${filterCount} on` : 'Filters'}
          >
            <Ionicons name="options-outline" size={18} color={filterCount > 0 ? Colors.textInverse : Colors.ink} />
            {filterCount > 0 ? <Text style={styles.filterCount}>{filterCount}</Text> : null}
          </TouchableOpacity>
        </View>
      </PageTitle>

      {items.length > 0 ? <CatalogStatusBanner itemCount={items.length} onRetry={retry} /> : null}

      {!isProfileComplete && items.length > 0 ? (
        <TouchableOpacity style={styles.onboard} onPress={() => navigation.navigate('Profiler')} accessibilityRole="button" activeOpacity={0.9}>
          <View style={{ flex: 1 }}>
            <Text style={styles.onboardEyebrow}>Two minutes</Text>
            <Text style={styles.onboardTitle}>Find your style</Text>
            <Text style={styles.onboardText}>A short personality quiz ranks every listing for you and plans your whole wardrobe.</Text>
          </View>
          <Ionicons name="arrow-forward" size={22} color={Colors.textInverse} />
        </TouchableOpacity>
      ) : null}

      {rails ? (
        <>
          {rail('Recently viewed', 'Pick up where you left off', rails.recent, {
            label: 'Clear',
            onPress: clearRecentlyViewed,
            a11y: 'Clear recently viewed',
          })}
          {rail('Your edit', 'Matched to your style', rails.edit)}
          {rail('Good time to buy', 'Buy now', rails.buyNow)}
          {rail('Worth the wait', 'Likely cheaper soon', rails.wait)}
        </>
      ) : null}

      {items.length > 0 ? (
        <>
          <SectionHeader
            eyebrow={`${(rails ? items : results).length} ${(rails ? items : results).length === 1 ? 'piece' : 'pieces'}`}
            title={rails ? 'More pieces' : 'Results'}
          />
          <PillRow
            options={sortKeys}
            selected={effectiveSort}
            onSelect={setSortBy}
            getLabel={(k) => SORT_LABELS[k]}
            accessibilityLabel="Sort"
            size="sm"
          />
          <View style={{ height: Spacing.md }} />
        </>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        key={columns}
        data={grid}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        columnWrapperStyle={styles.columns}
        renderItem={({ item }) => (
          <ListingCard
            item={item}
            timing={timings.get(item.id) ?? null}
            saved={saved.has(item.id)}
            showMatch={isProfileComplete}
            onOpen={openItem}
            onToggleSave={toggleWishlist}
            width={cardWidth}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          items.length === 0 ? (
            <CatalogStatusBanner itemCount={0} onRetry={retry} />
          ) : (
            <EmptyState
              icon="search-outline"
              title="No pieces match"
              message="Try a different search, or clear the filters."
              actionLabel="Clear filters"
              onAction={clearFilters}
            />
          )
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={6}
        windowSize={7}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.ink} colors={[Colors.ink]} />}
      />

      <Sheet visible={filtersOpen} title="Filters" closeLabel="Done" onClose={() => setFiltersOpen(false)}>
        <Text style={styles.sheetLabel}>Category</Text>
        <View style={styles.wrap}>
          {CATEGORY_OPTIONS.map((c) => (
            <Pill key={c} label={c} selected={category === c} onPress={() => setCategory(c)} accessibilityLabel={`Category: ${c}`} />
          ))}
        </View>
        {platformOptions.length > 2 ? (
          <>
            <Text style={styles.sheetLabel}>Shop</Text>
            <View style={styles.wrap}>
              {platformOptions.map((p) => (
                <Pill
                  key={p}
                  label={p === 'All' ? 'All shops' : platformName(p)}
                  selected={platform === p}
                  onPress={() => setPlatform(p)}
                  accessibilityLabel={`Shop: ${p === 'All' ? 'All shops' : platformName(p)}`}
                />
              ))}
            </View>
          </>
        ) : null}
        <Text style={styles.sheetLabel}>Condition</Text>
        <View style={styles.wrap}>
          {CONDITION_OPTIONS.map((c) => (
            <Pill key={c} label={c} selected={condition === c} onPress={() => setCondition(c)} accessibilityLabel={`Condition: ${c}`} />
          ))}
        </View>
        <Text style={styles.sheetCount}>
          {results.length} {results.length === 1 ? 'piece matches' : 'pieces match'}
        </Text>
        {filterCount > 0 ? <Button label="Reset filters" variant="secondary" onPress={clearFilters} style={{ marginTop: Spacing.md }} /> : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { paddingBottom: Spacing.xxxl },
  columns: { paddingHorizontal: Spacing.lg, gap: Spacing.md, marginBottom: Spacing.md },
  rail: { paddingHorizontal: Spacing.lg, gap: Spacing.md },

  searchRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 46,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontFamily: Fonts.regular, color: Colors.ink, fontSize: FontSize.md, paddingVertical: 0 },
  filterButton: {
    width: 46,
    height: 46,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterButtonActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  filterCount: {
    position: 'absolute',
    top: 6,
    right: 6,
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: Colors.textInverse,
  },

  onboard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.ink,
  },
  onboardEyebrow: { ...Type.eyebrow, color: 'rgba(255,255,255,0.6)' },
  onboardTitle: { fontFamily: Fonts.display, fontSize: FontSize.xxxl, lineHeight: 38, color: Colors.textInverse, marginTop: 4 },
  onboardText: { fontFamily: Fonts.regular, fontSize: FontSize.sm, lineHeight: 19, color: 'rgba(255,255,255,0.78)', marginTop: 6 },

  sheetLabel: { ...Type.eyebrow, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  sheetCount: { ...Type.small, marginTop: Spacing.xl },
});
