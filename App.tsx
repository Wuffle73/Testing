import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';

import { RootNavigator } from './src/navigation/RootNavigator';
import { initDatabase } from './src/db/database';
import { colors, spacing, fontSize } from './src/theme/theme';

type InitState = 'loading' | 'ready' | 'error';

export default function App() {
  const [state, setState] = useState<InitState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await initDatabase();
        if (active) setState('ready');
      } catch (err) {
        if (active) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
          setState('error');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (state === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Setting up local database…</Text>
        <StatusBar style="dark" />
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Couldn't start the app</Text>
        <Text style={styles.errorBody}>{errorMessage}</Text>
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.md,
  },
  loadingText: { color: colors.textMuted, fontSize: fontSize.sm },
  errorTitle: { color: colors.danger, fontSize: fontSize.lg, fontWeight: '700' },
  errorBody: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center' },
});
