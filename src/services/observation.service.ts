import { observationRepository, ObservationRepository } from '../repositories/observation.repository.js';
import { hashUserPhoneNumber, computeMediaSha256 } from '../utils/crypto.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { normalizeDistrictName } from '../utils/public-location.js';
import {
  GEOSCIENCE_CATEGORY_LABELS,
  normalizeCategoryPair,
  type GeoscienceCategory,
} from '../ai/geoscience-taxonomy.js';
import type { GeoscienceAnalysisResult } from '../ai/geological.types.js';
import type {
  ObservationRow,
  ObservationInsert,
  ObservationMediaInsert,
  ObservationLocationInsert,
  LocationStatus,
  DataQualityStatus,
  LocationSource,
  PublicLocationPrecision,
  MediaType,
  EvidenceState,
} from '../types/database.types.js';

export interface ObservationLocationInput {
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  locationText?: string | null;
  district?: string | null;
  sector?: string | null;
  cell?: string | null;
  village?: string | null;
  locationSource?: LocationSource;
  /**
   * The precision the sender has explicitly authorised for publication, if any.
   *
   * Absent means no coordinate is published. Exact publication is only ever
   * reached through an explicit `exact` value recorded at collection time, never
   * as a default, because a contributor who shared a pin for their own
   * reference did not agree to have it published.
   */
  publicLocationPrecision?: PublicLocationPrecision;
}

export interface CreateObservationParams {
  aiResult: GeoscienceAnalysisResult;
  senderPhoneNumber: string;
  messageId: string;
  media: {
    buffer: Buffer;
    mimeType: string;
    fileSize: number;
    mediaId: string;
    mediaType?: MediaType;
    durationSeconds?: number | null;
    widthPx?: number | null;
    heightPx?: number | null;
    captureDate?: string | null;
  };
  userCaption?: string;
  location?: ObservationLocationInput;
  /**
   * An existing geological site to attach the observation to. Site assignment is
   * never automatic: observations are only grouped when a real site record
   * already exists.
   */
  siteId?: string | null;
}

let inMemoryPassportCounter = 1;

/**
 * Generates an in-memory sequential passport ID if database sequence isn't used.
 *
 * The database sequence is the authoritative source. This exists only so a
 * caller with no database still receives a well-formed identifier in a message.
 */
export function generatePassportId(counter?: number): string {
  const num = counter ?? inMemoryPassportCounter++;
  return `RT-RW-${String(num).padStart(6, '0')}`;
}

/**
 * The category-first view of an analysis result.
 *
 * A Stage 2 result may arrive without any of the category fields, because older
 * callers and stored analyses predate them. Normalising here rather than trusting
 * the input means a legacy result is stored as the rock observation it actually
 * is, instead of being written as `unknown` and rendered as no answer at all.
 */
interface NormalizedCategory {
  category: GeoscienceCategory;
  subcategory: string;
  type: string;
  interpretation: string;
  context: string;
  diagnosticFeatures: string[];
  uncertainties: string[];
  questionsForUser: string[];
  blockedClaims: string[];
}

/**
 * Reads a possibly-absent array field from an analysis result.
 *
 * The result is treated as untrusted because it ultimately originates from model
 * output, so a missing field yields an empty array rather than a value that would
 * later be read as `.length` on undefined.
 */
function readList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeCategoryFields(aiResult: GeoscienceAnalysisResult): NormalizedCategory {
  const classification = String(aiResult.primary_classification ?? '').toLowerCase();
  const inferred: GeoscienceCategory | undefined =
    classification === 'igneous' || classification === 'sedimentary' || classification === 'metamorphic'
      ? 'rock'
      : classification === 'non_rock'
        ? 'non_geoscience'
        : classification === 'insufficient_image'
          ? 'insufficient_image'
          : aiResult.is_rock === true
            ? 'rock'
            : undefined;

  const pair = normalizeCategoryPair(
    aiResult.observation_category ?? inferred,
    aiResult.observation_subcategory
  );

  const type =
    typeof aiResult.observation_type === 'string' && aiResult.observation_type.trim().length > 0
      ? aiResult.observation_type.trim()
      : pair.observation_subcategory.replace(/[^a-z0-9_]/gi, '_').toLowerCase();

  const interpretation =
    typeof aiResult.primary_interpretation === 'string' && aiResult.primary_interpretation.trim().length > 0
      ? aiResult.primary_interpretation.trim()
      : `Possible ${GEOSCIENCE_CATEGORY_LABELS[pair.observation_category].toLowerCase()} observation. Requires further evidence before it can be described more precisely.`;

  return {
    category: pair.observation_category,
    subcategory: pair.observation_subcategory,
    type,
    interpretation,
    context: typeof aiResult.geological_context === 'string' ? aiResult.geological_context : '',
    diagnosticFeatures: readList(aiResult.diagnostic_features),
    uncertainties: readList(aiResult.uncertainties),
    questionsForUser: readList(aiResult.questions_for_user),
    blockedClaims: readList(aiResult.blocked_claims),
  };
}

/**
 * The initial evidence state for a newly analysed observation.
 *
 * Always `ai_assisted` unless the analysis itself concluded there was not enough
 * to read, in which case `insufficient_evidence` is the honest state. A brand
 * new record has had no community activity and no expert review, so it may not
 * start anywhere higher on the ladder regardless of what the model was confident
 * about.
 */
function initialEvidenceState(category: GeoscienceCategory): EvidenceState {
  if (category === 'insufficient_image') return 'insufficient_evidence';
  if (category === 'non_geoscience') return 'insufficient_evidence';
  if (category === 'unknown') return 'insufficient_evidence';
  return 'ai_assisted';
}

export class ObservationService {
  constructor(private readonly repo: ObservationRepository = observationRepository) {}

  /**
   * Validates geographic coordinates if supplied.
   * Throws an error if coordinates are out of bounds.
   */
  validateCoordinates(latitude?: number | null, longitude?: number | null): void {
    if (latitude !== undefined && latitude !== null) {
      if (typeof latitude !== 'number' || isNaN(latitude) || latitude < -90 || latitude > 90) {
        throw new Error(`Invalid latitude: ${latitude}. Must be between -90 and 90 degrees.`);
      }
    }

    if (longitude !== undefined && longitude !== null) {
      if (typeof longitude !== 'number' || isNaN(longitude) || longitude < -180 || longitude > 180) {
        throw new Error(`Invalid longitude: ${longitude}. Must be between -180 and 180 degrees.`);
      }
    }
  }

  /**
   * Retrieves an observation by its public passport ID.
   */
  async getObservationByPassportId(passportId: string): Promise<ObservationRow | null> {
    return this.repo.findByPassportId(passportId);
  }

  /**
   * Retrieves an existing observation by its source WhatsApp message ID.
   */
  async getObservationBySourceMessageId(sourceMessageId: string): Promise<ObservationRow | null> {
    return this.repo.findBySourceMessageId(sourceMessageId);
  }

  /**
   * Attaches an existing observation to a geological site.
   *
   * Grouping is only ever explicit. Nothing here infers that two nearby records
   * belong together, because proximity is not a geological relationship and a
   * silently-created cluster would present a guess as a fact.
   */
  async attachToSite(observationId: string, siteId: string, actor: string): Promise<void> {
    await this.repo.setObservationSite(observationId, siteId, actor);
  }

  /**
   * Publishes or unpublishes an observation, recording the decision.
   *
   * Publication is a deliberate act, so it always carries a reason into the audit
   * log and always stamps `published_at`.
   */
  async setPublication(
    observationId: string,
    publicationStatus: 'public' | 'private' | 'hidden',
    reason: string,
    actor: string
  ): Promise<void> {
    await this.repo.setPublicationStatus(observationId, publicationStatus, reason, actor);
  }

  /**
   * Records an evidence-state change with a mandatory reason.
   *
   * The reason is required rather than optional because an evidence state is the
   * most consequential value a public reader ever sees. "Why does this say
   * unresolved" must always be answerable.
   */
  async setEvidenceState(
    observationId: string,
    state: EvidenceState,
    reason: string,
    actor: string
  ): Promise<void> {
    if (!reason || reason.trim().length === 0) {
      throw new Error('An evidence state change requires a recorded reason.');
    }
    await this.repo.setEvidenceState(observationId, state, reason.trim(), actor);
  }

  /**
   * Creates and persists a Geoscience Passport record.
   *
   * The method name is preserved from Stage 3 because existing callers and tests
   * use it. The record it writes is no longer rock-specific: it carries the
   * category-first fields alongside the original rock fields.
   */
  async createRockPassport(params: CreateObservationParams): Promise<ObservationRow> {
    const { aiResult, senderPhoneNumber, messageId, media, userCaption, location, siteId } = params;

    // 1. Idempotency Check: Don't recreate passport if source_message_id already exists
    const existing = await this.repo.findBySourceMessageId(messageId);
    if (existing) {
      logger.info('Observation already exists for message, returning existing passport', {
        messageId,
        passportId: existing.passport_id,
      });
      return existing;
    }

    // 2. Validate location if supplied
    if (location) {
      this.validateCoordinates(location.latitude, location.longitude);
    }

    // 3. User Privacy: Salted HMAC hash of phone number (never store raw phone numbers)
    const userHash = hashUserPhoneNumber(senderPhoneNumber);

    // 4. Media checksum for research integrity
    const mediaSha256 = computeMediaSha256(media.buffer);

    // 5. Normalize the category-first fields.
    //
    // A Stage 2 result may carry none of them, so the category is recovered from
    // the legacy rock fields rather than defaulted to `unknown`. Defaulting would
    // store a valid rock observation as "cannot tell what this is", which is a
    // false statement about the record.
    const category = normalizeCategoryFields(aiResult);

    // 6. Determine location status
    let locationStatus: LocationStatus = 'not_provided';
    if (location?.latitude !== undefined && location?.latitude !== null) {
      locationStatus = 'user_provided';
    } else if (location?.locationText && location.locationText.trim().length > 0) {
      locationStatus = 'user_provided';
    }

    // 7. Determine data quality status
    //
    // Completeness depends on whether the observation could be read at all, not
    // on whether the subject happened to be a rock. A well-described fossil with
    // a location is complete; an unreadable photo of a rock is not.
    let dataQualityStatus: DataQualityStatus = 'partial';
    if (category.category === 'insufficient_image' || aiResult.confidence === 'insufficient') {
      dataQualityStatus = 'insufficient';
    } else if (locationStatus === 'user_provided' && category.category !== 'unknown') {
      dataQualityStatus = 'complete';
    }

    // 8. Assemble observation insert payload
    const observationPayload: ObservationInsert = {
      source: 'whatsapp',
      source_message_id: messageId,
      source_user_hash: userHash,
      status: 'processing',

      // Category-first fields. These are what the public map filters and the
      // passport renders; the rock fields below remain for compatibility.
      observation_category: category.category,
      observation_subcategory: category.subcategory,
      observation_type: category.type,
      primary_interpretation: category.interpretation,
      geological_context: category.context || null,
      diagnostic_features: category.diagnosticFeatures,
      possible_alternatives: readList(aiResult.alternative_possibilities),
      uncertainties: category.uncertainties,
      questions_for_user: category.questionsForUser,
      community_status: 'not_started',

      is_rock: aiResult.is_rock,
      primary_classification: aiResult.primary_classification,
      possible_name: aiResult.possible_name,
      confidence: aiResult.confidence,
      confidence_score: aiResult.confidence_score,
      observed_features: readList(aiResult.observed_features),
      reasoning: aiResult.reasoning,
      alternative_possibilities: readList(aiResult.alternative_possibilities),
      limitations: readList(aiResult.limitations),
      recommended_next_steps: aiResult.recommended_next_steps,
      safety_note: aiResult.safety_note,
      user_caption: userCaption || null,

      verification_status: 'unverified',
      publication_status: 'private',
      // A new record has had no community activity and no expert review.
      evidence_state: initialEvidenceState(category.category),
      evidence_state_changed_at: new Date().toISOString(),
      evidence_state_changed_by: 'system:analysis',
      site_id: siteId ?? null,
      location_status: locationStatus,
      data_quality_status: dataQualityStatus,
      ai_model: env.GEMINI_MODEL,
      ai_prompt_version: 'geoscience-category-v2',
      analysis_version: 'geoscience-v2',
      system_version: 'stage10-v1',
    };

    // 8. Record pipeline start event
    await this.repo.recordProcessingEvent({
      observation_id: null,
      event_type: 'observation_created',
      status: 'started',
    });

    try {
      // 9. Persist Observation
      const createdObservation = await this.repo.createObservation(observationPayload);

      // 10. Persist Media Metadata
      //
      // The caption is stored on the media row as well as on the observation,
      // because it describes what this specific photograph or video shows. Media
      // is private by default: a row existing never makes it public.
      const mediaType: MediaType = media.mediaType ?? 'image';
      const mediaPayload: ObservationMediaInsert = {
        observation_id: createdObservation.id,
        media_type: mediaType,
        mime_type: media.mimeType,
        file_size: media.fileSize,
        sha256: mediaSha256,
        source_media_id: media.mediaId,
        storage_status: 'metadata_only',
        site_id: siteId ?? null,
        caption: userCaption || null,
        media_category: category.category,
        capture_date: media.captureDate ?? null,
        duration_seconds: media.durationSeconds ?? null,
        width_px: media.widthPx ?? null,
        height_px: media.heightPx ?? null,
        visibility: 'private',
        moderation_status: 'visible',
      };
      await this.repo.saveObservationMedia(mediaPayload);

      // 11. Persist Location if voluntarily provided
      //
      // Publication precision defaults to `private`. A sender who shared a pin so
      // Earth Talk could organise their record has not thereby agreed to have the
      // exact point published, so the default is the safest value that exists.
      if (location && (location.latitude !== undefined || location.locationText)) {
        const district = location.district ?? null;
        const normalizedDistrict = district ? normalizeDistrictName(district) : null;
        const locationPayload: ObservationLocationInsert = {
          observation_id: createdObservation.id,
          location_source: location.locationSource || (location.latitude ? 'user_gps' : 'user_manual'),
          latitude: location.latitude ?? null,
          longitude: location.longitude ?? null,
          accuracy_meters: location.accuracyMeters ?? null,
          district: normalizedDistrict,
          sector: location.sector ?? null,
          cell: location.cell ?? null,
          village: location.village ?? null,
          location_text: location.locationText ?? null,
          public_location_precision: location.publicLocationPrecision ?? 'private',
          is_public: false,
        };
        await this.repo.saveObservationLocation(locationPayload);
      }

      // 12. Mark Observation status as completed
      await this.repo.updateObservationStatus(createdObservation.id, 'completed');
      createdObservation.status = 'completed';

      // 13. Record successful database event
      await this.repo.recordProcessingEvent({
        observation_id: createdObservation.id,
        event_type: 'database_saved',
        status: 'completed',
      });

      logger.info('Geoscience Passport created and saved successfully', {
        passportId: createdObservation.passport_id,
        observationId: createdObservation.id,
        category: createdObservation.observation_category,
        subcategory: createdObservation.observation_subcategory,
        classification: createdObservation.primary_classification,
      });

if (category.blockedClaims.length > 0) {
      logger.warn('Analysis contained a prohibited claim; the field was dropped before storage', {
        passportId: createdObservation.passport_id,
        blocked: category.blockedClaims,
      });
    }

      return createdObservation;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown database error';
      logger.error('Failed to persist Geoscience Passport in Supabase', {
        messageId,
        error: errorMsg,
      });

      await this.repo.recordProcessingEvent({
        observation_id: null,
        event_type: 'database_saved',
        status: 'failed',
        error_code: 'DATABASE_INSERT_FAILED',
      });

      throw err;
    }
  }
}

export const observationService = new ObservationService();
