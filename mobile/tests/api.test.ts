import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, castInvestigationVote, createObservationComment, fetchAuthSession, fetchCategories, fetchContributorToken, fetchInvestigations, fetchMyObservations, fetchObservation, fetchObservationComments, fetchObservations, fetchObservationMapData, fetchSiteVisits, getApiBaseUrl, recordSiteVisit, requestAuthCode, signOutAuthSession, updateAccountProfile, verifyAuthCode } from '../services/api.ts';
import { observationCardViewModel } from '../utils/observationCard.ts';
import { safeMediaUrl } from '../utils/media.ts';
import { buildWhatsAppStartUrl, hasConfiguredWhatsAppRecipient } from '../utils/whatsapp.ts';
import { nextObservationPage, observationDetailRoute } from '../utils/observationNavigation.ts';
import { contentState } from '../utils/uiState.ts';

const original = process.env.EXPO_PUBLIC_API_BASE_URL;
const originalFetch = globalThis.fetch;
const env = process.env as Record<string, string | undefined>;
function restore() {
  if (original === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = original;
  globalThis.fetch = originalFetch;
}
const record = { passport_id: 'ET-RW-000001', observation_category: 'rock', observation_subcategory: 'outcrop', primary_interpretation: null, classification: 'igneous', possible_name: null, confidence: 'low', confidence_score: 0.25, verification_status: 'unverified' as const, evidence_state: 'ai_assisted', district: null, location_precision: 'private' as const, created_at: '2026-01-01T00:00:00.000Z' };

test('missing and invalid public API configuration returns useful errors', () => {
  delete process.env.EXPO_PUBLIC_API_BASE_URL;
  assert.throws(() => getApiBaseUrl(), /not configured/);
  process.env.EXPO_PUBLIC_API_BASE_URL = 'not-a-url';
  assert.throws(() => getApiBaseUrl(), /invalid/);
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://example.test/v1';
  assert.throws(() => getApiBaseUrl(), /origin/);
  restore();
});

test('production API configuration requires HTTPS and a non-loopback host', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  env.NODE_ENV = 'production';
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://earth-talk.example';
  assert.throws(() => getApiBaseUrl(), /Production builds require/);
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://localhost';
  assert.throws(() => getApiBaseUrl(), /Production builds require/);
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://10.0.2.2';
  assert.throws(() => getApiBaseUrl(), /Production builds require/);
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://0.0.0.0';
  assert.throws(() => getApiBaseUrl(), /Production builds require/);
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.example';
  assert.equal(getApiBaseUrl(), 'https://earth-talk.example');
  if (originalNodeEnv === undefined) Reflect.deleteProperty(env, 'NODE_ENV'); else env.NODE_ENV = originalNodeEnv;
  restore();
});

test('observation list builds the verified endpoint URL and accepts its real envelope', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test/';
  let called = '';
  globalThis.fetch = async (input) => {
    called = String(input);
    return new Response(JSON.stringify({ data: [record], pagination: { page: 2, limit: 20, total: 21, totalPages: 2 } }), { status: 200 });
  };
  const result = await fetchObservations(2, 20);
  assert.equal(called, 'https://earth-talk.test/api/public/observations?page=2&limit=20');
  assert.equal(result.data[0]?.passport_id, record.passport_id);
  assert.equal(result.pagination.totalPages, 2);
  restore();
});

test('mocked browse-to-detail journey preserves the backend observation identifier', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  const detail = { ...record, observed_features: ['Layered texture'], reasoning: 'Preliminary description.', limitations: [], recommended_next_steps: [], safety_note: 'AI-assisted, not confirmation.' };
  globalThis.fetch = async (input) => String(input).endsWith('/ET-RW-000001')
    ? new Response(JSON.stringify(detail), { status: 200 })
    : new Response(JSON.stringify({ data: [record], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }), { status: 200 });
  const listing = await fetchObservations();
  const selectedId = listing.data[0]!.passport_id;
  const selected = await fetchObservation(selectedId);
  assert.equal(selected?.passport_id, selectedId);
  assert.deepEqual(observationDetailRoute(selectedId), { pathname: '/observations/[id]', params: { id: selectedId } });
  restore();
});

test('search and category filters are encoded as supported query parameters', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  let called = '';
  globalThis.fetch = async (input) => { called = String(input); return new Response(JSON.stringify({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }), { status: 200 }); };
  await fetchObservations(1, 20, undefined, { search: 'lava flow', category: 'rock' });
  const parsed = new URL(called);
  assert.equal(parsed.pathname, '/api/public/observations');
  assert.equal(parsed.searchParams.get('search'), 'lava flow');
  assert.equal(parsed.searchParams.get('category'), 'rock');
  restore();
});

test('category response is validated and returned as the actual array contract', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  globalThis.fetch = async () => new Response(JSON.stringify([{ category: 'rock', label: 'Rock', observation_count: 4 }]), { status: 200 });
  assert.deepEqual(await fetchCategories(), [{ category: 'rock', label: 'Rock', observation_count: 4 }]);
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [] }), { status: 200 });
  await assert.rejects(fetchCategories(), (error: unknown) => error instanceof ApiError && error.kind === 'malformed');
  restore();
});

test('map endpoint builds the verified public GeoJSON URL with supported server filters', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  let called = '';
  globalThis.fetch = async (input) => { called = String(input); return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), { status: 200 }); };
  const result = await fetchObservationMapData(undefined, { search: 'basalt ridge', category: 'rock' });
  const parsed = new URL(called);
  assert.equal(parsed.pathname, '/api/public/observations.geojson');
  assert.equal(parsed.searchParams.get('search'), 'basalt ridge');
  assert.equal(parsed.searchParams.get('category'), 'rock');
  assert.equal(result.features.length, 0);
  globalThis.fetch = async () => new Response(JSON.stringify({ type: 'FeatureCollection', features: [null] }), { status: 200 });
  await assert.rejects(fetchObservationMapData(), (error: unknown) => error instanceof ApiError && error.kind === 'malformed');
  restore();
});

test('network failures and 404 detail responses are classified safely', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  globalThis.fetch = async () => { throw new TypeError('private low level details'); };
  await assert.rejects(fetchObservations(), (error: unknown) => error instanceof ApiError && error.kind === 'network' && !error.message.includes('private low level details'));
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'PUBLIC_OBSERVATION_NOT_FOUND', message: 'Public observation not found.' } }), { status: 404 });
  assert.equal(await fetchObservation('ET-NOT-PUBLIC'), null);
  restore();
});

test('media URLs reject missing values and non-http schemes; WhatsApp validates configured number and falls back safely', () => {
  assert.equal(safeMediaUrl(null), null);
  assert.equal(safeMediaUrl('file:///private/image.jpg'), null);
  assert.equal(safeMediaUrl('https://storage.example/image.jpg'), 'https://storage.example/image.jpg');
  const originalNodeEnv = process.env.NODE_ENV;
  env.NODE_ENV = 'production';
  assert.equal(safeMediaUrl('http://storage.example/image.jpg'), null);
  if (originalNodeEnv === undefined) Reflect.deleteProperty(env, 'NODE_ENV'); else env.NODE_ENV = originalNodeEnv;
  assert.equal(buildWhatsAppStartUrl(''), 'https://wa.me/?text=START');
  assert.equal(buildWhatsAppStartUrl('+250 700-123-456'), 'https://wa.me/250700123456?text=START');
  assert.equal(buildWhatsAppStartUrl('Call +250 7'), 'https://wa.me/?text=START');
  assert.equal(buildWhatsAppStartUrl('1234567890123456'), 'https://wa.me/?text=START');
  assert.equal(hasConfiguredWhatsAppRecipient(''), false);
  assert.equal(hasConfiguredWhatsAppRecipient('+250 700-123-456'), true);
  assert.equal(hasConfiguredWhatsAppRecipient('12'), false);
});

test('an already-cancelled API request does not start a network fetch', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  const controller = new AbortController();
  controller.abort();
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}'); };
  await assert.rejects(fetchObservations(1, 20, controller.signal), (error: unknown) => error instanceof Error && error.name === 'AbortError');
  assert.equal(called, false);
  restore();
});

test('aborting an in-flight API request aborts fetch without converting cancellation to network failure', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  const controller = new AbortController();
  globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('fetch aborted')), { once: true });
  });
  const request = fetchObservations(1, 20, controller.signal);
  controller.abort();
  await assert.rejects(request, /fetch aborted/);
  restore();
});

test('API request timeout aborts the transport and reports a timeout error', async (t) => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('transport aborted')), { once: true });
  });
  const request = fetchObservations();
  await new Promise<void>((resolve) => setImmediate(resolve));
  t.mock.timers.tick(12_000);
  await assert.rejects(request, (error: unknown) => error instanceof ApiError && error.kind === 'timeout');
  t.mock.timers.reset();
  restore();
});

test('API distinguishes unauthorized and forbidden responses and rejects invalid JSON', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'AUTH_REQUIRED', message: 'Sign in required.' } }), { status: 401 });
  await assert.rejects(fetchObservations(), (error: unknown) => error instanceof ApiError && error.kind === 'unauthorized' && error.status === 401);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Not permitted.' } }), { status: 403 });
  await assert.rejects(fetchObservations(), (error: unknown) => error instanceof ApiError && error.kind === 'forbidden' && error.status === 403);
  globalThis.fetch = async () => new Response('{ invalid json', { status: 200 });
  await assert.rejects(fetchObservations(), (error: unknown) => error instanceof ApiError && error.kind === 'malformed');
  restore();
});

test('malformed observation detail is rejected instead of reaching presentation', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  globalThis.fetch = async () => new Response(JSON.stringify({ passport_id: 'ET-RW-000001' }), { status: 200 });
  await assert.rejects(fetchObservation('ET-RW-000001'), (error: unknown) => error instanceof ApiError && /unexpected format/.test(error.message));
  restore();
});

test('nested server error envelopes retain status and readable message', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Please retry later.' } }), { status: 429 });
  await assert.rejects(fetchObservations(), (error: unknown) => error instanceof ApiError && error.status === 429 && error.code === 'RATE_LIMIT_EXCEEDED' && error.message === 'Please retry later.');
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Service unavailable.' } }), { status: 503 });
  await assert.rejects(fetchObservations(), (error: unknown) => error instanceof ApiError && error.status === 503 && error.kind === 'server');
  restore();
});

test('community reads use verified public contracts and reject malformed payloads', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  let called = '';
  globalThis.fetch = async (input) => {
    called = String(input);
    return new Response(JSON.stringify({ rows: [{ public_id: 'INV-1', question: 'What evidence is needed?', status: 'open', site_id: null, observation_id: null, passport_id: null, participant_count: 2, evidence_count: 1, vote_count: 2, options: ['Option A', 'Option B'], checklist: [], context: null, category: null, media_ids: [], vote_distribution: [{ option: 'Option A', count: 2, share_pct: 100 }], opened_by_handle: null, viewer_is_owner: false, is_demo: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', disclaimer: 'Community opinion.' }], total: 1 }), { status: 200 });
  };
  const result = await fetchInvestigations();
  assert.equal(called, 'https://earth-talk.test/api/community/investigations?status=open&limit=50&offset=0');
  assert.equal(result.rows[0]?.vote_distribution[0]?.count, 2);
  globalThis.fetch = async () => new Response(JSON.stringify({ rows: [null], total: 1 }), { status: 200 });
  await assert.rejects(fetchInvestigations(), (error: unknown) => error instanceof ApiError && error.kind === 'malformed');
  restore();
});

test('community vote sends only selected option and secure contributor header; server must confirm', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  let request: { url: string; init?: RequestInit } = { url: '' };
  globalThis.fetch = async (input, init) => {
    request = { url: String(input), init };
    return new Response(JSON.stringify({ option: 'Option A', changed: true, message: 'Your vote was recorded.' }), { status: 200 });
  };
  const result = await castInvestigationVote('INV/1', 'Option A', 'opaque-contributor-token');
  assert.equal(request.url, 'https://earth-talk.test/api/community/investigations/INV%2F1/vote');
  assert.equal(request.init?.method, 'POST');
  assert.equal(new Headers(request.init?.headers).get('X-Contributor-Token'), 'opaque-contributor-token');
  assert.deepEqual(JSON.parse(String(request.init?.body)), { option: 'Option A' });
  assert.equal(result.changed, true);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'CONTRIBUTOR_TOKEN_REQUIRED', message: 'A contributor token is required.' } }), { status: 401 });
  await assert.rejects(castInvestigationVote('INV-1', 'Option A', 'opaque-contributor-token'), (error: unknown) => error instanceof ApiError && error.kind === 'unauthorized');
  restore();
});

test('site visits, comments and pseudonymous token are defensively validated', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/community/contributor-token')) return new Response(JSON.stringify({ contributor_token: '01234567890123456789012345678901', handle_preview: 'Field Explorer #AB12', note: 'Stored locally.' }), { status: 200 });
    if (url.endsWith('/visits')) return new Response(JSON.stringify({ rows: [{ id: 'V1', site_id: 'S1', contributor_handle: 'Field Explorer #1234', visited_on: '2026-01-02', notes: null, media_id: null, created_at: '2026-01-02T00:00:00Z' }] }), { status: 200 });
    return new Response(JSON.stringify({ data: [{ comment_id: 'C1', parent_comment_id: null, author: { public_user_id: 'U1', display_name: 'Community member' }, body: 'A public note.', created_at: '2026-01-02T00:00:00Z', edited_at: null, moderation_status: 'visible', reply_count: 0, replies: [] }], total: 1 }), { status: 200 });
  };
  assert.equal((await fetchContributorToken()).contributor_token.length, 32);
  assert.equal((await fetchSiteVisits('S1')).rows[0]?.contributor_handle, 'Field Explorer #1234');
  assert.equal((await fetchObservationComments('ET-RW-000001')).data[0]?.body, 'A public note.');
  restore();
});

test('site visit writes send the confirmed local date and classify network/malformed failures', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  let captured: { url: string; init?: RequestInit } = { url: '' };
  const visit = { id: 'V1', site_id: 'S/1', contributor_handle: 'Field Explorer #1234', visited_on: '2026-10-19', notes: null, media_id: null, created_at: '2026-10-19T08:00:00Z' };
  globalThis.fetch = async (input, init) => { captured = { url: String(input), init }; return new Response(JSON.stringify(visit), { status: 201 }); };
  const result = await recordSiteVisit('S/1', '2026-10-19', 'opaque-contributor-token');
  assert.equal(captured.url, 'https://earth-talk.test/api/community/sites/S%2F1/visits');
  assert.equal(captured.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(captured.init?.body)), { visited_on: '2026-10-19' });
  assert.equal(result.id, 'V1');
  globalThis.fetch = async () => { throw new TypeError('internal network detail'); };
  await assert.rejects(recordSiteVisit('S1', '2026-10-19', 'opaque-contributor-token'), (error: unknown) => error instanceof ApiError && error.kind === 'network' && !error.message.includes('internal network detail'));
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'V1' }), { status: 201 });
  await assert.rejects(recordSiteVisit('S1', '2026-10-19', 'opaque-contributor-token'), (error: unknown) => error instanceof ApiError && error.kind === 'malformed');
  restore();
});

test('content UI distinguishes loading, error, empty, and success states', () => {
  assert.equal(contentState({ loading: true, error: false, empty: false }), 'loading');
  assert.equal(contentState({ loading: false, error: true, empty: false }), 'error');
  assert.equal(contentState({ loading: false, error: false, empty: true }), 'empty');
  assert.equal(contentState({ loading: false, error: false, empty: false }), 'success');
});

test('pagination stops at the server-reported final page and cards link by real passport id', () => {
  assert.equal(nextObservationPage(1, 3), 2);
  assert.equal(nextObservationPage(3, 3), undefined);
  assert.deepEqual(observationDetailRoute('ET-RW-000001'), { pathname: '/observations/[id]', params: { id: 'ET-RW-000001' } });
});

test('community writes reject invalid inputs and duplicate concurrent actions are suppressed', async () => {
  assert.throws(() => castInvestigationVote('INV-1', ' ', 'opaque-token'), ApiError);
  assert.throws(() => recordSiteVisit('S1', 'today', 'opaque-token'), ApiError);
  const { runOnce } = await import('../utils/actionLock.ts');
  const lock = new Set<string>();
  let calls = 0;
  let release: () => void = () => {};
  const first = runOnce(lock, 'vote:INV-1', () => new Promise<void>((resolve) => { calls += 1; release = resolve; }));
  const duplicate = runOnce(lock, 'vote:INV-1', async () => { calls += 1; });
  await duplicate;
  assert.equal(calls, 1);
  release();
  await first;
  assert.equal(lock.size, 0);
  restore();
});

test('observation card presentation uses returned fields and never shows private coordinates', () => {
  const fields = observationCardViewModel({ ...record, latitude: -1.9, longitude: 30.1 });
  assert.equal(fields.title, 'outcrop');
  assert.equal(fields.location, 'Location kept private');
  assert.equal(fields.description, null);
  assert.equal('latitude' in fields, false);
  assert.equal(fields.verification, 'Unverified');
});

test('native WhatsApp OTP uses verified auth contracts and bearer sessions stay in headers', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const user = { public_user_id: 'USR-1234', display_name: 'Field Reader', is_demo: false, display_name_updated_at: null };
  globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith('/api/auth/request-code')) return new Response(JSON.stringify({ delivery: 'whatsapp', message: 'A code was sent.', expires_in_seconds: 600 }), { status: 200 });
    if (url.endsWith('/api/auth/verify-code')) return new Response(JSON.stringify({ token: 'rt_session_test_only', expires_at: '2026-10-20T10:00:00Z', user }), { status: 200 });
    if (url.endsWith('/api/auth/session')) return new Response(JSON.stringify({ authenticated: true, user }), { status: 200 });
    if (url.endsWith('/api/auth/profile')) return new Response(JSON.stringify({ user: { ...user, display_name: 'New Name' } }), { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  assert.equal((await requestAuthCode('+250781234567')).delivery, 'whatsapp');
  assert.equal(JSON.parse(String(calls[0]?.init?.body)).phone, '+250781234567');
  const verified = await verifyAuthCode('+250781234567', '123456');
  assert.equal(verified.token, 'rt_session_test_only');
  assert.equal(JSON.parse(String(calls[1]?.init?.body)).code, '123456');
  assert.equal(calls.some((call) => call.url.includes(verified.token) || String(call.init?.body).includes(verified.token)), false);
  assert.equal((await fetchAuthSession(verified.token)).authenticated, true);
  assert.equal(calls[2]?.init?.headers && new Headers(calls[2].init.headers).get('Authorization'), 'Bearer rt_session_test_only');
  assert.equal((await updateAccountProfile(verified.token, 'New Name')).user.display_name, 'New Name');
  assert.deepEqual(JSON.parse(String(calls[3]?.init?.body)), { display_name: 'New Name' });
  assert.deepEqual(await signOutAuthSession(verified.token), { ok: true });
  restore();
});

test('authenticated observation comment uses the verified route and server response', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  let captured: { url: string; init?: RequestInit } = { url: '' };
  const comment = { comment_id: 'C1', parent_comment_id: null, author: { public_user_id: 'USR-1', display_name: 'Field Reader', is_demo: false }, body: 'A field note.', created_at: '2026-10-20T09:00:00Z', edited_at: null, moderation_status: 'visible', reply_count: 0, replies: [], is_demo: false };
  globalThis.fetch = async (input, init) => { captured = { url: String(input), init }; return new Response(JSON.stringify({ comment, message: 'Your comment was posted.' }), { status: 201 }); };
  const result = await createObservationComment('ET-RW-000001', '  A field note.  ', 'rt_session_test_only');
  assert.equal(captured.url, 'https://earth-talk.test/api/posts/ET-RW-000001/comments');
  assert.equal(captured.init?.method, 'POST');
  assert.equal(new Headers(captured.init?.headers).get('Authorization'), 'Bearer rt_session_test_only');
  assert.deepEqual(JSON.parse(String(captured.init?.body)), { body: 'A field note.' });
  assert.equal(result.comment.body, 'A field note.');
  assert.throws(() => createObservationComment('ET-RW-000001', ' ', 'rt_session_test_only'), ApiError);
  restore();
});

test('owner observation history uses the authenticated private route and rejects malformed rows', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  let captured: { url: string; init?: RequestInit } = { url: '' };
  globalThis.fetch = async (input, init) => {
    captured = { url: String(input), init };
    return new Response(JSON.stringify({ data: [{ passport_id: 'ET-RW-000009', title: 'Owner record', is_public: false, observation_category: 'rock', created_at: '2026-10-20T09:00:00Z', comment_count: 0, media_count: 1, open_question_count: 0, location_precision: 'exact', latitude: -1.94, longitude: 29.87 }] }), { status: 200 });
  };
  const result = await fetchMyObservations('rt_session_test_only');
  assert.equal(captured.url, 'https://earth-talk.test/api/me/observations');
  assert.equal(new Headers(captured.init?.headers).get('Authorization'), 'Bearer rt_session_test_only');
  assert.equal(result.data[0]?.is_public, false);
  assert.equal(result.data[0]?.latitude, -1.94);
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ passport_id: 'bad' }] }), { status: 200 });
  await assert.rejects(fetchMyObservations('rt_session_test_only'), (error: unknown) => error instanceof ApiError && error.kind === 'malformed');
  restore();
});
