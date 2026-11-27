// ============================================================
// VibeVault – Style Profiler Screen (Objective 1)
//
// Asks where the user shops and which sections, six personality
// questions, colours, fit, occasions, budget and pre-owned
// preference, then a taste check on real live listings. The
// result explains each style score with the answers behind it.
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Platform as RNPlatform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, FontSize, STYLE_COLORS, Spacing } from '../constants/theme';
import {
  COLOR_FAMILIES,
  COLOR_FAMILY_LABELS,
  COLOR_FAMILY_SWATCH,
  FIT_LABELS,
  matchesShopFor,
  OCCASION_LABELS,
  SHOP_FOR_LABELS,
  STYLE_ARCHETYPES,
} from '../constants/marketplaces';
import { COUNTRIES, countryByCode, countryFlag, countryName, guessCountryFromLocale } from '../data/countries';
import { DEFAULT_SUSTAINABILITY_ANSWER, PROFILER_QUESTIONS, PROFILER_VERSION, QUESTION_IDS, TASTE_CHECK_SIZE } from '../data/profilerQuestions';
import { useStore } from '../store/useStore';
import { ColorFamily, FashionItem, ProfilerAnswers, TasteRating, Trait } from '../types';
import { RootTabParamList } from '../navigation/types';
import GradientCard from '../components/common/GradientCard';
import ProgressBar from '../components/common/ProgressBar';
import ProductImage from '../components/common/ProductImage';
import { priceIn } from '../services/catalog';
import { colorFamilies } from '../services/itemTraits';
import { TRAIT_LABELS } from '../services/styleEngine';
import { notify } from '../utils/dialog';
import { currencySymbol, formatMoney, formatMoneyWhole, parsePriceInput } from '../utils/format';

const USE_NATIVE_DRIVER = RNPlatform.OS !== 'web';
const SLIDER_STOPS = [0, 25, 50, 75, 100];

function preownedLabel(value: number): string {
  if (value >= 100) return 'Pre-owned whenever possible';
  if (value >= 75) return 'Strong preference';
  if (value >= 50) return 'Some preference';
  if (value >= 25) return 'Slight preference';
  return 'No preference';
}

function vibeStrengthLabel(score: number): string {
  if (score >= 85) return 'Laser-focused — your answers point clearly to a signature style.';
  if (score >= 70) return 'Clear direction with a few complementary influences.';
  if (score >= 55) return 'Eclectic — you blend several aesthetics.';
  return 'Wide-ranging — you like to experiment across styles.';
}

/** "1,234" style budget suggestion rounded to 2 significant figures. */
function roundNice(value: number): number {
  if (!(value > 0)) return 0;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 1);
  return Math.ceil(value / magnitude) * magnitude;
}

/** Up to TASTE_CHECK_SIZE real listings that between them cover as many styles as possible. */
function pickTasteItems(items: FashionItem[]): FashionItem[] {
  const withImages = items.filter((i) => i.available && i.image);
  const picked: FashionItem[] = [];
  for (const style of STYLE_ARCHETYPES) {
    const candidate = withImages
      .filter((i) => i.styleArchetypes.includes(style) && !picked.includes(i))
      // Items tagged with fewer styles say more about a style.
      .sort((a, b) => a.styleArchetypes.length - b.styleArchetypes.length || a.id.localeCompare(b.id))[0];
    if (candidate) picked.push(candidate);
    if (picked.length >= TASTE_CHECK_SIZE) break;
  }
  return picked;
}

export default function ProfilerScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList, 'Profiler'>>();
  const insets = useSafeAreaInsets();
  const { isProfileComplete, profile, vibeSummary, completeProfile, recommendedItems, catalogMarket, availableMarkets, fxRates } = useStore(
    useShallow((s) => ({
      isProfileComplete: s.isProfileComplete,
      profile: s.profile,
      vibeSummary: s.vibeSummary,
      completeProfile: s.completeProfile,
      recommendedItems: s.recommendedItems,
      catalogMarket: s.catalogMarket,
      availableMarkets: s.availableMarkets,
      fxRates: s.fxRates,
    })),
  );

  const initialAnswers = useCallback(
    (): ProfilerAnswers => ({
      [QUESTION_IDS.sustainability]: DEFAULT_SUSTAINABILITY_ANSWER,
      [QUESTION_IDS.country]: profile.country ?? guessCountryFromLocale() ?? null,
      ...profile.profilerAnswers,
    }),
    [profile.country, profile.profilerAnswers],
  );

  const [mode, setMode] = useState<'quiz' | 'results'>(isProfileComplete ? 'results' : 'quiz');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<ProfilerAnswers>(initialAnswers);
  const [ratings, setRatings] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(profile.tasteRatings.map((r) => [r.itemId, r.liked])),
  );
  const [budgetText, setBudgetText] = useState('');

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const animating = useRef(false);

  // If saved data is reset elsewhere, start the quiz from scratch.
  useEffect(() => {
    if (!isProfileComplete) {
      setMode('quiz');
      setStep(0);
    }
  }, [isProfileComplete]);

  const chosenCountry = typeof answers[QUESTION_IDS.country] === 'string' ? (answers[QUESTION_IDS.country] as string) : null;
  const shopFor = answers[QUESTION_IDS.shopFor];
  // Budget is asked in the currency the profile will use.
  const budgetCurrency =
    chosenCountry && chosenCountry !== profile.country ? (countryByCode(chosenCountry)?.currency ?? profile.currency) : profile.currency;
  // Country-specific steps use the loaded listings when they cover the chosen country (a first
  // run loads every country, so its listings for the chosen one are there too).
  const catalogFits = !!chosenCountry && (catalogMarket === chosenCountry || catalogMarket === null);
  const sectionItems = useMemo(
    () =>
      catalogFits
        ? recommendedItems.filter(
            (i) =>
              i.available &&
              i.market === chosenCountry &&
              matchesShopFor(i.department, shopFor === 'women' || shopFor === 'men' || shopFor === 'all' ? shopFor : null),
          )
        : [],
    [catalogFits, recommendedItems, shopFor, chosenCountry],
  );
  const tasteItems = useMemo(() => pickTasteItems(sectionItems), [sectionItems]);

  const budgetSuggestions = useMemo(() => {
    const prices = sectionItems
      .map((i) => priceIn(i, budgetCurrency, fxRates))
      .filter((p): p is number => p !== null)
      .sort((a, b) => a - b);
    if (prices.length < 8) return [];
    const at = (q: number) => roundNice(prices[Math.min(prices.length - 1, Math.floor(q * prices.length))]);
    return [...new Set([at(0.25), at(0.5), at(0.75), at(0.9)])].filter((v) => v > 0);
  }, [sectionItems, budgetCurrency, fxRates]);

  // The taste check only runs when there are real listings to rate.
  const questions = useMemo(
    () => PROFILER_QUESTIONS.filter((q) => q.type !== 'taste' || tasteItems.length >= 4),
    [tasteItems.length],
  );
  const totalSteps = questions.length;
  const question = questions[Math.min(step, totalSteps - 1)];
  const isLastStep = step >= totalSteps - 1;

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
        // The new question is showing: taps work again while it fades in (a quick "Next" isn't lost).
        animating.current = false;
        slideAnim.setValue(30 * direction);
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: USE_NATIVE_DRIVER, easing: Easing.out(Easing.ease) }),
          Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: USE_NATIVE_DRIVER, easing: Easing.out(Easing.back(1.2)) }),
        ]).start();
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

  const value = answers[question.id];
  const canProceed = (() => {
    switch (question.type) {
      case 'slider':
        return typeof value === 'number';
      case 'multi':
      case 'colors':
        return question.optional || (Array.isArray(value) && value.length > 0);
      case 'budget':
        return question.id in answers && (value === null || (typeof value === 'number' && value > 0));
      case 'taste':
        return tasteItems.filter((i) => i.id in ratings).length >= Math.min(4, tasteItems.length);
      default:
        return typeof value === 'string' && value.length > 0;
    }
  })();

  const setAnswer = (id: string, next: ProfilerAnswers[string]) => setAnswers((prev) => ({ ...prev, [id]: next }));
  const toggleIn = (id: string, item: string) =>
    setAnswers((prev) => {
      const current = Array.isArray(prev[id]) ? (prev[id] as string[]) : [];
      return { ...prev, [id]: current.includes(item) ? current.filter((v) => v !== item) : [...current, item] };
    });

  const handleNext = () => {
    if (!canProceed) return;
    if (!isLastStep) {
      animateTo(step + 1);
      return;
    }
    const taste: TasteRating[] = tasteItems
      .filter((i) => i.id in ratings)
      .map((i) => ({ itemId: i.id, liked: ratings[i.id], archetypes: i.styleArchetypes, colors: colorFamilies(i), category: i.category }));
    const { newBadges } = completeProfile(answers, taste);
    setMode('results');
    setStep(0);
    if (newBadges.length > 0) notify(`🏅 Badge unlocked: ${newBadges[0].name}`, newBadges[0].description);
  };

  const startRetake = () => {
    setAnswers(initialAnswers());
    setRatings(Object.fromEntries(profile.tasteRatings.map((r) => [r.itemId, r.liked])));
    setBudgetText('');
    setStep(0);
    fadeAnim.setValue(1);
    slideAnim.setValue(0);
    setMode('quiz');
  };

  const openMatch = (itemId: string) => navigation.navigate('Discover', { screen: 'ItemDetail', params: { itemId }, initial: false });

  // ---- Results ----
  if (mode === 'results' && isProfileComplete) {
    const topMatches = recommendedItems
      .filter((item) => item.available && matchesShopFor(item.department, profile.shopFor) && (!profile.country || item.market === profile.country))
      .slice(0, 3);
    const traits = (Object.entries(profile.traits) as [Trait, number][]).filter(([, v]) => v >= 0.25).sort((a, b) => b[1] - a[1]);
    const outdated = profile.profilerVersion < PROFILER_VERSION;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.resultsContent}>
        <LinearGradient colors={[Colors.primary, Colors.primaryDark, Colors.background]} style={[styles.resultsHeader, { paddingTop: insets.top + Spacing.xl }]}>
          <Text style={styles.resultsEmoji}>✨</Text>
          <Text style={styles.resultsTitle} accessibilityRole="header">
            Your Style Profile
          </Text>
          <Text style={styles.vibeSummary}>{vibeSummary}</Text>
        </LinearGradient>

        {outdated && (
          <TouchableOpacity style={styles.updateBanner} onPress={startRetake} accessibilityRole="button">
            <Text style={styles.updateTitle}>New: a more personal profile</Text>
            <Text style={styles.updateText}>
              Tell us where you shop, which sections, your colours, fit and occasions, and rate a few real pieces — your outfits get much more accurate.
            </Text>
            <Text style={styles.updateCta}>Update my profile →</Text>
          </TouchableOpacity>
        )}

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
              {profile.styleReasons
                .filter((r) => r.archetype === arch)
                .map((r) => (
                  <Text key={r.text} style={styles.reasonText}>
                    • {r.text}
                  </Text>
                ))}
            </View>
          ))}
          {traits.length > 0 && (
            <Text style={styles.traitsText}>Personality: {traits.map(([t]) => TRAIT_LABELS[t]).join(' · ')}</Text>
          )}
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
              {'\n'}Listings are ranked by how well they fit, and the pieces you save keep teaching it.
            </Text>
          </View>
        </GradientCard>

        <GradientCard style={styles.section}>
          <Text style={styles.sectionTitle}>🧾 Your Preferences</Text>
          <Pref label="Shopping in" value={profile.country ? `${countryFlag(profile.country)} ${countryName(profile.country)} · ${profile.currency}` : 'Not set'} />
          <Pref label="Sections" value={profile.shopFor ? SHOP_FOR_LABELS[profile.shopFor] : 'All'} />
          <Pref label="Colours you love" value={profile.likedColors.map((c) => COLOR_FAMILY_LABELS[c]).join(', ') || '—'} />
          {profile.avoidColors.length > 0 && <Pref label="Never" value={profile.avoidColors.map((c) => COLOR_FAMILY_LABELS[c]).join(', ')} />}
          <Pref label="Fit" value={profile.fit ? FIT_LABELS[profile.fit] : '—'} />
          <Pref label="Occasions" value={profile.occasions.map((o) => OCCASION_LABELS[o]).join(', ') || '—'} />
          <Pref label="Budget per piece" value={profile.budgetMax ? `Up to ${formatMoneyWhole(profile.budgetMax, profile.currency)}` : 'No limit'} />
          <Pref label="Pre-owned" value={preownedLabel(profile.sustainabilityPriority)} />
        </GradientCard>

        <GradientCard style={styles.section}>
          <Text style={styles.sectionTitle}>👗 Top Matches for You</Text>
          {topMatches.length === 0 && <Text style={styles.matchMeta}>Your matches appear here once live listings have loaded.</Text>}
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
                  {[formatMoney(item.currentPrice, item.currency), item.platform].join(' · ')}
                </Text>
                {item.matchReasons[0] && (
                  <Text style={styles.matchReason} numberOfLines={1}>
                    {item.matchReasons[0]}
                  </Text>
                )}
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
          <TouchableOpacity onPress={() => navigation.navigate('Compose', { screen: 'ComposeMain', pop: true })} accessibilityRole="button" style={styles.hintBtn}>
            <Text style={styles.hintText}>See outfits built for you →</Text>
          </TouchableOpacity>
        </GradientCard>

        {/* An outdated profile already has the update banner at the top, which starts the same quiz. */}
        {!outdated && (
          <TouchableOpacity style={styles.retakeBtn} onPress={startRetake} accessibilityRole="button">
            <Text style={styles.retakeBtnText}>🔄 Retake the Profiler</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }

  // ---- Quiz ----
  const listValues = Array.isArray(value) ? (value as string[]) : [];
  const sliderValue = typeof value === 'number' ? value : DEFAULT_SUSTAINABILITY_ANSWER;
  const liveCountries = availableMarkets.map((m) => m.market).filter((c) => countryByCode(c));
  const otherCountries = COUNTRIES.filter((c) => !liveCountries.includes(c.code));
  const lovedColors = Array.isArray(answers[QUESTION_IDS.colorsLove]) ? (answers[QUESTION_IDS.colorsLove] as string[]) : [];

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
          <ProgressBar progress={((step + 1) / totalSteps) * 100} height={6} accessibilityLabel="Profiler progress" />
        </LinearGradient>

        <Animated.View style={[styles.questionContainer, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
          <Text style={styles.questionText}>{question.question}</Text>
          {question.help && <Text style={styles.helpText}>{question.help}</Text>}

          {question.type === 'country' && (
            <View>
              {liveCountries.length > 0 && <Text style={styles.groupLabel}>Live prices now</Text>}
              <View style={styles.multiGrid}>
                {liveCountries.map((code) => (
                  <Chip key={code} label={`${countryFlag(code)} ${countryName(code)}`} selected={value === code} onPress={() => setAnswer(question.id, code)} radio />
                ))}
              </View>
              <Text style={styles.groupLabel}>{liveCountries.length > 0 ? 'Other countries' : 'Countries'}</Text>
              <View style={styles.multiGrid}>
                {otherCountries.map((c) => (
                  <Chip key={c.code} label={`${countryFlag(c.code)} ${c.name}`} selected={value === c.code} onPress={() => setAnswer(question.id, c.code)} radio />
                ))}
              </View>
            </View>
          )}

          {question.type === 'single' && question.options && (
            <View style={styles.optionsList} accessibilityRole="radiogroup">
              {question.options.map((opt) => {
                const selected = value === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.optionBtn, selected && styles.optionBtnSelected]}
                    onPress={() => setAnswer(question.id, opt.value)}
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
            <View style={styles.multiGrid}>
              {question.options.map((opt) => (
                <Chip key={opt.value} label={opt.label} selected={listValues.includes(opt.value)} onPress={() => toggleIn(question.id, opt.value)} />
              ))}
            </View>
          )}

          {question.type === 'colors' && (
            <View style={styles.colorGrid}>
              {COLOR_FAMILIES.map((family: ColorFamily) => {
                const selected = listValues.includes(family);
                const disabled = question.id === QUESTION_IDS.colorsAvoid && lovedColors.includes(family);
                return (
                  <TouchableOpacity
                    key={family}
                    style={[styles.colorChip, selected && styles.colorChipSelected, disabled && styles.navBtnDisabled]}
                    onPress={() => !disabled && toggleIn(question.id, family)}
                    accessibilityRole="checkbox"
                    aria-checked={selected}
                    aria-disabled={disabled}
                    accessibilityLabel={COLOR_FAMILY_LABELS[family]}
                  >
                    <View style={[styles.swatch, { backgroundColor: COLOR_FAMILY_SWATCH[family] }]} />
                    <Text style={[styles.colorLabel, selected && styles.optionTextSelected]}>{COLOR_FAMILY_LABELS[family]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {question.type === 'budget' && (
            <View>
              <View style={styles.multiGrid}>
                {budgetSuggestions.map((amount) => (
                  <Chip
                    key={amount}
                    label={`Up to ${formatMoneyWhole(amount, budgetCurrency)}`}
                    selected={value === amount}
                    onPress={() => {
                      setBudgetText('');
                      setAnswer(question.id, amount);
                    }}
                    radio
                  />
                ))}
                <Chip
                  label="No limit"
                  selected={question.id in answers && value === null}
                  onPress={() => {
                    setBudgetText('');
                    setAnswer(question.id, null);
                  }}
                  radio
                />
              </View>
              <Text style={styles.groupLabel}>Or type an amount ({budgetCurrency})</Text>
              <View style={styles.budgetInputRow}>
                <Text style={styles.budgetSymbol}>{currencySymbol(budgetCurrency)}</Text>
                <TextInput
                  style={styles.budgetInput}
                  keyboardType="decimal-pad"
                  value={budgetText}
                  placeholder="e.g. 1500"
                  placeholderTextColor={Colors.textMuted}
                  onChangeText={(text) => {
                    setBudgetText(text);
                    const parsed = parsePriceInput(text);
                    setAnswers((prev) => {
                      const next = { ...prev };
                      if (parsed) next[question.id] = parsed;
                      else delete next[question.id];
                      return next;
                    });
                  }}
                  accessibilityLabel={`Budget per piece in ${budgetCurrency}`}
                />
              </View>
              {budgetSuggestions.length > 0 && (
                <Text style={styles.helpText}>Suggestions are the 25th–90th percentile of today’s live prices for your sections.</Text>
              )}
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
                      onPress={() => setAnswer(question.id, val)}
                      accessibilityRole="radio"
                      aria-checked={selected}
                      accessibilityLabel={`${val} — ${preownedLabel(val)}`}
                    >
                      <Text style={[styles.sliderDotText, selected && styles.sliderDotTextActive]}>{val}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.sliderFillTrack}>
                <View style={[styles.sliderFill, { width: `${sliderValue}%` }]} />
              </View>
              <Text style={styles.sliderCaption}>{preownedLabel(sliderValue)}</Text>
            </View>
          )}

          {question.type === 'taste' && (
            <View style={styles.tasteGrid}>
              {tasteItems.map((item) => {
                const rating = ratings[item.id];
                return (
                  <View key={item.id} style={styles.tasteCard}>
                    <ProductImage uri={item.image} style={styles.tasteImage} category={item.category} colors={item.colors} iconSize={28} />
                    <Text style={styles.tasteTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.tasteMeta} numberOfLines={1}>
                      {formatMoney(item.currentPrice, item.currency)} · {item.platform}
                    </Text>
                    <View style={styles.tasteButtons}>
                      <TouchableOpacity
                        style={[styles.tasteBtn, rating === false && styles.tasteBtnNo]}
                        onPress={() => setRatings((r) => ({ ...r, [item.id]: false }))}
                        accessibilityRole="button"
                        aria-selected={rating === false}
                        accessibilityLabel={`Not for me: ${item.title}`}
                      >
                        <Text style={styles.tasteBtnText}>✕</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.tasteBtn, rating === true && styles.tasteBtnYes]}
                        onPress={() => setRatings((r) => ({ ...r, [item.id]: true }))}
                        accessibilityRole="button"
                        aria-selected={rating === true}
                        accessibilityLabel={`I'd wear it: ${item.title}`}
                      >
                        <Text style={styles.tasteBtnText}>♥</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
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
          accessibilityLabel={isLastStep ? 'See my style profile' : question.optional && listValues.length === 0 ? 'Skip' : 'Next question'}
          aria-disabled={!canProceed}
        >
          <LinearGradient colors={canProceed ? Colors.gradientPrimary : [Colors.surfaceLight, Colors.surfaceLight]} style={styles.navBtnGradient}>
            <Text style={[styles.navBtnText, { color: '#FFF' }]}>
              {isLastStep ? '✨ See My Style' : question.optional && listValues.length === 0 ? 'Skip →' : 'Next →'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Chip({ label, selected, onPress, radio }: { label: string; selected: boolean; onPress: () => void; radio?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.multiChip, selected && styles.multiChipSelected]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole={radio ? 'radio' : 'checkbox'}
      aria-checked={selected}
    >
      <Text style={[styles.multiChipText, selected && styles.multiChipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Pref({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.prefRow}>
      <Text style={styles.prefLabel}>{label}</Text>
      <Text style={styles.prefValue}>{value}</Text>
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
  updateBanner: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryDark + '40',
  },
  updateTitle: { color: Colors.textPrimary, fontWeight: '800', fontSize: FontSize.md },
  updateText: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 4, lineHeight: 18 },
  updateCta: { color: Colors.primaryLight, fontWeight: '800', fontSize: FontSize.sm, marginTop: Spacing.sm },
  section: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg },
  sectionTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  archetypeItem: { marginBottom: Spacing.md },
  archetypeBadge: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: BorderRadius.md },
  archetypeRank: { fontSize: FontSize.xxl, fontWeight: '800', color: 'rgba(255,255,255,0.5)', marginRight: Spacing.md },
  archetypeName: { flex: 1, fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  archetypeScore: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary },
  reasonText: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 4, marginLeft: Spacing.sm, lineHeight: 18 },
  traitsText: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: Spacing.xs },
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
  prefRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  prefLabel: { color: Colors.textMuted, fontSize: FontSize.sm },
  prefValue: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
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
  matchReason: { fontSize: FontSize.xs, color: Colors.primaryLight, marginTop: 2 },
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
  questionText: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, lineHeight: 30, marginBottom: Spacing.sm },
  helpText: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.lg, lineHeight: 18 },
  groupLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  optionsList: { gap: Spacing.sm, marginTop: Spacing.sm },
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
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  colorChip: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  colorChipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '30' },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  colorLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, flexShrink: 1 },
  budgetInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
  },
  budgetSymbol: { color: Colors.textSecondary, fontSize: FontSize.lg, fontWeight: '700', marginRight: Spacing.xs },
  budgetInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.lg, paddingVertical: Spacing.md },
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
  tasteGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.md },
  tasteCard: { width: '48%', backgroundColor: Colors.card, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  tasteImage: { width: '100%', height: 150 },
  tasteTitle: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600', paddingHorizontal: Spacing.sm, marginTop: Spacing.sm, minHeight: 34 },
  tasteMeta: { color: Colors.textMuted, fontSize: FontSize.xs, paddingHorizontal: Spacing.sm, marginTop: 2 },
  tasteButtons: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.sm },
  tasteBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: BorderRadius.sm, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  tasteBtnNo: { backgroundColor: Colors.error + '40', borderColor: Colors.error },
  tasteBtnYes: { backgroundColor: Colors.success + '40', borderColor: Colors.success },
  tasteBtnText: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '800' },
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
