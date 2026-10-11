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

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';
const AUTH_HEADERS = getCommunityAuthHeaders;
const ACCEPT = { Accept: 'application/json' };

function combine(headers?: HeadersInit): HeadersInit {
  return { ...AUTH_HEADERS(), ...headers };
}

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error?.message ?? data.error ?? `Request failed (${res.status}).`;
    throw new Error(message);
  }
  return data as T;
}

/** GET /api/posts/:passportId */
export async function fetchPost(
  passportId: string,
  headers?: HeadersInit
): Promise<CommunityPostDetail | null> {
  const res = await fetch(
    `${API_BASE_URL}/api/posts/${encodeURIComponent(passportId)}`,
    { headers: combine(headers) }
  );
  if (res.status === 404) return null;
  return unwrap<CommunityPostDetail>(res);
}

/** GET /api/posts/:passportId/comments */
export async function fetchComments(passportId: string): Promise<PublicComment[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/posts/${encodeURIComponent(passportId)}/comments`,
    { headers: combine(ACCEPT) }
  );
  const data = await unwrap<{ data: PublicComment[] }>(res);
  return data.data;
}

/** POST /api/posts/:passportId/comments */
export async function createComment(
  passportId: string,
  body: string,
  parentCommentId: string | null
): Promise<CreateCommentResult> {
  const res = await fetch(
    `${API_BASE_URL}/api/posts/${encodeURIComponent(passportId)}/comments`,
    {
      method: 'POST',
      headers: combine(ACCEPT),
      body: JSON.stringify({
        body,
        ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}),
      }),
    }
  );
  return unwrap<CreateCommentResult>(res);
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
  const res = await fetch(`${API_BASE_URL}/api/community/reports`, {
    method: 'POST',
    headers: {
      ...combine(ACCEPT),
      ...(contributorToken ? { 'X-Contributor-Token': contributorToken } : {}),
    },
    body: JSON.stringify(input),
  });
  return unwrap<{ report: FiledAbuseReport; message: string }>(res);
}

/** POST /api/posts/:passportId/questions/:questionId/answer */
export async function answerQuestion(
  passportId: string,
  questionId: string,
  answer: string
): Promise<CommunityPostDetail> {
  const res = await fetch(
    `${API_BASE_URL}/api/posts/${encodeURIComponent(passportId)}/questions/${encodeURIComponent(questionId)}/answer`,
    {
      method: 'POST',
      headers: combine(ACCEPT),
      body: JSON.stringify({ answer }),
    }
  );
  return unwrap<CommunityPostDetail>(res);
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
  const res = await fetch(
    `${API_BASE_URL}/api/posts/${encodeURIComponent(passportId)}`,
    {
      method: 'PATCH',
      headers: combine(ACCEPT),
      body: JSON.stringify(patch),
    }
  );
  return unwrap<CommunityPostDetail>(res);
}

/** PATCH /api/posts/:passportId/attachments/:attachmentId (download on/off). */
export async function updateAttachmentDownload(
  passportId: string,
  attachmentId: string,
  allowDownload: boolean
): Promise<CommunityPostDetail> {
  const res = await fetch(
    `${API_BASE_URL}/api/posts/${encodeURIComponent(passportId)}/attachments/${encodeURIComponent(attachmentId)}`,
    {
      method: 'PATCH',
      headers: combine(ACCEPT),
      body: JSON.stringify({ allow_download: allowDownload }),
    }
  );
  return unwrap<CommunityPostDetail>(res);
}

/** GET /api/me/observations */
export async function fetchMyPosts(): Promise<MyPostSummary[]> {
  const res = await fetch(`${API_BASE_URL}/api/me/observations`, { headers: combine(ACCEPT) });
  const data = await unwrap<{ data: MyPostSummary[] }>(res);
  return data.data;
}

/** GET /api/me/questions */
export async function fetchMyQuestions(): Promise<MyDiscussionThread[]> {
  const res = await fetch(`${API_BASE_URL}/api/me/questions`, { headers: combine(ACCEPT) });
  const data = await unwrap<{ data: MyDiscussionThread[] }>(res);
  return data.data;
}