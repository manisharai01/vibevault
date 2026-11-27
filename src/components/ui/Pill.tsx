// ============================================================
// VibeVault – Pills (filter chips and choices)
// ============================================================

import React from 'react';
import { AccessibilityRole, ScrollView, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BorderRadius, Colors, Fonts, FontSize, Spacing } from '../../constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface PillProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
  /** A small colour dot before the label (e.g. a swatch). */
  dot?: string;
  role?: AccessibilityRole;
  accessibilityLabel?: string;
  disabled?: boolean;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
}

export default function Pill({ label, selected, onPress, icon, dot, role = 'button', accessibilityLabel, disabled, size = 'md', style }: PillProps) {
  const checked = role === 'radio' || role === 'checkbox';
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      activeOpacity={0.75}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      aria-selected={checked ? undefined : selected}
      aria-checked={checked ? selected : undefined}
      aria-disabled={disabled}
      style={[styles.pill, size === 'sm' && styles.small, selected && styles.selected, disabled && styles.disabled, style]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      {icon ? <Ionicons name={icon} size={14} color={selected ? Colors.textInverse : Colors.ink} /> : null}
      <Text style={[styles.text, size === 'sm' && styles.textSmall, selected && styles.textSelected]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

interface PillRowProps<T extends string> {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  getLabel?: (value: T) => string;
  getDot?: (value: T) => string | undefined;
  /** Names the group for screen readers, e.g. "Category". Each pill is labelled "Category: Tops". */
  accessibilityLabel: string;
  size?: 'md' | 'sm';
}

/** A horizontally scrolling single-choice row. */
export function PillRow<T extends string>({ options, selected, onSelect, getLabel, getDot, accessibilityLabel, size = 'md' }: PillRowProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const label = getLabel ? getLabel(option) : option;
        return (
          <Pill
            key={option}
            label={label}
            dot={getDot?.(option)}
            selected={option === selected}
            onPress={() => onSelect(option)}
            accessibilityLabel={`${accessibilityLabel}: ${label}`}
            size={size}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.lg,
    height: 38,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  small: { height: 32, paddingHorizontal: Spacing.md },
  selected: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  disabled: { opacity: 0.35 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  text: { fontFamily: Fonts.medium, fontSize: FontSize.sm, color: Colors.ink },
  textSmall: { fontSize: 12 },
  textSelected: { color: Colors.textInverse },
  row: { paddingHorizontal: Spacing.lg, gap: Spacing.sm, paddingVertical: 2 },
});
