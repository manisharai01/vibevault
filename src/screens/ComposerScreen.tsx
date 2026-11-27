// ============================================================
// VibeVault – Stylist
// Outfits: complete looks from live listings that fit the user's
// style profile, colours, occasions and budget, each with the
// reasons it works. Capsule: a small wardrobe in one palette that
// mixes into many outfits. Deterministic — "Next look" walks down
// the ranking instead of reshuffling.
// ============================================================

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';
import { COLOR_FAMILY_LABELS, COLOR_FAMILY_SWATCH, OCCASION_LABELS, STYLE_ARCHETYPES } from '../constants/marketplaces';
import { useStore } from '../store/useStore';
import { useAvailableItems } from '../store/hooks';
import { FashionItem, Occasion, StyleArchetype } from '../types';
import { ComposeStackParamList, RootTabParamList } from '../navigation/types';
import ChipRow from '../components/common/ChipRow';
import CatalogStatusBanner from '../components/common/CatalogStatusBanner';
import EmptyState from '../components/common/EmptyState';
import GradientCard from '../components/common/GradientCard';
import ProductImage from '../components/common/ProductImage';
import ScreenHeader from '../components/common/ScreenHeader';
import { refreshAndNotify } from '../services/lifecycle';
import { buildCapsule, buildOutfits, Outfit, OutfitPiece, SLOT_LABELS } from '../services/composer';
import { formatTotal } from '../services/catalog';
import { getBuyAdvice } from '../services/priceEngine';
import { formatMoney } from '../utils/format';
import { notify } from '../utils/dialog';
import { shareText } from '../utils/share';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<ComposeStackParamList, 'ComposeMain'>,
  BottomTabNavigationProp<RootTabParamList>
>;

type Tab = 'outfits' | 'capsule';
const OUTFITS_SHOWN = 5;

export default function ComposerScreen() {
  const navigation = useNavigation<Nav>();
  const items = useAvailableItems();
  const { profile, isProfileComplete, rates } = useStore(
    useShallow((s) => ({ profile: s.profile, isProfileComplete: s.isProfileComplete, rates: s.fxRates })),
  );
  const [tab, setTab] = useState<Tab>('outfits');
  const [occasion, setOccasion] = useState<'Any' | Occasion>('Any');
  const [style, setStyle] = useState<'Any' | StyleArchetype>('Any');
  const [index, setIndex] = useState(0);

  const wishlist = useMemo(() => new Set(profile.wishlist), [profile.wishlist]);
  const occasionOptions: ('Any' | Occasion)[] = ['Any', ...(profile.occasions.length ? profile.occasions : (Object.keys(OCCASION_LABELS) as Occasion[]))];
  const styleOptions: ('Any' | StyleArchetype)[] = ['Any', ...profile.styleArchetypes, ...STYLE_ARCHETYPES.filter((s) => !profile.styleArchetypes.includes(s))];

  const outfits = useMemo(
    () =>
      tab === 'outfits'
        ? buildOutfits(
            items,
            profile,
            { wishlist, rates, occasion: occasion === 'Any' ? null : occasion, style: style === 'Any' ? null : style },
            OUTFITS_SHOWN,
          )
        : [],
    [tab, items, profile, wishlist, rates, occasion, style],
  );
  const capsule = useMemo(() => (tab === 'capsule' ? buildCapsule(items, profile, { wishlist, rates }) : null), [tab, items, profile, wishlist, rates]);

  const outfit = outfits.length ? outfits[index % outfits.length] : null;
  const atLastLook = outfits.length > 0 && index % outfits.length === outfits.length - 1;
  const retry = () => {
    refreshAndNotify({ force: true }).catch(() => undefined);
  };
  const openItem = (item: FashionItem) => navigation.navigate('ItemDetail', { itemId: item.id });

  const share = async (look: Outfit) => {
    const lines = look.pieces.map(
      (p) => `• ${SLOT_LABELS[p.slot]}: ${p.item.title} — ${formatMoney(p.item.currentPrice, p.item.currency)} on ${p.item.siteName}\n  ${p.item.productUrl}`,
    );
    const message = `My VibeVault look${look.archetype ? ` (${look.archetype})` : ''}:\n${lines.join('\n')}\nTotal: ${formatTotal(look.total, look.pieces.length)}`;
    const result = await shareText('My VibeVault look', message);
    if (result === 'copied') notify('Copied!', 'Your look has been copied to the clipboard.');
    if (result === 'unavailable') notify('Sharing unavailable', 'Sharing is not supported on this device.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
      <ScreenHeader title="Your Stylist" subtitle="Complete looks and a capsule wardrobe from live listings, built around your profile." />

      <View style={styles.tabs} accessibilityRole="tablist">
        {(['outfits', 'capsule'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            aria-selected={tab === t}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === 'outfits' ? '👗 Outfits' : '🧳 Capsule wardrobe'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!isProfileComplete && (
        <TouchableOpacity style={styles.profileHint} onPress={() => navigation.navigate('Profiler')} accessibilityRole="button">
          <Ionicons name="sparkles" size={18} color={Colors.primaryLight} />
          <Text style={styles.profileHintText}>Take the Style Profiler so looks follow your style, colours, fit and budget.</Text>
        </TouchableOpacity>
      )}

      {items.length === 0 ? (
        <CatalogStatusBanner itemCount={0} onRetry={retry} />
      ) : tab === 'outfits' ? (
        <>
          <ChipRow
            options={occasionOptions}
            selected={occasion}
            onSelect={(o) => {
              setOccasion(o);
              setIndex(0);
            }}
            getLabel={(o) => (o === 'Any' ? 'Any occasion' : OCCASION_LABELS[o])}
            accessibilityLabel="Occasion"
            compact
          />
          <ChipRow
            options={styleOptions}
            selected={style}
            onSelect={(s) => {
              setStyle(s);
              setIndex(0);
            }}
            getLabel={(s) => (s === 'Any' ? 'Any style' : s)}
            accessibilityLabel="Style"
            compact
          />
          {!outfit ? (
            <EmptyState
              icon="shirt-outline"
              title="Not enough pieces for a full look"
              message="Try another occasion or style — or save pieces from Discover and they'll be used first."
              actionLabel="Browse Discover"
              onAction={() => navigation.navigate('Discover')}
            />
          ) : (
            <>
              <GradientCard style={styles.summaryCard}>
                <Text style={styles.sectionTitle}>
                  Look {(index % outfits.length) + 1} of {outfits.length}
                  {outfit.archetype ? ` · ${outfit.archetype}` : ''}
                </Text>
                <Text style={styles.summaryText}>
                  {outfit.pieces.length} pieces · {formatTotal(outfit.total, outfit.pieces.length)} total
                </Text>
                {outfit.reasons.map((r) => (
                  <Text key={r} style={styles.reason}>
                    ✓ {r}
                  </Text>
                ))}
                {outfit.accents.length > 0 && (
                  <View style={styles.paletteRow}>
                    {outfit.accents.map((a) => (
                      <View key={a} style={[styles.paletteDot, { backgroundColor: COLOR_FAMILY_SWATCH[a] }]} accessibilityLabel={COLOR_FAMILY_LABELS[a]} />
                    ))}
                  </View>
                )}
                <View style={styles.actionRow}>
                  {outfits.length > 1 && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => setIndex((i) => i + 1)} accessibilityRole="button">
                      <Ionicons name={atLastLook ? 'refresh' : 'arrow-forward'} size={16} color={Colors.primaryLight} />
                      <Text style={styles.actionText}>{atLastLook ? 'Back to look 1' : 'Next look'}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.actionBtn} onPress={() => share(outfit)} accessibilityRole="button" accessibilityLabel="Share look">
                    <Ionicons name="share-outline" size={16} color={Colors.primaryLight} />
                    <Text style={styles.actionText}>Share</Text>
                  </TouchableOpacity>
                </View>
              </GradientCard>
              {outfit.pieces.map((piece) => (
                <PieceRow key={`${piece.slot}-${piece.item.id}`} piece={piece} onPress={() => openItem(piece.item)} />
              ))}
            </>
          )}
        </>
      ) : !capsule ? (
        <EmptyState icon="shirt-outline" title="Not enough pieces yet" message="A capsule needs a few tops, bottoms and shoes in your sections." />
      ) : (
        <>
          <GradientCard style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>
              {capsule.pieces.length} pieces → {capsule.outfitCount} outfits
            </Text>
            <Text style={styles.summaryText}>{formatTotal(capsule.total, capsule.pieces.length)} for the whole capsule</Text>
            <Text style={styles.reason}>
              Palette: {[...capsule.palette.neutrals, ...capsule.palette.accents].map((c) => COLOR_FAMILY_LABELS[c]).join(', ') || 'mixed'}
            </Text>
            <View style={styles.paletteRow}>
              {[...capsule.palette.neutrals, ...capsule.palette.accents].map((c) => (
                <View key={c} style={[styles.paletteDot, { backgroundColor: COLOR_FAMILY_SWATCH[c] }]} accessibilityLabel={COLOR_FAMILY_LABELS[c]} />
              ))}
            </View>
            <Text style={styles.footnote}>
              Pieces are chosen one at a time for how well they match you and how many new outfits they make with the rest. Outfits count combinations
              whose colours, prints and formality don’t clash.
            </Text>
          </GradientCard>
          {capsule.pieces.map((piece) => (
            <PieceRow key={`${piece.slot}-${piece.item.id}`} piece={piece} onPress={() => openItem(piece.item)} />
          ))}
          {capsule.examples.length > 0 && (
            <GradientCard style={styles.summaryCard}>
              <Text style={styles.sectionTitle}>Outfits from your capsule</Text>
              {capsule.examples.map((look, i) => (
                <Text key={i} style={styles.exampleText}>
                  {i + 1}. {look.pieces.map((p) => p.item.title.split(' ').slice(0, 4).join(' ')).join(' + ')}
                </Text>
              ))}
            </GradientCard>
          )}
        </>
      )}
    </ScrollView>
  );
}

function PieceRow({ piece, onPress }: { piece: OutfitPiece; onPress: () => void }) {
  const { item } = piece;
  const advice = getBuyAdvice(item);
  return (
    <TouchableOpacity
      style={styles.itemCard}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${SLOT_LABELS[piece.slot]}: ${item.title}, ${formatMoney(item.currentPrice, item.currency)}`}
    >
      <ProductImage uri={item.image} style={styles.itemImage} category={item.category} colors={item.colors} iconSize={20} />
      <View style={{ flex: 1 }}>
        <View style={styles.slotRow}>
          <Text style={styles.slotLabel}>{SLOT_LABELS[piece.slot]}</Text>
          {piece.fromWishlist && <Text style={styles.savedBadge}>❤️ Saved</Text>}
        </View>
        <Text style={styles.itemTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.itemMeta} numberOfLines={1}>
          {item.siteName} · {item.secondhand ? item.condition : 'New'}
          {item.matchReasons[0] ? ` · ${item.matchReasons[0]}` : ''}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.itemPrice}>{formatMoney(item.currentPrice, item.currency)}</Text>
          {advice && (
            <Text style={[styles.adviceTag, advice.verdict === 'buy' ? styles.adviceBuy : advice.verdict === 'wait' ? styles.adviceWait : null]}>
              {advice.verdict === 'buy' ? 'Buy now' : advice.verdict === 'wait' ? 'Likely cheaper soon' : 'Hard to call'}
            </Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabs: { flexDirection: 'row', marginHorizontal: Spacing.lg, marginTop: Spacing.md, backgroundColor: Colors.surface, borderRadius: BorderRadius.full, padding: 4 },
  tab: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.primaryDark },
  tabText: { color: Colors.textMuted, fontWeight: '700', fontSize: FontSize.sm },
  tabTextActive: { color: Colors.textPrimary },
  profileHint: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  profileHintText: { flex: 1, color: Colors.textSecondary, fontSize: FontSize.sm },
  summaryCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.md },
  sectionTitle: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700' },
  summaryText: { color: Colors.textSecondary, marginTop: 6, fontSize: FontSize.md },
  reason: { color: Colors.textSecondary, marginTop: 4, fontSize: FontSize.sm },
  footnote: { color: Colors.textMuted, marginTop: Spacing.sm, fontSize: FontSize.xs, lineHeight: 16 },
  exampleText: { color: Colors.textSecondary, marginTop: 6, fontSize: FontSize.sm },
  paletteRow: { flexDirection: 'row', gap: 6, marginTop: Spacing.sm },
  paletteDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
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
  itemImage: { width: 64, height: 64, borderRadius: BorderRadius.sm },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  slotLabel: { color: Colors.primaryLight, fontSize: FontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  savedBadge: { color: Colors.accent, fontSize: FontSize.xs, fontWeight: '700' },
  itemTitle: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700', marginTop: 2 },
  itemMeta: { color: Colors.textMuted, marginTop: 2, fontSize: FontSize.xs },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  itemPrice: { color: Colors.success, fontWeight: '800' },
  adviceTag: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted },
  adviceBuy: { color: Colors.success },
  adviceWait: { color: Colors.warning },
});
