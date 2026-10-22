import { Router } from 'express';
import {
  listInvestigations,
  openInvestigation,
  getInvestigation,
  updateInvestigation,
  castVote,
  toggleChecklist,
  listEvidence,
  submitEvidence,
  listQuestions,
  askQuestion,
  getQuestion,
  postAnswer,
  listVisits,
  recordVisit,
  getMyReputation,
  listSites,
  listSitesGeoJson,
  getSiteExplorer,
  getSiteTimeline,
  issueContributorToken,
  addCommunityMedia,
  getCommunityMedia,
  fileAbuseReport,
} from '../controllers/community.controller.js';

export const communityRouter = Router();

/**
 * Community Discovery API (spec sections 4 and 5).
 *
 * Read endpoints are public and personal-data free. Write endpoints accept
 * anonymous contributions identified only by a one-way contributor hash, which
 * is never returned to any client.
 */

// -- Contributor identity ----------------------------------------------------
communityRouter.post('/api/community/contributor-token', issueContributorToken);
communityRouter.get('/api/community/me/reputation', getMyReputation);

// -- Abuse reports (specification section 25) ---------------------------------
// Open to everyone, signed in or not: a report is an allegation, and a reader
// who cannot report harmful content cannot protect themselves or the community.
communityRouter.post('/api/community/reports', fileAbuseReport);

// -- Community media (attachments on contributions) --------------------------
communityRouter.post('/api/community/media', addCommunityMedia);
communityRouter.get('/api/community/media/:mediaId', getCommunityMedia);

// -- Investigations -----------------------------------------------------------
communityRouter.get('/api/community/investigations', listInvestigations);
communityRouter.post('/api/community/investigations', openInvestigation);
communityRouter.get('/api/community/investigations/:publicId', getInvestigation);
// Only the opener may edit, and only from the browser that opened it. The
// service re-checks ownership against the contributor hash.
communityRouter.patch('/api/community/investigations/:publicId', updateInvestigation);
communityRouter.post('/api/community/investigations/:publicId/vote', castVote);
// Anyone may check off an evidence request; the check records availability only.
communityRouter.post('/api/community/investigations/:publicId/checklist', toggleChecklist);

// -- Evidence -----------------------------------------------------------------
communityRouter.get('/api/community/evidence', listEvidence);
communityRouter.post('/api/community/evidence', submitEvidence);

// -- Questions and answers ----------------------------------------------------
communityRouter.get('/api/community/questions', listQuestions);
communityRouter.post('/api/community/questions', askQuestion);
communityRouter.get('/api/community/questions/:publicId', getQuestion);
communityRouter.post('/api/community/questions/:publicId/answers', postAnswer);

// -- Geological sites and the Site Explorer ----------------------------------
// Note the ordering: `/sites.geojson` must be registered before `/sites/:siteId`
// style routes can ever shadow it.
communityRouter.get('/api/community/sites.geojson', listSitesGeoJson);
communityRouter.get('/api/community/sites', listSites);
communityRouter.get('/api/community/sites/:siteId/explorer', getSiteExplorer);
communityRouter.get('/api/community/sites/:siteId/visits', listVisits);
communityRouter.post('/api/community/sites/:siteId/visits', recordVisit);
communityRouter.get('/api/community/sites/:siteCode/timeline', getSiteTimeline);