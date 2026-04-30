// ============================================================
// VibeVault – Progress Bar Component
// ============================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, Colors, FontSize, Spacing } from '../../constants/theme';

interface ProgressBarProps {
  progress: number; // 0-100
  height?: number;
  gradient?: readonly string[];
  showLabel?: boolean;
  label?: string;
}

export default function ProgressBar({
  progress,
  height = 8,
  gradient,
  showLabel = false,
  label,
}: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <View>
      {showLabel && (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label || ''}</Text>
          <Text style={styles.percent}>{clampedProgress}%</Text>
        </View>
      )}
      <View style={[styles.track, { height }]}>
        <LinearGradient
          colors={(gradient || Colors.gradientPrimary) as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: `${clampedProgress}%` as any, height }]}
        />
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
