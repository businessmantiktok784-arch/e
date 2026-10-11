import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { redactContributorHash } from '../utils/contributor.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { dataQualityService } from '../services/data-quality.service.js';
import type {
  ExpertObservationSummary,
  ExpertObservationDetail,
  ExpertVerificationRecord,
  VerificationAuditLogRecord,
  ExpertReviewInput,
  ExpertFilterOptions,
  ExpertReviewStats,
  AuditAction,
} from '../types/expert.types.js';
import type { VerificationStatus, PublicationStatus } from '../types/database.types.js';
import type { RockClassification, RockConfidence } from '../ai/geological.types.js';

export interface InMemoryObservationStore {
  id: string;
  passport_id: string;
  source: string;
  source_user_hash: string;
  status: string;
  is_rock: boolean;
  /**
   * Category decided before interpretation. `rock` for the historical records.
   *
   * Optional because the store predates the taxonomy, and a record ingested
   * before migration 013 has no category column value. A review screen that
   * assumed this was always present would show an empty category for exactly the
   * oldest records, which are the ones most likely to be in the review queue.
   */
  observation_category?: string;
  observation_subcategory?: string;
  primary_classification: RockClassification;
  possible_name: string | null;
  confidence: RockConfidence;
  confidence_score: number;
  observed_features: string[];
  reasoning: string;
  alternative_possibilities: string[];
  limitations: string[];
  recommended_next_steps: string[];
  safety_note: string;
  /** How far this reading has been checked. Separate from verification_status. */
  evidence_state?: string;
  verification_status: VerificationStatus;
  publication_status: PublicationStatus;
  published_at: string | null;
  public_visibility_reason: string | null;
  district: string | null;
  media_type?: string;
  mime_type?: string;
  sector: string | null;
  cell: string | null;
  village: string | null;
  public_location_precision: 'district' | 'approximate' | 'exact';
  latitude: number | null;
  longitude: number | null;
  ai_model: string;
  ai_prompt_version: string;
  analysis_version: string;
  created_at: string;
  updated_at: string;
  media_id: string;
}

export class ExpertRepository {
  /**
   * In-memory review queue.
   *
   * Intentionally EMPTY. This repository previously seeded itself with invented
   * observations — fabricated passport IDs, invented GPS coordinates, invented
   * rock names and invented citations to real geological survey sheets. Those
   * records were indistinguishable from genuine submissions once they reached
   * the review dashboard, so the seed was removed rather than re-labelled.
   *
   * Rows are only ever populated from a real database read or a record written
   * during this process's lifetime.
   */
  private inMemoryObservations: InMemoryObservationStore[] = [];
  private inMemoryVerifications: Map<string, ExpertVerificationRecord[]> = new Map();
  private inMemoryAuditLogs: VerificationAuditLogRecord[] = [];

  /**
   * Registers an observation into the in-process review queue.
   *
   * This is a write path, not a fixture hook: an observation that reaches the
   * dashboard without a configured database has to live somewhere, and this is
   * that somewhere. It performs no validation or invention of its own — the
   * caller supplies every field.
   *
   * Duplicate passport IDs are rejected so a caller cannot silently shadow an
   * existing record.
   */
  registerObservation(observation: InMemoryObservationStore): void {
    if (this.inMemoryObservations.some((o) => o.passport_id === observation.passport_id)) {
      throw new Error(`Observation '${observation.passport_id}' is already registered.`);
    }
    this.inMemoryObservations.push(observation);
  }

  /**
   * Lists observations for expert review according to filter parameters.
   */
  async findObservationsForReview(
    filters: ExpertFilterOptions
  ): Promise<{ data: ExpertObservationSummary[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 25));

    // Try Supabase if configured and not mock
    const isMock = !env.SUPABASE_URL || env.SUPABASE_URL.includes('mock-project-id');

    if (!isMock) {
      try {
        let query = supabase.from('observations').select('*, observation_locations(district)', { count: 'exact' });

        if (filters.status && filters.status !== 'all') {
          query = query.eq('verification_status', filters.status);
        }
        if (filters.classification) {
          query = query.eq('primary_classification', filters.classification);
        }
        if (filters.search) {
          query = query.ilike('passport_id', `%${filters.search.trim()}%`);
        }

        query = query.order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);

        const { data, count, error } = await query;
        if (!error && data) {
          const mapped: ExpertObservationSummary[] = (data as any[]).map((row) => ({
            id: row.id,
            passport_id: row.passport_id,
            created_at: row.created_at,
            district: row.observation_locations?.[0]?.district || null,
            ai_classification: row.primary_classification,
            ai_possible_name: row.possible_name,
            ai_confidence: row.confidence,
            ai_confidence_score: row.confidence_score,
            verification_status: row.verification_status,
            publication_status: row.publication_status,
            expert_rock_name: null,
            reviewer_name: null,
            has_media: true,
          }));
          return { data: mapped, total: count || mapped.length, page, limit };
        }
      } catch (err) {
        logger.warn('Supabase query failed in findObservationsForReview, using in-memory store', {
          error: String(err),
        });
      }
    }

    // In-memory filter implementation
    let filtered = [...this.inMemoryObservations];

    if (filters.status && filters.status !== 'all') {
      filtered = filtered.filter((o) => o.verification_status === filters.status);
    }
    if (filters.classification) {
      filtered = filtered.filter((o) => o.primary_classification === filters.classification);
    }
    if (filters.district) {
      const dist = filters.district.toLowerCase();
      filtered = filtered.filter((o) => o.district && o.district.toLowerCase() === dist);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase().trim();
      filtered = filtered.filter(
        (o) =>
          o.passport_id.toLowerCase().includes(q) ||
          (o.possible_name && o.possible_name.toLowerCase().includes(q)) ||
          (o.district && o.district.toLowerCase().includes(q))
      );
    }

    // Sort newest first
    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    const summaries: ExpertObservationSummary[] = paginated.map((obs) => {
      const verifs = this.inMemoryVerifications.get(obs.passport_id) || [];
      const latest = verifs[0] || null;

      return {
        id: obs.id,
        passport_id: obs.passport_id,
        created_at: obs.created_at,
        district: obs.district,
        ai_classification: obs.primary_classification,
        ai_possible_name: obs.possible_name,
        ai_confidence: obs.confidence,
        ai_confidence_score: obs.confidence_score,
        verification_status: obs.verification_status,
        publication_status: obs.publication_status,
        data_quality_score: dataQualityService.assessObservationQuality(
          this.mapToDetail(obs, verifs, [])
        ).overall_score,
        expert_rock_name: latest?.expert_rock_name || null,
        reviewer_name: latest?.reviewer_name || null,
        has_media: Boolean(obs.media_id),
      };
    });

    return { data: summaries, total, page, limit };
  }

  /**
   * Maps a stored row to the public review-detail shape.
   *
   * The AI block is copied verbatim and is never modified by a review decision;
   * the review findings live alongside it. `data_quality` is attached by the
   * caller because assessing it requires the already-assembled detail object.
   */
  private mapToDetail(
    obs: InMemoryObservationStore,
    verifs: ExpertVerificationRecord[],
    auditLogs: VerificationAuditLogRecord[]
  ): Omit<ExpertObservationDetail, 'data_quality'> {
    const latest = verifs[0] || null;

    return {
      id: obs.id,
      passport_id: obs.passport_id,
      source: obs.source,
      source_contributor_hash: redactContributorHash(obs.source_user_hash),
      status: obs.status,
      created_at: obs.created_at,
      updated_at: obs.updated_at,

      // Immutable AI Record (Never altered by review)
ai_analysis: {
  is_rock: obs.is_rock,
  // Falls back to `rock` only because the legacy path is `is_rock: true`. A
  // record with no category and `is_rock: false` was never a rock, so it is not
  // promoted to one here.
  observation_category: obs.observation_category ?? (obs.is_rock ? 'rock' : 'unknown'),
  observation_subcategory: obs.observation_subcategory ?? 'unknown',
  primary_classification: obs.primary_classification,
        possible_name: obs.possible_name,
        confidence: obs.confidence,
        confidence_score: obs.confidence_score,
        observed_features: obs.observed_features,
        reasoning: obs.reasoning,
        alternative_possibilities: obs.alternative_possibilities,
        limitations: obs.limitations,
        recommended_next_steps: obs.recommended_next_steps,
        safety_note: obs.safety_note,
        ai_model: obs.ai_model,
        ai_prompt_version: obs.ai_prompt_version,
        analysis_version: obs.analysis_version,
      },

      location: {
        district: obs.district,
        sector: obs.sector,
        cell: obs.cell,
        village: obs.village,
        precision: obs.public_location_precision,
        latitude: obs.latitude,
        longitude: obs.longitude,
        is_public: obs.publication_status === 'public',
      },

media: {
  id: obs.media_id,
  // Carried from the record rather than assumed. Hardcoding `image` /
  // `image/jpeg` would describe every video submission as a JPEG to a reviewer
  // deciding whether it is legible.
  media_type: obs.media_type ?? 'image',
  mime_type: obs.mime_type ?? 'image/jpeg',
  secure_url: `/api/expert/media/${obs.passport_id}`,
  created_at: obs.created_at,
},

verification_status: obs.verification_status,
    publication_status: obs.publication_status,
    published_at: obs.published_at,
    public_visibility_reason: obs.public_visibility_reason,
    evidence_state: obs.evidence_state ?? 'insufficient_evidence',

    latest_verification: latest,
      verifications_history: verifs,
      audit_logs: auditLogs,
    };
  }

  /**
   * Retrieves single observation details for expert review, strictly preserving
   * the immutable AI preliminary assessment side-by-side with expert findings.
   */
  async getObservationForExpert(passportId: string): Promise<ExpertObservationDetail | null> {
    const cleanId = passportId.trim().toUpperCase();

    // Check in-memory store
    const obs = this.inMemoryObservations.find((o) => o.passport_id === cleanId);
    if (!obs) {
      return null;
    }

    const verifs = this.inMemoryVerifications.get(obs.passport_id) || [];
    const auditLogs = this.inMemoryAuditLogs.filter((l) => l.passport_id === obs.passport_id);

    return {
      ...this.mapToDetail(obs, verifs, auditLogs),
      data_quality: dataQualityService.assessObservationQuality(this.mapToDetail(obs, verifs, auditLogs)),
    };
  }

  /**
   * Applies an authoritative expert verification decision without modifying
   * the underlying immutable AI assessment.
   */
  async submitVerification(
    passportId: string,
    reviewer: { id: string; name: string; role: 'expert' | 'lead_geologist' | 'admin'; organization: string },
    input: ExpertReviewInput,
    identityPublished = false
  ): Promise<{
    success: boolean;
    verification: ExpertVerificationRecord;
    auditLog: VerificationAuditLogRecord;
    updatedObservation: ExpertObservationDetail;
  }> {
    const cleanId = passportId.trim().toUpperCase();
    const obs = this.inMemoryObservations.find((o) => o.passport_id === cleanId);

    if (!obs) {
      throw new Error(`Observation with passport ID '${passportId}' not found.`);
    }

    const previousStatus = obs.verification_status;
    const newStatus = input.verification_status;

    // Update observation metadata
    obs.verification_status = newStatus;
    obs.updated_at = new Date().toISOString();

    if (input.publication_status) {
      obs.publication_status = input.publication_status;
      if (input.publication_status === 'public' && !obs.published_at) {
        obs.published_at = new Date().toISOString();
      }
    }
    if (input.public_visibility_reason) {
      obs.public_visibility_reason = input.public_visibility_reason;
    }

    // Determine audit action
    let action: AuditAction = 'status_changed';
    if (newStatus === 'expert_verified') action = 'verified';
    else if (newStatus === 'rejected') action = 'rejected';
    else if (newStatus === 'under_review') action = 'assigned_review';

    // Create verification record
    const verificationRecord: ExpertVerificationRecord = {
      id: `ver-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      observation_id: obs.id,
      passport_id: obs.passport_id,
      reviewer_id: reviewer.id,
      reviewer_name: reviewer.name,
      reviewer_role: reviewer.role,
      reviewer_organization: reviewer.organization,
      status: newStatus,
      expert_classification: input.expert_classification || null,
      expert_rock_name: input.expert_rock_name?.trim() || null,
      expert_confidence: input.expert_confidence || null,
      expert_observed_features: input.expert_observed_features || [],
      expert_notes: input.expert_notes?.trim() || null,
      scientific_remarks: input.scientific_remarks?.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Store in-memory
    const existingVerifs = this.inMemoryVerifications.get(obs.passport_id) || [];
    this.inMemoryVerifications.set(obs.passport_id, [verificationRecord, ...existingVerifs]);

    // Create audit log entry
    const auditLog: VerificationAuditLogRecord = {
      id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      observation_id: obs.id,
      passport_id: obs.passport_id,
      reviewer_id: reviewer.id,
      reviewer_name: reviewer.name,
      action,
      previous_status: previousStatus,
      new_status: newStatus,
      notes: input.expert_notes || input.scientific_remarks || `Observation status changed to ${newStatus}`,
      metadata: {
        expert_classification: input.expert_classification,
        expert_rock_name: input.expert_rock_name,
        publication_status: obs.publication_status,
      },
      created_at: new Date().toISOString(),
    };

    this.inMemoryAuditLogs.unshift(auditLog);

    // Also attempt persisting to live Supabase if connected
    const isMock = !env.SUPABASE_URL || env.SUPABASE_URL.includes('mock-project-id');
    if (!isMock) {
      try {
        await (supabase.from('observations') as any)
          .update({
            verification_status: newStatus,
            publication_status: obs.publication_status,
            updated_at: obs.updated_at,
          })
          .eq('passport_id', obs.passport_id);

        await (supabase.from('expert_verifications') as any).insert({
          observation_id: obs.id,
          reviewer_id: reviewer.id,
          reviewer_name: reviewer.name,
          reviewer_role: reviewer.role,
          reviewer_organization: reviewer.organization,
          status: newStatus,
          expert_classification: verificationRecord.expert_classification,
          expert_rock_name: verificationRecord.expert_rock_name,
          expert_confidence: verificationRecord.expert_confidence,
          expert_notes: verificationRecord.expert_notes,
          scientific_remarks: verificationRecord.scientific_remarks,
        });

        await (supabase.from('verification_audit_logs') as any).insert({
          observation_id: obs.id,
          passport_id: obs.passport_id,
          reviewer_id: reviewer.id,
          reviewer_name: reviewer.name,
          action,
          previous_status: previousStatus,
          new_status: newStatus,
          notes: auditLog.notes,
        });
      } catch (dbErr) {
        logger.warn('Could not mirror verification to Supabase, local state intact', { error: String(dbErr) });
      }
    }

    const updatedDetail = (await this.getObservationForExpert(obs.passport_id))!;
    return {
      success: true,
      verification: verificationRecord,
      auditLog,
      updatedObservation: updatedDetail,
    };
  }

  /**
   * Aggregates verification statistics across the entire observation queue.
   */
  async getReviewStats(): Promise<ExpertReviewStats> {
    const total = this.inMemoryObservations.length;
    let awaitingReview = 0;
    let underReview = 0;
    let verified = 0;
    let rejected = 0;

    const classificationBreakdown: Record<string, number> = {};
    const verifiedBreakdown: Record<string, number> = {};

    for (const obs of this.inMemoryObservations) {
      if (obs.verification_status === 'unverified') awaitingReview += 1;
      else if (obs.verification_status === 'under_review') underReview += 1;
      else if (obs.verification_status === 'expert_verified') {
        verified += 1;
        const cls = obs.primary_classification;
        verifiedBreakdown[cls] = (verifiedBreakdown[cls] || 0) + 1;
      } else if (obs.verification_status === 'rejected') rejected += 1;

      const cls = obs.primary_classification;
      classificationBreakdown[cls] = (classificationBreakdown[cls] || 0) + 1;
    }

    const reviewedCount = verified + rejected;
    const ratePct = total > 0 ? Math.round((reviewedCount / total) * 100) : 0;

    return {
      total_observations: total,
      awaiting_review_count: awaitingReview,
      under_review_count: underReview,
      verified_count: verified,
      rejected_count: rejected,
      verification_rate_pct: ratePct,
      classification_breakdown: classificationBreakdown,
      verified_breakdown: verifiedBreakdown,
    };
  }

  /**
   * Retrieves recent audit logs across all observations.
   */
  async getAuditLogs(limit = 50): Promise<VerificationAuditLogRecord[]> {
    return this.inMemoryAuditLogs.slice(0, limit);
  }

  /**
   * Appends an audit log record.
   */
  async recordAuditLog(entry: VerificationAuditLogRecord): Promise<void> {
    this.inMemoryAuditLogs.unshift(entry);
  }

  /**
   * Retrieves all raw observations for analytics and exports.
   */
  async getAllRawObservations(): Promise<InMemoryObservationStore[]> {
    return [...this.inMemoryObservations];
  }

  /**
   * Retrieves verifications map.
   */
  getAllVerificationsMap(): Map<string, ExpertVerificationRecord[]> {
    return this.inMemoryVerifications;
  }

  /**
   * Retrieves real processing events for monitoring.
   *
   * REAL DATA POLICY: this queries the `processing_events` table written by the
   * live pipeline. The previous implementation returned six hard-coded rows with
   * invented latencies and a fabricated failure, which made the monitoring view
   * show activity that never happened.
   *
   * Returns an empty array when the database is unavailable or has no events.
   * Callers must render an explicit "no data available yet" state.
   */
  async getProcessingEvents(
    limit = 100
  ): Promise<Array<{ id: string; status: string; duration_ms: number | null; error_code?: string; created_at: string }>> {
    if (!isDatabaseConfigured()) {
      return [];
    }

    try {
      const { data, error } = await (supabase
        .from('processing_events' as any)
        .select('id, status, duration_ms, error_code, created_at')
        .order('created_at', { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 500)) as any);

      if (error) throw new Error(error.message);
      if (!Array.isArray(data)) return [];

      return (data as any[]).map((row) => ({
        id: String(row.id),
        status: String(row.status),
        duration_ms: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
        error_code: row.error_code ?? undefined,
        created_at: String(row.created_at),
      }));
    } catch (err) {
      logger.warn('Could not read processing events', { error: String(err) });
      return [];
    }
  }
}

export const expertRepository = new ExpertRepository();
