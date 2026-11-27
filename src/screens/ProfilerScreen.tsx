// ============================================================
// VibeVault – Style quiz and style report
//
// Asks where the user shops and which sections, six personality
// questions, colours, fit, occasions, budget and pre-owned
// preference, then a taste check on real live listings. The report
// explains each style score with the answers behind it.
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Platform as RNPlatform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, Fonts, FontSize, STYLE_COLORS, Spacing, Type } from '../constants/theme';
import { COLOR_FAMILIES, COLOR_FAMILY_LABELS, COLOR_FAMILY_SWATCH, FIT_LABELS, matchesShopFor, OCCASION_LABELS, SHOP_FOR_LABELS, STYLE_ARCHETYPES } from '../constants/marketplaces';
import { COUNTRIES, countryByCode, countryFlag, countryName, guessCountryFromLocale } from '../data/countries';
import { DEFAULT_SUSTAINABILITY_ANSWER, PROFILER_QUESTIONS, PROFILER_VERSION, QUESTION_IDS, TASTE_CHECK_SIZE } from '../data/profilerQuestions';
import { useStore } from '../store/useStore';
import { ColorFamily, FashionItem, ProfilerAnswers, TasteRating, Trait } from '../types';
import { RootTabParamList } from '../navigation/types';
import ProductImage from '../components/common/ProductImage';
import Button from '../components/ui/Button';
import { Card, SectionHeader } from '../components/ui/Layout';
import { ListingRow } from '../components/ui/Listing';
import Pill from '../components/ui/Pill';
import { Meter, ProgressRing } from '../components/ui/Visuals';
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
  const [ratings, setRatings] = useState<Record<string, boolean>>(() => Object.fromEntries(profile.tasteRatings.map((r) => [r.itemId, r.liked])));
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
  const budgetCurrency = chosenCountry && chosenCountry !== profile.country ? (countryByCode(chosenCountry)?.currency ?? profile.currency) : profile.currency;
  // Country-specific steps use the loaded listings when they cover the chosen country (a first
  // run loads every country, so its listings for the chosen one are there too).
  const catalogFits = !!chosenCountry && (catalogMarket === chosenCountry || catalogMarket === null);
  const sectionItems = useMemo(
    () =>
      catalogFits
        ? recommendedItems.filter(
            (i) => i.available && i.market === chosenCountry && matchesShopFor(i.department, shopFor === 'women' || shopFor === 'men' || shopFor === 'all' ? shopFor : null),
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
  const questions = useMemo(() => PROFILER_QUESTIONS.filter((q) => q.type !== 'taste' || tasteItems.length >= 4), [tasteItems.length]);
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
        Animated.timing(slideAnim, { toValue: -24 * direction, duration: 120, useNativeDriver: USE_NATIVE_DRIVER }),
      ]).start(() => {
        setStep(nextStep);
        // The new question is showing: taps work again while it fades in (a quick "Next" isn't lost).
        animating.current = false;
        slideAnim.setValue(24 * direction);
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: USE_NATIVE_DRIVER, easing: Easing.out(Easing.ease) }),
          Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: USE_NATIVE_DRIVER, easing: Easing.out(Easing.cubic) }),
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
    if (newBadges.length > 0) notify(`Badge unlocked: ${newBadges[0].name}`, newBadges[0].description);
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

  // ---- Style report ----
  if (mode === 'results' && isProfileComplete) {
    const topMatches = recommendedItems
      .filter((item) => item.available && matchesShopFor(item.department, profile.shopFor) && (!profile.country || item.market === profile.country))
      .slice(0, 3);
    const traits = (Object.entries(profile.traits) as [Trait, number][]).filter(([, v]) => v >= 0.25).sort((a, b) => b[1] - a[1]);
    const outdated = profile.profilerVersion < PROFILER_VERSION;
    const lead = profile.styleArchetypes[0];
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Spacing.xxxl }}>
        <View style={[styles.reportHead, { paddingTop: insets.top + Spacing.xl }]}>
          <Text style={Type.eyebrow}>Your style report</Text>
          <Text style={styles.reportTitle} accessibilityRole="header">
            {lead ?? 'Your style'}
          </Text>
          {profile.styleArchetypes.length > 1 ? <Text style={styles.reportSub}>with {profile.styleArchetypes.slice(1).join(' and ')}</Text> : null}
          <Text style={[Type.body, { marginTop: Spacing.md }]}>{vibeSummary}</Text>
        </View>

        {outdated ? (
          <TouchableOpacity style={styles.update} onPress={startRetake} accessibilityRole="button" activeOpacity={0.9}>
            <View style={{ flex: 1 }}>
              <Text style={[Type.bodyStrong, { color: Colors.textInverse }]}>New: a more personal profile</Text>
              <Text style={[Type.small, { color: 'rgba(255,255,255,0.8)', marginTop: 4 }]}>
                Tell us where you shop, your sections, colours, fit and occasions, and rate a few real pieces — your wardrobe gets much more accurate.
              </Text>
            </View>
            <Text style={styles.updateCta}>Update my profile</Text>
          </TouchableOpacity>
        ) : null}

        <SectionHeader eyebrow="What your answers say" title="Your style DNA" />
        <Card style={styles.block}>
          {profile.styleArchetypes.map((arch) => (
            <View key={arch} style={styles.dna}>
              <View style={styles.dnaHead}>
                <View style={[styles.dot, { backgroundColor: STYLE_COLORS[arch] ?? Colors.textMuted }]} />
                <Text style={[Type.bodyStrong, { flex: 1 }]}>{arch}</Text>
                <Text style={Type.smallStrong}>{profile.styleScores[arch] ?? 0}%</Text>
              </View>
              <Meter value={profile.styleScores[arch] ?? 0} color={STYLE_COLORS[arch] ?? Colors.ink} label={`${arch} ${profile.styleScores[arch] ?? 0}%`} />
              {profile.styleReasons
                .filter((r) => r.archetype === arch)
                .map((r) => (
                  <Text key={r.text} style={[Type.small, { marginTop: 4 }]}>
                    · {r.text}
                  </Text>
                ))}
            </View>
          ))}
          {traits.length > 0 ? (
            <View style={styles.traits}>
              {traits.map(([t]) => (
                <View key={t} style={styles.trait}>
                  <Text style={styles.traitText}>{TRAIT_LABELS[t]}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>

        <Card style={[styles.block, styles.strength]}>
          <ProgressRing progress={profile.vibeScore / 100} label={String(profile.vibeScore)} sublabel="focus" />
          <View style={{ flex: 1 }}>
            <Text style={Type.bodyStrong}>Style focus</Text>
            <Text style={[Type.small, { marginTop: 4 }]}>{vibeStrengthLabel(profile.vibeScore)} Every listing is ranked by how well it fits, and the pieces you save keep teaching it.</Text>
          </View>
        </Card>

        <SectionHeader eyebrow="Your answers" title="Preferences" />
        <Card style={styles.block}>
          <Pref label="Shopping in" value={profile.country ? `${countryFlag(profile.country)} ${countryName(profile.country)} · ${profile.currency}` : 'Not set'} />
          <Pref label="Sections" value={profile.shopFor ? SHOP_FOR_LABELS[profile.shopFor] : 'All'} />
          <Pref label="Colours you love" value={profile.likedColors.map((c) => COLOR_FAMILY_LABELS[c]).join(', ') || '—'} />
          {profile.avoidColors.length > 0 ? <Pref label="Never" value={profile.avoidColors.map((c) => COLOR_FAMILY_LABELS[c]).join(', ')} /> : null}
          <Pref label="Fit" value={profile.fit ? FIT_LABELS[profile.fit] : '—'} />
          <Pref label="Occasions" value={profile.occasions.map((o) => OCCASION_LABELS[o]).join(', ') || '—'} />
          <Pref label="Budget per piece" value={profile.budgetMax ? `Up to ${formatMoneyWhole(profile.budgetMax, profile.currency)}` : 'No limit'} />
          <Pref label="Pre-owned" value={preownedLabel(profile.sustainabilityPriority)} last />
        </Card>

        <SectionHeader eyebrow="Live right now" title="Top matches for you" />
        <View style={styles.list}>
          {topMatches.length === 0 ? <Text style={Type.small}>Your matches appear here once live listings have loaded.</Text> : null}
          {topMatches.map((item) => (
            <ListingRow
              key={item.id}
              item={item}
              onPress={() => openMatch(item.id)}
              note={item.matchReasons[0] ?? null}
              noteTone="buy"
              accessibilityLabel={`${item.title}, ${item.matchScore}% match`}
              right={<Text style={styles.matchScore}>{item.matchScore}%</Text>}
            />
          ))}
        </View>

        <View style={styles.reportActions}>
          <Button label="See your whole wardrobe" iconRight="arrow-forward" size="lg" onPress={() => navigation.navigate('Compose', { screen: 'ComposeMain', pop: true })} />
          {/* An outdated profile already has the update banner at the top, which starts the same quiz. */}
          {!outdated ? <Button label="Retake the quiz" variant="secondary" icon="refresh" onPress={startRetake} /> : null}
        </View>
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
      <View style={[styles.quizHead, { paddingTop: insets.top + Spacing.lg }]}>
        <View style={styles.quizTop}>
          <Text style={Type.eyebrow}>
            Style quiz · {step + 1} of {totalSteps}
          </Text>
          {isProfileComplete ? (
            <TouchableOpacity onPress={() => setMode('results')} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Meter value={((step + 1) / totalSteps) * 100} label="Quiz progress" />
      </View>

      <ScrollView contentContainerStyle={styles.quizBody} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
          <Text style={styles.question}>{question.question}</Text>
          {question.help ? <Text style={[Type.small, { marginTop: Spacing.sm }]}>{question.help}</Text> : null}

          {question.type === 'country' ? (
            <View style={{ marginTop: Spacing.xl }}>
              {liveCountries.length > 0 ? <Text style={styles.groupLabel}>Live prices now</Text> : null}
              <View style={styles.wrap}>
                {liveCountries.map((code) => (
                  <Pill key={code} label={`${countryFlag(code)} ${countryName(code)}`} selected={value === code} onPress={() => setAnswer(question.id, code)} role="radio" />
                ))}
              </View>
              <Text style={styles.groupLabel}>{liveCountries.length > 0 ? 'Other countries' : 'Countries'}</Text>
              <View style={styles.wrap}>
                {otherCountries.map((c) => (
                  <Pill key={c.code} label={`${countryFlag(c.code)} ${c.name}`} selected={value === c.code} onPress={() => setAnswer(question.id, c.code)} role="radio" size="sm" />
                ))}
              </View>
            </View>
          ) : null}

          {question.type === 'single' && question.options ? (
            <View style={styles.options} accessibilityRole="radiogroup">
              {question.options.map((opt) => {
                const selected = value === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.option, selected && styles.optionOn]}
                    onPress={() => setAnswer(question.id, opt.value)}
                    activeOpacity={0.8}
                    accessibilityRole="radio"
                    aria-checked={selected}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextOn]}>{opt.label}</Text>
                    <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? Colors.textInverse : Colors.borderStrong} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {question.type === 'multi' && question.options ? (
            <View style={[styles.wrap, { marginTop: Spacing.xl }]}>
              {question.options.map((opt) => (
                <Pill key={opt.value} label={opt.label} selected={listValues.includes(opt.value)} onPress={() => toggleIn(question.id, opt.value)} role="checkbox" />
              ))}
            </View>
          ) : null}

          {question.type === 'colors' ? (
            <View style={styles.colors}>
              {COLOR_FAMILIES.map((family: ColorFamily) => {
                const selected = listValues.includes(family);
                const disabled = question.id === QUESTION_IDS.colorsAvoid && lovedColors.includes(family);
                return (
                  <TouchableOpacity
                    key={family}
                    style={[styles.color, selected && styles.colorOn, disabled && styles.disabled]}
                    onPress={() => !disabled && toggleIn(question.id, family)}
                    accessibilityRole="checkbox"
                    aria-checked={selected}
                    aria-disabled={disabled}
                    accessibilityLabel={COLOR_FAMILY_LABELS[family]}
                  >
                    <View style={[styles.swatch, { backgroundColor: COLOR_FAMILY_SWATCH[family] }]}>
                      {selected ? <Ionicons name="checkmark" size={16} color={family === 'white' || family === 'neutral' || family === 'yellow' ? Colors.ink : Colors.textInverse} /> : null}
                    </View>
                    <Text style={styles.colorLabel} numberOfLines={2}>
                      {COLOR_FAMILY_LABELS[family]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {question.type === 'budget' ? (
            <View style={{ marginTop: Spacing.xl }}>
              <View style={styles.wrap}>
                {budgetSuggestions.map((amount) => (
                  <Pill
                    key={amount}
                    label={`Up to ${formatMoneyWhole(amount, budgetCurrency)}`}
                    selected={value === amount}
                    onPress={() => {
                      setBudgetText('');
                      setAnswer(question.id, amount);
                    }}
                    role="radio"
                  />
                ))}
                <Pill
                  label="No limit"
                  selected={question.id in answers && value === null}
                  onPress={() => {
                    setBudgetText('');
                    setAnswer(question.id, null);
                  }}
                  role="radio"
                />
              </View>
              <Text style={styles.groupLabel}>Or type an amount ({budgetCurrency})</Text>
              <View style={styles.budgetRow}>
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
              {budgetSuggestions.length > 0 ? <Text style={[Type.caption, { marginTop: Spacing.sm }]}>Suggestions are the 25th–90th percentile of today’s live prices for your sections.</Text> : null}
            </View>
          ) : null}

          {question.type === 'slider' ? (
            <View style={{ marginTop: Spacing.xl }}>
              <View style={styles.sliderLabels}>
                <Text style={Type.caption}>{question.minLabel ?? 'Low'}</Text>
                <Text style={Type.caption}>{question.maxLabel ?? 'High'}</Text>
              </View>
              <View style={styles.slider} accessibilityRole="radiogroup">
                {SLIDER_STOPS.map((val) => {
                  const selected = sliderValue === val;
                  return (
                    <TouchableOpacity
                      key={val}
                      style={[styles.stop, selected && styles.stopOn]}
                      onPress={() => setAnswer(question.id, val)}
                      accessibilityRole="radio"
                      aria-checked={selected}
                      accessibilityLabel={`${val} — ${preownedLabel(val)}`}
                    >
                      <Text style={[styles.stopText, selected && styles.stopTextOn]}>{val}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={[Type.title, { marginTop: Spacing.lg, textAlign: 'center' }]}>{preownedLabel(sliderValue)}</Text>
            </View>
          ) : null}

          {question.type === 'taste' ? (
            <View style={styles.taste}>
              {tasteItems.map((item) => {
                const rating = ratings[item.id];
                return (
                  <View key={item.id} style={styles.tasteCard}>
                    <ProductImage uri={item.image} style={styles.tasteImage} category={item.category} colors={item.colors} iconSize={28} />
                    <View style={{ padding: Spacing.sm, gap: 2 }}>
                      <Text style={Type.smallStrong} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={Type.caption} numberOfLines={1}>
                        {formatMoney(item.currentPrice, item.currency)} · {item.platform}
                      </Text>
                    </View>
                    <View style={styles.tasteButtons}>
                      <TouchableOpacity
                        style={[styles.tasteBtn, rating === false && styles.tasteNo]}
                        onPress={() => setRatings((r) => ({ ...r, [item.id]: false }))}
                        accessibilityRole="button"
                        aria-selected={rating === false}
                        accessibilityLabel={`Not for me: ${item.title}`}
                      >
                        <Ionicons name="close" size={18} color={rating === false ? Colors.textInverse : Colors.ink} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.tasteBtn, rating === true && styles.tasteYes]}
                        onPress={() => setRatings((r) => ({ ...r, [item.id]: true }))}
                        accessibilityRole="button"
                        aria-selected={rating === true}
                        accessibilityLabel={`I'd wear it: ${item.title}`}
                      >
                        <Ionicons name={rating === true ? 'heart' : 'heart-outline'} size={18} color={rating === true ? Colors.textInverse : Colors.ink} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>

      <View style={styles.nav}>
        <Button label="Back" variant="secondary" icon="arrow-back" onPress={goBackStep} disabled={step === 0} accessibilityLabel="Previous question" />
        <Button
          label={isLastStep ? 'See my style' : question.optional && listValues.length === 0 ? 'Skip' : 'Next'}
          iconRight={isLastStep ? 'sparkles-outline' : 'arrow-forward'}
          onPress={handleNext}
          disabled={!canProceed}
          accessibilityLabel={isLastStep ? 'See my style profile' : question.optional && listValues.length === 0 ? 'Skip' : 'Next question'}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

function Pref({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.pref, last && { borderBottomWidth: 0 }]}>
      <Text style={Type.small}>{label}</Text>
      <Text style={[Type.smallStrong, styles.prefValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  block: { marginHorizontal: Spacing.lg },
  list: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },

  reportHead: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  reportTitle: { ...Type.hero, fontSize: 52, lineHeight: 56, marginTop: Spacing.sm },
  reportSub: { fontFamily: Fonts.displayItalic, fontSize: FontSize.xxl, color: Colors.textSecondary },
  update: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg, padding: Spacing.lg, borderRadius: BorderRadius.xl, backgroundColor: Colors.ink, gap: Spacing.md },
  updateCta: { fontFamily: Fonts.semibold, fontSize: FontSize.md, color: Colors.textInverse, textDecorationLine: 'underline' },
  dna: { gap: 6, marginBottom: Spacing.lg },
  dnaHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  traits: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  trait: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceMuted },
  traitText: { fontFamily: Fonts.medium, fontSize: 12, color: Colors.ink },
  strength: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, marginTop: Spacing.lg },
  pref: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  prefValue: { flexShrink: 1, textAlign: 'right' },
  matchScore: { fontFamily: Fonts.display, fontSize: 22, color: Colors.ink },
  reportActions: { paddingHorizontal: Spacing.lg, marginTop: Spacing.xl, gap: Spacing.sm },

  quizHead: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.sm, backgroundColor: Colors.background },
  quizTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancel: { fontFamily: Fonts.semibold, fontSize: FontSize.md, color: Colors.ink, textDecorationLine: 'underline' },
  quizBody: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.xxxl },
  question: { ...Type.display, fontSize: 34, lineHeight: 40 },
  groupLabel: { ...Type.eyebrow, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  options: { marginTop: Spacing.xl, gap: Spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 58,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionOn: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  optionText: { flex: 1, fontFamily: Fonts.medium, fontSize: FontSize.md, color: Colors.ink, paddingVertical: Spacing.md },
  optionTextOn: { color: Colors.textInverse },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xl },
  color: { width: '23%', alignItems: 'center', gap: 6, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  colorOn: { borderColor: Colors.ink, borderWidth: 2 },
  disabled: { opacity: 0.3 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  colorLabel: { fontFamily: Fonts.medium, fontSize: 11, color: Colors.ink, textAlign: 'center' },
  budgetRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md },
  budgetSymbol: { fontFamily: Fonts.semibold, fontSize: FontSize.lg, color: Colors.textSecondary, marginRight: 6 },
  budgetInput: { flex: 1, fontFamily: Fonts.semibold, fontSize: FontSize.lg, color: Colors.ink, paddingVertical: Spacing.md },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  slider: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  stop: { flex: 1, height: 52, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  stopOn: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  stopText: { fontFamily: Fonts.semibold, fontSize: FontSize.md, color: Colors.ink },
  stopTextOn: { color: Colors.textInverse },
  taste: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.xl },
  tasteCard: { width: '47.5%', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  tasteImage: { width: '100%', aspectRatio: 3 / 4 },
  tasteButtons: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.sm, paddingTop: 0 },
  tasteBtn: { flex: 1, height: 40, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  tasteNo: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  tasteYes: { backgroundColor: Colors.offer, borderColor: Colors.offer },
  nav: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.background },
});
