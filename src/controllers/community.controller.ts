import type { Request, Response } from 'express';
import {
  communityService,
  CommunityService,
  CommunityRateLimitError,
  CommunityForbiddenError,
  CommunityNotFoundError,
} from '../services/community.service.js';
import { siteRepository } from '../repositories/site.repository.js';
import { communityRepository } from '../repositories/community.repository.js';
import { communityMediaService } from '../services/community-media.service.js';
import { abuseReportService, AbuseReportError } from '../services/abuse-report.service.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import {
  resolveContributorHashFromRequest,
  publicContributorHandle,
} from '../utils/contributor.js';
import { logger } from '../utils/logger.js';

/**
 * Community Discovery controller.
 *
 * Two access tiers:
 *
 *  - Read endpoints are fully public and carry no personal data. Contributors
 *    appear only as derived handles such as "Field Explorer #A82F".
 *  - Write endpoints accept anonymous contributions but resolve the caller to a
 *    one-way contributor hash, which is used for duplicate-vote prevention and
 *    contribution counting and is never echoed back to any client.
 */

function setPublicHeaders(res: Response, maxAgeSeconds = 30): void {
  res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

/**
 * Resolves the contributor key for a write request.
 *
 * Returns null when no usable token was supplied so the handler can decide
 * whether the action is allowed without identity.
 */
function contributorOf(req: Request): string | null {
  return resolveContributorHashFromRequest(req);
}

function requireDatabase(res: Response): boolean {
  if (isDatabaseConfigured() || communityRepository.demoActive) return true;
  res.status(503).json({
    error: {
      code: 'COMMUNITY_UNAVAILABLE',
      message:
        'Community features are not available right now because the community database is not configured. No data is being displayed.',
    },
  });
  return false;
}

/**
 * Maps a service-layer failure onto an honest HTTP status.
 *
 * An unconfigured database is a 503, not a 404 and not an empty 200: telling a
 * caller that no investigations exist would misrepresent absence of data as
 * absence of investigations.
 */
function respondWithError(res: Response, err: unknown, context: string): void {
  if (err instanceof CommunityRateLimitError) {
    res.status(429).json({
      error: { code: 'RATE_LIMIT_EXCEEDED', message: err.message },
    });
    return;
  }

  if (err instanceof CommunityForbiddenError) {
    res.status(403).json({
      error: { code: 'NOT_OWNER', message: err.message },
    });
    return;
  }

  if (err instanceof CommunityNotFoundError) {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: err.message },
    });
    return;
  }

  const msg = err instanceof Error ? err.message : 'Unknown error';
  logger.error(`Community error: ${context}`, { error: msg });

  const isConfiguration = /requires a configured database|not configured/i.test(msg);
  res.status(isConfiguration ? 503 : 500).json({
    error: {
      code: isConfiguration ? 'COMMUNITY_UNAVAILABLE' : 'INTERNAL_ERROR',
      message: isConfiguration
        ? 'Community features are unavailable because the database is not configured.'
        : 'The community action could not be completed.',
    },
  });
}

// =============================================================================
// Investigations
// =============================================================================

/** GET /api/community/investigations */
export async function listInvestigations(req: Request, res: Response): Promise<void> {
  try {
    const contributor = contributorOf(req);
    // The response carries a per-caller `viewer_is_owner` flag, so an
    // identified caller must not receive a shared, cacheable response.
    if (contributor) {
      res.setHeader('Cache-Control', 'private, no-store');
    } else {
      setPublicHeaders(res, 15);
    }
    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);

    const result = await communityService.listInvestigations(
      {
        status: req.query.status as any,
        siteId: req.query.site_id as string | undefined,
        researchInterestOnly: req.query.research_interest === 'true',
        limit,
        offset,
      },
      contributor
    );

    res.status(200).json(result);
  } catch (err) {
    respondWithError(res, err, 'listInvestigations');
  }
}

/** POST /api/community/investigations */
export async function openInvestigation(req: Request, res: Response): Promise<void> {
  if (!requireDatabase(res)) return;

  try {
    const contributor = contributorOf(req);
    const body = req.body ?? {};
    const investigation = await communityService.openInvestigation(
      {
        question: typeof body.question === 'string' ? body.question : '',
        siteId: typeof body.site_id === 'string' ? body.site_id : null,
        observationId: typeof body.observation_id === 'string' ? body.observation_id : null,
        researchInterest: body.research_interest === true,
        options: Array.isArray(body.options) ? body.options : [],
        checklist: Array.isArray(body.checklist) ? body.checklist : [],
        context: typeof body.context === 'string' ? body.context : null,
        category: typeof body.category === 'string' ? body.category : null,
        mediaIds: Array.isArray(body.media_ids) ? body.media_ids : [],
      },
      contributor ?? ''
    );
    res.status(201).json(investigation);
  } catch (err) {
    respondWithError(res, err, 'openInvestigation');
  }
}

/** GET /api/community/investigations/:publicId */
export async function getInvestigation(req: Request, res: Response): Promise<void> {
  try {
    const contributor = contributorOf(req);
    const investigation = await communityService.getInvestigation(req.params.publicId, contributor);
    if (!investigation) {
      res.status(404).json({
        error: { code: 'INVESTIGATION_NOT_FOUND', message: 'Investigation not found.' },
      });
      return;
    }
    if (contributor) {
      res.setHeader('Cache-Control', 'private, no-store');
    } else {
      setPublicHeaders(res, 15);
    }
    res.status(200).json(investigation);
  } catch (err) {
    respondWithError(res, err, 'getInvestigation');
  }
}

/** PATCH /api/community/investigations/:publicId */
export async function updateInvestigation(req: Request, res: Response): Promise<void> {
  if (!requireDatabase(res)) return;

  try {
    const contributor = contributorOf(req);
    if (!contributor) {
      res.status(401).json({
        error: {
          code: 'CONTRIBUTOR_TOKEN_REQUIRED',
          message: 'You can only edit an investigation you opened from the browser that opened it.',
        },
      });
      return;
    }

    const body = req.body ?? {};
    const investigation = await communityService.updateInvestigation(
      {
        investigationPublicId: req.params.publicId,
        ...(body.question !== undefined
          ? { question: typeof body.question === 'string' ? body.question : '' }
          : {}),
        ...(body.context !== undefined
          ? { context: typeof body.context === 'string' ? body.context : null }
          : {}),
        ...(body.category !== undefined
          ? { category: typeof body.category === 'string' ? body.category : null }
          : {}),
        ...(body.options !== undefined
          ? { options: Array.isArray(body.options) ? body.options : [] }
          : {}),
        ...(body.checklist !== undefined
          ? { checklist: Array.isArray(body.checklist) ? body.checklist : [] }
          : {}),
        ...(body.research_interest !== undefined
          ? { researchInterest: body.research_interest === true }
          : {}),
      },
      contributor
    );
    res.status(200).json(investigation);
  } catch (err) {
    respondWithError(res, err, 'updateInvestigation');
  }
}

/** POST /api/community/investigations/:publicId/vote */
export async function castVote(req: Request, res: Response): Promise<void> {
  if (!requireDatabase(res)) return;

  try {
    const contributor = contributorOf(req);
    if (!contributor) {
      res.status(401).json({
        error: {
          code: 'CONTRIBUTOR_TOKEN_REQUIRED',
          message:
            'A contributor token is required to vote so that your vote is counted once. Refresh the page to obtain one.',
        },
      });
      return;
    }

    const result = await communityService.castVote(
      { investigationPublicId: req.params.publicId, option: req.body?.option },
      contributor
    );
    res.status(200).json(result);
  } catch (err) {
    respondWithError(res, err, 'castVote');
  }
}

/** POST /api/community/investigations/:publicId/checklist */
export async function toggleChecklist(req: Request, res: Response): Promise<void> {
  if (!requireDatabase(res)) return;

  try {
    const contributor = contributorOf(req);
    if (!contributor) {
      res.status(401).json({
        error: {
          code: 'CONTRIBUTOR_TOKEN_REQUIRED',
          message:
            'A contributor token is required so that your check is counted once. Refresh the page to obtain one.',
        },
      });
      return;
    }

    const result = await communityService.toggleChecklist(
      {
        investigationPublicId: req.params.publicId,
        itemId: String(req.body?.item_id ?? ''),
        checked: req.body?.checked !== false,
      },
      contributor
    );
    res.status(200).json(result);
  } catch (err) {
    respondWithError(res, err, 'toggleChecklist');
  }
}

// =============================================================================
// Evidence
// =============================================================================

/** GET /api/community/evidence */
export async function listEvidence(req: Request, res: Response): Promise<void> {
  try {
    setPublicHeaders(res, 15);
    const items = await communityService.listEvidence({
      siteId: req.query.site_id as string | undefined,
      investigationId: req.query.investigation_id as string | undefined,
      observationId: req.query.observation_id as string | undefined,
    });
    res.status(200).json({ rows: items });
  } catch (err) {
    respondWithError(res, err, 'listEvidence');
  }
}

/** POST /api/community/evidence */
export async function submitEvidence(req: Request, res: Response): Promise<void> {
  if (!requireDatabase(res)) return;

  try {
    const contributor = contributorOf(req);
    const body = req.body ?? {};
    const item = await communityService.submitEvidence(
      {
        investigationId: typeof body.investigation_id === 'string' ? body.investigation_id : null,
        siteId: typeof body.site_id === 'string' ? body.site_id : null,
        observationId: typeof body.observation_id === 'string' ? body.observation_id : null,
        mediaId: typeof body.media_id === 'string' ? body.media_id : null,
        mediaIds: Array.isArray(body.media_ids) ? body.media_ids : [],
        evidenceType: body.evidence_type,
        explanation: typeof body.explanation === 'string' ? body.explanation : null,
      },
      contributor ?? ''
    );
    res.status(201).json(item);
  } catch (err) {
    respondWithError(res, err, 'submitEvidence');
  }
}

// =============================================================================
// Questions and answers
// =============================================================================

/** GET /api/community/questions */
export async function listQuestions(req: Request, res: Response): Promise<void> {
  try {
    setPublicHeaders(res, 15);
    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);

    const result = await communityService.listQuestions({
      siteId: req.query.site_id as string | undefined,
      investigationId: req.query.investigation_id as string | undefined,
      observationId: req.query.observation_id as string | undefined,
      limit,
      offset,
    });
    res.status(200).json(result);
  } catch (err) {
    respondWithError(res, err, 'listQuestions');
  }
}

/** POST /api/community/questions */
export async function askQuestion(req: Request, res: Response): Promise<void> {
  if (!requireDatabase(res)) return;

  try {
    const contributor = contributorOf(req);
    const body = req.body ?? {};
    const question = await communityService.askQuestion(
      {
        question: typeof body.question === 'string' ? body.question : '',
        siteId: typeof body.site_id === 'string' ? body.site_id : null,
        observationId: typeof body.observation_id === 'string' ? body.observation_id : null,
        investigationId: typeof body.investigation_id === 'string' ? body.investigation_id : null,
        requestedExpert: body.requested_expert === true,
        context: typeof body.context === 'string' ? body.context : null,
        category: typeof body.category === 'string' ? body.category : null,
        mediaIds: Array.isArray(body.media_ids) ? body.media_ids : [],
      },
      contributor ?? ''
    );
    res.status(201).json(question);
  } catch (err) {
    respondWithError(res, err, 'askQuestion');
  }
}

/** GET /api/community/questions/:publicId */
export async function getQuestion(req: Request, res: Response): Promise<void> {
  try {
    const question = await communityService.getQuestion(req.params.publicId);
    if (!question) {
      res.status(404).json({
        error: { code: 'QUESTION_NOT_FOUND', message: 'Question not found.' },
      });
      return;
    }
    setPublicHeaders(res, 15);
    res.status(200).json(question);
  } catch (err) {
    respondWithError(res, err, 'getQuestion');
  }
}

/** POST /api/community/questions/:publicId/answers */
export async function postAnswer(req: Request, res: Response): Promise<void> {
  if (!requireDatabase(res)) return;

  try {
    const contributor = contributorOf(req);
    const answer = await communityService.postAnswer(
      {
        questionPublicId: req.params.publicId,
        answer: req.body?.answer,
        evidence_id: req.body?.evidence_id,
        mediaIds: Array.isArray(req.body?.media_ids) ? req.body.media_ids : undefined,
      },
      contributor ?? ''
    );
    res.status(201).json(answer);
  } catch (err) {
    respondWithError(res, err, 'postAnswer');
  }
}

// =============================================================================
// Visits
// =============================================================================

/** GET /api/community/sites/:siteId/visits */
export async function listVisits(req: Request, res: Response): Promise<void> {
  try {
    setPublicHeaders(res, 30);
    const visits = await communityService.listVisits(req.params.siteId);
    res.status(200).json({ rows: visits });
  } catch (err) {
    respondWithError(res, err, 'listVisits');
  }
}

/** POST /api/community/sites/:siteId/visits */
export async function recordVisit(req: Request, res: Response): Promise<void> {
  if (!requireDatabase(res)) return;

  try {
    const contributor = contributorOf(req);
    const body = req.body ?? {};
    const visit = await communityService.recordVisit(
      {
        siteId: req.params.siteId,
        visitedOn: typeof body.visited_on === 'string' ? body.visited_on : undefined,
        notes: typeof body.notes === 'string' ? body.notes : null,
        mediaId: typeof body.media_id === 'string' ? body.media_id : null,
      },
      contributor ?? ''
    );
    res.status(201).json(visit);
  } catch (err) {
    respondWithError(res, err, 'recordVisit');
  }
}

// =============================================================================
// Reputation
// =============================================================================

/** GET /api/community/me/reputation */
export async function getMyReputation(req: Request, res: Response): Promise<void> {
  try {
    const contributor = contributorOf(req);
    const reputation = await communityService.getReputation(contributor ?? '');
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(reputation);
  } catch (err) {
    respondWithError(res, err, 'getMyReputation');
  }
}

// =============================================================================
// Geological sites and the Site Explorer
// =============================================================================

/** GET /api/community/sites */
export async function listSites(req: Request, res: Response): Promise<void> {
  try {
    setPublicHeaders(res, 60);
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);

    const result = await siteRepository.listPublicSites({
      district: req.query.district as string | undefined,
      limit,
      offset,
    });
    res.status(200).json(result);
  } catch (err) {
    respondWithError(res, err, 'listSites');
  }
}

/** GET /api/community/sites.geojson */
export async function listSitesGeoJson(req: Request, res: Response): Promise<void> {
  try {
    setPublicHeaders(res, 30);
    res.setHeader('Content-Type', 'application/geo+json');

    let bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number } | undefined;
    const raw = typeof req.query.bbox === 'string' ? req.query.bbox : null;
    if (raw) {
      const parts = raw.split(',').map(Number);
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        bbox = { minLon: parts[0], minLat: parts[1], maxLon: parts[2], maxLat: parts[3] };
      }
    }

    const geojson = await siteRepository.listPublicSitesGeoJson({
      district: req.query.district as string | undefined,
      bbox,
      limit: Math.min(Number(req.query.limit ?? 200) || 200, 1000),
    });
    res.status(200).json(geojson);
  } catch (err) {
    respondWithError(res, err, 'listSitesGeoJson');
  }
}

/**
 * GET /api/community/sites/:siteId/explorer
 *
 * Returns the AI interpretation, the community record and any expert review as
 * three separate, explicitly labelled blocks. The client is responsible for
 * showing them as separate things; this endpoint will not merge or rank them.
 */
export async function getSiteExplorer(req: Request, res: Response): Promise<void> {
  try {
    const payload = await communityService.buildSiteExplorer(req.params.siteId);
    if (!payload) {
      res.status(404).json({
        error: { code: 'SITE_NOT_FOUND', message: 'Geological site not found.' },
      });
      return;
    }
    setPublicHeaders(res, 30);
    res.status(200).json(payload);
  } catch (err) {
    respondWithError(res, err, 'getSiteExplorer');
  }
}

/** GET /api/community/sites/:siteCode/timeline */
export async function getSiteTimeline(req: Request, res: Response): Promise<void> {
  try {
    const byCode = await siteRepository.findSiteByCode(req.params.siteCode);
    if (!byCode) {
      res.status(404).json({
        error: { code: 'SITE_NOT_FOUND', message: 'Geological site not found.' },
      });
      return;
    }

    const payload = await communityService.buildSiteExplorer(byCode.id);
    if (!payload) {
      res.status(404).json({
        error: { code: 'SITE_NOT_FOUND', message: 'Geological site not found.' },
      });
      return;
    }
    setPublicHeaders(res, 30);
    res.status(200).json(payload.timeline);
  } catch (err) {
    respondWithError(res, err, 'getSiteTimeline');
  }
}

/**
 * POST /api/community/contributor-token
 *
 * Issues the pseudonymous browser token used for duplicate-vote prevention. The
 * token carries no personal data and is not linked to a phone number or account.
 */
export async function issueContributorToken(req: Request, res: Response): Promise<void> {
  try {
    const { createContributorToken } = await import('../utils/contributor.js');
    const token = createContributorToken();
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      contributor_token: token,
      handle_preview: publicContributorHandle(
        (await import('../utils/contributor.js')).hashContributor(`web:${token}`)
      ),
      note: 'This token is stored in your browser only. It contains no personal data and cannot be linked to you.',
    });
  } catch (err) {
    respondWithError(res, err, 'issueContributorToken');
  }
}

// =============================================================================
// Community media
// =============================================================================

/**
 * POST /api/community/media
 *
 * Attaches one image or clip to a contribution. Bytes arrive base64 encoded and
 * are validated by signature. In demo mode they are kept in memory; on a real
 * deployment they go to object storage and start hidden until moderated.
 */
export async function addCommunityMedia(req: Request, res: Response): Promise<void> {
  if (!requireDatabase(res)) return;

  try {
    const contributor = contributorOf(req);
    const media = await communityMediaService.add(
      {
        contentBase64: typeof req.body?.content_base64 === 'string' ? req.body.content_base64 : '',
        mimeType: typeof req.body?.mime_type === 'string' ? req.body.mime_type : undefined,
        caption: typeof req.body?.caption === 'string' ? req.body.caption : null,
      },
      contributor
    );
    res.status(201).json(media);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'The file could not be attached.';
    res.status(400).json({ error: { code: 'MEDIA_REJECTED', message: msg } });
  }
}

/**
 * GET /api/community/media/:mediaId
 *
 * Serves a demonstration attachment from memory. On a real deployment bytes are
 * served directly from object storage and this route only redirects.
 */
export async function getCommunityMedia(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.mediaId ?? '');
    const demo = communityMediaService.getDemoBytes(id);
    if (demo) {
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.type(demo.mimeType);
      res.status(200).send(demo.buffer);
      return;
    }

    if (communityMediaService.demoActive) {
      res.status(404).json({ error: { code: 'MEDIA_NOT_FOUND', message: 'Attachment not found.' } });
      return;
    }

    const url = await communityMediaService.resolvePublicUrl(id);
    if (!url) {
      res.status(404).json({ error: { code: 'MEDIA_NOT_FOUND', message: 'Attachment not found.' } });
      return;
    }
    res.redirect(302, url);
  } catch (err) {
    respondWithError(res, err, 'getCommunityMedia');
  }
}

/**
 * POST /api/community/reports
 *
 * Files an abuse report against a record, question, comment or site.
 *
 * Anyone may file one, including a signed-out visitor: a reader who cannot
 * report harmful content cannot protect themselves. When a contributor token is
 * present its one-way hash is recorded for duplicate suppression, but no
 * personal data is collected and the hash is never returned.
 */
export async function fileAbuseReport(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body ?? {};
    const result = await abuseReportService.fileReport({
      targetType: typeof body.target_type === 'string' ? body.target_type : '',
      // (target type is validated by the service; a non-string becomes empty)
      targetId: typeof body.target_id === 'string' ? body.target_id : '',
      reasonCode: typeof body.reason_code === 'string' ? body.reason_code : '',
      details: typeof body.details === 'string' ? body.details : null,
      observationPassportId:
        typeof body.observation_passport_id === 'string' ? body.observation_passport_id : null,
      reporterHash: contributorOf(req),
    });
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof AbuseReportError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    respondWithError(res, err, 'fileAbuseReport');
  }
}