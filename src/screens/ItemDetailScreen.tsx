// ============================================================
// VibeVault – Item Detail Screen
// One live listing: the price is re-checked on the marketplace when
// the screen opens. Shows recorded price history (and a forecast once
// there is enough of it), price alerts, style fit, eco impact,
// purchase logging, and links out to the marketplace and other stores.
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
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, FontSize, PLATFORM_COLORS, STYLE_COLORS, Spacing } from '../constants/theme';
import { EXTERNAL_STORES, ExternalStore, REGION_LABELS } from '../constants/marketplaces';
import { useActiveAlertForItem, useIsPurchased, useIsWishlisted, useItem } from '../store/hooks';
import { useStore } from '../store/useStore';
import { FashionItem, StyleArchetype } from '../types';
import { ItemDetailParams } from '../navigation/types';
import GradientCard from '../components/common/GradientCard';
import PriceChart from '../components/common/PriceChart';
import ProgressBar from '../components/common/ProgressBar';
import ProductImage from '../components/common/ProductImage';
import Tag from '../components/common/Tag';
import EmptyState from '../components/common/EmptyState';
import ScreenHeader from '../components/common/ScreenHeader';
import {
  generateForecast,
  getDealScore,
  getOptimalPurchaseWindow,
  getPredictionRange,
  historyDays,
  priceChangeSinceFirst,
} from '../services/priceEngine';
import { externalSearchUrl, marketplaceCtaLabel, openItemOnMarketplace, openUrl, searchQueryFor } from '../services/linking';
import { CO2_KG_PER_TREE_YEAR, NEW_ITEM_FOOTPRINT_KG, WATER_LITERS_PER_KG_CO2 } from '../services/sustainability';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { confirmAction, notify } from '../utils/dialog';
import { formatDate, formatShortDate } from '../utils/date';
import { currencySymbol, formatMoney, formatNumber, formatRelativeTime, parsePriceInput, percentOff } from '../utils/format';

const CONDITION_SCORE: Record<string, number> = {
  'New with tags': 100,
  'Like new': 85,
  Good: 65,
  Fair: 45,
  'Well-loved': 25,
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

/** Suggested alert target: the forecast low when prices are falling, otherwise 10% off. */
function suggestTarget(item: FashionItem, forecastLow: number | null): number {
  const raw = forecastLow !== null && forecastLow < item.currentPrice ? forecastLow : item.currentPrice * 0.9;
  return item.currency === 'INR' ? Math.max(1, Math.floor(raw)) : Math.max(0.01, Math.floor(raw * 100) / 100);
}

const USE_NATIVE_DRIVER = RNPlatform.OS !== 'web';
type TabKey = 'overview' | 'price' | 'style';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'price', label: 'Price' },
  { key: 'style', label: 'Style Fit' },
];

/** live: just re-checked on the marketplace · recent: checked in the last few minutes · stale: couldn't re-check. */
type LiveState = 'checking' | 'live' | 'recent' | 'stale' | 'off';

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
  return <ItemDetailContent key={item.id} item={item} live={live} />;
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
    ? `Live price from ${item.platform} · checked ${formatRelativeTime(item.lastChecked)}`
    : `Couldn’t reach ${item.platform} — showing the price recorded ${formatRelativeTime(item.lastChecked)}`;
  return (
    <View style={styles.liveRow} accessibilityLabel={text}>
      <View style={[styles.liveDot, { backgroundColor: fresh ? Colors.success : Colors.warning }]} />
      <Text style={[styles.liveText, !fresh && { color: Colors.warning }]}>{text}</Text>
    </View>
  );
}

function ItemDetailContent({ item, live }: { item: FashionItem; live: LiveState }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const scrollRef = useRef<ScrollView>(null);

  const { isProfileComplete, userStyles, toggleWishlist, addPriceAlert, removePriceAlert, logPurchase, undoPurchase, purchase } =
    useStore(
      useShallow((s) => ({
        isProfileComplete: s.isProfileComplete,
        userStyles: s.profile.styleArchetypes,
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

  const [alertInput, setAlertInput] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [headerVisible, setHeaderVisible] = useState(false);

  const money = useCallback((value: number) => formatMoney(value, item.currency), [item.currency]);
  const dealScore = getDealScore(item);
  const savingsPercent = percentOff(item.currentPrice, item.originalPrice);
  const retailLabel = item.source === 'flipkart' ? 'MRP' : 'retail';
  const forecast = useMemo(() => generateForecast(item, 30), [item]);
  const optimal = useMemo(() => getOptimalPurchaseWindow(item), [item]);
  const range7d = useMemo(() => getPredictionRange(item, 7), [item]);
  const range30d = useMemo(() => getPredictionRange(item, 30), [item]);
  const trackedDays = historyDays(item.priceHistory);
  const change = useMemo(() => priceChangeSinceFirst(item.priceHistory), [item.priceHistory]);
  const suggestedTarget = suggestTarget(item, optimal.hasForecast && optimal.bestDay > 0 ? optimal.bestPrice : null);
  const searchQuery = useMemo(() => searchQueryFor(item), [item]);
  const newFootprint = NEW_ITEM_FOOTPRINT_KG[item.category];
  const byline = [item.brand, item.seller ? `sold by ${item.seller}` : null].filter(Boolean).join(' · ') || item.platform;

  // ---- Scroll-linked header ----
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({ inputRange: [120, 200], outputRange: [0, 1], extrapolate: 'clamp' });
  const imageScale = scrollY.interpolate({ inputRange: [-120, 0], outputRange: [1.3, 1], extrapolate: 'clamp' });
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: USE_NATIVE_DRIVER,
        listener: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
          const visible = e.nativeEvent.contentOffset.y > 160;
          setHeaderVisible((prev) => (prev === visible ? prev : visible));
        },
      }),
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
    if (logged.secondhand) {
      notify('🌱 Nice find!', `About ${logged.co2Saved} kg of CO₂ saved has been added to your Eco Impact.`);
    } else {
      notify('Purchase logged', 'Added to your purchases. Only pre-owned finds count toward CO₂ saved.');
    }
  };

  const handleUndoPurchase = () => {
    confirmAction({
      title: 'Remove purchase?',
      message: 'This removes the purchase from your Eco Impact stats.',
      confirmText: 'Remove',
      destructive: true,
      onConfirm: () => undoPurchase(item.id),
    });
  };

  const handleOpenMarketplace = async () => {
    const opened = await openItemOnMarketplace(item);
    if (!opened) notify('Unable to open link', `Could not open ${item.platform} on your device.`);
  };

  const handleSearchStore = async (store: ExternalStore) => {
    const opened = await openUrl(externalSearchUrl(store, searchQuery));
    if (!opened) notify('Unable to open link', `Could not open ${store} on your device.`);
  };

  const goToProfiler = () => navigation.navigate('Profiler');

  const matchGradient = item.matchScore >= 80 ? Colors.gradientEco : Colors.gradientPrimary;

  return (
    <View style={styles.container}>
      {/* Compact header that fades in once the hero scrolls away */}
      <Animated.View
        style={[
          styles.floatingHeader,
          { opacity: headerOpacity, paddingTop: insets.top + Spacing.sm, pointerEvents: headerVisible ? 'auto' : 'none' },
        ]}
        accessibilityElementsHidden={!headerVisible}
        importantForAccessibility={headerVisible ? 'auto' : 'no-hide-descendants'}
      >
        <TouchableOpacity onPress={goBack} style={styles.floatingBack} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
          <Text style={styles.floatingBackText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.floatingTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <TouchableOpacity
          onPress={handleWishlistToggle}
          style={styles.floatingHeart}
          accessibilityRole="button"
          accessibilityLabel={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
          hitSlop={8}
        >
          <Text style={styles.heartIcon}>{isWishlisted ? '❤️' : '🤍'}</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 120 + keyboardHeight }}
      >
        {/* Hero image */}
        <View style={styles.imageContainer}>
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

          <View style={[styles.platformBadge, { backgroundColor: PLATFORM_COLORS[item.platform] || Colors.primary }]}>
            <Text style={styles.platformText}>
              {item.platform} · {REGION_LABELS[item.region]}
            </Text>
          </View>

          <View style={[styles.heroButtonWrap, { top: insets.top + 10, left: 16 }]}>
            <TouchableOpacity style={styles.heroButton} onPress={goBack} accessibilityRole="button" accessibilityLabel="Go back">
              <Text style={styles.heroButtonText}>←</Text>
            </TouchableOpacity>
          </View>

          <Animated.View style={[styles.heroButtonWrap, { top: insets.top + 10, right: 16, transform: [{ scale: heartAnim }] }]}>
            <TouchableOpacity
              style={styles.heroButton}
              onPress={handleWishlistToggle}
              accessibilityRole="button"
              accessibilityLabel={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
              aria-selected={isWishlisted}
            >
              <Text style={styles.heartIcon}>{isWishlisted ? '❤️' : '🤍'}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Title & price */}
        <View style={styles.titleSection}>
          {!item.available && (
            <View style={styles.unavailableBanner} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={18} color={Colors.warning} />
              <Text style={styles.unavailableText}>
                No longer available on {item.platform} — it may have sold out. Last recorded price {money(item.currentPrice)}.
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
              <Text style={styles.metaChipText}>📍 {REGION_LABELS[item.region]}</Text>
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
                <Text style={styles.listingValue}>
                  {item.platform} ({REGION_LABELS[item.region]})
                </Text>
              </View>
              {item.currency !== 'INR' && (
                <Text style={styles.smallNote}>
                  Priced in {item.currency} by the seller. Shipping, customs and conversion fees are shown on {item.platform} at checkout.
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
                  <Text style={[styles.metricBig, { color: Colors.ecoGreen }]}>{item.sustainabilityScore}</Text>
                  <Text style={styles.metricLabel}>Eco Score</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={[styles.metricBig, { color: Colors.accent }]}>{item.secondhand ? `${item.co2Saved}kg` : '—'}</Text>
                  <Text style={styles.metricLabel}>CO₂ Saved</Text>
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
              <Text style={styles.barLabel}>Sustainability · {item.sustainabilityScore}/100</Text>
              <ProgressBar progress={item.sustainabilityScore} height={8} gradient={Colors.gradientEco} accessibilityLabel="Sustainability" />
              {item.secondhand && (
                <>
                  <Text style={styles.barLabel}>Condition · {item.condition}</Text>
                  <ProgressBar progress={CONDITION_SCORE[item.condition] ?? 50} height={8} gradient={Colors.gradientAccent} accessibilityLabel="Condition" />
                </>
              )}
            </GradientCard>

            <GradientCard style={styles.section} gradient={Colors.gradientEco}>
              <Text style={styles.sectionTitle}>Eco Impact</Text>
              {item.secondhand ? (
                <>
                  <Text style={styles.ecoDesc}>Choosing this pre-loved piece over buying new saves roughly:</Text>
                  <View style={styles.ecoItems}>
                    <View style={styles.ecoItem}>
                      <Text style={styles.ecoEmoji}>💨</Text>
                      <Text style={styles.ecoValue}>{item.co2Saved} kg</Text>
                      <Text style={styles.ecoUnit}>CO₂ emissions</Text>
                    </View>
                    <View style={styles.ecoItem}>
                      <Text style={styles.ecoEmoji}>💧</Text>
                      <Text style={styles.ecoValue}>{formatNumber(item.co2Saved * WATER_LITERS_PER_KG_CO2)} L</Text>
                      <Text style={styles.ecoUnit}>Water</Text>
                    </View>
                    <View style={styles.ecoItem}>
                      <Text style={styles.ecoEmoji}>🌱</Text>
                      <Text style={styles.ecoValue}>{(item.co2Saved / CO2_KG_PER_TREE_YEAR).toFixed(2)}</Text>
                      <Text style={styles.ecoUnit}>Tree-years of CO₂</Text>
                    </View>
                  </View>
                  <Text style={[styles.ecoDesc, styles.ecoFootnote]}>Typical figures for the category; estimates, not measurements.</Text>
                </>
              ) : (
                <Text style={styles.ecoDesc}>
                  This is a new item. Making a new piece in {item.category.toLowerCase()} typically emits around {newFootprint} kg of CO₂ — a
                  pre-owned find avoids most of that. Try the pre-owned listings from eBay in Discover.
                </Text>
              )}
            </GradientCard>

            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>Bought It?</Text>
              {isPurchased && purchase ? (
                <>
                  <Text style={styles.purchasedText}>
                    ✅ Logged on {formatDate(purchase.purchasedAt)} for {formatMoney(purchase.pricePaid, purchase.currency)}
                    {purchase.secondhand ? ' — counted in your Eco Impact.' : '.'}
                  </Text>
                  <TouchableOpacity onPress={handleUndoPurchase} style={styles.secondaryBtn} accessibilityRole="button">
                    <Text style={styles.secondaryBtnText}>Undo purchase</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.helperText}>
                    {item.secondhand
                      ? 'Bought it on ' + item.platform + '? Log it to track the CO₂, water and money you’ve saved by thrifting.'
                      : 'Bought it on ' + item.platform + '? Log it to keep track of what you’ve spent and saved.'}
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
            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>{forecast.length > 0 ? 'Price History & Forecast' : 'Price History'}</Text>
              <PriceChart history={item.priceHistory} forecast={forecast} currency={item.currency} height={160} />
              <Text style={styles.smallNote}>
                Recorded daily from {item.platform} · {trackedDays} day{trackedDays === 1 ? '' : 's'} of data
                {change && change.percent !== 0
                  ? ` · ${change.percent < 0 ? '▼' : '▲'} ${Math.abs(change.percent)}% since ${formatShortDate(change.since)}`
                  : ''}
              </Text>
            </GradientCard>

            <GradientCard style={styles.section} gradient={optimal.hasForecast ? Colors.gradientEco : undefined}>
              <Text style={styles.sectionTitle}>Best Time to Buy</Text>
              <Text style={[styles.recommendation, !optimal.hasForecast && styles.recommendationMuted]}>{optimal.recommendation}</Text>
              {optimal.hasForecast && (
                <View style={styles.optimalGrid}>
                  <View style={styles.optimalItem}>
                    <Text style={styles.optimalLabel}>Best Price</Text>
                    <Text style={styles.optimalValue}>{money(optimal.bestPrice)}</Text>
                  </View>
                  <View style={styles.optimalItem}>
                    <Text style={styles.optimalLabel}>Savings</Text>
                    <Text style={styles.optimalValue}>{money(optimal.savings)}</Text>
                  </View>
                  <View style={styles.optimalItem}>
                    <Text style={styles.optimalLabel}>When</Text>
                    <Text style={styles.optimalValue}>{optimal.bestDay === 0 ? 'Now' : `In ${optimal.bestDay}d`}</Text>
                  </View>
                  <View style={styles.optimalItem}>
                    <Text style={styles.optimalLabel}>Save</Text>
                    <Text style={styles.optimalValue}>{optimal.savingsPercent}%</Text>
                  </View>
                </View>
              )}
            </GradientCard>

            {range7d && range30d && (
              <GradientCard style={styles.section}>
                <Text style={styles.sectionTitle}>Price Predictions</Text>
                <View style={styles.predRow}>
                  {[
                    { label: 'In 7 days', range: range7d },
                    { label: 'In 30 days', range: range30d },
                  ].map(({ label, range }, index) => (
                    <React.Fragment key={label}>
                      {index > 0 && <View style={styles.predDivider} />}
                      <View style={styles.predBox}>
                        <Text style={styles.predDays}>{label}</Text>
                        <Text style={styles.predPrice}>{money(range.predicted)}</Text>
                        <Text style={styles.predRange}>
                          {money(range.low)} – {money(range.high)}
                        </Text>
                        <Text style={styles.predCi}>likely range</Text>
                        {range.predicted < item.currentPrice * 0.995 ? (
                          <Text style={styles.predDown}>▼ Trending down</Text>
                        ) : range.predicted > item.currentPrice * 1.005 ? (
                          <Text style={styles.predUp}>▲ Trending up</Text>
                        ) : (
                          <Text style={styles.predFlat}>● Holding steady</Text>
                        )}
                      </View>
                    </React.Fragment>
                  ))}
                </View>
                <Text style={styles.smallNote}>
                  Projected from {trackedDays} days of recorded prices. Sellers can change prices at any time, so treat this as a guide.
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
                    Get alerted when the {item.platform} price drops to your target. Suggested target: {money(suggestedTarget)}.
                  </Text>
                  <View style={styles.alertInputRow}>
                    <Text style={styles.alertDollar}>{currencySymbol(item.currency).trim()}</Text>
                    <TextInput
                      style={styles.alertInput}
                      keyboardType="decimal-pad"
                      placeholder={item.currency === 'INR' ? String(suggestedTarget) : suggestedTarget.toFixed(2)}
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

            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>Compare Elsewhere</Text>
              <Text style={styles.helperText}>
                These stores don’t publish prices for apps, so VibeVault can’t track them — tap one to search it for this item.
              </Text>
              <View style={styles.storeChips}>
                {EXTERNAL_STORES.map((store) => (
                  <TouchableOpacity
                    key={store}
                    style={[styles.storeChip, { borderColor: (PLATFORM_COLORS[store] || Colors.border) + '80' }]}
                    onPress={() => handleSearchStore(store)}
                    accessibilityRole="link"
                    accessibilityLabel={`Search ${store} for this item`}
                  >
                    <Text style={styles.storeChipText}>{store}</Text>
                    <Ionicons name="open-outline" size={12} color={Colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            </GradientCard>
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
            aria-selected={isWishlisted}
          >
            <Text style={styles.ctaWishlistText}>{isWishlisted ? '❤️ Saved' : '🤍 Save'}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} style={{ flex: 1 }} onPress={handleOpenMarketplace} accessibilityRole="link">
            <LinearGradient colors={Colors.gradientPrimary} style={styles.ctaBuy}>
              <Text style={styles.ctaBuyText}>{marketplaceCtaLabel(item.platform)}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    elevation: 10,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
  },
  floatingBack: { marginRight: Spacing.md },
  floatingBackText: { color: Colors.primaryLight, fontSize: FontSize.md, fontWeight: '600' },
  floatingTitle: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  floatingHeart: { padding: Spacing.xs },

  imageContainer: { height: 340, overflow: 'hidden' },
  heroImage: { width: '100%', height: '100%' },
  imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, pointerEvents: 'none' },
  matchBadge: { position: 'absolute', bottom: 16, left: 16 },
  matchBadgeGrad: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full, alignItems: 'center' },
  matchPct: { color: '#fff', fontSize: FontSize.lg, fontWeight: '800' },
  matchLbl: { color: '#fff', fontSize: FontSize.xs, fontWeight: '600' },
  platformBadge: { position: 'absolute', bottom: 16, right: 16, paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full },
  platformText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },
  heroButtonWrap: { position: 'absolute' },
  heroButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroButtonText: { color: '#fff', fontSize: FontSize.lg, fontWeight: '700' },
  heartIcon: { fontSize: 18 },

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
  ecoItems: { flexDirection: 'row', justifyContent: 'space-around' },
  ecoItem: { alignItems: 'center', flex: 1 },
  ecoEmoji: { fontSize: 26, marginBottom: 4 },
  ecoValue: { color: '#fff', fontSize: FontSize.md, fontWeight: '800' },
  ecoUnit: { color: '#fff', fontSize: FontSize.xs, opacity: 0.9, textAlign: 'center' },

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
  optimalItem: { alignItems: 'center' },
  optimalLabel: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.xs, marginBottom: 2 },
  optimalValue: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },

  predRow: { flexDirection: 'row' },
  predBox: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm },
  predDays: { color: Colors.textMuted, fontSize: FontSize.sm, marginBottom: 4 },
  predPrice: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: '800' },
  predRange: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 4 },
  predCi: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
  predDown: { color: Colors.success, fontSize: FontSize.xs, fontWeight: '600', marginTop: 4 },
  predUp: { color: Colors.error, fontSize: FontSize.xs, fontWeight: '600', marginTop: 4 },
  predFlat: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600', marginTop: 4 },
  predDivider: { width: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },

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
  listingValueShrink: { flexShrink: 1, marginLeft: Spacing.md, textAlign: 'right' },
  smallNote: { color: Colors.textMuted, fontSize: FontSize.xs, lineHeight: 17, marginTop: Spacing.sm },
  ecoFootnote: { fontSize: FontSize.xs, opacity: 0.8, marginTop: Spacing.md, marginBottom: 0 },
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
