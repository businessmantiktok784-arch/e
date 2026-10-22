# Mobile Settings

## Available controls

| Setting | Default | Persistence | Behavior |
|---|---|---|---|
| Appearance: System | System | Local device preference | Follow the operating system color scheme. |
| Appearance: Light | System | Local device preference | Use Earth Talk's light palette. |
| Appearance: Dark | System | Local device preference | Use Earth Talk's dark palette. |

Appearance is the only mutable setting currently exposed. API configuration is shown as a status, not an editable field. Privacy and accessibility sections explain current behavior; they are not represented as nonfunctional switches.

## Persistence and defaults

`utils/preferences.ts` stores `{ version: 1, theme }` in AsyncStorage at `earth-talk-preferences-v1`. Missing, corrupt, unknown, or unreadable values resolve to `system`. The provider applies defaults immediately and reads the stored preference asynchronously, so preference loading does not block app startup. If saving fails, the current process still uses the selected appearance and Settings shows a persistence warning.

This key contains no credentials, contributor tokens, profile details, or device location. Community contributor tokens remain in the existing Expo SecureStore integration; appearance preferences must never be used to store them.

## Theme behavior

`theme/theme.ts` defines shared light and dark palettes. `ThemeProvider` resolves System mode with React Native's device color scheme and provides one palette to the navigation shell and screens. Expo's `userInterfaceStyle` is `automatic`. Native map basemap appearance is selected by Apple/Google map providers and may follow device settings independently; map controls and overlays use the in-app palette.

## Accessibility

The app leaves React Native font scaling enabled. Users can change text size in system Accessibility settings. Settings explains that larger text may require additional scrolling. No app-specific text-size override or reduced-motion switch is provided. There is no decorative animation; map camera movement is native-provider behavior.

## Privacy and help

The app does not request device location. Public map locations are the values returned by the backend and may be generalized; the mobile client does not change server visibility or offer server-side deletion. The verified WhatsApp START action is available from Profile through the existing shared component. Settings shows whether the API origin is configured but does not print the configured URL.

## Adding a future setting

For non-sensitive preferences, add a validated value and safe default in `utils/preferences.ts`, keep the serialized object versioned, and expose it through `ThemeProvider` or a small preference context rather than storing duplicate screen state. Handle storage failure without blocking startup. For secrets or session material, use the approved secure authentication integration and Expo SecureStore, never AsyncStorage. Do not add a control until its behavior is implemented and verified.
