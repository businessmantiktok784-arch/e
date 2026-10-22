import type {
  PublicObservationSummary,
  PublicObservationDetail,
  PublicObservationGeoJson,
  PublicStats,
  PublicDistrictCount,
  PublicCategoryCount,
  ObservationFilters,
} from '../types/public.js';
import type {
  GeoscienceIntelligenceResult,
  ObservationIntelligenceContext,
  RelatedObservationsResponse,
  ResearchOpportunitiesResponse,
} from '../types/intelligence.js';
import { requestJson } from './http.js';

function statusError(label: string): (res: Response) => string {
  return (res) => `${label}: ${res.statusText}`;
}

function buildQueryString(
  params: Record<string, string | number | boolean | undefined>
): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      // Booleans are sent as `true`/`false` text, which is what the server's
      // flag parser accepts. A boolean is meaningful when false, so it is only
      // dropped when undefined.
      searchParams.append(key, String(value));
    }
  }
  const str = searchParams.toString();
  return str ? `?${str}` : '';
}

export async function fetchPublicObservations(
  filters: ObservationFilters = {},
  page: number = 1,
  limit: number = 50,
  signal?: AbortSignal
): Promise<{ data: PublicObservationSummary[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  // Every filter the caller set is forwarded. Dropping one here is silent: the
  // request succeeds and returns unfiltered rows, so the UI appears to ignore the
  // filter rather than report an error.
  const query = buildQueryString({
    page,
    limit,
    district: filters.district,
    classification: filters.classification,
    category: filters.category,
    subcategory: filters.subcategory,
    confidence: filters.confidence,
    verification: filters.verification,
    evidence_state: filters.evidence_state,
    community_status: filters.community_status,
    site: filters.site,
    has_investigation: filters.has_investigation,
    research_opportunity: filters.research_opportunity,
    has_evidence: filters.has_evidence,
    from: filters.from,
    to: filters.to,
    search: filters.search,
  });

  return requestJson(`/api/public/observations${query}`, {
    signal,
    errorMessage: statusError('Failed to load observations'),
  });
}

export async function fetchUnlocatedObservations(
  filters: ObservationFilters = {},
  page: number = 1,
  limit: number = 50,
  signal?: AbortSignal
): Promise<{ data: PublicObservationSummary[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const query = buildQueryString({
    page,
    limit,
    district: filters.district,
    classification: filters.classification,
    category: filters.category,
    subcategory: filters.subcategory,
    confidence: filters.confidence,
    verification: filters.verification,
    evidence_state: filters.evidence_state,
    community_status: filters.community_status,
    site: filters.site,
    has_investigation: filters.has_investigation,
    research_opportunity: filters.research_opportunity,
    has_evidence: filters.has_evidence,
    from: filters.from,
    to: filters.to,
    search: filters.search,
  });

  return requestJson(`/api/public/observations/unlocated${query}`, {
    signal,
    errorMessage: statusError('Failed to load observations without a location'),
  });
}

export async function fetchPublicGeoJson(
  filters: ObservationFilters = {},
  bbox?: string,
  signal?: AbortSignal
): Promise<PublicObservationGeoJson> {
  // The map must honour exactly the same filter set as the list, or a pin
  // disappears from one view and stays in the other for the same filter.
  const query = buildQueryString({
    district: filters.district,
    classification: filters.classification,
    category: filters.category,
    subcategory: filters.subcategory,
    confidence: filters.confidence,
    verification: filters.verification,
    evidence_state: filters.evidence_state,
    community_status: filters.community_status,
    site: filters.site,
    has_investigation: filters.has_investigation,
    research_opportunity: filters.research_opportunity,
    has_evidence: filters.has_evidence,
    from: filters.from,
    to: filters.to,
    search: filters.search,
    bbox,
  });

  return requestJson(`/api/public/observations.geojson${query}`, {
    signal,
    errorMessage: statusError('Failed to load GeoJSON'),
  });
}

export async function fetchPublicObservation(
  passportId: string,
  signal?: AbortSignal
): Promise<PublicObservationDetail | null> {
  return requestJson(
    `/api/public/observations/${encodeURIComponent(passportId)}`,
    { signal, nullOn404: true, errorMessage: statusError('Failed to load passport') }
  );
}

export async function fetchPublicStats(signal?: AbortSignal): Promise<PublicStats> {
  return requestJson('/api/public/stats', {
    signal,
    errorMessage: statusError('Failed to load stats'),
  });
}

export async function fetchPublicDistricts(signal?: AbortSignal): Promise<PublicDistrictCount[]> {
  return requestJson('/api/public/districts', {
    signal,
    errorMessage: statusError('Failed to load districts'),
  });
}

/**
 * Loads the per-category observation counts, including categories with zero.
 *
 * The client never hardcodes this list. A category the platform has added but
 * this build does not know about would otherwise be invisible, and inventing a
 * count for a category it has never heard of would be worse than showing nothing.
 */
export async function fetchPublicCategories(
  signal?: AbortSignal
): Promise<PublicCategoryCount[]> {
  return requestJson('/api/public/categories', {
    signal,
    errorMessage: statusError('Failed to load categories'),
  });
}

// -----------------------------------------------------------------------------
// Stage 11 — Geoscience Intelligence
// -----------------------------------------------------------------------------

/** Not found (404) resolves to `null` so the caller can hide rather than crash. */
function fetchOrNull<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  return requestJson<T>(path, {
    signal,
    nullOn404: true,
    errorMessage: statusError('Request failed'),
  });
}

export async function fetchObservationIntelligence(
  passportId: string,
  signal?: AbortSignal
): Promise<GeoscienceIntelligenceResult | null> {
  return fetchOrNull<GeoscienceIntelligenceResult>(
    `/api/public/observations/${encodeURIComponent(passportId)}/intelligence`,
    signal
  );
}

export async function fetchObservationContext(
  passportId: string,
  signal?: AbortSignal
): Promise<ObservationIntelligenceContext | null> {
  return fetchOrNull<ObservationIntelligenceContext>(
    `/api/public/observations/${encodeURIComponent(passportId)}/context`,
    signal
  );
}

export async function fetchNearbyObservations(
  passportId: string,
  signal?: AbortSignal
): Promise<RelatedObservationsResponse | null> {
  return fetchOrNull<RelatedObservationsResponse>(
    `/api/public/observations/${encodeURIComponent(passportId)}/nearby`,
    signal
  );
}

export async function fetchSimilarObservations(
  passportId: string,
  signal?: AbortSignal
): Promise<RelatedObservationsResponse | null> {
  return fetchOrNull<RelatedObservationsResponse>(
    `/api/public/observations/${encodeURIComponent(passportId)}/similar`,
    signal
  );
}

export async function fetchResearchOpportunities(
  params: { site?: string; limit?: number } = {},
  signal?: AbortSignal
): Promise<ResearchOpportunitiesResponse> {
  const searchParams = new URLSearchParams();
  if (params.site) searchParams.append('site', params.site);
  if (params.limit !== undefined) searchParams.append('limit', String(params.limit));
  const suffix = searchParams.toString() ? `?${searchParams}` : '';
  return requestJson(`/api/public/research-opportunities${suffix}`, {
    signal,
    errorMessage: statusError('Failed to load research opportunities'),
  });
}
