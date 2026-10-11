import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { publicContributorHandle } from '../utils/contributor.js';
import {
  buildDemoCommunityData,
  type DemoCommunityData,
} from '../data/demo-community.js';
import type {
  Achievement,
  AskQuestionInput,
  CastVoteInput,
  CommunityAnswerRecord,
  CommunityEvidenceRecord,
  CommunityEvidenceType,
  CommunityInvestigationRecord,
  CommunityQuestionRecord,
  CommunityReputationRecord,
  CommunityVisitRecord,
  CommunityVoteRecord,
  CreateInvestigationInput,
  InvestigationChecklistItem,
  InvestigationStatus,
  ModerationStatus,
  PostAnswerInput,
  RecordVisitInput,
  SubmitEvidenceInput,
} from '../types/community.types.js';

/**
 * Community Discovery repository.
 *
 * Every method reads or writes real database rows when a database is
 * configured.
 *
 * There is deliberately NO in-memory seed and NO synthetic fallback for real
 * deployments. When the database is not configured, reads return empty results
 * and writes throw. A platform that invents community activity is worse than one
 * that admits it has none, because a fabricated vote or visit is
 * indistinguishable from a real one once it reaches the public API.
 *
 * The single exception is the labelled demonstration mode: when
 * `DEMO_POSTS_ENABLED` is true AND no real database is configured, the methods
 * serve and mutate an in-memory copy of `src/data/demo-community.ts`. Every
 * demonstration record is marked `is_demo`, nothing is written into any
 * database, and the public DTOs carry `is_demo: true` so a client can label the
 * content as demonstration material.
 */
export class CommunityRepository {
  /** True when real Supabase credentials are present. */
  private get ready(): boolean {
    return isDatabaseConfigured();
  }

  /**
   * True when the labelled demonstration store should be served.
   *
   * Demonstration content must never mix with a real deployed community, so
   * this is true only when demonstration content is enabled AND no real
   * database exists to be polluted.
   */
  get demoActive(): boolean {
    return env.DEMO_POSTS_ENABLED && !isDatabaseConfigured();
  }

  private demoInvestigations: CommunityInvestigationRecord[] = [];
  private demoVotes: CommunityVoteRecord[] = [];
  private demoEvidence: CommunityEvidenceRecord[] = [];
  private demoQuestions: CommunityQuestionRecord[] = [];
  private demoAnswers: CommunityAnswerRecord[] = [];
  private demoVisits: CommunityVisitRecord[] = [];
  /** The demonstration checklist check-offs, keyed by investigation + item. */
  private demoChecklistChecks: Array<{
    investigation_id: string;
    item_id: string;
    contributor_hash: string;
  }> = [];

  private demoCounter = 1000;

  /** Replaces the whole demonstration store. Safe to call more than once. */
  registerDemoCommunityData(data: DemoCommunityData): number {
    this.demoInvestigations = data.investigations;
    this.demoVotes = data.votes;
    this.demoEvidence = data.evidence;
    this.demoQuestions = data.questions;
    this.demoAnswers = data.answers;
    this.demoVisits = data.visits;
    this.demoChecklistChecks = [];
    return (
      this.demoInvestigations.length +
      this.demoVotes.length +
      this.demoEvidence.length +
      this.demoQuestions.length +
      this.demoAnswers.length +
      this.demoVisits.length
    );
  }

  /** Contribution counters for a demonstration site, for the site summary. */
  demoSiteCounts(siteId: string): {
    investigation_count: number;
    question_count: number;
    evidence_count: number;
    visit_count: number;
    vote_count: number;
    participants: number;
  } {
    const investigations = this.demoInvestigations.filter((i) => i.site_id === siteId);
    const participants = investigations.reduce((max, i) => Math.max(max, i.participant_count ?? 0), 0);
    return {
      investigation_count: investigations.length,
      question_count: this.demoQuestions.filter((q) => q.site_id === siteId).length,
      evidence_count: this.demoEvidence.filter((e) => e.site_id === siteId && e.moderation_status === 'visible').length,
      visit_count: this.demoVisits.filter((v) => v.site_id === siteId).length,
      vote_count: investigations.reduce((sum, i) => sum + (i.vote_count ?? 0), 0),
      participants,
    };
  }

  private nextDemoId(prefix: string): string {
    this.demoCounter += 1;
    return `${prefix}-${this.demoCounter}`;
  }

  private requireDatabase(operation: string): void {
    if (!this.ready && !this.demoActive) {
      throw new Error(
        `Community ${operation} requires a configured database. ` +
          'Set SUPABASE_URL and SUPABASE_SECRET_KEY and run migration 011_community_sites_gis.sql.'
      );
    }
  }

  // ==========================================================================
  // Investigations
  // ==========================================================================

  async createInvestigation(
    input: CreateInvestigationInput & { checklistItems?: InvestigationChecklistItem[] },
    openedByHash: string | null
  ): Promise<CommunityInvestigationRecord> {
    this.requireDatabase('investigation creation');

    const question = input.question.trim();
    if (!question) throw new Error('An investigation question is required.');
    if (!input.siteId && !input.observationId) {
      throw new Error('An investigation must be attached to a geological site or an observation.');
    }

    if (this.demoActive) {
      this.demoCounter += 1;
      const record: CommunityInvestigationRecord = {
        id: this.nextDemoId('demo-inv'),
        public_id: `ET-INV-DEMO-${String(this.demoCounter).padStart(4, '0')}`,
        site_id: input.siteId ?? null,
        observation_id: input.observationId ?? null,
        question,
        status: 'open',
        opened_by_hash: openedByHash,
        is_public: input.isPublic !== false,
        participant_count: 0,
        evidence_count: 0,
        vote_count: 0,
        research_interest: input.researchInterest === true,
        options: input.options ?? [],
        checklist: input.checklistItems ?? [],
        context: input.context ?? null,
        category: input.category ?? null,
        media_ids: input.mediaIds ?? [],
        is_demo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.demoInvestigations.unshift(record);
      return record;
    }

    const { data, error } = await (supabase.from('community_investigations') as any)
      .insert({
        site_id: input.siteId ?? null,
        observation_id: input.observationId ?? null,
        question,
        status: 'open',
        opened_by_hash: openedByHash,
        is_public: input.isPublic !== false,
        research_interest: input.researchInterest === true,
        options: input.options ?? [],
        checklist: input.checklistItems ?? [],
        context: input.context ?? null,
        category: input.category ?? null,
        media_ids: input.mediaIds ?? [],
      })
      .select()
      .single();

    if (error || !data) throw new Error(`Could not create investigation: ${error?.message ?? 'unknown error'}`);
    return data as CommunityInvestigationRecord;
  }

  async findInvestigationByPublicId(publicId: string): Promise<CommunityInvestigationRecord | null> {
    if (!this.ready && !this.demoActive) return null;
    const clean = publicId.trim().toUpperCase();
    if (!clean) return null;

    if (this.demoActive) {
      return this.demoInvestigations.find((i) => i.public_id === clean) ?? null;
    }

    const { data, error } = await (supabase.from('community_investigations') as any)
      .select('*')
      .eq('public_id', clean)
      .maybeSingle();

    if (error) {
      logger.warn('Failed to read investigation', { error: error.message });
      return null;
    }
    return (data as CommunityInvestigationRecord) ?? null;
  }

  async findInvestigationById(id: string): Promise<CommunityInvestigationRecord | null> {
    if (!this.ready && !this.demoActive) return null;

    if (this.demoActive) {
      return this.demoInvestigations.find((i) => i.id === id) ?? null;
    }

    const { data, error } = await (supabase.from('community_investigations') as any)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      logger.warn('Failed to read investigation by id', { error: error.message });
      return null;
    }
    return (data as CommunityInvestigationRecord) ?? null;
  }

  async listInvestigations(options: {
    status?: InvestigationStatus;
    siteId?: string;
    observationId?: string;
    researchInterestOnly?: boolean;
    limit: number;
    offset: number;
  }): Promise<{ rows: CommunityInvestigationRecord[]; total: number }> {
    if (!this.ready && !this.demoActive) return { rows: [], total: 0 };

    if (this.demoActive) {
      let rows = this.demoInvestigations.filter((i) => i.is_public !== false);
      if (options.status) rows = rows.filter((i) => i.status === options.status);
      if (options.siteId) rows = rows.filter((i) => i.site_id === options.siteId);
      if (options.observationId) rows = rows.filter((i) => i.observation_id === options.observationId);
      if (options.researchInterestOnly) rows = rows.filter((i) => i.research_interest === true);
      rows = [...rows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return { rows: rows.slice(options.offset, options.offset + options.limit), total: rows.length };
    }

    let query = (supabase.from('community_investigations') as any)
      .select('*', { count: 'exact' })
      .eq('is_public', true);

    if (options.status) query = query.eq('status', options.status);
    if (options.siteId) query = query.eq('site_id', options.siteId);
    if (options.observationId) query = query.eq('observation_id', options.observationId);
    if (options.researchInterestOnly) query = query.eq('research_interest', true);

    query = query
      .order('created_at', { ascending: false })
      .range(options.offset, options.offset + options.limit - 1);

    const { data, count, error } = await query;
    if (error) {
      logger.warn('Failed to list investigations', { error: error.message });
      return { rows: [], total: 0 };
    }
    return { rows: (data as CommunityInvestigationRecord[]) ?? [], total: count ?? 0 };
  }

  async setInvestigationStatus(id: string, status: InvestigationStatus): Promise<CommunityInvestigationRecord | null> {
    this.requireDatabase('status update');

    if (this.demoActive) {
      const record = this.demoInvestigations.find((i) => i.id === id);
      if (!record) return null;
      record.status = status;
      record.updated_at = new Date().toISOString();
      return record;
    }

    const { data, error } = await (supabase.from('community_investigations') as any)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw new Error(`Could not update investigation: ${error.message}`);
    return (data as CommunityInvestigationRecord) ?? null;
  }

  async setInvestigationModeration(
    id: string,
    patch: { is_public?: boolean; research_interest?: boolean }
  ): Promise<CommunityInvestigationRecord | null> {
    this.requireDatabase('moderation');

    if (this.demoActive) {
      const record = this.demoInvestigations.find((i) => i.id === id);
      if (!record) return null;
      if (patch.is_public !== undefined) record.is_public = patch.is_public;
      if (patch.research_interest !== undefined) record.research_interest = patch.research_interest;
      record.updated_at = new Date().toISOString();
      return record;
    }

    const { data, error } = await (supabase.from('community_investigations') as any)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw new Error(`Could not moderate investigation: ${error.message}`);
    return (data as CommunityInvestigationRecord) ?? null;
  }

  /**
   * Applies an opener's corrections to a published investigation.
   *
   * Only content fields are writable here; status, moderation and counters are
   * managed by the dedicated methods above, and the site/observation are never
   * moved once people have voted.
   */
  async updateInvestigation(
    id: string,
    patch: {
      question?: string;
      context?: string | null;
      category?: string | null;
      options?: string[];
      checklist?: InvestigationChecklistItem[];
      researchInterest?: boolean;
    }
  ): Promise<CommunityInvestigationRecord | null> {
    this.requireDatabase('investigation edit');

    if (this.demoActive) {
      const record = this.demoInvestigations.find((i) => i.id === id);
      if (!record) return null;
      if (patch.question !== undefined) record.question = patch.question;
      if (patch.context !== undefined) record.context = patch.context;
      if (patch.category !== undefined) record.category = patch.category;
      if (patch.options !== undefined) record.options = patch.options;
      if (patch.checklist !== undefined) record.checklist = patch.checklist;
      if (patch.researchInterest !== undefined) record.research_interest = patch.researchInterest;
      record.updated_at = new Date().toISOString();
      return record;
    }

    const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.question !== undefined) dbPatch.question = patch.question;
    if (patch.context !== undefined) dbPatch.context = patch.context;
    if (patch.category !== undefined) dbPatch.category = patch.category;
    if (patch.options !== undefined) dbPatch.options = patch.options;
    if (patch.checklist !== undefined) dbPatch.checklist = patch.checklist;
    if (patch.researchInterest !== undefined) dbPatch.research_interest = patch.researchInterest;

    const { data, error } = await (supabase.from('community_investigations') as any)
      .update(dbPatch)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw new Error(`Could not update investigation: ${error.message}`);
    return (data as CommunityInvestigationRecord) ?? null;
  }

  // ==========================================================================
  // Votes (spec section 32: one vote per contributor per investigation)
  // ==========================================================================

  /**
   * Records or replaces a contributor's single vote.
   *
   * Duplicate protection is enforced by the `community_votes_one_per_contributor`
   * unique constraint rather than by a read-then-write check, so two concurrent
   * requests cannot both insert.
   *
   * Returns `changed: false` when the contributor re-submits the same option.
   */
  async castVote(
    input: CastVoteInput,
    contributorHash: string
  ): Promise<{ option: string; changed: boolean }> {
    this.requireDatabase('vote');

    const existing = await this.findVote(input.investigationId, contributorHash);
    if (existing && existing.option === input.option) {
      return { option: input.option, changed: false };
    }

    if (this.demoActive) {
      if (existing) {
        existing.option = input.option;
        existing.updated_at = new Date().toISOString();
      } else {
        this.demoVotes.push({
          id: this.nextDemoId('demo-vote'),
          investigation_id: input.investigationId,
          contributor_hash: contributorHash,
          option: input.option,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      await this.recountInvestigation(input.investigationId);
      return { option: input.option, changed: true };
    }

    const { error } = await (supabase.from('community_votes') as any).upsert(
      {
        investigation_id: input.investigationId,
        contributor_hash: contributorHash,
        option: input.option,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'investigation_id,contributor_hash' }
    );

    if (error) throw new Error(`Could not record vote: ${error.message}`);

    await this.recountInvestigation(input.investigationId);
    return { option: input.option, changed: true };
  }

  async findVote(investigationId: string, contributorHash: string): Promise<CommunityVoteRecord | null> {
    if (!this.ready && !this.demoActive) return null;

    if (this.demoActive) {
      return (
        this.demoVotes.find(
          (v) => v.investigation_id === investigationId && v.contributor_hash === contributorHash
        ) ?? null
      );
    }

    const { data, error } = await (supabase.from('community_votes') as any)
      .select('*')
      .eq('investigation_id', investigationId)
      .eq('contributor_hash', contributorHash)
      .maybeSingle();

    if (error) {
      logger.warn('Failed to read existing vote', { error: error.message });
      return null;
    }
    return (data as CommunityVoteRecord) ?? null;
  }

  /** Real aggregate tally. Empty array when nobody has voted. */
  async getVoteTally(investigationId: string): Promise<Array<{ option: string; count: number }>> {
    if (!this.ready && !this.demoActive) return [];

    if (this.demoActive) {
      const counts = new Map<string, number>();
      for (const vote of this.demoVotes) {
        if (vote.investigation_id !== investigationId) continue;
        counts.set(vote.option, (counts.get(vote.option) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .map(([option, count]) => ({ option, count }))
        .sort((a, b) => b.count - a.count || a.option.localeCompare(b.option));
    }

    const { data, error } = await (supabase.from('community_votes') as any)
      .select('option')
      .eq('investigation_id', investigationId);

    if (error) {
      logger.warn('Failed to tally votes', { error: error.message });
      return [];
    }

    const counts = new Map<string, number>();
    for (const row of (data ?? []) as Array<{ option: string }>) {
      counts.set(row.option, (counts.get(row.option) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([option, count]) => ({ option, count }))
      .sort((a, b) => b.count - a.count || a.option.localeCompare(b.option));
  }

  async countDistinctParticipants(investigationId: string): Promise<number> {
    if (!this.ready && !this.demoActive) return 0;

    if (this.demoActive) {
      return new Set(
        this.demoVotes
          .filter((v) => v.investigation_id === investigationId)
          .map((v) => v.contributor_hash)
      ).size;
    }

    const { data, error } = await (supabase.from('community_votes') as any)
      .select('contributor_hash')
      .eq('investigation_id', investigationId);

    if (error) {
      logger.warn('Failed to count participants', { error: error.message });
      return 0;
    }
    return new Set(((data ?? []) as Array<{ contributor_hash: string }>).map((r) => r.contributor_hash)).size;
  }

  // ==========================================================================
  // Investigation checklist check-offs
  // ==========================================================================

  /**
   * Every check recorded on an investigation, one row per (item, contributor).
   *
   * A check means "I can provide this", never "this was verified". The list is
   * aggregated into counts and a per-viewer flag; the contributor hash is never
   * returned to a client.
   */
  async listInvestigationChecks(
    investigationId: string
  ): Promise<Array<{ item_id: string; contributor_hash: string }>> {
    if (!this.ready && !this.demoActive) return [];

    if (this.demoActive) {
      return this.demoChecklistChecks
        .filter((c) => c.investigation_id === investigationId)
        .map((c) => ({ item_id: c.item_id, contributor_hash: c.contributor_hash }));
    }

    const { data, error } = await (supabase.from('community_investigation_checks') as any)
      .select('item_id, contributor_hash')
      .eq('investigation_id', investigationId);

    if (error) {
      logger.warn('Failed to read investigation checklist', { error: error.message });
      return [];
    }
    return (data ?? []) as Array<{ item_id: string; contributor_hash: string }>;
  }

  /**
   * Sets or clears one contributor's check on one checklist item.
   *
   * Duplicate protection is the unique (investigation_id, item_id,
   * contributor_hash) constraint, so a double tap cannot inflate the count.
   */
  async setInvestigationCheck(
    investigationId: string,
    itemId: string,
    contributorHash: string,
    checked: boolean
  ): Promise<{ checked: boolean; check_count: number }> {
    this.requireDatabase('checklist update');

    if (this.demoActive) {
      const index = this.demoChecklistChecks.findIndex(
        (c) =>
          c.investigation_id === investigationId &&
          c.item_id === itemId &&
          c.contributor_hash === contributorHash
      );
      if (checked && index === -1) {
        this.demoChecklistChecks.push({
          investigation_id: investigationId,
          item_id: itemId,
          contributor_hash: contributorHash,
        });
      } else if (!checked && index !== -1) {
        this.demoChecklistChecks.splice(index, 1);
      }
      const count = this.demoChecklistChecks.filter(
        (c) => c.investigation_id === investigationId && c.item_id === itemId
      ).length;
      return { checked, check_count: count };
    }

    if (checked) {
      const { error } = await (supabase.from('community_investigation_checks') as any).upsert(
        {
          investigation_id: investigationId,
          item_id: itemId,
          contributor_hash: contributorHash,
        },
        { onConflict: 'investigation_id,item_id,contributor_hash' }
      );
      if (error) throw new Error(`Could not update checklist: ${error.message}`);
    } else {
      const { error } = await (supabase.from('community_investigation_checks') as any)
        .delete()
        .eq('investigation_id', investigationId)
        .eq('item_id', itemId)
        .eq('contributor_hash', contributorHash);
      if (error) throw new Error(`Could not update checklist: ${error.message}`);
    }

    const { count, error: countError } = await (supabase.from('community_investigation_checks') as any)
      .select('item_id', { count: 'exact', head: true })
      .eq('investigation_id', investigationId)
      .eq('item_id', itemId);

    if (countError) {
      logger.warn('Failed to count checklist checks', { error: countError.message });
      return { checked, check_count: 0 };
    }
    return { checked, check_count: count ?? 0 };
  }

  // ==========================================================================
  // Evidence
  // ==========================================================================

  async addEvidence(
    input: SubmitEvidenceInput,
    contributorHash: string,
    moderationStatus: ModerationStatus = 'visible'
  ): Promise<CommunityEvidenceRecord> {
    this.requireDatabase('evidence');

    if (!input.investigationId && !input.siteId && !input.observationId) {
      throw new Error('Evidence must be attached to an investigation, site, or observation.');
    }

    if (this.demoActive) {
      const now = new Date().toISOString();
      const record: CommunityEvidenceRecord = {
        id: this.nextDemoId('demo-ev'),
        investigation_id: input.investigationId ?? null,
        site_id: input.siteId ?? null,
        observation_id: input.observationId ?? null,
        media_id: input.mediaId ?? null,
        media_ids: input.mediaIds ?? (input.mediaId ? [input.mediaId] : []),
        contributor_hash: contributorHash,
        evidence_type: input.evidenceType,
        explanation: input.explanation?.trim() || null,
        supports_evidence: input.supportsEvidence !== false,
        is_challenge: input.isChallenge === true,
        moderation_status: moderationStatus,
        created_at: now,
        updated_at: now,
      };
      this.demoEvidence.push(record);
      if (input.investigationId) await this.recountInvestigation(input.investigationId);
      return record;
    }

    const { data, error } = await (supabase.from('community_evidence') as any)
      .insert({
        investigation_id: input.investigationId ?? null,
        site_id: input.siteId ?? null,
        observation_id: input.observationId ?? null,
        media_id: input.mediaId ?? null,
        media_ids: input.mediaIds ?? (input.mediaId ? [input.mediaId] : []),
        contributor_hash: contributorHash,
        evidence_type: input.evidenceType,
        explanation: input.explanation?.trim() || null,
        supports_evidence: input.supportsEvidence !== false,
        is_challenge: input.isChallenge === true,
        moderation_status: moderationStatus,
      })
      .select()
      .single();

    if (error || !data) throw new Error(`Could not record evidence: ${error?.message ?? 'unknown error'}`);

    if (input.investigationId) await this.recountInvestigation(input.investigationId);
    return data as CommunityEvidenceRecord;
  }

  async listEvidence(filter: {
    investigationId?: string;
    siteId?: string;
    observationId?: string;
    includeHidden?: boolean;
  }): Promise<CommunityEvidenceRecord[]> {
    if (!this.ready && !this.demoActive) return [];

    if (this.demoActive) {
      let rows = this.demoEvidence.filter((e) => e.moderation_status === 'visible');
      if (filter.investigationId) rows = rows.filter((e) => e.investigation_id === filter.investigationId);
      if (filter.siteId) rows = rows.filter((e) => e.site_id === filter.siteId);
      if (filter.observationId) rows = rows.filter((e) => e.observation_id === filter.observationId);
      return [...rows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    let query = (supabase.from('community_evidence') as any)
      .select('*')
      .eq('moderation_status', 'visible');

    if (filter.investigationId) query = query.eq('investigation_id', filter.investigationId);
    if (filter.siteId) query = query.eq('site_id', filter.siteId);
    if (filter.observationId) query = query.eq('observation_id', filter.observationId);

    const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
    if (error) {
      logger.warn('Failed to list evidence', { error: error.message });
      return [];
    }
    return (data as CommunityEvidenceRecord[]) ?? [];
  }

  async setEvidenceModeration(id: string, status: ModerationStatus): Promise<CommunityEvidenceRecord | null> {
    this.requireDatabase('evidence moderation');

    if (this.demoActive) {
      const record = this.demoEvidence.find((e) => e.id === id);
      if (!record) return null;
      record.moderation_status = status;
      record.updated_at = new Date().toISOString();
      if (record.investigation_id) await this.recountInvestigation(record.investigation_id);
      return record;
    }

    const { data, error } = await (supabase.from('community_evidence') as any)
      .update({ moderation_status: status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw new Error(`Could not moderate evidence: ${error.message}`);
    return (data as CommunityEvidenceRecord) ?? null;
  }

  // ==========================================================================
  // Questions and answers
  // ==========================================================================

  async askQuestion(input: AskQuestionInput, contributorHash: string): Promise<CommunityQuestionRecord> {
    this.requireDatabase('question');

    const question = input.question.trim();
    if (!question) throw new Error('A question is required.');
    if (!input.siteId && !input.observationId && !input.investigationId) {
      throw new Error('A question must be attached to a site, observation, or investigation.');
    }

    if (this.demoActive) {
      this.demoCounter += 1;
      const now = new Date().toISOString();
      const record: CommunityQuestionRecord = {
        id: this.nextDemoId('demo-q'),
        public_id: `ET-Q-DEMO-${String(this.demoCounter).padStart(4, '0')}`,
        site_id: input.siteId ?? null,
        observation_id: input.observationId ?? null,
        investigation_id: input.investigationId ?? null,
        question,
        contributor_hash: contributorHash,
        status: 'open',
        is_public: true,
        answer_count: 0,
        vote_count: 0,
        requested_expert: input.requestedExpert === true,
        context: input.context ?? null,
        category: input.category ?? null,
        media_ids: input.mediaIds ?? [],
        is_demo: true,
        created_at: now,
        updated_at: now,
      };
      this.demoQuestions.unshift(record);
      return record;
    }

    const { data, error } = await (supabase.from('community_questions') as any)
      .insert({
        site_id: input.siteId ?? null,
        observation_id: input.observationId ?? null,
        investigation_id: input.investigationId ?? null,
        question,
        contributor_hash: contributorHash,
        status: 'open',
        is_public: true,
        requested_expert: input.requestedExpert === true,
        context: input.context ?? null,
        category: input.category ?? null,
        media_ids: input.mediaIds ?? [],
      })
      .select()
      .single();

    if (error || !data) throw new Error(`Could not post question: ${error?.message ?? 'unknown error'}`);
    return data as CommunityQuestionRecord;
  }

  async findQuestionByPublicId(publicId: string): Promise<CommunityQuestionRecord | null> {
    if (!this.ready && !this.demoActive) return null;
    const clean = publicId.trim().toUpperCase();
    if (!clean) return null;

    if (this.demoActive) {
      return this.demoQuestions.find((q) => q.public_id === clean) ?? null;
    }

    const { data, error } = await (supabase.from('community_questions') as any)
      .select('*')
      .eq('public_id', clean)
      .maybeSingle();

    if (error) {
      logger.warn('Failed to read question', { error: error.message });
      return null;
    }
    return (data as CommunityQuestionRecord) ?? null;
  }

  async listQuestions(options: {
    siteId?: string;
    investigationId?: string;
    observationId?: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: CommunityQuestionRecord[]; total: number }> {
    if (!this.ready && !this.demoActive) return { rows: [], total: 0 };

    if (this.demoActive) {
      let rows = this.demoQuestions.filter((q) => q.is_public !== false);
      if (options.siteId) rows = rows.filter((q) => q.site_id === options.siteId);
      if (options.investigationId) rows = rows.filter((q) => q.investigation_id === options.investigationId);
      if (options.observationId) rows = rows.filter((q) => q.observation_id === options.observationId);
      rows = [...rows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return { rows: rows.slice(options.offset, options.offset + options.limit), total: rows.length };
    }

    let query = (supabase.from('community_questions') as any)
      .select('*', { count: 'exact' })
      .eq('is_public', true);

    if (options.siteId) query = query.eq('site_id', options.siteId);
    if (options.investigationId) query = query.eq('investigation_id', options.investigationId);
    if (options.observationId) query = query.eq('observation_id', options.observationId);

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(options.offset, options.offset + options.limit - 1);

    if (error) {
      logger.warn('Failed to list questions', { error: error.message });
      return { rows: [], total: 0 };
    }
    return { rows: (data as CommunityQuestionRecord[]) ?? [], total: count ?? 0 };
  }

  async postAnswer(input: PostAnswerInput, contributorHash: string): Promise<CommunityAnswerRecord> {
    this.requireDatabase('answer');

    const answer = input.answer.trim();
    if (!answer) throw new Error('An answer is required.');

    if (this.demoActive) {
      const record: CommunityAnswerRecord = {
        id: this.nextDemoId('demo-ans'),
        question_id: input.questionId,
        contributor_hash: contributorHash,
        answer,
        evidence_id: input.evidenceId ?? null,
        media_ids: input.mediaIds ?? [],
        // Only the platform owner sets this, so a community answer is never
        // badged as expert no matter how many votes it attracts.
        is_expert: input.isExpert === true,
        created_at: new Date().toISOString(),
      };
      this.demoAnswers.push(record);
      await this.recountQuestion(input.questionId);
      return record;
    }

    const { data, error } = await (supabase.from('community_answers') as any)
      .insert({
        question_id: input.questionId,
        contributor_hash: contributorHash,
        answer,
        evidence_id: input.evidenceId ?? null,
        media_ids: input.mediaIds ?? [],
        is_expert: input.isExpert === true,
      })
      .select()
      .single();

    if (error || !data) throw new Error(`Could not post answer: ${error?.message ?? 'unknown error'}`);

    // Keep the cached answer counter honest.
    await this.recountQuestion(input.questionId);
    return data as CommunityAnswerRecord;
  }

  async listAnswers(questionId: string): Promise<CommunityAnswerRecord[]> {
    if (!this.ready && !this.demoActive) return [];

    if (this.demoActive) {
      return this.demoAnswers
        .filter((a) => a.question_id === questionId)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    const { data, error } = await (supabase.from('community_answers') as any)
      .select('*')
      .eq('question_id', questionId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) {
      logger.warn('Failed to list answers', { error: error.message });
      return [];
    }
    return (data as CommunityAnswerRecord[]) ?? [];
  }

  // ==========================================================================
  // Visits
  // ==========================================================================

  async recordVisit(input: RecordVisitInput, contributorHash: string): Promise<CommunityVisitRecord> {
    this.requireDatabase('visit');

    if (this.demoActive) {
      const now = new Date().toISOString();
      const record: CommunityVisitRecord = {
        id: this.nextDemoId('demo-vis'),
        site_id: input.siteId,
        contributor_hash: contributorHash,
        visited_on: input.visitedOn ?? now.slice(0, 10),
        notes: input.notes?.trim() || null,
        media_id: input.mediaId ?? null,
        created_at: now,
      };
      this.demoVisits.unshift(record);
      return record;
    }

    const { data, error } = await (supabase.from('community_visits') as any)
      .insert({
        site_id: input.siteId,
        contributor_hash: contributorHash,
        visited_on: input.visitedOn ?? new Date().toISOString().slice(0, 10),
        notes: input.notes?.trim() || null,
        media_id: input.mediaId ?? null,
      })
      .select()
      .single();

    if (error || !data) throw new Error(`Could not record visit: ${error?.message ?? 'unknown error'}`);
    return data as CommunityVisitRecord;
  }

  async listVisits(siteId: string, limit = 100): Promise<CommunityVisitRecord[]> {
    if (!this.ready && !this.demoActive) return [];

    if (this.demoActive) {
      return this.demoVisits
        .filter((v) => v.site_id === siteId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, limit);
    }

    const { data, error } = await (supabase.from('community_visits') as any)
      .select('*')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.warn('Failed to list visits', { error: error.message });
      return [];
    }
    return (data as CommunityVisitRecord[]) ?? [];
  }

  // ==========================================================================
  // Reputation
  // ==========================================================================

  async getReputation(contributorHash: string): Promise<CommunityReputationRecord | null> {
    if ((!this.ready && !this.demoActive) || !contributorHash) return null;

    if (this.demoActive) {
      const evidence = this.demoEvidence.filter((e) => e.contributor_hash === contributorHash).length;
      const votes = this.demoVotes.filter((v) => v.contributor_hash === contributorHash).length;
      const questions = this.demoQuestions.filter((q) => q.contributor_hash === contributorHash).length;
      const answers = this.demoAnswers.filter((a) => a.contributor_hash === contributorHash).length;
      const visits = this.demoVisits.filter((v) => v.contributor_hash === contributorHash).length;
      const investigations = new Set(
        this.demoVotes.filter((v) => v.contributor_hash === contributorHash).map((v) => v.investigation_id)
      ).size;

      return {
        contributor_hash: contributorHash,
        public_handle: publicContributorHandle(contributorHash),
        observations_count: 0,
        evidence_count: evidence,
        votes_count: votes,
        questions_count: questions,
        answers_count: answers,
        visits_count: visits,
        investigations_count: investigations,
        districts_represented: 0,
        achievements: buildAchievements({
          observations: 0,
          evidence,
          votes,
          questions,
          visits,
          investigations,
          districtsRepresented: 0,
        }),
        updated_at: new Date().toISOString(),
      };
    }

    const { data, error } = await (supabase.from('community_reputation') as any)
      .select('*')
      .eq('contributor_hash', contributorHash)
      .maybeSingle();

    if (error) {
      logger.warn('Failed to read reputation', { error: error.message });
      return null;
    }
    return (data as CommunityReputationRecord) ?? null;
  }

  /**
   * Recomputes contribution counters for one contributor from real rows only.
   *
   * Explicitly does NOT compute an accuracy or correctness figure.
   */
  async refreshReputation(
    contributorHash: string,
    publicHandle: string
  ): Promise<CommunityReputationRecord | null> {
    if ((!this.ready && !this.demoActive) || !contributorHash) return null;

    if (this.demoActive) {
      return this.getReputation(contributorHash);
    }

    const countRows = async (table: string, column: string): Promise<number> => {
      const { count, error } = await (supabase.from(table) as any)
        .select('*', { count: 'exact', head: true })
        .eq(column, contributorHash);
      if (error) {
        logger.warn('Failed counting reputation rows', { table, error: error.message });
        return 0;
      }
      return count ?? 0;
    };

    const [observations, evidence, votes, questions, answers, visits] = await Promise.all([
      countRows('observations', 'source_user_hash'),
      countRows('community_evidence', 'contributor_hash'),
      countRows('community_votes', 'contributor_hash'),
      countRows('community_questions', 'contributor_hash'),
      countRows('community_answers', 'contributor_hash'),
      countRows('community_visits', 'contributor_hash'),
    ]);

    // Districts represented, derived from real observation locations.
    let districtsRepresented = 0;
    try {
      const { data: obsRows, error: obsErr } = await (supabase.from('observations') as any)
        .select('id')
        .eq('source_user_hash', contributorHash);
      if (!obsErr && Array.isArray(obsRows) && obsRows.length > 0) {
        const ids = obsRows.map((r: { id: string }) => r.id);
        const { data: locRows } = await (supabase.from('observation_locations') as any)
          .select('district')
          .in('observation_id', ids)
          .not('district', 'is', null);
        districtsRepresented = new Set(
          ((locRows ?? []) as Array<{ district: string }>).map((r) => r.district)
        ).size;
      }
    } catch (err) {
      logger.warn('Failed counting reputation districts', { error: String(err) });
    }

    const investigations = await this.countDistinctParticipantsOfAny(contributorHash);

    const record: CommunityReputationRecord = {
      contributor_hash: contributorHash,
      public_handle: publicHandle,
      observations_count: observations,
      evidence_count: evidence,
      votes_count: votes,
      questions_count: questions,
      answers_count: answers,
      visits_count: visits,
      investigations_count: investigations,
      districts_represented: districtsRepresented,
      achievements: buildAchievements({
        observations,
        evidence,
        votes,
        questions,
        visits,
        investigations,
        districtsRepresented,
      }),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await (supabase.from('community_reputation') as any)
      .upsert(record, { onConflict: 'contributor_hash' })
      .select()
      .maybeSingle();

    if (error) {
      logger.warn('Failed to persist reputation', { error: error.message });
      return record;
    }
    return (data as CommunityReputationRecord) ?? record;
  }

  private async countDistinctParticipantsOfAny(contributorHash: string): Promise<number> {
    const { data, error } = await (supabase.from('community_votes') as any)
      .select('investigation_id')
      .eq('contributor_hash', contributorHash);

    if (error) return 0;
    return new Set(
      ((data ?? []) as Array<{ investigation_id: string }>).map((r) => r.investigation_id)
    ).size;
  }

  // ==========================================================================
  // Counter integrity
  // ==========================================================================

  /**
   * Recomputes an investigation's cached counters from its real child rows so a
   * displayed count can never drift from the rows that justify it.
   */
  async recountInvestigation(investigationId: string): Promise<void> {
    if (!this.ready && !this.demoActive) return;

    if (this.demoActive) {
      const record = this.demoInvestigations.find((i) => i.id === investigationId);
      if (!record) return;
      record.evidence_count = this.demoEvidence.filter(
        (e) => e.investigation_id === investigationId && e.moderation_status === 'visible'
      ).length;
      record.vote_count = this.demoVotes.filter((v) => v.investigation_id === investigationId).length;
      record.participant_count = new Set(
        this.demoVotes.filter((v) => v.investigation_id === investigationId).map((v) => v.contributor_hash)
      ).size;
      record.updated_at = new Date().toISOString();
      return;
    }

    const { count: evidenceCount } = await (supabase.from('community_evidence') as any)
      .select('*', { count: 'exact', head: true })
      .eq('investigation_id', investigationId)
      .eq('moderation_status', 'visible');

    const { count: voteCount } = await (supabase.from('community_votes') as any)
      .select('*', { count: 'exact', head: true })
      .eq('investigation_id', investigationId);

    const participants = await this.countDistinctParticipants(investigationId);

    await (supabase.from('community_investigations') as any)
      .update({
        evidence_count: evidenceCount ?? 0,
        vote_count: voteCount ?? 0,
        participant_count: participants,
        updated_at: new Date().toISOString(),
      })
      .eq('id', investigationId);
  }

  async recountQuestion(questionId: string): Promise<void> {
    if (!this.ready && !this.demoActive) return;

    if (this.demoActive) {
      const record = this.demoQuestions.find((q) => q.id === questionId);
      if (!record) return;
      record.answer_count = this.demoAnswers.filter((a) => a.question_id === questionId).length;
      record.updated_at = new Date().toISOString();
      return;
    }

    const { count } = await (supabase.from('community_answers') as any)
      .select('*', { count: 'exact', head: true })
      .eq('question_id', questionId);

    await (supabase.from('community_questions') as any)
      .update({ answer_count: count ?? 0, updated_at: new Date().toISOString() })
      .eq('id', questionId);
  }
}

// ============================================================================
// Achievements (spec section 9)
// ============================================================================

interface AchievementInputs {
  observations: number;
  evidence: number;
  votes: number;
  questions: number;
  visits: number;
  investigations: number;
  districtsRepresented: number;
}

/**
 * Participation achievements only.
 *
 * There is deliberately no "scientific accuracy" achievement. Reputation on this
 * platform measures contribution, never correctness.
 */
export function buildAchievements(input: AchievementInputs): Achievement[] {
  return [
    {
      id: 'field_explorer',
      label: 'Field Explorer',
      description: 'Visited 10 geological sites.',
      progress: { current: input.visits, required: 10 },
      earned: input.visits >= 10,
    },
    {
      id: 'observation_contributor',
      label: 'Observation Contributor',
      description: 'Submitted 25 useful observations.',
      progress: { current: input.observations, required: 25 },
      earned: input.observations >= 25,
    },
    {
      id: 'geological_detective',
      label: 'Geological Detective',
      description: 'Participated in 20 investigations.',
      progress: { current: input.investigations, required: 20 },
      earned: input.investigations >= 20,
    },
    {
      id: 'map_explorer',
      label: 'Map Explorer',
      description: 'Explored 50 geological sites.',
      progress: { current: input.visits, required: 50 },
      earned: input.visits >= 50,
    },
    {
      id: 'rock_hunter',
      label: 'Rock Hunter',
      description: 'Submitted observations from multiple districts.',
      progress: { current: input.districtsRepresented, required: 3 },
      earned: input.districtsRepresented >= 3,
    },
    {
      id: 'question_starter',
      label: 'Question Starter',
      description: 'Asked geological questions that attract answers.',
      progress: { current: input.questions, required: 5 },
      earned: input.questions >= 5,
    },
    {
      id: 'community_helper',
      label: 'Community Helper',
      description: 'Contributed evidence to investigations.',
      progress: { current: input.evidence, required: 10 },
      earned: input.evidence >= 10,
    },
  ];
}

export const communityRepository = new CommunityRepository();

/** Convenience re-export so callers can reason about DB availability. */
export const communityDataAvailable = (): boolean => isDatabaseConfigured() && env.SUPABASE_URL.length > 0;
