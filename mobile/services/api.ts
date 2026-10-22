import type { GeoJsonCollection, ObservationDetail, ObservationSummary, Paginated, PublicCategory, ObservationFilters, PublicSite, SitesResponse, CommunityInvestigationsResponse, CommunityInvestigation, CommunityVoteResult, ContributorTokenResponse, PublicVisitsResponse, PublicVisit, PublicCommentResponse, PublicComment } from '../types/api';

export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly kind: 'configuration' | 'network' | 'timeout' | 'http' | 'malformed' | 'not-found' | 'unauthorized' | 'forbidden' | 'rate-limit' | 'server';
  constructor(message: string, status?: number, code?: string, kind: ApiError['kind'] = 'http') { super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.kind = kind; }
}
export function getApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (!raw) throw new ApiError('API address is not configured. Set EXPO_PUBLIC_API_BASE_URL and restart Expo.', undefined, undefined, 'configuration');
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new ApiError('API address is invalid. Use a complete URL such as http://192.168.1.10:3000.', undefined, undefined, 'configuration'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new ApiError('API address must be an HTTP(S) origin without credentials, path, query, or fragment.', undefined, undefined, 'configuration');
  if (process.env.NODE_ENV === 'production' && (parsed.protocol !== 'https:' || isLoopbackHost(parsed.hostname))) throw new ApiError('Production builds require a non-loopback HTTPS API origin.', undefined, undefined, 'configuration');
  return parsed.toString().replace(/\/$/, '');
}
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '::' || host === '0.0.0.0' || host === '10.0.2.2' || host.startsWith('127.');
}
type RequestOptions = { signal?: AbortSignal; method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; headers?: Record<string, string> };
async function request<T>(path: string, validate: (value: unknown) => value is T, options?: RequestOptions, nullOn404?: false): Promise<T>;
async function request<T>(path: string, validate: (value: unknown) => value is T, options: RequestOptions | undefined, nullOn404: true): Promise<T | null>;
async function request<T>(path: string, validate: (value: unknown) => value is T, options: RequestOptions = {}, nullOn404 = false): Promise<T | null> {
  if (options.signal?.aborted) {
    const reason = options.signal.reason;
    throw reason instanceof Error ? reason : new Error('Request cancelled.');
  }
  const base = getApiBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const onAbort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const headers = { Accept: 'application/json', ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...options.headers };
    const response = await fetch(`${base}${path}`, { method: options.method ?? 'GET', headers, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), signal: controller.signal });
    if (response.status === 404 && nullOn404) return null;
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = isRecord(body) ? body.error : undefined;
      const message = typeof error === 'string' ? error : isRecord(error) && typeof error.message === 'string' ? error.message : `Request failed (${response.status}).`;
      const code = isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
      const kind: ApiError['kind'] = response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : response.status === 404 ? 'not-found' : response.status === 429 ? 'rate-limit' : response.status >= 500 ? 'server' : 'http';
      throw new ApiError(message, response.status, code, kind);
    }
    if (!validate(body)) throw new ApiError('The server returned data in an unexpected format.', undefined, undefined, 'malformed');
    return body;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (options.signal?.aborted) throw error;
    if (controller.signal.aborted) throw new ApiError('The request timed out. Check your connection and try again.', undefined, undefined, 'timeout');
    throw new ApiError('Could not reach Earth Talk. Check the API address and your network connection.', undefined, undefined, 'network');
  } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', onAbort); }
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isString(value: unknown): value is string { return typeof value === 'string'; }
export function isObservationSummary(value: unknown): value is ObservationSummary {
  return isRecord(value) && isString(value.passport_id) && isString(value.observation_category) && isString(value.observation_subcategory) && isString(value.classification) && isString(value.confidence) && (value.verification_status === 'unverified' || value.verification_status === 'expert_verified') && isString(value.created_at) && (value.district === null || isString(value.district)) && typeof value.confidence_score === 'number' && Number.isFinite(value.confidence_score) && value.confidence_score >= 0 && value.confidence_score <= 1 && ['private', 'district', 'approximate', 'exact'].includes(String(value.location_precision)) && (value.primary_interpretation === null || isString(value.primary_interpretation)) && (value.possible_name === null || isString(value.possible_name)) && (value.post_title === undefined || value.post_title === null || isString(value.post_title)) && (value.evidence_state === undefined || value.evidence_state === null || isString(value.evidence_state)) && (value.published_at === undefined || value.published_at === null || isString(value.published_at)) && (value.latitude === undefined || typeof value.latitude === 'number' && Number.isFinite(value.latitude)) && (value.longitude === undefined || typeof value.longitude === 'number' && Number.isFinite(value.longitude)) && (value.is_research_opportunity === undefined || value.is_research_opportunity === null || typeof value.is_research_opportunity === 'boolean') && (value.is_demo === undefined || typeof value.is_demo === 'boolean');
}
function isObservationList(value: unknown): value is Paginated<ObservationSummary> {
  return isRecord(value) && Array.isArray(value.data) && value.data.every(isObservationSummary) && isRecord(value.pagination) && typeof value.pagination.page === 'number' && typeof value.pagination.limit === 'number' && typeof value.pagination.total === 'number' && typeof value.pagination.totalPages === 'number';
}
function isObservationDetail(value: unknown): value is ObservationDetail {
  return isObservationSummary(value) && isRecord(value) && isStringArray(value.observed_features) && isString(value.reasoning) && isStringArray(value.limitations) && isStringArray(value.recommended_next_steps) && isString(value.safety_note) && (value.uncertainties === undefined || isStringArray(value.uncertainties)) && (value.diagnostic_features === undefined || isStringArray(value.diagnostic_features)) && (value.geological_context === undefined || value.geological_context === null || isString(value.geological_context)) && (value.data_quality_status === undefined || isString(value.data_quality_status)) && (value.research_opportunity_count === undefined || value.research_opportunity_count === null || typeof value.research_opportunity_count === 'number' && Number.isFinite(value.research_opportunity_count)) && (value.media_count === undefined || value.media_count === null || typeof value.media_count === 'number' && Number.isFinite(value.media_count)) && (value.public_media_count === undefined || value.public_media_count === null || typeof value.public_media_count === 'number' && Number.isFinite(value.public_media_count)) && (value.primary_media_url === undefined || value.primary_media_url === null || isString(value.primary_media_url)) && (value.site_title === undefined || value.site_title === null || isString(value.site_title)) && (value.site_code === undefined || value.site_code === null || isString(value.site_code)) && (value.sector === undefined || value.sector === null || isString(value.sector));
}
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every(isString); }
function isSite(value: unknown): value is PublicSite { return isRecord(value) && isString(value.site_id) && isString(value.site_code) && isString(value.title) && (value.district === null || isString(value.district)) && (value.description === null || isString(value.description)) && (value.is_demo === undefined || typeof value.is_demo === 'boolean'); }
function isCategory(value: unknown): value is PublicCategory { return isRecord(value) && isString(value.category) && isString(value.label) && typeof value.observation_count === 'number' && Number.isFinite(value.observation_count); }
function isSites(value: unknown): value is SitesResponse { return isRecord(value) && Array.isArray(value.rows) && typeof value.total === 'number' && value.rows.every(isSite); }
function isGeoJson(value: unknown): value is GeoJsonCollection { return isRecord(value) && value.type === 'FeatureCollection' && Array.isArray(value.features) && value.features.every((f) => isRecord(f) && f.type === 'Feature' && (f.geometry === null || isRecord(f.geometry)) && (f.properties === undefined || isRecord(f.properties))); }
export function fetchObservations(page = 1, limit = 20, signal?: AbortSignal, filters: ObservationFilters = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters.search?.trim()) query.set('search', filters.search.trim().slice(0, 100));
  if (filters.category) query.set('category', filters.category);
  return request(`/api/public/observations?${query}`, isObservationList, { signal });
}
export function fetchObservation(id: string, signal?: AbortSignal) { return request(`/api/public/observations/${encodeURIComponent(id)}`, isObservationDetail, { signal }, true); }
export function fetchCategories(signal?: AbortSignal) { return request('/api/public/categories', (value): value is PublicCategory[] => Array.isArray(value) && value.every(isCategory), { signal }); }
export function fetchSites(signal?: AbortSignal) { return request('/api/community/sites?limit=50', isSites, { signal }); }
export function fetchObservationMapData(signal?: AbortSignal, filters: ObservationFilters = {}) {
  const query = new URLSearchParams();
  if (filters.search?.trim()) query.set('search', filters.search.trim().slice(0, 100));
  if (filters.category) query.set('category', filters.category);
  const suffix = query.size ? `?${query.toString()}` : '';
  return request(`/api/public/observations.geojson${suffix}`, isGeoJson, { signal });
}

function isInvestigation(value: unknown): value is CommunityInvestigation {
  return isRecord(value) && isString(value.public_id) && isString(value.question) && isString(value.status) && (value.site_id === null || isString(value.site_id)) && (value.observation_id === null || isString(value.observation_id)) && (value.passport_id === null || isString(value.passport_id)) && isStringArray(value.options) && Array.isArray(value.vote_distribution) && value.vote_distribution.every((item) => isRecord(item) && isString(item.option) && typeof item.count === 'number' && Number.isFinite(item.count)) && typeof value.participant_count === 'number' && typeof value.evidence_count === 'number' && typeof value.vote_count === 'number' && isString(value.created_at) && typeof value.is_demo === 'boolean';
}
function isInvestigations(value: unknown): value is CommunityInvestigationsResponse { return isRecord(value) && Array.isArray(value.rows) && value.rows.every(isInvestigation) && typeof value.total === 'number'; }
function isVoteResult(value: unknown): value is CommunityVoteResult { return isRecord(value) && isString(value.option) && typeof value.changed === 'boolean' && isString(value.message); }
function isTokenResponse(value: unknown): value is ContributorTokenResponse { return isRecord(value) && isString(value.contributor_token) && value.contributor_token.length >= 16 && isString(value.handle_preview) && isString(value.note); }
function isVisits(value: unknown): value is PublicVisitsResponse { return isRecord(value) && Array.isArray(value.rows) && value.rows.every((row) => isRecord(row) && isString(row.id) && isString(row.site_id) && isString(row.contributor_handle) && isString(row.visited_on) && (row.notes === null || isString(row.notes)) && (row.media_id === null || isString(row.media_id)) && isString(row.created_at)); }
function isVisit(value: unknown): value is PublicVisit { return isRecord(value) && isString(value.id) && isString(value.site_id) && isString(value.contributor_handle) && isString(value.visited_on) && (value.notes === null || isString(value.notes)) && (value.media_id === null || isString(value.media_id)) && isString(value.created_at); }
function isComment(value: unknown): boolean { return isRecord(value) && isString(value.comment_id) && (value.parent_comment_id === null || isString(value.parent_comment_id)) && isRecord(value.author) && isString(value.author.public_user_id) && isString(value.author.display_name) && isString(value.body) && isString(value.created_at) && isString(value.moderation_status) && typeof value.reply_count === 'number' && Array.isArray(value.replies) && value.replies.every(isComment); }
function isCommentResponse(value: unknown): value is PublicCommentResponse { return isRecord(value) && Array.isArray(value.data) && value.data.every(isComment) && typeof value.total === 'number'; }

export interface AccountUser {
  public_user_id: string;
  display_name: string | null;
  is_demo: boolean;
  display_name_updated_at: string | null;
}
export interface AccountObservation {
  passport_id: string; title: string; is_public: boolean; observation_category: string; created_at: string;
  comment_count: number; media_count: number; open_question_count: number; location_precision: string;
  latitude?: number | null; longitude?: number | null;
}
export interface AuthCodeRequested { delivery: 'whatsapp' | 'development_console'; message: string; expires_in_seconds: number }
export interface AuthSession { authenticated: boolean; user: AccountUser | null }
function isAccountUser(value: unknown): value is AccountUser {
  return isRecord(value) && isString(value.public_user_id) && (value.display_name === null || isString(value.display_name)) && typeof value.is_demo === 'boolean' && (value.display_name_updated_at === null || isString(value.display_name_updated_at));
}
function isAuthCodeRequested(value: unknown): value is AuthCodeRequested {
  return isRecord(value) && (value.delivery === 'whatsapp' || value.delivery === 'development_console') && isString(value.message) && typeof value.expires_in_seconds === 'number' && Number.isFinite(value.expires_in_seconds);
}
function isAuthSession(value: unknown): value is AuthSession {
  return isRecord(value) && typeof value.authenticated === 'boolean' && (value.user === null || isAccountUser(value.user));
}
function isVerifiedSession(value: unknown): value is { token: string; expires_at: string; user: AccountUser } {
  return isRecord(value) && isString(value.token) && value.token.startsWith('rt_session_') && isString(value.expires_at) && isAccountUser(value.user);
}
export function requestAuthCode(phone: string, signal?: AbortSignal) {
  return request('/api/auth/request-code', isAuthCodeRequested, { method: 'POST', body: { phone }, signal });
}
export function verifyAuthCode(phone: string, code: string, signal?: AbortSignal) {
  return request('/api/auth/verify-code', isVerifiedSession, { method: 'POST', body: { phone, code }, signal });
}
export function fetchAuthSession(token: string, signal?: AbortSignal) {
  return request('/api/auth/session', isAuthSession, { headers: { Authorization: `Bearer ${token}` }, signal });
}
export function signOutAuthSession(token: string, signal?: AbortSignal) {
  return request('/api/auth/sign-out', (value): value is { ok: true } => isRecord(value) && value.ok === true, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: {}, signal });
}
export function updateAccountProfile(token: string, displayName: string | null, signal?: AbortSignal) {
  return request('/api/auth/profile', (value): value is { user: AccountUser } => isRecord(value) && isAccountUser(value.user), { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: { display_name: displayName }, signal });
}
export function fetchMyObservations(token: string, signal?: AbortSignal) {
  const valid = (value: unknown): value is { data: AccountObservation[] } => isRecord(value) && Array.isArray(value.data) && value.data.every((item) => isRecord(item) && isString(item.passport_id) && isString(item.title) && typeof item.is_public === 'boolean' && isString(item.observation_category) && isString(item.created_at) && ['district', 'approximate', 'exact', 'private'].includes(String(item.location_precision)) && ['comment_count', 'media_count', 'open_question_count'].every((key) => typeof item[key] === 'number' && Number.isFinite(item[key])) && (item.latitude === undefined || item.latitude === null || typeof item.latitude === 'number' && Number.isFinite(item.latitude)) && (item.longitude === undefined || item.longitude === null || typeof item.longitude === 'number' && Number.isFinite(item.longitude)));
  return request('/api/me/observations', valid, { headers: { Authorization: `Bearer ${token}` }, signal });
}
export function createObservationComment(passportId: string, body: string, token: string, parentCommentId?: string, signal?: AbortSignal) {
  const clean = body.trim();
  if (!clean || !token.trim()) throw new ApiError('Sign in and enter a comment before submitting.', undefined, undefined, 'configuration');
  const isCreatedComment = (value: unknown): value is { comment: PublicComment; message: string } => isRecord(value) && isComment(value.comment) && isString(value.message);
  return request(`/api/posts/${encodeURIComponent(passportId)}/comments`, isCreatedComment, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: { body: clean, ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}) }, signal });
}
export function fetchInvestigations(signal?: AbortSignal) { return request('/api/community/investigations?status=open&limit=50&offset=0', isInvestigations, { signal }); }
export function fetchSiteVisits(siteId: string, signal?: AbortSignal) { return request(`/api/community/sites/${encodeURIComponent(siteId)}/visits`, isVisits, { signal }); }
export function fetchObservationComments(passportId: string, signal?: AbortSignal) { return request(`/api/posts/${encodeURIComponent(passportId)}/comments`, isCommentResponse, { signal }); }
export function fetchContributorToken(signal?: AbortSignal) { return request('/api/community/contributor-token', isTokenResponse, { method: 'POST', body: {}, signal }); }
export function castInvestigationVote(publicId: string, option: string, token: string, signal?: AbortSignal) {
  if (!option.trim() || !token.trim()) throw new ApiError('A vote option and secure contributor token are required.', undefined, undefined, 'configuration');
  return request(`/api/community/investigations/${encodeURIComponent(publicId)}/vote`, isVoteResult, { method: 'POST', body: { option }, headers: { 'X-Contributor-Token': token }, signal });
}
export function recordSiteVisit(siteId: string, visitedOn: string, token: string, signal?: AbortSignal) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitedOn) || !token.trim()) throw new ApiError('A visit date and secure contributor token are required.', undefined, undefined, 'configuration');
  return request(`/api/community/sites/${encodeURIComponent(siteId)}/visits`, isVisit, { method: 'POST', body: { visited_on: visitedOn }, headers: { 'X-Contributor-Token': token }, signal });
}
