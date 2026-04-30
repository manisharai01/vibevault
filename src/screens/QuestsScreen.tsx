// ============================================================
// VibeVault – Quests Screen (Objective 3)
//
// Gamified style challenge system that translates the user's
// generated "vibe" into digital quests — mood boards, styling
// challenges, thrift hunts — within a point-based community.
// ============================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Colors,
  Spacing,
  FontSize,
  BorderRadius,
  Shadows,
} from '../constants/theme';
import { useStore } from '../store/useStore';
import { Quest, QuestDifficulty } from '../types';
import GradientCard from '../components/common/GradientCard';
import ProgressBar from '../components/common/ProgressBar';

const DIFFICULTY_COLORS: Record<QuestDifficulty, string> = {
  Easy: Colors.success,
  Medium: Colors.warning,
  Hard: Colors.accent,
  Epic: Colors.primary,
};

const QUEST_TYPE_LABELS: Record<string, string> = {
  'mood-board': '🎨 Mood Board',
  'styling-challenge': '👗 Styling',
  'thrift-hunt': '🗺️ Thrift Hunt',
  sustainability: '🌿 Eco',
  community: '🤝 Community',
};

export default function QuestsScreen() {
  const { quests, profile, startQuest, progressQuest, completeQuest } = useStore();
  const [filter, setFilter] = useState<'all' | 'available' | 'in-progress' | 'completed'>('all');
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);

  const filteredQuests = quests.filter((q) => {
    if (filter === 'all') return true;
    return q.status === filter;
  });

  const activeCount = quests.filter((q) => q.status === 'in-progress').length;
  const completedCount = quests.filter((q) => q.status === 'completed').length;
  const totalXPEarned = quests
    .filter((q) => q.status === 'completed')
    .reduce((sum, q) => sum + q.xpReward, 0);
  const totalPointsEarned = quests
    .filter((q) => q.status === 'completed')
    .reduce((sum, q) => sum + q.pointsReward, 0);

  const handleStartQuest = (quest: Quest) => {
    startQuest(quest.id);
    Alert.alert('🎯 Quest Started!', `"${quest.title}" is now in progress. Complete the steps to earn rewards!`);
  };

  const handleProgressStep = (quest: Quest) => {
    progressQuest(quest.id);
    const updatedQuest = quests.find((q) => q.id === quest.id);
    if (updatedQuest && updatedQuest.completedSteps + 1 >= updatedQuest.totalSteps) {
      // Auto-complete when all steps done
      setTimeout(() => {
        completeQuest(quest.id);
        Alert.alert(
          '🎉 Quest Complete!',
          `You earned ${quest.xpReward} XP and ${quest.pointsReward} points!${quest.badgeReward ? `\n\n🏅 New Badge: ${quest.badgeReward}` : ''}`,
        );
      }, 300);
    }
  };

  // ---- Quest Detail View ----
  if (selectedQuest) {
    const quest = quests.find((q) => q.id === selectedQuest.id) || selectedQuest;
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
        <LinearGradient
          colors={[DIFFICULTY_COLORS[quest.difficulty] + '40', Colors.background]}
          style={styles.detailHeader}
        >
          <TouchableOpacity onPress={() => setSelectedQuest(null)} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.questDetailIcon}>{quest.icon}</Text>
          <Text style={styles.questDetailTitle}>{quest.title}</Text>
          <View style={styles.questMetaRow}>
            <View style={[styles.difficultyBadge, { backgroundColor: DIFFICULTY_COLORS[quest.difficulty] }]}>
              <Text style={styles.difficultyText}>{quest.difficulty}</Text>
            </View>
            <Text style={styles.questType}>{QUEST_TYPE_LABELS[quest.type] || quest.type}</Text>
            {quest.city && <Text style={styles.questCity}>📍 {quest.city}</Text>}
          </View>
        </LinearGradient>

        {/* Description */}
        <GradientCard style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Quest Details</Text>
          <Text style={styles.questDescription}>{quest.description}</Text>
          {quest.deadline && (
            <View style={styles.deadlineRow}>
              <Text style={styles.deadlineIcon}>⏰</Text>
              <Text style={styles.deadlineText}>Deadline: {quest.deadline}</Text>
            </View>
          )}
        </GradientCard>

        {/* Progress */}
        <GradientCard style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Progress</Text>
          <ProgressBar
            progress={quest.progress}
            height={12}
            showLabel
            label={`${quest.completedSteps} / ${quest.totalSteps} steps`}
            gradient={[DIFFICULTY_COLORS[quest.difficulty], Colors.primaryLight]}
          />

          {/* Step-by-step requirements */}
          <View style={styles.requirementsList}>
            {quest.requirements.map((req, i) => {
              const isCompleted = i < quest.completedSteps;
              return (
                <View key={i} style={styles.requirementItem}>
                  <View style={[styles.requirementCheck, isCompleted && styles.requirementCheckDone]}>
                    <Text style={styles.requirementCheckText}>{isCompleted ? '✓' : (i + 1)}</Text>
                  </View>
                  <Text style={[styles.requirementText, isCompleted && styles.requirementTextDone]}>
                    {req}
                  </Text>
                </View>
              );
            })}
          </View>
        </GradientCard>

        {/* Rewards */}
        <GradientCard style={styles.section} gradient={Colors.gradientPrimary}>
          <Text style={styles.sectionTitle}>🎁 Rewards</Text>
          <View style={styles.rewardsGrid}>
            <View style={styles.rewardItem}>
              <Text style={styles.rewardValue}>+{quest.xpReward}</Text>
              <Text style={styles.rewardLabel}>XP</Text>
            </View>
            <View style={styles.rewardItem}>
              <Text style={styles.rewardValue}>+{quest.pointsReward}</Text>
              <Text style={styles.rewardLabel}>Points</Text>
            </View>
            {quest.badgeReward && (
              <View style={styles.rewardItem}>
                <Text style={styles.rewardValue}>🏅</Text>
                <Text style={styles.rewardLabel}>{quest.badgeReward}</Text>
              </View>
            )}
          </View>
        </GradientCard>

        {/* Action Buttons */}
        <View style={styles.actionSection}>
          {quest.status === 'available' && (
            <TouchableOpacity
              onPress={() => handleStartQuest(quest)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={Colors.gradientPrimary as [string, string]}
                style={styles.actionBtn}
              >
                <Text style={styles.actionBtnText}>🚀 Start Quest</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {quest.status === 'in-progress' && (
            <TouchableOpacity
              onPress={() => handleProgressStep(quest)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={Colors.gradientAccent as [string, string]}
                style={styles.actionBtn}
              >
                <Text style={styles.actionBtnText}>
                  ✅ Complete Step {quest.completedSteps + 1} of {quest.totalSteps}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {quest.status === 'completed' && (
            <View style={[styles.actionBtn, { backgroundColor: Colors.success }]}>
              <Text style={styles.actionBtnText}>🎉 Quest Completed!</Text>
            </View>
          )}
        </View>
      </ScrollView>
    );
  }

  // ---- Main Quest List ----
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <LinearGradient colors={[Colors.primaryDark, Colors.background]} style={styles.header}>
        <Text style={styles.headerTitle}>⚔️ Style Quests</Text>
        <Text style={styles.headerSub}>Complete challenges, earn rewards, build your sustainable wardrobe</Text>
      </LinearGradient>

      {/* Stats Overview */}
      <GradientCard style={styles.statsCard} gradient={Colors.gradientPrimary}>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{activeCount}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{completedCount}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalXPEarned}</Text>
            <Text style={styles.statLabel}>XP Earned</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalPointsEarned}</Text>
            <Text style={styles.statLabel}>Points</Text>
          </View>
        </View>
      </GradientCard>

      {/* Level Progress */}
      <GradientCard style={styles.levelCard}>
        <View style={styles.levelRow}>
          <View style={styles.levelBadge}>
            <Text style={styles.levelNum}>{profile.level}</Text>
          </View>
          <View style={styles.levelInfo}>
            <Text style={styles.levelTitle}>Level {profile.level} – Fashion Explorer</Text>
            <ProgressBar
              progress={(profile.xp / profile.xpToNext) * 100}
              height={8}
              showLabel
              label={`${profile.xp} / ${profile.xpToNext} XP`}
            />
          </View>
        </View>
      </GradientCard>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['all', 'available', 'in-progress', 'completed'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'all' ? '📋 All' : f === 'available' ? '🆕 New' : f === 'in-progress' ? '⏳ Active' : '✅ Done'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quest Cards */}
      {filteredQuests.map((quest) => (
        <TouchableOpacity
          key={quest.id}
          style={styles.questCard}
          onPress={() => setSelectedQuest(quest)}
          activeOpacity={0.8}
        >
          <View style={styles.questCardHeader}>
            <Text style={styles.questIcon}>{quest.icon}</Text>
            <View style={styles.questCardInfo}>
              <Text style={styles.questTitle}>{quest.title}</Text>
              <View style={styles.questTagRow}>
                <View style={[styles.difficultyBadge, { backgroundColor: DIFFICULTY_COLORS[quest.difficulty] }]}>
                  <Text style={styles.difficultyText}>{quest.difficulty}</Text>
                </View>
                <Text style={styles.questTypeSmall}>{QUEST_TYPE_LABELS[quest.type]}</Text>
              </View>
            </View>
            <View style={styles.questRewardCol}>
              <Text style={styles.questXP}>+{quest.xpReward} XP</Text>
              <Text style={styles.questPts}>+{quest.pointsReward} pts</Text>
            </View>
          </View>

          <Text style={styles.questDesc} numberOfLines={2}>{quest.description}</Text>

          {/* Progress Bar */}
          {quest.status !== 'available' && (
            <View style={styles.questProgressRow}>
              <ProgressBar
                progress={quest.progress}
                height={6}
                gradient={
                  quest.status === 'completed'
                    ? Colors.gradientEco
                    : [DIFFICULTY_COLORS[quest.difficulty], Colors.primaryLight]
                }
              />
              <Text style={styles.questSteps}>
                {quest.completedSteps}/{quest.totalSteps}
              </Text>
            </View>
          )}

          {/* Status Indicator */}
          <View style={styles.questStatusRow}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    quest.status === 'completed'
                      ? Colors.success
                      : quest.status === 'in-progress'
                        ? Colors.warning
                        : Colors.textMuted,
                },
              ]}
            />
            <Text style={styles.statusText}>
              {quest.status === 'completed'
                ? 'Completed ✓'
                : quest.status === 'in-progress'
                  ? 'In Progress'
                  : 'Ready to Start'}
            </Text>
            {quest.deadline && (
              <Text style={styles.deadlineSmall}>⏰ {quest.deadline}</Text>
            )}
          </View>
        </TouchableOpacity>
      ))}

      {filteredQuests.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🎯</Text>
          <Text style={styles.emptyText}>No quests match this filter</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    paddingTop: 54,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary },
  headerSub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4, lineHeight: 20 },

  // Stats
  statsCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.md },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: FontSize.xxl, fontWeight: '800', color: '#FFF' },
  statLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.7)', marginTop: 2 },

  // Level
  levelCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.md },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  levelBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNum: { fontSize: FontSize.xl, fontWeight: '800', color: '#FFF' },
  levelInfo: { flex: 1 },
  levelTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },

  // Filters
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterBtnActive: { backgroundColor: Colors.primaryDark, borderColor: Colors.primary },
  filterText: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '600' },
  filterTextActive: { color: Colors.primaryLight },

  // Quest Card
  questCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.card,
  },
  questCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  questIcon: { fontSize: 32, marginRight: Spacing.md },
  questCardInfo: { flex: 1 },
  questTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  questTagRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  difficultyBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  difficultyText: { color: '#FFF', fontSize: FontSize.xs, fontWeight: '700' },
  questTypeSmall: { color: Colors.textMuted, fontSize: FontSize.xs },
  questRewardCol: { alignItems: 'flex-end' },
  questXP: { color: Colors.primaryLight, fontSize: FontSize.sm, fontWeight: '700' },
  questPts: { color: Colors.success, fontSize: FontSize.xs, fontWeight: '600' },
  questDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  questProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  questSteps: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '600' },
  questStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600' },
  deadlineSmall: { color: Colors.textMuted, fontSize: FontSize.xs, marginLeft: 'auto' },

  // Detail View
  detailHeader: {
    paddingTop: 54,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
  },
  backBtn: { alignSelf: 'flex-start', marginBottom: Spacing.md },
  backText: { color: Colors.primaryLight, fontSize: FontSize.md, fontWeight: '600' },
  questDetailIcon: { fontSize: 56, marginBottom: Spacing.md },
  questDetailTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  questMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  questCity: { color: Colors.textSecondary, fontSize: FontSize.sm },
  questType: { color: Colors.textSecondary, fontSize: FontSize.sm },

  section: { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  questDescription: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 24,
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.warning + '20',
    borderRadius: BorderRadius.sm,
  },
  deadlineIcon: { fontSize: 16 },
  deadlineText: { color: Colors.warning, fontSize: FontSize.sm, fontWeight: '600' },

  requirementsList: { marginTop: Spacing.lg, gap: Spacing.md },
  requirementItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  requirementCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requirementCheckDone: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  requirementCheckText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },
  requirementText: { flex: 1, color: Colors.textSecondary, fontSize: FontSize.md },
  requirementTextDone: { textDecorationLine: 'line-through', color: Colors.textMuted },

  rewardsGrid: { flexDirection: 'row', justifyContent: 'space-evenly' },
  rewardItem: { alignItems: 'center' },
  rewardValue: { fontSize: FontSize.xxl, fontWeight: '800', color: '#FFF' },
  rewardLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.7)', marginTop: 4 },

  actionSection: { paddingHorizontal: Spacing.lg, marginTop: Spacing.md },
  actionBtn: {
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    ...Shadows.button,
  },
  actionBtnText: { color: '#FFF', fontSize: FontSize.lg, fontWeight: '800' },

  // Empty
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: { color: Colors.textSecondary, fontSize: FontSize.lg, fontWeight: '600' },
});
