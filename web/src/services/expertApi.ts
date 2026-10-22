import type {
  ExpertUser,
  ExpertObservationSummary,
  ExpertObservationDetail,
  ExpertReviewStats,
  VerificationAuditLogRecord,
  ExpertReviewInput,
  ExpertVerificationStatus,
} from '../types/expert.js';
import { apiUrl, bearerHeaders, requestBlob, requestJson } from './http.js';

const TOKEN_STORAGE_KEY = 'rt_expert_token';
const USER_STORAGE_KEY = 'rt_expert_user';

export function getStoredExpertToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
    return null;
  }
}

export function getStoredExpertUser(): ExpertUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setExpertSession(token: string, user: ExpertUser): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // The session still works for this tab even if it cannot be persisted.
  }
}

export function clearExpertSession(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

function getAuthHeaders(): Record<string, string> {
  return bearerHeaders(getStoredExpertToken());
}

/**
 * Exchanges Super Admin credentials for a session token.
 *
 * The password is a required parameter. It was previously optional, which
 * allowed a caller to request a session with no credential at all.
 */
export async function loginExpert(email: string, passcode: string): Promise<{ token: string; expert: ExpertUser }> {
  const data = await requestJson<{ token: string; expert: ExpertUser }>(
    '/api/expert/auth/login',
    {
      method: 'POST',
      headers: bearerHeaders(null),
      json: { email, password: passcode },
      errorMessage: 'Login failed',
    }
  );
  setExpertSession(data.token, data.expert);
  return data;
}

export async function fetchExpertMe(): Promise<ExpertUser | null> {
  const token = getStoredExpertToken();
  if (!token) return null;

  const res = await fetch(apiUrl('/api/expert/auth/me'), { headers: getAuthHeaders() });
  if (!res.ok) {
    clearExpertSession();
    return null;
  }
  const data = await res.json();
  return data.expert;
}

export async function logoutExpert(): Promise<void> {
  try {
    await fetch(apiUrl('/api/expert/auth/logout'), {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  } catch {
    // ignore network failure during logout
  }
  clearExpertSession();
}

export async function fetchExpertObservations(params: {
  status?: ExpertVerificationStatus | 'all';
  classification?: string;
  district?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: ExpertObservationSummary[]; total: number; page: number; limit: number }> {
  const searchParams = new URLSearchParams();
  if (params.status && params.status !== 'all') searchParams.append('status', params.status);
  if (params.classification) searchParams.append('classification', params.classification);
  if (params.district) searchParams.append('district', params.district);
  if (params.search) searchParams.append('search', params.search);
  if (params.page) searchParams.append('page', String(params.page));
  if (params.limit) searchParams.append('limit', String(params.limit));

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return requestJson(`/api/expert/observations${query}`, {
    headers: getAuthHeaders(),
    errorMessage: (res) => `Failed to fetch observations: ${res.statusText}`,
  });
}

export async function fetchExpertObservationDetail(passportId: string): Promise<ExpertObservationDetail | null> {
  return requestJson(
    `/api/expert/observations/${encodeURIComponent(passportId)}`,
    {
      headers: getAuthHeaders(),
      nullOn404: true,
      errorMessage: (res) => `Failed to load details: ${res.statusText}`,
    }
  );
}

export async function submitExpertReview(
  passportId: string,
  input: ExpertReviewInput
): Promise<{ success: boolean; verification: any; updatedObservation: ExpertObservationDetail }> {
  return requestJson(
    `/api/expert/observations/${encodeURIComponent(passportId)}/review`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      json: input,
      errorMessage: 'Failed to submit review',
    }
  );
}

export async function fetchExpertStats(): Promise<ExpertReviewStats> {
  return requestJson('/api/expert/stats', {
    headers: getAuthHeaders(),
    errorMessage: (res) => `Failed to load stats: ${res.statusText}`,
  });
}

export async function fetchExpertAuditLogs(): Promise<VerificationAuditLogRecord[]> {
  const data = await requestJson<{ data: VerificationAuditLogRecord[] }>('/api/expert/audit-logs', {
    headers: getAuthHeaders(),
    errorMessage: (res) => `Failed to load audit logs: ${res.statusText}`,
  });
  return data.data;
}

// Stage 6 Research Analytics & Export API methods
export async function fetchResearchSummary(): Promise<any> {
  return requestJson('/api/research/summary', {
    headers: getAuthHeaders(),
    errorMessage: (res) => `Failed to load research summary: ${res.statusText}`,
  });
}

export async function downloadResearchCsv(): Promise<Blob> {
  return requestBlob('/api/research/observations.csv', {
    headers: getAuthHeaders(),
    errorMessage: (res) => `Failed to export CSV: ${res.statusText}`,
  });
}

export async function downloadResearchGeoJson(): Promise<any> {
  return requestJson('/api/research/observations.geojson', {
    headers: getAuthHeaders(),
    errorMessage: (res) => `Failed to export GeoJSON: ${res.statusText}`,
  });
}

