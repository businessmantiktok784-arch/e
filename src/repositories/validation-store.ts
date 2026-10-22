import type {
  ValidationDataset,
  ValidationSample,
  ValidationImage,
  ValidationReferenceLabel,
  ValidationAiRun,
  ValidationAiPrediction,
  ValidationErrorRecord,
  SampleConsensus,
} from '../types/validation.types.js';
import type { RockClassification } from '../ai/geological.types.js';

/**
 * The behaviour a validation store must provide, independent of where records
 * live.
 *
 * Two implementations exist: `ValidationRepository` (process memory, for
 * development and tests) and `SupabaseValidationRepository` (durable, used
 * whenever the database is configured). The evaluation service depends on this
 * interface so the same metrics engine scores either one.
 */
export interface ValidationStore {
  /** Whether records survive a restart. Read before trusting stored results. */
  readonly isDurable: boolean;

  createDataset(
    dataset: Omit<ValidationDataset, 'id' | 'created_at' | 'updated_at' | 'locked_at'>
  ): Promise<ValidationDataset>;
  getDatasetById(id: string): Promise<ValidationDataset | null>;
  getDatasetByCode(code: string): Promise<ValidationDataset | null>;
  listDatasets(): Promise<ValidationDataset[]>;
  lockDataset(id: string): Promise<ValidationDataset>;

  createSample(
    sample: Omit<ValidationSample, 'id' | 'created_at' | 'updated_at'>
  ): Promise<ValidationSample>;
  getSampleById(id: string): Promise<ValidationSample | null>;
  getSampleByCode(code: string): Promise<ValidationSample | null>;
  listSamplesByDataset(datasetId: string): Promise<ValidationSample[]>;

  addSampleImage(image: Omit<ValidationImage, 'id' | 'created_at'>): Promise<ValidationImage>;

  addReferenceLabel(
    label: Omit<ValidationReferenceLabel, 'id' | 'created_at'>
  ): Promise<ValidationReferenceLabel>;

  createAiRun(run: Omit<ValidationAiRun, 'id' | 'created_at'>): Promise<ValidationAiRun>;
  getAiRunById(id: string): Promise<ValidationAiRun | null>;
  listAiRuns(datasetId?: string): Promise<ValidationAiRun[]>;
  updateAiRunStatus(
    runId: string,
    updates: Partial<
      Pick<
        ValidationAiRun,
        | 'status'
        | 'started_at'
        | 'completed_at'
        | 'successful_samples'
        | 'failed_samples'
        | 'total_samples'
        | 'is_partial_run'
      >
    >
  ): Promise<ValidationAiRun>;

  recordPrediction(
    pred: Omit<ValidationAiPrediction, 'id' | 'created_at'>
  ): Promise<ValidationAiPrediction>;
  getPredictionsByRun(runId: string): Promise<ValidationAiPrediction[]>;

  recordError(err: Omit<ValidationErrorRecord, 'id' | 'created_at'>): Promise<ValidationErrorRecord>;
  getErrorsByRun(runId: string): Promise<ValidationErrorRecord[]>;
}

/**
 * The image classes a validation specimen may declare. Kept beside the
 * validator so the in-memory and database stores accept exactly the same set.
 */
export const VALID_VIEW_TYPES: ValidationImage['view_type'][] = [
  'overview',
  'closeup',
  'texture',
  'fresh_surface',
  'multiple_angles',
];

export const VALID_QUALITY_STATUSES: ValidationImage['quality_status'][] = [
  'accepted',
  'rejected',
  'needs_review',
];

export const VALID_CLASSIFICATIONS: RockClassification[] = [
  'igneous',
  'sedimentary',
  'metamorphic',
  'unclassified',
  'non_rock',
  'insufficient_image',
];

/**
 * Rejects image metadata that cannot describe a real photograph.
 *
 * The database constrains these columns, but the in-memory store is the path
 * every test and every unconfigured deployment takes, and it accepted whatever
 * it was given. That let a zero-byte "specimen image" and a three-character
 * "SHA-256 hash" register successfully: the duplicate check would then compare
 * against a key that cannot identify duplicates, and the specimen would only be
 * discovered to be unscorable part-way through a paid evaluation run.
 */
export function assertImageMetadataIsReal(image: Omit<ValidationImage, 'id' | 'created_at'>): void {
  if (typeof image.storage_path !== 'string' || image.storage_path.trim() === '') {
    throw new Error(
      'Invalid image rejected: storage_path is required. An image with no object-storage path can never be fetched, so the specimen could not be evaluated.'
    );
  }

  // Duplicate detection is SHA-256 over the raw bytes. Anything that is not a
  // full hex digest disables the check for this specimen silently.
  if (typeof image.image_hash !== 'string' || !/^[0-9a-f]{64}$/i.test(image.image_hash.trim())) {
    throw new Error(
      `Invalid image rejected: image_hash must be a 64-character SHA-256 hex digest, received '${
        typeof image.image_hash === 'string' ? image.image_hash : typeof image.image_hash
      }'. A shorter value cannot detect duplicates.`
    );
  }

  for (const [field, value] of [
    ['image_width', image.image_width],
    ['image_height', image.image_height],
  ] as const) {
    if (value === undefined || value === null) continue;
    if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
      throw new Error(
        `Invalid image rejected: ${field} must be a positive integer number of pixels, received ${String(value)}.`
      );
    }
  }

  if (
    image.image_width !== undefined &&
    image.image_width !== null &&
    image.image_height !== undefined &&
    image.image_height !== null &&
    image.image_width < image.image_height
  ) {
    throw new Error(
      `Invalid image rejected: image_width (${image.image_width}) is smaller than image_height (${image.image_height}). A portrait photograph records the short edge as the width.`
    );
  }

  if (image.file_size_bytes !== undefined && image.file_size_bytes !== null) {
    if (!Number.isFinite(image.file_size_bytes) || image.file_size_bytes <= 0) {
      throw new Error(
        `Invalid image rejected: file_size_bytes must be a positive number of bytes, received ${String(image.file_size_bytes)}.`
      );
    }
  }

  if (!VALID_VIEW_TYPES.includes(image.view_type)) {
    throw new Error(
      `Invalid image rejected: view_type must be one of ${VALID_VIEW_TYPES.join(', ')}, received '${String(image.view_type)}'.`
    );
  }

  if (!VALID_QUALITY_STATUSES.includes(image.quality_status)) {
    throw new Error(
      `Invalid image rejected: quality_status must be one of ${VALID_QUALITY_STATUSES.join(', ')}, received '${String(image.quality_status)}'.`
    );
  }
}

/**
 * A prediction is only evidence about the model if it carries a class the metric
 * engine can score and, when present, a confidence in range. Without this check
 * a malformed value lands in the confusion matrix as a false negative for
 * whatever the reference happened to be.
 */
export function assertPredictionIsScorable(
  pred: Pick<ValidationAiPrediction, 'classification' | 'confidence_score'>
): void {
  if (!VALID_CLASSIFICATIONS.includes(pred.classification)) {
    throw new Error(
      `Prediction rejected: '${String(pred.classification)}' is not a recognised classification. A prediction must name one of ${VALID_CLASSIFICATIONS.join(', ')}.`
    );
  }

  if (typeof pred.confidence_score === 'number') {
    if (Number.isNaN(pred.confidence_score) || pred.confidence_score < 0 || pred.confidence_score > 1) {
      throw new Error(
        `Prediction rejected: confidence_score must be between 0 and 1, received ${pred.confidence_score}.`
      );
    }
  }
}

/**
 * Multi-expert consensus for one specimen's reference labels.
 *
 * Shared by both store implementations so the same votes always produce the same
 * consensus, whether they were just written to memory or read back from the
 * database. A label set with a clear majority is a consensus; a split panel is
 * marked disputed, which the metric engine then excludes rather than scoring the
 * model against a contested answer.
 */
export function calculateConsensus(
  sampleId: string,
  labels: ValidationReferenceLabel[]
): SampleConsensus {
  if (labels.length === 0) {
    return {
      sample_id: sampleId,
      majority_classification: null,
      agreement_count: 0,
      reviewer_count: 0,
      consensus_percentage: 0,
      is_disputed: false,
      status_label: 'unreviewed',
    };
  }

  if (labels.length === 1) {
    return {
      sample_id: sampleId,
      majority_classification: labels[0].classification,
      agreement_count: 1,
      reviewer_count: 1,
      consensus_percentage: 100,
      is_disputed: false,
      status_label: 'single_expert',
    };
  }

  const counts = new Map<string, number>();
  for (const l of labels) {
    counts.set(l.classification, (counts.get(l.classification) || 0) + 1);
  }

  let maxClass = labels[0].classification;
  let maxCount = 0;
  counts.forEach((cnt, cls) => {
    if (cnt > maxCount) {
      maxCount = cnt;
      maxClass = cls as typeof maxClass;
    }
  });

  const consensusPct = Math.round((maxCount / labels.length) * 1000) / 10;
  const isDisputed = labels.length >= 2 && consensusPct < 60;

  return {
    sample_id: sampleId,
    majority_classification: maxClass,
    agreement_count: maxCount,
    reviewer_count: labels.length,
    consensus_percentage: consensusPct,
    is_disputed: isDisputed,
    status_label: isDisputed ? 'disputed' : 'consensus',
  };
}
