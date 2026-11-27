// ============================================================
// VibeVault – Quests
// Styling and second-hand challenges that earn XP, points and
// badges.
// ============================================================

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BorderRadius, Colors, Fonts, Spacing, Type } from '../constants/theme';
import { useLevelInfo, useQuests } from '../store/hooks';
import { useStore } from '../store/useStore';
import { Quest } from '../types';
import { QuestsStackParamList } from '../navigation/types';
import EmptyState from '../components/common/EmptyState';
import { Card, PageTitle, Segmented, Stat } from '../components/ui/Layout';
import { Meter } from '../components/ui/Visuals';
import { describeTimeLeft } from '../services/gamification';
import { formatNumber } from '../utils/format';
import { DIFFICULTY_COLORS, QUEST_TYPE_LABELS } from './questUi';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Filter = 'all' | 'available' | 'in-progress' | 'completed';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'New' },
  { key: 'in-progress', label: 'Active' },
  { key: 'completed', label: 'Done' },
];

function matchesFilter(quest: Quest, filter: Filter): boolean {
  if (filter === 'all') return true;
  // Expired quests can be restarted, so they appear with the new ones.
  if (filter === 'available') return quest.status === 'available' || quest.status === 'expired';
  return quest.status === filter;
}

const STATUS_TEXT: Record<Quest['status'], string> = {
  completed: 'Completed',
  'in-progress': 'In progress',
  expired: 'Expired — try again',
  available: 'Ready to start',
};

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
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Spacing.xxxl }}>
      <PageTitle eyebrow="Challenges" title="Quests" subtitle="Styling and second-hand challenges that earn XP, points and badges." />

      <Card style={styles.block}>
        <View style={styles.levelRow}>
          <View style={styles.levelBadge}>
            <Text style={styles.levelNum}>{level.level}</Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={Type.bodyStrong}>
              Level {level.level} · {level.title}
            </Text>
            <Meter value={level.progress} label="Level progress" />
            <Text style={Type.caption}>{level.isMaxLevel ? 'Max level reached' : `${level.xpIntoLevel} / ${level.xpForLevel} XP to the next level`}</Text>
          </View>
        </View>
        <View style={styles.stats}>
          <Stat value={String(activeCount)} label="In progress" />
          <Stat value={String(completedCount)} label="Completed" />
          <Stat value={formatNumber(totalXP)} label="Total XP" />
          <Stat value={formatNumber(points)} label="Points" />
        </View>
      </Card>

      <Segmented options={FILTERS} value={filter} onChange={setFilter} style={{ marginTop: Spacing.lg }} />

      <View style={styles.list}>
        {filtered.map((quest) => (
          <TouchableOpacity
            key={quest.id}
            style={styles.quest}
            onPress={() => navigation.navigate('QuestDetail', { questId: quest.id })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${quest.title}, ${quest.difficulty}, ${STATUS_TEXT[quest.status]}`}
          >
            <View style={styles.questTop}>
              <View style={[styles.icon, { borderColor: DIFFICULTY_COLORS[quest.difficulty] }]}>
                <Ionicons name={quest.icon as IconName} size={20} color={Colors.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={Type.eyebrow}>
                  {quest.difficulty} · {QUEST_TYPE_LABELS[quest.type]}
                </Text>
                <Text style={styles.questTitle}>{quest.title}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.reward}>+{quest.xpReward} XP</Text>
                <Text style={Type.caption}>+{quest.pointsReward} pts</Text>
              </View>
            </View>
            <Text style={[Type.small, { marginTop: Spacing.sm }]} numberOfLines={2}>
              {quest.description}
            </Text>
            {quest.status === 'in-progress' || quest.status === 'completed' ? (
              <View style={styles.progress}>
                <View style={{ flex: 1 }}>
                  <Meter value={quest.progress} color={quest.status === 'completed' ? Colors.buy : Colors.ink} label={`${quest.title} progress`} />
                </View>
                <Text style={Type.caption}>
                  {quest.completedSteps}/{quest.totalSteps}
                </Text>
              </View>
            ) : null}
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: quest.status === 'completed' ? Colors.buy : quest.status === 'in-progress' ? Colors.wait : quest.status === 'expired' ? Colors.error : Colors.textMuted }]} />
              <Text style={Type.caption}>{STATUS_TEXT[quest.status]}</Text>
              {quest.status === 'in-progress' && quest.deadline ? (
                <Text style={[Type.caption, { marginLeft: 'auto' }]}>{describeTimeLeft(quest.deadline, now)}</Text>
              ) : quest.status === 'available' && quest.durationDays ? (
                <Text style={[Type.caption, { marginLeft: 'auto' }]}>{quest.durationDays}-day limit</Text>
              ) : null}
            </View>
          </TouchableOpacity>
        ))}
        {filtered.length === 0 ? <EmptyState icon="flag-outline" title="No quests here yet" message="Start a quest to see it in this list." /> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  block: { marginHorizontal: Spacing.lg },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  levelBadge: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' },
  levelNum: { fontFamily: Fonts.display, fontSize: 28, color: Colors.textInverse },
  stats: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: Spacing.md },
  quest: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg },
  questTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  icon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  questTitle: { ...Type.title, fontSize: 21, lineHeight: 25, marginTop: 2 },
  reward: { fontFamily: Fonts.semibold, fontSize: 13, color: Colors.ink },
  progress: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.md },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
});
