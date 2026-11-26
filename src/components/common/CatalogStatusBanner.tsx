// ============================================================
// VibeVault – Live-price status line / empty states
// Tells the user where prices come from and how fresh they are.
// ============================================================

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useShallow } from 'zustand/react/shallow';
import { BorderRadius, Colors, FontSize, Spacing } from '../../constants/theme';
import { useStore } from '../../store/useStore';
import { formatRelativeTime } from '../../utils/format';
import EmptyState from './EmptyState';

interface Props {
  /** Size of the whole live catalogue (not a filtered subset); 0 shows the full-screen states. */
  itemCount: number;
  onRetry: () => void;
}

/** Full-screen state when there is nothing to show yet; otherwise a one-line freshness note. */
export default function CatalogStatusBanner({ itemCount, onRetry }: Props) {
  const { status, error, fetchedAt, updatedAt } = useStore(
    useShallow((s) => ({
      status: s.catalogStatus,
      error: s.catalogError,
      fetchedAt: s.catalogFetchedAt,
      updatedAt: s.catalogUpdatedAt,
    })),
  );

  if (status === 'unconfigured') {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="Live prices aren’t connected"
        message="This build has no VibeVault server configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see README) and rebuild."
      />
    );
  }

  if (itemCount === 0) {
    if (status === 'idle' || status === 'loading') {
      return (
        <View style={styles.loading} accessibilityLabel="Loading live prices">
          <ActivityIndicator color={Colors.primaryLight} />
          <Text style={styles.loadingText}>Loading live marketplace prices…</Text>
        </View>
      );
    }
    if (status === 'error') {
      return (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn’t load live prices"
          message={error ?? 'Check your internet connection and try again.'}
          actionLabel="Try again"
          onAction={onRetry}
        />
      );
    }
    // Connected, but the server hasn't collected any listings yet.
    return (
      <EmptyState
        icon="hourglass-outline"
        title="No live listings yet"
        message="The VibeVault server hasn’t collected any marketplace listings yet. Listings refresh daily — check back soon."
        actionLabel="Refresh"
        onAction={onRetry}
      />
    );
  }

  if (status === 'error') {
    return (
      <TouchableOpacity style={[styles.line, styles.lineWarn]} onPress={onRetry} accessibilityRole="button">
        <Ionicons name="cloud-offline-outline" size={14} color={Colors.warning} />
        <Text style={[styles.lineText, { color: Colors.warning }]} numberOfLines={2}>
          Offline — showing prices saved {formatRelativeTime(fetchedAt)}. Tap to retry.
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.line} accessibilityLabel={`Live prices, updated ${formatRelativeTime(updatedAt ?? fetchedAt)}`}>
      {status === 'loading' ? (
        <ActivityIndicator size="small" color={Colors.success} />
      ) : (
        <View style={styles.liveDot} />
      )}
      <Text style={styles.lineText}>
        Live prices from Flipkart & eBay · updated {formatRelativeTime(updatedAt ?? fetchedAt)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', paddingVertical: Spacing.xxxl, gap: Spacing.md },
  loadingText: { color: Colors.textSecondary, fontSize: FontSize.md },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    alignSelf: 'flex-start',
  },
  lineWarn: { backgroundColor: Colors.warning + '1A' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  lineText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600', flexShrink: 1 },
});
