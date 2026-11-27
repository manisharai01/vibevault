// ============================================================
// VibeVault – Small data visuals
//   MonthStrip:   how prices move through the year (12 bars).
//   ProgressRing: a circular progress figure.
//   Meter:        a thin horizontal bar.
//   Sheet:        a bottom sheet for pickers and forms.
// ============================================================

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { BorderRadius, Colors, Fonts, FontSize, Spacing, Type } from '../../constants/theme';
import { MONTHS, MONTHS_SHORT } from '../../services/buyTiming';

/**
 * One bar per calendar month: shorter = cheaper than the yearly typical price. The recommended
 * month is filled, today's month is outlined.
 */
export function MonthStrip({ months, highlight, current }: { months: (number | null)[]; highlight: number | null; current: number }) {
  const known = months.filter((m): m is number => m !== null);
  const min = Math.min(...known, 1);
  const max = Math.max(...known, 1);
  const span = Math.max(0.05, max - min);
  const cheapest = known.length ? months.indexOf(Math.min(...known)) : -1;
  const summary = months
    .map((m, i) => (m === null ? null : `${MONTHS[i]} ${Math.round((m - 1) * 100)}%`))
    .filter(Boolean)
    .join(', ');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Typical price by month compared with the yearly typical: ${summary}`}>
      <View style={styles.bars}>
        {months.map((m, i) => {
          const height = m === null ? 6 : 16 + ((m - min) / span) * 44;
          const isPick = i === highlight;
          const isLow = i === cheapest;
          return (
            <View key={i} style={styles.barCol}>
              <View
                style={[
                  styles.bar,
                  { height },
                  m === null && styles.barEmpty,
                  isLow && styles.barLow,
                  isPick && styles.barPick,
                  i === current && styles.barNow,
                ]}
              />
              <Text style={[styles.barLabel, (isPick || i === current) && styles.barLabelStrong]}>{MONTHS_SHORT[i].slice(0, 1)}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        <View style={[styles.legendSwatch, { backgroundColor: Colors.wait }]} />
        <Text style={styles.legendText}>Best month</Text>
        <View style={[styles.legendSwatch, styles.legendNow]} />
        <Text style={styles.legendText}>Now</Text>
        <Text style={[styles.legendText, { marginLeft: 'auto' }]}>Lower bar = cheaper</Text>
      </View>
    </View>
  );
}

export function ProgressRing({ progress, size = 84, stroke = 7, label, sublabel }: { progress: number; size?: number; stroke?: number; label: string; sublabel?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="progressbar" accessibilityLabel={`${label}${sublabel ? ` ${sublabel}` : ''}`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={Colors.border} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={Colors.ink}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - p)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
        <Text style={styles.ringLabel}>{label}</Text>
        {sublabel ? <Text style={styles.ringSub}>{sublabel}</Text> : null}
      </View>
    </View>
  );
}

export function Meter({ value, color = Colors.ink, label }: { value: number; color?: string; label: string }) {
  const p = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.meter} accessible accessibilityRole="progressbar" accessibilityLabel={label} aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <View style={[styles.meterFill, { width: `${p}%`, backgroundColor: color }]} />
    </View>
  );
}

export function Sheet({
  visible,
  title,
  onClose,
  closeLabel = 'Close',
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  closeLabel?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Tapping outside closes the sheet too; it isn't a separate control (the header button is). */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} focusable={false} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.lg) }]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              {title}
            </Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" hitSlop={10}>
              <Text style={styles.sheetClose}>{closeLabel}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.sheetBody} contentContainerStyle={{ paddingBottom: Spacing.md }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 80, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  bar: { width: '100%', maxWidth: 18, borderRadius: 4, backgroundColor: Colors.borderStrong },
  barEmpty: { backgroundColor: Colors.border },
  barLow: { backgroundColor: Colors.wait + '88' },
  barPick: { backgroundColor: Colors.wait },
  barNow: { borderWidth: 2, borderColor: Colors.ink },
  barLabel: { fontFamily: Fonts.medium, fontSize: 10, color: Colors.textMuted },
  barLabelStrong: { color: Colors.ink, fontFamily: Fonts.semibold },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.md },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendNow: { borderWidth: 2, borderColor: Colors.ink, backgroundColor: Colors.surface },
  legendText: { fontFamily: Fonts.regular, fontSize: 11, color: Colors.textMuted, marginRight: Spacing.sm },

  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  ringLabel: { fontFamily: Fonts.display, fontSize: FontSize.xl, color: Colors.ink },
  ringSub: { fontFamily: Fonts.medium, fontSize: 10, color: Colors.textMuted },

  meter: { height: 6, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 3 },

  backdrop: { flex: 1, backgroundColor: Colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '86%',
    paddingHorizontal: Spacing.lg,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderStrong, marginTop: Spacing.sm },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md },
  sheetTitle: { ...Type.title },
  sheetClose: { fontFamily: Fonts.semibold, fontSize: FontSize.md, color: Colors.ink, textDecorationLine: 'underline' },
  sheetBody: { flexGrow: 0 },
});
