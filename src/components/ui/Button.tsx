// ============================================================
// VibeVault – Buttons
// primary: ink fill · secondary: outlined · ghost: text only ·
// danger: for destructive actions.
// ============================================================

import React from 'react';
import { ActivityIndicator, AccessibilityRole, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BorderRadius, Colors, Fonts, FontSize, Spacing } from '../../constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'lg' | 'md' | 'sm';
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT = { lg: 54, md: 46, sm: 36 };
const PADDING = { lg: Spacing.xl, md: Spacing.lg, sm: Spacing.md };
const TEXT = { lg: FontSize.md, md: FontSize.md, sm: FontSize.sm };

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  disabled,
  loading,
  fullWidth,
  accessibilityLabel,
  accessibilityRole = 'button',
  selected,
  style,
}: ButtonProps) {
  const palette = PALETTES[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      aria-disabled={disabled || loading}
      aria-selected={selected}
      style={[
        styles.base,
        { height: HEIGHT[size], paddingHorizontal: variant === 'ghost' ? Spacing.xs : PADDING[size] },
        palette.container,
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.text.color} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 15 : 18} color={palette.text.color} /> : null}
          <Text style={[styles.text, { fontSize: TEXT[size] }, palette.text, variant === 'ghost' && styles.ghostText]} numberOfLines={1}>
            {label}
          </Text>
          {iconRight ? <Ionicons name={iconRight} size={size === 'sm' ? 15 : 18} color={palette.text.color} /> : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

const PALETTES = {
  primary: StyleSheet.create({ container: { backgroundColor: Colors.ink }, text: { color: Colors.textInverse } }),
  secondary: StyleSheet.create({
    container: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderStrong },
    text: { color: Colors.ink },
  }),
  ghost: StyleSheet.create({ container: { backgroundColor: 'transparent' }, text: { color: Colors.ink } }),
  danger: StyleSheet.create({ container: { backgroundColor: Colors.errorTint }, text: { color: Colors.error } }),
};

const styles = StyleSheet.create({
  base: { borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  fullWidth: { alignSelf: 'stretch' },
  disabled: { opacity: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  text: { fontFamily: Fonts.semibold },
  ghostText: { textDecorationLine: 'underline' },
});
