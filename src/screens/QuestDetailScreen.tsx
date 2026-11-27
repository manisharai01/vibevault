// ============================================================
// VibeVault – Quest Detail Screen
// Steps checklist, time limit, rewards and quest actions.
// ============================================================

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CompositeNavigationProp, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { BorderRadius, Colors, FontSize, Shadows, Spacing } from '../constants/theme';
import { useQuest } from '../store/hooks';
import { useStore } from '../store/useStore';
import { QuestsStackParamList, RootTabParamList } from '../navigation/types';
import EmptyState from '../components/common/EmptyState';
import GradientCard from '../components/common/GradientCard';
import ProgressBar from '../components/common/ProgressBar';
import ScreenHeader from '../components/common/ScreenHeader';
import { BADGE_BY_ID, describeTimeLeft, getLevelInfo } from '../services/gamification';
import { openThriftStoresNearby } from '../services/linking';
import { formatDate } from '../utils/date';
import { notify } from '../utils/dialog';
import { DIFFICULTY_COLORS, QUEST_TYPE_LABELS } from './questUi';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<QuestsStackParamList, 'QuestDetail'>,
  BottomTabNavigationProp<RootTabParamList>
>;

export default function QuestDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<QuestsStackParamList, 'QuestDetail'>>();
  const quest = useQuest(route.params?.questId);
  const startQuest = useStore((s) => s.startQuest);
  const completeQuestStep = useStore((s) => s.completeQuestStep);

  if (!quest) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Quest not found" onBack={() => navigation.goBack()} />
        <EmptyState icon="trophy-outline" title="This quest is no longer available" />
      </View>
    );
  }

  const badge = quest.badgeId ? BADGE_BY_ID[quest.badgeId] : undefined;
  const now = new Date();

  const handleStart = () => {
    if (!startQuest(quest.id)) return;
    notify(
      quest.status === 'expired' ? '🔁 Quest restarted!' : '🎯 Quest started!',
      `"${quest.title}" is now in progress.${quest.durationDays ? ` You have ${quest.durationDays} days to finish it.` : ''} Check off each step as you complete it.`,
    );
  };

  const handleCompleteStep = () => {
    const result = completeQuestStep(quest.id);
    if (result.status === 'completed') {
      const lines = [`You earned ${result.xp} XP and ${result.points} points!`];
      if (result.badge) lines.push(`🏅 New badge: ${result.badge.icon} ${result.badge.name}`);
      if (result.newLevel) lines.push(`⭐ Level up! You're now level ${result.newLevel} – ${getLevelInfo(useStore.getState().profile.totalXP).title}.`);
      notify('🎉 Quest complete!', lines.join('\n\n'));
    } else if (result.status === 'expired') {
      notify('⏰ Time is up', 'This quest passed its time limit. You can restart it whenever you are ready.');
    }
  };

  const nextStep = quest.steps[quest.completedSteps];

  const helper = (() => {
    switch (quest.helperAction) {
      case 'find-thrift-stores':
        return {
          label: '🗺️ Find thrift stores near me',
          role: 'link' as const,
          onPress: async () => {
            if (!(await openThriftStoresNearby())) notify('Unable to open maps', 'Could not open a map on this device.');
          },
        };
      case 'open-composer':
        return {
          label: '👗 Open the Stylist',
          role: 'button' as const,
          onPress: () => navigation.navigate('Compose', { screen: 'ComposeMain', pop: true }),
        };
      case 'open-deals':
        return {
          label: '🔔 Open Deal Detector',
          role: 'button' as const,
          onPress: () => navigation.navigate('Prices', { screen: 'DealsFeed', params: { view: 'alerts' }, pop: true }),
        };
      case 'open-profiler':
        return { label: '✨ Open Style Profiler', role: 'button' as const, onPress: () => navigation.navigate('Profiler') };
      default:
        return null;
    }
  })();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
      <ScreenHeader title="" onBack={() => navigation.goBack()} gradient={[DIFFICULTY_COLORS[quest.difficulty] + '55', Colors.background]}>
        <View style={styles.hero}>
          <Text style={styles.questIcon}>{quest.icon}</Text>
          <Text style={styles.questTitle} accessibilityRole="header">
            {quest.title}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.difficultyBadge, { backgroundColor: DIFFICULTY_COLORS[quest.difficulty] }]}>
              <Text style={styles.difficultyText}>{quest.difficulty}</Text>
            </View>
            <Text style={styles.metaText}>{QUEST_TYPE_LABELS[quest.type]}</Text>
          </View>
        </View>
      </ScreenHeader>

      <GradientCard style={styles.section}>
        <Text style={styles.sectionTitle}>📋 Quest Details</Text>
        <Text style={styles.description}>{quest.description}</Text>
        {quest.status === 'in-progress' && quest.deadline ? (
          <View style={styles.deadlineRow}>
            <Text style={styles.deadlineText}>
              ⏰ Ends {formatDate(quest.deadline)} · {describeTimeLeft(quest.deadline, now)}
            </Text>
          </View>
        ) : quest.durationDays && quest.status !== 'completed' ? (
          <View style={styles.deadlineRow}>
            <Text style={styles.deadlineText}>⏰ {quest.durationDays}-day time limit once started</Text>
          </View>
        ) : null}
        {quest.status === 'completed' && quest.completedAt ? (
          <Text style={styles.completedText}>✅ Completed on {formatDate(quest.completedAt)}</Text>
        ) : null}
      </GradientCard>

      <GradientCard style={styles.section}>
        <Text style={styles.sectionTitle}>📊 Progress</Text>
        <ProgressBar
          progress={quest.progress}
          height={12}
          showLabel
          label={`${quest.completedSteps} / ${quest.totalSteps} steps`}
          gradient={[DIFFICULTY_COLORS[quest.difficulty], Colors.primaryLight]}
        />
        <View style={styles.stepsList}>
          {quest.steps.map((step, i) => {
            const done = i < quest.completedSteps;
            const current = quest.status === 'in-progress' && i === quest.completedSteps;
            return (
              <View key={`step-${i}`} style={styles.stepItem} accessibilityLabel={`Step ${i + 1}: ${step}${done ? ', done' : ''}`}>
                <View style={[styles.stepCheck, done && styles.stepCheckDone, current && styles.stepCheckCurrent]}>
                  <Text style={styles.stepCheckText}>{done ? '✓' : i + 1}</Text>
                </View>
                <Text style={[styles.stepText, done && styles.stepTextDone, current && styles.stepTextCurrent]}>{step}</Text>
              </View>
            );
          })}
        </View>
      </GradientCard>

      <GradientCard style={styles.section} gradient={Colors.gradientPrimary}>
        <Text style={styles.sectionTitleLight}>🎁 Rewards</Text>
        <View style={styles.rewardsGrid}>
          <View style={styles.rewardItem}>
            <Text style={styles.rewardValue}>+{quest.xpReward}</Text>
            <Text style={styles.rewardLabel}>XP</Text>
          </View>
          <View style={styles.rewardItem}>
            <Text style={styles.rewardValue}>+{quest.pointsReward}</Text>
            <Text style={styles.rewardLabel}>Points</Text>
          </View>
          {badge && (
            <View style={styles.rewardItem}>
              <Text style={styles.rewardValue}>{badge.icon}</Text>
              <Text style={styles.rewardLabel}>{badge.name}</Text>
            </View>
          )}
        </View>
      </GradientCard>

      <View style={styles.actionSection}>
        {helper && quest.status !== 'completed' && (
          <TouchableOpacity style={styles.linkBtn} onPress={helper.onPress} accessibilityRole={helper.role}>
            <Text style={styles.linkBtnText}>{helper.label}</Text>
          </TouchableOpacity>
        )}

        {(quest.status === 'available' || quest.status === 'expired') && (
          <TouchableOpacity onPress={handleStart} activeOpacity={0.85} accessibilityRole="button">
            <LinearGradient colors={Colors.gradientPrimary} style={styles.actionBtn}>
              <Text style={styles.actionBtnText}>{quest.status === 'expired' ? '🔁 Try Again' : '🚀 Start Quest'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {quest.status === 'in-progress' && nextStep && (
          <TouchableOpacity onPress={handleCompleteStep} activeOpacity={0.85} accessibilityRole="button">
            <LinearGradient colors={Colors.gradientAccent} style={styles.actionBtn}>
              <Text style={styles.actionBtnText}>
                ✅ Done: step {quest.completedSteps + 1} of {quest.totalSteps}
              </Text>
              <Text style={styles.actionBtnSub} numberOfLines={2}>
                {nextStep}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  hero: { alignItems: 'center' },
  questIcon: { fontSize: 56, marginBottom: Spacing.sm },
  questTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.md },
  metaText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  difficultyBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },
  difficultyText: { color: '#1A1A2E', fontSize: FontSize.xs, fontWeight: '800' },

  section: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  sectionTitleLight: { fontSize: FontSize.lg, fontWeight: '700', color: '#FFF', marginBottom: Spacing.md },
  description: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 24 },
  deadlineRow: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.warning + '20',
    borderRadius: BorderRadius.sm,
  },
  deadlineText: { color: Colors.warning, fontSize: FontSize.sm, fontWeight: '600' },
  completedText: { color: Colors.success, fontSize: FontSize.sm, fontWeight: '700', marginTop: Spacing.md },

  stepsList: { marginTop: Spacing.lg, gap: Spacing.md },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  stepCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCheckDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  stepCheckCurrent: { borderColor: Colors.primaryLight },
  stepCheckText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },
  stepText: { flex: 1, color: Colors.textSecondary, fontSize: FontSize.md },
  stepTextDone: { textDecorationLine: 'line-through', color: Colors.textMuted },
  stepTextCurrent: { color: Colors.textPrimary, fontWeight: '600' },

  rewardsGrid: { flexDirection: 'row', justifyContent: 'space-evenly' },
  rewardItem: { alignItems: 'center', flex: 1 },
  rewardValue: { fontSize: FontSize.xxl, fontWeight: '800', color: '#FFF' },
  rewardLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.85)', marginTop: 4, textAlign: 'center' },

  actionSection: { paddingHorizontal: Spacing.lg, marginTop: Spacing.lg, gap: Spacing.md },
  linkBtn: { paddingVertical: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  linkBtnText: { color: Colors.primaryLight, fontSize: FontSize.md, fontWeight: '700' },
  actionBtn: { paddingVertical: Spacing.lg, paddingHorizontal: Spacing.lg, borderRadius: BorderRadius.lg, alignItems: 'center', ...Shadows.button },
  actionBtnText: { color: '#FFF', fontSize: FontSize.lg, fontWeight: '800' },
  actionBtnSub: { color: 'rgba(255,255,255,0.9)', fontSize: FontSize.sm, marginTop: 4, textAlign: 'center' },
});
