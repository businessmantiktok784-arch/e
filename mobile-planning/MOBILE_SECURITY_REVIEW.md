# Mobile security and data protection review

## Credentials and trust boundaries

`src/config/supabase.ts` creates a backend-only Supabase client with `SUPABASE_SECRET_KEY`; its source comment explicitly says never expose it to clients. Environment config also identifies Gemini API key, WhatsApp access/app/verify tokens, database/user-hash secrets, admin credentials/session secret, anonymous contributor secret, and auth session secret as server-side. The mobile bundle must contain none of these. No client-safe Supabase anon key or client RLS setup is established in this project; the recommended mobile architecture uses the existing API only. A public Supabase URL is not itself a credential, but direct Supabase access is not recommended absent reviewed anon-key/RLS policy and explicit architecture approval.

Never copy `.env` into a mobile folder or report values. Use only public `EXPO_PUBLIC_API_BASE_URL`; Expo embeds `EXPO_PUBLIC_*` at build time, so it must contain no secret. `VITE_API_BASE_URL` is the current web-only base config.

## Authentication and authorization

User auth is WhatsApp OTP implemented in `src/services/auth.service.ts` and `src/utils/user-auth.ts`; opaque bearer tokens are issued once and stored server-side as hashes with expiry/revocation. Code hashes, expiry, attempt count, phone/IP keyed limits, and single-use consumption are enforced server-side. The mobile client should store bearer tokens in platform secure storage, send `Authorization: Bearer`, clear local state on expiry/sign-out, and never log token/phone/code. Existing browser session storage implementation is not safe to transplant blindly. `requireUser`, `attachViewer`, and service-level owner checks guard protected writes. Community discovery has a separate pseudonymous contributor token (`X-Contributor-Token`), not an authenticated account; retain it securely and do not treat it as proof of account ownership. Admin/expert credentials are a separate privileged flow and should not ship in initial mobile app.

## Location and consent

Raw observation coordinates are held in protected database structures. Public serializers use `src/utils/public-location.ts`, public views, and consent/precision policy. Post location supports private/exact/approximate/district. `exact` requires explicit consent in server workflow; approximate coordinates are rounded/generalized and district uses representative coordinates. Public site GeoJSON omits sites without authorized coordinates. Native UI must request device location only after a clear user action, allow denial/manual/no location, explain visibility before submitting, preserve chosen precision, and render the returned precision/privacy note rather than device GPS precision. Do not assume the backend has an app-specific capture endpoint to submit coordinates.

## Uploads, content, and privacy

WhatsApp media is identified by magic bytes and limited by `MAX_IMAGE_SIZE_BYTES` (default 10 MB) in `src/utils/image-validator.ts`; JPEG/PNG/WebP/HEIC/HEIF images and MP4/3GPP video are handled. This validation is inside the WhatsApp ingestion path and does not prove there is a mobile analysis API. Community media uses JSON data URLs with server validation and stored-size constraints; post media similarly has a distinct JSON contract. Use server upload paths only; do not use direct privileged Supabase storage. Preserve `allow_download`, moderation, visibility, and owner checks. `PublicMediaItem.url` can be null with `available=false`; avoid leaking source metadata/coordinates through thumbnails or EXIF. Strip EXIF location on client where possible, but server remains authoritative.

User text is validated and length-limited in services (community max text, comment limits, abuse report rules); the server applies rate limits and duplicate/report safeguards. Never rely on client-only validation. Server errors are generally sanitized (`{error}` or `{error:{code,message}}`); request IDs are returned for support. Avoid sending full server error internals to telemetry.

## CORS, transport, and risks

The Express CORS allowlist is configured for browser origins and allows credentials; native requests are not governed by browser CORS but require network reachability and HTTPS in production. Development LAN IP or emulator host alias must not become a production URL. Store tokens in secure storage, use HTTPS, scrub logs/analytics, and disable accidental request-body logging for OTP and profile/media payloads.

Static code review confirms protections are present, but does not establish live database RLS correctness, production secret values, key rotation, deployment TLS, real storage availability, privacy notices/consent UX, or end-to-end authorization for every branch. Audit those in a separately scoped pre-release security review. Existing migrations enable RLS on tables, but backend service-role access bypasses RLS by design; the API's application checks remain critical.
