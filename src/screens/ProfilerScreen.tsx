// ============================================================
// VibeVault – Style Profiler Screen (Objective 1)
//
// Multi-step questionnaire (personality, music, media, palette,
// lifestyle, sustainability, budget) that generates the user's
// style archetypes and personalises every recommendation.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Platform as RNPlatform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, FontSize, STYLE_COLORS, Spacing } from '../constants/theme';
import { DEFAULT_SUSTAINABILITY_ANSWER, PROFILER_QUESTIONS, QUESTION_IDS } from '../data/profilerQuestions';
import { useStore } from '../store/useStore';
import { ProfilerAnswers } from '../types';
import { RootTabParamList } from '../navigation/types';
import GradientCard from '../components/common/GradientCard';
import ProgressBar from '../components/common/ProgressBar';
import ProductImage from '../components/common/ProductImage';
import Tag from '../components/common/Tag';
import { BUDGET_LABELS } from '../services/styleEngine';
import { notify } from '../utils/dialog';
import { formatMoney } from '../utils/format';

const USE_NATIVE_DRIVER = RNPlatform.OS !== 'web';
const SLIDER_STOPS = [0, 25, 50, 75, 100];

const withDefaults = (answers: ProfilerAnswers): ProfilerAnswers => ({
  [QUESTION_IDS.sustainability]: DEFAULT_SUSTAINABILITY_ANSWER,
  ...answers,
});

/** Option label without its leading emoji, e.g. "🎵 Pop" → "Pop". */
function optionLabel(questionId: string, value: string): string {
  const option = PROFILER_QUESTIONS.find((q) => q.id === questionId)?.options?.find((o) => o.value === value);
  return option ? option.label.replace(/^\S+\s+/, '') : value;
}

function sustainabilityLabel(value: number): string {
  if (value >= 100) return 'Top priority';
  if (value >= 75) return 'Very important';
  if (value >= 50) return 'Important';
  if (value >= 25) return 'Nice to have';
  return 'Not a priority';
}

function vibeStrengthLabel(score: number): string {
  if (score >= 85) return 'Laser-focused — your answers point clearly to a signature style.';
  if (score >= 70) return 'Clear direction with a few complementary influences.';
  if (score >= 55) return 'Eclectic — you blend several aesthetics with ease.';
  return 'Wide-ranging — you love to experiment across styles.';
}

export default function ProfilerScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList, 'Profiler'>>();
  const insets = useSafeAreaInsets();
  const { isProfileComplete, profile, vibeSummary, completeProfile, recommendedItems } = useStore(
    useShallow((s) => ({
      isProfileComplete: s.isProfileComplete,
      profile: s.profile,
      vibeSummary: s.vibeSummary,
      completeProfile: s.completeProfile,
      recommendedItems: s.recommendedItems,
    })),
  );

  const [mode, setMode] = useState<'quiz' | 'results'>(isProfileComplete ? 'results' : 'quiz');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<ProfilerAnswers>(() => withDefaults(profile.profilerAnswers));

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const resultAnim = useRef(new Animated.Value(0)).current;
  const animating = useRef(false);

  // If saved data is reset elsewhere, start the quiz from scratch.
  useEffect(() => {
    if (!isProfileComplete) {
      setMode('quiz');
      setStep(0);
      setAnswers(withDefaults({}));
    }
  }, [isProfileComplete]);

  useEffect(() => {
    if (mode !== 'results') return;
    resultAnim.setValue(0);
    Animated.spring(resultAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: USE_NATIVE_DRIVER }).start();
  }, [mode, resultAnim]);

  const totalSteps = PROFILER_QUESTIONS.length;
  const question = PROFILER_QUESTIONS[step];
  const isLastStep = step === totalSteps - 1;

  const animateTo = useCallback(
    (nextStep: number) => {
      if (animating.current) return;
      animating.current = true;
      const direction = nextStep > step ? 1 : -1;
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: USE_NATIVE_DRIVER, easing: Easing.out(Easing.ease) }),
        Animated.timing(slideAnim, { toValue: -30 * direction, duration: 120, useNativeDriver: USE_NATIVE_DRIVER }),
      ]).start(() => {
        setStep(nextStep);
        slideAnim.setValue(30 * direction);
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: USE_NATIVE_DRIVER, easing: Easing.out(Easing.ease) }),
          Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: USE_NATIVE_DRIVER, easing: Easing.out(Easing.back(1.2)) }),
        ]).start(() => {
          animating.current = false;
        });
      });
    },
    [fadeAnim, slideAnim, step],
  );

  const goBackStep = useCallback(() => {
    if (step > 0) animateTo(step - 1);
  }, [animateTo, step]);

  // Android back button steps back through the quiz (BackHandler doesn't exist on web).
  useFocusEffect(
    useCallback(() => {
      if (mode !== 'quiz' || RNPlatform.OS === 'web') return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (step > 0) {
          goBackStep();
          return true;
        }
        if (isProfileComplete) {
          setMode('results');
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [mode, step, isProfileComplete, goBackStep]),
  );

  const canProceed = (() => {
    const value = answers[question.id];
    if (question.type === 'slider') return typeof value === 'number';
    if (question.type === 'multi') return Array.isArray(value) && value.length > 0;
    return typeof value === 'string' && value.length > 0;
  })();

  const selectSingle = (value: string) => setAnswers((prev) => ({ ...prev, [question.id]: value }));
  const toggleMulti = (value: string) =>
    setAnswers((prev) => {
      const current = Array.isArray(prev[question.id]) ? (prev[question.id] as string[]) : [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [question.id]: next };
    });
  const setSlider = (value: number) => setAnswers((prev) => ({ ...prev, [question.id]: value }));

  const handleNext = () => {
    if (!canProceed) return;
    if (!isLastStep) {
      animateTo(step + 1);
      return;
    }
    const { newBadges } = completeProfile(answers);
    setMode('results');
    setStep(0);
    if (newBadges.length > 0) {
      notify(`🏅 Badge unlocked: ${newBadges[0].name}`, newBadges[0].description);
    }
  };

  const startRetake = () => {
    setAnswers(withDefaults(profile.profilerAnswers));
    setStep(0);
    fadeAnim.setValue(1);
    slideAnim.setValue(0);
    setMode('quiz');
  };

  const openMatch = (itemId: string) =>
    navigation.navigate('Discover', { screen: 'ItemDetail', params: { itemId }, initial: false });

  // ---- Results ----
  if (mode === 'results' && isProfileComplete) {
    const topMatches = recommendedItems.filter((item) => item.available).slice(0, 3);
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.resultsContent}>
        <LinearGradient
          colors={[Colors.primary, Colors.primaryDark, Colors.background]}
          style={[styles.resultsHeader, { paddingTop: insets.top + Spacing.xl }]}
        >
          <Text style={styles.resultsEmoji}>✨</Text>
          <Text style={styles.resultsTitle} accessibilityRole="header">
            Your Vibe is Ready!
          </Text>
          <Text style={styles.vibeSummary}>{vibeSummary}</Text>
        </LinearGradient>

        <Animated.View
          style={{
            opacity: resultAnim,
            transform: [{ translateY: resultAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          }}
        >
          <GradientCard style={styles.section}>
            <Text style={styles.sectionTitle}>🎯 Your Style DNA</Text>
            {profile.styleArchetypes.map((arch, i) => (
              <View key={arch} style={styles.archetypeItem}>
                <LinearGradient
                  colors={[STYLE_COLORS[arch] || Colors.primary, Colors.surface]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.archetypeBadge}
                >
                  <Text style={styles.archetypeRank}>#{i + 1}</Text>
                  <Text style={styles.archetypeName}>{arch}</Text>
                  <Text style={styles.archetypeScore}>{profile.styleScores[arch] ?? 0}%</Text>
                </LinearGradient>
              </View>
            ))}
          </GradientCard>

          <GradientCard style={styles.section}>
            <Text style={styles.sectionTitle}>📊 Vibe Strength</Text>
            <View style={styles.vibeScoreContainer}>
              <View style={styles.vibeScoreCircle} accessibilityLabel={`Vibe strength ${profile.vibeScore} out of 100`}>
                <Text style={styles.vibeScoreNumber}>{profile.vibeScore}</Text>
                <Text style={styles.vibeScoreLabel}>/ 100</Text>
              </View>
              <Text style={styles.vibeScoreDesc}>
                {vibeStrengthLabel(profile.vibeScore)}
                {'\n'}Every listing is now ranked by how well it fits your vibe.
              </Text>
            </View>
          </GradientCard>

          <GradientCard style={styles.section}>
            <Text style={styles.sectionTitle}>🎵 Taste Profile</Text>
            <Text style={styles.subLabel}>Music</Text>
            <View style={styles.tagRow}>
              {profile.musicGenres.length > 0 ? (
                profile.musicGenres.map((g) => <Tag key={g} label={optionLabel(QUESTION_IDS.music, g)} color={Colors.primary} selected />)
              ) : (
                <Text style={styles.mutedText}>No genres selected</Text>
              )}
            </View>
            <Text style={[styles.subLabel, { marginTop: Spacing.md }]}>Movies & shows</Text>
            <View style={styles.tagRow}>
              {profile.mediaPreferences.length > 0 ? (
                profile.mediaPreferences.map((m) => <Tag key={m} label={optionLabel(QUESTION_IDS.media, m)} color={Colors.accent} selected />)
              ) : (
                <Text style={styles.mutedText}>No genres selected</Text>
              )}
            </View>
            <View style={styles.prefRow}>
              <View style={styles.prefItem}>
                <Text style={styles.subLabel}>Budget / item</Text>
                <Text style={styles.prefValue}>{profile.budgetTier ? BUDGET_LABELS[profile.budgetTier] : 'Any'}</Text>
              </View>
              <View style={styles.prefItem}>
                <Text style={styles.subLabel}>Sustainability</Text>
                <Text style={styles.prefValue}>{sustainabilityLabel(profile.sustainabilityPriority)}</Text>
              </View>
            </View>
          </GradientCard>

          <GradientCard style={styles.section}>
            <Text style={styles.sectionTitle}>👗 Top Matches for You</Text>
            {topMatches.length === 0 && (
              <Text style={styles.matchMeta}>Your matches appear here once live listings have loaded.</Text>
            )}
            {topMatches.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.matchItem}
                onPress={() => openMatch(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${item.matchScore}% match`}
              >
                <ProductImage uri={item.image} style={styles.matchImage} category={item.category} colors={item.colors} iconSize={16} />
                <View style={styles.matchInfo}>
                  <Text style={styles.matchTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.matchMeta} numberOfLines={1}>
                    {[item.brand, formatMoney(item.currentPrice, item.currency), item.platform].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.matchScoreBadge,
                    { backgroundColor: item.matchScore >= 80 ? Colors.success : item.matchScore >= 60 ? Colors.primary : Colors.accentDark },
                  ]}
                >
                  <Text style={styles.matchScoreText}>{item.matchScore}%</Text>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => navigation.navigate('Discover', { screen: 'DiscoverFeed', pop: true })}
              accessibilityRole="button"
              style={styles.hintBtn}
            >
              <Text style={styles.hintText}>See all your recommendations →</Text>
            </TouchableOpacity>
          </GradientCard>

          <TouchableOpacity style={styles.retakeBtn} onPress={startRetake} accessibilityRole="button">
            <Text style={styles.retakeBtnText}>🔄 Retake Quiz</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    );
  }

  // ---- Quiz ----
  const multiValues = Array.isArray(answers[question.id]) ? (answers[question.id] as string[]) : [];
  const sliderValue = typeof answers[question.id] === 'number' ? (answers[question.id] as number) : DEFAULT_SUSTAINABILITY_ANSWER;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.quizContent} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={[Colors.primaryDark, Colors.background]} style={[styles.quizHeader, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.quizTitleRow}>
            <Text style={styles.headerTitle} accessibilityRole="header">
              ✨ Style Profiler
            </Text>
            {isProfileComplete && (
              <TouchableOpacity onPress={() => setMode('results')} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.headerSub}>
            Question {step + 1} of {totalSteps}
          </Text>
          <ProgressBar progress={((step + 1) / totalSteps) * 100} height={6} accessibilityLabel="Quiz progress" />
        </LinearGradient>

        <Animated.View style={[styles.questionContainer, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
          <Text style={styles.questionText}>{question.question}</Text>

          {question.type === 'single' && question.options && (
            <View style={styles.optionsList} accessibilityRole="radiogroup">
              {question.options.map((opt) => {
                const selected = answers[question.id] === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.optionBtn, selected && styles.optionBtnSelected]}
                    onPress={() => selectSingle(opt.value)}
                    activeOpacity={0.7}
                    accessibilityRole="radio"
                    aria-checked={selected}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{opt.label}</Text>
                    {selected && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {question.type === 'multi' && question.options && (
            <View>
              <Text style={styles.multiHint}>Select all that apply</Text>
              <View style={styles.multiGrid}>
                {question.options.map((opt) => {
                  const selected = multiValues.includes(opt.value);
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.multiChip, selected && styles.multiChipSelected]}
                      onPress={() => toggleMulti(opt.value)}
                      activeOpacity={0.7}
                      accessibilityRole="checkbox"
                      aria-checked={selected}
                    >
                      <Text style={[styles.multiChipText, selected && styles.multiChipTextSelected]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {question.type === 'slider' && (
            <View style={styles.sliderContainer}>
              <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabel}>{question.minLabel ?? 'Low'}</Text>
                <Text style={styles.sliderLabel}>{question.maxLabel ?? 'High'}</Text>
              </View>
              <View style={styles.sliderTrack} accessibilityRole="radiogroup">
                {SLIDER_STOPS.map((val) => {
                  const selected = sliderValue === val;
                  return (
                    <TouchableOpacity
                      key={val}
                      style={[styles.sliderDot, selected && styles.sliderDotActive]}
                      onPress={() => setSlider(val)}
                      accessibilityRole="radio"
                      aria-checked={selected}
                      accessibilityLabel={`${val} — ${sustainabilityLabel(val)}`}
                    >
                      <Text style={[styles.sliderDotText, selected && styles.sliderDotTextActive]}>{val}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.sliderFillTrack}>
                <View style={[styles.sliderFill, { width: `${sliderValue}%` }]} />
              </View>
              <Text style={styles.sliderCaption}>{sustainabilityLabel(sliderValue)}</Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      <View style={styles.navButtons}>
        <TouchableOpacity
          style={[styles.navBtn, styles.navBtnBack, step === 0 && styles.navBtnDisabled]}
          onPress={goBackStep}
          disabled={step === 0}
          accessibilityRole="button"
          accessibilityLabel="Previous question"
          aria-disabled={step === 0}
        >
          <Text style={styles.navBtnText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navBtn, styles.navBtnNext, !canProceed && styles.navBtnDisabled]}
          onPress={handleNext}
          disabled={!canProceed}
          accessibilityRole="button"
          accessibilityLabel={isLastStep ? 'See my vibe' : 'Next question'}
          aria-disabled={!canProceed}
        >
          <LinearGradient
            colors={canProceed ? Colors.gradientPrimary : [Colors.surfaceLight, Colors.surfaceLight]}
            style={styles.navBtnGradient}
          >
            <Text style={[styles.navBtnText, { color: '#FFF' }]}>{isLastStep ? '✨ See My Vibe' : 'Next →'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  resultsContent: { paddingBottom: Spacing.xxxl },
  quizContent: { paddingBottom: Spacing.xl },

  // Results
  resultsHeader: { paddingBottom: 40, paddingHorizontal: Spacing.xl, alignItems: 'center' },
  resultsEmoji: { fontSize: 48, marginBottom: Spacing.md },
  resultsTitle: { fontSize: FontSize.xxxl, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  vibeSummary: { fontSize: FontSize.lg, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.md, lineHeight: 24 },
  section: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg },
  sectionTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  archetypeItem: { marginBottom: Spacing.sm },
  archetypeBadge: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: BorderRadius.md },
  archetypeRank: { fontSize: FontSize.xxl, fontWeight: '800', color: 'rgba(255,255,255,0.5)', marginRight: Spacing.md },
  archetypeName: { flex: 1, fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  archetypeScore: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary },
  vibeScoreContainer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  vibeScoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vibeScoreNumber: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.primaryLight },
  vibeScoreLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  vibeScoreDesc: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  subLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '700',
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap' },
  mutedText: { color: Colors.textMuted, fontSize: FontSize.sm },
  prefRow: { flexDirection: 'row', marginTop: Spacing.md, gap: Spacing.md },
  prefItem: { flex: 1 },
  prefValue: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  matchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  matchImage: { width: 44, height: 44, borderRadius: BorderRadius.sm },
  matchInfo: { flex: 1 },
  matchTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  matchMeta: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  matchScoreBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  matchScoreText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.sm },
  hintBtn: { marginTop: Spacing.md, alignItems: 'center', paddingVertical: Spacing.xs },
  hintText: { color: Colors.primaryLight, fontSize: FontSize.sm, fontWeight: '700' },
  retakeBtn: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  retakeBtnText: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: '600' },

  // Quiz
  quizHeader: { paddingBottom: Spacing.xl, paddingHorizontal: Spacing.xl },
  quizTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary },
  cancelText: { color: Colors.primaryLight, fontSize: FontSize.md, fontWeight: '700' },
  headerSub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  questionContainer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl },
  questionText: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, lineHeight: 30, marginBottom: Spacing.xl },
  optionsList: { gap: Spacing.sm },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionBtnSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryDark + '30' },
  optionText: { fontSize: FontSize.md, color: Colors.textSecondary, flex: 1 },
  optionTextSelected: { color: Colors.textPrimary, fontWeight: '600' },
  checkmark: { fontSize: FontSize.xl, color: Colors.primaryLight, fontWeight: '700' },
  multiHint: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md },
  multiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  multiChip: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  multiChipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '30' },
  multiChipText: { fontSize: FontSize.md, color: Colors.textSecondary },
  multiChipTextSelected: { color: Colors.primaryLight, fontWeight: '600' },
  sliderContainer: { paddingVertical: Spacing.xl },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.lg },
  sliderLabel: { fontSize: FontSize.sm, color: Colors.textMuted },
  sliderTrack: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
  sliderDot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderDotActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '30' },
  sliderDotText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },
  sliderDotTextActive: { color: Colors.primaryLight },
  sliderFillTrack: { height: 4, backgroundColor: Colors.surfaceLight, borderRadius: 2 },
  sliderFill: { height: 4, backgroundColor: Colors.primary, borderRadius: 2 },
  sliderCaption: { color: Colors.primaryLight, fontSize: FontSize.md, fontWeight: '700', textAlign: 'center', marginTop: Spacing.lg },
  navButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  navBtn: { flex: 1, marginHorizontal: Spacing.xs },
  navBtnBack: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center' },
  navBtnNext: { borderRadius: BorderRadius.md, overflow: 'hidden' },
  navBtnGradient: { padding: Spacing.md, alignItems: 'center', borderRadius: BorderRadius.md },
  navBtnDisabled: { opacity: 0.4 },
  navBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textSecondary },
});
