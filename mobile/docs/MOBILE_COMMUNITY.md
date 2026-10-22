# Mobile community experience

## Screen structure and data

The Community tab contains three live sections powered by the existing API:

- **Open investigations:** `GET /api/community/investigations?status=open&limit=50&offset=0`. It shows each returned question, labelled demo status, and the exact fixed answer choices plus server-returned vote tallies. A user can vote only for those choices.
- **Recent observations:** the existing public observation feed (`GET /api/public/observations?page=1&limit=5`). Cards use the established observation card and route, keyed by the real `passport_id`.
- **Field sites:** `GET /api/community/sites?limit=50`. Expanding a site loads its public visit rows and offers an explicitly confirmed “I visited this site today” write action. It submits only the local calendar date; the app does not collect location, notes, or media for this action.

Pull-to-refresh refetches the three section queries. Each section handles loading, empty, error/retry, and stale-data refresh states independently. Expanded visits are loaded on demand and cached by site ID. Votes and visits invalidate the relevant TanStack Query cache after the server confirms the write. Per-record action locks and disabled pending controls reduce duplicate taps; the API remains authoritative for its own duplicate-vote policy and rate limits.

## Comments and authentication

Observation detail reads visible public comments from `GET /api/posts/:passportId/comments`, including nested replies and only the public author fields returned by the server. No comment creation is offered. The verified POST route requires an existing WhatsApp Bearer session, while the mobile app does not implement OTP, session persistence, refresh, or logout. Detail explains this limitation rather than presenting a nonfunctional composer.

Anonymous community writes use the backend's `POST /api/community/contributor-token` response and `X-Contributor-Token` header. The returned token is a bearer credential despite carrying no personal information. It is stored in Expo SecureStore (native keychain/keystore), not logs, AsyncStorage, or source configuration. If token creation or secure persistence fails, a write fails visibly and no local success is claimed. On web, secure native storage is not a supported participation path.

## Visits, votes, and scientific labels

Site visit records show only `visited_on`, server-provided pseudonymous `contributor_handle`, and optional server-provided note. The visit action is not presented as independent scientific evidence. Voting options and tallies are rendered from the backend response, and updated totals are fetched from the server after a successful vote. No votes or participation counts are synthesized.

The UI explicitly says community votes represent opinion, not scientific confirmation. It does not use a vote total as an accuracy score or promote an evidence status. Investigation statuses and disclaimers are read from the returned record; no status is inferred from activity.

## WhatsApp participation

The existing `WhatsAppSubmissionButton` opens Earth Talk's established `START` deep link through React Native Linking and sends no message automatically. Its recipient is optional environment configuration `EXPO_PUBLIC_WHATSAPP_NUMBER`, synchronized operationally from the approved web public recipient; no number is embedded here. When unset, the project’s existing generic WhatsApp picker behavior remains. The CTA is transparent that direct photo upload and AI analysis are not performed by the mobile app.

## Limitations

- There is no dedicated community activity feed; open investigations, recent public observations, and public sites/visits are used as real supported data.
- Comment writes require native integration with the existing WhatsApp OTP session system.
- Questions, answers, evidence attachments, checklist actions, reports, reputation, and moderation are not integrated by this stage even where backend routes exist.
- Fixed-choice voting is supported. The API also permits free-text votes for investigations with no fixed options; the mobile UI intentionally does not invent a voting input for those records.
- WhatsApp contact is not verified at runtime by the app. Operators must provide the approved public number or accept the generic picker fallback.
- Device-level WhatsApp and native SecureStore behavior require a development build and were not tested in this environment.
