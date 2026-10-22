import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useAppTheme } from '../theme/theme-provider';
import { shouldRetryRead } from '../utils/queryPolicy';
import { AuthProvider } from '../auth/AuthProvider';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: shouldRetryRead, refetchOnWindowFocus: false } },
  }));
  return <SafeAreaProvider><ThemeProvider><QueryClientProvider client={queryClient}><AuthProvider><AppShell /></AuthProvider></QueryClientProvider></ThemeProvider></SafeAreaProvider>;
}

function AppShell() {
  const { colors, isDark } = useAppTheme();
  return <><StatusBar style={isDark ? 'light' : 'dark'} /><Stack screenOptions={{ headerTintColor: colors.forest, headerTitleStyle: { color: colors.ink }, headerStyle: { backgroundColor: colors.canvas }, contentStyle: { backgroundColor: colors.canvas } }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="observations/[id]" options={{ title: 'Observation', headerBackTitle: 'Back' }} />
    <Stack.Screen name="settings" options={{ title: 'Settings' }} />
  </Stack></>;
}
