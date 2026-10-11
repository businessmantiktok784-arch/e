import { getStoredExpertToken } from './expertApi.js';

/**
 * Super-Admin moderation APIs.
 *
 * These call the `/api/admin/*` routes, which are behind `requireSuperAdmin`.
 * The session is the same one the expert/AI-review portal uses, stored under
 * `rt_expert_token`, so an administrator who is already signed in for reviews
 * can moderate without a second sign-in.
 */

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';

export type AbuseReportStatus = 'open' | 'acknowledged' | 'actioned' | 'dismissed';

export type AbuseReportTargetType =
  | 'observation'
  | 'investigation'
  | 'question'
  | 'comment'
  | 'site'
  | 'evidence'
  | 'media';

/** One report in the moderation queue, as the platform owner sees it. */
export interface AdminAbuseReport {
  public_id: string;
  target_type: AbuseReportTargetType;
  target_id: string;
  observation_passport_id: string | null;
  reason_code: string;
  reason_label: string;
  details: string | null;
  status: AbuseReportStatus;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  /** True when the report carried a reporter hash (signed-in, still anonymous). */
  has_reporter_identity: boolean;
}

export type CommentModerationStatus = 'visible' | 'pending_review' | 'hidden' | 'removed';

/** One comment in the discussion moderation queue. */
export interface AdminModerationComment {
  comment_id: string;
  observation_id: string | null;
  passport_id: string;
  parent_comment_id: string | null;
  author: { public_user_id: string; display_name: string | null; is_demo?: boolean };
  body: string;
  created_at: string;
  moderated_at: string | null;
  moderated_by: string | null;
  moderation_status: CommentModerationStatus;
  moderation_reason: string | null;
  is_demo: boolean;
}

function authHeaders(): HeadersInit {
  const token = getStoredExpertToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function failureMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  const message = data?.error?.message ?? data?.error;
  return typeof message === 'string' && message.length > 0 ? message : fallback;
}

/** GET /api/admin/community/reports */
export async function fetchAbuseReports(status?: AbuseReportStatus): Promise<AdminAbuseReport[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`${API_BASE_URL}/api/admin/community/reports${query}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await failureMessage(res, 'The report queue could not be loaded.'));
  const data = await res.json();
  return Array.isArray(data.reports) ? (data.reports as AdminAbuseReport[]) : [];
}

/** PATCH /api/admin/community/reports/:publicId */
export async function resolveAbuseReport(
  publicId: string,
  input: { status: AbuseReportStatus; note?: string | null }
): Promise<AdminAbuseReport> {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/community/reports/${encodeURIComponent(publicId)}`,
    {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status: input.status, note: input.note ?? null }),
    }
  );
  if (!res.ok) throw new Error(await failureMessage(res, 'The report could not be updated.'));
  const data = await res.json();
  return data.report as AdminAbuseReport;
}

/** GET /api/admin/community/comments */
export async function fetchModerationComments(params: {
  status?: CommentModerationStatus;
  limit?: number;
  offset?: number;
} = {}): Promise<{ rows: AdminModerationComment[]; total: number }> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  const suffix = query.toString() ? `?${query}` : '';
  const res = await fetch(`${API_BASE_URL}/api/admin/community/comments${suffix}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await failureMessage(res, 'The comment queue could not be loaded.'));
  const data = await res.json();
  return {
    rows: Array.isArray(data.rows) ? (data.rows as AdminModerationComment[]) : [],
    total: typeof data.total === 'number' ? data.total : 0,
  };
}

/** PATCH /api/admin/community/comments/:commentId/moderation */
export async function moderateCommunityComment(
  commentId: string,
  input: { moderationStatus: CommentModerationStatus; reason: string }
): Promise<AdminModerationComment> {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/community/comments/${encodeURIComponent(commentId)}/moderation`,
    {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ moderation_status: input.moderationStatus, reason: input.reason }),
    }
  );
  if (!res.ok) throw new Error(await failureMessage(res, 'The comment could not be moderated.'));
  return res.json();
}
