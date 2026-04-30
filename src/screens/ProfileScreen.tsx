// ============================================================
// VibeVault – Profile & Leaderboard Screen
//
// User profile with sustainability metrics, badge collection,
// community leaderboard, and environmental impact dashboard.
// ============================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Colors,
  Spacing,
  FontSize,
  BorderRadius,
  Shadows,
  STYLE_COLORS,
} from '../constants/theme';
import { useStore } from '../store/useStore';
import GradientCard from '../components/common/GradientCard';
import ProgressBar from '../components/common/ProgressBar';

export default function ProfileScreen({ navigation }: { navigation: any }) {
  const { profile, sustainability, badges, leaderboard, isProfileComplete, vibeSummary, wishlistItems } =
    useStore();
  const [tab, setTab] = useState<'profile' | 'leaderboard'>('profile');

  // ---- Leaderboard View ----
  if (tab === 'leaderboard') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
        <LinearGradient colors={[Colors.primaryDark, Colors.background]} style={styles.header}>
          <Text style={styles.headerTitle}>🏆 Leaderboard</Text>
          <Text style={styles.headerSub}>Community rankings by sustainability points</Text>
        </LinearGradient>

        {/* Tab Toggle */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, (tab as string) === 'profile' && styles.tabBtnActive]}
            onPress={() => setTab('profile')}
          >
            <Text style={[styles.tabText, (tab as string) === 'profile' && styles.tabTextActive]}>👤 Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, (tab as string) === 'leaderboard' && styles.tabBtnActive]}
            onPress={() => setTab('leaderboard')}
          >
            <Text style={[styles.tabText, (tab as string) === 'leaderboard' && styles.tabTextActive]}>🏆 Leaderboard</Text>
          </TouchableOpacity>
        </View>

        {/* Top 3 Podium */}
        <View style={styles.podium}>
          {leaderboard.slice(0, 3).map((entry, i) => {
            const podiumOrder = [1, 0, 2]; // silver, gold, bronze
            const idx = podiumOrder[i];
            const person = leaderboard[idx];
            const heights = [130, 160, 110];
            const medals = ['🥈', '🥇', '🥉'];

            return (
              <View key={person.userId} style={[styles.podiumItem, { height: heights[i] }]}>
                <Text style={styles.podiumMedal}>{medals[i]}</Text>
                <View style={[styles.podiumAvatar, { backgroundColor: STYLE_COLORS[person.styleArchetype] || Colors.primary }]}>
                  <Text style={styles.podiumInitial}>{person.name[0]}</Text>
                </View>
                <Text style={styles.podiumName}>{person.name}</Text>
                <Text style={styles.podiumPoints}>{person.points.toLocaleString()} pts</Text>
                <Text style={styles.podiumLevel}>Lv. {person.level}</Text>
              </View>
            );
          })}
        </View>

        {/* Full Rankings */}
        {leaderboard.map((entry) => {
          const isCurrentUser = entry.name === 'Aditya'; // mock
          return (
            <View
              key={entry.userId}
              style={[styles.leaderRow, isCurrentUser && styles.leaderRowCurrent]}
            >
              <Text style={[styles.leaderRank, entry.rank <= 3 && { color: Colors.warning }]}>
                #{entry.rank}
              </Text>
              <View
                style={[
                  styles.leaderAvatar,
                  { backgroundColor: STYLE_COLORS[entry.styleArchetype] || Colors.primary },
                ]}
              >
                <Text style={styles.leaderInitial}>{entry.name[0]}</Text>
              </View>
              <View style={styles.leaderInfo}>
                <Text style={styles.leaderName}>
                  {entry.name} {isCurrentUser ? '(You)' : ''}
                </Text>
                <Text style={styles.leaderStyle}>{entry.styleArchetype} · Lv. {entry.level}</Text>
              </View>
              <Text style={styles.leaderPoints}>{entry.points.toLocaleString()}</Text>
            </View>
          );
        })}
      </ScrollView>
    );
  }

  // ---- Profile View ----
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <LinearGradient colors={[Colors.primaryDark, Colors.background]} style={styles.header}>
        <View style={styles.profileRow}>
          <View style={styles.avatarContainer}>
            <LinearGradient colors={Colors.gradientPrimary as [string, string]} style={styles.avatar}>
              <Text style={styles.avatarText}>{profile.name[0]}</Text>
            </LinearGradient>
            <View style={styles.levelIndicator}>
              <Text style={styles.levelIndicatorText}>{profile.level}</Text>
            </View>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profile.name}</Text>
            {isProfileComplete ? (
              <Text style={styles.profileVibe}>
                {profile.styleArchetypes.join(' · ')}
              </Text>
            ) : (
              <Text style={styles.profileVibe}>Complete your Style Profile ✨</Text>
            )}
            <Text style={styles.profileJoined}>Member since {profile.joinedDate}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.wishlistBtn}
          onPress={() => navigation.navigate('Wishlist')}
          activeOpacity={0.8}
        >
          <Text style={styles.wishlistBtnText}>❤️ Wishlist ({wishlistItems.length})</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Tab Toggle */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'profile' && styles.tabBtnActive]}
          onPress={() => setTab('profile')}
        >
          <Text style={[styles.tabText, tab === 'profile' && styles.tabTextActive]}>👤 Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, (tab as string) === 'leaderboard' && styles.tabBtnActive]}
          onPress={() => setTab('leaderboard')}
        >
          <Text style={[styles.tabText, (tab as string) === 'leaderboard' && styles.tabTextActive]}>🏆 Leaderboard</Text>
        </TouchableOpacity>
      </View>

      {/* XP & Level Progress */}
      <GradientCard style={styles.section}>
        <Text style={styles.sectionTitle}>⭐ Level Progress</Text>
        <View style={styles.xpRow}>
          <View style={styles.xpInfo}>
            <Text style={styles.xpLabel}>Level {profile.level}</Text>
            <Text style={styles.xpValue}>{profile.xp} / {profile.xpToNext} XP</Text>
          </View>
          <Text style={styles.xpPoints}>{profile.points.toLocaleString()} pts</Text>
        </View>
        <ProgressBar
          progress={(profile.xp / profile.xpToNext) * 100}
          height={10}
          gradient={Colors.gradientPrimary}
        />
      </GradientCard>

      {/* Sustainability Dashboard */}
      <GradientCard style={styles.section} gradient={Colors.gradientEco}>
        <Text style={styles.sectionTitle}>🌍 Your Eco Impact</Text>
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
            <Text style={styles.ecoValue}>{sustainability.fastFashionAvoided}</Text>
            <Text style={styles.ecoUnit}>items</Text>
            <Text style={styles.ecoLabel}>Fast Fashion Avoided</Text>
          </View>
          <View style={styles.ecoItem}>
            <Text style={styles.ecoValue}>${sustainability.moneysSaved.toFixed(0)}</Text>
            <Text style={styles.ecoUnit}>total</Text>
            <Text style={styles.ecoLabel}>Money Saved</Text>
          </View>
        </View>
        <View style={styles.treesRow}>
          <Text style={styles.treesEmoji}>🌳🌳🌳</Text>
          <Text style={styles.treesText}>
            Equivalent to planting {sustainability.treesEquivalent} trees!
          </Text>
        </View>
      </GradientCard>

      {/* Badges Collection */}
      <GradientCard style={styles.section}>
        <Text style={styles.sectionTitle}>🏅 Badge Collection</Text>
        <Text style={styles.badgeCount}>
          {profile.badges.filter((b) => b.earnedDate).length} / {badges.length} earned
        </Text>
        <View style={styles.badgeGrid}>
          {badges.map((badge) => {
            const earned = profile.badges.find((b) => b.id === badge.id && b.earnedDate);
            return (
              <View
                key={badge.id}
                style={[styles.badgeItem, !earned && styles.badgeItemLocked]}
              >
                <Text style={[styles.badgeIcon, !earned && styles.badgeIconLocked]}>
                  {badge.icon}
                </Text>
                <Text style={[styles.badgeName, !earned && styles.badgeNameLocked]} numberOfLines={1}>
                  {badge.name}
                </Text>
                <View
                  style={[
                    styles.rarityBadge,
                    {
                      backgroundColor:
                        badge.rarity === 'legendary'
                          ? Colors.warning
                          : badge.rarity === 'epic'
                            ? Colors.primary
                            : badge.rarity === 'rare'
                              ? Colors.info
                              : Colors.textMuted,
                    },
                  ]}
                >
                  <Text style={styles.rarityText}>{badge.rarity}</Text>
                </View>
                {earned && (
                  <Text style={styles.badgeDate}>✓ {earned.earnedDate}</Text>
                )}
              </View>
            );
          })}
        </View>
      </GradientCard>

      {/* Vibe Summary */}
      {isProfileComplete && vibeSummary && (
        <GradientCard style={styles.section}>
          <Text style={styles.sectionTitle}>✨ Your Vibe</Text>
          <Text style={styles.vibeSummaryText}>{vibeSummary}</Text>
          <View style={styles.archetypeTags}>
            {profile.styleArchetypes.map((arch) => (
              <View
                key={arch}
                style={[
                  styles.archetypeTag,
                  { backgroundColor: (STYLE_COLORS[arch] || Colors.primary) + '30' },
                ]}
              >
                <Text
                  style={[styles.archetypeTagText, { color: STYLE_COLORS[arch] || Colors.primary }]}
                >
                  {arch}
                </Text>
              </View>
            ))}
          </View>
        </GradientCard>
      )}

      {/* Quick Stats */}
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
            <Text style={styles.quickValue}>{profile.badges.filter((b) => b.earnedDate).length}</Text>
            <Text style={styles.quickLabel}>Badges</Text>
          </View>
        </View>
      </GradientCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingTop: 54,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary },
  headerSub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4 },

  // Profile Header
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  avatarContainer: { position: 'relative' },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: FontSize.xxxl, fontWeight: '800', color: '#FFF' },
  levelIndicator: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  levelIndicatorText: { color: '#FFF', fontSize: FontSize.xs, fontWeight: '800' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary },
  profileVibe: { fontSize: FontSize.sm, color: Colors.primaryLight, marginTop: 4 },
  profileJoined: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  wishlistBtn: {
    alignSelf: 'center',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  wishlistBtnText: { color: Colors.textPrimary, fontWeight: '700', fontSize: FontSize.sm },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
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

  // XP
  xpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  xpInfo: {},
  xpLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textSecondary },
  xpValue: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  xpPoints: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.primaryLight },

  // Eco
  ecoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  ecoItem: {
    width: '45%',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  ecoValue: { fontSize: FontSize.xxl, fontWeight: '800', color: '#FFF' },
  ecoUnit: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  ecoLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.8)', marginTop: 2, textAlign: 'center' },
  treesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BorderRadius.sm,
  },
  treesEmoji: { fontSize: 20 },
  treesText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '600' },

  // Badges
  badgeCount: { color: Colors.textMuted, fontSize: FontSize.sm, marginBottom: Spacing.md },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  badgeItem: {
    width: '30%',
    alignItems: 'center',
    padding: Spacing.sm,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgeItemLocked: { opacity: 0.4 },
  badgeIcon: { fontSize: 28, marginBottom: 4 },
  badgeIconLocked: { fontSize: 28 },
  badgeName: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },
  badgeNameLocked: { color: Colors.textMuted },
  rarityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
    marginTop: 4,
  },
  rarityText: { color: '#FFF', fontSize: 8, fontWeight: '700', textTransform: 'uppercase' },
  badgeDate: { fontSize: 8, color: Colors.success, marginTop: 4 },

  // Vibe Summary
  vibeSummaryText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  archetypeTags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  archetypeTag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  archetypeTagText: { fontWeight: '700', fontSize: FontSize.sm },

  // Quick Stats
  quickGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  quickItem: { alignItems: 'center', flex: 1 },
  quickValue: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.primaryLight },
  quickLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },

  // Leaderboard
  podium: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.xl,
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
    borderWidth: 1,
    borderColor: Colors.border,
  },
  podiumMedal: { fontSize: 24, marginBottom: 4 },
  podiumAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
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
  leaderRowCurrent: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  leaderRank: {
    width: 32,
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  leaderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  leaderInitial: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
  leaderInfo: { flex: 1, marginLeft: Spacing.md },
  leaderName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  leaderStyle: { fontSize: FontSize.xs, color: Colors.textMuted },
  leaderPoints: { fontSize: FontSize.md, fontWeight: '800', color: Colors.primaryLight },
});
