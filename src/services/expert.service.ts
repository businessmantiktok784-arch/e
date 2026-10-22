import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { checkRateLimit } from '../utils/rate-limiter.js';
import { expertRepository, ExpertRepository } from '../repositories/expert.repository.js';
import type {
  ExpertFilterOptions,
  ExpertObservationSummary,
  ExpertObservationDetail,
  ExpertReviewInput,
  ExpertReviewStats,
  VerificationAuditLogRecord,
} from '../types/expert.types.js';

/**
 * The identity recorded against a review.
 *
 * Reviews are no longer submitted by separate expert accounts. The only
 * authenticated user of this platform is the Super Admin, who records a review
 * on behalf of a named reviewer and controls whether that name is published.
 *
 * `identity_published: false` is the honest default: attributing a judgement to
 * a named person the platform cannot verify is a scientific-integrity problem,
 * not a cosmetic one.
 */
export interface ReviewAttribution {
  /** Super Admin session identifier who entered the review. */
  enteredBy: string;
  /** The person the review is attributed to, e.g. "Dr A. Uwera". */
  reviewerLabel: string;
  /** Optional affiliation, shown only alongside a published identity. */
  organization?: string | null;
  /** Whether the reviewer name may appear on public pages. */
  identityPublished: boolean;
}

/**
 * Authoritative review workflow.
 *
 * Authorisation is enforced at the route layer by `requireSuperAdmin`. This
 * service performs no authentication of its own and holds no user records.
 */
export class ExpertService {
  constructor(private repo: ExpertRepository = expertRepository) {}

  /**
   * Lists observations awaiting review.
   */
  async getObservations(
    filters: ExpertFilterOptions
  ): Promise<{ data: ExpertObservationSummary[]; total: number; page: number; limit: number }> {
    return this.repo.findObservationsForReview(filters);
  }

  /**
   * Retrieves single observation details for review inspection.
   */
  async getObservationDetail(passportId: string): Promise<ExpertObservationDetail | null> {
    if (!passportId || passportId.trim().length === 0) {
      return null;
    }
    return this.repo.getObservationForExpert(passportId);
  }

  /**
   * Records an authoritative review decision.
   *
   * Validation is explicit and strict: an unrecognised status, classification or
   * confidence value is rejected rather than silently stored, because these
   * fields drive the public evidence ladder.
   */
  async submitReview(
    passportId: string,
    attribution: ReviewAttribution,
    input: ExpertReviewInput
  ): Promise<{
    success: boolean;
    verification: unknown;
    auditLog: VerificationAuditLogRecord;
    updatedObservation: ExpertObservationDetail;
  }> {
    if (!attribution.reviewerLabel || attribution.reviewerLabel.trim().length === 0) {
      throw new Error('A reviewer name is required for every recorded review.');
    }

    // Rate limit review submissions per Super Admin session.
    const rateLimitKey = `review:${attribution.enteredBy}`;
    if (!checkRateLimit(rateLimitKey, env.SUPER_ADMIN_RATE_LIMIT_PER_MINUTE)) {
      throw new Error('Review submission rate limit exceeded. Please wait a moment.');
    }

    const validStatuses = ['under_review', 'expert_verified', 'rejected'];
    if (!validStatuses.includes(input.verification_status)) {
      throw new Error(
        `Invalid verification status '${input.verification_status}'. Must be under_review, expert_verified, or rejected.`
      );
    }

    if (input.expert_classification) {
      const allowed = ['igneous', 'sedimentary', 'metamorphic', 'unclassified', 'non_rock', 'insufficient_image'];
      if (!allowed.includes(input.expert_classification)) {
        throw new Error(`Invalid expert classification '${input.expert_classification}'.`);
      }
    }

    if (input.expert_confidence) {
      const allowed = ['high', 'moderate', 'low', 'insufficient'];
      if (!allowed.includes(input.expert_confidence)) {
        throw new Error(`Invalid expert confidence '${input.expert_confidence}'.`);
      }
    }

    const sanitizedInput: ExpertReviewInput = {
      verification_status: input.verification_status,
      expert_classification: input.expert_classification,
      expert_rock_name: input.expert_rock_name?.slice(0, 150),
      expert_confidence: input.expert_confidence,
      expert_observed_features: Array.isArray(input.expert_observed_features)
        ? input.expert_observed_features.slice(0, 10).map((f) => String(f).slice(0, 150))
        : [],
      expert_notes: input.expert_notes?.slice(0, 2000),
      scientific_remarks: input.scientific_remarks?.slice(0, 2000),
      publication_status: input.publication_status,
      public_visibility_reason: input.public_visibility_reason,
    };

    logger.info('Review recorded', {
      passportId,
      enteredBy: attribution.enteredBy,
      identityPublished: attribution.identityPublished,
      decision: input.verification_status,
    });

    return this.repo.submitVerification(
      passportId,
      {
        id: attribution.enteredBy,
        name: attribution.reviewerLabel,
        role: 'admin',
        organization: attribution.organization ?? 'Recorded by the platform owner',
      },
      sanitizedInput,
      attribution.identityPublished
    );
  }

  /**
   * Retrieves workflow metrics and review statistics.
   */
  async getStats(): Promise<ExpertReviewStats> {
    return this.repo.getReviewStats();
  }

  /**
   * Retrieves recent audit logs across all records.
   */
  async getAuditLogs(limit?: number): Promise<VerificationAuditLogRecord[]> {
    return this.repo.getAuditLogs(limit);
  }
}

export const expertService = new ExpertService();