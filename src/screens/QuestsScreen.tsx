// ============================================================
// VibeVault – Quests Screen (Objective 3)
//
// Gamified style challenges — mood boards, styling challenges,
// thrift hunts — that earn XP, points and badges.
// ============================================================

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BorderRadius, Colors, FontSize, Shadows, Spacing } from '../constants/theme';
import { useLevelInfo, useQuests } from '../store/hooks';
import { useStore } from '../store/useStore';
import { Quest } from '../types';
import { QuestsStackParamList } from '../navigation/types';
import EmptyState from '../components/common/EmptyState';
import GradientCard from '../components/common/GradientCard';
import ProgressBar from '../components/common/ProgressBar';
import ScreenHeader from '../components/common/ScreenHeader';
import { describeTimeLeft } from '../services/gamification';
import { formatNumber } from '../utils/format';
import { DIFFICULTY_COLORS, QUEST_TYPE_LABELS } from './questUi';

type Filter = 'all' | 'available' | 'in-progress' | 'completed';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '📋 All' },
  { key: 'available', label: '🆕 New' },
  { key: 'in-progress', label: '⏳ Active' },
  { key: 'completed', label: '✅ Done' },
];

function matchesFilter(quest: Quest, filter: Filter): boolean {
  if (filter === 'all') return true;
  // Expired quests can be restarted, so they appear with the new ones.
  if (filter === 'available') return quest.status === 'available' || quest.status === 'expired';
  return quest.status === filter;
}

export default function QuestsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<QuestsStackParamList, 'QuestList'>>();
  const quests = useQuests();
  const level = useLevelInfo();
  const totalXP = useStore((s) => s.profile.totalXP);
  const points = useStore((s) => s.profile.points);
  const [filter, setFilter] = useState<Filter>('all');
  const now = new Date();

  const filtered = useMemo(() => quests.filter((q) => matchesFilter(q, filter)), [quests, filter]);
  const activeCount = quests.filter((q) => q.status === 'in-progress').length;
  const completedCount = quests.filter((q) => q.status === 'completed').length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
      <ScreenHeader title="⚔️ Style Quests" subtitle="Complete challenges, earn rewards and build a sustainable wardrobe." />

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
            <Text style={styles.statValue}>{formatNumber(totalXP)}</Text>
            <Text style={styles.statLabel}>Total XP</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatNumber(points)}</Text>
            <Text style={styles.statLabel}>Points</Text>
          </View>
        </View>
      </GradientCard>

      <GradientCard style={styles.levelCard}>
        <View style={styles.levelRow}>
          <View style={styles.levelBadge}>
            <Text style={styles.levelNum}>{level.level}</Text>
          </View>
          <View style={styles.levelInfo}>
            <Text style={styles.levelTitle}>
              Level {level.level} – {level.title}
            </Text>
            <ProgressBar
              progress={level.progress}
              height={8}
              showLabel
              label={level.isMaxLevel ? 'Max level reached' : `${level.xpIntoLevel} / ${level.xpForLevel} XP`}
              accessibilityLabel="Level progress"
            />
          </View>
        </View>
      </GradientCard>

      <View style={styles.filterRow} accessibilityRole="tablist">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterBtn, active && styles.filterBtnActive]}
              onPress={() => setFilter(f.key)}
              accessibilityRole="tab"
              aria-selected={active}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {filtered.map((quest) => {
        const statusColor =
          quest.status === 'completed'
            ? Colors.success
            : quest.status === 'in-progress'
              ? Colors.warning
              : quest.status === 'expired'
                ? Colors.error
                : Colors.textMuted;
        const statusText =
          quest.status === 'completed'
            ? 'Completed ✓'
            : quest.status === 'in-progress'
              ? 'In Progress'
              : quest.status === 'expired'
                ? 'Expired — try again'
                : 'Ready to Start';
        return (
          <TouchableOpacity
            key={quest.id}
            style={styles.questCard}
            onPress={() => navigation.navigate('QuestDetail', { questId: quest.id })}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`${quest.title}, ${quest.difficulty}, ${statusText}`}
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

            <Text style={styles.questDesc} numberOfLines={2}>
              {quest.description}
            </Text>

            {(quest.status === 'in-progress' || quest.status === 'completed') && (
              <View style={styles.questProgressRow}>
                <View style={{ flex: 1 }}>
                  <ProgressBar
                    progress={quest.progress}
                    height={6}
                    gradient={quest.status === 'completed' ? Colors.gradientEco : [DIFFICULTY_COLORS[quest.difficulty], Colors.primaryLight]}
                  />
                </View>
                <Text style={styles.questSteps}>
                  {quest.completedSteps}/{quest.totalSteps}
                </Text>
              </View>
            )}

            <View style={styles.questStatusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={styles.statusText}>{statusText}</Text>
              {quest.status === 'in-progress' && quest.deadline ? (
                <Text style={styles.deadlineSmall}>⏰ {describeTimeLeft(quest.deadline, now)}</Text>
              ) : quest.status === 'available' && quest.durationDays ? (
                <Text style={styles.deadlineSmall}>⏰ {quest.durationDays}-day limit</Text>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}

      {filtered.length === 0 && <EmptyState icon="trophy-outline" title="No quests here yet" message="Start a quest to see it in this list." />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  statsCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.md },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: FontSize.xxl, fontWeight: '800', color: '#FFF' },
  statLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.85)', marginTop: 2 },

  levelCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.md },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  levelBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  levelNum: { fontSize: FontSize.xl, fontWeight: '800', color: '#FFF' },
  levelInfo: { flex: 1 },
  levelTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },

  filterRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, marginTop: Spacing.lg, marginBottom: Spacing.md, gap: Spacing.sm },
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
  questCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  questIcon: { fontSize: 32, marginRight: Spacing.md },
  questCardInfo: { flex: 1 },
  questTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  questTagRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  difficultyBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },
  difficultyText: { color: '#1A1A2E', fontSize: FontSize.xs, fontWeight: '800' },
  questTypeSmall: { color: Colors.textMuted, fontSize: FontSize.xs },
  questRewardCol: { alignItems: 'flex-end' },
  questXP: { color: Colors.primaryLight, fontSize: FontSize.sm, fontWeight: '700' },
  questPts: { color: Colors.success, fontSize: FontSize.xs, fontWeight: '600' },
  questDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.sm },
  questProgressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  questSteps: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '600' },
  questStatusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600' },
  deadlineSmall: { color: Colors.textMuted, fontSize: FontSize.xs, marginLeft: 'auto' },
});
