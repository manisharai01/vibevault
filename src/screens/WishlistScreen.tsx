// ============================================================
// VibeVault – Wishlist as a buying calendar
// Saved listings grouped by when to buy them: now, within two
// weeks, the month a sale or a cheaper season is due, or no clear
// signal yet. Sold listings stay (marked) until removed.
// ============================================================

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, Spacing, Type } from '../constants/theme';
import { useUpcomingSales, useWishlistItems } from '../store/hooks';
import { useStore } from '../store/useStore';
import { ProfileStackParamList, RootTabParamList } from '../navigation/types';
import EmptyState from '../components/common/EmptyState';
import Button from '../components/ui/Button';
import { Card, PageTitle, SectionHeader, Stat } from '../components/ui/Layout';
import { ListingRow } from '../components/ui/Listing';
import { buyCalendar } from '../services/buyTiming';
import { formatTotal, totalIn } from '../services/catalog';
import { convertAmount, formatMoneyWhole } from '../utils/format';

type Nav = CompositeNavigationProp<NativeStackNavigationProp<ProfileStackParamList, 'Wishlist'>, BottomTabNavigationProp<RootTabParamList>>;

export default function WishlistScreen() {
  const navigation = useNavigation<Nav>();
  const items = useWishlistItems();
  const sales = useUpcomingSales();
  const { isProfileComplete, toggleWishlist, wishlistIds, homeCurrency, rates } = useStore(
    useShallow((s) => ({
      isProfileComplete: s.isProfileComplete,
      toggleWishlist: s.toggleWishlist,
      wishlistIds: s.profile.wishlist,
      homeCurrency: s.profile.currency,
      rates: s.fxRates,
    })),
  );
  // Saved ids whose listing isn't loaded (e.g. offline before the first sync).
  const missingIds = useMemo(() => {
    const loaded = new Set(items.map((i) => i.id));
    return wishlistIds.filter((id) => !loaded.has(id));
  }, [wishlistIds, items]);
  const groups = useMemo(() => buyCalendar(items, { now: new Date(), upcomingSales: sales }), [items, sales]);

  const available = items.filter((i) => i.available);
  const total = totalIn(available, homeCurrency, rates);
  const offList = available.reduce(
    (sum, i) => sum + (i.originalPrice !== null ? convertAmount(Math.max(0, i.originalPrice - i.currentPrice), i.currency, homeCurrency, rates) ?? 0 : 0),
    0,
  );
  const avgMatch = items.length ? Math.round(items.reduce((s, i) => s + i.matchScore, 0) / items.length) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Spacing.xxxl }}>
      <PageTitle eyebrow="Saved" title="Wishlist" subtitle="Your saved pieces as a buying calendar — what to buy now and what’s worth waiting for." onBack={() => navigation.goBack()} />

      {items.length === 0 && missingIds.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="Nothing saved yet"
          message="Tap the heart on any piece to save it here and see the best time to buy."
          actionLabel="Browse Discover"
          onAction={() => navigation.navigate('Discover', { screen: 'DiscoverFeed', pop: true })}
        />
      ) : null}

      {items.length > 0 ? (
        <Card style={styles.summary}>
          <View style={styles.stats}>
            <Stat value={String(items.length)} label="Saved" />
            <Stat value={formatTotal(total, available.length)} label="Together" />
            <Stat value={formatMoneyWhole(offList, homeCurrency)} label="Off list price" />
            {isProfileComplete ? <Stat value={`${avgMatch}%`} label="Avg match" /> : null}
          </View>
        </Card>
      ) : null}

      {groups.map((group) => (
        <View key={group.key}>
          <SectionHeader eyebrow={`${group.items.length} ${group.items.length === 1 ? 'piece' : 'pieces'}`} title={group.title} />
          <View style={styles.list}>
            {group.items.map(({ item, timing }) => (
              <ListingRow
                key={item.id}
                item={item}
                timing={timing}
                note={timing.detail}
                noteTone={timing.kind === 'buy-now' ? 'buy' : timing.kind === 'no-signal' || timing.kind === 'unavailable' ? 'muted' : 'wait'}
                onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
                accessibilityLabel={`${item.title}, ${item.available ? '' : 'no longer available, '}${timing.headline}`}
                right={
                  <TouchableOpacity onPress={() => toggleWishlist(item.id)} accessibilityRole="button" accessibilityLabel={`Remove ${item.title} from wishlist`} hitSlop={8} style={styles.remove}>
                    <Ionicons name="close" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                }
              />
            ))}
          </View>
        </View>
      ))}

      {missingIds.length > 0 ? (
        <Card tone="muted" style={styles.summary}>
          <Text style={Type.small}>
            {missingIds.length} saved {missingIds.length === 1 ? 'listing' : 'listings'} couldn’t be loaded right now. They’ll appear once VibeVault reaches the
            server.
          </Text>
          <Button
            label={`Remove ${missingIds.length === 1 ? 'it' : 'them'}`}
            variant="secondary"
            size="sm"
            onPress={() => missingIds.forEach((id) => toggleWishlist(id))}
            style={{ alignSelf: 'flex-start', marginTop: Spacing.md }}
          />
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  summary: { marginHorizontal: Spacing.lg, marginTop: Spacing.md },
  stats: { flexDirection: 'row', gap: Spacing.sm },
  list: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  remove: { padding: Spacing.xs, borderRadius: BorderRadius.full },
});
