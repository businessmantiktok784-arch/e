import { getStoredExpertToken } from './expertApi.js';
import { bearerHeaders, requestJson } from './http.js';

/**
 * Super-Admin moderation APIs.
 *
 * These call the `/api/admin/*` routes, which are behind `requireSuperAdmin`.
 * The session is the same one the expert/AI-review portal uses, stored under
 * `rt_expert_token`, so an administrator who is already signed in for reviews
 * can moderate without a second sign-in.
 */

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

function authHeaders(): Record<string, string> {
  return bearerHeaders(getStoredExpertToken());
}

/** GET /api/admin/community/reports */
export async function fetchAbuseReports(status?: AbuseReportStatus): Promise<AdminAbuseReport[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await requestJson<{ reports?: AdminAbuseReport[] }>(
    `/api/admin/community/reports${query}`,
    { headers: authHeaders(), errorMessage: 'The report queue could not be loaded.' }
  );
  return Array.isArray(data.reports) ? data.reports : [];
}

/** PATCH /api/admin/community/reports/:publicId */
export async function resolveAbuseReport(
  publicId: string,
  input: { status: AbuseReportStatus; note?: string | null }
): Promise<AdminAbuseReport> {
  const data = await requestJson<{ report: AdminAbuseReport }>(
    `/api/admin/community/reports/${encodeURIComponent(publicId)}`,
    {
      method: 'PATCH',
      headers: authHeaders(),
      json: { status: input.status, note: input.note ?? null },
      errorMessage: 'The report could not be updated.',
    }
  );
  return data.report;
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
  const data = await requestJson<{ rows?: AdminModerationComment[]; total?: number }>(
    `/api/admin/community/comments${suffix}`,
    { headers: authHeaders(), errorMessage: 'The comment queue could not be loaded.' }
  );
  return {
    rows: Array.isArray(data.rows) ? data.rows : [],
    total: typeof data.total === 'number' ? data.total : 0,
  };
}

/** PATCH /api/admin/community/comments/:commentId/moderation */
export async function moderateCommunityComment(
  commentId: string,
  input: { moderationStatus: CommentModerationStatus; reason: string }
): Promise<AdminModerationComment> {
  return requestJson<AdminModerationComment>(
    `/api/admin/community/comments/${encodeURIComponent(commentId)}/moderation`,
    {
      method: 'PATCH',
      headers: authHeaders(),
      json: { moderation_status: input.moderationStatus, reason: input.reason },
      errorMessage: 'The comment could not be moderated.',
    }
  );
}
