// ============================================================
// VibeVault – Empty state
// ============================================================

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, Colors, FontSize, Spacing } from '../../constants/theme';

interface EmptyStateProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={44} color={Colors.textMuted} />
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.85} accessibilityRole="button" style={styles.actionWrap}>
          <LinearGradient colors={Colors.gradientPrimary} style={styles.action}>
            <Text style={styles.actionText}>{actionLabel}</Text>
          </LinearGradient>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: Spacing.xxxl, paddingHorizontal: Spacing.xl },
  title: { color: Colors.textSecondary, fontSize: FontSize.lg, fontWeight: '700', marginTop: Spacing.md, textAlign: 'center' },
  message: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  actionWrap: { marginTop: Spacing.lg },
  action: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.full },
  actionText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
});
