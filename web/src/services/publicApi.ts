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

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';

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

  const res = await fetch(`${API_BASE_URL}/api/public/observations${query}`, { signal });
  if (!res.ok) {
    throw new Error(`Failed to load observations: ${res.statusText}`);
  }
  return res.json();
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

  const res = await fetch(`${API_BASE_URL}/api/public/observations/unlocated${query}`, { signal });
  if (!res.ok) {
    throw new Error(`Failed to load observations without a location: ${res.statusText}`);
  }
  return res.json();
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

  const res = await fetch(`${API_BASE_URL}/api/public/observations.geojson${query}`, { signal });
  if (!res.ok) {
    throw new Error(`Failed to load GeoJSON: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchPublicObservation(
  passportId: string,
  signal?: AbortSignal
): Promise<PublicObservationDetail | null> {
  const res = await fetch(`${API_BASE_URL}/api/public/observations/${encodeURIComponent(passportId)}`, { signal });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to load passport: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchPublicStats(signal?: AbortSignal): Promise<PublicStats> {
  const res = await fetch(`${API_BASE_URL}/api/public/stats`, { signal });
  if (!res.ok) {
    throw new Error(`Failed to load stats: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchPublicDistricts(signal?: AbortSignal): Promise<PublicDistrictCount[]> {
  const res = await fetch(`${API_BASE_URL}/api/public/districts`, { signal });
  if (!res.ok) {
    throw new Error(`Failed to load districts: ${res.statusText}`);
  }
  return res.json();
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
  const res = await fetch(`${API_BASE_URL}/api/public/categories`, { signal });
  if (!res.ok) {
    throw new Error(`Failed to load categories: ${res.statusText}`);
  }
  return res.json();
}

// -----------------------------------------------------------------------------
// Stage 11 — Geoscience Intelligence
// -----------------------------------------------------------------------------

/** Not found (404) resolves to `null` so the caller can hide rather than crash. */
async function fetchOrNull<T>(
  url: string,
  signal?: AbortSignal
): Promise<T | null> {
  const res = await fetch(url, { signal });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Request failed: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchObservationIntelligence(
  passportId: string,
  signal?: AbortSignal
): Promise<GeoscienceIntelligenceResult | null> {
  return fetchOrNull<GeoscienceIntelligenceResult>(
    `${API_BASE_URL}/api/public/observations/${encodeURIComponent(passportId)}/intelligence`,
    signal
  );
}

export async function fetchObservationContext(
  passportId: string,
  signal?: AbortSignal
): Promise<ObservationIntelligenceContext | null> {
  return fetchOrNull<ObservationIntelligenceContext>(
    `${API_BASE_URL}/api/public/observations/${encodeURIComponent(passportId)}/context`,
    signal
  );
}

export async function fetchNearbyObservations(
  passportId: string,
  signal?: AbortSignal
): Promise<RelatedObservationsResponse | null> {
  return fetchOrNull<RelatedObservationsResponse>(
    `${API_BASE_URL}/api/public/observations/${encodeURIComponent(passportId)}/nearby`,
    signal
  );
}

export async function fetchSimilarObservations(
  passportId: string,
  signal?: AbortSignal
): Promise<RelatedObservationsResponse | null> {
  return fetchOrNull<RelatedObservationsResponse>(
    `${API_BASE_URL}/api/public/observations/${encodeURIComponent(passportId)}/similar`,
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
  const res = await fetch(
    `${API_BASE_URL}/api/public/research-opportunities${suffix}`,
    { signal }
  );
  if (!res.ok) {
    throw new Error(`Failed to load research opportunities: ${res.statusText}`);
  }
  return res.json();
}
