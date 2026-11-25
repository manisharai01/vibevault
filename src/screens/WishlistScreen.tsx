// ============================================================
// VibeVault – Wishlist Screen
// Saved items with live prices, predicted drops and alerts.
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
import { formatPrice, formatPriceRounded, percentOff } from '../utils/format';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<ProfileStackParamList, 'Wishlist'>,
  BottomTabNavigationProp<RootTabParamList>
>;

export default function WishlistScreen() {
  const navigation = useNavigation<Nav>();
  const wishlistItems = useWishlistItems();
  const { isProfileComplete, priceAlerts, toggleWishlist } = useStore(
    useShallow((s) => ({ isProfileComplete: s.isProfileComplete, priceAlerts: s.priceAlerts, toggleWishlist: s.toggleWishlist })),
  );

  const alertItemIds = useMemo(() => new Set(priceAlerts.filter((a) => a.status === 'active').map((a) => a.itemId)), [priceAlerts]);
  const totalSavings = wishlistItems.reduce((sum, item) => sum + Math.max(0, item.originalPrice - item.currentPrice), 0);
  const avgMatch =
    wishlistItems.length > 0 ? Math.round(wishlistItems.reduce((sum, item) => sum + item.matchScore, 0) / wishlistItems.length) : 0;

  const renderItem = useCallback(
    ({ item }: { item: FashionItem }) => {
      const savePct = percentOff(item.currentPrice, item.originalPrice);
      const dropsSoon = item.predictedPrice7d < item.currentPrice * 0.99;
      return (
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}, ${formatPrice(item.currentPrice)}`}
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
              {item.brand} · {item.condition}
            </Text>
            <View style={styles.tagRow}>
              {item.styleArchetypes.slice(0, 2).map((s) => (
                <Tag key={s} label={s} color={STYLE_COLORS[s]} selected small />
              ))}
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.price}>{formatPrice(item.currentPrice)}</Text>
              <Text style={styles.originalPrice}>{formatPrice(item.originalPrice)}</Text>
              {savePct > 0 && (
                <View style={styles.saveBadge}>
                  <Text style={styles.saveText}>-{savePct}%</Text>
                </View>
              )}
            </View>
            {dropsSoon && <Text style={styles.dropHint}>📉 Predicted {formatPrice(item.predictedPrice7d)} in 7 days</Text>}
            <View style={styles.cardBottom}>
              <View style={[styles.platformChip, { backgroundColor: PLATFORM_COLORS[item.platform] || Colors.primary }]}>
                <Text style={styles.platformText}>{item.platform}</Text>
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
              <Text style={styles.statValue}>{formatPriceRounded(totalSavings)}</Text>
              <Text style={styles.statLabel}>Off retail</Text>
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
        ListEmptyComponent={
          <EmptyState
            icon="heart-outline"
            title="No saved items yet"
            message="Tap the heart on any item in Discover to save it here and track its price."
            actionLabel="✨ Browse Discover"
            onAction={() => navigation.navigate('Discover', { screen: 'DiscoverFeed', pop: true })}
          />
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
});
