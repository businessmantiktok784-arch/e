# Mobile API gaps and deferred integration

This report reflects source inspection for Stage 3. No backend changes were made or requested as part of this stage.

## Current mobile capabilities

- Public observation listing, server-side search/category filters, pagination, detail and primary public still are available through existing endpoints.
- Public category totals, public community-site listings and public observation GeoJSON are available and consumed by the mobile app.
- These endpoints are public read surfaces and do not require the mobile app to sign in. This does not grant permission to access private or moderation-protected routes.

## Unsupported or incomplete capabilities

### Direct photo submission and AI analysis — backend/API gap

The inspected intake flow is the existing WhatsApp webhook and its server-side analysis pipeline. No mobile-facing API was found that accepts a new observation plus image/location and returns the existing analysis. The mobile app links to the WhatsApp `START` flow; direct camera submission remains unavailable. Any dedicated upload/analyze endpoint would require a separately approved backend design and security review.

### WhatsApp recipient availability — deployment configuration

The web client reads optional `VITE_WHATSAPP_NUMBER` and has a generic WhatsApp picker fallback when unset. A setting is present in a project environment file, but its value was not read or copied into mobile source or docs. Mobile supports optional `EXPO_PUBLIC_WHATSAPP_NUMBER`; operators must supply the approved public contact via local/build environment. Without it, the same generic picker opens and the user must choose the appropriate Earth Talk chat. No contact number is hard-coded.

### Native authentication and session — historical Stage 3 mobile integration gap

The backend has WhatsApp OTP request/verification endpoints and issues bearer sessions. Mobile does not yet implement OTP, secure credential storage, token refresh/revocation, or profile retrieval. Public browsing works anonymously; protected commenting, posting, voting, visit creation, and user-specific profile features remain unavailable in mobile until the native auth lifecycle is implemented and verified. Do not bypass authorization.

### Community interactions — API and authentication integration gap

Mobile reads published community sites. Backend routes exist for richer features such as site visits, comments, evidence, and investigations, but they have their own contracts, privacy/access rules, and some write authorization requirements. Stage 3 does not call community write routes or create interaction controls. The current Community tab shows actual public sites and does not imply votes, comments, community consensus, or scientific validity.

### Media gallery/video — API presentation gap

Public observation list DTOs do not expose image URLs. Public detail can expose one primary still and media counts. This stage renders that single HTTP(S) image when available and a placeholder otherwise. It does not fetch private storage objects, render an unverified gallery, or play videos. A verified media list endpoint and explicit Expo media handling policy would be required for a full gallery/video experience.

### GIS and native map details

- **Public map data exists:** `GET /api/public/observations.geojson` returns privacy-resolved GeoJSON Point features. It supports the existing public `search`, `category`, and `bbox` filters. The Stage 4 native map consumes `search` and `category`; camera panning does not trigger a geographic viewport query.
- **Unlocated/private records:** The public map repository omits a record if its public location resolver has no safe coordinate. Such observations can remain visible through the public Explore list. This is an existing privacy behavior, not a mobile map defect.
- **Precision disclosure:** The GeoJSON feature properties do not include per-feature location precision. The backend resolves district points to representative district centers and approximate points to generalized coordinates; exact coordinates are only returned after the public-view consent gate. Mobile cannot label an individual point as exact, approximate, or district-level and therefore warns that points may be generalized.
- **Pagination and scaling:** GeoJSON has no pagination and currently returns all eligible filtered points in one FeatureCollection. Mobile clusters returned points client-side, but still receives/parses the full response. A viewport/bbox request could reduce transfers, but mobile currently does not send one; large result sets should be measured before broader deployment. Server clustering does not exist.
- **Spatial search:** No radius/nearby map search is integrated. Observation-specific nearby routes exist, but they are not a general current-map viewport API. No device location is requested.
- **Native renderer configuration:** Stage 4 adds Expo Maps. It uses Apple Maps on iOS and Google Maps on Android; Android requires an appropriately restricted Google Maps SDK key and a rebuilt native app. These are mobile configuration/build requirements rather than backend API gaps. See `MOBILE_GIS.md`.
- **Map styling/provider:** The web MapLibre style is browser-only and is not reused. Expo Maps uses the platform providers' native basemaps; no custom tile style, offline map data, or provider-independent geology base layer is configured.

### Educational content, notifications, messaging — out of initial mobile scope

No standalone general educational catalogue or mobile notification/messaging integration is connected. Public intelligence/context routes exist for certain geoscience context, but they are not required for this observation-browsing stage. No push service or mobile subscription route was identified for Stage 3 integration.

## Future backend work, only with separate approval

Potential future work could define a secure mobile observation-create/upload/analysis flow, a public media gallery contract with authorization/expiry semantics, and authentication-safe write contracts. None is required to use the current public read APIs. Any proposed schema, route, policy, webhook, or AI pipeline changes must be separately authorized and must preserve existing Earth Talk workflows.

## Stage 5 community integration status

### Supported by existing backend and now implemented in mobile

- Open investigation read and fixed-choice community voting use `GET /api/community/investigations` and `POST /api/community/investigations/:publicId/vote`. Voting requires a pseudonymous contributor token, which the backend already issues. Mobile requests it on first write and persists it through Expo SecureStore. The response is authoritative; mobile refetches vote data after success.
- Public site visit history and user-confirmed visit creation use `GET` and `POST /api/community/sites/:siteId/visits`. The mobile action sends a date and contributor token only; it does not send device coordinates.
- Public comment reads use `GET /api/posts/:passportId/comments` in observation detail. The app renders the public author alias and visible comment fields returned by the server.
- Recent public observations and published public sites are reused as community discovery data. There is no custom activity feed.
- The site-visit write contract has no idempotency key. Mobile does not automatically retry POST requests; a manual retry after an ambiguous timeout could still duplicate a server-committed visit.

### Existing backend capabilities not implemented in mobile

- Comment creation exists but requires a WhatsApp Bearer session through `requireUser`. Native OTP, token refresh/revocation, and secure account-session handling are not wired in mobile, so comment writing remains unavailable. This is an authentication integration gap, not a missing backend route.
- Questions/answers, investigation detail/edit/open, free-text voting, checklist toggles, evidence submission/media, reports, reputation, site explorer/timeline, and moderation routes exist. Stage 5 does not expose these operations; their route semantics, authentication, media flow, validation, and UX were not integrated here.
- Investigation records without fixed choices are shown without a mobile voting control even though the backend accepts free-text options; a safe mobile entry flow for that contract remains unimplemented.

### No backend change required for current Stage 5

The implemented reads and anonymous votes/visits are covered by the existing APIs. The next needed work for account-only comments is mobile authentication integration against existing endpoints; separately approved backend changes are not currently required. Direct image submission and AI analysis remain the earlier documented gap. The optional WhatsApp recipient remains deployment configuration, and a blank recipient uses the existing generic picker; the app does not claim that a user joined or submitted anything through WhatsApp.

## Current master-integration status (supersedes earlier stage snapshots above)

This addendum records the current mobile source after the master integration work. Earlier stage paragraphs are retained as historical records and may describe capabilities as unavailable at the time they were written.

- **Now integrated:** WhatsApp OTP request/verify, secure bearer-session persistence, session restore, server sign-out, display-name update, and authenticated comment creation. These use existing `/api/auth/*` and `POST /api/posts/:passportId/comments` routes; no backend change was made.
- **Still not integrated:** authenticated comment replies, avatar upload/removal, user post edits/privacy, question/answer/evidence/report/moderation routes, and authenticated media attachment to an existing post.
- **Backend/API gap:** no existing API accepts a new mobile observation image and invokes the shared Gemini intake/persistence workflow. The owner-only `/api/posts/:passportId/media` route adds media to an already-created post and does not start analysis. Do not use it as a substitute for native submission.
- **Runtime verification:** auth contracts have automated mocked tests. No live OTP delivery, backend session, SecureStore device behavior, or comment write was executed in this environment.

See `SHARED_PLATFORM_ARCHITECTURE.md` for the explicitly proposed, not implemented, minimum mobile intake capability.
