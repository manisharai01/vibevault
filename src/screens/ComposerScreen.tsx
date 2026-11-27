// ============================================================
// VibeVault – Stylist
//   Wardrobe: a complete wardrobe planned from the user's sections,
//     occasions and personality — what they own, the live pieces
//     that fill each gap (with when to buy each), and how many
//     outfits it all makes.
//   Looks: complete outfits for any occasion or style, best first.
// Deterministic: nothing is random; "Next look" walks the ranking.
// ============================================================

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, Fonts, FontSize, Spacing, Type } from '../constants/theme';
import { COLOR_FAMILIES, COLOR_FAMILY_LABELS, COLOR_FAMILY_SWATCH, OCCASION_LABELS, STYLE_ARCHETYPES } from '../constants/marketplaces';
import { useStore } from '../store/useStore';
import { useAvailableItems, useUpcomingSales } from '../store/hooks';
import { ColorFamily, FashionItem, Occasion, StyleArchetype } from '../types';
import { ComposeStackParamList, RootTabParamList } from '../navigation/types';
import CatalogStatusBanner from '../components/common/CatalogStatusBanner';
import EmptyState from '../components/common/EmptyState';
import ProductImage from '../components/common/ProductImage';
import Button from '../components/ui/Button';
import { Card, PageTitle, Segmented, SectionHeader, Stat } from '../components/ui/Layout';
import { ListingRow } from '../components/ui/Listing';
import Pill, { PillRow } from '../components/ui/Pill';
import { ProgressRing, Sheet } from '../components/ui/Visuals';
import { refreshAndNotify } from '../services/lifecycle';
import { buildOutfits, buildWardrobe, Outfit, SLOT_LABELS, SLOT_SECTION, SLOTS, SlotKey } from '../services/composer';
import { BuyTiming, getBuyTiming } from '../services/buyTiming';
import { formatTotal, totalIn } from '../services/catalog';
import { colorFamilies } from '../services/itemTraits';
import { formatMoney } from '../utils/format';
import { notify } from '../utils/dialog';
import { shareText } from '../utils/share';

type Nav = CompositeNavigationProp<NativeStackNavigationProp<ComposeStackParamList, 'ComposeMain'>, BottomTabNavigationProp<RootTabParamList>>;
type Tab = 'wardrobe' | 'looks';
const LOOKS_SHOWN = 5;

export default function ComposerScreen() {
  const navigation = useNavigation<Nav>();
  const items = useAvailableItems();
  const sales = useUpcomingSales();
  const { profile, isProfileComplete, rates, ownedPieces, addOwnedPiece, removeOwnedPiece, toggleWishlist } = useStore(
    useShallow((s) => ({
      profile: s.profile,
      isProfileComplete: s.isProfileComplete,
      rates: s.fxRates,
      ownedPieces: s.ownedPieces,
      addOwnedPiece: s.addOwnedPiece,
      removeOwnedPiece: s.removeOwnedPiece,
      toggleWishlist: s.toggleWishlist,
    })),
  );
  const [tab, setTab] = useState<Tab>('wardrobe');
  const [occasion, setOccasion] = useState<'Any' | Occasion>('Any');
  const [style, setStyle] = useState<'Any' | StyleArchetype>('Any');
  const [index, setIndex] = useState(0);
  const [adding, setAdding] = useState<SlotKey | null>(null);
  const [ownName, setOwnName] = useState('');
  const [ownColors, setOwnColors] = useState<ColorFamily[]>([]);

  const wishlist = useMemo(() => new Set(profile.wishlist), [profile.wishlist]);
  const timingOf = useMemo(() => {
    const now = new Date();
    const cache = new Map<string, BuyTiming>();
    return (item: FashionItem) => {
      if (!cache.has(item.id)) cache.set(item.id, getBuyTiming(item, { now, upcomingSales: sales }));
      return cache.get(item.id)!;
    };
  }, [sales]);

  const wardrobe = useMemo(
    () => (tab === 'wardrobe' ? buildWardrobe(items, profile, { wishlist, rates, owned: ownedPieces }) : null),
    [tab, items, profile, wishlist, rates, ownedPieces],
  );
  const outfits = useMemo(
    () =>
      tab === 'looks'
        ? buildOutfits(items, profile, { wishlist, rates, occasion: occasion === 'Any' ? null : occasion, style: style === 'Any' ? null : style }, LOOKS_SHOWN)
        : [],
    [tab, items, profile, wishlist, rates, occasion, style],
  );
  const look = outfits.length ? outfits[index % outfits.length] : null;
  const atLastLook = outfits.length > 0 && index % outfits.length === outfits.length - 1;

  const occasionOptions: ('Any' | Occasion)[] = ['Any', ...(profile.occasions.length ? profile.occasions : (Object.keys(OCCASION_LABELS) as Occasion[]))];
  const styleOptions: ('Any' | StyleArchetype)[] = ['Any', ...profile.styleArchetypes, ...STYLE_ARCHETYPES.filter((s) => !profile.styleArchetypes.includes(s))];

  const openItem = (item: FashionItem) => navigation.navigate('ItemDetail', { itemId: item.id });
  const retry = () => {
    refreshAndNotify({ force: true }).catch(() => undefined);
  };

  const saveAll = (list: FashionItem[], what: string) => {
    const toSave = list.filter((i) => !wishlist.has(i.id));
    for (const i of toSave) toggleWishlist(i.id);
    notify(`${what} saved`, toSave.length ? `${toSave.length} piece${toSave.length === 1 ? '' : 's'} added to your wishlist.` : 'Every piece is already in your wishlist.');
  };

  const shareLook = async (outfit: Outfit) => {
    const lines = outfit.pieces.map(
      (p) => `• ${SLOT_LABELS[p.slot]}: ${p.item.title} — ${formatMoney(p.item.currentPrice, p.item.currency)} on ${p.item.siteName}\n  ${p.item.productUrl}`,
    );
    const message = `My VibeVault look${outfit.archetype ? ` (${outfit.archetype})` : ''}:\n${lines.join('\n')}\nTotal: ${formatTotal(outfit.total, outfit.pieces.length)}`;
    const result = await shareText('My VibeVault look', message);
    if (result === 'copied') notify('Copied', 'Your look has been copied to the clipboard.');
    if (result === 'unavailable') notify('Sharing unavailable', 'Sharing is not supported on this device.');
  };

  const markOwned = (item: FashionItem, slot: SlotKey) => {
    const piece = addOwnedPiece({ slot, title: `My ${SLOT_LABELS[slot].toLowerCase()} like “${item.title}”`.slice(0, 120), colors: colorFamilies(item), image: item.image });
    if (!piece) notify('Wardrobe full', 'Remove a few pieces you no longer have first.');
  };

  const openAdd = (slot: SlotKey) => {
    setOwnName('');
    setOwnColors([]);
    setAdding(slot);
  };
  const saveOwned = () => {
    if (!adding) return;
    const piece = addOwnedPiece({ slot: adding, title: ownName, colors: ownColors });
    if (!piece) {
      notify('Name it', 'Give the piece a short name, like “White linen shirt”.');
      return;
    }
    setAdding(null);
  };

  const timingTotals = useMemo(() => {
    if (!wardrobe) return null;
    const now = wardrobe.picks.filter((p) => timingOf(p.item).kind === 'buy-now').map((p) => p.item);
    const later = wardrobe.picks.filter((p) => ['wait-days', 'wait-month', 'wait-sale'].includes(timingOf(p.item).kind)).map((p) => p.item);
    return {
      now,
      later,
      nowTotal: totalIn(now, profile.currency, rates),
      laterTotal: totalIn(later, profile.currency, rates),
    };
  }, [wardrobe, timingOf, profile.currency, rates]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxxl }} keyboardShouldPersistTaps="handled">
        <PageTitle eyebrow="Your stylist" title={tab === 'wardrobe' ? 'Your wardrobe' : 'Looks for you'} subtitle="Built from your personality, colours and occasions — with live pieces and when to buy each." />
        <Segmented
          options={[
            { key: 'wardrobe', label: 'Whole wardrobe' },
            { key: 'looks', label: 'Outfits' },
          ]}
          value={tab}
          onChange={(t) => {
            setTab(t);
            setIndex(0);
          }}
        />

        {!isProfileComplete ? (
          <Card style={styles.block}>
            <Text style={Type.bodyStrong}>Make it yours</Text>
            <Text style={[Type.small, { marginTop: 4, marginBottom: Spacing.md }]}>
              Take the two-minute style quiz so the wardrobe follows your personality, colours, fit, occasions and budget.
            </Text>
            <Button label="Take the style quiz" onPress={() => navigation.navigate('Profiler')} />
          </Card>
        ) : null}

        {items.length === 0 && ownedPieces.length === 0 ? (
          <CatalogStatusBanner itemCount={0} onRetry={retry} />
        ) : tab === 'wardrobe' ? (
          !wardrobe ? (
            <EmptyState icon="shirt-outline" title="Not enough pieces yet" message="A wardrobe needs tops, bottoms and shoes in your sections. Check back after the next refresh." />
          ) : (
            <>
              <Card style={styles.block}>
                <View style={styles.summaryTop}>
                  <ProgressRing
                    progress={(wardrobe.ownedCount + wardrobe.picks.length) / Math.max(1, wardrobe.pieces)}
                    label={`${wardrobe.ownedCount + wardrobe.picks.length}/${wardrobe.pieces}`}
                    sublabel="pieces"
                    size={92}
                  />
                  <View style={{ flex: 1, gap: Spacing.sm }}>
                    <Text style={styles.summaryTitle}>{wardrobe.outfitCount} outfits</Text>
                    <Text style={Type.small}>
                      from {wardrobe.ownedCount} piece{wardrobe.ownedCount === 1 ? '' : 's'} you own and {wardrobe.picks.length} live pick{wardrobe.picks.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>
                <View style={styles.statsRow}>
                  <Stat value={formatTotal(wardrobe.total, wardrobe.picks.length)} label="All picks" />
                  {timingTotals ? <Stat value={formatTotal(timingTotals.nowTotal, timingTotals.now.length)} label={`Buy now · ${timingTotals.now.length}`} color={Colors.buy} /> : null}
                  {timingTotals ? <Stat value={formatTotal(timingTotals.laterTotal, timingTotals.later.length)} label={`Worth waiting · ${timingTotals.later.length}`} color={Colors.wait} /> : null}
                </View>
                <View style={styles.palette}>
                  {[...wardrobe.palette.neutrals, ...wardrobe.palette.accents].map((c) => (
                    <View key={c} style={styles.paletteItem}>
                      <View style={[styles.swatch, { backgroundColor: COLOR_FAMILY_SWATCH[c] }]} />
                      <Text style={Type.caption}>{COLOR_FAMILY_LABELS[c]}</Text>
                    </View>
                  ))}
                </View>
                {wardrobe.picks.length > 0 ? (
                  <Button label="Save every pick" variant="secondary" icon="heart-outline" onPress={() => saveAll(wardrobe.picks.map((p) => p.item), 'Wardrobe')} style={{ marginTop: Spacing.lg }} />
                ) : null}
              </Card>

              <Card tone="muted" style={styles.block}>
                <Text style={Type.eyebrow}>Why this plan</Text>
                <Text style={[Type.small, { marginTop: Spacing.sm }]}>
                  A complete {profile.shopFor === 'men' ? 'menswear' : profile.shopFor === 'women' ? 'womenswear' : ''} wardrobe of {wardrobe.pieces} pieces in one palette, so
                  everything mixes.
                </Text>
                {wardrobe.plan.reasons.map((r) => (
                  <Text key={r} style={[Type.small, { marginTop: 6 }]}>
                    · {r}
                  </Text>
                ))}
              </Card>

              {wardrobe.slots.map((slot) => {
                const have = slot.owned.length + slot.picks.length;
                const missing = Math.max(0, slot.target - have);
                return (
                  <View key={slot.slot}>
                    <SectionHeader
                      eyebrow={`${have} of ${slot.target}`}
                      title={SLOT_SECTION[slot.slot]}
                      action="I own one"
                      onAction={() => openAdd(slot.slot)}
                      actionLabel={`Add ${SLOT_SECTION[slot.slot].toLowerCase()} you own`}
                    />
                    <View style={styles.list}>
                      {slot.owned.map((piece) => (
                        <View key={piece.id} style={styles.ownedRow}>
                          {piece.image ? (
                            <ProductImage uri={piece.image} style={styles.ownedImage} iconSize={16} />
                          ) : (
                            <View style={[styles.ownedImage, styles.ownedSwatch, { backgroundColor: piece.colors[0] ? COLOR_FAMILY_SWATCH[piece.colors[0]] : Colors.surfaceMuted }]} />
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={Type.caption}>IN YOUR WARDROBE</Text>
                            <Text style={Type.bodyStrong} numberOfLines={2}>
                              {piece.title}
                            </Text>
                          </View>
                          <TouchableOpacity onPress={() => removeOwnedPiece(piece.id)} accessibilityRole="button" accessibilityLabel={`Remove ${piece.title} from your wardrobe`} hitSlop={8}>
                            <Ionicons name="close" size={20} color={Colors.textMuted} />
                          </TouchableOpacity>
                        </View>
                      ))}
                      {slot.picks.map((p) => (
                        <ListingRow
                          key={p.item.id}
                          item={p.item}
                          onPress={() => openItem(p.item)}
                          timing={timingOf(p.item)}
                          note={p.item.matchReasons[0] ?? null}
                          accessibilityLabel={`${SLOT_LABELS[slot.slot]}: ${p.item.title}, ${formatMoney(p.item.currentPrice, p.item.currency)}`}
                          right={
                            <TouchableOpacity
                              onPress={() => markOwned(p.item, slot.slot)}
                              accessibilityRole="button"
                              accessibilityLabel={`I own one like ${p.item.title}`}
                              hitSlop={8}
                              style={styles.ownButton}
                            >
                              <Ionicons name="checkmark-done-outline" size={18} color={Colors.ink} />
                            </TouchableOpacity>
                          }
                        />
                      ))}
                      {missing > 0 ? (
                        <Text style={styles.missing}>
                          {missing} more to find — nothing live fits your palette here yet. Saved pieces from Discover are used first.
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}

              {wardrobe.examples.length > 0 ? (
                <View>
                  <SectionHeader eyebrow="Mix and match" title="Outfits from your wardrobe" />
                  <View style={styles.list}>
                    {wardrobe.examples.map((ex, i) => (
                      <Card key={i}>
                        {ex.pieces.map((p) => (
                          <Text key={`${p.slot}-${p.title}`} style={[Type.small, { marginTop: 2 }]}>
                            <Text style={Type.smallStrong}>{SLOT_LABELS[p.slot]}</Text> · {p.title}
                            {p.owned ? <Text style={{ color: Colors.buy }}> (yours)</Text> : null}
                          </Text>
                        ))}
                      </Card>
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          )
        ) : (
          <>
            <View style={{ marginTop: Spacing.lg, gap: Spacing.sm }}>
              <PillRow options={occasionOptions} selected={occasion} onSelect={(o) => { setOccasion(o); setIndex(0); }} getLabel={(o) => (o === 'Any' ? 'Any occasion' : OCCASION_LABELS[o])} accessibilityLabel="Occasion" size="sm" />
              <PillRow options={styleOptions} selected={style} onSelect={(s) => { setStyle(s); setIndex(0); }} getLabel={(s) => (s === 'Any' ? 'Any style' : s)} accessibilityLabel="Style" size="sm" />
            </View>
            {!look ? (
              <EmptyState
                icon="shirt-outline"
                title="Not enough pieces for a full look"
                message="Try another occasion or style — or save pieces from Discover and they'll be used first."
                actionLabel="Browse Discover"
                onAction={() => navigation.navigate('Discover')}
              />
            ) : (
              <>
                <Card style={styles.block}>
                  <Text style={Type.eyebrow}>
                    Look {(index % outfits.length) + 1} of {outfits.length}
                    {look.archetype ? ` · ${look.archetype}` : ''}
                  </Text>
                  <View style={styles.collage}>
                    {look.pieces.slice(0, 4).map((p) => (
                      <ProductImage key={p.item.id} uri={p.item.image} style={styles.collageImage} category={p.item.category} colors={p.item.colors} iconSize={22} />
                    ))}
                  </View>
                  <Text style={styles.lookTotal}>{formatTotal(look.total, look.pieces.length)}</Text>
                  <Text style={Type.small}>
                    {look.pieces.length} pieces · total
                  </Text>
                  {look.reasons.map((r) => (
                    <Text key={r} style={[Type.small, { marginTop: 4 }]}>
                      ✓ {r}
                    </Text>
                  ))}
                  <View style={styles.actions}>
                    {outfits.length > 1 ? (
                      <Button label={atLastLook ? 'Back to look 1' : 'Next look'} icon={atLastLook ? 'refresh' : 'arrow-forward'} size="sm" onPress={() => setIndex((i) => i + 1)} />
                    ) : null}
                    <Button label="Save look" variant="secondary" size="sm" icon="heart-outline" onPress={() => saveAll(look.pieces.map((p) => p.item), 'Look')} />
                    <Button label="Share" variant="secondary" size="sm" icon="share-outline" accessibilityLabel="Share look" onPress={() => shareLook(look)} />
                  </View>
                </Card>
                <View style={styles.list}>
                  {look.pieces.map((p) => (
                    <ListingRow
                      key={`${p.slot}-${p.item.id}`}
                      item={p.item}
                      eyebrow={SLOT_LABELS[p.slot]}
                      onPress={() => openItem(p.item)}
                      timing={timingOf(p.item)}
                      note={p.fromWishlist ? 'From your wishlist' : p.item.matchReasons[0] ?? null}
                      accessibilityLabel={`${SLOT_LABELS[p.slot]}: ${p.item.title}, ${formatMoney(p.item.currentPrice, p.item.currency)}`}
                    />
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      <Sheet
        visible={adding !== null}
        title={adding ? `Add ${SLOT_LABELS[adding].toLowerCase()} you own` : ''}
        onClose={() => setAdding(null)}
        footer={<Button label="Add to wardrobe" onPress={saveOwned} disabled={!ownName.trim()} fullWidth style={{ marginTop: Spacing.sm }} />}
      >
        <Text style={styles.sheetLabel}>Kind</Text>
        <View style={styles.wrap}>
          {SLOTS.filter((s) => s !== 'dress' || profile.shopFor !== 'men').map((s) => (
            <Pill key={s} label={SLOT_LABELS[s]} selected={adding === s} onPress={() => setAdding(s)} role="radio" accessibilityLabel={`Kind: ${SLOT_LABELS[s]}`} />
          ))}
        </View>
        <Text style={styles.sheetLabel}>What is it?</Text>
        <TextInput
          style={styles.input}
          value={ownName}
          onChangeText={setOwnName}
          placeholder="e.g. White linen shirt"
          placeholderTextColor={Colors.textMuted}
          maxLength={80}
          accessibilityLabel="Name of the piece you own"
        />
        <Text style={styles.sheetLabel}>Colour</Text>
        <View style={styles.wrap}>
          {COLOR_FAMILIES.map((c) => (
            <Pill
              key={c}
              label={COLOR_FAMILY_LABELS[c]}
              dot={COLOR_FAMILY_SWATCH[c]}
              selected={ownColors.includes(c)}
              onPress={() => setOwnColors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c].slice(-2)))}
              role="checkbox"
              size="sm"
              accessibilityLabel={`Colour: ${COLOR_FAMILY_LABELS[c]}`}
            />
          ))}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  block: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg },
  list: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  summaryTitle: { ...Type.display, fontSize: 30, lineHeight: 34 },
  statsRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.lg },
  paletteItem: { alignItems: 'center', gap: 4 },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  ownedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.buyTint, borderRadius: BorderRadius.lg, padding: Spacing.sm, paddingRight: Spacing.md },
  ownedImage: { width: 56, height: 70, borderRadius: BorderRadius.sm },
  ownedSwatch: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  ownButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  missing: { ...Type.small, color: Colors.textMuted, paddingVertical: Spacing.sm },
  collage: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: Spacing.md, borderRadius: BorderRadius.md, overflow: 'hidden' },
  collageImage: { width: '49.3%', aspectRatio: 1 },
  lookTotal: { ...Type.display, fontSize: 30, marginTop: Spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.lg },
  sheetLabel: { ...Type.eyebrow, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  input: {
    height: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    fontFamily: Fonts.regular,
    fontSize: FontSize.md,
    color: Colors.ink,
  },
});
