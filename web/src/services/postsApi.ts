import type {
  CommunityPostDetail,
  CreateCommentResult,
  FileAbuseReportInput,
  FiledAbuseReport,
  MyDiscussionThread,
  MyPostSummary,
  PublicComment,
} from '../types/communityPosts.js';
import { getCommunityAuthHeaders } from './communityAuth.js';
import { getContributorToken } from './communityApi.js';
import { requestJson } from './http.js';

const AUTH_HEADERS = getCommunityAuthHeaders;
const ACCEPT = { Accept: 'application/json' };

function combine(headers?: HeadersInit): Record<string, string> {
  return { ...AUTH_HEADERS(), ...(headers as Record<string, string> | undefined) };
}

/** Fallback when the server sends no readable error text. */
function requestFailed(res: Response): string {
  return `Request failed (${res.status}).`;
}

/** GET /api/posts/:passportId */
export async function fetchPost(
  passportId: string,
  headers?: HeadersInit
): Promise<CommunityPostDetail | null> {
  return requestJson<CommunityPostDetail | null>(
    `/api/posts/${encodeURIComponent(passportId)}`,
    { headers: combine(headers), nullOn404: true, errorMessage: requestFailed }
  );
}

/** GET /api/posts/:passportId/comments */
export async function fetchComments(passportId: string): Promise<PublicComment[]> {
  const data = await requestJson<{ data: PublicComment[] }>(
    `/api/posts/${encodeURIComponent(passportId)}/comments`,
    { headers: combine(ACCEPT), errorMessage: requestFailed }
  );
  return data.data;
}

/** POST /api/posts/:passportId/comments */
export async function createComment(
  passportId: string,
  body: string,
  parentCommentId: string | null
): Promise<CreateCommentResult> {
  return requestJson<CreateCommentResult>(
    `/api/posts/${encodeURIComponent(passportId)}/comments`,
    {
      method: 'POST',
      headers: combine(ACCEPT),
      json: {
        body,
        ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}),
      },
      errorMessage: requestFailed,
    }
  );
}

/**
 * POST /api/community/reports
 *
 * Files an abuse report. Available to everyone, signed in or not: a reader who
 * cannot report harmful content cannot protect themselves. A report is an
 * allegation and does not by itself hide or change anything.
 */
export async function reportContent(
  input: FileAbuseReportInput
): Promise<{ report: FiledAbuseReport; message: string }> {
  // The pseudonymous browser contributor token travels with the report so the
  // server can suppress the same person filing the same report twice. It carries
  // no personal data and is stored only as a one-way hash.
  const contributorToken = getContributorToken();
  return requestJson<{ report: FiledAbuseReport; message: string }>('/api/community/reports', {
    method: 'POST',
    headers: {
      ...combine(ACCEPT),
      ...(contributorToken ? { 'X-Contributor-Token': contributorToken } : {}),
    },
    json: input,
    errorMessage: requestFailed,
  });
}

/** POST /api/posts/:passportId/questions/:questionId/answer */
export async function answerQuestion(
  passportId: string,
  questionId: string,
  answer: string
): Promise<CommunityPostDetail> {
  return requestJson<CommunityPostDetail>(
    `/api/posts/${encodeURIComponent(passportId)}/questions/${encodeURIComponent(questionId)}/answer`,
    { method: 'POST', headers: combine(ACCEPT), json: { answer }, errorMessage: requestFailed }
  );
}

export interface UpdatePostPatch {
  post_title?: string | null;
  user_report?: string | null;
  is_public?: boolean;
  location_precision?: string;
}

/** PATCH /api/posts/:passportId */
export async function updatePost(
  passportId: string,
  patch: UpdatePostPatch
): Promise<CommunityPostDetail> {
  return requestJson<CommunityPostDetail>(
    `/api/posts/${encodeURIComponent(passportId)}`,
    { method: 'PATCH', headers: combine(ACCEPT), json: patch, errorMessage: requestFailed }
  );
}

/** PATCH /api/posts/:passportId/attachments/:attachmentId (download on/off). */
export async function updateAttachmentDownload(
  passportId: string,
  attachmentId: string,
  allowDownload: boolean
): Promise<CommunityPostDetail> {
  return requestJson<CommunityPostDetail>(
    `/api/posts/${encodeURIComponent(passportId)}/attachments/${encodeURIComponent(attachmentId)}`,
    {
      method: 'PATCH',
      headers: combine(ACCEPT),
      json: { allow_download: allowDownload },
      errorMessage: requestFailed,
    }
  );
}

/** GET /api/me/observations */
export async function fetchMyPosts(): Promise<MyPostSummary[]> {
  const data = await requestJson<{ data: MyPostSummary[] }>('/api/me/observations', {
    headers: combine(ACCEPT),
    errorMessage: requestFailed,
  });
  return data.data;
}

/** GET /api/me/questions */
export async function fetchMyQuestions(): Promise<MyDiscussionThread[]> {
  const data = await requestJson<{ data: MyDiscussionThread[] }>('/api/me/questions', {
    headers: combine(ACCEPT),
    errorMessage: requestFailed,
  });
  return data.data;
}