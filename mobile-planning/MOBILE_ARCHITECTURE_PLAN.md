# Mobile architecture plan

## Recommendation

Create a separate Expo + React Native + TypeScript project (for example `mobile/`) after Stage 1 approval. Keep the current web app and Express API independent. Use **Expo Router** for file-based navigation because it is maintained within the Expo workflow and fits a standalone Expo app; React Navigation remains its navigation foundation. Do not import browser components, MapLibre GL JS, localStorage code, or DOM utilities.

## Structure

```text
mobile/
  app/                  # Expo Router layouts and route screens
  src/
    components/         # Native buttons, cards, status, form primitives
    features/           # explore, observations, map, community, account
    api/                # typed fetch client and endpoint modules
    domain/             # DTO types, parsers, formatting and policies
    auth/               # session state and secure token storage
    hooks/              # query and permission hooks
    state/              # small app-level state only
    config/             # public runtime config and validation
    theme/              # tokens, typography, spacing
  assets/
```

Use strict TypeScript, API DTOs that match inspected server shapes, and map server DTOs to view models at feature boundaries. Share pure validation/formatting only if moved into a future platform-neutral package with no Node, browser, React DOM, or server-secret imports. Do not couple mobile API transport to UI.

## Navigation and screens

Bottom tabs: **Explore**, **Map**, **Community**, **My Earth Talk**. Place a prominent “Submit observation” action from Explore/Map, but Stage 1 cannot define a working in-app analysis submission because no compatible API exists; initially link to the established WhatsApp flow or keep capture disabled until an approved backend contract exists. Avoid an unsupported notification tab.

| Screen | Purpose/data/actions | Permission and states |
|---|---|---|
| Explore | Public stats and paginated observation feed/filter; APIs `/stats`, `/observations` | No device permission; loading, empty, retry, offline. |
| Observation detail | Public/post DTO, interpretation uncertainty, media availability, comments, related/context | Sign-in required for comment/edit; empty media and error states. |
| Map | Public observation and geological site GeoJSON; filters/bbox, selected feature detail | Location permission only for “center on me”; gracefully start Rwanda/default extent if denied. |
| Community | Sites, investigations, questions, evidence, visits, voting/checklist | Pseudonymous token for contribution; show validation/rate limit and 503 states. |
| Sign-in | WhatsApp number, OTP verify, session state | Secure token store; invalid/expired/rate-limit/delivery failures. |
| My Earth Talk | Profile, own observations/questions, avatar, sign-out | Bearer session; signed-out empty CTA, offline/retry. |
| Capture handoff | Explain WhatsApp submission pathway until direct API approved | Camera/photos/location permission must only be requested after consent and only when submission is truly supported. |

## API, auth, configuration, and state

Build one fetch client around `EXPO_PUBLIC_API_BASE_URL`, JSON/error parsing for both legacy bare and nested error formats, request IDs, timeout/AbortSignal, and safe GET retry policy. Endpoint modules should preserve exact snake_case names. API origin is environment-specific: local simulator/emulator/LAN for development and stable HTTPS production hostname; no permanent tunnel.

Use `expo-secure-store` for bearer and contributor tokens, with clear logout and account-state refresh. The contributor token is pseudonymous, distinct from bearer auth. No Supabase client is needed; existing server architecture owns the service key and data access. Use TanStack Query (or equivalent modest query/cache layer) for server state, pagination, invalidation and offline stale reads; Context/Zustand only for small auth/filter state. Avoid duplicating server records into broad global state.

Use Expo ImagePicker/Camera for future capture, with native permission prompts and compression/format inspection; do not wire upload until backend gap is resolved. Current server media limit/defaults and supported formats are not a guarantee of a mobile intake endpoint.

## Mapping and UI

Web MapLibre GL JS component is browser-only. Assess `@maplibre/maplibre-react-native` for a native build/custom dev client and compatible style source; Expo Go/native binary support and licensing/provider terms must be verified at implementation time. A React Native alternative such as `react-native-maps` may be operationally simpler but would require adapting styles/layers. The backend GeoJSON contracts are reusable regardless of map renderer. Verify tile/style URLs, attribution, offline behavior, clustering, and licensing before selecting final package. Native map controls/markers/cards must be built separately.

Implement reusable native forms, observation/status cards, uncertainty panel, media gallery, empty/error/loading states, permission rationale, and retry controls. Keep accessibility labels, large text, low bandwidth image handling, and no-network fallback in acceptance scope.

## Testing strategy (future)

Unit-test parsers/formatters/privacy presentation and API error decoding; component-test loading/error/empty/auth gating; integration-test against an isolated existing API with fixtures; device test Android/iOS for token persistence, picker/camera/location permission, uploads when supported, map camera/markers, poor network and TLS. Test every auth/authorization path against API. Inspect release bundle/configuration for forbidden secrets. No tests were run during this audit.
