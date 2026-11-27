// ============================================================
// VibeVault – Deals
// The market board: top deals right now (each with when to buy),
// coupons valid today, price alerts, and the model's measured track
// record. Saved items live on the Wishlist (Profile).
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CompositeNavigationProp, RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, Fonts, Spacing, Type } from '../constants/theme';
import { countryName } from '../data/countries';
import { useAvailableItems, useOffers, useTrackRecord, useUpcomingSales } from '../store/hooks';
import { useStore } from '../store/useStore';
import { FashionItem, PriceAlert } from '../types';
import { DealsStackParamList, DealsView, RootTabParamList } from '../navigation/types';
import CatalogStatusBanner from '../components/common/CatalogStatusBanner';
import EmptyState from '../components/common/EmptyState';
import OfferRow from '../components/common/OfferRow';
import ProductImage from '../components/common/ProductImage';
import { Card, PageTitle, Segmented, SectionHeader, Stat } from '../components/ui/Layout';
import { ListingRow } from '../components/ui/Listing';
import { PillRow } from '../components/ui/Pill';
import { getBuyTiming } from '../services/buyTiming';
import { refreshAndNotify } from '../services/lifecycle';
import { getBuyAdvice, getDealScore, MAIN_HORIZON } from '../services/priceEngine';
import { formatDate } from '../utils/date';
import { formatMoney, formatPercent } from '../utils/format';

type Nav = CompositeNavigationProp<NativeStackNavigationProp<DealsStackParamList, 'DealsFeed'>, BottomTabNavigationProp<RootTabParamList>>;
type ViewMode = DealsView;
const TOP_DEALS_LIMIT = 15;

/** Marketplace id of an alert whose listing details aren't loaded (id is `<source>:<market>:<item id>`). */
const sourceFromId = (itemId: string) => itemId.split(':')[0];

export default function PriceScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<DealsStackParamList, 'DealsFeed'>>();
  const { priceAlerts, recommendedItems, removePriceAlert, acknowledgeTriggeredAlerts, marketplaces, country } = useStore(
    useShallow((s) => ({
      priceAlerts: s.priceAlerts,
      recommendedItems: s.recommendedItems,
      removePriceAlert: s.removePriceAlert,
      acknowledgeTriggeredAlerts: s.acknowledgeTriggeredAlerts,
      marketplaces: s.marketplaces,
      country: s.profile.country,
    })),
  );
  const availableItems = useAvailableItems();
  const offers = useOffers();
  const sales = useUpcomingSales();
  const record = useTrackRecord(MAIN_HORIZON);

  const [viewMode, setViewMode] = useState<ViewMode>(route.params?.view ?? 'deals');
  const [platform, setPlatform] = useState<string>('All');
  const [copiedOfferId, setCopiedOfferId] = useState<string | null>(null);
  const platformName = useCallback((source: string) => marketplaces.find((m) => m.source === source)?.name ?? source, [marketplaces]);
  const platformOptions = useMemo(() => ['All', ...new Set(recommendedItems.map((i) => i.source))], [recommendedItems]);

  // Other screens (e.g. a price-drop notification) can open a specific view.
  const requestedView = route.params?.view;
  useEffect(() => {
    if (requestedView) {
      setViewMode(requestedView);
      navigation.setParams({ view: undefined });
    }
  }, [requestedView, navigation]);

  // Seeing the alerts clears the badge on the Deals tab (also for hits arriving while it's open).
  useFocusEffect(
    useCallback(() => {
      if (viewMode === 'alerts' && priceAlerts.length > 0) acknowledgeTriggeredAlerts();
    }, [viewMode, acknowledgeTriggeredAlerts, priceAlerts]),
  );

  const retry = useCallback(() => {
    refreshAndNotify({ force: true }).catch(() => undefined);
  }, []);
  const matches = useCallback((item: FashionItem) => platform === 'All' || item.source === platform, [platform]);

  const topDeals = useMemo(() => {
    const now = new Date();
    return availableItems
      .filter(matches)
      .map((item) => ({ item, score: getDealScore(item), timing: getBuyTiming(item, { now, upcomingSales: sales }) }))
      .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
      .slice(0, TOP_DEALS_LIMIT);
  }, [availableItems, matches, sales]);

  const couponRows = useMemo(
    () =>
      offers
        .filter((o) => !o.listingId && (platform === 'All' || o.source === platform))
        // Codes first, then the ones ending soonest.
        .sort((a, b) => Number(!!b.code) - Number(!!a.code) || (a.endsAt ?? '9999').localeCompare(b.endsAt ?? '9999')),
    [offers, platform],
  );

  const itemsById = useMemo(() => new Map(recommendedItems.map((item) => [item.id, item])), [recommendedItems]);
  const alertRows = useMemo(() => {
    const rows: { alert: PriceAlert; item: FashionItem | undefined }[] = priceAlerts
      .map((alert) => ({ alert, item: itemsById.get(alert.itemId) }))
      // Alerts whose listing isn't loaded stay visible (when unfiltered) so they can still be removed.
      .filter((row) => (row.item ? matches(row.item) : platform === 'All'));
    return rows.sort((a, b) => {
      if (a.alert.status !== b.alert.status) return a.alert.status === 'triggered' ? -1 : 1;
      return (b.alert.triggeredAt ?? b.alert.createdAt).localeCompare(a.alert.triggeredAt ?? a.alert.createdAt);
    });
  }, [priceAlerts, itemsById, matches, platform]);

  const insights = useMemo(() => {
    const advised = availableItems.map((item) => getBuyAdvice(item)).filter((a) => a !== null);
    const discounted = availableItems.filter((i) => i.originalPrice !== null && i.originalPrice > i.currentPrice);
    const avgDiscount = discounted.length
      ? Math.round((discounted.reduce((sum, i) => sum + (1 - i.currentPrice / i.originalPrice!), 0) / discounted.length) * 100)
      : null;
    return { tracked: availableItems.length, predicted: advised.length, buyNow: advised.filter((a) => a!.verdict === 'buy').length, avgDiscount };
  }, [availableItems]);

  // From deals and alerts, open the item on its Price & timing tab.
  const openDetail = (itemId: string) => navigation.navigate('ItemDetail', { itemId, tab: 'price' });
  const activeCount = priceAlerts.filter((a) => a.status === 'active').length;
  const triggeredCount = priceAlerts.filter((a) => a.status === 'triggered').length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Spacing.xxxl }} keyboardShouldPersistTaps="handled">
      <PageTitle eyebrow="Market" title="Deals" subtitle="Prices recorded every day, when to buy each piece, and coupons that are valid today." />

      <Segmented
        options={[
          // "Top deals", not "Deals": the tab bar already has a "Deals" button.
          { key: 'deals', label: 'Top deals' },
          { key: 'coupons', label: `Coupons (${couponRows.length})` },
          { key: 'alerts', label: `Alerts (${activeCount + triggeredCount})` },
        ]}
        value={viewMode}
        onChange={setViewMode}
      />

      {platformOptions.length > 2 ? (
        <View style={{ marginTop: Spacing.md }}>
          <PillRow
            options={platformOptions}
            selected={platform}
            onSelect={setPlatform}
            getLabel={(source) => (source === 'All' ? 'All shops' : platformName(source))}
            accessibilityLabel="Shop"
            size="sm"
          />
        </View>
      ) : null}

      {viewMode === 'deals' ? (
        <View style={styles.section}>
          <Text style={styles.listTitle}>Best deals right now</Text>
          {availableItems.length === 0 ? (
            <CatalogStatusBanner itemCount={0} onRetry={retry} />
          ) : topDeals.length === 0 ? (
            <EmptyState icon="pricetags-outline" title="No deals from this shop" message="Try another shop." />
          ) : (
            topDeals.map(({ item, score, timing }) => (
              <ListingRow
                key={item.id}
                item={item}
                onPress={() => openDetail(item.id)}
                timing={timing}
                note={timing.detail}
                noteTone={timing.kind === 'buy-now' ? 'buy' : timing.kind === 'no-signal' ? 'muted' : 'wait'}
                accessibilityLabel={`${item.title}, ${formatMoney(item.currentPrice, item.currency)} on ${item.platform}, deal score ${score}`}
                right={
                  <View style={styles.score}>
                    <Text style={styles.scoreValue}>{score}</Text>
                    <Text style={styles.scoreLabel}>deal</Text>
                  </View>
                }
              />
            ))
          )}
        </View>
      ) : null}

      {viewMode === 'coupons' ? (
        <View style={styles.section}>
          <Text style={styles.listTitle}>Coupons valid today{country ? ` in ${countryName(country)}` : ''}</Text>
          {!country ? (
            // Coupons are issued per country, so they're only loaded once the user picks one.
            <EmptyState
              icon="globe-outline"
              title="Choose your country for coupons"
              message="Coupons only work in the country they're issued for."
              actionLabel="Choose country"
              onAction={() => navigation.navigate('Profile', { screen: 'ProfileMain', params: { pick: 'country' } })}
            />
          ) : couponRows.length === 0 ? (
            <EmptyState
              icon="ticket-outline"
              title="No valid coupons right now"
              message="Coupons come from the stores' and affiliate networks' live feeds. Nothing is listed unless a feed confirms it today."
            />
          ) : (
            couponRows.map((offer) => <OfferRow key={offer.id} offer={offer} copied={copiedOfferId === offer.id} onCopied={setCopiedOfferId} />)
          )}
          {sales.length > 0 ? (
            <Card tone="offer" style={{ marginTop: Spacing.md }}>
              <Text style={Type.eyebrow}>Coming up</Text>
              {sales.slice(0, 5).map((sale) => (
                <Text key={sale.id} style={[Type.small, { marginTop: 6, color: Colors.ink }]}>
                  <Text style={Type.smallStrong}>{sale.merchant}</Text> · {sale.title} · from {formatDate(sale.startsAt!)}
                </Text>
              ))}
            </Card>
          ) : null}
          <Text style={styles.footnote}>
            Tap an offer to copy its code and open the store. Every coupon here is from an official store or affiliate-network feed, was still listed by
            that feed within the last day, and is inside its start and end dates. Stores apply their own conditions (minimum spend, new customers, one use)
            at checkout.
          </Text>
        </View>
      ) : null}

      {viewMode === 'alerts' ? (
        <View style={styles.section}>
          <Text style={styles.listTitle}>Price alerts</Text>
          {alertRows.length === 0 ? (
            // No button here: "Top deals" is right above.
            <EmptyState
              icon="notifications-outline"
              title={priceAlerts.length === 0 ? 'No price alerts yet' : 'No alerts for this shop'}
              message={priceAlerts.length === 0 ? 'Open any piece and set a target price under Price & timing.' : undefined}
            />
          ) : (
            alertRows.map(({ alert, item }) => {
              const target = formatMoney(alert.targetPrice, alert.currency);
              const title = item?.title ?? `${platformName(sourceFromId(alert.itemId))} listing`;
              const hit = alert.status === 'triggered';
              return (
                <View key={alert.id} style={[styles.alert, hit && styles.alertHit]}>
                  <TouchableOpacity style={styles.alertMain} onPress={() => openDetail(alert.itemId)} accessibilityRole="button" accessibilityLabel={`${title} alert`}>
                    <ProductImage uri={item?.image ?? null} style={styles.alertImage} category={item?.category} colors={item?.colors} iconSize={16} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={Type.bodyStrong} numberOfLines={1}>
                        {title}
                      </Text>
                      {hit ? (
                        <>
                          <Text style={[Type.smallStrong, { color: Colors.buy }]}>Target hit — {formatMoney(alert.triggeredPrice ?? alert.targetPrice, alert.currency)}</Text>
                          <Text style={Type.caption}>
                            Target {target}
                            {alert.triggeredAt ? ` · ${formatDate(alert.triggeredAt)}` : ''}
                            {item ? (item.available ? ` · now ${formatMoney(item.currentPrice, item.currency)}` : ' · no longer available') : ''}
                          </Text>
                        </>
                      ) : !item ? (
                        <>
                          <Text style={Type.smallStrong}>Target {target}</Text>
                          <Text style={Type.caption}>Listing details aren’t loaded right now · set {formatDate(alert.createdAt)}</Text>
                        </>
                      ) : (
                        <>
                          <Text style={Type.smallStrong}>
                            Now {formatMoney(item.currentPrice, item.currency)} → target {target}
                          </Text>
                          <Text style={Type.caption}>
                            {!item.available
                              ? `No longer available on ${item.platform}`
                              : item.currentPrice <= alert.targetPrice
                                ? 'At your target now'
                                : `${formatMoney(item.currentPrice - alert.targetPrice, item.currency)} to go`}{' '}
                            · set {formatDate(alert.createdAt)}
                          </Text>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removePriceAlert(alert.id)} accessibilityRole="button" accessibilityLabel={`Delete alert for ${title}`} hitSlop={8} style={styles.delete}>
                    <Ionicons name="close" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      ) : null}

      <SectionHeader eyebrow="Measured, not claimed" title="How accurate are the predictions?" />
      <Card style={{ marginHorizontal: Spacing.lg }}>
        {record && record.resolved > 0 ? (
          <>
            <Text style={Type.body}>
              {record.waitCalls > 0
                ? `When VibeVault said "wait", the price dropped 5%+ within ${record.horizon} days ${formatPercent(record.waitCorrect / record.waitCalls)} of the time (${record.waitCalls} calls).`
                : 'No "wait" calls have been scored yet.'}
            </Text>
            <Text style={[Type.body, { marginTop: Spacing.sm }]}>
              {record.buyCalls > 0
                ? `When it said "buy now", the price didn't drop 5%+ ${formatPercent(record.buyCorrect / record.buyCalls)} of the time (${record.buyCalls} calls).`
                : 'No "buy now" calls have been scored yet.'}
            </Text>
            {record.brier !== null && record.brierBaseRate !== null ? (
              <Text style={styles.footnote}>
                Brier score {record.brier.toFixed(3)} vs {record.brierBaseRate.toFixed(3)} for always guessing the average (lower is better) · {record.resolved} predictions
                scored{record.since ? ` since ${formatDate(record.since)}` : ''}.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={Type.body}>
            Every prediction is stored and scored when its {MAIN_HORIZON}-day window closes; the measured accuracy shows here once the first ones are scored. No
            prediction is ever 100% certain — sellers set prices — so VibeVault shows its real hit rate instead.
          </Text>
        )}
        <View style={styles.stats}>
          <Stat value={String(insights.tracked)} label="Live listings" />
          <Stat value={String(insights.predicted)} label="With a prediction" />
          <Stat value={String(insights.buyNow)} label="Buy-now calls" />
          <Stat value={insights.avgDiscount === null ? '—' : `${insights.avgDiscount}%`} label="Avg. discount" />
        </View>
        <Text style={styles.footnote}>Discounts are against the list price or MRP the marketplace reports.</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  section: { paddingHorizontal: Spacing.lg, marginTop: Spacing.lg, gap: Spacing.sm },
  listTitle: { ...Type.title, marginBottom: Spacing.xs },
  score: { alignItems: 'center', minWidth: 40 },
  scoreValue: { fontFamily: Fonts.display, fontSize: 24, color: Colors.ink },
  scoreLabel: { fontFamily: Fonts.medium, fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm },
  alertHit: { borderColor: Colors.buy, backgroundColor: Colors.buyTint },
  alertMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  alertImage: { width: 56, height: 70, borderRadius: BorderRadius.sm },
  delete: { padding: Spacing.xs },
  stats: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  footnote: { fontFamily: Fonts.regular, fontSize: 12, lineHeight: 17, color: Colors.textMuted, marginTop: Spacing.md },
});
