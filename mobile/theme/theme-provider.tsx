import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type Palette, type ThemeMode } from './theme';
import { loadThemePreference, saveThemePreference } from '../utils/preferences';

interface ThemeContextValue { mode: ThemeMode; isDark: boolean; colors: Palette; persistenceError: boolean; setMode: (mode: ThemeMode) => void }
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [persistenceError, setPersistenceError] = useState(false);
  const systemScheme = useColorScheme();
  const changedBeforeLoad = useRef(false);

  useEffect(() => {
    let active = true;
    void loadThemePreference(AsyncStorage).then((stored) => {
      if (active && !changedBeforeLoad.current) setModeState(stored);
    });
    return () => { active = false; };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    changedBeforeLoad.current = true;
    setModeState(next);
    setPersistenceError(false);
    void saveThemePreference(AsyncStorage, next).catch(() => setPersistenceError(true));
  }, []);
  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const colors = isDark ? darkColors : lightColors;
  const value = useMemo(() => ({ mode, isDark, colors, persistenceError, setMode }), [mode, isDark, colors, persistenceError, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside ThemeProvider.');
  return value;
}
