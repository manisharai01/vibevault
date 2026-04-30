// ============================================================
// VibeVault – Tag / Chip Component
// ============================================================

import React from 'react';
import { Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { BorderRadius, Colors, FontSize, Spacing } from '../../constants/theme';

interface TagProps {
  label: string;
  color?: string;
  selected?: boolean;
  onPress?: () => void;
  small?: boolean;
  style?: ViewStyle;
}

export default function Tag({ label, color, selected, onPress, small, style }: TagProps) {
  const bg = selected ? (color || Colors.primary) : Colors.surfaceLight;
  const textColor = selected ? '#FFF' : Colors.textSecondary;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        styles.tag,
        {
          backgroundColor: bg,
          paddingVertical: small ? 3 : Spacing.xs,
          paddingHorizontal: small ? Spacing.sm : Spacing.md,
        },
        style,
      ]}
    >
      <Text style={[styles.text, { color: textColor, fontSize: small ? FontSize.xs : FontSize.sm }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tag: {
    borderRadius: BorderRadius.full,
    marginRight: Spacing.xs,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  text: {
    fontWeight: '600',
  },
});
