// ============================================================
// VibeVault – Style Profiler Screen (Objective 1)
//
// Multi-stage questionnaire that captures personality traits,
// music preferences, and media consumption to generate
// personalized style archetypes via AI matching engine.
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, STYLE_COLORS } from '../constants/theme';
import { PROFILER_QUESTIONS } from '../data/profilerQuestions';
import { useStore } from '../store/useStore';
import {
  PersonalityDimension,
  MusicGenre,
  MediaPreference,
  StyleArchetype,
} from '../types';
import GradientCard from '../components/common/GradientCard';
import Tag from '../components/common/Tag';
import ProgressBar from '../components/common/ProgressBar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ProfilerScreen() {
  const { isProfileComplete, profile, vibeSummary, completeProfile, recommendedItems } = useStore();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [sliderValue, setSliderValue] = useState(50);
  const [showResults, setShowResults] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const resultAnim = useRef(new Animated.Value(0)).current;

  const questions = PROFILER_QUESTIONS;

    useEffect(() => {
      if (showResults) {
        resultAnim.setValue(0);
        Animated.spring(resultAnim, {
          toValue: 1,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }).start();
      }
    }, [showResults]);

  const totalSteps = questions.length;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  const animateTransition = (callback: () => void) => {
    slideAnim.setValue(0);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(slideAnim, { toValue: -30, duration: 120, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
    ]).start(() => {
      callback();
      slideAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.back(1.5)) }),
      ]).start();
    });
  };

  const handleSingleSelect = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleMultiSelect = (questionId: string, value: string) => {
    setAnswers((prev) => {
      const current = (prev[questionId] as string[]) || [];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [questionId]: updated };
    });
  };

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      animateTransition(() => setCurrentStep(currentStep + 1));
    } else {
      // Process all answers and generate style profile
      const personality: PersonalityDimension[] = [];
      const music: MusicGenre[] = [];
      const media: MediaPreference[] = [];

      // Extract personality from Q1, Q2
      const q1 = answers['q1_personality'] as string;
      if (q1) personality.push(q1 as PersonalityDimension);
      const q2 = answers['q2_thinking'] as string;
      if (q2) personality.push(q2 as PersonalityDimension);

      // Music from Q3
      const q3 = (answers['q3_music'] as string[]) || [];
      q3.forEach((m) => music.push(m as MusicGenre));

      // Media from Q4
      const q4 = (answers['q4_media'] as string[]) || [];
      q4.forEach((m) => media.push(m as MediaPreference));

      // Additional style signals from Q5, Q6
      const q5 = answers['q5_color'] as string;
      const q6 = answers['q6_weekend'] as string;
      if (q5 && ['minimalist', 'streetwear', 'bohemian', 'vintage', 'dark-academia', 'cottagecore'].includes(q5)) {
        // Map color choices to personality traits
        if (['minimalist', 'dark-academia'].includes(q5)) personality.push('analytical');
        if (['streetwear', 'bohemian'].includes(q5)) personality.push('creative');
      }

      const flatAnswers: Record<string, string> = {};
      for (const [k, v] of Object.entries(answers)) {
        flatAnswers[k] = Array.isArray(v) ? v.join(',') : (v as string);
      }
      flatAnswers['q7_sustainability'] = String(sliderValue);

      completeProfile(
        personality.length > 0 ? personality : ['creative'],
        music.length > 0 ? music : ['indie'],
        media.length > 0 ? media : ['comedy'],
        flatAnswers,
      );
      setShowResults(true);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      animateTransition(() => setCurrentStep(currentStep - 1));
    }
  };

  const canProceed = () => {
    const q = questions[currentStep];
    const a = answers[q.id];
    if (q.type === 'slider') return true;
    if (q.type === 'multi') return Array.isArray(a) && a.length > 0;
    return !!a;
  };

  // ---- Results View (after completing profiler) ----
  if (showResults || isProfileComplete) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <LinearGradient
          colors={[Colors.primary, Colors.primaryDark, Colors.background]}
          style={styles.resultsHeader}
        >
          <Text style={styles.resultsEmoji}>✨</Text>
          <Text style={styles.resultsTitle}>Your Vibe is Ready!</Text>
          <Text style={styles.vibeSummary}>{vibeSummary}</Text>
        </LinearGradient>
        <Animated.View style={{
          opacity: resultAnim,
          transform: [{ translateY: resultAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
        }}>

        {/* Style Archetypes */}
        <GradientCard style={styles.section}>
          <Text style={styles.sectionTitle}>🎯 Your Style DNA</Text>
          <View style={styles.archetypeList}>
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
                </LinearGradient>
              </View>
            ))}
          </View>
        </GradientCard>

        {/* Vibe Score */}
        <GradientCard style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Vibe Match Strength</Text>
          <View style={styles.vibeScoreContainer}>
            <View style={styles.vibeScoreCircle}>
              <Text style={styles.vibeScoreNumber}>{profile.vibeScore}</Text>
              <Text style={styles.vibeScoreLabel}>/ 100</Text>
            </View>
            <Text style={styles.vibeScoreDesc}>
              Your profile has strong alignment with your top archetypes.
              {'\n'}Items are now ranked by how well they match your unique vibe.
            </Text>
          </View>
        </GradientCard>

        {/* Music & Media Preferences */}
        <GradientCard style={styles.section}>
          <Text style={styles.sectionTitle}>🎵 Taste Profile</Text>
          <Text style={styles.subLabel}>Music</Text>
          <View style={styles.tagRow}>
            {profile.musicGenres.map((g) => (
              <Tag key={g} label={g} color={Colors.primary} selected />
            ))}
          </View>
          <Text style={[styles.subLabel, { marginTop: Spacing.md }]}>Media</Text>
          <View style={styles.tagRow}>
            {profile.mediaPreferences.map((m) => (
              <Tag key={m} label={m} color={Colors.accent} selected />
            ))}
          </View>
        </GradientCard>

        {/* Top Matches Preview */}
        <GradientCard style={styles.section}>
          <Text style={styles.sectionTitle}>👗 Top Matches for You</Text>
          {recommendedItems.slice(0, 3).map((item) => (
            <View key={item.id} style={styles.matchItem}>
              <View style={styles.matchInfo}>
                <Text style={styles.matchTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.matchMeta}>{item.brand} · ${item.currentPrice} · {item.platform}</Text>
              </View>
              <View style={[styles.matchScoreBadge, {
                backgroundColor: item.matchScore >= 80 ? Colors.success :
                  item.matchScore >= 60 ? Colors.primary : Colors.accent,
              }]}>
                <Text style={styles.matchScoreText}>{item.matchScore}%</Text>
              </View>
            </View>
          ))}
          <Text style={styles.hintText}>Head to Discover tab to see all recommendations →</Text>
        </GradientCard>

        {/* Retake Button */}
        <TouchableOpacity
          style={styles.retakeBtn}
          onPress={() => {
            setShowResults(false);
            setCurrentStep(0);
            setAnswers({});
          }}
        >
          <Text style={styles.retakeBtnText}>🔄 Retake Quiz</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </Animated.View>
      </ScrollView>
    );
  }

  // ---- Quiz View ----
  const currentQ = questions[currentStep];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.quizContent}>
        {/* Header */}
        <LinearGradient colors={[Colors.primaryDark, Colors.background]} style={styles.quizHeader}>
          <Text style={styles.headerTitle}>✨ Style Profiler</Text>
          <Text style={styles.headerSub}>
            Question {currentStep + 1} of {totalSteps}
          </Text>
          <ProgressBar progress={progress} height={6} />
        </LinearGradient>

        {/* Question */}
        <Animated.View style={[styles.questionContainer, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
          <Text style={styles.questionText}>{currentQ.question}</Text>

          {/* Single select */}
          {currentQ.type === 'single' && currentQ.options && (
            <View style={styles.optionsList}>
              {currentQ.options.map((opt: { label: string; value: string }) => {
                const isSelected = answers[currentQ.id] === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.optionBtn, isSelected && styles.optionBtnSelected]}
                    onPress={() => handleSingleSelect(currentQ.id, opt.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                      {opt.label}
                    </Text>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Multi select */}
          {currentQ.type === 'multi' && currentQ.options && (
            <View>
              <Text style={styles.multiHint}>Select all that apply</Text>
              <View style={styles.multiGrid}>
                {currentQ.options.map((opt: { label: string; value: string }) => {
                  const selected = ((answers[currentQ.id] as string[]) || []).includes(opt.value);
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.multiChip, selected && styles.multiChipSelected]}
                      onPress={() => handleMultiSelect(currentQ.id, opt.value)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.multiChipText, selected && styles.multiChipTextSelected]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Slider */}
          {currentQ.type === 'slider' && (
            <View style={styles.sliderContainer}>
              <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabel}>Not Important</Text>
                <Text style={styles.sliderLabel}>Very Important</Text>
              </View>
              <View style={styles.sliderTrack}>
                {[0, 25, 50, 75, 100].map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[
                      styles.sliderDot,
                      sliderValue === val && styles.sliderDotActive,
                    ]}
                    onPress={() => setSliderValue(val)}
                  >
                    <Text style={[
                      styles.sliderDotText,
                      sliderValue === val && styles.sliderDotTextActive,
                    ]}>
                      {val}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.sliderFillTrack}>
                <View style={[styles.sliderFill, { width: `${sliderValue}%` as any }]} />
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Navigation Buttons */}
      <View style={styles.navButtons}>
        <TouchableOpacity
          style={[styles.navBtn, styles.navBtnBack, currentStep === 0 && styles.navBtnDisabled]}
          onPress={handleBack}
          disabled={currentStep === 0}
        >
          <Text style={styles.navBtnText}>← Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navBtn, styles.navBtnNext, !canProceed() && styles.navBtnDisabled]}
          onPress={handleNext}
          disabled={!canProceed()}
        >
          <LinearGradient
            colors={canProceed() ? (Colors.gradientPrimary as [string, string]) : [Colors.surfaceLight, Colors.surfaceLight]}
            style={styles.navBtnGradient}
          >
            <Text style={[styles.navBtnText, { color: '#FFF' }]}>
              {currentStep === totalSteps - 1 ? '✨ See My Vibe' : 'Next →'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  quizContent: {
    paddingBottom: 100,
  },

  // Results
  resultsHeader: {
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
  },
  resultsEmoji: { fontSize: 48, marginBottom: Spacing.md },
  resultsTitle: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  vibeSummary: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.md,
    lineHeight: 24,
  },
  section: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  archetypeList: {
    gap: Spacing.sm,
  },
  archetypeItem: {
    marginBottom: Spacing.sm,
  },
  archetypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  archetypeRank: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.4)',
    marginRight: Spacing.md,
  },
  archetypeName: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  vibeScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  vibeScoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vibeScoreNumber: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.primaryLight,
  },
  vibeScoreLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  vibeScoreDesc: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  subLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '600',
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  matchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  matchInfo: { flex: 1 },
  matchTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  matchMeta: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  matchScoreBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  matchScoreText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  hintText: {
    color: Colors.primaryLight,
    fontSize: FontSize.sm,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  retakeBtn: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  retakeBtnText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },

  // Quiz
  quizHeader: {
    paddingTop: 60,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  headerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  headerSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  questionContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  questionText: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 30,
    marginBottom: Spacing.xl,
  },

  // Single options
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
  optionBtnSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryDark + '30',
  },
  optionText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    flex: 1,
  },
  optionTextSelected: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  checkmark: {
    fontSize: FontSize.xl,
    color: Colors.primary,
    fontWeight: '700',
  },

  // Multi select
  multiHint: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
  },
  multiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  multiChip: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  multiChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '30',
  },
  multiChipText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  multiChipTextSelected: {
    color: Colors.primaryLight,
    fontWeight: '600',
  },

  // Slider
  sliderContainer: {
    paddingVertical: Spacing.xl,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  sliderLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  sliderTrack: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
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
  sliderDotActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '30',
  },
  sliderDotText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  sliderDotTextActive: {
    color: Colors.primaryLight,
  },
  sliderFillTrack: {
    height: 4,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 2,
  },
  sliderFill: {
    height: 4,
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },

  // Nav
  navButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  navBtn: {
    flex: 1,
    marginHorizontal: Spacing.xs,
  },
  navBtnBack: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  navBtnNext: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  navBtnGradient: {
    padding: Spacing.md,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navBtnText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
});
