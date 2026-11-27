// ============================================================
// VibeVault – Quest detail
// Steps checklist, time limit, rewards and the quest's actions.
// ============================================================

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CompositeNavigationProp, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { BorderRadius, Colors, Fonts, Spacing, Type } from '../constants/theme';
import { useQuest } from '../store/hooks';
import { useStore } from '../store/useStore';
import { QuestsStackParamList, RootTabParamList } from '../navigation/types';
import EmptyState from '../components/common/EmptyState';
import Button from '../components/ui/Button';
import { Card, PageTitle, Stat } from '../components/ui/Layout';
import { Meter } from '../components/ui/Visuals';
import { BADGE_BY_ID, describeTimeLeft, getLevelInfo } from '../services/gamification';
import { openThriftStoresNearby } from '../services/linking';
import { formatDate } from '../utils/date';
import { notify } from '../utils/dialog';
import { DIFFICULTY_COLORS, QUEST_TYPE_LABELS } from './questUi';

type Nav = CompositeNavigationProp<NativeStackNavigationProp<QuestsStackParamList, 'QuestDetail'>, BottomTabNavigationProp<RootTabParamList>>;
type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function QuestDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<QuestsStackParamList, 'QuestDetail'>>();
  const quest = useQuest(route.params?.questId);
  const startQuest = useStore((s) => s.startQuest);
  const completeQuestStep = useStore((s) => s.completeQuestStep);

  if (!quest) {
    return (
      <View style={styles.container}>
        <PageTitle title="Quest not found" onBack={() => navigation.goBack()} />
        <EmptyState icon="flag-outline" title="This quest is no longer available" />
      </View>
    );
  }

  const badge = quest.badgeId ? BADGE_BY_ID[quest.badgeId] : undefined;
  const now = new Date();
  const nextStep = quest.steps[quest.completedSteps];

  const handleStart = () => {
    if (!startQuest(quest.id)) return;
    notify(
      quest.status === 'expired' ? 'Quest restarted' : 'Quest started',
      `"${quest.title}" is now in progress.${quest.durationDays ? ` You have ${quest.durationDays} days to finish it.` : ''} Check off each step as you complete it.`,
    );
  };

  const handleCompleteStep = () => {
    const result = completeQuestStep(quest.id);
    if (result.status === 'completed') {
      const lines = [`You earned ${result.xp} XP and ${result.points} points.`];
      if (result.badge) lines.push(`New badge: ${result.badge.name}`);
      if (result.newLevel) lines.push(`Level up — you're now level ${result.newLevel}, ${getLevelInfo(useStore.getState().profile.totalXP).title}.`);
      notify('Quest complete!', lines.join('\n\n'));
    } else if (result.status === 'expired') {
      notify('Time is up', 'This quest passed its time limit. You can restart it whenever you are ready.');
    }
  };

  const helper = (() => {
    switch (quest.helperAction) {
      case 'find-thrift-stores':
        return {
          label: 'Find thrift stores near me',
          icon: 'map-outline' as IconName,
          role: 'link' as const,
          onPress: async () => {
            if (!(await openThriftStoresNearby())) notify('Unable to open maps', 'Could not open a map on this device.');
          },
        };
      case 'open-composer':
        return { label: 'Open the Stylist', icon: 'grid-outline' as IconName, role: 'button' as const, onPress: () => navigation.navigate('Compose', { screen: 'ComposeMain', pop: true }) };
      case 'open-deals':
        return {
          label: 'Open my price alerts',
          icon: 'notifications-outline' as IconName,
          role: 'button' as const,
          onPress: () => navigation.navigate('Prices', { screen: 'DealsFeed', params: { view: 'alerts' }, pop: true }),
        };
      case 'open-profiler':
        return { label: 'Open the style quiz', icon: 'finger-print-outline' as IconName, role: 'button' as const, onPress: () => navigation.navigate('Profiler') };
      default:
        return null;
    }
  })();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Spacing.xxxl }}>
      <PageTitle eyebrow={`${quest.difficulty} · ${QUEST_TYPE_LABELS[quest.type]}`} title={quest.title} onBack={() => navigation.goBack()}>
        <View style={[styles.icon, { borderColor: DIFFICULTY_COLORS[quest.difficulty] }]}>
          <Ionicons name={quest.icon as IconName} size={26} color={Colors.ink} />
        </View>
      </PageTitle>

      <Card style={styles.block}>
        <Text style={Type.body}>{quest.description}</Text>
        {quest.status === 'in-progress' && quest.deadline ? (
          <Text style={[Type.smallStrong, { marginTop: Spacing.md, color: Colors.wait }]}>
            Ends {formatDate(quest.deadline)} · {describeTimeLeft(quest.deadline, now)}
          </Text>
        ) : quest.durationDays && quest.status !== 'completed' ? (
          <Text style={[Type.small, { marginTop: Spacing.md }]}>{quest.durationDays}-day time limit once started</Text>
        ) : null}
        {quest.status === 'completed' && quest.completedAt ? (
          <Text style={[Type.smallStrong, { marginTop: Spacing.md, color: Colors.buy }]}>Completed on {formatDate(quest.completedAt)}</Text>
        ) : null}
      </Card>

      <Card style={styles.block}>
        <View style={styles.progressHead}>
          <Text style={Type.title}>Steps</Text>
          <Text style={Type.caption}>
            {quest.completedSteps} / {quest.totalSteps}
          </Text>
        </View>
        <Meter value={quest.progress} color={quest.status === 'completed' ? Colors.buy : Colors.ink} label="Quest progress" />
        <View style={{ marginTop: Spacing.md, gap: Spacing.sm }}>
          {quest.steps.map((step, i) => {
            const done = i < quest.completedSteps;
            const current = quest.status === 'in-progress' && i === quest.completedSteps;
            return (
              <View key={`step-${i}`} style={styles.step} accessibilityLabel={`Step ${i + 1}: ${step}${done ? ', done' : ''}`}>
                <View style={[styles.check, done && styles.checkDone, current && styles.checkCurrent]}>
                  {done ? <Ionicons name="checkmark" size={14} color={Colors.textInverse} /> : <Text style={styles.checkText}>{i + 1}</Text>}
                </View>
                <Text style={[Type.body, { flex: 1 }, done && styles.stepDone, current && Type.bodyStrong]}>{step}</Text>
              </View>
            );
          })}
        </View>
      </Card>

      <Card tone="muted" style={styles.block}>
        <Text style={Type.eyebrow}>Rewards</Text>
        <View style={[styles.rewards, { marginTop: Spacing.sm }]}>
          <Stat value={`+${quest.xpReward}`} label="XP" />
          <Stat value={`+${quest.pointsReward}`} label="Points" />
          {badge ? <Stat value={badge.name} label="Badge" /> : null}
        </View>
      </Card>

      <View style={styles.actions}>
        {helper && quest.status !== 'completed' ? (
          <Button label={helper.label} icon={helper.icon} variant="secondary" accessibilityRole={helper.role} onPress={helper.onPress} />
        ) : null}
        {quest.status === 'available' || quest.status === 'expired' ? (
          <Button label={quest.status === 'expired' ? 'Try again' : 'Start quest'} size="lg" onPress={handleStart} />
        ) : null}
        {quest.status === 'in-progress' && nextStep ? (
          <Button label={`Done: step ${quest.completedSteps + 1} of ${quest.totalSteps}`} icon="checkmark-circle-outline" size="lg" onPress={handleCompleteStep} />
        ) : null}
        {quest.status === 'completed' ? (
          <View style={styles.completed}>
            <Ionicons name="trophy-outline" size={18} color={Colors.buy} />
            <Text style={[Type.bodyStrong, { color: Colors.buy }]}>Quest completed</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  block: { marginHorizontal: Spacing.lg, marginTop: Spacing.md },
  icon: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.lg, backgroundColor: Colors.surface },
  progressHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: Spacing.sm },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: Colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkDone: { backgroundColor: Colors.buy, borderColor: Colors.buy },
  checkCurrent: { borderColor: Colors.ink, borderWidth: 2 },
  checkText: { fontFamily: Fonts.semibold, fontSize: 12, color: Colors.textSecondary },
  stepDone: { color: Colors.textMuted, textDecorationLine: 'line-through' },
  rewards: { flexDirection: 'row', gap: Spacing.md },
  actions: { paddingHorizontal: Spacing.lg, marginTop: Spacing.xl, gap: Spacing.sm },
  completed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 54, borderRadius: BorderRadius.md, backgroundColor: Colors.buyTint },
});
