/**
 * Stage 11 — Geoscience Intelligence service.
 *
 * Layer between the AI pipeline and the public API. It collects bounded,
 * genuinely-available context (nearby and similar public observations, the site
 * the observation belongs to, community activity, geological-context status,
 * expert reviews) and assembles a `GeoscienceIntelligenceResult` for an existing
 * observation or for a live multimodal analysis.
 *
 * Nothing here synthesizes data. Every collection returns an honest
 * empty/unavailable state when its source is unreachable or holds nothing, and
 * the geological-context note is only ever "unavailable" because no legitimate
 * geological dataset is configured on this platform.
 */

import { logger } from '../utils/logger.js';
import { geminiService } from './gemini.service.js';
import {
  publicObservationRepository,
  PublicObservationRepository,
} from '../repositories/public-observation.repository.js';
import { siteRepository, SiteRepository } from '../repositories/site.repository.js';
import { communityRepository, CommunityRepository } from '../repositories/community.repository.js';
import {
  assembleIntelligence,
} from '../ai/geoscience-intelligence.pipeline.js';
import { emptyExtras } from '../ai/geoscience-intelligence.schema.js';
import { GEOLOGICAL_CONTEXT_UNAVAILABLE, EXPERT_SEPARATION_NOTE } from '../ai/geoscience-intelligence.types.js';
import type {
  GeoscienceIntelligenceResult,
  MediaPart,
  NearbyObservationRef,
  ObservationIntelligenceContext,
  RawIntelligenceExtras,
} from '../ai/geoscience-intelligence.types.js';
import type { GeoscienceAnalysisResult } from '../ai/geological.types.js';
import { GeologicalAnalysisError } from '../ai/geological.types.js';
import type { PublicObservationDetail } from '../types/public.types.js';
import {
  RESEARCH_OPPORTUNITY_LABEL,
  RESEARCH_OPPORTUNITY_DISCLAIMER,
  type ResearchOpportunity,
  type ResearchOpportunityBasis,
} from '../types/community.types.js';

const NEARBY_RADIUS_KM = 25;
const NEARBY_LIMIT = 12;
const SIMILAR_LIMIT = 8;

export class GeoscienceIntelligenceService {
  constructor(
    private publicRepo: PublicObservationRepository = publicObservationRepository,
    private sites: SiteRepository = siteRepository,
    private community: CommunityRepository = communityRepository
  ) {}

  /**
   * Builds the honest, bounded context for an existing public observation.
   *
   * Every source that cannot be reached reports `available: false` with a note;
   * a source is never assumed to be empty when it was simply not readable.
   */
  async collectObservationContext(
    passportId: string,
    detail?: PublicObservationDetail | null
  ): Promise<ObservationIntelligenceContext> {
    const obs = detail ?? (await this.publicRepo.findPublicObservationByPassport(passportId));
    if (!obs) return this.emptyContext('The observation is not a public record.');

    const [nearby, similar] = await Promise.all([
      this.publicRepo.findNearbyPublicObservations({
        passportId,
        radiusKm: NEARBY_RADIUS_KM,
        limit: NEARBY_LIMIT,
      }),
      this.publicRepo.findSimilarPublicObservations({ passportId, limit: SIMILAR_LIMIT }),
    ]);

    const nearbyRefs: NearbyObservationRef[] = nearby.map((n) => ({
      passport_id: n.passport_id,
      observation_category: n.observation_category as any,
      observation_subcategory: n.observation_subcategory,
      possible_name: n.possible_name,
      confidence: (n.confidence as any) || 'low',
      district: n.district,
      distance_km: n.distance_km,
      created_at: n.created_at,
    }));

    const siteContext = obs.site_code
      ? await this.loadSiteContext(obs.site_code, similar)
      : null;

    const communityNote =
      `Community evidence is never scientific confirmation. ` +
      (siteContext?.community
        ? `${siteContext.community.questionCount} public question(s), ${siteContext.community.evidenceCount} evidence item(s).`
        : 'No community activity could be attached to this observation.');

    const geologicalContext = {
      available: false,
      note: GEOLOGICAL_CONTEXT_UNAVAILABLE,
    };

    return {
      nearbyObservations: {
        available: nearbyRefs.length > 0,
        count: nearbyRefs.length,
        items: nearbyRefs,
        note:
          nearbyRefs.length > 0
            ? `${nearbyRefs.length} publicly available observation${nearbyRefs.length === 1 ? '' : 's'} within ${NEARBY_RADIUS_KM} km. Density of observations does not imply geological abundance.`
            : 'No nearby public observations share an exact published coordinate within the search radius.',
      },
      site: siteContext?.site ?? null,
      community: {
        available: Boolean(siteContext?.community && siteContext.community.evidenceCount + siteContext.community.questionCount > 0),
        questionCount: siteContext?.community?.questionCount ?? 0,
        evidenceCount: siteContext?.community?.evidenceCount ?? 0,
        visitCount: siteContext?.community?.visitCount ?? 0,
        note: communityNote,
      },
      geologicalContext,
      expertReview: siteContext?.expertReview ?? null,
    };
  }

  /**
   * Resolves the site block, community block and latest expert review for a
   * site_code. Returns null when the site cannot be found or is not public.
   */
  private async loadSiteContext(
    siteCode: string,
    similar: { passport_id: string }[]
  ): Promise<{
    site: ObservationIntelligenceContext['site'];
    community: ObservationIntelligenceContext['community'];
    expertReview: ObservationIntelligenceContext['expertReview'];
  } | null> {
    const site = await this.sites.findSiteByCode(siteCode);
    if (!site || site.is_public === false) return null;

    const [summary, observations, investigations, questions, evidence, visits, expert] =
      await Promise.all([
        this.sites.findPublicSiteSummaryById(String(site.id)),
        this.sites.listObservationsForSite(String(site.id), 100),
        this.community.listInvestigations({ siteId: String(site.id), limit: 50, offset: 0 }),
        this.community.listQuestions({ siteId: String(site.id), limit: 50, offset: 0 }),
        this.community.listEvidence({ siteId: String(site.id) }),
        this.community.listVisits(String(site.id)),
        this.loadLatestExpertReview(String(site.id)),
      ]);

    const observationCount = summary?.observation_count ?? observations.length;

    return {
      site: {
        available: true,
        siteId: String(site.id),
        siteCode: String(site.site_code),
        title: site.title ?? null,
        observationCount,
      },
      community: {
        available: true,
        questionCount: questions.total,
        evidenceCount: evidence.length,
        visitCount: visits.length,
        note: `${questions.total} public question(s), ${evidence.length} evidence item(s), ${visits.length} visit(s). Community activity is not scientific confirmation.`,
      },
      expertReview: expert,
    };
  }

  /**
   * Reads the latest published expert review for a site from the public view.
   * Public output only: reviewer name appears only when identity was published.
   */
  private async loadLatestExpertReview(
    siteId: string
  ): Promise<ObservationIntelligenceContext['expertReview']> {
    try {
      const { supabase } = await import('../config/supabase.js');
      const { data, error } = await (supabase.from('public_expert_reviews') as any)
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error || !Array.isArray(data) || data.length === 0) return null;

      const row = data[0] as any;
      const verdict =
        row.expert_rock_name || row.expert_classification || row.expert_notes || null;
      return {
        available: true,
        reviewer: row.identity_published ? (row.reviewer_name as string) ?? null : 'Expert reviewed',
        verdict: typeof verdict === 'string' ? verdict : null,
      };
    } catch (err) {
      logger.warn('Could not load expert review for intelligence', { error: String(err) });
      return null;
    }
  }

  /** The honest "nothing available" context used when an observation does not exist. */
  private emptyContext(note: string): ObservationIntelligenceContext {
    return {
      nearbyObservations: { available: false, count: 0, items: [], note },
      site: null,
      community: { available: false, questionCount: 0, evidenceCount: 0, visitCount: 0, note },
      geologicalContext: { available: false, note: GEOLOGICAL_CONTEXT_UNAVAILABLE },
      expertReview: null,
    };
  }

  /**
   * Assembles the intelligence presentation for an existing public observation
   * from its stored analysis (no model call needed for a read).
   */
  async getObservationIntelligence(passportId: string): Promise<GeoscienceIntelligenceResult | null> {
    const detail = await this.publicRepo.findPublicObservationByPassport(passportId);
    if (!detail) return null;

    const context = await this.collectObservationContext(passportId, detail);
    const base = this.toStoredAnalysisResult(detail);

    const result = assembleIntelligence({
      result: base,
      extras: emptyExtras(),
      context,
      userDescription: null,
    });
    return result;
  }

  /**
   * Reconstructs a base `GeoscienceAnalysisResult` from the fields a stored
   * public observation has. All labels and confidence come from the stored row;
   * no value is invented.
   */
  private toStoredAnalysisResult(detail: PublicObservationDetail): GeoscienceAnalysisResult {
    return {
      is_rock: detail.classification === 'igneous' || detail.classification === 'sedimentary' || detail.classification === 'metamorphic',
      observation_category: detail.observation_category as any,
      observation_subcategory: detail.observation_subcategory,
      observation_type: detail.observation_subcategory.replace(/[^a-z0-9_]/gi, '_').toLowerCase(),
      is_geoscience_relevant: detail.observation_category !== 'non_geoscience',
      primary_interpretation: detail.primary_interpretation ?? 'No preliminary interpretation was recorded for this observation.',
      geological_context: detail.geological_context ?? '',
      diagnostic_features: detail.diagnostic_features ?? [],
      uncertainties: detail.uncertainties ?? [],
      questions_for_user: [],
      blocked_claims: [],
      primary_classification: detail.classification,
      possible_name: detail.possible_name,
      confidence: detail.confidence,
      confidence_score: detail.confidence_score,
      observed_features: detail.observed_features ?? [],
      reasoning: detail.reasoning || 'No recorded reasoning accompanies this stored observation.',
      alternative_possibilities: [],
      limitations: detail.limitations ?? [],
      recommended_next_steps: detail.recommended_next_steps ?? [],
      safety_note: detail.safety_note,
      model_used: 'stored-analysis',
    };
  }

  /**
   * Runs a live Stage 11 multimodal analysis with bounded context.
   *
   * Collects context first (from coordinates when available), sends every media
   * part to the model via the context-aware pipeline, validates the response and
   * assembles the final presentation. The base pipeline remains the authoritative
   * interpretation; extras are optional.
   */
  async analyzeIntelligence(params: {
    media: MediaPart[];
    userDescription?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    excludePassportId?: string;
  }): Promise<GeoscienceIntelligenceResult> {
    const context = await this.collectLiveContext({
      latitude: params.latitude,
      longitude: params.longitude,
      excludePassportId: params.excludePassportId,
    });

    // Stage 11 rule: when the advanced context-aware analysis is unreachable,
    // fall back to the standard single-media analysis instead of inventing a
    // reading. The advanced call already retries its own model fallback chain;
    // this is the final fallback to the base pipeline and it happens before any
    // context is ever synthesized.
    let result: GeoscienceAnalysisResult;
    let extras: RawIntelligenceExtras;
    try {
      const advanced = await geminiService.analyzeGeoscienceIntelligence({
        media: params.media,
        userDescription: params.userDescription,
        context,
      });
      result = advanced.result;
      extras = advanced.extras;
    } catch (err) {
      logger.warn(
        'Advanced intelligence analysis failed; falling back to the standard single-media analysis',
        { error: String(err) }
      );
      if (params.media.length === 0) {
        throw new GeologicalAnalysisError('GEMINI_API_ERROR', 'No media was provided for analysis');
      }
      const baseMedia = params.media[0];
      result = await geminiService.analyzeGeoscienceMedia(
        baseMedia.buffer,
        baseMedia.mimeType,
        params.userDescription ?? undefined,
        baseMedia.viewType === 'video_frame' ? 'video' : 'image'
      );
      extras = emptyExtras();
    }

    return assembleIntelligence({
      result,
      extras,
      context,
      userDescription: params.userDescription,
    });
  }

  /** Context for a live analysis using the published coordinates, if any. */
  async collectLiveContext(params: {
    latitude?: number | null;
    longitude?: number | null;
    excludePassportId?: string;
  }): Promise<ObservationIntelligenceContext> {
    const hasCoordinate =
      typeof params.latitude === 'number' &&
      typeof params.longitude === 'number' &&
      Number.isFinite(params.latitude) &&
      Number.isFinite(params.longitude);

    if (!hasCoordinate) {
      return this.emptyContext('No exact published coordinate was available for proximity search.');
    }

    const nearby = await this.publicRepo.findNearbyPublicObservationsAt({
      latitude: params.latitude as number,
      longitude: params.longitude as number,
      excludePassportId: params.excludePassportId,
      radiusKm: NEARBY_RADIUS_KM,
      limit: NEARBY_LIMIT,
    });

    return {
      nearbyObservations: {
        available: nearby.length > 0,
        count: nearby.length,
        items: nearby.map((n) => ({
          passport_id: n.passport_id,
          observation_category: n.observation_category as any,
          observation_subcategory: n.observation_subcategory,
          possible_name: n.possible_name,
          confidence: (n.confidence as any) || 'low',
          district: n.district,
          distance_km: n.distance_km,
          created_at: n.created_at,
        })),
        note:
          nearby.length > 0
            ? `${nearby.length} publicly available observation${nearby.length === 1 ? '' : 's'} within ${NEARBY_RADIUS_KM} km. Density of observations does not imply geological abundance.`
            : 'No nearby public observations share an exact published coordinate within the search radius.',
      },
      site: null,
      community: { available: false, questionCount: 0, evidenceCount: 0, visitCount: 0, note: 'No community activity could be attached to a live analysis without a site.' },
      geologicalContext: { available: false, note: GEOLOGICAL_CONTEXT_UNAVAILABLE },
      expertReview: null,
    };
  }

  /**
   * Research opportunity engine.
   *
   * Produces `ResearchOpportunity` objects only from real rows: observations
   * whose `is_research_opportunity` flag was set by a person, and investigations
   * with `research_interest = true`. The label and disclaimer travel with every
   * object; no opportunity is invented from absence.
   */
  async listResearchOpportunities(options: {
    siteCode?: string;
    limit?: number;
  } = {}): Promise<ResearchOpportunity[]> {
    const limit = Math.min(options.limit ?? 20, 50);

    // 1. Observations explicitly flagged as research opportunities.
    const records = await this.publicRepo.findPublicObservations({
      page: 1,
      limit: 100,
      ...(options.siteCode ? { site: options.siteCode } : {}),
    });

    const flagged = records.data.filter((r) => r.is_research_opportunity === true);
    const fromObservations: ResearchOpportunity[] = flagged.slice(0, limit).map((r) => ({
      opportunity_id: `opp-obs-${r.passport_id}`,
      public_id: `OPP-OBS-${r.passport_id}`,
      label: RESEARCH_OPPORTUNITY_LABEL,
      basis: 'observation' as ResearchOpportunityBasis,
      question: `What geological process could explain the ${r.observation_subcategory || r.observation_category} feature recorded as "${r.primary_interpretation || r.possible_name || 'unidentified'}"?`,
      summary: `Members of the public recorded a ${r.observation_category}/${r.observation_subcategory} observation. The ${r.observation_subcategory || 'feature'} may warrant further field investigation.`,
      observation_category: r.observation_category,
      observation_subcategory: r.observation_subcategory,
      site_id: null,
      site_code: options.siteCode ?? (r as any).site_code ?? null,
      site_title: null,
      district: r.district,
      observation_count: 1,
      investigation_count: 0,
      evidence_count: 0,
      contributor_count: 0,
      highest_evidence_state: null,
      status: 'open',
      created_at: r.created_at,
      last_activity_at: r.published_at ?? r.created_at,
      disclaimer: RESEARCH_OPPORTUNITY_DISCLAIMER,
    }));

    // 2. Investigations flagged with research interest.
    const { rows } = await this.community.listInvestigations({
      researchInterestOnly: true,
      limit: 100,
      offset: 0,
    });
    const fromInvestigations: ResearchOpportunity[] = rows.slice(0, limit).map((inv) => ({
      opportunity_id: `opp-inv-${inv.public_id}`,
      public_id: `OPP-INV-${inv.public_id}`,
      label: RESEARCH_OPPORTUNITY_LABEL,
      basis: 'community' as ResearchOpportunityBasis,
      question: inv.question,
      summary: inv.question,
      observation_category: null,
      observation_subcategory: null,
      site_id: inv.site_id,
      site_code: options.siteCode ?? null,
      site_title: null,
      district: null,
      observation_count: 0,
      investigation_count: 1,
      evidence_count: inv.evidence_count ?? 0,
      contributor_count: inv.participant_count ?? 0,
      highest_evidence_state: null,
      status: inv.status,
      created_at: inv.created_at,
      last_activity_at: inv.updated_at,
      disclaimer: RESEARCH_OPPORTUNITY_DISCLAIMER,
    }));

    const merged = [...fromObservations, ...fromInvestigations];
    // Deduplicate by natural key while preserving the investigation origin.
    const seen = new Set<string>();
    const unique: ResearchOpportunity[] = [];
    for (const item of merged) {
      const key = item.basis === 'observation' ? `obs:${item.public_id}` : `inv:${item.public_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }

    return unique
      .sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime())
      .slice(0, limit);
  }

  /**
   * Comparison mode: builds a side-by-side intelligence payload for two public
   * observations without merging them into a single "answer".
   */
  async compareObservations(
    passportIdA: string,
    passportIdB: string
  ): Promise<{
    comparison: { label: string; valueA: string | null; valueB: string | null; note: string }[];
    expertSeparationNote: string;
  } | null> {
    const [detailA, detailB] = await Promise.all([
      this.publicRepo.findPublicObservationByPassport(passportIdA),
      this.publicRepo.findPublicObservationByPassport(passportIdB),
    ]);
    if (!detailA || !detailB) return null;

    const comparison = [
      {
        label: 'Observation category',
        valueA: detailA.observation_category,
        valueB: detailB.observation_category,
        note: 'Decided before interpretation; a difference here is not a disagreement about one specimen.',
      },
      {
        label: 'Possible name',
        valueA: detailA.possible_name,
        valueB: detailB.possible_name,
        note: 'Possible names are preliminary readings, not confirmed identifications.',
      },
      {
        label: 'Confidence',
        valueA: detailA.confidence,
        valueB: detailB.confidence,
        note: 'AI confidence is an internal model indicator, not a calibrated probability.',
      },
      {
        label: 'Evidence state',
        valueA: detailA.evidence_state ?? 'ai_assisted',
        valueB: detailB.evidence_state ?? 'ai_assisted',
        note: 'The strongest recorded level of real evidence, not a popularity score.',
      },
      {
        label: 'District',
        valueA: detailA.district,
        valueB: detailB.district,
        note: 'Public location is shown at district level unless the contributor published the exact point.',
      },
    ];

    return { comparison, expertSeparationNote: EXPERT_SEPARATION_NOTE };
  }
}

export const geoscienceIntelligenceService = new GeoscienceIntelligenceService();