import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { useStore } from '../store/useStore';
import { FashionItem, StyleArchetype } from '../types';
import GradientCard from '../components/common/GradientCard';

const STYLE_FILTERS: Array<'All' | StyleArchetype> = [
  'All',
  'Minimalist',
  'Streetwear',
  'Bohemian',
  'Vintage',
  'Athleisure',
  'Preppy',
  'Grunge',
  'Cottagecore',
  'Dark Academia',
  'Y2K',
];

const pick = (items: FashionItem[]) => items[Math.floor(Math.random() * items.length)];

export default function ComposerScreen({ navigation }: { navigation: any }) {
  const { wishlistItems, recommendedItems } = useStore();
  const [styleFilter, setStyleFilter] = useState<'All' | StyleArchetype>('All');

  const sourceItems = wishlistItems.length > 0 ? wishlistItems : recommendedItems;

  const filtered = useMemo(() => {
    if (styleFilter === 'All') return sourceItems;
    return sourceItems.filter((i) => i.styleArchetypes.includes(styleFilter));
  }, [sourceItems, styleFilter]);

  const tops = filtered.filter((i) => i.category === 'Tops');
  const bottoms = filtered.filter((i) => i.category === 'Bottoms' || i.category === 'Dresses');
  const outerwear = filtered.filter((i) => i.category === 'Outerwear');
  const shoes = filtered.filter((i) => i.category === 'Shoes');
  const accessories = filtered.filter((i) => i.category === 'Accessories' || i.category === 'Bags');

  const look = useMemo(() => {
    return {
      top: tops.length ? pick(tops) : undefined,
      bottom: bottoms.length ? pick(bottoms) : undefined,
      layer: outerwear.length ? pick(outerwear) : undefined,
      shoes: shoes.length ? pick(shoes) : undefined,
      accessory: accessories.length ? pick(accessories) : undefined,
    };
  }, [filtered]);

  const lookItems = [look.top, look.bottom, look.layer, look.shoes, look.accessory].filter(Boolean) as FashionItem[];
  const total = lookItems.reduce((sum, i) => sum + i.currentPrice, 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 120 }}>
      <LinearGradient colors={[Colors.primaryDark, Colors.background]} style={styles.header}>
        <Text style={styles.title}>Wardrobe Composer</Text>
        <Text style={styles.subtitle}>Build complete looks from your saved and recommended pieces.</Text>
      </LinearGradient>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {STYLE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, styleFilter === f && styles.filterChipActive]}
            onPress={() => setStyleFilter(f)}
          >
            <Text style={[styles.filterText, styleFilter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <GradientCard style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>Current Look</Text>
        <Text style={styles.summaryText}>{lookItems.length} pieces · ${total.toFixed(2)} estimated total</Text>
      </GradientCard>

      {lookItems.length === 0 ? (
        <GradientCard style={styles.emptyCard}>
          <Text style={styles.emptyText}>Not enough items to compose a look yet. Save more items in Discover.</Text>
        </GradientCard>
      ) : (
        lookItems.map((item) => (
          <TouchableOpacity key={item.id} style={styles.itemCard} onPress={() => navigation.navigate('ItemDetail', { item })}>
            <Image source={{ uri: item.image }} style={styles.itemImage} />
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.itemMeta}>{item.category} · {item.platform}</Text>
              <Text style={styles.itemPrice}>${item.currentPrice.toFixed(2)}</Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: 56, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.lg },
  title: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800' },
  subtitle: { color: Colors.textSecondary, marginTop: 6, fontSize: FontSize.sm },
  filterRow: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  filterChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryDark },
  filterText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '700' },
  filterTextActive: { color: Colors.primaryLight },
  summaryCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md },
  sectionTitle: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700' },
  summaryText: { color: Colors.textSecondary, marginTop: 6 },
  emptyCard: { marginHorizontal: Spacing.lg },
  emptyText: { color: Colors.textSecondary, lineHeight: 20 },
  itemCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    padding: Spacing.md,
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  itemImage: { width: 64, height: 64, borderRadius: BorderRadius.sm, backgroundColor: Colors.surface },
  itemTitle: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  itemMeta: { color: Colors.textMuted, marginTop: 2, fontSize: FontSize.xs },
  itemPrice: { color: Colors.success, marginTop: 6, fontWeight: '800' },
});
