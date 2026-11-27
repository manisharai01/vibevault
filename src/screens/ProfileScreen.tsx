// ============================================================
// VibeVault – Profile Screen
//
// Name, wishlist, level progress, shopping settings (country,
// currency, sections), shopping impact from logged purchases,
// badges, quick stats and data controls.
// ============================================================

import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';
import { BADGES } from '../data/content';
import { COUNTRIES, countryFlag, countryName } from '../data/countries';
import { SHOP_FOR_LABELS } from '../constants/marketplaces';
import { useLevelInfo, useSustainability } from '../store/hooks';
import { MAX_NAME_LENGTH } from '../store/persistence';
import { useStore } from '../store/useStore';
import { Badge, BadgeRarity, ShopFor } from '../types';
import { ProfileStackParamList } from '../navigation/types';
import GradientCard from '../components/common/GradientCard';
import ProgressBar from '../components/common/ProgressBar';
import { confirmAction, notify } from '../utils/dialog';
import { formatDate } from '../utils/date';
import { formatMoney, formatMoneyWhole, formatNumber } from '../utils/format';

const RARITY_COLORS: Record<BadgeRarity, string> = {
  legendary: Colors.warning,
  epic: Colors.primary,
  rare: Colors.info,
  common: Colors.textMuted,
};

const initialOf = (name: string) => (Array.from(name.trim())[0] ?? 'V').toUpperCase();

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList, 'ProfileMain'>>();
  const route = useRoute<RouteProp<ProfileStackParamList, 'ProfileMain'>>();
  const insets = useSafeAreaInsets();
  const { profile, isProfileComplete, purchases, streak, setName, resetAllData, setCountry, setCurrency, setShopFor, fxRates, availableMarkets, marketplaces } =
    useStore(
      useShallow((s) => ({
        profile: s.profile,
        isProfileComplete: s.isProfileComplete,
        purchases: s.purchases,
        streak: s.streak,
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
  const sustainability = useSustainability();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.name);

  const earnedCount = BADGES.filter((b) => profile.earnedBadges[b.id]).length;

  const openNameEditor = () => {
    setNameDraft(profile.name);
    setEditingName(true);
  };

  const saveName = () => {
    if (setName(nameDraft)) {
      setEditingName(false);
    } else {
      notify('Name required', 'Please enter a display name.');
    }
  };

  const showBadge = (badge: Badge) => {
    const earned = profile.earnedBadges[badge.id];
    notify(
      `${badge.icon} ${badge.name}`,
      `${badge.description}\n\n${earned ? `✅ Earned on ${formatDate(earned)}` : '🔒 Not earned yet'} · ${badge.rarity}`,
    );
  };

  const handleReset = () => {
    confirmAction({
      title: 'Reset all data?',
      message: 'This permanently deletes your style profile, wishlist, alerts, purchases, quest progress and badges on this device.',
      confirmText: 'Reset',
      destructive: true,
      onConfirm: () => {
        resetAllData();
        notify('Data reset', 'VibeVault has been reset to a fresh start.');
      },
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
      <LinearGradient colors={[Colors.primaryDark, Colors.background]} style={[styles.header, { paddingTop: insets.top + Spacing.lg }]}>
        <View style={styles.profileRow}>
          <View>
            <LinearGradient colors={Colors.gradientPrimary} style={styles.avatar}>
              <Text style={styles.avatarText}>{initialOf(profile.name)}</Text>
            </LinearGradient>
            <View style={styles.levelIndicator} accessibilityLabel={`Level ${level.level}`}>
              <Text style={styles.levelIndicatorText}>{level.level}</Text>
            </View>
          </View>
          <View style={styles.profileInfo}>
            <TouchableOpacity
              style={styles.nameRow}
              onPress={openNameEditor}
              accessibilityRole="button"
              accessibilityLabel={`Display name ${profile.name}. Tap to edit.`}
            >
              <Text style={styles.profileName} numberOfLines={1}>
                {profile.name}
              </Text>
              <Ionicons name="pencil" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.profileVibe} numberOfLines={2}>
              {isProfileComplete ? profile.styleArchetypes.join(' · ') : 'Complete your Style Profile ✨'}
            </Text>
            <Text style={styles.profileJoined}>Member since {formatDate(profile.joinedDate)}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.wishlistBtn}
          onPress={() => navigation.navigate('Wishlist')}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Text style={styles.wishlistBtnText}>❤️ Wishlist ({profile.wishlist.length})</Text>
        </TouchableOpacity>
      </LinearGradient>

      <GradientCard style={styles.section}>
        <Text style={styles.sectionTitle}>⭐ Level Progress</Text>
        <View style={styles.xpRow}>
          <View>
            <Text style={styles.xpLabel}>
              Level {level.level} · {level.title}
            </Text>
            <Text style={styles.xpValue}>
              {level.isMaxLevel ? `${formatNumber(profile.totalXP)} XP · max level` : `${level.xpIntoLevel} / ${level.xpForLevel} XP to next level`}
            </Text>
          </View>
          <Text style={styles.xpPoints}>{formatNumber(profile.points)} pts</Text>
        </View>
        <ProgressBar progress={level.progress} height={10} gradient={Colors.gradientPrimary} accessibilityLabel="Level progress" />
      </GradientCard>

      <GradientCard style={styles.section}>
        <Text style={styles.sectionTitle}>🧭 Shopping Settings</Text>
        <TouchableOpacity style={styles.settingRow} onPress={() => setPicker('country')} accessibilityRole="button">
          <Text style={styles.settingLabel}>Country</Text>
          <Text style={styles.settingValue}>{profile.country ? `${countryFlag(profile.country)} ${countryName(profile.country)}` : 'Choose'} ›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.settingRow} onPress={() => setPicker('currency')} accessibilityRole="button">
          <Text style={styles.settingLabel}>Currency for totals & budget</Text>
          <Text style={styles.settingValue}>{profile.currency} ›</Text>
        </TouchableOpacity>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Sections</Text>
          <View style={styles.segment}>
            {(['women', 'men', 'all'] as ShopFor[]).map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.segmentBtn, (profile.shopFor ?? 'all') === option && styles.segmentBtnActive]}
                onPress={() => setShopFor(option)}
                accessibilityRole="radio"
                aria-checked={(profile.shopFor ?? 'all') === option}
              >
                <Text style={styles.segmentText}>{option === 'all' ? 'Both' : SHOP_FOR_LABELS[option]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </GradientCard>

      <GradientCard style={styles.section} gradient={Colors.gradientEco}>
        <Text style={styles.sectionTitleLight}>🛍️ Your Shopping Impact</Text>
        <View style={styles.ecoGrid}>
          <View style={styles.ecoItem}>
            <Text style={styles.ecoValue}>{sustainability.purchases}</Text>
            <Text style={styles.ecoUnit}>logged</Text>
            <Text style={styles.ecoLabel}>Purchases</Text>
          </View>
          <View style={styles.ecoItem}>
            <Text style={styles.ecoValue}>{sustainability.itemsThrifted}</Text>
            <Text style={styles.ecoUnit}>pre-owned</Text>
            <Text style={styles.ecoLabel}>Second-hand finds</Text>
          </View>
          <View style={styles.ecoItem}>
            <Text style={styles.ecoValue}>{formatMoneyWhole(sustainability.moneySaved, sustainability.currency)}</Text>
            <Text style={styles.ecoUnit}>vs list price</Text>
            <Text style={styles.ecoLabel}>Money Saved</Text>
          </View>
        </View>
        <View style={styles.treesRow}>
          <Text style={styles.treesText}>
            {sustainability.itemsThrifted > 0
              ? `♻️ ${sustainability.itemsThrifted} garment${sustainability.itemsThrifted === 1 ? '' : 's'} kept in use instead of new ones being made.`
              : '🌱 Log a purchase from any item page to start tracking what you save.'}
          </Text>
        </View>
      </GradientCard>

      {purchases.length > 0 && (
        <GradientCard style={styles.section}>
          <Text style={styles.sectionTitle}>🛍️ Recent Purchases</Text>
          {purchases.slice(0, 5).map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.purchaseRow}
              onPress={() => navigation.navigate('ItemDetail', { itemId: p.itemId })}
              accessibilityRole="button"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.purchaseTitle} numberOfLines={1}>
                  {p.title}
                </Text>
                <Text style={styles.purchaseMeta}>
                  {p.platform} · {formatDate(p.purchasedAt)} · {p.secondhand ? 'pre-owned' : 'new'}
                </Text>
              </View>
              <Text style={styles.purchasePrice}>{formatMoney(p.pricePaid, p.currency)}</Text>
            </TouchableOpacity>
          ))}
        </GradientCard>
      )}

      <GradientCard style={styles.section}>
        <Text style={styles.sectionTitle}>🏅 Badge Collection</Text>
        <Text style={styles.badgeCount}>
          {earnedCount} / {BADGES.length} earned · tap a badge to see how to earn it
        </Text>
        <View style={styles.badgeGrid}>
          {BADGES.map((badge) => {
            const earned = !!profile.earnedBadges[badge.id];
            return (
              <TouchableOpacity
                key={badge.id}
                style={[styles.badgeItem, !earned && styles.badgeItemLocked]}
                onPress={() => showBadge(badge)}
                accessibilityRole="button"
                accessibilityLabel={`${badge.name}, ${badge.rarity}, ${earned ? 'earned' : 'locked'}`}
              >
                <Text style={styles.badgeIcon}>{earned ? badge.icon : '🔒'}</Text>
                <Text style={[styles.badgeName, !earned && styles.badgeNameLocked]} numberOfLines={2}>
                  {badge.name}
                </Text>
                <View style={[styles.rarityBadge, { backgroundColor: RARITY_COLORS[badge.rarity] }]}>
                  <Text style={styles.rarityText}>{badge.rarity}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </GradientCard>

      {/* Wishlist and badge counts are already shown above (Wishlist button, Badge Collection). */}
      <GradientCard style={styles.section}>
        <Text style={styles.sectionTitle}>📊 Quick Stats</Text>
        <View style={styles.quickGrid}>
          <View style={styles.quickItem}>
            <Text style={styles.quickValue}>{profile.completedQuests.length}</Text>
            <Text style={styles.quickLabel}>Quests Done</Text>
          </View>
          <View style={styles.quickItem}>
            <Text style={styles.quickValue}>🔥 {streak.current}</Text>
            <Text style={styles.quickLabel}>Day Streak</Text>
          </View>
          <View style={styles.quickItem}>
            <Text style={styles.quickValue}>{streak.longest}</Text>
            <Text style={styles.quickLabel}>Best Streak</Text>
          </View>
        </View>
      </GradientCard>

      <TouchableOpacity style={styles.resetBtn} onPress={handleReset} accessibilityRole="button">
        <Ionicons name="trash-outline" size={16} color={Colors.error} />
        <Text style={styles.resetText}>Reset all data</Text>
      </TouchableOpacity>
      <Text style={styles.privacyText}>Your profile, wishlist, alerts and purchases are stored only on this device.</Text>
      <Text style={styles.privacyText}>
        Prices come from each marketplace’s official API (Google Shopping results via SerpApi) and are recorded daily; exchange rates are the
        European Central Bank’s. Links to stores may be affiliate links, which can earn VibeVault a commission at no cost to you.
        {attributions.length ? ` ${attributions.join(' ')}` : ''}
      </Text>

      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <View style={[styles.modalBackdrop, { paddingTop: insets.top + 48 }]}>
          <View style={[styles.modalCard, styles.pickerCard]}>
            <Text style={styles.modalTitle}>{picker === 'country' ? 'Where do you shop?' : 'Currency'}</Text>
            <ScrollView style={styles.pickerList}>
              {picker === 'country'
                ? countryOptions.map((c) => (
                    <TouchableOpacity
                      key={c.code}
                      style={styles.pickerRow}
                      onPress={() => {
                        setCountry(c.code);
                        setPicker(null);
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={styles.pickerText}>
                        {countryFlag(c.code)} {c.name}
                      </Text>
                      {liveCountries.has(c.code) && <Text style={styles.pickerLive}>live prices</Text>}
                    </TouchableOpacity>
                  ))
                : currencyOptions.map((code) => (
                    <TouchableOpacity
                      key={code}
                      style={styles.pickerRow}
                      onPress={() => {
                        setCurrency(code);
                        setPicker(null);
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={styles.pickerText}>{code}</Text>
                      {code === profile.currency && <Text style={styles.pickerLive}>current</Text>}
                    </TouchableOpacity>
                  ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setPicker(null)} accessibilityRole="button">
              <Text style={styles.modalBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={editingName} transparent animationType="fade" onRequestClose={() => setEditingName(false)}>
        {/* Anchored near the top so the on-screen keyboard can never cover it. */}
        <View style={[styles.modalBackdrop, { paddingTop: insets.top + 64 }]}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Display name</Text>
            <TextInput
              style={styles.modalInput}
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
            <Text style={styles.modalHint}>
              {nameDraft.trim().length}/{MAX_NAME_LENGTH}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setEditingName(false)} accessibilityRole="button">
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={saveName} accessibilityRole="button">
                <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  settingLabel: { color: Colors.textSecondary, fontSize: FontSize.sm },
  settingValue: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700' },
  segment: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: BorderRadius.full, padding: 2 },
  segmentBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  segmentBtnActive: { backgroundColor: Colors.primaryDark },
  segmentText: { color: Colors.textPrimary, fontSize: FontSize.xs, fontWeight: '700' },
  pickerCard: { maxHeight: '80%' },
  pickerList: { marginVertical: Spacing.md },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pickerText: { color: Colors.textPrimary, fontSize: FontSize.md },
  pickerLive: { color: Colors.success, fontSize: FontSize.xs, fontWeight: '700' },
  header: { paddingBottom: Spacing.xl, paddingHorizontal: Spacing.xl },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: FontSize.xxxl, fontWeight: '800', color: '#FFF' },
  levelIndicator: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    minWidth: 28,
    height: 28,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: Colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  levelIndicatorText: { color: '#1A1A2E', fontSize: FontSize.xs, fontWeight: '800' },
  profileInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  profileName: { flexShrink: 1, fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary },
  profileVibe: { fontSize: FontSize.sm, color: Colors.primaryLight, marginTop: 4 },
  profileJoined: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  wishlistBtn: {
    alignSelf: 'center',
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  wishlistBtnText: { color: Colors.textPrimary, fontWeight: '700', fontSize: FontSize.sm },

  section: { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  sectionTitleLight: { fontSize: FontSize.lg, fontWeight: '700', color: '#FFF', marginBottom: Spacing.md },

  xpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm, gap: Spacing.sm },
  xpLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textSecondary },
  xpValue: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  xpPoints: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.primaryLight },

  // Three figures: two on the first row, the third centred below.
  ecoGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around' },
  ecoItem: { width: '48%', alignItems: 'center', paddingVertical: Spacing.md },
  ecoValue: { fontSize: FontSize.xxl, fontWeight: '800', color: '#FFF' },
  ecoUnit: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  ecoLabel: { fontSize: FontSize.xs, color: '#FFF', marginTop: 2, textAlign: 'center', fontWeight: '600' },
  treesRow: { marginTop: Spacing.sm, padding: Spacing.sm, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: BorderRadius.sm },
  treesText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '600', textAlign: 'center' },

  purchaseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.md },
  purchaseTitle: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '600' },
  purchaseMeta: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
  purchasePrice: { color: Colors.success, fontSize: FontSize.md, fontWeight: '800' },

  badgeCount: { color: Colors.textMuted, fontSize: FontSize.sm, marginBottom: Spacing.md },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.sm },
  badgeItem: {
    width: '31%',
    alignItems: 'center',
    padding: Spacing.sm,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgeItemLocked: { opacity: 0.55 },
  badgeIcon: { fontSize: 28, marginBottom: 4 },
  badgeName: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },
  badgeNameLocked: { color: Colors.textSecondary },
  rarityBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: BorderRadius.full, marginTop: 4 },
  rarityText: { color: '#FFF', fontSize: 8, fontWeight: '700', textTransform: 'uppercase' },


  quickGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  quickItem: { alignItems: 'center', flex: 1 },
  quickValue: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.primaryLight },
  quickLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4, textAlign: 'center' },

  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.error + '80',
  },
  resetText: { color: Colors.error, fontSize: FontSize.md, fontWeight: '700' },
  privacyText: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.sm },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'flex-start', padding: Spacing.xl },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '800', marginBottom: Spacing.md },
  modalInput: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  modalHint: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: Spacing.sm },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.lg },
  modalBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border },
  modalBtnPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  modalBtnText: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: '700' },
});
