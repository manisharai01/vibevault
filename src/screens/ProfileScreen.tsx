// ============================================================
// VibeVault – Profile & Leaderboard Screen
//
// Level progress, eco-impact dashboard (from logged purchases),
// badge collection, community leaderboard and data controls.
// ============================================================

import React, { useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, FontSize, STYLE_COLORS, Spacing } from '../constants/theme';
import { BADGES } from '../data/mockData';
import { useLeaderboard, useLevelInfo, useSustainability } from '../store/hooks';
import { MAX_NAME_LENGTH } from '../store/persistence';
import { useStore } from '../store/useStore';
import { Badge, BadgeRarity, LeaderboardEntry } from '../types';
import { ProfileStackParamList } from '../navigation/types';
import GradientCard from '../components/common/GradientCard';
import ProgressBar from '../components/common/ProgressBar';
import { confirmAction, notify } from '../utils/dialog';
import { formatDate } from '../utils/date';
import { formatNumber, formatPrice, formatPriceRounded } from '../utils/format';

const RARITY_COLORS: Record<BadgeRarity, string> = {
  legendary: Colors.warning,
  epic: Colors.primary,
  rare: Colors.info,
  common: Colors.textMuted,
};

const initialOf = (name: string) => (Array.from(name.trim())[0] ?? 'V').toUpperCase();

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList, 'ProfileMain'>>();
  const insets = useSafeAreaInsets();
  const { profile, isProfileComplete, vibeSummary, purchases, streak, setName, resetAllData } = useStore(
    useShallow((s) => ({
      profile: s.profile,
      isProfileComplete: s.isProfileComplete,
      vibeSummary: s.vibeSummary,
      purchases: s.purchases,
      streak: s.streak,
      setName: s.setName,
      resetAllData: s.resetAllData,
    })),
  );
  const level = useLevelInfo();
  const sustainability = useSustainability();
  const leaderboard = useLeaderboard();

  const [tab, setTab] = useState<'profile' | 'leaderboard'>('profile');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.name);

  const earnedCount = BADGES.filter((b) => profile.earnedBadges[b.id]).length;
  const myEntry = leaderboard.find((e) => e.isCurrentUser);

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
        setTab('profile');
        notify('Data reset', 'VibeVault has been reset to a fresh start.');
      },
    });
  };

  const tabToggle = (
    <View style={styles.tabRow} accessibilityRole="tablist">
      {(['profile', 'leaderboard'] as const).map((key) => {
        const active = tab === key;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.tabBtn, active && styles.tabBtnActive]}
            onPress={() => setTab(key)}
            accessibilityRole="tab"
            aria-selected={active}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{key === 'profile' ? '👤 Profile' : '🏆 Leaderboard'}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

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

      {tabToggle}

      {tab === 'leaderboard' ? (
        <Leaderboard entries={leaderboard} myEntry={myEntry} />
      ) : (
        <>
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

          <GradientCard style={styles.section} gradient={Colors.gradientEco}>
            <Text style={styles.sectionTitleLight}>🌍 Your Eco Impact</Text>
            <View style={styles.ecoGrid}>
              <View style={styles.ecoItem}>
                <Text style={styles.ecoValue}>{sustainability.totalCO2Saved.toFixed(1)}</Text>
                <Text style={styles.ecoUnit}>kg CO₂</Text>
                <Text style={styles.ecoLabel}>Saved</Text>
              </View>
              <View style={styles.ecoItem}>
                <Text style={styles.ecoValue}>{sustainability.itemsThrifted}</Text>
                <Text style={styles.ecoUnit}>items</Text>
                <Text style={styles.ecoLabel}>Thrifted</Text>
              </View>
              <View style={styles.ecoItem}>
                <Text style={styles.ecoValue}>{formatNumber(sustainability.waterSavedLiters)}</Text>
                <Text style={styles.ecoUnit}>litres</Text>
                <Text style={styles.ecoLabel}>Water Saved</Text>
              </View>
              <View style={styles.ecoItem}>
                <Text style={styles.ecoValue}>{formatPriceRounded(sustainability.moneySaved)}</Text>
                <Text style={styles.ecoUnit}>vs retail</Text>
                <Text style={styles.ecoLabel}>Money Saved</Text>
              </View>
            </View>
            <View style={styles.treesRow}>
              <Text style={styles.treesText}>
                {sustainability.itemsThrifted > 0
                  ? `🌳 That's the CO₂ ${sustainability.treesEquivalent} trees absorb in a year!`
                  : '🌱 Log a purchase from any item page to start tracking your impact.'}
              </Text>
            </View>
          </GradientCard>

          {purchases.length > 0 && (
            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>🛍️ Recent Thrift Finds</Text>
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
                      {p.platform} · {formatDate(p.purchasedAt)} · {p.co2Saved} kg CO₂ saved
                    </Text>
                  </View>
                  <Text style={styles.purchasePrice}>{formatPrice(p.pricePaid)}</Text>
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

          {isProfileComplete && vibeSummary ? (
            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>✨ Your Vibe</Text>
              <Text style={styles.vibeSummaryText}>{vibeSummary}</Text>
              <View style={styles.archetypeTags}>
                {profile.styleArchetypes.map((arch) => (
                  <View key={arch} style={[styles.archetypeTag, { backgroundColor: (STYLE_COLORS[arch] || Colors.primary) + '30' }]}>
                    <Text style={[styles.archetypeTagText, { color: STYLE_COLORS[arch] || Colors.primary }]}>{arch}</Text>
                  </View>
                ))}
              </View>
            </GradientCard>
          ) : null}

          <GradientCard style={styles.section}>
            <Text style={styles.sectionTitle}>📊 Quick Stats</Text>
            <View style={styles.quickGrid}>
              <View style={styles.quickItem}>
                <Text style={styles.quickValue}>{profile.completedQuests.length}</Text>
                <Text style={styles.quickLabel}>Quests Done</Text>
              </View>
              <View style={styles.quickItem}>
                <Text style={styles.quickValue}>{profile.wishlist.length}</Text>
                <Text style={styles.quickLabel}>Wishlisted</Text>
              </View>
              <View style={styles.quickItem}>
                <Text style={styles.quickValue}>{earnedCount}</Text>
                <Text style={styles.quickLabel}>Badges</Text>
              </View>
              <View style={styles.quickItem}>
                <Text style={styles.quickValue}>🔥 {streak.current}</Text>
                <Text style={styles.quickLabel}>Day Streak</Text>
              </View>
            </View>
          </GradientCard>

          <TouchableOpacity style={styles.resetBtn} onPress={handleReset} accessibilityRole="button">
            <Ionicons name="trash-outline" size={16} color={Colors.error} />
            <Text style={styles.resetText}>Reset all data</Text>
          </TouchableOpacity>
          <Text style={styles.privacyText}>Your data is stored only on this device.</Text>
        </>
      )}

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
              {nameDraft.trim().length}/{MAX_NAME_LENGTH} · shown on the leaderboard
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

function Leaderboard({ entries, myEntry }: { entries: LeaderboardEntry[]; myEntry?: LeaderboardEntry }) {
  // Podium order: silver, gold, bronze.
  const podium = [entries[1], entries[0], entries[2]].filter((e): e is LeaderboardEntry => e !== undefined);
  const podiumStyle = (rank: number) => (rank === 1 ? { height: 160, medal: '🥇' } : rank === 2 ? { height: 135, medal: '🥈' } : { height: 115, medal: '🥉' });

  return (
    <View>
      {myEntry && (
        <Text style={styles.myRank}>
          You’re #{myEntry.rank} of {entries.length} with {formatNumber(myEntry.points)} points — complete quests to climb!
        </Text>
      )}
      <View style={styles.podium}>
        {podium.map((person) => {
          const { height, medal } = podiumStyle(person.rank);
          return (
            <View key={person.userId} style={[styles.podiumItem, { height }, person.isCurrentUser && styles.podiumItemMe]}>
              <Text style={styles.podiumMedal}>{medal}</Text>
              <View style={[styles.podiumAvatar, { backgroundColor: (person.styleArchetype && STYLE_COLORS[person.styleArchetype]) || Colors.primary }]}>
                <Text style={styles.podiumInitial}>{initialOf(person.name)}</Text>
              </View>
              <Text style={styles.podiumName} numberOfLines={1}>
                {person.isCurrentUser ? 'You' : person.name}
              </Text>
              <Text style={styles.podiumPoints}>{formatNumber(person.points)} pts</Text>
              <Text style={styles.podiumLevel}>Lv. {person.level}</Text>
            </View>
          );
        })}
      </View>

      {entries.map((entry) => (
        <View
          key={entry.userId}
          style={[styles.leaderRow, entry.isCurrentUser && styles.leaderRowCurrent]}
          accessibilityLabel={`Rank ${entry.rank}, ${entry.isCurrentUser ? 'you' : entry.name}, ${entry.points} points`}
        >
          <Text style={[styles.leaderRank, entry.rank <= 3 && { color: Colors.warning }]}>#{entry.rank}</Text>
          <View style={[styles.leaderAvatar, { backgroundColor: (entry.styleArchetype && STYLE_COLORS[entry.styleArchetype]) || Colors.primary }]}>
            <Text style={styles.leaderInitial}>{initialOf(entry.name)}</Text>
          </View>
          <View style={styles.leaderInfo}>
            <Text style={styles.leaderName} numberOfLines={1}>
              {entry.name}
              {entry.isCurrentUser ? ' (You)' : ''}
            </Text>
            <Text style={styles.leaderStyle}>
              {entry.styleArchetype ?? 'Style TBD'} · Lv. {entry.level}
            </Text>
          </View>
          <Text style={styles.leaderPoints}>{formatNumber(entry.points)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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

  tabRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.md, gap: Spacing.sm },
  tabBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtnActive: { backgroundColor: Colors.primaryDark, borderColor: Colors.primary },
  tabText: { color: Colors.textMuted, fontSize: FontSize.md, fontWeight: '600' },
  tabTextActive: { color: Colors.primaryLight },

  section: { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  sectionTitleLight: { fontSize: FontSize.lg, fontWeight: '700', color: '#FFF', marginBottom: Spacing.md },

  xpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm, gap: Spacing.sm },
  xpLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textSecondary },
  xpValue: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  xpPoints: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.primaryLight },

  ecoGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
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

  vibeSummaryText: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 22, marginBottom: Spacing.md },
  archetypeTags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  archetypeTag: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full },
  archetypeTagText: { fontWeight: '700', fontSize: FontSize.sm },

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

  myRank: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center', marginHorizontal: Spacing.xl, marginBottom: Spacing.lg },
  podium: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  podiumItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  podiumItemMe: { borderColor: Colors.primary },
  podiumMedal: { fontSize: 24, marginBottom: 4 },
  podiumAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  podiumInitial: { color: '#FFF', fontSize: FontSize.lg, fontWeight: '800' },
  podiumName: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700' },
  podiumPoints: { color: Colors.primaryLight, fontSize: FontSize.xs, fontWeight: '600' },
  podiumLevel: { color: Colors.textMuted, fontSize: FontSize.xs },

  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  leaderRowCurrent: { borderColor: Colors.primary, backgroundColor: Colors.primary + '20' },
  leaderRank: { width: 36, fontSize: FontSize.lg, fontWeight: '800', color: Colors.textSecondary, textAlign: 'center' },
  leaderAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginLeft: Spacing.sm },
  leaderInitial: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
  leaderInfo: { flex: 1, marginLeft: Spacing.md },
  leaderName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  leaderStyle: { fontSize: FontSize.xs, color: Colors.textMuted },
  leaderPoints: { fontSize: FontSize.md, fontWeight: '800', color: Colors.primaryLight },

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
