// ============================================================
// VibeVault – Item Detail Screen
// One live listing: the price is re-checked on the marketplace when
// the screen opens. Shows the model's "when to buy" advice with its
// track record, the full recorded price history, valid coupons,
// price alerts, style fit, purchase logging, and links out to the
// marketplace and to the same item on other marketplaces.
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Platform as RNPlatform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, FontSize, PLATFORM_COLORS, STYLE_COLORS, Spacing } from '../constants/theme';
import { DEPARTMENT_LABELS } from '../constants/marketplaces';
import { backendConfig } from '../config';
import { countryFlag, countryName } from '../data/countries';
import { useActiveAlertForItem, useIsPurchased, useIsWishlisted, useItem, useOffersForItem, useTrackRecord } from '../store/hooks';
import { useStore } from '../store/useStore';
import { FashionItem, PredictionHorizon, PricePoint, StyleArchetype } from '../types';
import { ItemDetailParams, ItemDetailTab } from '../navigation/types';
import GradientCard from '../components/common/GradientCard';
import OfferRow from '../components/common/OfferRow';
import PriceChart from '../components/common/PriceChart';
import ProgressBar from '../components/common/ProgressBar';
import ProductImage from '../components/common/ProductImage';
import Tag from '../components/common/Tag';
import EmptyState from '../components/common/EmptyState';
import ScreenHeader from '../components/common/ScreenHeader';
import { priceIn } from '../services/catalog';
import { fetchPriceHistory } from '../services/catalogApi';
import {
  getBuyAdvice,
  getDealScore,
  historyDays,
  isAtRecordLow,
  MAIN_HORIZON,
  predictionFor,
  priceChangeSinceFirst,
  seasonalInsight,
  suggestedTarget as suggestTarget,
} from '../services/priceEngine';
import { compareLinks, marketplaceCtaLabel, openItemOnMarketplace, openUrl } from '../services/linking';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { confirmAction, notify } from '../utils/dialog';
import { formatDate, formatShortDate } from '../utils/date';
import { currencySymbol, formatMoney, formatMoneyWhole, formatPercent, formatRelativeTime, parsePriceInput, percentOff } from '../utils/format';

const CONDITION_SCORE: Record<string, number> = {
  'New with tags': 100,
  'Like new': 85,
  Good: 65,
  Fair: 45,
  'Well-loved': 25,
  'Pre-owned': 50,
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const BASIS_TEXT: Record<string, string> = {
  listing: 'this listing’s own price history in the same situation',
  category: 'similar listings in the same category on this marketplace',
  marketplace: 'similar listings on this marketplace',
  situation: 'listings in the same price situation across marketplaces',
  all: 'every tracked listing',
};

const STYLING_TIPS: Record<StyleArchetype, string[]> = {
  Minimalist: ['Layer sparingly — let the piece speak for itself.', 'Clean sneakers or loafers keep the look streamlined.'],
  Streetwear: ['Oversized silhouettes pair well with this piece.', 'Chunky sneakers and a cap push the streetwear energy.'],
  Bohemian: ['Layer with flowy fabrics and natural textures.', 'Accessorise with earthy tones and layered jewellery.'],
  Vintage: ['Pair with modern basics to balance the retro feel.', "Tuck into high-waisted bottoms for an authentic '90s look."],
  Athleisure: ['Mix with tailored pieces for an elevated sporty look.', 'Fresh white sneakers keep it clean and versatile.'],
  Preppy: ['Pair with crisp collars, knits and loafers.', 'A structured bag polishes the whole outfit.'],
  Grunge: ['Layer with flannel or denim for texture.', 'Boots and a little distressing complete the vibe.'],
  Cottagecore: ['Floral accessories and woven baskets complement this style.', 'Linen and natural fabrics work beautifully here.'],
  'Dark Academia': ['Pair with tailored trousers and oxford shoes.', 'Add a leather bag to complete the scholarly aesthetic.'],
  Y2K: ['Go bold with colour, shine and playful accessories.', 'Baby tees, low-rise denim and platforms lean into the era.'],
};

function getStylingTips(item: FashionItem): string[] {
  const tips = item.styleArchetypes.flatMap((style) => STYLING_TIPS[style] ?? []);
  if (tips.length === 0) {
    return ['Works well as a statement piece in a neutral outfit.', "Consider the item's texture and volume when building your look."];
  }
  return tips.slice(0, 4);
}

/** Every recorded and archived price of the listing (the catalogue only carries 30 days). */
function useFullHistory(item: FashionItem): PricePoint[] {
  const [history, setHistory] = useState<PricePoint[]>(item.priceHistory);
  useEffect(() => {
    const config = backendConfig;
    if (!config) return undefined;
    let active = true;
    fetchPriceHistory(config, item.id)
      .then((points) => {
        if (active && points.length >= item.priceHistory.length) setHistory(points);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [item.id, item.priceHistory]);
  return history;
}

const USE_NATIVE_DRIVER = RNPlatform.OS !== 'web';
const TABS: { key: ItemDetailTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'price', label: 'Price' },
  { key: 'style', label: 'Style Fit' },
];

/**
 * live: just re-checked on the marketplace · recent: checked in the last few minutes ·
 * stale: couldn't re-check · unsupported: the marketplace's API can't re-check one listing.
 */
type LiveState = 'checking' | 'live' | 'recent' | 'stale' | 'unsupported' | 'off';

/** Re-checks the listing on its marketplace once when the screen opens. */
function useLiveCheck(itemId: string | undefined): LiveState {
  const checkItemLive = useStore((s) => s.checkItemLive);
  const [state, setState] = useState<LiveState>(itemId ? 'checking' : 'off');

  useEffect(() => {
    if (!itemId) return;
    let active = true;
    setState('checking');
    checkItemLive(itemId)
      .then((result) => {
        if (!active) return;
        if (!result) setState('off');
        else setState(result.checked === 'unavailable' ? 'stale' : result.checked);
      })
      .catch(() => {
        if (active) setState('stale');
      });
    return () => {
      active = false;
    };
  }, [itemId, checkItemLive]);

  return state;
}

export default function ItemDetailScreen() {
  const route = useRoute<RouteProp<{ ItemDetail: ItemDetailParams }, 'ItemDetail'>>();
  const navigation = useNavigation();
  const itemId = route.params?.itemId;
  const item = useItem(itemId);
  const live = useLiveCheck(itemId);

  if (!item) {
    if (live === 'checking') {
      return (
        <View style={styles.container}>
          <ScreenHeader title="Loading…" onBack={() => navigation.goBack()} />
          <View style={styles.loading} accessibilityLabel="Loading listing">
            <ActivityIndicator color={Colors.primaryLight} />
            <Text style={styles.helperText}>Fetching the live listing…</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <ScreenHeader title="Item not found" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="alert-circle-outline"
          title="This listing isn’t available"
          message="It may have been sold or removed from the marketplace, or you may be offline."
        />
      </View>
    );
  }
  // Keyed by item so a different item never inherits another item's local state.
  return <ItemDetailContent key={item.id} item={item} live={live} initialTab={route.params?.tab ?? 'overview'} />;
}

function LiveLine({ item, live }: { item: FashionItem; live: LiveState }) {
  if (live === 'off') return null;
  if (live === 'checking') {
    return (
      <View style={styles.liveRow} accessibilityLabel={`Checking the live price on ${item.platform}`}>
        <ActivityIndicator size="small" color={Colors.textMuted} />
        <Text style={styles.liveText}>Checking the live price on {item.platform}…</Text>
      </View>
    );
  }
  const fresh = live === 'live' || live === 'recent';
  const text = fresh
    ? `Live price from ${item.siteName} · checked ${formatRelativeTime(item.lastChecked)}`
    : live === 'unsupported'
      ? `Price from ${item.platform}'s regular update · seen ${formatRelativeTime(item.lastChecked)}`
      : `Couldn’t reach ${item.platform} — showing the price recorded ${formatRelativeTime(item.lastChecked)}`;
  return (
    <View style={styles.liveRow} accessibilityLabel={text}>
      <View style={[styles.liveDot, { backgroundColor: fresh || live === 'unsupported' ? Colors.success : Colors.warning }]} />
      <Text style={[styles.liveText, !fresh && live !== 'unsupported' && { color: Colors.warning }]}>{text}</Text>
    </View>
  );
}

function ItemDetailContent({ item, live, initialTab }: { item: FashionItem; live: LiveState; initialTab: ItemDetailTab }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  // The photo takes up to 42% of the screen, so small phones still see the price and details.
  const { height: windowHeight } = useWindowDimensions();
  const heroHeight = Math.round(Math.min(340, Math.max(220, windowHeight * 0.42)));
  const keyboardHeight = useKeyboardHeight();
  const scrollRef = useRef<ScrollView>(null);

  const { isProfileComplete, userStyles, homeCurrency, rates, marketplaces, toggleWishlist, addPriceAlert, removePriceAlert, logPurchase, undoPurchase, purchase } =
    useStore(
      useShallow((s) => ({
        isProfileComplete: s.isProfileComplete,
        userStyles: s.profile.styleArchetypes,
        homeCurrency: s.profile.currency,
        rates: s.fxRates,
        marketplaces: s.marketplaces,
        toggleWishlist: s.toggleWishlist,
        addPriceAlert: s.addPriceAlert,
        removePriceAlert: s.removePriceAlert,
        logPurchase: s.logPurchase,
        undoPurchase: s.undoPurchase,
        purchase: s.purchases.find((p) => p.itemId === item.id),
      })),
    );
  const isWishlisted = useIsWishlisted(item.id);
  const activeAlert = useActiveAlertForItem(item.id);
  const isPurchased = useIsPurchased(item.id);
  const offers = useOffersForItem(item);
  const trackRecord = useTrackRecord(MAIN_HORIZON, item.source);
  const fullHistory = useFullHistory(item);

  const [alertInput, setAlertInput] = useState('');
  const [activeTab, setActiveTab] = useState<ItemDetailTab>(initialTab);
  const [copiedOfferId, setCopiedOfferId] = useState<string | null>(null);

  const money = useCallback((value: number) => formatMoney(value, item.currency), [item.currency]);
  const dealScore = getDealScore(item);
  const savingsPercent = percentOff(item.currentPrice, item.originalPrice);
  const retailLabel = item.source === 'flipkart' ? 'MRP' : 'list price';
  const advice = getBuyAdvice(item);
  const trackedDays = item.stats?.days ?? historyDays(fullHistory);
  const change = useMemo(() => priceChangeSinceFirst(fullHistory), [fullHistory]);
  const seasonal = useMemo(() => seasonalInsight(fullHistory), [fullHistory]);
  const recordLow = isAtRecordLow(item);
  const suggestedTarget = suggestTarget(item);
  const links = useMemo(() => compareLinks(item, marketplaces), [item, marketplaces]);
  const homePrice = item.currency !== homeCurrency ? priceIn(item, homeCurrency, rates) : null;
  const byline = [item.brand, item.seller ? `sold by ${item.seller}` : null].filter(Boolean).join(' · ') || item.platform;

  // ---- Scroll-linked header ----
  const scrollY = useRef(new Animated.Value(0)).current;
  // The bar behind the back button fades in as the photo scrolls away.
  const headerOpacity = scrollY.interpolate({ inputRange: [heroHeight - 220, heroHeight - 140], outputRange: [0, 1], extrapolate: 'clamp' });
  const imageScale = scrollY.interpolate({ inputRange: [-120, 0], outputRange: [1.3, 1], extrapolate: 'clamp' });
  const onScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: USE_NATIVE_DRIVER }),
    [scrollY],
  );

  const heartAnim = useRef(new Animated.Value(1)).current;

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const handleWishlistToggle = () => {
    Animated.sequence([
      Animated.timing(heartAnim, { toValue: 1.3, duration: 120, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(heartAnim, { toValue: 1, duration: 120, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start();
    toggleWishlist(item.id);
  };

  const handleSetAlert = () => {
    const trimmed = alertInput.trim();
    const target = trimmed ? parsePriceInput(trimmed) : suggestedTarget;
    if (target === null) {
      notify('Invalid price', `Enter a price like ${money(suggestedTarget)}.`);
      return;
    }
    const result = addPriceAlert(item.id, target);
    if (!result.ok) {
      notify('Can’t set alert', result.error);
      return;
    }
    Keyboard.dismiss();
    setAlertInput('');
    notify(
      '🔔 Price alert set',
      `We'll let you know when "${item.title}" drops to ${money(result.alert.targetPrice)} or less on ${item.platform}. Prices are checked whenever you open VibeVault.`,
    );
  };

  const handleRemoveAlert = () => {
    if (activeAlert) removePriceAlert(activeAlert.id);
  };

  const handleLogPurchase = () => {
    const logged = logPurchase(item.id);
    if (!logged) return;
    notify(
      logged.secondhand ? '🌱 Nice find!' : 'Purchase logged',
      logged.savedInHome
        ? `Added to your purchases — ${formatMoneyWhole(logged.savedInHome, logged.homeCurrency)} below the ${retailLabel}.`
        : 'Added to your purchases.',
    );
  };

  const handleUndoPurchase = () => {
    confirmAction({
      title: 'Remove purchase?',
      message: 'This removes the purchase from your impact stats.',
      confirmText: 'Remove',
      destructive: true,
      onConfirm: () => undoPurchase(item.id),
    });
  };

  const handleOpenMarketplace = async () => {
    const opened = await openItemOnMarketplace(item);
    if (!opened) notify('Unable to open link', `Could not open ${item.platform} on your device.`);
  };

  const handleCompare = async (label: string, url: string) => {
    const opened = await openUrl(url);
    if (!opened) notify('Unable to open link', `Could not open ${label} on your device.`);
  };

  const goToProfiler = () => navigation.navigate('Profiler');

  const matchGradient = item.matchScore >= 80 ? Colors.gradientEco : Colors.gradientPrimary;

  return (
    <View style={styles.container}>
      {/* One back button, always on top. The bar behind it and the title fade in once the hero scrolls away. */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.topBarBackground, { opacity: headerOpacity }]} />
        <TouchableOpacity style={styles.roundButton} onPress={goBack} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Animated.Text style={[styles.topBarTitle, { opacity: headerOpacity }]} numberOfLines={1} aria-hidden>
          {item.title}
        </Animated.Text>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 120 + keyboardHeight }}
      >
        {/* Hero image */}
        <View style={[styles.imageContainer, { height: heroHeight }]}>
          <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: imageScale }] }]}>
            <ProductImage
              uri={item.image}
              style={styles.heroImage}
              category={item.category}
              colors={item.colors}
              iconSize={56}
              accessibilityLabel={item.title}
            />
          </Animated.View>
          <LinearGradient colors={['transparent', Colors.background]} style={styles.imageOverlay} />

          {isProfileComplete && (
            <View style={styles.matchBadge}>
              <LinearGradient colors={matchGradient} style={styles.matchBadgeGrad}>
                <Text style={styles.matchPct}>{item.matchScore}%</Text>
                <Text style={styles.matchLbl}>Match</Text>
              </LinearGradient>
            </View>
          )}

          <View style={[styles.platformBadge, { backgroundColor: PLATFORM_COLORS[item.source] || Colors.primary }]}>
            <Text style={styles.platformText}>
              {item.siteName} · {countryFlag(item.market)}
            </Text>
          </View>
        </View>

        {/* Title & price */}
        <View style={styles.titleSection}>
          {!item.available && (
            <View style={styles.unavailableBanner} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={18} color={Colors.warning} />
              <Text style={styles.unavailableText}>
                {item.endReason === 'stale'
                  ? `${item.platform} hasn’t listed this for a few days — it may have sold out. Last recorded price ${money(item.currentPrice)}.`
                  : `No longer available on ${item.platform} — it sold out or was removed. Last recorded price ${money(item.currentPrice)}.`}
              </Text>
            </View>
          )}

          <View style={styles.titleRow}>
            <View style={styles.titleLeft}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.brandText}>{byline}</Text>
            </View>
            <View style={styles.priceStack}>
              <Text style={[styles.currentPrice, !item.available && styles.priceUnavailable]}>{money(item.currentPrice)}</Text>
              {homePrice !== null && <Text style={styles.homePrice}>≈ {formatMoneyWhole(homePrice, homeCurrency)}</Text>}
              {savingsPercent > 0 && item.originalPrice !== null && (
                <>
                  <Text style={styles.originalPrice}>{money(item.originalPrice)}</Text>
                  <View style={styles.savingsBadge}>
                    <Text style={styles.savingsText}>-{savingsPercent}%</Text>
                  </View>
                </>
              )}
            </View>
          </View>

          <LiveLine item={item} live={live} />

          <View style={styles.metaRow}>
            {item.size && (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>📏 {item.size}</Text>
              </View>
            )}
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>✨ {item.secondhand ? `Pre-owned · ${item.condition}` : 'New'}</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>📦 {item.category}</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>👤 {DEPARTMENT_LABELS[item.department]}</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>
                {countryFlag(item.market)} For {countryName(item.market)}
              </Text>
            </View>
          </View>

          <View style={styles.tagRow}>
            {item.styleArchetypes.map((s) => (
              <Tag key={s} label={s} color={STYLE_COLORS[s]} selected />
            ))}
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabBar} accessibilityRole="tablist">
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setActiveTab(t.key)}
                style={[styles.tab, active && styles.tabActive]}
                accessibilityRole="tab"
                aria-selected={active}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === 'overview' && (
          <View style={styles.tabContent}>
            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>About This Item</Text>
              <Text style={styles.description}>{item.description ?? `No description was provided on ${item.platform}.`}</Text>
              {item.listedDate && (
                <View style={styles.listingRow}>
                  <Text style={styles.listingLabel}>Listed</Text>
                  <Text style={styles.listingValue}>{formatDate(item.listedDate)}</Text>
                </View>
              )}
              <View style={styles.listingRow}>
                <Text style={styles.listingLabel}>Tracked since</Text>
                <Text style={styles.listingValue}>{formatDate(item.firstSeen)}</Text>
              </View>
              {item.seller && (
                <View style={styles.listingRow}>
                  <Text style={styles.listingLabel}>Seller</Text>
                  <Text style={[styles.listingValue, styles.listingValueShrink, { color: Colors.primaryLight }]} numberOfLines={1}>
                    {item.seller}
                  </Text>
                </View>
              )}
              <View style={styles.listingRow}>
                <Text style={styles.listingLabel}>Marketplace</Text>
                <Text style={styles.listingValue}>{item.siteName}</Text>
              </View>
              {item.currency !== homeCurrency && (
                <Text style={styles.smallNote}>
                  Priced in {item.currency}
                  {homePrice !== null ? ` (≈ ${formatMoneyWhole(homePrice, homeCurrency)} at today’s ECB rate)` : ''}. Shipping, duties and card
                  conversion fees are shown on {item.platform} at checkout.
                </Text>
              )}
            </GradientCard>

            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>Deal Snapshot</Text>
              <View style={styles.metricsGrid}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricBig}>{dealScore}</Text>
                  <Text style={styles.metricLabel}>Deal Score</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={[styles.metricBig, { color: Colors.ecoGreen }]}>{item.stats ? money(item.stats.lowest) : '—'}</Text>
                  <Text style={styles.metricLabel}>Lowest recorded</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={[styles.metricBig, { color: Colors.accent }]}>{trackedDays}</Text>
                  <Text style={styles.metricLabel}>Days tracked</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={[styles.metricBig, { color: Colors.warning }]}>{isProfileComplete ? `${item.matchScore}%` : '—'}</Text>
                  <Text style={styles.metricLabel}>Vibe Match</Text>
                </View>
              </View>
              {item.originalPrice !== null && (
                <>
                  <Text style={styles.barLabel}>
                    Discount vs {retailLabel} · {savingsPercent}%
                  </Text>
                  <ProgressBar
                    progress={savingsPercent}
                    height={8}
                    gradient={Colors.gradientPrimary}
                    accessibilityLabel={`Discount versus ${retailLabel}`}
                  />
                </>
              )}
              {item.secondhand && (
                <>
                  <Text style={styles.barLabel}>Condition · {item.condition}</Text>
                  <ProgressBar progress={CONDITION_SCORE[item.condition] ?? 50} height={8} gradient={Colors.gradientAccent} accessibilityLabel="Condition" />
                </>
              )}
            </GradientCard>

            {item.secondhand && (
              <GradientCard style={styles.section} gradient={Colors.gradientEco}>
                <Text style={styles.sectionTitle}>♻️ Pre-owned</Text>
                <Text style={styles.ecoDesc}>
                  Buying this keeps an existing piece in use instead of a new one being made.
                  {item.condition !== 'Pre-owned' ? ` The seller grades it “${item.condition}”.` : ' The seller hasn’t graded its condition — check the photos.'}
                </Text>
              </GradientCard>
            )}

            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>Bought It?</Text>
              {isPurchased && purchase ? (
                <>
                  <Text style={styles.purchasedText}>
                    ✅ Logged on {formatDate(purchase.purchasedAt)} for {formatMoney(purchase.pricePaid, purchase.currency)}
                    {purchase.secondhand ? ' — counted as a pre-owned find.' : '.'}
                  </Text>
                  <TouchableOpacity onPress={handleUndoPurchase} style={styles.secondaryBtn} accessibilityRole="button">
                    <Text style={styles.secondaryBtnText}>Undo purchase</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.helperText}>
                    Bought it on {item.platform}? Log it to keep track of what you’ve spent and saved{item.secondhand ? ', and your pre-owned finds' : ''}.
                  </Text>
                  <TouchableOpacity onPress={handleLogPurchase} activeOpacity={0.85} accessibilityRole="button">
                    <LinearGradient colors={Colors.gradientEco} style={styles.primaryBtn}>
                      <Text style={styles.primaryBtnText}>Log Purchase at {money(item.currentPrice)}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              )}
            </GradientCard>
          </View>
        )}

        {activeTab === 'price' && (
          <View style={styles.tabContent}>
            <GradientCard
              style={styles.section}
              gradient={advice?.verdict === 'buy' ? Colors.gradientEco : advice?.verdict === 'wait' ? Colors.gradientAccent : undefined}
            >
              <Text style={styles.sectionTitle}>When to buy</Text>
              {!item.available ? (
                <Text style={styles.helperText}>This listing is no longer for sale.</Text>
              ) : advice ? (
                <>
                  <Text style={styles.verdict}>{advice.verdict === 'buy' ? '🟢 ' : advice.verdict === 'wait' ? '⏳ ' : '⚖️ '}{advice.headline}</Text>
                  <Text style={styles.recommendation}>{advice.detail}</Text>
                  <View style={styles.optimalGrid}>
                    {([7, 14, 30] as PredictionHorizon[]).map((h) => {
                      const p = predictionFor(item, h);
                      return (
                        <View key={h} style={styles.optimalItem} accessibilityLabel={p ? `${formatPercent(p.pDrop)} chance of a 5% lower price within ${h} days` : undefined}>
                          <Text style={styles.optimalLabel}>{h} days</Text>
                          <Text style={styles.optimalValue}>{p ? formatPercent(p.pDrop) : '—'}</Text>
                          <Text style={styles.optimalLabel}>chance ≥5% cheaper</Text>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={styles.adviceLine}>
                    Typical lowest price over the next {advice.horizon} days: {money(advice.expectedLow)}
                    {advice.saving > 0 ? ` (${money(advice.saving)} less)` : ''}.
                  </Text>
                  {item.secondhand && (predictionFor(item)?.pGone ?? 0) > 0 && (
                    <Text style={styles.adviceLine}>
                      {formatPercent(predictionFor(item)!.pGone)} of similar listings sold or were removed within {advice.horizon} days before getting cheaper.
                    </Text>
                  )}
                  <Text style={styles.adviceBasis}>
                    Learnt from what actually happened to {BASIS_TEXT[predictionFor(item)!.basis]}
                    {predictionFor(item)!.basis !== 'listing' ? ` (${predictionFor(item)!.basisListings} listings)` : ''} · updated{' '}
                    {formatShortDate(item.prediction!.madeOn)}.
                  </Text>
                  {trackRecord && trackRecord.resolved > 0 ? (
                    <Text style={styles.adviceBasis}>
                      Track record ({trackRecord.horizon}-day calls{trackRecord.source ? ` on ${item.platform}` : ''}, since{' '}
                      {trackRecord.since ? formatShortDate(trackRecord.since) : 'launch'}):
                      {trackRecord.waitCalls > 0 ? ` "wait" was right ${formatPercent(trackRecord.waitCorrect / trackRecord.waitCalls)} of ${trackRecord.waitCalls} times;` : ''}
                      {trackRecord.buyCalls > 0 ? ` "buy now" was right ${formatPercent(trackRecord.buyCorrect / trackRecord.buyCalls)} of ${trackRecord.buyCalls} times.` : ''}
                    </Text>
                  ) : (
                    <Text style={styles.adviceBasis}>The track record appears once the first predictions’ windows have closed.</Text>
                  )}
                </>
              ) : (
                <Text style={[styles.recommendation, styles.recommendationMuted]}>
                  📊 No prediction yet. VibeVault records every listing’s price daily and learns how prices like this one move; a buy-or-wait
                  call appears once at least 30 tracked listings have complete outcomes (or right after a price change, at the next daily
                  update). Nothing is guessed in the meantime.
                </Text>
              )}
              {recordLow && <Text style={styles.recordLow}>🏷️ This is the lowest price recorded for this listing.</Text>}
              {seasonal && (
                <Text style={styles.adviceLine}>
                  📅 Over the last {seasonal.years === 1 ? 'year' : `${seasonal.years} years`}, it was cheapest in {MONTHS[seasonal.month]} — about{' '}
                  {Math.round(seasonal.below * 100)}% below its typical price.
                </Text>
              )}
            </GradientCard>

            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>Price History</Text>
              <PriceChart
                history={fullHistory}
                currency={item.currency}
                height={160}
                expectedLow={advice && advice.expectedLow < item.currentPrice ? advice.expectedLow : null}
                expectedLowLabel={`Typical low, next ${MAIN_HORIZON} days`}
              />
              <Text style={styles.smallNote}>
                Recorded daily from {item.siteName} · {trackedDays} day{trackedDays === 1 ? '' : 's'} of data
                {item.stats ? ` · lowest ${money(item.stats.lowest)} on ${formatShortDate(item.stats.lowestOn)} · typical ${money(item.stats.median)}` : ''}
                {change && change.percent !== 0 ? ` · ${change.percent < 0 ? '▼' : '▲'} ${Math.abs(change.percent)}% since ${formatShortDate(change.since)}` : ''}
              </Text>
            </GradientCard>

            {offers.length > 0 && (
              <GradientCard style={styles.section}>
                <Text style={styles.sectionTitle}>Coupons & offers</Text>
                {offers.slice(0, 6).map((offer) => (
                  <OfferRow key={offer.id} offer={offer} copied={copiedOfferId === offer.id} onCopied={setCopiedOfferId} compact />
                ))}
                <Text style={styles.smallNote}>
                  From the store’s or affiliate network’s live feed, re-confirmed in the last day and shown only while in date. Tap an offer to
                  copy its code and open the store; the store checks eligibility (minimum spend, one use per customer) at checkout.
                </Text>
              </GradientCard>
            )}

            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>Price Alert</Text>
              {isPurchased ? (
                <Text style={styles.helperText}>You’ve already bought this item, so alerts are turned off.</Text>
              ) : activeAlert ? (
                <View style={styles.alertActive}>
                  <Text style={styles.alertActiveText}>🔔 Alert set for {formatMoney(activeAlert.targetPrice, activeAlert.currency)} or less</Text>
                  <Text style={styles.alertActiveMeta}>
                    Created {formatDate(activeAlert.createdAt)} at {formatMoney(activeAlert.priceAtCreation, activeAlert.currency)}
                  </Text>
                  <TouchableOpacity onPress={handleRemoveAlert} style={styles.secondaryBtn} accessibilityRole="button">
                    <Text style={styles.secondaryBtnText}>Remove alert</Text>
                  </TouchableOpacity>
                </View>
              ) : !item.available ? (
                <Text style={styles.helperText}>This listing is no longer available, so a price alert can’t be set.</Text>
              ) : (
                <>
                  <Text style={styles.helperText}>
                    Get alerted when the {item.platform} price drops to your target. Suggested target: {money(suggestedTarget)}
                    {advice && advice.expectedLow < item.currentPrice ? ' (the typical low the model expects)' : ''}.
                  </Text>
                  <View style={styles.alertInputRow}>
                    <Text style={styles.alertDollar}>{currencySymbol(item.currency).trim()}</Text>
                    <TextInput
                      style={styles.alertInput}
                      keyboardType="decimal-pad"
                      placeholder={String(suggestedTarget)}
                      placeholderTextColor={Colors.textMuted}
                      value={alertInput}
                      onChangeText={setAlertInput}
                      onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)}
                      onSubmitEditing={handleSetAlert}
                      returnKeyType="done"
                      maxLength={12}
                      accessibilityLabel={`Target price in ${item.currency}`}
                    />
                    <TouchableOpacity onPress={handleSetAlert} activeOpacity={0.85} accessibilityRole="button">
                      <LinearGradient colors={Colors.gradientPrimary} style={styles.alertBtn}>
                        <Text style={styles.alertBtnText}>Set Alert</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </GradientCard>

            {links.length > 0 && (
              <GradientCard style={styles.section}>
                <Text style={styles.sectionTitle}>Compare Elsewhere</Text>
                <Text style={styles.helperText}>Search for this item on the other marketplaces VibeVault tracks in {countryName(item.market)}.</Text>
                <View style={styles.storeChips}>
                  {links.map((link) => (
                    <TouchableOpacity
                      key={link.source}
                      style={[styles.storeChip, { borderColor: (PLATFORM_COLORS[link.source] || Colors.border) + '80' }]}
                      onPress={() => handleCompare(link.label, link.url)}
                      accessibilityRole="link"
                      accessibilityLabel={`Search ${link.label} for this item`}
                    >
                      <Text style={styles.storeChipText}>{link.label}</Text>
                      <Ionicons name="open-outline" size={12} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              </GradientCard>
            )}
          </View>
        )}

        {activeTab === 'style' && (
          <View style={styles.tabContent}>
            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>Why This Matches Your Vibe</Text>
              {isProfileComplete ? (
                <>
                  <View style={styles.matchCircle}>
                    <LinearGradient colors={matchGradient} style={styles.matchCircleGrad}>
                      <Text style={styles.matchCircleNum}>{item.matchScore}%</Text>
                      <Text style={styles.matchCircleLabel}>match</Text>
                    </LinearGradient>
                  </View>
                  {item.matchReasons.map((r) => (
                    <Text key={r} style={styles.reasonLine}>
                      ✓ {r}
                    </Text>
                  ))}
                  <Text style={styles.matchDesc}>
                    {item.matchScore >= 80
                      ? '🔥 Exceptional match! This piece strongly aligns with your style DNA.'
                      : item.matchScore >= 60
                        ? '✨ Great match! It fits well within your aesthetic.'
                        : item.matchScore >= 40
                          ? '👍 Decent match. A fun way to experiment with your style.'
                          : '🧪 Outside your usual vibe — a bold experiment.'}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.helperText}>Take the Style Profiler to see how well this piece matches your vibe.</Text>
                  <TouchableOpacity onPress={goToProfiler} activeOpacity={0.85} accessibilityRole="button">
                    <LinearGradient colors={Colors.gradientPrimary} style={styles.primaryBtn}>
                      <Text style={styles.primaryBtnText}>✨ Find My Vibe</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              )}
            </GradientCard>

            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>Style Archetypes</Text>
              {item.styleArchetypes.map((arch) => (
                <View key={arch} style={styles.archetypeRow}>
                  <View style={[styles.archChip, { backgroundColor: (STYLE_COLORS[arch] || Colors.primary) + '25' }]}>
                    <View style={[styles.archDot, { backgroundColor: STYLE_COLORS[arch] || Colors.primary }]} />
                    <Text style={[styles.archName, { color: STYLE_COLORS[arch] || Colors.primary }]}>{arch}</Text>
                  </View>
                  {userStyles.includes(arch) && (
                    <View style={styles.matchedBadge}>
                      <Text style={styles.matchedBadgeText}>✓ Your vibe</Text>
                    </View>
                  )}
                </View>
              ))}
            </GradientCard>

            {item.colors.length > 0 && (
              <GradientCard style={styles.section}>
                <Text style={styles.sectionTitle}>Color Palette</Text>
                <View style={styles.colorsRow}>
                  {item.colors.map((c, i) => (
                    <View key={`${c}-${i}`} style={[styles.colorSwatch, { backgroundColor: c }]} accessibilityLabel={`Colour ${c}`} />
                  ))}
                </View>
              </GradientCard>
            )}

            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>Styling Tips</Text>
              {getStylingTips(item).map((tip) => (
                <View key={tip} style={styles.tipRow}>
                  <Text style={styles.tipBullet}>•</Text>
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </GradientCard>
          </View>
        )}
      </Animated.ScrollView>

      {/* Bottom call to action (hidden while typing) */}
      {keyboardHeight === 0 && (
        <View style={styles.bottomCta}>
          <TouchableOpacity
            style={[styles.ctaWishlist, isWishlisted && styles.ctaWishlistActive]}
            onPress={handleWishlistToggle}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
            aria-selected={isWishlisted}
          >
            <Animated.Text style={[styles.ctaWishlistText, { transform: [{ scale: heartAnim }] }]}>{isWishlisted ? '❤️ Saved' : '🤍 Save'}</Animated.Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} style={{ flex: 1 }} onPress={handleOpenMarketplace} accessibilityRole="link">
            <LinearGradient colors={Colors.gradientPrimary} style={styles.ctaBuy}>
              <Text style={styles.ctaBuyText}>{marketplaceCtaLabel(item)}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    elevation: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    pointerEvents: 'box-none',
  },
  topBarBackground: { backgroundColor: Colors.surface, borderBottomColor: Colors.border, borderBottomWidth: 1, pointerEvents: 'none' },
  topBarTitle: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  imageContainer: { overflow: 'hidden' },
  heroImage: { width: '100%', height: '100%' },
  imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, pointerEvents: 'none' },
  matchBadge: { position: 'absolute', bottom: 16, left: 16 },
  matchBadgeGrad: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full, alignItems: 'center' },
  matchPct: { color: '#fff', fontSize: FontSize.lg, fontWeight: '800' },
  matchLbl: { color: '#fff', fontSize: FontSize.xs, fontWeight: '600' },
  platformBadge: { position: 'absolute', bottom: 16, right: 16, paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full },
  platformText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },

  titleSection: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  titleLeft: { flex: 1, marginRight: Spacing.md },
  itemTitle: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: '800', lineHeight: 28, marginBottom: 4 },
  brandText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  priceStack: { alignItems: 'flex-end' },
  currentPrice: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800' },
  originalPrice: { color: Colors.textMuted, fontSize: FontSize.sm, textDecorationLine: 'line-through' },
  savingsBadge: { backgroundColor: Colors.accent, paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full, marginTop: 2 },
  savingsText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.sm },
  metaChip: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  metaChipText: { color: Colors.textSecondary, fontSize: FontSize.xs },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  tabBar: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  tab: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: BorderRadius.sm },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  tabContent: { paddingHorizontal: Spacing.lg },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700', marginBottom: Spacing.md },

  description: { color: Colors.textSecondary, fontSize: FontSize.md, lineHeight: 22, marginBottom: Spacing.md },
  listingRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  listingLabel: { color: Colors.textMuted, fontSize: FontSize.sm },
  listingValue: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },

  metricsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  metricCard: { alignItems: 'center', flex: 1 },
  metricBig: { color: Colors.primaryLight, fontSize: FontSize.xl, fontWeight: '800' },
  metricLabel: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center', marginTop: 2 },
  barLabel: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: Spacing.sm, marginBottom: 4 },

  ecoDesc: { color: '#fff', fontSize: FontSize.sm, marginBottom: Spacing.md, opacity: 0.95 },

  helperText: { color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 20, marginBottom: Spacing.md },
  purchasedText: { color: Colors.success, fontSize: FontSize.sm, fontWeight: '600', lineHeight: 20, marginBottom: Spacing.sm },
  primaryBtn: { paddingVertical: Spacing.md, borderRadius: BorderRadius.md, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '800' },
  secondaryBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryBtnText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '700' },

  recommendation: { color: '#fff', fontSize: FontSize.md, fontWeight: '600', marginBottom: Spacing.md, lineHeight: 22 },
  optimalGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  optimalItem: { alignItems: 'center', flex: 1 },
  optimalLabel: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.xs, marginBottom: 2 },
  optimalValue: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },


  alertActive: { backgroundColor: Colors.success + '20', borderRadius: BorderRadius.md, padding: Spacing.md },
  alertActiveText: { color: Colors.success, fontSize: FontSize.md, fontWeight: '700' },
  alertActiveMeta: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 4 },
  alertInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingLeft: Spacing.md,
  },
  alertDollar: { color: Colors.textSecondary, fontSize: FontSize.lg, fontWeight: '700', marginRight: 4 },
  alertInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700', paddingVertical: Spacing.md, minWidth: 60 },
  alertBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, margin: 4 },
  alertBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },

  matchCircle: { alignItems: 'center', marginBottom: Spacing.md },
  matchCircleGrad: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  matchCircleNum: { color: '#fff', fontSize: FontSize.xxl, fontWeight: '800' },
  matchCircleLabel: { color: '#fff', fontSize: FontSize.xs, fontWeight: '600' },
  matchDesc: { color: Colors.textSecondary, fontSize: FontSize.md, textAlign: 'center', lineHeight: 22 },
  archetypeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  archChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full },
  archDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  archName: { fontSize: FontSize.sm, fontWeight: '600' },
  matchedBadge: { backgroundColor: Colors.success + '25', borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  matchedBadgeText: { color: Colors.success, fontSize: FontSize.xs, fontWeight: '600' },
  colorsRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  colorSwatch: { width: 44, height: 44, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border },
  tipRow: { flexDirection: 'row', marginBottom: Spacing.sm, alignItems: 'flex-start' },
  tipBullet: { color: Colors.primary, fontSize: FontSize.lg, marginRight: Spacing.sm, lineHeight: 22 },
  tipText: { flex: 1, color: Colors.textSecondary, fontSize: FontSize.md, lineHeight: 22 },

  bottomCta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    gap: Spacing.md,
  },
  ctaWishlist: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaWishlistActive: { borderColor: Colors.accent },
  ctaWishlistText: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700' },
  ctaBuy: { paddingVertical: Spacing.md, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  ctaBuyText: { color: '#fff', fontSize: FontSize.md, fontWeight: '800' },

  loading: { alignItems: 'center', paddingVertical: Spacing.xxxl, gap: Spacing.md },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600', flexShrink: 1 },
  unavailableBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.warning + '1A',
    borderColor: Colors.warning + '55',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  unavailableText: { flex: 1, color: Colors.warning, fontSize: FontSize.sm, fontWeight: '600', lineHeight: 19 },
  priceUnavailable: { color: Colors.textMuted, textDecorationLine: 'line-through' },
  homePrice: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '700' },
  verdict: { color: '#fff', fontSize: FontSize.xxl, fontWeight: '800', marginBottom: Spacing.xs },
  adviceLine: { color: Colors.textPrimary, fontSize: FontSize.sm, lineHeight: 20, marginTop: Spacing.sm },
  adviceBasis: { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.xs, lineHeight: 17, marginTop: Spacing.sm },
  recordLow: { color: Colors.success, fontSize: FontSize.sm, fontWeight: '700', marginTop: Spacing.sm },
  reasonLine: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: 4 },
  listingValueShrink: { flexShrink: 1, marginLeft: Spacing.md, textAlign: 'right' },
  smallNote: { color: Colors.textMuted, fontSize: FontSize.xs, lineHeight: 17, marginTop: Spacing.sm },
  recommendationMuted: { color: Colors.textSecondary, marginBottom: 0 },
  storeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  storeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    backgroundColor: Colors.surfaceLight,
  },
  storeChipText: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
});
