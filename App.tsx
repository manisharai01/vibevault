// ============================================================
// VibeVault – Thrift & Deal Detective
// App entry: error boundary → safe area → saved-data hydration →
// navigation.
// ============================================================

import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { Colors, FontSize } from './src/constants/theme';
import AppNavigator from './src/navigation/AppNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import AppLifecycle from './src/components/AppLifecycle';
import ErrorBoundary from './src/components/ErrorBoundary';
import { useStore } from './src/store/useStore';

const navTheme: Theme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.primary,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.textPrimary,
    border: Colors.border,
    notification: Colors.accent,
  },
};

/** Waits for saved data to load so screens never flash default state. */
function HydrationGate({ children }: { children: React.ReactNode }) {
  const hasHydrated = useStore((s) => s.hasHydrated);
  if (!hasHydrated) {
    return (
      <View style={styles.loading} accessibilityLabel="Loading VibeVault">
        <Text style={styles.loadingTitle}>VibeVault</Text>
        <ActivityIndicator color={Colors.primaryLight} />
      </View>
    );
  }
  return <>{children}</>;
}

export default function App() {
  // Lifecycle tasks may navigate (e.g. "View" on a price-drop alert), so they
  // start only once the navigator is ready.
  const [navigationReady, setNavigationReady] = useState(false);

  return (
    <ErrorBoundary>
      <SafeAreaProvider style={styles.root}>
        <StatusBar style="light" />
        <HydrationGate>
          <NavigationContainer ref={navigationRef} theme={navTheme} onReady={() => setNavigationReady(true)}>
            {navigationReady && <AppLifecycle />}
            <AppNavigator />
          </NavigationContainer>
        </HydrationGate>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingTitle: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800' },
});
