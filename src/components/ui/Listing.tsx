// ============================================================
// VibeVault – Listing presentations
//   ListingCard: image-first grid / rail card with save button and
//                a when-to-buy badge.
//   ListingRow:  compact row for lists (deals, alerts, wardrobe).
//   TimingBadge: "Buy now" / "Wait for Dec" / "Sale 5 Dec".
// ============================================================

import React from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BorderRadius, Colors, Fonts, FontSize, PLATFORM_COLORS, Spacing } from '../../constants/theme';
import { BuyTiming } from '../../services/buyTiming';
import { isMultiStoreSource } from '../../services/linking';
import { FashionItem } from '../../types';
import { formatMoney } from '../../utils/format';
import ProductImage from '../common/ProductImage';

export function TimingBadge({ timing, style }: { timing: BuyTiming | null; style?: StyleProp<ViewStyle> }) {
  if (!timing?.badge) return null;
  const tone =
    timing.kind === 'buy-now' ? styles.badgeBuy : timing.kind === 'wait-sale' ? styles.badgeOffer : styles.badgeWait;
  const text = timing.kind === 'buy-now' ? styles.badgeTextBuy : timing.kind === 'wait-sale' ? styles.badgeTextOffer : styles.badgeTextWait;
  const icon = timing.kind === 'buy-now' ? 'checkmark-circle' : timing.kind === 'wait-sale' ? 'pricetag' : 'time';
  return (
    <View style={[styles.badge, tone, style]}>
      <Ionicons name={icon} size={11} color={(text as { color: string }).color} />
      <Text style={[styles.badgeText, text]} numberOfLines={1}>
        {timing.badge}
      </Text>
    </View>
  );
}

/** Store name shown on a listing (Google Shopping listings show the actual shop). */
export function storeName(item: FashionItem): string {
  return isMultiStoreSource(item.source) && item.seller ? item.seller : item.siteName;
}

export function listingLabel(item: FashionItem, showMatch: boolean): string {
  return `${item.title}, ${formatMoney(item.currentPrice, item.currency)} on ${item.platform}${showMatch ? `, ${item.matchScore}% match` : ''}`;
}

interface ListingCardProps {
  item: FashionItem;
  timing: BuyTiming | null;
  saved: boolean;
  showMatch: boolean;
  onOpen: (itemId: string) => void;
  onToggleSave: (itemId: string) => void;
  width?: number;
  style?: StyleProp<ViewStyle>;
}

export const ListingCard = React.memo(function ListingCard({ item, timing, saved, showMatch, onOpen, onToggleSave, width, style }: ListingCardProps) {
  const discount = item.originalPrice ? Math.round((1 - item.currentPrice / item.originalPrice) * 100) : 0;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onOpen(item.id)}
      style={[styles.card, width ? { width } : null, style]}
      accessibilityRole="button"
      accessibilityLabel={listingLabel(item, showMatch)}
      accessibilityActions={[{ name: 'activate' }, { name: 'toggleSave', label: saved ? 'Remove from wishlist' : 'Save to wishlist' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'toggleSave') onToggleSave(item.id);
        else onOpen(item.id);
      }}
    >
      <View style={styles.imageWrap}>
        <ProductImage uri={item.image} style={styles.image} category={item.category} colors={item.colors} iconSize={34} />
        <TouchableOpacity
          style={styles.save}
          onPress={() => onToggleSave(item.id)}
          accessibilityRole="button"
          accessibilityLabel={saved ? `Remove ${item.title} from wishlist` : `Save ${item.title} to wishlist`}
          aria-selected={saved}
          hitSlop={8}
        >
          <Ionicons name={saved ? 'heart' : 'heart-outline'} size={18} color={saved ? Colors.offer : Colors.ink} />
        </TouchableOpacity>
        {showMatch ? (
          <View style={styles.match}>
            <Text style={styles.matchText}>{item.matchScore}%</Text>
          </View>
        ) : null}
        <TimingBadge timing={timing} style={styles.timing} />
      </View>
      <View style={styles.info}>
        <View style={styles.storeRow}>
          <View style={[styles.dot, { backgroundColor: PLATFORM_COLORS[item.source] ?? Colors.textMuted }]} />
          <Text style={styles.store} numberOfLines={1}>
            {storeName(item)}
            {item.secondhand ? ' · Pre-owned' : ''}
          </Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatMoney(item.currentPrice, item.currency)}</Text>
          {item.originalPrice ? <Text style={styles.original}>{formatMoney(item.originalPrice, item.currency)}</Text> : null}
          {discount >= 10 ? <Text style={styles.discount}>−{discount}%</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
});

interface ListingRowProps {
  item: FashionItem;
  onPress: () => void;
  /** Extra line under the title (e.g. advice or alert status). */
  note?: string | null;
  noteTone?: 'buy' | 'wait' | 'muted' | 'offer';
  /** Shown above the title (e.g. "TOP" in a look). */
  eyebrow?: string;
  timing?: BuyTiming | null;
  accessibilityLabel?: string;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ListingRow({ item, onPress, note, noteTone = 'muted', eyebrow, timing, accessibilityLabel, right, style }: ListingRowProps) {
  return (
    <TouchableOpacity
      style={[styles.row, !item.available && styles.rowGone, style]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? listingLabel(item, false)}
    >
      <ProductImage uri={item.image} style={styles.rowImage} category={item.category} colors={item.colors} iconSize={20} />
      <View style={styles.rowInfo}>
        {eyebrow ? <Text style={styles.rowEyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {storeName(item)} · {item.secondhand ? item.condition : 'New'}
        </Text>
        <View style={styles.rowPriceLine}>
          <Text style={[styles.rowPrice, !item.available && styles.priceGone]}>{formatMoney(item.currentPrice, item.currency)}</Text>
          <TimingBadge timing={timing ?? null} />
        </View>
        {note ? (
          <Text style={[styles.rowNote, NOTE_TONES[noteTone]]} numberOfLines={2}>
            {note}
          </Text>
        ) : null}
      </View>
      {right ?? <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />}
    </TouchableOpacity>
  );
}

const NOTE_TONES = StyleSheet.create({
  buy: { color: Colors.buy },
  wait: { color: Colors.wait },
  offer: { color: Colors.offer },
  muted: { color: Colors.textSecondary },
});

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.full },
  badgeBuy: { backgroundColor: Colors.buyTint },
  badgeWait: { backgroundColor: Colors.waitTint },
  badgeOffer: { backgroundColor: Colors.offerTint },
  badgeText: { fontFamily: Fonts.semibold, fontSize: 11 },
  badgeTextBuy: { color: Colors.buy },
  badgeTextWait: { color: Colors.wait },
  badgeTextOffer: { color: Colors.offer },

  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  imageWrap: { aspectRatio: 3 / 4, backgroundColor: Colors.surfaceMuted },
  image: { width: '100%', height: '100%' },
  save: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  match: { position: 'absolute', top: Spacing.sm, left: Spacing.sm, backgroundColor: Colors.ink, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 3 },
  matchText: { fontFamily: Fonts.semibold, fontSize: 11, color: Colors.textInverse },
  timing: { position: 'absolute', left: Spacing.sm, bottom: Spacing.sm },
  info: { padding: Spacing.md, gap: 4 },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  store: { fontFamily: Fonts.medium, fontSize: 11, color: Colors.textMuted, flexShrink: 1, letterSpacing: 0.3 },
  title: { fontFamily: Fonts.medium, fontSize: FontSize.sm, lineHeight: 18, color: Colors.ink, minHeight: 36 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  price: { fontFamily: Fonts.semibold, fontSize: FontSize.md, color: Colors.ink },
  original: { fontFamily: Fonts.regular, fontSize: 12, color: Colors.textMuted, textDecorationLine: 'line-through' },
  discount: { fontFamily: Fonts.semibold, fontSize: 12, color: Colors.offer },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
    paddingRight: Spacing.md,
  },
  rowGone: { opacity: 0.65 },
  rowImage: { width: 76, height: 96, borderRadius: BorderRadius.sm },
  rowInfo: { flex: 1, gap: 3 },
  rowEyebrow: { fontFamily: Fonts.semibold, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: Colors.textMuted },
  rowTitle: { fontFamily: Fonts.medium, fontSize: FontSize.md, color: Colors.ink },
  rowMeta: { fontFamily: Fonts.regular, fontSize: 12, color: Colors.textMuted },
  rowPriceLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  rowPrice: { fontFamily: Fonts.semibold, fontSize: FontSize.md, color: Colors.ink },
  priceGone: { color: Colors.textMuted, textDecorationLine: 'line-through' },
  rowNote: { fontFamily: Fonts.regular, fontSize: 12, lineHeight: 16 },
});
