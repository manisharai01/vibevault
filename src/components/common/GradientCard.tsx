// ============================================================
// VibeVault – Gradient Card Component
// ============================================================

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, Colors, Shadows, Spacing } from '../../constants/theme';

interface GradientCardProps {
  children: React.ReactNode;
  gradient?: readonly string[];
  style?: ViewStyle;
  padding?: number;
}

export default function GradientCard({
  children,
  gradient,
  style,
  padding = Spacing.lg,
}: GradientCardProps) {
  return (
    <LinearGradient
      colors={(gradient || [Colors.surface, Colors.surfaceLight]) as [string, string, ...string[]]}
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
