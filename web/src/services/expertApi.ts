import type {
  ExpertUser,
  ExpertObservationSummary,
  ExpertObservationDetail,
  ExpertReviewStats,
  VerificationAuditLogRecord,
  ExpertReviewInput,
  ExpertVerificationStatus,
} from '../types/expert.js';

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';
const TOKEN_STORAGE_KEY = 'rt_expert_token';
const USER_STORAGE_KEY = 'rt_expert_user';

export function getStoredExpertToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
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
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function clearExpertSession(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

function getAuthHeaders(): HeadersInit {
  const token = getStoredExpertToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Exchanges Super Admin credentials for a session token.
 *
 * The password is a required parameter. It was previously optional, which
 * allowed a caller to request a session with no credential at all.
 */
export async function loginExpert(email: string, passcode: string): Promise<{ token: string; expert: ExpertUser }> {
  const res = await fetch(`${API_BASE_URL}/api/expert/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: passcode }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Login failed');
  }

  const data = await res.json();
  setExpertSession(data.token, data.expert);
  return data;
}

export async function fetchExpertMe(): Promise<ExpertUser | null> {
  const token = getStoredExpertToken();
  if (!token) return null;

  const res = await fetch(`${API_BASE_URL}/api/expert/auth/me`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    clearExpertSession();
    return null;
  }

  const data = await res.json();
  return data.expert;
}

export async function logoutExpert(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/expert/auth/logout`, {
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
  const res = await fetch(`${API_BASE_URL}/api/expert/observations${query}`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch observations: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchExpertObservationDetail(passportId: string): Promise<ExpertObservationDetail | null> {
  const res = await fetch(`${API_BASE_URL}/api/expert/observations/${encodeURIComponent(passportId)}`, {
    headers: getAuthHeaders(),
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load details: ${res.statusText}`);

  return res.json();
}

export async function submitExpertReview(
  passportId: string,
  input: ExpertReviewInput
): Promise<{ success: boolean; verification: any; updatedObservation: ExpertObservationDetail }> {
  const res = await fetch(`${API_BASE_URL}/api/expert/observations/${encodeURIComponent(passportId)}/review`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to submit review');
  }

  return res.json();
}

export async function fetchExpertStats(): Promise<ExpertReviewStats> {
  const res = await fetch(`${API_BASE_URL}/api/expert/stats`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) throw new Error(`Failed to load stats: ${res.statusText}`);
  return res.json();
}

export async function fetchExpertAuditLogs(): Promise<VerificationAuditLogRecord[]> {
  const res = await fetch(`${API_BASE_URL}/api/expert/audit-logs`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) throw new Error(`Failed to load audit logs: ${res.statusText}`);
  const data = await res.json();
  return data.data;
}

// Stage 6 Research Analytics & Export API methods
export async function fetchResearchSummary(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/research/summary`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to load research summary: ${res.statusText}`);
  return res.json();
}

export async function downloadResearchCsv(): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/api/research/observations.csv`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to export CSV: ${res.statusText}`);
  return res.blob();
}

export async function downloadResearchGeoJson(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/research/observations.geojson`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to export GeoJSON: ${res.statusText}`);
  return res.json();
}

