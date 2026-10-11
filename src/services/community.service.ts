import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { checkRateLimit } from '../utils/rate-limiter.js';
import { publicContributorHandle } from '../utils/contributor.js';
import {
  communityRepository,
  CommunityRepository,
} from '../repositories/community.repository.js';
import { siteRepository, SiteRepository } from '../repositories/site.repository.js';
import {
  resolvePublicCoordinates,
  normalizeDistrictName,
} from '../utils/public-location.js';
import {
  AI_DISCLAIMER,
  COMMUNITY_DISCLAIMER,
  EVIDENCE_STATE_RANK,
  EVIDENCE_STATE_LABEL,
  REPUTATION_DISCLAIMER,
  isEvidenceState,
  type EvidenceState,
  type CommunityEvidenceType,
  type InvestigationStatus,
  type CommunityInvestigationRecord,
  type InvestigationChecklistItem,
  type PublicChecklistItem,
  type CommunityEvidenceRecord,
  type CommunityQuestionRecord,
  type CommunityAnswerRecord,
  type CommunityVisitRecord,
  type PublicInvestigationSummary,
  type PublicInvestigationDetail,
  type PublicEvidenceItem,
  type PublicQuestionSummary,
  type PublicQuestionDetail,
  type PublicAnswerItem,
  type PublicVisitSummary,
  type PublicReputationSummary,
  type VoteTally,
  type SiteTimelineEntry,
  type CreateInvestigationInput,
  type UpdateInvestigationInput,
  type SubmitEvidenceInput,
  type AskQuestionInput,
  type RecordVisitInput,
} from '../types/community.types.js';
import type {
  SiteExplorerPayload,
  AiInterpretationBlock,
  ExpertReviewBlock,
  SiteCommunityBlock,
  NearbyObservation,
  PublicObservationRef,
} from '../types/site.types.js';
import type { RockClassification } from '../ai/geological.types.js';

/**
 * Minimum independent contributors before an investigation may be described as
 * community-supported.
 *
 * Spec section 4 is explicit that agreement is not scientific truth. A single
 * vote, or a handful of votes from the same device, must never move an
 * observation up the evidence ladder on its own.
 */
export const MIN_PARTICIPANTS_FOR_SUPPORT = 3;

/** Minimum substantive evidence items before "community-investigated". */
export const MIN_EVIDENCE_FOR_INVESTIGATED = 2;

export class CommunityService {
  constructor(
    private repo: CommunityRepository = communityRepository,
    private sites: SiteRepository = siteRepository
  ) {}

  // ==========================================================================
  // Input hardening
  // ==========================================================================

  /**
   * Enforces the per-participant community action rate limit.
   *
   * Keyed on the hashed contributor identity, never on a phone number, so the
   * limiter itself cannot become a re-identification vector.
   */
  private assertWithinRateLimit(contributorHash: string, action: string): void {
    const key = `community:${action}:${contributorHash}`;
    if (!checkRateLimit(key, env.COMMUNITY_RATE_LIMIT_PER_MINUTE, 60_000)) {
      throw new CommunityRateLimitError();
    }
  }

  private static clampText(value: string | null | undefined, maxLength: number): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, maxLength);
  }

  /** Maximum evidence requests on one investigation's checklist. */
  private static readonly MAX_CHECKLIST_ITEMS = 8;

  /**
   * Turns the opener's checklist lines into stored items with stable ids.
   *
   * Ids are positional (`item-1`, `item-2`, ...) so checking an item off is
   * stable while the list is unchanged, and a duplicate line is dropped so the
   * same request is never listed twice.
   */
  private static buildChecklistItems(input: string[] | undefined): InvestigationChecklistItem[] {
    const texts = (input ?? [])
      .map((line) => CommunityService.clampText(line, 120))
      .filter((line): line is string => Boolean(line));
    const unique = Array.from(new Set(texts)).slice(0, CommunityService.MAX_CHECKLIST_ITEMS);
    return unique.map((text, index) => ({ id: `item-${index + 1}`, text }));
  }

  /** Merges stored checklist items with the real check rows into a public DTO. */
  private static buildPublicChecklist(
    record: CommunityInvestigationRecord,
    checks: Array<{ item_id: string; contributor_hash: string }>,
    viewerHash?: string | null
  ): PublicChecklistItem[] {
    const items = record.checklist ?? [];
    const counts = new Map<string, number>();
    const mine = new Set<string>();
    for (const check of checks) {
      counts.set(check.item_id, (counts.get(check.item_id) ?? 0) + 1);
      if (viewerHash && check.contributor_hash === viewerHash) mine.add(check.item_id);
    }
    return items.map((item) => ({
      id: item.id,
      text: item.text,
      check_count: counts.get(item.id) ?? 0,
      viewer_checked: mine.has(item.id),
    }));
  }

  // ==========================================================================
  // Evidence ladder
  // ==========================================================================

  /**
   * Derives the evidence state of an observation or site.
   *
   * This is the scientific-integrity core of the platform. The ladder is only
   * ever climbed by evidence that genuinely exists:
   *
   *   - `expert_reviewed` requires a recorded expert review.
   *   - `scientifically_confirmed` requires that review to declare a laboratory
   *     or documented-reference evidence basis. Community activity can never
   *     reach this state.
   *   - `community_investigated` requires real substantive evidence items.
   *   - `community_supported` requires several independent participants.
   */
  public deriveEvidenceState(input: {
    hasExpertReview?: boolean;
    expertEvidenceBasis?: string | null;
    distinctParticipants?: number;
    substantiveEvidenceCount?: number;
    isDisputed?: boolean;
  }): EvidenceState {
    if (input.isDisputed) return 'unresolved';

    if (input.hasExpertReview) {
      const basis = (input.expertEvidenceBasis ?? '').trim().toLowerCase();
      const laboratoryBacked =
        basis.includes('laboratory') ||
        basis.includes('lab ') ||
        basis.includes('petrograph') ||
        basis.includes('thin section') ||
        basis.includes('xrd') ||
        basis.includes('xrf') ||
        basis.includes('reference specimen') ||
        basis.includes('documented reference');

      if (laboratoryBacked) return 'scientifically_confirmed';
      return 'expert_reviewed';
    }

    const participants = input.distinctParticipants ?? 0;
    const evidence = input.substantiveEvidenceCount ?? 0;

    if (participants >= MIN_PARTICIPANTS_FOR_SUPPORT || evidence >= MIN_EVIDENCE_FOR_INVESTIGATED) {
      if (evidence >= MIN_EVIDENCE_FOR_INVESTIGATED) return 'community_investigated';
      return 'community_supported';
    }

    return 'ai_assisted';
  }

  /**
   * Returns the evidence state to display for a record that already has one.
   *
   * Derivation is only ever a fallback for records written before the ladder
   * existed. Once a state is stored it is authoritative, and re-deriving it would
   * quietly overwrite the three states that derivation cannot produce:
   * `insufficient_evidence` (nothing could be concluded), `unresolved` (the
   * community disputes it) and `rejected` (a moderator withdrew it). Each of
   * those would be reported as `ai_assisted`, i.e. as an AI-assisted
   * identification - which is precisely the claim the platform is not entitled to
   * make about a withdrawn or unreadable record.
   */
  public resolveStoredEvidenceState(stored: unknown, fallback: { hasExpertReview?: boolean }): EvidenceState {
    return isEvidenceState(stored) ? stored : this.deriveEvidenceState(fallback);
  }

  /** Picks the highest-ranked state from a set of candidate states. */
  public static highestEvidenceState(states: Array<EvidenceState | null>): EvidenceState | null {
    let best: EvidenceState | null = null;
    for (const state of states) {
      if (!state) continue;
      if (!best || EVIDENCE_STATE_RANK[state] > EVIDENCE_STATE_RANK[best]) best = state;
    }
    return best;
  }

  public static evidenceLabel(state: EvidenceState): string {
    return EVIDENCE_STATE_LABEL[state];
  }

  // ==========================================================================
  // DTO mapping (internal hash never leaves the server)
  // ==========================================================================

  private static toVoteTally(rows: Array<{ option: string; count: number }>): VoteTally[] {
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    return rows.map((r) => ({
      option: r.option,
      count: r.count,
      share_pct: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
    }));
  }

  private static toEvidenceDto(row: CommunityEvidenceRecord): PublicEvidenceItem {
    return {
      id: row.id,
      evidence_type: row.evidence_type,
      explanation: row.explanation,
      supports_evidence: row.supports_evidence,
      is_challenge: row.is_challenge,
      contributor_handle: publicContributorHandle(row.contributor_hash),
      observation_id: row.observation_id,
      site_id: row.site_id,
      media_id: row.media_id,
      media_ids: row.media_ids ?? (row.media_id ? [row.media_id] : []),
      created_at: row.created_at,
    };
  }

  private static toQuestionSummary(row: CommunityQuestionRecord): PublicQuestionSummary {
    return {
      public_id: row.public_id,
      question: row.question,
      status: row.status,
      site_id: row.site_id,
      observation_id: row.observation_id,
      investigation_id: row.investigation_id,
      // The community tables do not denormalise the passport or site code, so
      // these stay null unless a caller supplies them from a joined view.
      passport_id: null,
      answer_count: row.answer_count ?? 0,
      vote_count: row.vote_count ?? 0,
      asked_by_handle: publicContributorHandle(row.contributor_hash),
      requested_expert: row.requested_expert === true,
      context: row.context ?? null,
      category: row.category ?? null,
      media_ids: row.media_ids ?? [],
      is_demo: row.is_demo === true,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private static toAnswerDto(row: CommunityAnswerRecord): PublicAnswerItem {
    return {
      id: row.id,
      answer: row.answer,
      contributor_handle: publicContributorHandle(row.contributor_hash),
      evidence_id: row.evidence_id ?? null,
      media_ids: row.media_ids ?? [],
      is_expert: row.is_expert === true,
      created_at: row.created_at,
    };
  }

  private static toVisitDto(row: CommunityVisitRecord): PublicVisitSummary {
    return {
      id: row.id,
      site_id: row.site_id,
      contributor_handle: publicContributorHandle(row.contributor_hash),
      visited_on: row.visited_on,
      notes: row.notes,
      media_id: row.media_id ?? null,
      created_at: row.created_at,
    };
  }

  // ==========================================================================
  // Investigations
  // ==========================================================================

  async openInvestigation(
    input: CreateInvestigationInput,
    contributorHash: string
  ): Promise<PublicInvestigationSummary> {
    this.assertWithinRateLimit(contributorHash, 'investigation');

    const question = CommunityService.clampText(input.question, 500);
    if (!question) throw new Error('An investigation question is required.');

    // A survey needs at least two distinct choices and no more than eight, so
    // the vote stays legible and nobody opens a one-option "survey".
    const options = (input.options ?? [])
      .map((o) => CommunityService.clampText(o, 80))
      .filter((o): o is string => Boolean(o));
    const uniqueOptions = Array.from(new Set(options));
    if (uniqueOptions.length === 1) {
      throw new Error('A survey needs at least two different options.');
    }
    if (uniqueOptions.length > 8) {
      throw new Error('An investigation can list at most eight options.');
    }

    const checklistItems = CommunityService.buildChecklistItems(input.checklist);
    const record = await this.repo.createInvestigation(
      { ...input, question, options: uniqueOptions, checklistItems },
      contributorHash
    );
    logger.info('Community investigation opened', {
      publicId: record.public_id,
      hasSite: Boolean(record.site_id),
      hasObservation: Boolean(record.observation_id),
    });
    return this.toInvestigationSummary(
      record,
      [],
      contributorHash,
      CommunityService.buildPublicChecklist(record, [], contributorHash)
    );
  }

  async listInvestigations(
    options: {
      status?: InvestigationStatus;
      siteId?: string;
      researchInterestOnly?: boolean;
      limit: number;
      offset: number;
    },
    viewerHash?: string | null
  ): Promise<{ rows: PublicInvestigationSummary[]; total: number }> {
    const { rows, total } = await this.repo.listInvestigations(options);

    const summaries = await Promise.all(
      rows.map(async (row) => {
        const [tally, checks] = await Promise.all([
          this.repo.getVoteTally(row.id),
          this.repo.listInvestigationChecks(row.id),
        ]);
        return this.toInvestigationSummary(
          row,
          CommunityService.toVoteTally(tally),
          viewerHash,
          CommunityService.buildPublicChecklist(row, checks, viewerHash)
        );
      })
    );

    return { rows: summaries, total };
  }

  async getInvestigation(
    publicId: string,
    viewerHash?: string | null
  ): Promise<PublicInvestigationDetail | null> {
    const record = await this.repo.findInvestigationByPublicId(publicId);
    if (!record || record.is_public === false) return null;

    const [tally, evidence, questions, checks] = await Promise.all([
      this.repo.getVoteTally(record.id),
      this.repo.listEvidence({ investigationId: record.id }),
      this.repo.listQuestions({ investigationId: record.id, limit: 50, offset: 0 }),
      this.repo.listInvestigationChecks(record.id),
    ]);

    const summary = this.toInvestigationSummary(
      record,
      CommunityService.toVoteTally(tally),
      viewerHash,
      CommunityService.buildPublicChecklist(record, checks, viewerHash)
    );
    return {
      ...summary,
      evidence: evidence.map(CommunityService.toEvidenceDto),
      questions: questions.rows.map(CommunityService.toQuestionSummary),
    };
  }

  /**
   * Edits an investigation the opener published.
   *
   * Only the opener may edit, verified against the contributor hash, because an
   * investigation is a public question other people have already answered. Site
   * and observation are deliberately immutable: moving a published question
   * after votes exist would silently change what those votes were about.
   * Correcting the wording, context, category, survey choices or research flag
   * is allowed.
   */
  async updateInvestigation(
    input: { investigationPublicId: string } & UpdateInvestigationInput,
    contributorHash: string
  ): Promise<PublicInvestigationSummary> {
    const investigation = await this.repo.findInvestigationByPublicId(input.investigationPublicId);
    if (!investigation) throw new CommunityNotFoundError('That investigation could not be found.');

    if (!investigation.opened_by_hash || investigation.opened_by_hash !== contributorHash) {
      throw new CommunityForbiddenError('You can only edit an investigation you opened.');
    }

    const patch: {
      question?: string;
      context?: string | null;
      category?: string | null;
      options?: string[];
      checklist?: InvestigationChecklistItem[];
      researchInterest?: boolean;
    } = {};

    if (input.question !== undefined) {
      const question = CommunityService.clampText(input.question, 500);
      if (!question) throw new Error('An investigation question is required.');
      patch.question = question;
    }

    if (input.context !== undefined) {
      patch.context = input.context ? CommunityService.clampText(input.context, 1000) : null;
    }

    if (input.category !== undefined) {
      patch.category = input.category ? CommunityService.clampText(input.category, 80) : null;
    }

    if (input.researchInterest !== undefined) {
      patch.researchInterest = input.researchInterest;
    }

    if (input.options !== undefined) {
      const options = input.options
        .map((o) => CommunityService.clampText(o, 80))
        .filter((o): o is string => Boolean(o));
      const uniqueOptions = Array.from(new Set(options));
      if (uniqueOptions.length === 1) {
        throw new Error('A survey needs at least two different options.');
      }
      if (uniqueOptions.length > 8) {
        throw new Error('An investigation can list at most eight options.');
      }
      patch.options = uniqueOptions;
    }

    if (input.checklist !== undefined) {
      patch.checklist = CommunityService.buildChecklistItems(input.checklist);
    }

    const updated = await this.repo.updateInvestigation(investigation.id, patch);
    if (!updated) throw new Error('The investigation could not be updated.');

    const [tally, checks] = await Promise.all([
      this.repo.getVoteTally(updated.id),
      this.repo.listInvestigationChecks(updated.id),
    ]);
    logger.info('Community investigation edited', { publicId: updated.public_id });
    return this.toInvestigationSummary(
      updated,
      CommunityService.toVoteTally(tally),
      contributorHash,
      CommunityService.buildPublicChecklist(updated, checks, contributorHash)
    );
  }

  /**
   * Sets or clears the caller's check on one evidence request.
   *
   * A check is a statement of availability ("I can provide this"), never a
   * verdict on the investigation. It is recorded once per contributor per item,
   * so re-checking cannot inflate the count.
   */
  async toggleChecklist(
    input: { investigationPublicId: string; itemId: string; checked: boolean },
    contributorHash: string
  ): Promise<{ checked: boolean; check_count: number; message: string }> {
    const investigation = await this.repo.findInvestigationByPublicId(input.investigationPublicId);
    if (!investigation) throw new CommunityNotFoundError('That investigation could not be found.');

    const items = investigation.checklist ?? [];
    const itemId = CommunityService.clampText(input.itemId, 40);
    if (!itemId || !items.some((item) => item.id === itemId)) {
      throw new Error('That checklist item is not on this investigation.');
    }

    const result = await this.repo.setInvestigationCheck(
      investigation.id,
      itemId,
      contributorHash,
      input.checked
    );
    return {
      ...result,
      message: result.checked
        ? 'Marked as something you can provide. This is not a verification.'
        : 'Removed your check from this item.',
    };
  }

  /**
   * Records a participant's single vote.
   *
   * Duplicate protection is a database unique constraint on
   * (investigation_id, contributor_hash); re-submitting the same option is a
   * no-op, and changing it replaces the previous vote rather than adding one.
   */
  async castVote(
    input: { investigationPublicId: string; option: string },
    contributorHash: string
  ): Promise<{ option: string; changed: boolean; message: string }> {
    this.assertWithinRateLimit(contributorHash, 'vote');

    const option = CommunityService.clampText(input.option, 80);
    if (!option) throw new Error('A vote option is required.');

    const investigation = await this.repo.findInvestigationByPublicId(input.investigationPublicId);
    if (!investigation) throw new Error('That investigation could not be found.');

    // When the opener set fixed choices, only those choices are valid. A vote is
    // only meaningful if everyone is answering the same question the same way.
    const options = investigation.options ?? [];
    if (options.length > 0 && !options.includes(option)) {
      throw new Error('That is not one of the options on this investigation.');
    }

    const result = await this.repo.castVote({ investigationId: investigation.id, option }, contributorHash);

    return {
      ...result,
      message: result.changed
        ? 'Your vote was recorded.'
        : 'You had already selected that option. Your vote was not counted twice.',
    };
  }

  private toInvestigationSummary(
    record: CommunityInvestigationRecord,
    tally: VoteTally[],
    viewerHash?: string | null,
    checklist: PublicChecklistItem[] = []
  ): PublicInvestigationSummary {
    return {
      public_id: record.public_id,
      question: record.question,
      status: record.status,
      site_id: record.site_id,
      observation_id: record.observation_id,
      passport_id: null,
      site_code: null,
      participant_count: record.participant_count ?? 0,
      evidence_count: record.evidence_count ?? 0,
      vote_count: record.vote_count ?? 0,
      research_interest: record.research_interest ?? false,
      options: record.options ?? [],
      checklist,
      context: record.context ?? null,
      category: record.category ?? null,
      media_ids: record.media_ids ?? [],
      vote_distribution: tally,
      opened_by_handle: record.opened_by_hash ? publicContributorHandle(record.opened_by_hash) : null,
      // Ownership is only ever a presentation hint. The update endpoint checks
      // the contributor hash again, so forging it here would change nothing.
      viewer_is_owner: Boolean(
        viewerHash && record.opened_by_hash && viewerHash === record.opened_by_hash
      ),
      is_demo: record.is_demo === true,
      created_at: record.created_at,
      updated_at: record.updated_at,
      disclaimer: COMMUNITY_DISCLAIMER,
    };
  }

  // ==========================================================================
  // Evidence
  // ==========================================================================

  async submitEvidence(
    input: SubmitEvidenceInput,
    contributorHash: string
  ): Promise<PublicEvidenceItem> {
    this.assertWithinRateLimit(contributorHash, 'evidence');

    const explanation = CommunityService.clampText(input.explanation, 1500);
    const record = await this.repo.addEvidence({ ...input, explanation }, contributorHash);
    return CommunityService.toEvidenceDto(record);
  }

  async listEvidence(filter: {
    siteId?: string;
    investigationId?: string;
    observationId?: string;
  }): Promise<PublicEvidenceItem[]> {
    const rows = await this.repo.listEvidence(filter);
    return rows.map(CommunityService.toEvidenceDto);
  }

  // ==========================================================================
  // Questions and answers
  // ==========================================================================

  async askQuestion(input: AskQuestionInput, contributorHash: string): Promise<PublicQuestionSummary> {
    this.assertWithinRateLimit(contributorHash, 'question');

    const question = CommunityService.clampText(input.question, 500);
    if (!question) throw new Error('A question is required.');

    const record = await this.repo.askQuestion({ ...input, question }, contributorHash);
    return CommunityService.toQuestionSummary(record);
  }

  async listQuestions(options: {
    siteId?: string;
    investigationId?: string;
    observationId?: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: PublicQuestionSummary[]; total: number }> {
    const { rows, total } = await this.repo.listQuestions(options);
    return { rows: rows.map(CommunityService.toQuestionSummary), total };
  }

  async getQuestion(publicId: string): Promise<PublicQuestionDetail | null> {
    const record = await this.repo.findQuestionByPublicId(publicId);
    if (!record || record.is_public === false) return null;

    const answers = await this.repo.listAnswers(record.id);
    return {
      ...CommunityService.toQuestionSummary(record),
      answers: answers.map(CommunityService.toAnswerDto),
    };
  }

  async postAnswer(
    input: {
      questionPublicId: string;
      answer: string;
      evidence_id?: string | null;
      mediaIds?: string[];
      isExpert?: boolean;
    },
    contributorHash: string
  ): Promise<PublicAnswerItem> {
    this.assertWithinRateLimit(contributorHash, 'answer');

    const answer = CommunityService.clampText(input.answer, 2000);
    if (!answer) throw new Error('An answer is required.');

    const question = await this.repo.findQuestionByPublicId(input.questionPublicId);
    if (!question) throw new Error('That question could not be found.');

    const record = await this.repo.postAnswer(
      {
        questionId: question.id,
        answer,
        evidenceId: input.evidence_id ?? null,
        mediaIds: input.mediaIds ?? [],
        isExpert: input.isExpert === true,
      },
      contributorHash
    );
    return CommunityService.toAnswerDto(record);
  }

  // ==========================================================================
  // Visits
  // ==========================================================================

  async recordVisit(input: RecordVisitInput, contributorHash: string): Promise<PublicVisitSummary> {
    this.assertWithinRateLimit(contributorHash, 'visit');

    const notes = CommunityService.clampText(input.notes, 2000);
    const record = await this.repo.recordVisit({ ...input, notes }, contributorHash);
    return CommunityService.toVisitDto(record);
  }

  async listVisits(siteId: string, limit = 50): Promise<PublicVisitSummary[]> {
    const rows = await this.repo.listVisits(siteId, limit);
    return rows.map(CommunityService.toVisitDto);
  }

  // ==========================================================================
  // Reputation
  // ==========================================================================

  /**
   * Returns a participant's contribution profile.
   *
   * Reputation measures participation only. No accuracy, correctness or
   * scientific-authority score is computed, and the disclaimer travels with the
   * payload so it cannot be dropped by a client rendering the handle alone.
   */
  async getReputation(contributorHash: string): Promise<PublicReputationSummary> {
    const handle = publicContributorHandle(contributorHash);

    if (!contributorHash) {
      return {
        public_handle: 'Anonymous Contributor',
        observations_count: 0,
        evidence_count: 0,
        votes_count: 0,
        questions_count: 0,
        answers_count: 0,
        visits_count: 0,
        investigations_count: 0,
        districts_represented: 0,
        achievements: [],
        disclaimer: REPUTATION_DISCLAIMER,
      };
    }

    const record = await this.repo.refreshReputation(contributorHash, handle);
    if (!record) {
      return {
        public_handle: handle,
        observations_count: 0,
        evidence_count: 0,
        votes_count: 0,
        questions_count: 0,
        answers_count: 0,
        visits_count: 0,
        investigations_count: 0,
        districts_represented: 0,
        achievements: [],
        disclaimer: REPUTATION_DISCLAIMER,
      };
    }

    return {
      public_handle: record.public_handle ?? handle,
      observations_count: record.observations_count,
      evidence_count: record.evidence_count,
      votes_count: record.votes_count,
      questions_count: record.questions_count,
      answers_count: record.answers_count,
      visits_count: record.visits_count,
      investigations_count: record.investigations_count,
      districts_represented: record.districts_represented,
      achievements: record.achievements,
      disclaimer: REPUTATION_DISCLAIMER,
    };
  }

  // ==========================================================================
  // Site Explorer
  // ==========================================================================

  /**
   * Builds the complete Site Explorer payload in one call.
   *
   * The AI interpretation, the community record and any expert review are
   * returned as three separate blocks and are never merged. This is the
   * distinction the whole platform rests on.
   */
  async buildSiteExplorer(siteId: string): Promise<SiteExplorerPayload | null> {
    const site = await this.sites.findSiteById(siteId);
    if (!site || site.is_public === false || site.status !== 'active') return null;

    const [publicSummary, observations, investigations, questions, evidence, visits] = await Promise.all([
      // Authoritative aggregates from the public view. The local fallback is
      // used only when that read is unavailable, so the explorer never reports
      // a site as empty just because the aggregate view could not be read.
      this.sites.findPublicSiteSummaryById(siteId),
      this.sites.listObservationsForSite(siteId),
      this.repo.listInvestigations({ siteId, limit: 50, offset: 0 }),
      this.repo.listQuestions({ siteId, limit: 50, offset: 0 }),
      this.repo.listEvidence({ siteId }),
      this.repo.listVisits(siteId),
    ]);

    const summary = publicSummary ?? this.buildSummaryFromLoadedRows(site, {
      observationCount: observations.length,
      investigationCount: investigations.total,
      questionCount: questions.total,
      visitCount: visits.length,
      evidenceCount: evidence.length,
      highestEvidenceState: this.deriveEvidenceState({
        substantiveEvidenceCount: evidence.length,
        distinctParticipants: investigations.rows.reduce(
          (max, i) => Math.max(max, i.participant_count ?? 0),
          0
        ),
      }),
    });

    const observationRefs: PublicObservationRef[] = observations.map((row: any) =>
      this.mapObservationRef(row)
    );

    // AI block comes from the earliest real observation, and is labelled as such.
    const aiBlock = observations.length > 0 ? this.buildAiBlock(observations[0]) : null;

    // Community block aggregates real rows only.
    const voteCount = investigations.rows.reduce((sum, i) => sum + (i.vote_count ?? 0), 0);
    const communityBlock: SiteCommunityBlock = {
      investigation_count: investigations.total,
      question_count: questions.total,
      evidence_count: evidence.length,
      visit_count: visits.length,
      vote_count: voteCount,
      participants: investigations.rows.reduce((max, i) => Math.max(max, i.participant_count ?? 0), 0),
      vote_distribution: [],
      note: COMMUNITY_DISCLAIMER,
    };

    const expertBlock = await this.buildExpertBlock(siteId);

    const timeline = this.buildTimeline({
      observations,
      investigations: investigations.rows,
      questions: questions.rows,
      evidence,
      visits,
    });

    const origin = observationRefs.find((o) => o.latitude !== null && o.longitude !== null);
    const nearby: NearbyObservation[] = origin
      ? await this.loadNearby(origin.latitude as number, origin.longitude as number, observationRefs[0]?.passport_id)
      : [];

    return {
      site: summary,
      observations: observationRefs,
      timeline,
      nearby,
      ai_interpretation: aiBlock,
      community: communityBlock,
      expert_review: expertBlock,
    };
  }

  /**
   * Builds a site summary from the raw site record plus already-loaded counts.
   *
   * This is the fallback path used only when the aggregated
   * `public_geological_sites` row cannot be read. Counts come from the rows
   * actually loaded, so they understate rather than invent: a site with more
   * contributions than fit in the loaded page will show the lower number.
   */
  private buildSummaryFromLoadedRows(
    site: any,
    counts: {
      observationCount: number;
      investigationCount: number;
      questionCount: number;
      visitCount: number;
      evidenceCount: number;
      highestEvidenceState: EvidenceState | null;
    }
  ): import('../types/site.types.js').PublicSiteSummary {
    const coords = resolvePublicCoordinates({
      precision: site.public_location_precision,
      district: site.district ? normalizeDistrictName(site.district) : null,
      latitude: site.latitude,
      longitude: site.longitude,
    });

    return {
      site_id: String(site.id),
      site_code: String(site.site_code),
      title: String(site.title ?? 'Untitled site'),
      description: site.description ?? null,
      grouping_basis: site.grouping_basis ?? 'suggested',
      district: site.district ?? null,
      sector: site.sector ?? null,
      location_precision: site.public_location_precision ?? 'district',
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      observation_count: counts.observationCount,
      visit_count: counts.visitCount,
      investigation_count: counts.investigationCount,
      question_count: counts.questionCount,
      evidence_count: counts.evidenceCount,
      highest_evidence_state: counts.highestEvidenceState,
      observed_classifications: [],
      districts_covered: site.district ? [site.district] : [],
      created_at: String(site.created_at),
      updated_at: String(site.updated_at ?? site.created_at),
    };
  }

  private mapObservationRef(row: any): PublicObservationRef {
    // `public_observations` exposes no raw coordinate column. The view replaces
    // the true one with NULL unless the contributor published at exact
    // precision, and names what survives `public_latitude`/`public_longitude`.
    // Reading `latitude` here yields undefined, which the resolver then treats as
    // "no coordinate" and silently relocates the record to its district centre.
    const coords = resolvePublicCoordinates({
      precision: row.public_location_precision ?? 'district',
      district: row.district,
      latitude: row.public_latitude,
      longitude: row.public_longitude,
    });

    return {
      passport_id: String(row.passport_id),
      observation_category: row.observation_category ?? 'unknown',
      observation_subcategory: row.observation_subcategory ?? 'unknown',
      classification: row.primary_classification as RockClassification,
      possible_name: row.possible_name ?? null,
      confidence: row.confidence,
      confidence_score: Number(row.confidence_score ?? 0),
      evidence_state: this.resolveStoredEvidenceState(row.evidence_state, {
        hasExpertReview: row.verification_status === 'expert_verified',
      }),
      district: row.district ?? null,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      created_at: String(row.created_at),
    };
  }

  private buildAiBlock(row: any): AiInterpretationBlock | null {
    if (!row) return null;
    return {
      passport_id: String(row.passport_id),
      is_rock: Boolean(row.is_rock ?? true),
      primary_classification: row.primary_classification,
      possible_name: row.possible_name ?? null,
      confidence: row.confidence,
      confidence_score: Number(row.confidence_score ?? 0),
      observed_features: row.observed_features ?? [],
      reasoning: row.reasoning ?? '',
      alternative_possibilities: row.alternative_possibilities ?? [],
      limitations: row.limitations ?? [],
      recommended_next_steps: row.recommended_next_steps ?? [],
      safety_note: row.safety_note ?? AI_DISCLAIMER,
      ai_model: row.ai_model ?? 'unknown',
      disclaimer: AI_DISCLAIMER,
    };
  }

  /**
   * Loads the latest expert review for a site.
   *
   * `reviewer_label` is only replaced with the named reviewer when that review
   * was explicitly published. Otherwise the public sees "Expert reviewed", which
   * is the honest description of a review whose author the platform cannot verify.
   */
  private async buildExpertBlock(siteId: string): Promise<ExpertReviewBlock | null> {
    try {
      const { supabase } = await import('../config/supabase.js');
      const { data, error } = await (supabase.from('public_expert_reviews') as any)
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error || !Array.isArray(data) || data.length === 0) return null;

      const row = data[0] as any;
      return {
        reviewer_label: row.identity_published ? row.reviewer_name : 'Expert reviewed',
        identity_published: Boolean(row.identity_published),
        status: row.status,
        expert_classification: row.expert_classification ?? null,
        expert_rock_name: row.expert_rock_name ?? null,
        expert_confidence: row.expert_confidence ?? null,
        expert_observed_features: row.expert_observed_features ?? [],
        expert_notes: row.expert_notes ?? null,
        scientific_remarks: row.scientific_remarks ?? null,
        evidence_basis: row.evidence_basis ?? null,
        review_date: row.review_date ?? null,
        created_at: String(row.created_at),
      };
    } catch (err) {
      logger.warn('Could not load expert review block', { error: String(err) });
      return null;
    }
  }

  /**
   * Builds the site activity feed.
   *
   * Every entry corresponds to a real stored row. There is no code path that
   * emits a timeline entry without an underlying record.
   */
  private buildTimeline(input: {
    observations: any[];
    investigations: CommunityInvestigationRecord[];
    questions: CommunityQuestionRecord[];
    evidence: CommunityEvidenceRecord[];
    visits: CommunityVisitRecord[];
  }): SiteTimelineEntry[] {
    const entries: SiteTimelineEntry[] = [];

    for (const obs of input.observations) {
      entries.push({
        event_type: 'observation',
        event_at: String(obs.created_at),
        ref_id: String(obs.passport_id),
        summary: `Observation ${obs.passport_id} recorded`,
      });
    }
    for (const inv of input.investigations) {
      entries.push({
        event_type: 'investigation',
        event_at: inv.created_at,
        ref_id: inv.public_id,
        summary: `Community investigation opened: ${inv.question}`,
      });
    }
    for (const ev of input.evidence) {
      entries.push({
        event_type: 'evidence',
        event_at: ev.created_at,
        ref_id: ev.id,
        summary: `${ev.evidence_type.replace(/_/g, ' ')} evidence contributed`,
      });
    }
    for (const q of input.questions) {
      entries.push({
        event_type: 'question',
        event_at: q.created_at,
        ref_id: q.public_id,
        summary: `Question asked: ${q.question}`,
      });
    }
    for (const v of input.visits) {
      entries.push({
        event_type: 'visit',
        event_at: v.created_at,
        ref_id: v.id,
        summary: `Site visited on ${v.visited_on}`,
      });
    }

    return entries.sort((a, b) => new Date(b.event_at).getTime() - new Date(a.event_at).getTime());
  }

  private async loadNearby(
    latitude: number,
    longitude: number,
    excludePassportId?: string
  ): Promise<NearbyObservation[]> {
    const rows = await this.sites.findNearbyObservations(latitude, longitude, 25, excludePassportId, 25);

    // Same contract as mapObservationRef: the view publishes only the gated
    // coordinate columns, and the row's own stored evidence state outranks a
    // re-derivation from its verification flag.
    return rows.map((row: any) => {
      const coords = resolvePublicCoordinates({
        precision: row.public_location_precision ?? 'district',
        district: row.district,
        latitude: row.public_latitude,
        longitude: row.public_longitude,
      });

      return {
        passport_id: String(row.passport_id),
        observation_category: row.observation_category ?? 'unknown',
        observation_subcategory: row.observation_subcategory ?? 'unknown',
        classification: row.primary_classification as RockClassification,
        possible_name: row.possible_name ?? null,
        confidence: row.confidence,
        evidence_state: this.resolveStoredEvidenceState(row.evidence_state, {
          hasExpertReview: row.verification_status === 'expert_verified',
        }),
        district: row.district ?? null,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        created_at: String(row.created_at),
        distance_km: Number(row.distance_km ?? 0),
      };
    });
  }
}

/** Thrown when a participant exceeds the community action rate limit. */
export class CommunityRateLimitError extends Error {
  constructor() {
    super('Too many community actions from this participant. Please wait a moment and try again.');
    this.name = 'CommunityRateLimitError';
  }
}

/** Thrown when the caller lacks the contributor identity a write requires. */
export class CommunityForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommunityForbiddenError';
  }
}

/** Thrown when a community record the caller addressed does not exist. */
export class CommunityNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommunityNotFoundError';
  }
}

export const communityService = new CommunityService();