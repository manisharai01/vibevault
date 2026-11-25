// ============================================================
// VibeVault – Gradient screen header (safe-area aware)
// ============================================================

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, GradientColors, Spacing } from '../../constants/theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  children?: React.ReactNode;
  gradient?: GradientColors;
}

export default function ScreenHeader({ title, subtitle, onBack, right, children, gradient }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={gradient ?? [Colors.primaryDark, Colors.background]}
      style={[styles.header, { paddingTop: insets.top + Spacing.md }]}
    >
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      ) : null}
      {title || right ? (
        <View style={styles.titleRow}>
          {title ? (
            <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
              {title}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {right}
        </View>
      ) : null}
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={3}>
          {subtitle}
        </Text>
      ) : null}
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  backBtn: { alignSelf: 'flex-start', marginBottom: Spacing.sm },
  backText: { color: Colors.primaryLight, fontSize: FontSize.md, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  title: { flex: 1, fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4, lineHeight: 18 },
});
