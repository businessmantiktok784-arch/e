import crypto from 'node:crypto';
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
 * In-memory store for Stage 7 validation records.
 *
 * PERSISTENCE STATUS: nothing here is written to disk or to Supabase. Every
 * dataset, specimen, image, reference label, run, prediction and error is lost
 * when the process exits. Migration 010 defines the durable schema for all of
 * it, but no database-backed implementation is wired up, so this class is the
 * only implementation in the running system.
 *
 * This is disclosed rather than hidden because the records are scientific
 * evidence. A validation run that disappears on restart cannot be reproduced,
 * audited or published, so an operator must be told before entering a real
 * reference set rather than after discovering the loss.
 */
export class ValidationRepository {
  /** Whether records survive a restart. Read this before trusting stored results. */
  static readonly IS_DURABLE = false;

  private datasets = new Map<string, ValidationDataset>();
  private samples = new Map<string, ValidationSample>();
  private images = new Map<string, ValidationImage>();
  private referenceLabels = new Map<string, ValidationReferenceLabel[]>(); // sample_id -> labels
  private aiRuns = new Map<string, ValidationAiRun>();
  private aiPredictions = new Map<string, ValidationAiPrediction[]>(); // run_id -> predictions
  private errors = new Map<string, ValidationErrorRecord[]>(); // run_id -> errors
  private seenImageHashes = new Map<string, string>(); // image_hash -> sample_id

  // -------------------------------------------------------------
  // Dataset Management
  // -------------------------------------------------------------

async createDataset(dataset: Omit<ValidationDataset, 'id' | 'created_at' | 'updated_at' | 'locked_at'>): Promise<ValidationDataset> {
    // Uniqueness is (dataset_code, version), not dataset_code alone. A locked
    // dataset cannot be extended - the error that tells an admin to "create a
    // new dataset version" was previously impossible to follow, because the
    // code alone was already taken. Versioning is the only sanctioned way to
    // add specimens after a freeze, so the key has to admit it.
    const existing = Array.from(this.datasets.values()).find(
      (d) => d.dataset_code === dataset.dataset_code && d.version === dataset.version
    );
    if (existing) {
      throw new Error(
        `Dataset '${dataset.dataset_code}' version ${dataset.version} already exists.`
      );
    }

    const record: ValidationDataset = {
      ...dataset,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      locked_at: null,
      sample_count: 0,
    };
    this.datasets.set(record.id, record);
    return record;
  }

  async getDatasetById(id: string): Promise<ValidationDataset | null> {
    const d = this.datasets.get(id);
    if (!d) return null;
    const sampleCount = Array.from(this.samples.values()).filter((s) => s.dataset_id === id).length;
    return { ...d, sample_count: sampleCount };
  }

  async getDatasetByCode(code: string): Promise<ValidationDataset | null> {
    const d = Array.from(this.datasets.values()).find((item) => item.dataset_code === code);
    if (!d) return null;
    const sampleCount = Array.from(this.samples.values()).filter((s) => s.dataset_id === d.id).length;
    return { ...d, sample_count: sampleCount };
  }

  async listDatasets(): Promise<ValidationDataset[]> {
    return Array.from(this.datasets.values()).map((d) => {
      const sampleCount = Array.from(this.samples.values()).filter((s) => s.dataset_id === d.id).length;
      return { ...d, sample_count: sampleCount };
    });
  }

  async lockDataset(id: string): Promise<ValidationDataset> {
    const dataset = this.datasets.get(id);
    if (!dataset) throw new Error('Dataset not found');
    dataset.status = 'locked';
    // A freeze has its own timestamp. `updated_at` is bumped by every write, so
    // reusing it would make the instant of the freeze unverifiable - which is
    // the one thing a validation record has to be able to prove.
    dataset.locked_at = new Date().toISOString();
    dataset.updated_at = dataset.locked_at;
    return dataset;
  }

  // -------------------------------------------------------------
  // Sample Management
  // -------------------------------------------------------------

  async createSample(sample: Omit<ValidationSample, 'id' | 'created_at' | 'updated_at'>): Promise<ValidationSample> {
    const dataset = await this.getDatasetById(sample.dataset_id);
    if (!dataset) throw new Error('Associated validation dataset not found.');
    if (dataset.status === 'locked') {
      throw new Error('Cannot add samples to a locked dataset. Please create a new dataset version.');
    }

    const existingCode = Array.from(this.samples.values()).find((s) => s.sample_code === sample.sample_code);
    if (existingCode) {
      throw new Error(`Sample code '${sample.sample_code}' already exists.`);
    }

    const record: ValidationSample = {
      ...sample,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.samples.set(record.id, record);
    return record;
  }

  async getSampleById(id: string): Promise<ValidationSample | null> {
    const s = this.samples.get(id);
    if (!s) return null;
    const imgs = Array.from(this.images.values()).filter((img) => img.sample_id === id);
    const labels = this.referenceLabels.get(id) || [];
    const consensus = this.calculateConsensus(id, labels);

    return {
      ...s,
      images: imgs,
      reference_labels: labels,
      consensus,
    };
  }

  async getSampleByCode(code: string): Promise<ValidationSample | null> {
    const s = Array.from(this.samples.values()).find((item) => item.sample_code === code);
    if (!s) return null;
    return this.getSampleById(s.id);
  }

  async listSamplesByDataset(datasetId: string): Promise<ValidationSample[]> {
    const list = Array.from(this.samples.values()).filter((s) => s.dataset_id === datasetId);
    return Promise.all(list.map((s) => this.getSampleById(s.id) as Promise<ValidationSample>));
  }

  // -------------------------------------------------------------
  // Image Metadata & Duplicate Check
  // -------------------------------------------------------------

  /**
   * Rejects image metadata that cannot describe a real photograph.
   *
   * The database constrains these columns, but the in-memory store is the path
   * every test and every unconfigured deployment takes, and it accepted
   * whatever it was given. That let a zero-byte "specimen image" and a
   * three-character "SHA-256 hash" register successfully: the duplicate check
   * would then compare against a key that cannot identify duplicates, and the
   * specimen would only be discovered to be unscorable part-way through a paid
   * evaluation run.
   */
  private assertImageMetadataIsReal(image: Omit<ValidationImage, 'id' | 'created_at'>): void {
    if (typeof image.storage_path !== 'string' || image.storage_path.trim() === '') {
      throw new Error(
        "Invalid image rejected: storage_path is required. An image with no object-storage path can never be fetched, so the specimen could not be evaluated."
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

    const VALID_VIEW_TYPES: ValidationImage['view_type'][] = [
      'overview',
      'closeup',
      'texture',
      'fresh_surface',
      'multiple_angles',
    ];
    if (!VALID_VIEW_TYPES.includes(image.view_type)) {
      throw new Error(
        `Invalid image rejected: view_type must be one of ${VALID_VIEW_TYPES.join(', ')}, received '${String(image.view_type)}'.`
      );
    }

    const VALID_QUALITY_STATUSES: ValidationImage['quality_status'][] = [
      'accepted',
      'rejected',
      'needs_review',
    ];
    if (!VALID_QUALITY_STATUSES.includes(image.quality_status)) {
      throw new Error(
        `Invalid image rejected: quality_status must be one of ${VALID_QUALITY_STATUSES.join(', ')}, received '${String(image.quality_status)}'.`
      );
    }
  }

  async addSampleImage(image: Omit<ValidationImage, 'id' | 'created_at'>): Promise<ValidationImage> {
    const sample = this.samples.get(image.sample_id);
    if (!sample) throw new Error('Target validation sample not found');

    const dataset = this.datasets.get(sample.dataset_id);
    if (dataset && dataset.status === 'locked') {
      throw new Error('Cannot add images to a locked dataset.');
    }

    this.assertImageMetadataIsReal(image);

    // Check duplicate image hash across dataset
    const existingSampleId = this.seenImageHashes.get(image.image_hash);
    if (existingSampleId && existingSampleId !== image.sample_id) {
      throw new Error(
        `Duplicate image detected! Exact image hash already registered for specimen '${existingSampleId}'.`
      );
    }

    const record: ValidationImage = {
      ...image,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    this.images.set(record.id, record);
    this.seenImageHashes.set(image.image_hash, image.sample_id);
    return record;
  }

  // -------------------------------------------------------------
  // Reference Labels & Consensus
  // -------------------------------------------------------------

  async addReferenceLabel(
    label: Omit<ValidationReferenceLabel, 'id' | 'created_at'>
  ): Promise<ValidationReferenceLabel> {
    const sample = this.samples.get(label.sample_id);
    if (!sample) throw new Error('Validation sample not found');

    const dataset = this.datasets.get(sample.dataset_id);
    if (dataset && dataset.status === 'locked') {
      throw new Error('Cannot add or modify reference labels on a locked dataset.');
    }

    const labels = this.referenceLabels.get(label.sample_id) || [];
    // Multiple experts: ensure one review per expert
    const existingIdx = labels.findIndex((l) => l.reviewer_id === label.reviewer_id);

    const record: ValidationReferenceLabel = {
      ...label,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      labels[existingIdx] = record;
    } else {
      labels.push(record);
    }
    this.referenceLabels.set(label.sample_id, labels);

    // Update sample status based on consensus
    const consensus = this.calculateConsensus(label.sample_id, labels);
    if (consensus.is_disputed) {
      sample.sample_status = 'disputed';
    } else if (consensus.reviewer_count >= 1) {
      sample.sample_status = 'labeled';
    }
    sample.updated_at = new Date().toISOString();

    return record;
  }

  calculateConsensus(sampleId: string, labels: ValidationReferenceLabel[]): SampleConsensus {
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

    // Tally votes
    const counts = new Map<RockClassification, number>();
    for (const l of labels) {
      counts.set(l.classification, (counts.get(l.classification) || 0) + 1);
    }

    let maxClass: RockClassification = labels[0].classification;
    let maxCount = 0;
    counts.forEach((cnt, cls) => {
      if (cnt > maxCount) {
        maxCount = cnt;
        maxClass = cls;
      }
    });

    const consensusPct = Math.round((maxCount / labels.length) * 1000) / 10;
    // Mark disputed if no clear majority (e.g. less than 60% agreement when multiple experts)
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

  // -------------------------------------------------------------
  // AI Runs & Predictions
  // -------------------------------------------------------------

  async createAiRun(run: Omit<ValidationAiRun, 'id' | 'created_at'>): Promise<ValidationAiRun> {
    const record: ValidationAiRun = {
      ...run,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    this.aiRuns.set(record.id, record);
    return record;
  }

  async getAiRunById(id: string): Promise<ValidationAiRun | null> {
    return this.aiRuns.get(id) || null;
  }

  async listAiRuns(datasetId?: string): Promise<ValidationAiRun[]> {
    const list = Array.from(this.aiRuns.values());
    if (datasetId) return list.filter((r) => r.dataset_id === datasetId);
    return list;
  }

  async updateAiRunStatus(
    runId: string,
    updates: Partial<Pick<ValidationAiRun, 'status' | 'started_at' | 'completed_at' | 'successful_samples' | 'failed_samples' | 'total_samples' | 'is_partial_run'>>
  ): Promise<ValidationAiRun> {
    const run = this.aiRuns.get(runId);
    if (!run) throw new Error('AI run not found');
    Object.assign(run, updates);
    return run;
  }

  async recordPrediction(
    pred: Omit<ValidationAiPrediction, 'id' | 'created_at'>
  ): Promise<ValidationAiPrediction> {
    // A prediction is only evidence about the model if it actually carries a
    // class the metric engine can score. Without this check a malformed value
    // ("granite", "", null) lands in the confusion matrix as a false negative
    // for whatever the reference happened to be, quietly depressing recall and
    // manufacturing an error the model never made.
    const VALID_CLASSIFICATIONS: RockClassification[] = [
      'igneous',
      'sedimentary',
      'metamorphic',
      'unclassified',
      'non_rock',
      'insufficient_image',
    ];
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

    const record: ValidationAiPrediction = {
      ...pred,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    const list = this.aiPredictions.get(pred.run_id) || [];
    list.push(record);
    this.aiPredictions.set(pred.run_id, list);
    return record;
  }

  async getPredictionsByRun(runId: string): Promise<ValidationAiPrediction[]> {
    return this.aiPredictions.get(runId) || [];
  }

  // -------------------------------------------------------------
  // Error Categorization
  // -------------------------------------------------------------

  async recordError(err: Omit<ValidationErrorRecord, 'id' | 'created_at'>): Promise<ValidationErrorRecord> {
    const record: ValidationErrorRecord = {
      ...err,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    const list = this.errors.get(err.run_id) || [];
    list.push(record);
    this.errors.set(err.run_id, list);
    return record;
  }

  async getErrorsByRun(runId: string): Promise<ValidationErrorRecord[]> {
    return this.errors.get(runId) || [];
  }
}

export const validationRepository = new ValidationRepository();
