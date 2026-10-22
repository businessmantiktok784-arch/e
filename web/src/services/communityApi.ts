import type {
  PublicSiteSummary,
  PublicSiteGeoJson,
  PublicInvestigationSummary,
  PublicInvestigationDetail,
  UpdateInvestigationInput,
  PublicEvidenceItem,
  PublicQuestionSummary,
  PublicQuestionDetail,
  PublicAnswerItem,
  PublicVisitSummary,
  PublicReputationSummary,
  PublicCommunityMedia,
  SiteExplorerPayload,
  SiteTimelineEntry,
  CommunityEvidenceType,
} from '../types/community.js';
import { apiUrl, requestJson } from './http.js';
import { fileToDataUrl } from '../lib/file.js';

const CONTRIBUTOR_TOKEN_KEY = 'rt_contributor_token';
const CONTRIBUTOR_HEADER = 'X-Contributor-Token';

/**
 * Reads the pseudonymous browser contributor token.
 *
 * The token is a random value held only in this browser. It carries no personal
 * data and is not linked to a phone number or account; it exists so the server
 * can count a vote once and recognise repeat contributions.
 */
export function getContributorToken(): string | null {
  try {
    return localStorage.getItem(CONTRIBUTOR_TOKEN_KEY);
  } catch {
    return null;
  }
}

function setContributorToken(token: string): void {
  try {
    localStorage.setItem(CONTRIBUTOR_TOKEN_KEY, token);
  } catch {
    // Storage unavailable (private mode). Contributions still work, they just
    // cannot be recognised as coming from this browser again.
  }
}

/**
 * Ensures a contributor token exists, requesting one on first use.
 *
 * Failure is non-fatal: reads work without a token, and a write may be rejected
 * by the server, which is preferable to inventing an identity locally.
 */
export async function ensureContributorToken(): Promise<string | null> {
  const existing = getContributorToken();
  if (existing) return existing;

  try {
    const res = await fetch(apiUrl('/api/community/contributor-token'), { method: 'POST' });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.contributor_token === 'string' && data.contributor_token.length >= 16) {
      setContributorToken(data.contributor_token);
      return data.contributor_token;
    }
    return null;
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getContributorToken();
  if (token) headers[CONTRIBUTOR_HEADER] = token;
  return headers;
}

function getJson<T>(path: string): Promise<T> {
  return requestJson<T>(path, { headers: authHeaders() });
}

function sendJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  return requestJson<T>(path, {
    method,
    headers: authHeaders(),
    ...(body === undefined ? {} : { json: body }),
  });
}

// -----------------------------------------------------------------------------
// Sites and the Site Explorer
// -----------------------------------------------------------------------------

export async function fetchSites(params: { district?: string; limit?: number } = {}): Promise<{
  rows: PublicSiteSummary[];
  total: number;
}> {
  const query = new URLSearchParams();
  if (params.district) query.append('district', params.district);
  if (params.limit) query.append('limit', String(params.limit));
  const suffix = query.toString() ? `?${query}` : '';
  return getJson<{ rows: PublicSiteSummary[]; total: number }>(`/api/community/sites${suffix}`);
}

/**
 * Fetches published geological sites as GeoJSON for the map.
 *
 * Only sites whose public view exposes an authorised coordinate appear as
 * features. A district-only site is intentionally omitted rather than being
 * placed at an approximate position, because on a map a marker implies a
 * location the platform is not authorised to show.
 */
export async function fetchSitesGeoJson(params: {
  district?: string;
  bbox?: [number, number, number, number];
  limit?: number;
} = {}): Promise<PublicSiteGeoJson> {
  const query = new URLSearchParams();
  if (params.district) query.append('district', params.district);
  if (params.bbox) query.append('bbox', params.bbox.join(','));
  if (params.limit) query.append('limit', String(params.limit));
  const suffix = query.toString() ? `?${query}` : '';
  return getJson<PublicSiteGeoJson>(`/api/community/sites.geojson${suffix}`);
}

export async function fetchSiteExplorer(siteId: string): Promise<SiteExplorerPayload> {
  return getJson<SiteExplorerPayload>(
    `/api/community/sites/${encodeURIComponent(siteId)}/explorer`
  );
}

export async function fetchSiteTimeline(siteCode: string): Promise<SiteTimelineEntry[]> {
  return getJson<SiteTimelineEntry[]>(
    `/api/community/sites/${encodeURIComponent(siteCode)}/timeline`
  );
}

// -----------------------------------------------------------------------------
// Investigations
// -----------------------------------------------------------------------------

export async function fetchInvestigations(params: {
  siteId?: string;
  status?: string;
  researchInterestOnly?: boolean;
  limit?: number;
} = {}): Promise<{ rows: PublicInvestigationSummary[]; total: number }> {
  const query = new URLSearchParams();
  if (params.siteId) query.append('site_id', params.siteId);
  if (params.status) query.append('status', params.status);
  if (params.researchInterestOnly) query.append('research_interest', 'true');
  if (params.limit) query.append('limit', String(params.limit));
  const suffix = query.toString() ? `?${query}` : '';
  return getJson<{ rows: PublicInvestigationSummary[]; total: number }>(
    `/api/community/investigations${suffix}`
  );
}

export async function fetchInvestigation(publicId: string): Promise<PublicInvestigationDetail> {
  return getJson<PublicInvestigationDetail>(
    `/api/community/investigations/${encodeURIComponent(publicId)}`
  );
}

export async function openInvestigation(input: {
  question: string;
  siteId?: string | null;
  observationId?: string | null;
  passportId?: string | null;
  researchInterest?: boolean;
  options?: string[];
  checklist?: string[];
  context?: string | null;
  category?: string | null;
  mediaIds?: string[];
}): Promise<PublicInvestigationSummary> {
  await ensureContributorToken();
  return sendJson('/api/community/investigations', 'POST', {
    question: input.question,
    site_id: input.siteId ?? null,
    observation_id: input.observationId ?? null,
    passport_id: input.passportId ?? null,
    research_interest: input.researchInterest ?? false,
    options: input.options ?? [],
    checklist: input.checklist ?? [],
    context: input.context ?? null,
    category: input.category ?? null,
    media_ids: input.mediaIds ?? [],
  });
}

/**
 * PATCH /api/community/investigations/:publicId
 *
 * Corrects an investigation the opener published. Only the fields present in
 * `input` are sent, so an omitted field is left untouched. The server refuses
 * the edit unless this browser's contributor token matches the opener.
 */
export async function updateInvestigation(
  publicId: string,
  input: UpdateInvestigationInput
): Promise<PublicInvestigationSummary> {
  await ensureContributorToken();
  const body: Record<string, unknown> = {};
  if (input.question !== undefined) body.question = input.question;
  if (input.context !== undefined) body.context = input.context;
  if (input.category !== undefined) body.category = input.category;
  if (input.options !== undefined) body.options = input.options;
  if (input.checklist !== undefined) body.checklist = input.checklist;
  if (input.researchInterest !== undefined) body.research_interest = input.researchInterest;
  return sendJson(
    `/api/community/investigations/${encodeURIComponent(publicId)}`,
    'PATCH',
    body
  );
}

/**
 * POST /api/community/investigations/:publicId/checklist
 *
 * Records that this contributor can provide one requested item, or clears it.
 * A check is a statement of availability, never a verification.
 */
export async function checkChecklistItem(
  publicId: string,
  itemId: string,
  checked: boolean
): Promise<{ checked: boolean; check_count: number; message: string }> {
  await ensureContributorToken();
  return sendJson(
    `/api/community/investigations/${encodeURIComponent(publicId)}/checklist`,
    'POST',
    { item_id: itemId, checked }
  );
}

export async function castVote(
  investigationPublicId: string,
  option: string
): Promise<{ option: string; changed: boolean; message: string }> {
  await ensureContributorToken();
  return sendJson(
    `/api/community/investigations/${encodeURIComponent(investigationPublicId)}/vote`,
    'POST',
    { option }
  );
}

// -----------------------------------------------------------------------------
// Evidence, questions, answers, visits
// -----------------------------------------------------------------------------

export async function fetchEvidence(params: { siteId?: string; investigationId?: string } = {}): Promise<{
  rows: PublicEvidenceItem[];
}> {
  const query = new URLSearchParams();
  if (params.siteId) query.append('site_id', params.siteId);
  if (params.investigationId) query.append('investigation_id', params.investigationId);
  const suffix = query.toString() ? `?${query}` : '';
  return getJson<{ rows: PublicEvidenceItem[] }>(`/api/community/evidence${suffix}`);
}

export async function submitEvidence(input: {
  investigationId?: string | null;
  siteId?: string | null;
  observationId?: string | null;
  evidenceType: CommunityEvidenceType;
  explanation: string;
  mediaIds?: string[];
}): Promise<PublicEvidenceItem> {
  await ensureContributorToken();
  return sendJson('/api/community/evidence', 'POST', {
    investigation_id: input.investigationId ?? null,
    site_id: input.siteId ?? null,
    observation_id: input.observationId ?? null,
    evidence_type: input.evidenceType,
    explanation: input.explanation,
    media_ids: input.mediaIds ?? [],
  });
}

export async function fetchQuestions(params: { siteId?: string; limit?: number } = {}): Promise<{
  rows: PublicQuestionSummary[];
  total: number;
}> {
  const query = new URLSearchParams();
  if (params.siteId) query.append('site_id', params.siteId);
  if (params.limit) query.append('limit', String(params.limit));
  const suffix = query.toString() ? `?${query}` : '';
  return getJson<{ rows: PublicQuestionSummary[]; total: number }>(
    `/api/community/questions${suffix}`
  );
}

export async function askQuestion(input: {
  question: string;
  siteId?: string | null;
  investigationId?: string | null;
  requestedExpert?: boolean;
  context?: string | null;
  category?: string | null;
  mediaIds?: string[];
}): Promise<PublicQuestionSummary> {
  await ensureContributorToken();
  return sendJson('/api/community/questions', 'POST', {
    question: input.question,
    site_id: input.siteId ?? null,
    investigation_id: input.investigationId ?? null,
    requested_expert: input.requestedExpert ?? false,
    context: input.context ?? null,
    category: input.category ?? null,
    media_ids: input.mediaIds ?? [],
  });
}

export async function fetchQuestion(publicId: string): Promise<PublicQuestionDetail> {
  return getJson<PublicQuestionDetail>(`/api/community/questions/${encodeURIComponent(publicId)}`);
}

export async function postAnswer(
  questionPublicId: string,
  answer: string,
  mediaIds: string[] = []
): Promise<PublicAnswerItem> {
  await ensureContributorToken();
  return sendJson(
    `/api/community/questions/${encodeURIComponent(questionPublicId)}/answers`,
    'POST',
    { answer, media_ids: mediaIds }
  );
}

/**
 * Uploads one image or clip for a contribution and returns its descriptor.
 *
 * The file is read as a data URL and the base64 payload is sent to the server,
 * which validates the bytes by signature rather than trusting the declared
 * type. The returned `id` is attached to a contribution as a `media_id`.
 */
export async function uploadCommunityMedia(file: File): Promise<PublicCommunityMedia> {
  await ensureContributorToken();
  const dataUrl = await fileToDataUrl(file);
  return sendJson('/api/community/media', 'POST', {
    content_base64: dataUrl,
    mime_type: file.type || undefined,
    caption: null,
  });
}

/** URL for a stored community attachment, used when rendering media_ids. */
export function communityMediaSrc(mediaId: string): string {
  return apiUrl(`/api/community/media/${encodeURIComponent(mediaId)}`);
}

export async function fetchVisits(siteId: string): Promise<{ rows: PublicVisitSummary[] }> {
  return getJson<{ rows: PublicVisitSummary[] }>(
    `/api/community/sites/${encodeURIComponent(siteId)}/visits`
  );
}

export async function recordVisit(input: {
  siteId: string;
  visitedOn?: string;
  notes?: string;
}): Promise<PublicVisitSummary> {
  await ensureContributorToken();
  return sendJson(`/api/community/sites/${encodeURIComponent(input.siteId)}/visits`, 'POST', {
    visited_on: input.visitedOn,
    notes: input.notes ?? null,
  });
}

// -----------------------------------------------------------------------------
// Reputation
// -----------------------------------------------------------------------------

export async function fetchMyReputation(): Promise<PublicReputationSummary> {
  return getJson<PublicReputationSummary>('/api/community/me/reputation');
}