// ============================================================
// VibeVault – Empty state
// ============================================================

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, Type } from '../../constants/theme';
import Button from '../ui/Button';

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
      <View style={styles.icon}>
        <Ionicons name={icon} size={26} color={Colors.ink} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: Spacing.xxxl, paddingHorizontal: Spacing.xl },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: { ...Type.title, marginTop: Spacing.lg, textAlign: 'center' },
  message: { ...Type.small, marginTop: Spacing.sm, textAlign: 'center', maxWidth: 320 },
  action: { marginTop: Spacing.xl },
});
