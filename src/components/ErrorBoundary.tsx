// ============================================================
// VibeVault – Error boundary
// Catches render errors so a single bug can't leave a blank
// screen; offers a retry and, if needed, a data reset.
// ============================================================

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';
import { useStore } from '../store/useStore';

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[VibeVault] Unhandled render error:', error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  private resetAndRetry = () => {
    useStore.getState().resetAllData();
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.container} accessibilityRole="alert">
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>An unexpected error occurred. You can try again, or reset your saved data if the problem continues.</Text>
        <TouchableOpacity style={[styles.button, styles.primary]} onPress={this.retry} accessibilityRole="button">
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={this.resetAndRetry} accessibilityRole="button">
          <Text style={[styles.buttonText, { color: Colors.ink }]}>Reset app data</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },
  // System fonts on purpose: this screen may show before the app's fonts have loaded.
  title: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '600', marginBottom: Spacing.sm },
  message: { color: Colors.textSecondary, fontSize: FontSize.md, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl },
  button: {
    width: '100%',
    maxWidth: 320,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    marginBottom: Spacing.sm,
  },
  primary: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  buttonText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: '600' },
});
