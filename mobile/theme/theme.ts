export type ThemeMode = 'system' | 'light' | 'dark';
export interface Palette {
  forest: string; forestDark: string; moss: string; earth: string; ink: string; muted: string;
  line: string; canvas: string; surface: string; warning: string; warningBg: string; error: string; errorBg: string;
}
export const lightColors: Palette = {
  forest: '#205B46', forestDark: '#174634', moss: '#E7F0E8', earth: '#A56A3B',
  ink: '#202923', muted: '#69736D', line: '#E2E8E3', canvas: '#F5F7F4', surface: '#FFFFFF',
  warning: '#8B5D18', warningBg: '#FBF2E0', error: '#9D3D35', errorBg: '#FBECE9',
};
export const darkColors: Palette = {
  forest: '#91C8A8', forestDark: '#B7DCC5', moss: '#263A30', earth: '#D6A476',
  ink: '#F0F4F0', muted: '#B0BDB4', line: '#39473D', canvas: '#141B17', surface: '#202923',
  warning: '#E3BB73', warningBg: '#3A3020', error: '#F0A39B', errorBg: '#3A2524',
};
/** Backward-compatible light palette for non-screen utilities. Use useAppTheme for UI. */
export const colors = lightColors;
export const spacing = { xs: 6, sm: 10, md: 16, lg: 22, xl: 30, xxl: 40 } as const;
