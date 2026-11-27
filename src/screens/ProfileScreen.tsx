// ============================================================
// VibeVault – Profile
// Name, wishlist, level, shopping settings (country, currency,
// sections), what you've bought and saved, badges and data.
// ============================================================

import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, Fonts, FontSize, Spacing, Type } from '../constants/theme';
import { BADGES } from '../data/content';
import { COUNTRIES, countryFlag, countryName } from '../data/countries';
import { SHOP_FOR_LABELS } from '../constants/marketplaces';
import { useLevelInfo, useSustainability } from '../store/hooks';
import { MAX_NAME_LENGTH } from '../store/persistence';
import { useStore } from '../store/useStore';
import { Badge, ShopFor } from '../types';
import { ProfileStackParamList } from '../navigation/types';
import Button from '../components/ui/Button';
import { Card, SectionHeader, Stat } from '../components/ui/Layout';
import { Meter, Sheet } from '../components/ui/Visuals';
import { confirmAction, notify } from '../utils/dialog';
import { formatDate } from '../utils/date';
import { formatMoney, formatMoneyWhole, formatNumber } from '../utils/format';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const initialOf = (name: string) => (Array.from(name.trim())[0] ?? 'V').toUpperCase();

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList, 'ProfileMain'>>();
  const route = useRoute<RouteProp<ProfileStackParamList, 'ProfileMain'>>();
  const insets = useSafeAreaInsets();
  const { profile, isProfileComplete, purchases, streak, ownedCount, setName, resetAllData, setCountry, setCurrency, setShopFor, fxRates, availableMarkets, marketplaces } =
    useStore(
      useShallow((s) => ({
        profile: s.profile,
        isProfileComplete: s.isProfileComplete,
        purchases: s.purchases,
        streak: s.streak,
        ownedCount: s.ownedPieces.length,
        setName: s.setName,
        resetAllData: s.resetAllData,
        setCountry: s.setCountry,
        setCurrency: s.setCurrency,
        setShopFor: s.setShopFor,
        fxRates: s.fxRates,
        availableMarkets: s.availableMarkets,
        marketplaces: s.marketplaces,
      })),
    );
  const [picker, setPicker] = useState<'country' | 'currency' | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.name);

  // Other screens can open the country picker (e.g. Deals → coupons need a country).
  const requestedPicker = route.params?.pick;
  useEffect(() => {
    if (requestedPicker) {
      setPicker(requestedPicker);
      navigation.setParams({ pick: undefined });
    }
  }, [requestedPicker, navigation]);

  const liveCountries = new Set(availableMarkets.map((m) => m.market));
  const countryOptions = [...COUNTRIES].sort((a, b) => Number(liveCountries.has(b.code)) - Number(liveCountries.has(a.code)) || a.name.localeCompare(b.name));
  // Currencies the ECB publishes rates for (conversions need a rate), plus the user's own.
  const currencyOptions = [...new Set([profile.currency, ...Object.keys(fxRates ?? { EUR: 1 })])].sort();
  const attributions = marketplaces.filter((m) => m.availableListings > 0).map((m) => m.attribution).filter((a): a is string => !!a);
  const level = useLevelInfo();
  const impact = useSustainability();
  const earnedCount = BADGES.filter((b) => profile.earnedBadges[b.id]).length;

  const openNameEditor = () => {
    setNameDraft(profile.name);
    setEditingName(true);
  };
  const saveName = () => {
    if (setName(nameDraft)) setEditingName(false);
    else notify('Name required', 'Please enter a display name.');
  };
  const showBadge = (badge: Badge) => {
    const earned = profile.earnedBadges[badge.id];
    notify(badge.name, `${badge.description}\n\n${earned ? `Earned on ${formatDate(earned)}` : 'Not earned yet'} · ${badge.rarity}`);
  };
  const handleReset = () =>
    confirmAction({
      title: 'Reset all data?',
      message: 'This permanently deletes your style profile, wishlist, wardrobe, alerts, purchases, quest progress and badges on this device.',
      confirmText: 'Reset',
      destructive: true,
      onConfirm: () => {
        resetAllData();
        notify('Data reset', 'VibeVault has been reset to a fresh start.');
      },
    });

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Spacing.xxxl }}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.xl }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialOf(profile.name)}</Text>
        </View>
        <TouchableOpacity style={styles.nameRow} onPress={openNameEditor} accessibilityRole="button" accessibilityLabel={`Display name ${profile.name}. Tap to edit.`}>
          <Text style={styles.name} numberOfLines={1}>
            {profile.name}
          </Text>
          <Ionicons name="create-outline" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={Type.small}>{isProfileComplete ? profile.styleArchetypes.join(' · ') : 'Style quiz not taken yet'}</Text>
        <Text style={Type.caption}>Member since {formatDate(profile.joinedDate)}</Text>

        <TouchableOpacity style={styles.wishlist} onPress={() => navigation.navigate('Wishlist')} accessibilityRole="button" activeOpacity={0.85}>
          <Ionicons name="heart-outline" size={20} color={Colors.ink} />
          <View style={{ flex: 1 }}>
            <Text style={Type.bodyStrong}>Wishlist ({profile.wishlist.length})</Text>
            <Text style={Type.caption}>Your saved pieces, sorted by when to buy them</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Card style={styles.block}>
        <Text style={Type.eyebrow}>Level {level.level}</Text>
        <Text style={styles.cardTitle}>{level.title}</Text>
        <Meter value={level.progress} label="Level progress" />
        <Text style={[Type.caption, { marginTop: 6 }]}>
          {level.isMaxLevel ? `${formatNumber(profile.totalXP)} XP · max level` : `${level.xpIntoLevel} / ${level.xpForLevel} XP to the next level`} · {formatNumber(profile.points)} points
        </Text>
        <View style={styles.stats}>
          <Stat value={String(profile.completedQuests.length)} label="Quests done" />
          <Stat value={String(streak.current)} label="Day streak" />
          <Stat value={String(streak.longest)} label="Best streak" />
          <Stat value={String(ownedCount)} label="In wardrobe" />
        </View>
      </Card>

      <SectionHeader eyebrow="Settings" title="Shopping" />
      <Card style={styles.blockTight}>
        <TouchableOpacity style={styles.setting} onPress={() => setPicker('country')} accessibilityRole="button">
          <Text style={Type.body}>Country</Text>
          <Text style={Type.bodyStrong}>{profile.country ? `${countryFlag(profile.country)} ${countryName(profile.country)}` : 'Choose'} ›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.setting} onPress={() => setPicker('currency')} accessibilityRole="button">
          <Text style={Type.body}>Currency for totals & budget</Text>
          <Text style={Type.bodyStrong}>{profile.currency} ›</Text>
        </TouchableOpacity>
        <View style={[styles.setting, styles.settingLast]}>
          <Text style={Type.body}>Sections</Text>
          <View style={styles.segment}>
            {(['women', 'men', 'all'] as ShopFor[]).map((option) => {
              const on = (profile.shopFor ?? 'all') === option;
              return (
                <TouchableOpacity key={option} style={[styles.segmentBtn, on && styles.segmentOn]} onPress={() => setShopFor(option)} accessibilityRole="radio" aria-checked={on}>
                  <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{option === 'all' ? 'Both' : SHOP_FOR_LABELS[option]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Card>

      <SectionHeader eyebrow="What you’ve bought" title="Your shopping" />
      <Card style={styles.blockTight}>
        <View style={[styles.stats, { marginTop: 0 }]}>
          <Stat value={String(impact.purchases)} label="Purchases logged" />
          <Stat value={String(impact.itemsThrifted)} label="Pre-owned finds" color={Colors.buy} />
          <Stat value={formatMoneyWhole(impact.moneySaved, impact.currency)} label="Saved vs list price" />
        </View>
        <Text style={[Type.small, { marginTop: Spacing.md }]}>
          {impact.itemsThrifted > 0
            ? `${impact.itemsThrifted} garment${impact.itemsThrifted === 1 ? '' : 's'} kept in use instead of new ones being made.`
            : 'Log a purchase from any item page to start tracking what you spend and save.'}
        </Text>
        {purchases.slice(0, 5).map((p) => (
          <TouchableOpacity key={p.id} style={styles.purchase} onPress={() => navigation.navigate('ItemDetail', { itemId: p.itemId, tab: 'details' })} accessibilityRole="button">
            <View style={{ flex: 1 }}>
              <Text style={Type.bodyStrong} numberOfLines={1}>
                {p.title}
              </Text>
              <Text style={Type.caption}>
                {p.platform} · {formatDate(p.purchasedAt)} · {p.secondhand ? 'pre-owned' : 'new'}
              </Text>
            </View>
            <Text style={Type.bodyStrong}>{formatMoney(p.pricePaid, p.currency)}</Text>
          </TouchableOpacity>
        ))}
      </Card>

      <SectionHeader eyebrow={`${earnedCount} of ${BADGES.length} earned`} title="Badges" />
      <View style={styles.badges}>
        {BADGES.map((badge) => {
          const earned = !!profile.earnedBadges[badge.id];
          return (
            <TouchableOpacity
              key={badge.id}
              style={[styles.badge, !earned && styles.badgeLocked]}
              onPress={() => showBadge(badge)}
              accessibilityRole="button"
              accessibilityLabel={`${badge.name}, ${badge.rarity}, ${earned ? 'earned' : 'locked'}`}
            >
              <View style={[styles.badgeIcon, earned && styles.badgeIconEarned]}>
                <Ionicons name={(earned ? badge.icon : 'lock-closed-outline') as IconName} size={20} color={earned ? Colors.textInverse : Colors.textMuted} />
              </View>
              <Text style={styles.badgeName} numberOfLines={2}>
                {badge.name}
              </Text>
              <Text style={styles.badgeRarity}>{badge.rarity}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Button label="Reset all data" variant="danger" icon="trash-outline" onPress={handleReset} />
        <Text style={styles.fine}>Your profile, wishlist, wardrobe, alerts and purchases are stored only on this device.</Text>
        <Text style={styles.fine}>
          Prices come from each marketplace’s official API (Google Shopping results via SerpApi) and are recorded daily; exchange rates are the European Central
          Bank’s. Links to stores may be affiliate links, which can earn VibeVault a commission at no cost to you.
          {attributions.length ? ` ${attributions.join(' ')}` : ''}
        </Text>
      </View>

      <Sheet visible={picker === 'country'} title="Where do you shop?" onClose={() => setPicker(null)}>
        {countryOptions.map((c) => (
          <TouchableOpacity
            key={c.code}
            style={styles.pickerRow}
            onPress={() => {
              setCountry(c.code);
              setPicker(null);
            }}
            accessibilityRole="button"
          >
            <Text style={Type.body}>
              {countryFlag(c.code)} {c.name}
            </Text>
            {liveCountries.has(c.code) ? <Text style={styles.live}>live prices</Text> : null}
          </TouchableOpacity>
        ))}
      </Sheet>

      <Sheet visible={picker === 'currency'} title="Currency" onClose={() => setPicker(null)}>
        {currencyOptions.map((code) => (
          <TouchableOpacity
            key={code}
            style={styles.pickerRow}
            onPress={() => {
              setCurrency(code);
              setPicker(null);
            }}
            accessibilityRole="button"
          >
            <Text style={Type.body}>{code}</Text>
            {code === profile.currency ? <Text style={styles.live}>current</Text> : null}
          </TouchableOpacity>
        ))}
      </Sheet>

      <Sheet
        visible={editingName}
        title="Display name"
        closeLabel="Cancel"
        onClose={() => setEditingName(false)}
        footer={<Button label="Save" onPress={saveName} fullWidth style={{ marginTop: Spacing.sm }} />}
      >
        <TextInput
          style={styles.input}
          value={nameDraft}
          onChangeText={setNameDraft}
          maxLength={MAX_NAME_LENGTH}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={saveName}
          placeholder="Your name"
          placeholderTextColor={Colors.textMuted}
          accessibilityLabel="Display name"
        />
        <Text style={[Type.caption, { textAlign: 'right', marginTop: 6 }]}>
          {nameDraft.trim().length}/{MAX_NAME_LENGTH}
        </Text>
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.lg, alignItems: 'flex-start', gap: 4 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  avatarText: { fontFamily: Fonts.display, fontSize: 32, color: Colors.textInverse },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, maxWidth: '100%' },
  name: { ...Type.display, flexShrink: 1 },
  wishlist: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    alignSelf: 'stretch',
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  block: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg },
  blockTight: { marginHorizontal: Spacing.lg },
  cardTitle: { ...Type.title, marginTop: 2, marginBottom: Spacing.md },
  stats: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  setting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  settingLast: { borderBottomWidth: 0 },
  segment: { flexDirection: 'row', backgroundColor: Colors.surfaceMuted, borderRadius: BorderRadius.sm, padding: 3 },
  segmentBtn: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.xs },
  segmentOn: { backgroundColor: Colors.surface },
  segmentText: { fontFamily: Fonts.medium, fontSize: FontSize.sm, color: Colors.textSecondary },
  segmentTextOn: { fontFamily: Fonts.semibold, color: Colors.ink },
  purchase: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, marginTop: Spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  badge: { width: '31.5%', alignItems: 'center', gap: 6, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xs, borderRadius: BorderRadius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  badgeLocked: { backgroundColor: Colors.background },
  badgeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceMuted },
  badgeIconEarned: { backgroundColor: Colors.ink },
  badgeName: { fontFamily: Fonts.medium, fontSize: 12, color: Colors.ink, textAlign: 'center' },
  badgeRarity: { fontFamily: Fonts.semibold, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: Colors.textMuted },
  footer: { paddingHorizontal: Spacing.lg, marginTop: Spacing.xxl, gap: Spacing.md },
  fine: { fontFamily: Fonts.regular, fontSize: 12, lineHeight: 17, color: Colors.textMuted },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  live: { fontFamily: Fonts.semibold, fontSize: 11, color: Colors.buy },
  input: {
    height: 50,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    fontFamily: Fonts.regular,
    fontSize: FontSize.lg,
    color: Colors.ink,
  },
});
