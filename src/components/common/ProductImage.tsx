// ============================================================
// VibeVault – Product image with graceful fallback
// Shows a themed placeholder when offline or the image fails.
// ============================================================

import React, { useEffect, useState } from 'react';
import { Image, ImageStyle, StyleProp, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors } from '../../constants/theme';
import { ItemCategory } from '../../types';

const CATEGORY_ICONS: Record<ItemCategory, React.ComponentProps<typeof Ionicons>['name']> = {
  Tops: 'shirt-outline',
  Bottoms: 'body-outline',
  Dresses: 'woman-outline',
  Outerwear: 'shirt-outline',
  Shoes: 'footsteps-outline',
  Accessories: 'diamond-outline',
  Bags: 'bag-handle-outline',
};

interface ProductImageProps {
  uri: string | null;
  style?: StyleProp<ImageStyle>;
  category?: ItemCategory;
  colors?: string[];
  accessibilityLabel?: string;
  iconSize?: number;
}

export default function ProductImage({ uri, style, category, colors, accessibilityLabel, iconSize = 28 }: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (failed || !uri) {
    return (
      <LinearGradient
        colors={[Colors.surfaceLight, Colors.card]}
        style={[styles.fallback, style as object]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      >
        <Ionicons name={category ? CATEGORY_ICONS[category] : 'image-outline'} size={iconSize} color={Colors.textSecondary} />
        {colors && colors.length > 0 ? (
          <View style={styles.swatches}>
            {colors.slice(0, 3).map((color, index) => (
              <View key={`${color}-${index}`} style={[styles.swatch, { backgroundColor: color }]} />
            ))}
          </View>
        ) : null}
      </LinearGradient>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.image, style]}
      resizeMode="cover"
      onError={() => setFailed(true)}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: Colors.surfaceLight },
  fallback: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  swatches: { flexDirection: 'row', gap: 4, marginTop: 6 },
  swatch: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
});
