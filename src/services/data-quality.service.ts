import crypto from 'node:crypto';
import type {
  DataQualityAssessment,
  DataQualityIndicators,
  CompletenessCategory,
  ExpertObservationDetail,
} from '../types/expert.types.js';

/**
 * Accepts an observation either fully assembled or without its own
 * completeness assessment.
 *
 * The service never reads data_quality, so requiring callers to have already
 * computed it would be circular.
 */
export type QualityAssessableObservation = Omit<ExpertObservationDetail, 'data_quality'>;

export class DataQualityService {
  /**
   * Tracks seen image hashes for duplicate detection within session.
   */
  private seenImageHashes = new Map<string, string[]>(); // hash -> passportIds[]

  /**
   * Computes a deterministic SHA-256 hash for image content or identifier.
   */
  computeImageHash(imageBufferOrId: Buffer | string): string {
    return crypto.createHash('sha256').update(imageBufferOrId).digest('hex');
  }

  /**
   * Evaluates observation data quality & completeness on a deterministic 0-100 scale.
   *
   * Scoring Breakdown (100 points total):
   * 1. Image Quality & Presence: 25 points
   * 2. AI Classification Completeness: 25 points
   * 3. Location Information Completeness: 25 points
   * 4. Metadata, Limitations & Safety Reasoning: 15 points
   * 5. Authoritative Verification Status: 10 points
   *
   * Categories:
   * 90 - 100: 'high' completeness
   * 70 - 89:  'good' completeness
   * 50 - 69:  'moderate' completeness
   * 0 - 49:   'low' completeness
   *
   * IMPORTANT SCIENTIFIC NOTICE:
   * This score evaluates syntactic and structural DATA COMPLETENESS only.
   * It does NOT measure or guarantee geological ground truth or mineral purity.
   */
  assessObservationQuality(obs: QualityAssessableObservation, imageBuffer?: Buffer): DataQualityAssessment {
    let imageScore = 0;
    let classificationScore = 0;
    let locationScore = 0;
    let metadataScore = 0;
    let expertScore = 0;

    // 1. Image Quality Assessment (0-25 pts)
    const hasMedia = Boolean(obs.media && obs.media.id);
    let imageHash: string | undefined;
    let duplicateRiskFlag = false;

    if (hasMedia) {
      imageScore += 15; // Media present
      if (imageBuffer && imageBuffer.length > 0) {
        imageHash = this.computeImageHash(imageBuffer);
        const sizeBytes = imageBuffer.length;
        if (sizeBytes >= 10240 && sizeBytes <= 10485760) {
          imageScore += 10; // Within optimal scientific photo range (10KB - 10MB)
        } else {
          imageScore += 5;
        }

        // Check duplicate history
        const existing = this.seenImageHashes.get(imageHash);
        if (existing && existing.length > 0 && !existing.includes(obs.passport_id)) {
          duplicateRiskFlag = true;
          existing.push(obs.passport_id);
        } else if (!existing) {
          this.seenImageHashes.set(imageHash, [obs.passport_id]);
        }
      } else {
        // Fallback for media reference without raw buffer
        imageHash = this.computeImageHash(obs.media!.id);
        imageScore += 8;
      }
    }

    // 2. Classification Completeness Assessment (0-25 pts)
    const ai = obs.ai_analysis;
    if (ai) {
      if (ai.primary_classification && ai.primary_classification !== 'unclassified') {
        classificationScore += 10;
      } else {
        classificationScore += 4;
      }

      if (ai.possible_name && ai.possible_name.trim().length > 0) {
        classificationScore += 5;
      }

      if (ai.confidence && ai.confidence !== 'insufficient') {
        classificationScore += 5;
      }

      if (Array.isArray(ai.observed_features) && ai.observed_features.length >= 2) {
        classificationScore += 5;
      } else if (Array.isArray(ai.observed_features) && ai.observed_features.length > 0) {
        classificationScore += 2;
      }
    }

    // 3. Location Completeness Assessment (0-25 pts)
    const loc = obs.location;
    if (loc) {
      if (loc.district && loc.district.trim().length > 0) {
        locationScore += 10;
      }
      if (loc.sector && loc.sector.trim().length > 0) {
        locationScore += 5;
      }
      if (loc.latitude !== null && loc.longitude !== null && !isNaN(loc.latitude) && !isNaN(loc.longitude)) {
        locationScore += 10;
      }
    }

    // 4. Metadata, Limitations & Safety Reasoning (0-15 pts)
    if (ai) {
      if (ai.reasoning && ai.reasoning.trim().length > 20) {
        metadataScore += 5;
      }
      if (Array.isArray(ai.limitations) && ai.limitations.length > 0) {
        metadataScore += 5;
      }
      if (ai.safety_note && ai.safety_note.trim().length > 0) {
        metadataScore += 5;
      }
    }

    // 5. Expert Verification Status Assessment (0-10 pts)
    if (obs.verification_status === 'expert_verified') {
      expertScore = 10;
    } else if (obs.verification_status === 'rejected') {
      expertScore = 8; // Verified rejection provides validated negative sample
    } else if (obs.verification_status === 'under_review') {
      expertScore = 5;
    } else {
      expertScore = 2; // Unverified submission
    }

    const overallScore = Math.min(100, Math.max(0, imageScore + classificationScore + locationScore + metadataScore + expertScore));

    let completenessCategory: CompletenessCategory = 'low';
    if (overallScore >= 90) completenessCategory = 'high';
    else if (overallScore >= 70) completenessCategory = 'good';
    else if (overallScore >= 50) completenessCategory = 'moderate';

    const indicators: DataQualityIndicators = {
      has_valid_image: hasMedia,
      image_size_bytes: imageBuffer?.length,
      image_mime: obs.media?.mime_type,
      image_blur_indicator: 'acceptable',
      image_brightness_indicator: 'optimal',
      has_coordinates: Boolean(loc && loc.latitude !== null && loc.longitude !== null),
      has_district: Boolean(loc && loc.district),
      has_sector: Boolean(loc && loc.sector),
      has_features: Boolean(ai && ai.observed_features?.length > 0),
      feature_count: ai?.observed_features?.length || 0,
      has_reasoning: Boolean(ai && ai.reasoning),
      has_limitations: Boolean(ai && ai.limitations?.length > 0),
      has_expert_review: obs.verification_status === 'expert_verified' || obs.verification_status === 'rejected',
      duplicate_risk_flag: duplicateRiskFlag,
      image_sha256: imageHash,
    };

    return {
      id: crypto.randomUUID(),
      observation_id: obs.id,
      passport_id: obs.passport_id,
      overall_score: overallScore,
      completeness_category: completenessCategory,
      image_quality_score: imageScore,
      classification_score: classificationScore,
      location_score: locationScore,
      metadata_score: metadataScore,
      duplicate_risk_flag: duplicateRiskFlag,
      image_sha256: imageHash || null,
      indicators,
      assessed_at: new Date().toISOString(),
    };
  }
}

export const dataQualityService = new DataQualityService();
