// ============================================================
// VibeVault – Progress Bar Component
// ============================================================

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, Colors, FontSize, GradientColors, Spacing } from '../../constants/theme';

interface ProgressBarProps {
  progress: number; // 0-100
  height?: number;
  gradient?: GradientColors;
  showLabel?: boolean;
  label?: string;
  /** Text shown on the right instead of the percentage. */
  valueLabel?: string;
  accessibilityLabel?: string;
}

export default function ProgressBar({
  progress,
  height = 8,
  gradient,
  showLabel = false,
  label,
  valueLabel,
  accessibilityLabel,
}: ProgressBarProps) {
  const clamped = Number.isFinite(progress) ? Math.round(Math.min(100, Math.max(0, progress))) : 0;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
    >
      {showLabel && (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label ?? ''}</Text>
          <Text style={styles.percent}>{valueLabel ?? `${clamped}%`}</Text>
        </View>
      )}
      <View style={[styles.track, { height }]}>
        {clamped > 0 ? (
          <LinearGradient
            colors={gradient ?? Colors.gradientPrimary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.fill, { width: `${clamped}%`, height }]}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: BorderRadius.full,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  percent: {
    color: Colors.primaryLight,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
});
