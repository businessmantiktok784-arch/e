# Stage 6 Report — Profile, Settings, Accessibility, and App Quality

## Summary

Stage 6 adds a truthful guest Profile experience, a working locally persisted appearance preference, shared light/dark theme support, app-level safe read retry behavior, and clearer sanitized API failure messages. It retains the existing public observation, map, and community functionality. No native account system or profile data is fabricated.

## Profile and verified account capability

The current mobile client does not connect the backend WhatsApp OTP/session lifecycle to native app authentication, account profile retrieval, or sign-out. Backend auth capabilities documented in Stage 1/5 therefore do not amount to a native authenticated profile. Profile now clearly presents guest browsing, links to Settings, and reuses the existing supported WhatsApp START action. It does not show an avatar, username, history, or invented statistics.

## Settings and preferences

- System, Light, and Dark appearance choices are functional.
- The default is System. AsyncStorage stores only a versioned appearance value at `earth-talk-preferences-v1`; missing, corrupt, unknown, and unsupported-version values fall back to System.
- Preference reads do not block app startup. Storage failure does not crash the app and is reported in Settings if saving fails.
- Settings reports API configuration as present/missing without disclosing its value, shows app version, and describes location/privacy and scientific-integrity behavior.
- System font scaling remains enabled. No false offline, location, account, or server deletion setting was added.

## Accessibility, network, and performance work

- The shared palette now supports light and dark appearances across app screens and navigation, and Expo `userInterfaceStyle` is automatic.
- Tab destinations have explicit accessibility labels; existing key actions, map controls, filters, retries, images, and appearance radio choices expose roles and labels/states.
- The map keeps the Explore list alternative for observations that are difficult to access through map markers.
- Read retries are limited to one transient network/timeout/server failure. The shared API client continues to provide timeout, request cancellation, and response validation. User-facing API errors map to short safe text.
- Existing TanStack Query cache policy and virtualized lists are retained. No performance measurement was available, so no benchmark is claimed.

## Files added or changed

- `app.json`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/explore.tsx`, `app/(tabs)/map.tsx`, `app/(tabs)/community.tsx`, `app/(tabs)/profile.tsx`, `app/observations/[id].tsx`, `app/settings.tsx`, `app/+not-found.tsx`
- `theme/theme.ts`, `theme/theme-provider.tsx`, `components/Screen.tsx`, `components/AsyncState.tsx`, `components/AsyncPanel.tsx`, `components/ObservationCard.tsx`, `components/ObservationImage.tsx`, `components/WhatsAppSubmissionButton.tsx`, `features/map/ObservationMap.tsx`, `features/map/ObservationMap.native.tsx`, `features/map/ObservationMap.web.tsx`
- `utils/preferences.ts`, `utils/queryPolicy.ts`, `utils/userFacingError.ts`, `tests/settings.test.ts`
- `package.json` / lockfile (Expo-compatible AsyncStorage dependency), `README.md`, `docs/MOBILE_SETTINGS.md`, `docs/MOBILE_QUALITY_REVIEW.md`

## Validation actually executed

| Command | Result |
|---|---|
| `npm run typecheck` | Passed (`tsc --noEmit`). |
| `npm test` | Passed: 26 tests, 0 failures (API, map, community, and Stage 6 utilities). |
| `npm run check:expo` | Passed: Expo public configuration resolved with SDK 58 and automatic interface style. |
| `npx expo export --platform android --output-dir dist-stage6-check` | Passed: Metro bundled 1,313 modules and emitted Android JS bundle. |
| `npm run` | Confirmed there is no lint script. |
| Secret-pattern/config scan of mobile source/docs/config | No secret values found; matches were documentation references to auth/token concepts and contract descriptions. |

Automated tests reported Node `MODULE_TYPELESS_PACKAGE_JSON` warnings because the package does not declare module type. Expo tooling also reported Node 25 outside its declared supported Node ranges. The npm install command used for the mobile-only AsyncStorage dependency reported 27 audit advisories in the existing dependency tree; no audit fix or package upgrades were performed.

No simulator, emulator, or physical-device test was run. Expo export verifies bundling but does not verify native UI rendering, TalkBack/VoiceOver behavior, map provider runtime, or larger-text layout on device. No component-renderer test dependency is configured, so Profile/Settings interactions are not covered by rendered component tests.

## Earlier-stage issues discovered

- Stage 2 used a light-only shared palette; Stage 6 adds shared appearance selection and dark palettes.
- The existing Settings screen did not have functional preference controls; it now persists appearance safely.
- The Node native test runner could not resolve extensionless imports from the two error utilities when the new tests imported them. Explicit TypeScript `.ts` extensions fixed the issue without changing runtime API behavior.

## Scope and remaining limitations

Stage 6 changes were limited to the separate `mobile/` application and its mobile-specific documentation/configuration. No backend, database, migration, policy, or web frontend implementation was intentionally changed. The workspace has no usable Git metadata, so a Git diff/status could not independently verify this boundary; the files touched during this stage were mobile files listed above.

Native sign-in/profile management, app-specific font scaling, a reduced-motion preference, server privacy controls/deletion, and device-location features remain unsupported and are not presented as working controls. Device accessibility and runtime verification remain outstanding.

Stage 6 is complete for the supported mobile-only scope. Stage 7 is not started; the next stage requires explicit approval.
