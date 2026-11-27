// ============================================================
// VibeVault – Thrift & Deal Detective
// App entry: error boundary → safe area → fonts + saved data →
// navigation.
// ============================================================

import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DefaultTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
  useFonts,
} from '@expo-google-fonts/instrument-sans';
import { Colors } from './src/constants/theme';
import AppNavigator from './src/navigation/AppNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import AppLifecycle from './src/components/AppLifecycle';
import ErrorBoundary from './src/components/ErrorBoundary';
import { useStore } from './src/store/useStore';

const navTheme: Theme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.ink,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.textPrimary,
    border: Colors.border,
    notification: Colors.offer,
  },
};

/** Waits for the fonts and saved data so screens never flash default state. */
function ReadyGate({ children }: { children: React.ReactNode }) {
  const hasHydrated = useStore((s) => s.hasHydrated);
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  });
  // A font that fails to load falls back to the system font rather than blocking the app.
  if (!hasHydrated || (!fontsLoaded && !fontError)) {
    return (
      <View style={styles.loading} accessibilityLabel="Loading VibeVault">
        <Text style={styles.loadingTitle}>VibeVault</Text>
        <ActivityIndicator color={Colors.ink} />
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
        <StatusBar style="dark" />
        <ReadyGate>
          <NavigationContainer ref={navigationRef} theme={navTheme} onReady={() => setNavigationReady(true)}>
            {navigationReady && <AppLifecycle />}
            <AppNavigator />
          </NavigationContainer>
        </ReadyGate>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingTitle: { color: Colors.textPrimary, fontSize: 34, letterSpacing: -0.5 },
});
