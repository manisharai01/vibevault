// ============================================================
// VibeVault – Score Badge Component
// ============================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, Colors, FontSize } from '../../constants/theme';

interface ScoreBadgeProps {
  score: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

function getScoreColor(score: number): readonly [string, string] {
  if (score >= 80) return Colors.gradientEco;
  if (score >= 60) return Colors.gradientPrimary;
  if (score >= 40) return Colors.gradientAccent;
  return ['#FF7675', '#D63031'] as const;
}

export default function ScoreBadge({ score, label, size = 'md' }: ScoreBadgeProps) {
  const dimensions = size === 'sm' ? 36 : size === 'md' ? 48 : 64;
  const fontSize = size === 'sm' ? FontSize.xs : size === 'md' ? FontSize.md : FontSize.xl;

  return (
    <View style={{ alignItems: 'center' }}>
      <LinearGradient
        colors={getScoreColor(score) as unknown as [string, string, ...string[]]}
        style={[styles.badge, { width: dimensions, height: dimensions, borderRadius: dimensions / 2 }]}
      >
        <Text style={[styles.score, { fontSize }]}>{score}</Text>
      </LinearGradient>
      {label && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    color: '#FFF',
    fontWeight: '800',
  },
  label: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 4,
    textAlign: 'center',
  },
});
