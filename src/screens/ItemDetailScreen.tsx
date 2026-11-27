// ============================================================
// VibeVault – Item page
// One live listing (re-checked on its marketplace when opened):
//   Price & timing: when to buy (announced sales, the 14-day model,
//     the yearly pattern), price history, alerts, coupons and the
//     same item elsewhere.
//   Style: how it fits the user, a complete look around it and
//     similar pieces for less.
//   Details: the listing, and logging a purchase.
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
import Ionicons from '@expo/vector-icons/Ionicons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, Fonts, FontSize, PLATFORM_COLORS, STYLE_COLORS, Spacing, Type } from '../constants/theme';
import { DEPARTMENT_LABELS } from '../constants/marketplaces';
import { backendConfig } from '../config';
import { countryFlag, countryName } from '../data/countries';
import { useActiveAlertForItem, useAvailableItems, useBuyTiming, useIsPurchased, useIsWishlisted, useItem, useOffersForItem, useTrackRecord } from '../store/hooks';
import { useStore } from '../store/useStore';
import { FashionItem, PredictionHorizon, PricePoint } from '../types';
import { ItemDetailParams, ItemDetailTab } from '../navigation/types';
import EmptyState from '../components/common/EmptyState';
import OfferRow from '../components/common/OfferRow';
import PriceChart from '../components/common/PriceChart';
import ProductImage from '../components/common/ProductImage';
import Button from '../components/ui/Button';
import { Card, IconButton, PageTitle, Segmented, SectionHeader } from '../components/ui/Layout';
import { ListingCard, storeName, TimingBadge } from '../components/ui/Listing';
import { MonthStrip, ProgressRing } from '../components/ui/Visuals';
import { priceIn } from '../services/catalog';
import { fetchPriceHistory } from '../services/catalogApi';
import { MONTHS } from '../services/buyTiming';
import { completeTheLook, SLOT_LABELS } from '../services/composer';
import { compareLinks, marketplaceCtaLabel, openItemOnMarketplace, openUrl } from '../services/linking';
import { historyDays, MAIN_HORIZON, predictionFor, priceChangeSinceFirst, seasonalInsight, suggestedTarget as suggestTarget } from '../services/priceEngine';
import { similarForLess } from '../services/suggestions';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { confirmAction, notify } from '../utils/dialog';
import { formatDate, formatShortDate } from '../utils/date';
import { currencySymbol, formatMoney, formatMoneyWhole, formatPercent, formatRelativeTime, parsePriceInput, percentOff } from '../utils/format';
import { shareText } from '../utils/share';

const USE_NATIVE_DRIVER = RNPlatform.OS !== 'web';
const TABS: { key: ItemDetailTab; label: string }[] = [
  { key: 'price', label: 'Price & timing' },
  // Not "Style": the tab bar already has a Style button.
  { key: 'style', label: 'Fit & looks' },
  { key: 'details', label: 'Details' },
];
const BASIS_TEXT: Record<string, string> = {
  listing: 'this listing’s own history in the same situation',
  category: 'similar listings in the same category on this marketplace',
  marketplace: 'similar listings on this marketplace',
  situation: 'listings in the same price situation across marketplaces',
  all: 'every tracked listing',
};

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

/** live: just re-checked · recent: checked minutes ago · stale: couldn't re-check · unsupported: no per-listing check. */
type LiveState = 'checking' | 'live' | 'recent' | 'stale' | 'unsupported' | 'off';

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
    return (
      <View style={styles.container}>
        <PageTitle title={live === 'checking' ? 'Loading…' : 'Not found'} onBack={() => navigation.goBack()} />
        {live === 'checking' ? (
          <View style={styles.loading} accessibilityLabel="Loading listing">
            <ActivityIndicator color={Colors.ink} />
            <Text style={Type.small}>Fetching the live listing…</Text>
          </View>
        ) : (
          <EmptyState
            icon="alert-circle-outline"
            title="This listing isn’t available"
            message="It may have been sold or removed from the marketplace, or you may be offline."
          />
        )}
      </View>
    );
  }
  // Keyed by item so a different item never inherits another item's local state.
  return <ItemContent key={item.id} item={item} live={live} initialTab={route.params?.tab ?? 'price'} />;
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
      <View style={[styles.liveDot, { backgroundColor: fresh || live === 'unsupported' ? Colors.buy : Colors.wait }]} />
      <Text style={[styles.liveText, !fresh && live !== 'unsupported' && { color: Colors.wait }]}>{text}</Text>
    </View>
  );
}

function ItemContent({ item, live, initialTab }: { item: FashionItem; live: LiveState; initialTab: ItemDetailTab }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);

  const { profile, isProfileComplete, rates, marketplaces, toggleWishlist, addPriceAlert, removePriceAlert, logPurchase, undoPurchase, purchase, recordView } =
    useStore(
      useShallow((s) => ({
        profile: s.profile,
        isProfileComplete: s.isProfileComplete,
        rates: s.fxRates,
        marketplaces: s.marketplaces,
        toggleWishlist: s.toggleWishlist,
        addPriceAlert: s.addPriceAlert,
        removePriceAlert: s.removePriceAlert,
        logPurchase: s.logPurchase,
        undoPurchase: s.undoPurchase,
        purchase: s.purchases.find((p) => p.itemId === item.id),
        recordView: s.recordView,
      })),
    );
  const allItems = useAvailableItems();
  const isWishlisted = useIsWishlisted(item.id);
  const activeAlert = useActiveAlertForItem(item.id);
  const isPurchased = useIsPurchased(item.id);
  const offers = useOffersForItem(item);
  const trackRecord = useTrackRecord(MAIN_HORIZON, item.source);
  const fullHistory = useFullHistory(item);
  const timing = useBuyTiming(item);

  const [tab, setTab] = useState<ItemDetailTab>(initialTab);
  const [alertInput, setAlertInput] = useState('');
  const [copiedOfferId, setCopiedOfferId] = useState<string | null>(null);

  useEffect(() => {
    recordView(item.id);
  }, [item.id, recordView]);

  const money = useCallback((value: number) => formatMoney(value, item.currency), [item.currency]);
  const home = profile.currency;
  const homePrice = item.currency !== home ? priceIn(item, home, rates) : null;
  const discount = percentOff(item.currentPrice, item.originalPrice);
  const retailLabel = item.source === 'flipkart' ? 'MRP' : 'list price';
  const trackedDays = item.stats?.days ?? historyDays(fullHistory);
  const change = useMemo(() => priceChangeSinceFirst(fullHistory), [fullHistory]);
  const seasonal = useMemo(() => seasonalInsight(fullHistory), [fullHistory]);
  const prediction = predictionFor(item);
  const links = useMemo(() => compareLinks(item, marketplaces), [item, marketplaces]);
  const options = useMemo(() => ({ wishlist: new Set(profile.wishlist), rates }), [profile.wishlist, rates]);
  const look = useMemo(() => (tab === 'style' ? completeTheLook(item, allItems, profile, options)[0] ?? null : null), [tab, item, allItems, profile, options]);
  const cheaper = useMemo(() => (tab === 'style' ? similarForLess(item, allItems, home, rates) : []), [tab, item, allItems, home, rates]);

  // Alert targets: the price the timing call expects, then 5% and 10% under today.
  const alertTargets = useMemo(() => {
    const targets: { price: number; why: string }[] = [];
    const expected = timing?.expectedPrice ?? null;
    if (expected !== null && expected < item.currentPrice) targets.push({ price: Math.round(expected), why: 'expected low' });
    for (const pct of [0.05, 0.1]) {
      const price = Math.round(item.currentPrice * (1 - pct));
      if (!targets.some((t) => t.price === price) && price > 0) targets.push({ price, why: `${pct * 100}% under today` });
    }
    return targets;
  }, [timing, item.currentPrice]);

  // ---- Scroll-linked top bar ----
  const heroHeight = Math.round(Math.min(Math.min(width, 640) * 1.15, height * 0.56));
  const scrollY = useRef(new Animated.Value(0)).current;
  const barOpacity = scrollY.interpolate({ inputRange: [heroHeight - 200, heroHeight - 120], outputRange: [0, 1], extrapolate: 'clamp' });
  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: USE_NATIVE_DRIVER }), [scrollY]);

  const goBack = () => navigation.goBack();
  const openItem = (id: string) => (navigation as unknown as { push: (name: string, params: object) => void }).push('ItemDetail', { itemId: id });

  const setAlert = (target: number | null) => {
    if (target === null) {
      notify('Invalid price', `Enter a price like ${money(Math.round(item.currentPrice * 0.9))}.`);
      return;
    }
    const result = addPriceAlert(item.id, target);
    if (!result.ok) {
      notify('Can’t set alert', result.error);
      return;
    }
    Keyboard.dismiss();
    setAlertInput('');
    notify('Price alert set', `We'll let you know when "${item.title}" drops to ${money(result.alert.targetPrice)} or less on ${item.platform}. Prices are checked whenever you open VibeVault.`);
  };

  const handleLogPurchase = () => {
    const logged = logPurchase(item.id);
    if (!logged) return;
    notify(
      logged.secondhand ? 'Nice find' : 'Purchase logged',
      `Added to your purchases and your wardrobe${logged.savedInHome ? ` — ${formatMoneyWhole(logged.savedInHome, logged.homeCurrency)} below the ${retailLabel}` : ''}.`,
    );
  };

  const handleUndoPurchase = () =>
    confirmAction({
      title: 'Remove purchase?',
      message: 'This removes it from your purchases, your wardrobe and your impact stats.',
      confirmText: 'Remove',
      destructive: true,
      onConfirm: () => undoPurchase(item.id),
    });

  const openOnStore = async () => {
    if (!(await openItemOnMarketplace(item))) notify('Unable to open link', `Could not open ${item.platform} on your device.`);
  };
  const openCompare = async (label: string, url: string) => {
    if (!(await openUrl(url))) notify('Unable to open link', `Could not open ${label} on your device.`);
  };
  const share = async () => {
    const result = await shareText(item.title, `${item.title} — ${money(item.currentPrice)} on ${item.siteName}\n${item.productUrl}`);
    if (result === 'copied') notify('Link copied', 'The listing has been copied to your clipboard.');
    if (result === 'unavailable') notify('Sharing unavailable', 'Sharing is not supported on this device.');
  };
  const saveLook = () => {
    if (!look) return;
    const toSave = look.pieces.filter((p) => !profile.wishlist.includes(p.item.id));
    for (const p of toSave) toggleWishlist(p.item.id);
    notify('Look saved', toSave.length ? `${toSave.length} piece${toSave.length === 1 ? '' : 's'} added to your wishlist.` : 'Every piece is already in your wishlist.');
  };

  const tone = timing?.kind === 'buy-now' ? 'buy' : timing && ['wait-days', 'wait-month', 'wait-sale'].includes(timing.kind) ? 'wait' : 'plain';

  return (
    <View style={styles.container}>
      {/* One back button, always on top; the bar behind it and the title fade in as the photo scrolls away. */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.topBarBackground, { opacity: barOpacity }]} />
        <IconButton icon="arrow-back" label="Go back" onPress={goBack} />
        <Animated.Text style={[styles.topBarTitle, { opacity: barOpacity }]} numberOfLines={1} aria-hidden>
          {item.title}
        </Animated.Text>
        <IconButton icon="share-outline" label="Share this listing" onPress={share} />
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 120 + keyboardHeight }}
      >
        <View style={[styles.hero, { height: heroHeight }]}>
          <ProductImage uri={item.image} style={styles.heroImage} category={item.category} colors={item.colors} iconSize={56} accessibilityLabel={item.title} />
          {timing?.badge ? <TimingBadge timing={timing} style={styles.heroBadge} /> : null}
        </View>

        <View style={styles.head}>
          <View style={styles.storeRow}>
            <View style={[styles.dot, { backgroundColor: PLATFORM_COLORS[item.source] ?? Colors.textMuted }]} />
            <Text style={Type.eyebrow}>
              {storeName(item)} · {item.secondhand ? `Pre-owned · ${item.condition}` : 'New'} · {countryFlag(item.market)}
            </Text>
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {item.title}
          </Text>
          <View style={styles.priceRow}>
            <Text style={[styles.price, !item.available && styles.priceGone]}>{money(item.currentPrice)}</Text>
            {item.originalPrice && discount > 0 ? <Text style={styles.original}>{money(item.originalPrice)}</Text> : null}
            {discount > 0 ? <Text style={styles.discount}>−{discount}%</Text> : null}
          </View>
          {homePrice !== null ? <Text style={styles.homePrice}>≈ {formatMoneyWhole(homePrice, home)} at today’s ECB rate</Text> : null}
          <LiveLine item={item} live={live} />
          {!item.available ? (
            <Card tone="wait" style={{ marginTop: Spacing.md }}>
              <Text style={[Type.bodyStrong, { color: Colors.wait }]} accessibilityRole="alert">
                {item.endReason === 'stale'
                  ? `${item.platform} hasn’t listed this for a few days — it may have sold out.`
                  : `No longer available on ${item.platform} — it sold out or was removed.`}
              </Text>
            </Card>
          ) : null}
        </View>

        <Segmented options={TABS} value={tab} onChange={setTab} style={{ marginTop: Spacing.lg }} />

        {tab === 'price' ? (
          <View style={styles.tabBody}>
            {/* ---- When to buy ---- */}
            <Card tone={tone}>
              <Text style={Type.eyebrow}>When to buy</Text>
              <Text style={styles.verdict}>{timing?.headline ?? 'No clear signal yet'}</Text>
              {timing ? <Text style={styles.verdictText}>{timing.detail}</Text> : null}
              {timing?.expectedPrice && timing.saving ? (
                <View style={styles.expectRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={Type.caption}>Expected then</Text>
                    <Text style={styles.expectValue}>{money(timing.expectedPrice)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={Type.caption}>You’d save about</Text>
                    <Text style={styles.expectValue}>{formatPercent(timing.saving)}</Text>
                  </View>
                  {timing.buyFrom ? (
                    <View style={{ flex: 1 }}>
                      <Text style={Type.caption}>From</Text>
                      <Text style={styles.expectValue}>{formatShortDate(timing.buyFrom)}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {item.season ? (
                <View style={{ marginTop: Spacing.lg }}>
                  <Text style={[Type.smallStrong, { marginBottom: Spacing.sm }]}>Its price through the year</Text>
                  <MonthStrip months={item.season.months} highlight={timing?.month ?? null} current={new Date().getMonth()} />
                </View>
              ) : null}
              {prediction ? (
                <View style={styles.chances}>
                  {([7, 14, 30] as PredictionHorizon[]).map((h) => {
                    const p = predictionFor(item, h);
                    return (
                      <View key={h} style={styles.chance} accessible accessibilityLabel={p ? `${formatPercent(p.pDrop)} chance of a 5% lower price within ${h} days` : `${h} days: no estimate`}>
                        <Text style={styles.chanceValue}>{p ? formatPercent(p.pDrop) : '—'}</Text>
                        <Text style={Type.caption}>≥5% cheaper in {h} days</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
              {timing?.evidence.map((line) => (
                <Text key={line} style={styles.evidence}>
                  · {line}
                </Text>
              ))}
              {prediction ? (
                <Text style={styles.evidence}>
                  · Prediction learnt from {BASIS_TEXT[prediction.basis]}
                  {prediction.basis !== 'listing' ? ` (${prediction.basisListings} listings)` : ''}, updated {formatShortDate(item.prediction!.madeOn)}.
                </Text>
              ) : null}
              {trackRecord && trackRecord.resolved > 0 ? (
                <Text style={styles.evidence}>
                  · Track record ({trackRecord.horizon}-day calls{trackRecord.source ? ` on ${item.platform}` : ''}):
                  {trackRecord.waitCalls > 0 ? ` "wait" was right ${formatPercent(trackRecord.waitCorrect / trackRecord.waitCalls)} of ${trackRecord.waitCalls} times;` : ''}
                  {trackRecord.buyCalls > 0 ? ` "buy now" was right ${formatPercent(trackRecord.buyCorrect / trackRecord.buyCalls)} of ${trackRecord.buyCalls} times.` : ''}
                </Text>
              ) : null}
              {seasonal ? (
                <Text style={styles.evidence}>
                  · Over the last {seasonal.years === 1 ? 'year' : `${seasonal.years} years`}, it was cheapest in {MONTHS[seasonal.month]} — about{' '}
                  {Math.round(seasonal.below * 100)}% below its typical price.
                </Text>
              ) : null}
            </Card>

            {/* ---- Price history ---- */}
            <Card>
              <Text style={styles.cardTitle}>Price history</Text>
              <PriceChart
                history={fullHistory}
                currency={item.currency}
                height={150}
                expectedLow={timing?.expectedPrice && timing.expectedPrice < item.currentPrice ? timing.expectedPrice : null}
                expectedLowLabel={timing?.kind === 'wait-month' && timing.month !== null ? `Typical in ${MONTHS[timing.month]}` : `Typical low, next ${MAIN_HORIZON} days`}
              />
              <Text style={styles.note}>
                Recorded daily from {item.siteName} · {trackedDays} day{trackedDays === 1 ? '' : 's'} of data
                {item.stats ? ` · lowest ${money(item.stats.lowest)} on ${formatShortDate(item.stats.lowestOn)} · typical ${money(item.stats.median)}` : ''}
                {change && change.percent !== 0 ? ` · ${change.percent < 0 ? '▼' : '▲'} ${Math.abs(change.percent)}% since ${formatShortDate(change.since)}` : ''}
              </Text>
            </Card>

            {/* ---- Price alert ---- */}
            <Card>
              <Text style={styles.cardTitle}>Price alert</Text>
              {isPurchased ? (
                <Text style={Type.small}>You’ve bought this, so alerts are off.</Text>
              ) : activeAlert ? (
                <>
                  <Text style={[Type.bodyStrong, { color: Colors.buy }]}>Alert set for {formatMoney(activeAlert.targetPrice, activeAlert.currency)} or less</Text>
                  <Text style={[Type.small, { marginTop: 2 }]}>
                    Set {formatDate(activeAlert.createdAt)} at {formatMoney(activeAlert.priceAtCreation, activeAlert.currency)}
                  </Text>
                  <Button label="Remove alert" variant="secondary" size="sm" onPress={() => removePriceAlert(activeAlert.id)} style={{ alignSelf: 'flex-start', marginTop: Spacing.md }} />
                </>
              ) : !item.available ? (
                <Text style={Type.small}>This listing is no longer available, so an alert can’t be set.</Text>
              ) : (
                <>
                  <Text style={[Type.small, { marginBottom: Spacing.md }]}>Get told when the {item.platform} price drops to your target. Tap a target or type your own.</Text>
                  <View style={styles.targetRow}>
                    {alertTargets.map((t) => (
                      <TouchableOpacity
                        key={t.price}
                        style={styles.target}
                        onPress={() => setAlert(t.price)}
                        accessibilityRole="button"
                        accessibilityLabel={`Alert at ${money(t.price)}`}
                      >
                        <Text style={styles.targetPrice}>{money(t.price)}</Text>
                        <Text style={styles.targetWhy}>{t.why}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.alertInputRow}>
                    <Text style={styles.alertCurrency}>{currencySymbol(item.currency).trim()}</Text>
                    <TextInput
                      style={styles.alertInput}
                      keyboardType="decimal-pad"
                      placeholder={String(suggestTarget(item))}
                      placeholderTextColor={Colors.textMuted}
                      value={alertInput}
                      onChangeText={setAlertInput}
                      onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)}
                      onSubmitEditing={() => {
                        if (alertInput.trim()) setAlert(parsePriceInput(alertInput));
                      }}
                      returnKeyType="done"
                      maxLength={12}
                      accessibilityLabel={`Target price in ${item.currency}`}
                    />
                    <Button label="Set alert" size="sm" disabled={!alertInput.trim()} onPress={() => setAlert(parsePriceInput(alertInput))} style={{ margin: 4 }} />
                  </View>
                </>
              )}
            </Card>

            {/* ---- Coupons ---- */}
            {offers.length > 0 ? (
              <Card>
                <Text style={styles.cardTitle}>Coupons & offers</Text>
                {offers.slice(0, 6).map((offer) => (
                  <OfferRow key={offer.id} offer={offer} copied={copiedOfferId === offer.id} onCopied={setCopiedOfferId} compact />
                ))}
                <Text style={styles.note}>
                  From the store’s or affiliate network’s live feed, re-confirmed in the last day and shown only while in date. Tap an offer to copy its
                  code and open the store; the store checks eligibility at checkout.
                </Text>
              </Card>
            ) : null}

            {/* ---- Compare ---- */}
            {links.length > 0 ? (
              <Card>
                <Text style={styles.cardTitle}>Compare elsewhere</Text>
                <Text style={[Type.small, { marginBottom: Spacing.md }]}>Search for this piece on the other shops VibeVault tracks in {countryName(item.market)}.</Text>
                <View style={styles.wrap}>
                  {links.map((link) => (
                    <TouchableOpacity
                      key={link.source}
                      style={styles.linkChip}
                      onPress={() => openCompare(link.label, link.url)}
                      accessibilityRole="link"
                      accessibilityLabel={`Search ${link.label} for this item`}
                    >
                      <View style={[styles.dot, { backgroundColor: PLATFORM_COLORS[link.source] ?? Colors.textMuted }]} />
                      <Text style={styles.linkText}>{link.label}</Text>
                      <Ionicons name="open-outline" size={13} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              </Card>
            ) : null}
          </View>
        ) : null}

        {tab === 'style' ? (
          <View style={styles.tabBody}>
            <Card>
              <Text style={styles.cardTitle}>How it fits you</Text>
              {isProfileComplete ? (
                <View style={styles.fitRow}>
                  <ProgressRing progress={item.matchScore / 100} label={`${item.matchScore}%`} sublabel="match" />
                  <View style={{ flex: 1, gap: 6 }}>
                    {item.matchReasons.length ? (
                      item.matchReasons.map((r) => (
                        <Text key={r} style={Type.small}>
                          ✓ {r}
                        </Text>
                      ))
                    ) : (
                      <Text style={Type.small}>Outside your usual style — a bold experiment.</Text>
                    )}
                  </View>
                </View>
              ) : (
                <>
                  <Text style={[Type.small, { marginBottom: Spacing.md }]}>Take the style quiz to see how well this piece suits you.</Text>
                  <Button label="Find my style" onPress={() => navigation.navigate('Profiler')} />
                </>
              )}
              <View style={[styles.wrap, { marginTop: Spacing.lg }]}>
                {item.styleArchetypes.map((s) => (
                  <View key={s} style={styles.styleTag}>
                    <View style={[styles.dot, { backgroundColor: STYLE_COLORS[s] ?? Colors.textMuted }]} />
                    <Text style={styles.styleTagText}>{s}</Text>
                    {profile.styleArchetypes.includes(s) ? <Text style={styles.yours}>yours</Text> : null}
                  </View>
                ))}
              </View>
            </Card>

            {look ? (
              <View>
                <SectionHeader eyebrow="Complete the look" title="Wear it with" action="Save all" onAction={saveLook} actionLabel="Save every piece of this look" style={{ paddingHorizontal: 0 }} />
                <View style={{ gap: Spacing.sm }}>
                  {look.pieces
                    .filter((p) => p.item.id !== item.id)
                    .map((p) => (
                      <TouchableOpacity
                        key={p.item.id}
                        style={styles.lookRow}
                        onPress={() => openItem(p.item.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`${SLOT_LABELS[p.slot]}: ${p.item.title}, ${formatMoney(p.item.currentPrice, p.item.currency)}`}
                      >
                        <ProductImage uri={p.item.image} style={styles.lookImage} category={p.item.category} colors={p.item.colors} iconSize={18} />
                        <View style={{ flex: 1 }}>
                          <Text style={Type.caption}>{SLOT_LABELS[p.slot].toUpperCase()}</Text>
                          <Text style={Type.bodyStrong} numberOfLines={1}>
                            {p.item.title}
                          </Text>
                          <Text style={Type.small}>
                            {formatMoney(p.item.currentPrice, p.item.currency)} · {storeName(p.item)}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                      </TouchableOpacity>
                    ))}
                </View>
                {look.reasons.length ? <Text style={styles.note}>{look.reasons.join(' · ')}</Text> : null}
              </View>
            ) : null}

            {cheaper.length > 0 ? (
              <View>
                <SectionHeader eyebrow="Same idea, lower price" title="Similar for less" style={{ paddingHorizontal: 0 }} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.md }}>
                  {cheaper.map((alt) => (
                    <ListingCard
                      key={alt.id}
                      item={alt}
                      timing={null}
                      saved={profile.wishlist.includes(alt.id)}
                      showMatch={isProfileComplete}
                      onOpen={openItem}
                      onToggleSave={toggleWishlist}
                      width={150}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === 'details' ? (
          <View style={styles.tabBody}>
            <Card>
              <Text style={styles.cardTitle}>About this piece</Text>
              <Text style={Type.body}>{item.description ?? `No description was provided on ${item.platform}.`}</Text>
              <View style={{ marginTop: Spacing.md }}>
                <Detail label="Shop" value={item.siteName} />
                {item.seller ? <Detail label="Seller" value={item.seller} /> : null}
                <Detail label="Category" value={item.category} />
                <Detail label="Section" value={DEPARTMENT_LABELS[item.department]} />
                <Detail label="Condition" value={item.secondhand ? item.condition : 'New'} />
                {item.size ? <Detail label="Size" value={item.size} /> : null}
                <Detail label="Ships to" value={`${countryFlag(item.market)} ${countryName(item.market)}`} />
                {item.listedDate ? <Detail label="Listed" value={formatDate(item.listedDate)} /> : null}
                <Detail label="Tracked since" value={formatDate(item.firstSeen)} />
              </View>
              {item.currency !== home ? (
                <Text style={styles.note}>
                  Priced in {item.currency}
                  {homePrice !== null ? ` (≈ ${formatMoneyWhole(homePrice, home)})` : ''}. Shipping, duties and card fees are shown on {item.platform} at checkout.
                </Text>
              ) : null}
            </Card>

            <Card>
              <Text style={styles.cardTitle}>Bought it?</Text>
              {isPurchased && purchase ? (
                <>
                  <Text style={[Type.bodyStrong, { color: Colors.buy }]}>
                    Logged on {formatDate(purchase.purchasedAt)} for {formatMoney(purchase.pricePaid, purchase.currency)} — it’s in your wardrobe.
                  </Text>
                  <Button label="Undo purchase" variant="secondary" size="sm" onPress={handleUndoPurchase} style={{ alignSelf: 'flex-start', marginTop: Spacing.md }} />
                </>
              ) : (
                <>
                  <Text style={[Type.small, { marginBottom: Spacing.md }]}>
                    Log it to track what you spend and save, and the Stylist will count it in your wardrobe.
                  </Text>
                  <Button label={`Log purchase at ${money(item.currentPrice)}`} variant="secondary" onPress={handleLogPurchase} icon="bag-check-outline" />
                </>
              )}
            </Card>
          </View>
        ) : null}
      </Animated.ScrollView>

      {keyboardHeight === 0 ? (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.saveButton, isWishlisted && styles.saveButtonOn]}
            onPress={() => toggleWishlist(item.id)}
            accessibilityRole="button"
            accessibilityLabel={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
            aria-selected={isWishlisted}
          >
            <Ionicons name={isWishlisted ? 'heart' : 'heart-outline'} size={20} color={isWishlisted ? Colors.offer : Colors.ink} />
            <Text style={styles.saveText}>{isWishlisted ? 'Saved' : 'Save'}</Text>
          </TouchableOpacity>
          <Button label={marketplaceCtaLabel(item)} onPress={openOnStore} accessibilityRole="link" iconRight="arrow-forward" style={{ flex: 1 }} size="lg" />
        </View>
      ) : null}
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={Type.small}>{label}</Text>
      <Text style={[Type.smallStrong, styles.detailValue]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { alignItems: 'center', paddingVertical: Spacing.xxxl, gap: Spacing.md },
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
  topBarBackground: { backgroundColor: Colors.background, borderBottomColor: Colors.border, borderBottomWidth: 1, pointerEvents: 'none' },
  topBarTitle: { flex: 1, fontFamily: Fonts.semibold, fontSize: FontSize.md, color: Colors.ink },

  hero: { backgroundColor: Colors.surfaceMuted },
  heroImage: { width: '100%', height: '100%' },
  heroBadge: { position: 'absolute', left: Spacing.lg, bottom: Spacing.lg },
  head: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: Spacing.sm },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  title: { ...Type.display, fontSize: 30, lineHeight: 34 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm, flexWrap: 'wrap' },
  price: { fontFamily: Fonts.display, fontSize: FontSize.xxxl, lineHeight: 40, color: Colors.ink },
  priceGone: { color: Colors.textMuted, textDecorationLine: 'line-through' },
  original: { fontFamily: Fonts.regular, fontSize: FontSize.md, color: Colors.textMuted, textDecorationLine: 'line-through' },
  discount: { fontFamily: Fonts.semibold, fontSize: FontSize.md, color: Colors.offer },
  homePrice: { ...Type.small },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontFamily: Fonts.medium, fontSize: 12, color: Colors.textSecondary, flexShrink: 1 },

  tabBody: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: Spacing.lg },
  cardTitle: { ...Type.title, fontSize: 22, marginBottom: Spacing.sm },
  verdict: { ...Type.display, fontSize: 30, lineHeight: 36, marginTop: Spacing.xs },
  verdictText: { ...Type.body, marginTop: Spacing.sm },
  expectRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.08)' },
  expectValue: { fontFamily: Fonts.display, fontSize: FontSize.xl, color: Colors.ink, marginTop: 2 },
  chances: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  chance: { flex: 1, backgroundColor: 'rgba(255,255,255,0.65)', borderRadius: BorderRadius.md, padding: Spacing.sm, gap: 2 },
  chanceValue: { fontFamily: Fonts.display, fontSize: FontSize.xl, color: Colors.ink },
  evidence: { fontFamily: Fonts.regular, fontSize: 12, lineHeight: 17, color: Colors.textSecondary, marginTop: Spacing.sm },
  note: { fontFamily: Fonts.regular, fontSize: 12, lineHeight: 17, color: Colors.textMuted, marginTop: Spacing.md },

  targetRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', marginBottom: Spacing.md },
  target: { flexGrow: 1, minWidth: 92, borderWidth: 1, borderColor: Colors.borderStrong, borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, backgroundColor: Colors.surface },
  targetPrice: { fontFamily: Fonts.semibold, fontSize: FontSize.md, color: Colors.ink },
  targetWhy: { fontFamily: Fonts.regular, fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  alertInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceMuted, borderRadius: BorderRadius.md, paddingLeft: Spacing.md },
  alertCurrency: { fontFamily: Fonts.semibold, fontSize: FontSize.lg, color: Colors.textSecondary, marginRight: 4 },
  alertInput: { flex: 1, fontFamily: Fonts.semibold, fontSize: FontSize.lg, color: Colors.ink, paddingVertical: Spacing.md, minWidth: 60 },

  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  linkChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, height: 36, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  linkText: { fontFamily: Fonts.medium, fontSize: FontSize.sm, color: Colors.ink },

  fitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  styleTag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, height: 32, borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceMuted },
  styleTagText: { fontFamily: Fonts.medium, fontSize: 12, color: Colors.ink },
  yours: { fontFamily: Fonts.semibold, fontSize: 10, color: Colors.buy, textTransform: 'uppercase', letterSpacing: 0.8 },
  lookRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm },
  lookImage: { width: 56, height: 70, borderRadius: BorderRadius.sm },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.lg, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border },
  detailValue: { flexShrink: 1, textAlign: 'right' },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 54,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
  },
  saveButtonOn: { borderColor: Colors.offer },
  saveText: { fontFamily: Fonts.semibold, fontSize: FontSize.md, color: Colors.ink },
});
