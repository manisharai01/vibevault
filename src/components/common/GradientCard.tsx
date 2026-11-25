// ============================================================
// VibeVault – Gradient Card Component
// ============================================================

import React from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, Colors, GradientColors, Shadows, Spacing } from '../../constants/theme';

interface GradientCardProps {
  children: React.ReactNode;
  gradient?: GradientColors;
  style?: StyleProp<ViewStyle>;
  padding?: number;
}

const DEFAULT_GRADIENT: GradientColors = [Colors.surface, Colors.surfaceLight];

export default function GradientCard({ children, gradient, style, padding = Spacing.lg }: GradientCardProps) {
  return (
    <LinearGradient
      colors={gradient ?? DEFAULT_GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { padding }, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.card,
  },
});
