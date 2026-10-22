# Splash screen and mobile branding

## Brand assets

The repository did not contain a clear Earth Talk logo. Existing launcher art was generic blue geometric artwork, and the earlier splash asset was a grid/contour illustration. This mobile-only update replaces those images with an original geological-layer symbol made for Earth Talk: a stylized rock section with strata in forest green, clay, moss, and neutral stone. It is not presented as an externally approved corporate logo.

Generated assets live at `mobile/assets/images/`:

- `splash-icon.png` — transparent geological-layer mark for the light native splash background.
- `splash-icon-dark.png` — transparent strata mark with light earth tones for the dark appearance.
- `icon.png` — app launcher icon with forest background.
- `android-icon-foreground.png`, `android-icon-background.png`, and `android-icon-monochrome.png` — Android adaptive icon layers.
- `favicon.png` — mobile web preview icon.

`mobile/scripts/create-brand-assets.mjs` regenerates these PNG assets with Node built-ins only. It does not download or include third-party artwork. The Home screen uses the same `icon.png` and displays the in-app line **“Every rock has a story.”**

## Expo configuration

`mobile/app.json` configures the Expo SDK 58 `expo-splash-screen` plugin, using `splash-icon.png`, a 190 dp image width, `resizeMode: contain`, and `#F5F7F4` background. SDK 58's installed plugin supports the `dark` variant; it uses `splash-icon-dark.png` on `#141B17`, matching the app's dark canvas. The icon and Android adaptive layers point at the app assets above. App name, slug, scheme, version, Android package, and iOS deployment configuration were preserved. Expo SDK 58 plugin configuration was validated by `npm run check:expo` and included in the Android JavaScript export.

The light/dark native splash backgrounds match the two app canvases. The splash is allowed to finish as soon as the actual app root renders; no fake progress or arbitrary delay is added. Theme preference loads asynchronously, and the system appearance selects the native splash variant; a manually saved theme that differs from the system appearance can still transition after startup. The app has no required startup network call. No `preventAutoHideAsync` hold is added for nonessential initialization.

## Platform and verification

The splash configuration is consumed by native iOS and Android builds through Expo prebuild/config plugins. Config resolution and JS export do not prove native splash appearance, asset masking, or launch transition. No iOS/Android native build, emulator, simulator, or physical-device preview was available during this task. Splash rendering and adaptive-icon masks remain device-build verification items. No provider token is required for branding assets.
