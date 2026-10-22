# Stage 1 findings and next actions

## Confirmed findings

1. The repository provides public exploration, paginated observations, observation details and GeoJSON, plus public community sites/investigations/evidence/questions/visits and authenticated post discussions/profile history.
2. WhatsApp OTP bearer sessions and a separate pseudonymous community contributor token already support native clients through HTTP; neither is Supabase Auth.
3. Existing Gemini analysis is server-side and initiated from the WhatsApp inbound media/webhook workflow. **No mobile observation create/upload/analyze endpoint was found.** Direct in-app AI submission is therefore not presently integratable within the user’s no-backend-change restriction.
4. The current map is MapLibre GL JS and must be replaced with a native renderer/UI. Backend GeoJSON is portable.
5. Supabase is accessed by server code with a secret service key; mobile should call the API and must not contain that key or Gemini/WhatsApp/admin secrets.
6. Some observation media can have no retrievable URL; runtime DB readiness, deployment behavior, tiles, and real auth/storage operation were not established by static review.

## Compatibility matrix

| Capability | Class | Evidence / next action |
|---|---|---|
| Public observation list, detail, stats, filters | READY + FRONTEND WORK REQUIRED | `/api/public/*` routes and serializers exist; implement typed native client and verify against configured API. |
| Public observation/site map data | READY + FRONTEND WORK REQUIRED | GeoJSON endpoints exist; choose native renderer and verify style/tile configuration. |
| AI result reading/scientific uncertainty | READY + FRONTEND WORK REQUIRED | Post/public DTO includes confidence, alternatives, limitations, next steps and disclaimer. |
| Direct capture -> image upload -> AI analysis | BACKEND GAP | No matching route; current pipeline begins at WhatsApp webhook. Next action: approve a separately scoped backend/API design before native capture implementation. |
| Media galleries | VERIFY | DTO supports unavailable media; check real storage availability on intended deployment before promising playback. |
| WhatsApp login/session/profile | READY + FRONTEND WORK REQUIRED | `/api/auth/*`; build secure storage and exercise lifecycle with actual configured database/WhatsApp delivery. |
| Comments, own posts/questions | READY + FRONTEND WORK REQUIRED | `/api/posts/*`, `/api/me/*`; implement bearer token and honor owner/session gates. |
| Community sites, investigations, votes, checklist, evidence, Q&A, visits | READY + FRONTEND WORK REQUIRED | `/api/community/*`; implement pseudonymous token and API validation handling. |
| Saved/bookmarked observations | BACKEND GAP or OUT OF SCOPE | Browser history is local; no server saved-observation API identified. Keep local history only or omit in initial release. |
| In-app notifications | OUT OF SCOPE | No notification API identified; WhatsApp is existing external messaging path. |
| Admin, expert, research, validation | OUT OF SCOPE for first mobile release | Existing privileged APIs/web dashboards exist; maintain web workflows. |
| Direct mobile Supabase access | OUT OF SCOPE | No client-safe anon/RLS architecture established; use existing API. |

## Unresolved verification questions

- Which stable HTTPS API origin and deployment are intended for mobile, and is it reachable from test devices?
- Is the production database configured and durable for all community/auth features? Are migrations applied?
- Are observation media bytes actually persisted and served, or only metadata, for the target deployment?
- What public map style/tile provider, attribution, terms, and offline constraints are approved?
- Is direct in-app submission desired in a later stage? If yes, it requires separately approved backend design, validation/security review, and API contract.
- Which initial mobile platform(s), language requirements, and release audience are expected?

## Recommended next step

Approve Stage 2 as **Expo foundation plus read-only public Explore, observation detail, and API reachability**, retaining WhatsApp as the observation submission path. Before any capture UI is connected to analysis, make a separate explicit decision to authorize backend scope; current Stage 1 restrictions prohibit creating that capability. In Stage 2, validate the chosen API origin, real media availability, map style access, and secure WhatsApp session flow before adding write-heavy community features.

## Stage 1 completion status

All seven requested planning files have been created under `mobile-planning/`. Source was inspected across server routing, core controllers/services/repositories/configuration, web screens/API clients, types, migrations and test inventory. No app code was changed, no dependencies/tests were run, no secrets were copied, and no live service behavior was claimed. Acceptance is met for the permitted static-audit and planning scope; deployment-dependent verification remains explicitly unresolved. Stage 2 has not begun.
