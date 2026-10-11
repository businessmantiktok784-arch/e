import { Router } from 'express';
import {
  addMediaHandler,
  answerQuestionHandler,
  createCommentHandler,
  getPostHandler,
  listCommentsHandler,
  listMyPostsHandler,
  listMyQuestionsHandler,
  samePlaceHandler,
  updateAttachmentDownloadHandler,
  updatePostHandler,
} from '../controllers/posts.controller.js';
import { attachViewer, requireUser } from '../utils/user-auth.js';

export const postsRouter = Router();

/**
 * Community observation posts (Stage 12).
 *
 * Reads accept an optional session: an anonymous visitor sees a public post,
 * its contributor's words, the model's interpretation, the gallery and the
 * discussion. Writes require a session, and the service decides whether the
 * caller owns the post.
 */

postsRouter.get('/api/posts/:passportId', attachViewer, getPostHandler);
postsRouter.get('/api/posts/:passportId/same-place', attachViewer, samePlaceHandler);
postsRouter.get('/api/posts/:passportId/comments', attachViewer, listCommentsHandler);
postsRouter.post('/api/posts/:passportId/comments', requireUser, createCommentHandler);
postsRouter.patch('/api/posts/:passportId', requireUser, updatePostHandler);
postsRouter.patch(
  '/api/posts/:passportId/attachments/:attachmentId',
  requireUser,
  updateAttachmentDownloadHandler
);
postsRouter.post(
  '/api/posts/:passportId/questions/:questionId/answer',
  requireUser,
  answerQuestionHandler
);
postsRouter.post('/api/posts/:passportId/media', requireUser, addMediaHandler);

postsRouter.get('/api/me/observations', requireUser, listMyPostsHandler);
postsRouter.get('/api/me/questions', requireUser, listMyQuestionsHandler);
