// ============================================================
// VibeVault – Wardrobe Composer
// Builds complete outfits, preferring wishlist pieces for each
// slot and filling gaps with personalised recommendations.
// ============================================================

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';
import { STYLE_ARCHETYPES } from '../constants/marketplaces';
import { useStore } from '../store/useStore';
import { useAvailableItems } from '../store/hooks';
import { FashionItem, StyleArchetype } from '../types';
import { ComposeStackParamList, RootTabParamList } from '../navigation/types';
import ChipRow from '../components/common/ChipRow';
import CatalogStatusBanner from '../components/common/CatalogStatusBanner';
import EmptyState from '../components/common/EmptyState';
import { refreshAndNotify } from '../services/lifecycle';
import GradientCard from '../components/common/GradientCard';
import ProductImage from '../components/common/ProductImage';
import ScreenHeader from '../components/common/ScreenHeader';
import { composeLook, LookSlot, SLOT_LABELS } from '../services/composer';
import { hashString } from '../utils/random';
import { formatInrTotal, totalInInr } from '../services/catalog';
import { formatMoney } from '../utils/format';
import { notify } from '../utils/dialog';
import { shareText } from '../utils/share';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<ComposeStackParamList, 'ComposeMain'>,
  BottomTabNavigationProp<RootTabParamList>
>;

const STYLE_OPTIONS: ('All' | StyleArchetype)[] = ['All', ...STYLE_ARCHETYPES];

export default function ComposerScreen() {
  const navigation = useNavigation<Nav>();
  const recommendedItems = useAvailableItems();
  const { wishlist, topStyle } = useStore(
    useShallow((s) => ({
      wishlist: s.profile.wishlist,
      topStyle: s.profile.styleArchetypes[0],
    })),
  );
  const [styleFilter, setStyleFilter] = useState<'All' | StyleArchetype>('All');
  const [shuffle, setShuffle] = useState(0);
  const retry = () => {
    refreshAndNotify({ force: true }).catch(() => undefined);
  };

  const wishlistSet = useMemo(() => new Set(wishlist), [wishlist]);
  const candidates = useMemo(
    () => (styleFilter === 'All' ? recommendedItems : recommendedItems.filter((i) => i.styleArchetypes.includes(styleFilter))),
    [recommendedItems, styleFilter],
  );
  const look = useMemo(
    () => composeLook(candidates, wishlistSet, hashString(`${styleFilter}:${shuffle}`)),
    [candidates, wishlistSet, styleFilter, shuffle],
  );

  const pieces = look.filter((slot): slot is LookSlot & { item: FashionItem } => slot.item !== null);
  const total = formatInrTotal(
    totalInInr(pieces.map((slot) => slot.item)),
    pieces.length,
  );
  const fromWishlist = pieces.filter((slot) => slot.fromWishlist).length;

  const handleShare = async () => {
    const lines = pieces.map(
      (slot) =>
        `• ${SLOT_LABELS[slot.key]}: ${slot.item.title} — ${formatMoney(slot.item.currentPrice, slot.item.currency)} on ${slot.item.platform}\n  ${slot.item.productUrl}`,
    );
    const message = `My VibeVault look${styleFilter !== 'All' ? ` (${styleFilter})` : ''}:\n${lines.join('\n')}\nTotal: ${total}`;
    const result = await shareText('My VibeVault look', message);
    if (result === 'copied') notify('Copied!', 'Your look has been copied to the clipboard.');
    if (result === 'unavailable') notify('Sharing unavailable', 'Sharing is not supported on this device.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
      <ScreenHeader
        title="Wardrobe Composer"
        subtitle={`Complete looks built from your saved pieces${topStyle ? ` and ${topStyle} picks` : ' and recommendations'}.`}
      />

      <ChipRow options={STYLE_OPTIONS} selected={styleFilter} onSelect={setStyleFilter} accessibilityLabel="Style" compact />

      {recommendedItems.length === 0 ? (
        <CatalogStatusBanner itemCount={0} onRetry={retry} />
      ) : pieces.length === 0 ? (
        <EmptyState
          icon="shirt-outline"
          title="No pieces for this style yet"
          message="Try another style, or save more items from Discover."
          actionLabel="Browse Discover"
          onAction={() => navigation.navigate('Discover')}
        />
      ) : (
        <>
          <GradientCard style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Current Look</Text>
                <Text style={styles.summaryText}>
                  {pieces.length} {pieces.length === 1 ? 'piece' : 'pieces'} · {total} total
                </Text>
                <Text style={styles.summaryMeta}>
                  {fromWishlist > 0 ? `${fromWishlist} from your wishlist` : 'Save items to see them here first'}
                </Text>
              </View>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => setShuffle((n) => n + 1)}
                accessibilityRole="button"
                accessibilityLabel="Shuffle look"
              >
                <Ionicons name="shuffle" size={16} color={Colors.primaryLight} />
                <Text style={styles.actionText}>Shuffle</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={handleShare} accessibilityRole="button" accessibilityLabel="Share look">
                <Ionicons name="share-outline" size={16} color={Colors.primaryLight} />
                <Text style={styles.actionText}>Share</Text>
              </TouchableOpacity>
            </View>
          </GradientCard>

          {look.map((slot) =>
            slot.item ? (
              <TouchableOpacity
                key={slot.key}
                style={styles.itemCard}
                onPress={() => navigation.navigate('ItemDetail', { itemId: slot.item!.id })}
                accessibilityRole="button"
                accessibilityLabel={`${SLOT_LABELS[slot.key]}: ${slot.item.title}, ${formatMoney(slot.item.currentPrice, slot.item.currency)}`}
              >
                <ProductImage uri={slot.item.image} style={styles.itemImage} category={slot.item.category} colors={slot.item.colors} iconSize={20} />
                <View style={{ flex: 1 }}>
                  <View style={styles.slotRow}>
                    <Text style={styles.slotLabel}>{SLOT_LABELS[slot.key]}</Text>
                    {slot.fromWishlist && <Text style={styles.savedBadge}>❤️ Saved</Text>}
                  </View>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {slot.item.title}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {slot.item.platform} · {slot.item.secondhand ? slot.item.condition : 'New'}
                  </Text>
                  <Text style={styles.itemPrice}>{formatMoney(slot.item.currentPrice, slot.item.currency)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : (
              <View key={slot.key} style={[styles.itemCard, styles.emptySlot]}>
                <Ionicons name="add-circle-outline" size={22} color={Colors.textMuted} />
                <Text style={styles.emptySlotText}>
                  No {SLOT_LABELS[slot.key].toLowerCase()} matches {styleFilter === 'All' ? 'yet' : `the ${styleFilter} style yet`}
                </Text>
              </View>
            ),
          )}

          <TouchableOpacity onPress={() => setShuffle((n) => n + 1)} activeOpacity={0.85} style={styles.bigShuffle} accessibilityRole="button">
            <LinearGradient colors={Colors.gradientPrimary} style={styles.bigShuffleInner}>
              <Text style={styles.bigShuffleText}>🔀 Compose Another Look</Text>
            </LinearGradient>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  summaryCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700' },
  summaryText: { color: Colors.textSecondary, marginTop: 6, fontSize: FontSize.md },
  summaryMeta: { color: Colors.textMuted, marginTop: 2, fontSize: FontSize.xs },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  actionText: { color: Colors.primaryLight, fontSize: FontSize.sm, fontWeight: '700' },
  itemCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    padding: Spacing.md,
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  emptySlot: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  emptySlotText: { flex: 1, color: Colors.textMuted, fontSize: FontSize.sm },
  itemImage: { width: 64, height: 64, borderRadius: BorderRadius.sm },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  slotLabel: { color: Colors.primaryLight, fontSize: FontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  savedBadge: { color: Colors.accent, fontSize: FontSize.xs, fontWeight: '700' },
  itemTitle: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700', marginTop: 2 },
  itemMeta: { color: Colors.textMuted, marginTop: 2, fontSize: FontSize.xs },
  itemPrice: { color: Colors.success, marginTop: 4, fontWeight: '800' },
  bigShuffle: { marginHorizontal: Spacing.lg, marginTop: Spacing.md, borderRadius: BorderRadius.md, overflow: 'hidden' },
  bigShuffleInner: { paddingVertical: Spacing.md, alignItems: 'center' },
  bigShuffleText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '800' },
});
