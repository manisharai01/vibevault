// ============================================================
// VibeVault – Layout primitives: page title, section header,
// card, stat, segmented control, icon button.
// ============================================================

import React from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Colors, Fonts, FontSize, Spacing, Type } from '../../constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Large editorial page title: eyebrow, serif title, optional subtitle and actions on the right. */
export function PageTitle({
  eyebrow,
  title,
  subtitle,
  right,
  onBack,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  children?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.page, { paddingTop: insets.top + (onBack ? Spacing.sm : Spacing.xl) }]}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={Colors.ink} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          {eyebrow ? <Text style={Type.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
            {title}
          </Text>
        </View>
        {right}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

/** Section header: small caps eyebrow, serif title, optional action link. */
export function SectionHeader({
  eyebrow,
  title,
  action,
  onAction,
  actionLabel,
  style,
}: {
  eyebrow?: string;
  title: string;
  action?: string;
  onAction?: () => void;
  /** Screen-reader label for the action when the visible text is short (e.g. "See all"). */
  actionLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={Type.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {action && onAction ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel ?? action} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
  tone = 'plain',
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'plain' | 'buy' | 'wait' | 'offer' | 'muted' | 'ink';
}) {
  return <View style={[styles.card, TONES[tone], style]}>{children}</View>;
}

const TONES = StyleSheet.create({
  plain: {},
  buy: { backgroundColor: Colors.buyTint, borderColor: Colors.buyTint },
  wait: { backgroundColor: Colors.waitTint, borderColor: Colors.waitTint },
  offer: { backgroundColor: Colors.offerTint, borderColor: Colors.offerTint },
  muted: { backgroundColor: Colors.surfaceMuted, borderColor: Colors.surfaceMuted },
  ink: { backgroundColor: Colors.ink, borderColor: Colors.ink },
});

export function Stat({ value, label, color, align = 'left' }: { value: string; label: string; color?: string; align?: 'left' | 'center' }) {
  return (
    <View style={[styles.stat, align === 'center' && { alignItems: 'center' }]} accessible accessibilityLabel={`${label}: ${value}`}>
      {/* Long amounts ("≈ ₹15,585") step down in size so the whole number stays visible. */}
      <Text style={[styles.statValue, value.length > 8 ? styles.statValueLong : value.length > 6 ? styles.statValueMid : null, color ? { color } : null]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export interface SegmentOption<T extends string> {
  key: T;
  label: string;
}

/** A row of tabs (one selected). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segmented, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <TouchableOpacity
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.segment, active && styles.segmentActive]}
            accessibilityRole="tab"
            aria-selected={active}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  tone = 'light',
  size = 40,
  selected,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'light' | 'dark' | 'plain';
  size?: number;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-selected={selected}
      hitSlop={6}
      style={[
        styles.iconBtn,
        { width: size, height: size, borderRadius: size / 2 },
        tone === 'light' && styles.iconLight,
        tone === 'dark' && styles.iconDark,
        style,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={tone === 'dark' ? Colors.textInverse : Colors.ink} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, backgroundColor: Colors.background },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: Spacing.sm, marginLeft: -6 },
  backText: { fontFamily: Fonts.medium, fontSize: FontSize.md, color: Colors.ink },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.md },
  titleText: { flex: 1, gap: 4 },
  title: { ...Type.display },
  subtitle: { ...Type.small, marginTop: Spacing.sm },
  section: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.md, paddingHorizontal: Spacing.lg, marginTop: Spacing.xl, marginBottom: Spacing.md },
  sectionTitle: { ...Type.title, marginTop: 2 },
  sectionAction: { fontFamily: Fonts.semibold, fontSize: FontSize.sm, color: Colors.ink, textDecorationLine: 'underline' },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg },
  stat: { flex: 1, gap: 2 },
  statValue: { fontFamily: Fonts.display, fontSize: FontSize.xxl, lineHeight: 30, color: Colors.ink },
  statValueMid: { fontSize: 21 },
  statValueLong: { fontSize: 17 },
  statLabel: { fontFamily: Fonts.medium, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 14 },
  segmented: { flexDirection: 'row', backgroundColor: Colors.surfaceMuted, borderRadius: BorderRadius.md, padding: 3, marginHorizontal: Spacing.lg },
  segment: { flex: 1, height: 38, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xs },
  segmentActive: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  segmentText: { fontFamily: Fonts.medium, fontSize: FontSize.sm, color: Colors.textSecondary },
  segmentTextActive: { fontFamily: Fonts.semibold, color: Colors.ink },
  iconBtn: { alignItems: 'center', justifyContent: 'center' },
  iconLight: { backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: Colors.border },
  iconDark: { backgroundColor: Colors.ink },
});
