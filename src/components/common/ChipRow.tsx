// ============================================================
// VibeVault – Horizontal row of single-select filter chips
// ============================================================

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { BorderRadius, Colors, FontSize, Spacing } from '../../constants/theme';

interface ChipRowProps<T extends string> {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  getLabel?: (value: T) => string;
  /** Describes the row for screen readers, e.g. "Platform filter". */
  accessibilityLabel?: string;
  compact?: boolean;
}

export default function ChipRow<T extends string>({
  options,
  selected,
  onSelect,
  getLabel,
  accessibilityLabel,
  compact,
}: ChipRowProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={accessibilityLabel}
      keyboardShouldPersistTaps="handled"
    >
      {options.map((option) => {
        const active = option === selected;
        return (
          <TouchableOpacity
            key={option}
            style={[styles.chip, compact && styles.chipCompact, active && styles.chipActive]}
            onPress={() => onSelect(option)}
            accessibilityRole="button"
            aria-selected={active}
            accessibilityLabel={accessibilityLabel ? `${accessibilityLabel}: ${getLabel ? getLabel(option) : option}` : undefined}
          >
            <Text style={[styles.text, active && styles.textActive]}>{getLabel ? getLabel(option) : option}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs, gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipCompact: { paddingHorizontal: Spacing.md, paddingVertical: 6 },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  text: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
  textActive: { color: '#FFF' },
});
