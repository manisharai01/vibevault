// ============================================================
// VibeVault – Wishlist Screen
// Shows saved items with price change indicators and alerts.
// ============================================================

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, STYLE_COLORS, PLATFORM_COLORS } from '../constants/theme';
import { useStore } from '../store/useStore';
import { FashionItem } from '../types';
import Tag from '../components/common/Tag';
import { getDealScore } from '../services/priceEngine';

export default function WishlistScreen({ navigation }: any) {
  const { wishlistItems, profile, toggleWishlist, priceAlerts } = useStore();
  const insets = useSafeAreaInsets();

  const totalSavings = wishlistItems.reduce(
    (sum, item) => sum + (item.originalPrice - item.currentPrice),
    0,
  );
  const avgMatchScore =
    wishlistItems.length > 0
      ? Math.round(wishlistItems.reduce((s, i) => s + i.matchScore, 0) / wishlistItems.length)
      : 0;

  const renderItem = ({ item }: { item: FashionItem }) => {
    const hasAlert = priceAlerts.some((a) => a.itemId === item.id && a.active);
    const dealScore = getDealScore(item);
    const savePct = Math.round((1 - item.currentPrice / item.originalPrice) * 100);
    const priceDropSoon = item.predictedPrice7d < item.currentPrice;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('ItemDetail', { item })}
        activeOpacity={0.85}
      >
        <Image source={{ uri: item.image }} style={styles.cardImage} resizeMode="cover" />
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.cardBrand}>{item.brand} · {item.condition}</Text>

          <View style={styles.tagRow}>
            {item.styleArchetypes.slice(0, 2).map((s) => (
              <Tag key={s} label={s} color={STYLE_COLORS[s]} selected small />
            ))}
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.price}>${item.currentPrice.toFixed(2)}</Text>
            <Text style={styles.originalPrice}>${item.originalPrice.toFixed(2)}</Text>
            {savePct > 0 && (
              <View style={styles.saveBadge}>
                <Text style={styles.saveText}>-{savePct}%</Text>
              </View>
            )}
          </View>

          {priceDropSoon && (
            <Text style={styles.dropHint}>
              📉 Drops to ${item.predictedPrice7d.toFixed(2)} in 7d
            </Text>
          )}

          <View style={styles.cardBottom}>
            <View
              style={[styles.platformChip, { backgroundColor: PLATFORM_COLORS[item.platform] || Colors.primary }]}
            >
              <Text style={styles.platformText}>{item.platform}</Text>
            </View>
            {hasAlert && (
              <View style={styles.alertChip}>
                <Text style={styles.alertChipText}>🔔 Alert on</Text>
              </View>
            )}
            <TouchableOpacity onPress={() => toggleWishlist(item.id)} style={styles.removeBtn}>
              <Text style={styles.removeBtnText}>❌</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={[Colors.primaryDark, Colors.background]} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>❤️ Wishlist</Text>
        {wishlistItems.length > 0 && (
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{wishlistItems.length}</Text>
              <Text style={styles.statLabel}>Saved</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>${totalSavings.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Off Retail</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{avgMatchScore}%</Text>
              <Text style={styles.statLabel}>Avg Match</Text>
            </View>
          </View>
        )}
      </LinearGradient>

      {wishlistItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🤍</Text>
          <Text style={styles.emptyTitle}>No saved items yet</Text>
          <Text style={styles.emptyDesc}>
            Tap the heart icon on any item in the Discover feed to save it here.
          </Text>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <LinearGradient colors={Colors.gradientPrimary as [string, string]} style={styles.browseBtn}>
              <Text style={styles.browseBtnText}>✨ Browse Discover</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={wishlistItems}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.md,
  },
  backBtn: {
    marginBottom: Spacing.sm,
  },
  backText: {
    color: Colors.primaryLight,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: '800',
    marginBottom: Spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.xl,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: '800',
  },
  statLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
  },
  list: {
    padding: Spacing.lg,
    paddingBottom: 100,
    gap: Spacing.md,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.card,
  },
  cardImage: {
    width: 110,
    height: 130,
  },
  cardInfo: {
    flex: 1,
    padding: Spacing.md,
  },
  cardTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 4,
  },
  cardBrand: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginBottom: Spacing.xs,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: Spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 4,
  },
  price: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  originalPrice: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textDecorationLine: 'line-through',
  },
  saveBadge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
  },
  saveText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  dropHint: {
    color: Colors.success,
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  platformChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  platformText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  alertChip: {
    backgroundColor: Colors.warning + '25',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  alertChipText: {
    color: Colors.warning,
    fontSize: 9,
    fontWeight: '600',
  },
  removeBtn: {
    marginLeft: 'auto',
  },
  removeBtnText: {
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: '800',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptyDesc: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  browseBtn: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  browseBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
