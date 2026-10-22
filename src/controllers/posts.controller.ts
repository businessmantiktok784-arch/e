import type { Response } from 'express';
import {
  communityPostService,
} from '../services/community-post.service.js';
import { bodyOf, sendError } from '../utils/http.js';
import type { AuthenticatedUserRequest, Viewer } from '../utils/user-auth.js';

/**
 * Community post endpoints (Stage 12).
 *
 * Handlers never build a response from request data: every field in a reply is
 * produced by the service, which decides what this caller may see. Errors are
 * reported with the same `{ error: { code, message } }` shape used by the
 * public API so the client has one contract to handle.
 */

function viewerOf(req: AuthenticatedUserRequest): Viewer | null {
  return req.viewer ?? null;
}

/**
 * GET /api/posts/:passportId
 */
export async function getPostHandler(req: AuthenticatedUserRequest, res: Response): Promise<void> {
  try {
    const post = await communityPostService.getPost(String(req.params.passportId ?? ''), viewerOf(req));
    if (!post) {
      res.status(404).json({
        error: { code: 'POST_NOT_FOUND', message: 'That observation does not exist.' },
      });
      return;
    }
    res.status(200).json(post);
  } catch (err) {
    sendError(res, err);
  }
}

/**
 * GET /api/posts/:passportId/same-place
 */
export async function samePlaceHandler(
  req: AuthenticatedUserRequest,
  res: Response
): Promise<void> {
  try {
    const samePlace = await communityPostService.samePlace(String(req.params.passportId ?? ''));
    res.status(200).json(samePlace);
  } catch (err) {
    sendError(res, err);
  }
}

/**
 * GET /api/posts/:passportId/comments
 */
export async function listCommentsHandler(
  req: AuthenticatedUserRequest,
  res: Response
): Promise<void> {
  try {
    const comments = await communityPostService.listComments(
      String(req.params.passportId ?? ''),
      viewerOf(req)
    );
    res.status(200).json({ data: comments, total: comments.length });
  } catch (err) {
    sendError(res, err);
  }
}

/**
 * POST /api/posts/:passportId/comments
 * Body: { body: string, parent_comment_id?: string | null }
 */
export async function createCommentHandler(
  req: AuthenticatedUserRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.viewer) {
      res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Sign in with your WhatsApp number to comment.' },
      });
      return;
    }

    const body = bodyOf(req);
    const result = await communityPostService.createComment(
      String(req.params.passportId ?? ''),
      req.viewer,
      {
        body: typeof body.body === 'string' ? body.body : '',
        parent_comment_id:
          typeof body.parent_comment_id === 'string' && body.parent_comment_id.length > 0
            ? body.parent_comment_id
            : null,
      }
    );

    res.status(201).json(result);
  } catch (err) {
    sendError(res, err);
  }
}

/**
 * PATCH /api/posts/:passportId
 * Body: { post_title?, user_report?, is_public?, location_precision? }
 */
export async function updatePostHandler(
  req: AuthenticatedUserRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.viewer) {
      res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Sign in to edit your post.' },
      });
      return;
    }

    const body = bodyOf(req);
    const post = await communityPostService.updatePost(
      String(req.params.passportId ?? ''),
      req.viewer,
      {
        post_title: typeof body.post_title === 'string' || body.post_title === null ? body.post_title : undefined,
        user_report: typeof body.user_report === 'string' || body.user_report === null ? body.user_report : undefined,
        is_public: typeof body.is_public === 'boolean' ? body.is_public : undefined,
        location_precision:
          typeof body.location_precision === 'string' ? body.location_precision : undefined,
      }
    );

    res.status(200).json(post);
  } catch (err) {
    sendError(res, err);
  }
}

/**
 * PATCH /api/posts/:passportId/attachments/:attachmentId
 * Body: { allow_download: boolean }
 */
export async function updateAttachmentDownloadHandler(
  req: AuthenticatedUserRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.viewer) {
      res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Sign in to set download rights on your post.' },
      });
      return;
    }

    const body = bodyOf(req);
    if (typeof body.allow_download !== 'boolean') {
      res.status(400).json({
        error: { code: 'INVALID_ALLOW_DOWNLOAD', message: 'allow_download must be true or false.' },
      });
      return;
    }

    const post = await communityPostService.updateAttachmentDownload(
      String(req.params.passportId ?? ''),
      req.viewer,
      String(req.params.attachmentId ?? ''),
      body.allow_download
    );

    res.status(200).json(post);
  } catch (err) {
    sendError(res, err);
  }
}

/**
 * POST /api/posts/:passportId/questions/:questionId/answer
 * Body: { answer: string }
 */
export async function answerQuestionHandler(
  req: AuthenticatedUserRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.viewer) {
      res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Sign in to answer a question about your post.' },
      });
      return;
    }

    const body = bodyOf(req);
    const post = await communityPostService.answerQuestion(
      String(req.params.passportId ?? ''),
      req.viewer,
      String(req.params.questionId ?? ''),
      typeof body.answer === 'string' ? body.answer : ''
    );

    res.status(200).json(post);
  } catch (err) {
    sendError(res, err);
  }
}

/**
 * POST /api/posts/:passportId/media
 * Body: { content_base64: string, mime_type?: string, caption?: string, role?: string }
 */
export async function addMediaHandler(
  req: AuthenticatedUserRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.viewer) {
      res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Sign in to add a file to your post.' },
      });
      return;
    }

    const body = bodyOf(req);
    const media = await communityPostService.addMedia(
      String(req.params.passportId ?? ''),
      req.viewer,
      {
        content_base64: typeof body.content_base64 === 'string' ? body.content_base64 : '',
        mime_type: typeof body.mime_type === 'string' ? body.mime_type : undefined,
        caption: typeof body.caption === 'string' ? body.caption : undefined,
        role: typeof body.role === 'string' ? body.role : undefined,
      }
    );

    res.status(201).json({ media });
  } catch (err) {
    sendError(res, err);
  }
}

/**
 * GET /api/me/observations
 *
 * The contributor's own dashboard: every post they own, public and private,
 * and nothing else.
 */
export async function listMyPostsHandler(
  req: AuthenticatedUserRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.viewer) {
      res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Sign in to see your own posts.' },
      });
      return;
    }

    const result = await communityPostService.listMyPosts(req.viewer);
    res.status(200).json(result);
  } catch (err) {
    sendError(res, err);
  }
}

/**
 * GET /api/me/questions
 *
 * "My questions": every discussion thread the contributor started, across all
 * posts, with the replies left on it.
 */
export async function listMyQuestionsHandler(
  req: AuthenticatedUserRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.viewer) {
      res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Sign in to see your questions.' },
      });
      return;
    }

    const result = await communityPostService.listMyQuestions(req.viewer);
    res.status(200).json(result);
  } catch (err) {
    sendError(res, err);
  }
}
