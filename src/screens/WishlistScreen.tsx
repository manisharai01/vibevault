// ============================================================
// VibeVault – Wishlist Screen
// Saved listings with live prices, buy-or-wait advice and alerts.
// Listings that sell out stay visible (marked) until removed.
// ============================================================

import React, { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, FontSize, PLATFORM_COLORS, STYLE_COLORS, Shadows, Spacing } from '../constants/theme';
import { useWishlistItems } from '../store/hooks';
import { useStore } from '../store/useStore';
import { FashionItem } from '../types';
import { ProfileStackParamList, RootTabParamList } from '../navigation/types';
import EmptyState from '../components/common/EmptyState';
import ProductImage from '../components/common/ProductImage';
import ScreenHeader from '../components/common/ScreenHeader';
import Tag from '../components/common/Tag';
import { getBuyAdvice, isAtRecordLow } from '../services/priceEngine';
import { convertAmount, formatMoney, formatMoneyWhole, formatPercent, percentOff } from '../utils/format';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<ProfileStackParamList, 'Wishlist'>,
  BottomTabNavigationProp<RootTabParamList>
>;

export default function WishlistScreen() {
  const navigation = useNavigation<Nav>();
  const wishlistItems = useWishlistItems();
  const { isProfileComplete, priceAlerts, toggleWishlist, wishlistIds, homeCurrency, rates } = useStore(
    useShallow((s) => ({
      isProfileComplete: s.isProfileComplete,
      priceAlerts: s.priceAlerts,
      toggleWishlist: s.toggleWishlist,
      wishlistIds: s.profile.wishlist,
      homeCurrency: s.profile.currency,
      rates: s.fxRates,
    })),
  );
  // Saved ids whose listing isn't loaded (e.g. offline before the first sync).
  const missingIds = useMemo(() => {
    const loaded = new Set(wishlistItems.map((item) => item.id));
    return wishlistIds.filter((id) => !loaded.has(id));
  }, [wishlistIds, wishlistItems]);

  const alertItemIds = useMemo(() => new Set(priceAlerts.filter((a) => a.status === 'active').map((a) => a.itemId)), [priceAlerts]);
  // Discount vs list price / MRP across available items, in the user's currency.
  const totalSavings = wishlistItems.reduce((sum, item) => {
    if (!item.available || item.originalPrice === null) return sum;
    return sum + (convertAmount(Math.max(0, item.originalPrice - item.currentPrice), item.currency, homeCurrency, rates) ?? 0);
  }, 0);
  const avgMatch =
    wishlistItems.length > 0 ? Math.round(wishlistItems.reduce((sum, item) => sum + item.matchScore, 0) / wishlistItems.length) : 0;

  const renderItem = useCallback(
    ({ item }: { item: FashionItem }) => {
      const savePct = percentOff(item.currentPrice, item.originalPrice);
      const advice = item.available ? getBuyAdvice(item) : null;
      const recordLow = item.available && isAtRecordLow(item);
      const money = (value: number) => formatMoney(value, item.currency);
      return (
        <TouchableOpacity
          style={[styles.card, !item.available && styles.cardUnavailable]}
          onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}, ${money(item.currentPrice)}${item.available ? '' : ', no longer available'}`}
          // Screen readers treat the card as one element, so expose Remove as an action.
          accessibilityActions={[{ name: 'activate' }, { name: 'remove', label: 'Remove from wishlist' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'remove') toggleWishlist(item.id);
            else if (event.nativeEvent.actionName === 'activate') navigation.navigate('ItemDetail', { itemId: item.id });
          }}
        >
          <ProductImage uri={item.image} style={styles.cardImage} category={item.category} colors={item.colors} />
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.cardBrand}>
              {[item.brand, item.secondhand ? item.condition : 'New'].filter(Boolean).join(' · ')}
            </Text>
            <View style={styles.tagRow}>
              {item.styleArchetypes.slice(0, 2).map((s) => (
                <Tag key={s} label={s} color={STYLE_COLORS[s]} selected small />
              ))}
            </View>
            <View style={styles.priceRow}>
              <Text style={[styles.price, !item.available && styles.priceUnavailable]}>{money(item.currentPrice)}</Text>
              {item.available && savePct > 0 && item.originalPrice !== null && (
                <Text style={styles.originalPrice}>{money(item.originalPrice)}</Text>
              )}
              {item.available && savePct > 0 && (
                <View style={styles.saveBadge}>
                  <Text style={styles.saveText}>-{savePct}%</Text>
                </View>
              )}
            </View>
            {!item.available && <Text style={styles.unavailableHint}>Sold out or removed on {item.platform}</Text>}
            {recordLow ? (
              <Text style={styles.dropHint}>🏷️ Lowest price recorded — a good time to buy</Text>
            ) : advice ? (
              <Text style={styles.dropHint}>
                {advice.verdict === 'wait'
                  ? `⏳ Wait: ${formatPercent(advice.pDrop)} chance it gets 5%+ cheaper within ${advice.horizon} days`
                  : advice.verdict === 'buy'
                    ? `🟢 Buy now: only ${formatPercent(advice.pDrop)} chance of a 5%+ drop in ${advice.horizon} days`
                    : `⚖️ ${formatPercent(advice.pDrop)} chance of a 5%+ drop in ${advice.horizon} days`}
              </Text>
            ) : null}
            <View style={styles.cardBottom}>
              <View style={[styles.platformChip, { backgroundColor: PLATFORM_COLORS[item.source] || Colors.primary }]}>
                <Text style={styles.platformText}>{item.siteName}</Text>
              </View>
              {alertItemIds.has(item.id) && (
                <View style={styles.alertChip}>
                  <Text style={styles.alertChipText}>🔔 Alert on</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={() => toggleWishlist(item.id)}
                style={styles.removeBtn}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.title} from wishlist`}
                hitSlop={10}
              >
                <Text style={styles.removeBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [alertItemIds, navigation, toggleWishlist],
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="❤️ Wishlist" onBack={() => navigation.goBack()}>
        {wishlistItems.length > 0 && (
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{wishlistItems.length}</Text>
              <Text style={styles.statLabel}>Saved</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatMoneyWhole(totalSavings, homeCurrency)}</Text>
              <Text style={styles.statLabel}>Off list price</Text>
            </View>
            {isProfileComplete && (
              <View style={styles.stat}>
                <Text style={styles.statValue}>{avgMatch}%</Text>
                <Text style={styles.statLabel}>Avg match</Text>
              </View>
            )}
          </View>
        )}
      </ScreenHeader>

      <FlatList
        data={wishlistItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          missingIds.length > 0 ? (
            <View style={styles.missingNote}>
              <Text style={styles.missingText}>
                {missingIds.length} saved {missingIds.length === 1 ? 'listing' : 'listings'} couldn’t be loaded right now. They’ll appear
                once VibeVault reaches the server.
              </Text>
              <TouchableOpacity
                onPress={() => missingIds.forEach((id) => toggleWishlist(id))}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={styles.removeBtnText}>Remove {missingIds.length === 1 ? 'it' : 'them'}</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListEmptyComponent={
          missingIds.length > 0 ? null : (
            <EmptyState
              icon="heart-outline"
              title="No saved items yet"
              message="Tap the heart on any item in Discover to save it here and track its price."
              actionLabel="✨ Browse Discover"
              onAction={() => navigation.navigate('Discover', { screen: 'DiscoverFeed', pop: true })}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  statsRow: { flexDirection: 'row', gap: Spacing.xl, marginTop: Spacing.md },
  stat: { alignItems: 'center' },
  statValue: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: '800' },
  statLabel: { color: Colors.textSecondary, fontSize: FontSize.xs },
  list: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.card,
  },
  cardImage: { width: 110, minHeight: 150 },
  cardInfo: { flex: 1, padding: Spacing.md },
  cardTitle: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700', lineHeight: 18, marginBottom: 4 },
  cardBrand: { color: Colors.textMuted, fontSize: FontSize.xs, marginBottom: Spacing.xs },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: Spacing.xs },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: 4 },
  price: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '800' },
  originalPrice: { color: Colors.textMuted, fontSize: FontSize.xs, textDecorationLine: 'line-through' },
  saveBadge: { backgroundColor: Colors.accent, paddingHorizontal: 6, paddingVertical: 1, borderRadius: BorderRadius.full },
  saveText: { color: '#1A1A2E', fontSize: 9, fontWeight: '800' },
  dropHint: { color: Colors.success, fontSize: FontSize.xs, fontWeight: '600', marginBottom: 4 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  platformChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.full },
  platformText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  alertChip: { backgroundColor: Colors.warning + '25', paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.full },
  alertChipText: { color: Colors.warning, fontSize: 9, fontWeight: '600' },
  removeBtn: { marginLeft: 'auto', paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  removeBtnText: { color: Colors.error, fontSize: FontSize.xs, fontWeight: '700' },
  cardUnavailable: { opacity: 0.7 },
  priceUnavailable: { color: Colors.textMuted, textDecorationLine: 'line-through' },
  unavailableHint: { color: Colors.warning, fontSize: FontSize.xs, fontWeight: '600', marginBottom: 4 },
  missingNote: { gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border },
  missingText: { color: Colors.textMuted, fontSize: FontSize.xs, lineHeight: 17 },
});
