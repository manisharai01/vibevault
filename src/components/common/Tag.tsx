// ============================================================
// VibeVault – Tag / Chip Component
// Renders a plain view unless it's pressable, so tags inside
// tappable cards don't swallow the card's touches.
// ============================================================

import React from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { BorderRadius, Colors, FontSize, Spacing, readableTextOn } from '../../constants/theme';

interface TagProps {
  label: string;
  color?: string;
  selected?: boolean;
  onPress?: () => void;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Tag({ label, color, selected, onPress, small, style }: TagProps) {
  const bg = selected ? color || Colors.primary : Colors.surfaceLight;
  const textColor = selected ? readableTextOn(bg) : Colors.textSecondary;
  const containerStyle = [
    styles.tag,
    {
      backgroundColor: bg,
      paddingVertical: small ? 3 : Spacing.xs,
      paddingHorizontal: small ? Spacing.sm : Spacing.md,
    },
    style,
  ];
  const content = (
    <Text style={[styles.text, { color: textColor, fontSize: small ? FontSize.xs : FontSize.sm }]}>{label}</Text>
  );

  if (!onPress) return <View style={containerStyle}>{content}</View>;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={containerStyle}
      accessibilityRole="button"
      aria-selected={!!selected}
    >
      {content}
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
