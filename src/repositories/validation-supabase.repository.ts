import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import {
  assertImageMetadataIsReal,
  assertPredictionIsScorable,
  calculateConsensus,
  type ValidationStore,
} from './validation-store.js';
import type {
  ValidationDataset,
  ValidationSample,
  ValidationImage,
  ValidationReferenceLabel,
  ValidationAiRun,
  ValidationAiPrediction,
  ValidationErrorRecord,
} from '../types/validation.types.js';

/**
 * Durable validation store backed by the Stage 7 schema.
 *
 * This is what makes a validation run outlive the process that produced it.
 * The in-memory `ValidationRepository` is retained for tests and for a
 * deployment with no database, but when Supabase is configured this store is
 * authoritative: datasets, specimens, reference labels, runs, predictions and
 * error records are written to the tables from migrations 010 and 015 and read
 * back unchanged after a restart.
 *
 * A failed database operation throws rather than degrading to an empty result.
 * The records are scientific evidence, and "no data" and "database unavailable"
 * must never be presented as the same answer.
 */
export class SupabaseValidationRepository implements ValidationStore {
  readonly isDurable = true;

  private fail(operation: string, err: unknown): never {
    logger.error('Validation database operation failed', {
      operation,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(
      `Validation database ${operation} failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  private static isUniqueViolation(err: { code?: string } | null): boolean {
    return err?.code === '23505';
  }

  // -------------------------------------------------------------
  // Dataset Management
  // -------------------------------------------------------------

  async createDataset(
    dataset: Omit<ValidationDataset, 'id' | 'created_at' | 'updated_at' | 'locked_at'>
  ): Promise<ValidationDataset> {
    const { data, error } = await (supabase.from('validation_datasets') as any)
      .insert({
        dataset_code: dataset.dataset_code,
        name: dataset.name,
        description: dataset.description,
        version: dataset.version,
        status: dataset.status,
        target_classification_level: dataset.target_classification_level,
        created_by: dataset.created_by,
      })
      .select('*')
      .single();

    if (error) {
      if (SupabaseValidationRepository.isUniqueViolation(error)) {
        throw new Error(
          `Dataset '${dataset.dataset_code}' version ${dataset.version} already exists.`
        );
      }
      this.fail('dataset creation', error);
    }

    return { ...(data as ValidationDataset), sample_count: 0 };
  }

  async getDatasetById(id: string): Promise<ValidationDataset | null> {
    const { data, error } = await (supabase.from('validation_datasets') as any)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) this.fail('dataset lookup', error);
    if (!data) return null;

    const { count, error: countError } = await (supabase.from('validation_samples') as any)
      .select('id', { count: 'exact', head: true })
      .eq('dataset_id', id);
    if (countError) this.fail('dataset sample count', countError);

    return { ...(data as ValidationDataset), sample_count: count ?? 0 };
  }

  async getDatasetByCode(code: string): Promise<ValidationDataset | null> {
    const { data, error } = await (supabase.from('validation_datasets') as any)
      .select('*')
      .eq('dataset_code', code)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) this.fail('dataset lookup', error);
    if (!data) return null;

    const { count, error: countError } = await (supabase.from('validation_samples') as any)
      .select('id', { count: 'exact', head: true })
      .eq('dataset_id', (data as ValidationDataset).id);
    if (countError) this.fail('dataset sample count', countError);

    return { ...(data as ValidationDataset), sample_count: count ?? 0 };
  }

  async listDatasets(): Promise<ValidationDataset[]> {
    const { data, error } = await (supabase.from('validation_datasets') as any)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) this.fail('dataset list', error);

    const datasets = (data ?? []) as ValidationDataset[];
    if (datasets.length === 0) return [];

    // One query for every sample's dataset id, tallied here, rather than a
    // count round-trip per dataset.
    const { data: sampleRows, error: sampleError } = await (supabase.from('validation_samples') as any)
      .select('dataset_id')
      .in(
        'dataset_id',
        datasets.map((d) => d.id)
      );
    if (sampleError) this.fail('dataset sample count', sampleError);

    const counts = new Map<string, number>();
    for (const row of (sampleRows ?? []) as { dataset_id: string }[]) {
      counts.set(row.dataset_id, (counts.get(row.dataset_id) || 0) + 1);
    }

    return datasets.map((d) => ({ ...d, sample_count: counts.get(d.id) ?? 0 }));
  }

  async lockDataset(id: string): Promise<ValidationDataset> {
    const now = new Date().toISOString();
    const { data, error } = await (supabase.from('validation_datasets') as any)
      .update({ status: 'locked', locked_at: now, updated_at: now })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) this.fail('dataset lock', error);
    if (!data) throw new Error('Dataset not found');
    return data as ValidationDataset;
  }

  // -------------------------------------------------------------
  // Sample Management
  // -------------------------------------------------------------

  async createSample(
    sample: Omit<ValidationSample, 'id' | 'created_at' | 'updated_at'>
  ): Promise<ValidationSample> {
    const dataset = await this.getDatasetById(sample.dataset_id);
    if (!dataset) throw new Error('Associated validation dataset not found.');
    if (dataset.status === 'locked') {
      throw new Error('Cannot add samples to a locked dataset. Please create a new dataset version.');
    }

    const { data, error } = await (supabase.from('validation_samples') as any)
      .insert({
        dataset_id: sample.dataset_id,
        sample_code: sample.sample_code,
        source_type: sample.source_type,
        collection_date: sample.collection_date ?? null,
        country: sample.country,
        district: sample.district ?? null,
        site_description: sample.site_description ?? null,
        specimen_notes: sample.specimen_notes ?? null,
        sample_status: sample.sample_status,
        data_partition: sample.data_partition,
        research_use_consent: sample.research_use_consent,
        image_use_consent: sample.image_use_consent,
      })
      .select('*')
      .single();

    if (error) {
      if (SupabaseValidationRepository.isUniqueViolation(error)) {
        throw new Error(`Sample code '${sample.sample_code}' already exists.`);
      }
      this.fail('sample creation', error);
    }
    return data as ValidationSample;
  }

  async getSampleById(id: string): Promise<ValidationSample | null> {
    const { data, error } = await (supabase.from('validation_samples') as any)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) this.fail('sample lookup', error);
    if (!data) return null;

    const [images, labels] = await Promise.all([
      this.imagesForSamples([id]),
      this.labelsForSamples([id]),
    ]);

    return this.assembleSample(
      data as ValidationSample,
      images.get(id) ?? [],
      labels.get(id) ?? []
    );
  }

  async getSampleByCode(code: string): Promise<ValidationSample | null> {
    const { data, error } = await (supabase.from('validation_samples') as any)
      .select('*')
      .eq('sample_code', code)
      .maybeSingle();
    if (error) this.fail('sample lookup', error);
    if (!data) return null;
    return this.getSampleById((data as ValidationSample).id);
  }

  async listSamplesByDataset(datasetId: string): Promise<ValidationSample[]> {
    const { data, error } = await (supabase.from('validation_samples') as any)
      .select('*')
      .eq('dataset_id', datasetId)
      .order('created_at', { ascending: true });
    if (error) this.fail('sample list', error);

    const samples = (data ?? []) as ValidationSample[];
    if (samples.length === 0) return [];

    const ids = samples.map((s) => s.id);
    const [images, labels] = await Promise.all([
      this.imagesForSamples(ids),
      this.labelsForSamples(ids),
    ]);

    return samples.map((s) => this.assembleSample(s, images.get(s.id) ?? [], labels.get(s.id) ?? []));
  }

  private assembleSample(
    sample: ValidationSample,
    images: ValidationImage[],
    labels: ValidationReferenceLabel[]
  ): ValidationSample {
    return {
      ...sample,
      images,
      reference_labels: labels,
      consensus: calculateConsensus(sample.id, labels),
    };
  }

  private async imagesForSamples(sampleIds: string[]): Promise<Map<string, ValidationImage[]>> {
    const grouped = new Map<string, ValidationImage[]>();
    if (sampleIds.length === 0) return grouped;

    const { data, error } = await (supabase.from('validation_images') as any)
      .select('*')
      .in('sample_id', sampleIds);
    if (error) this.fail('image list', error);

    for (const row of (data ?? []) as ValidationImage[]) {
      const list = grouped.get(row.sample_id) ?? [];
      list.push(this.normaliseImage(row));
      grouped.set(row.sample_id, list);
    }
    return grouped;
  }

  private async labelsForSamples(sampleIds: string[]): Promise<Map<string, ValidationReferenceLabel[]>> {
    const grouped = new Map<string, ValidationReferenceLabel[]>();
    if (sampleIds.length === 0) return grouped;

    const { data, error } = await (supabase.from('validation_reference_labels') as any)
      .select('*')
      .in('sample_id', sampleIds);
    if (error) this.fail('reference label list', error);

    for (const row of (data ?? []) as ValidationReferenceLabel[]) {
      const list = grouped.get(row.sample_id) ?? [];
      list.push(row);
      grouped.set(row.sample_id, list);
    }
    return grouped;
  }

  private normaliseImage(row: ValidationImage): ValidationImage {
    return {
      ...row,
      file_size_bytes:
        row.file_size_bytes === null || row.file_size_bytes === undefined
          ? row.file_size_bytes
          : Number(row.file_size_bytes),
    };
  }

  // -------------------------------------------------------------
  // Image Metadata & Duplicate Check
  // -------------------------------------------------------------

  async addSampleImage(image: Omit<ValidationImage, 'id' | 'created_at'>): Promise<ValidationImage> {
    const { data: sample, error: sampleError } = await (supabase.from('validation_samples') as any)
      .select('id, dataset_id')
      .eq('id', image.sample_id)
      .maybeSingle();
    if (sampleError) this.fail('sample lookup', sampleError);
    if (!sample) throw new Error('Target validation sample not found');

    const dataset = await this.getDatasetById((sample as { dataset_id: string }).dataset_id);
    if (dataset && dataset.status === 'locked') {
      throw new Error('Cannot add images to a locked dataset.');
    }

    assertImageMetadataIsReal(image);

    // Duplicate detection: an identical image hash already registered to a
    // different specimen means the same photograph was submitted twice.
    const { data: existing, error: existingError } = await (supabase.from('validation_images') as any)
      .select('sample_id')
      .eq('image_hash', image.image_hash);
    if (existingError) this.fail('image duplicate check', existingError);

    const duplicate = ((existing ?? []) as { sample_id: string }[]).find(
      (row) => row.sample_id !== image.sample_id
    );
    if (duplicate) {
      throw new Error(
        `Duplicate image detected! Exact image hash already registered for specimen '${duplicate.sample_id}'.`
      );
    }

    const { data, error } = await (supabase.from('validation_images') as any)
      .insert({
        sample_id: image.sample_id,
        storage_path: image.storage_path,
        image_hash: image.image_hash,
        image_width: image.image_width ?? null,
        image_height: image.image_height ?? null,
        file_size_bytes: image.file_size_bytes ?? null,
        lighting_condition: image.lighting_condition ?? null,
        background_condition: image.background_condition ?? null,
        view_type: image.view_type,
        scale_reference_present: image.scale_reference_present,
        quality_status: image.quality_status,
        quality_notes: image.quality_notes ?? null,
      })
      .select('*')
      .single();
    if (error) this.fail('image creation', error);

    return this.normaliseImage(data as ValidationImage);
  }

  // -------------------------------------------------------------
  // Reference Labels & Consensus
  // -------------------------------------------------------------

  async addReferenceLabel(
    label: Omit<ValidationReferenceLabel, 'id' | 'created_at'>
  ): Promise<ValidationReferenceLabel> {
    const { data: sample, error: sampleError } = await (supabase.from('validation_samples') as any)
      .select('id, dataset_id')
      .eq('id', label.sample_id)
      .maybeSingle();
    if (sampleError) this.fail('sample lookup', sampleError);
    if (!sample) throw new Error('Validation sample not found');

    const dataset = await this.getDatasetById((sample as { dataset_id: string }).dataset_id);
    if (dataset && dataset.status === 'locked') {
      throw new Error('Cannot add or modify reference labels on a locked dataset.');
    }

    // One review per expert: re-submitting replaces that expert's vote.
    const { data, error } = await (supabase.from('validation_reference_labels') as any)
      .upsert(
        {
          sample_id: label.sample_id,
          reviewer_id: label.reviewer_id,
          reviewer_name: label.reviewer_name,
          reviewer_role: label.reviewer_role,
          reviewer_organization: label.reviewer_organization,
          classification: label.classification,
          rock_name: label.rock_name ?? null,
          confidence: label.confidence,
          diagnostic_features: label.diagnostic_features,
          notes: label.notes ?? null,
          reference_method: label.reference_method,
        },
        { onConflict: 'sample_id,reviewer_id' }
      )
      .select('*')
      .single();
    if (error) this.fail('reference label submission', error);

    // Recompute the panel status from the persisted votes.
    const labels = (await this.labelsForSamples([label.sample_id])).get(label.sample_id) ?? [];
    const consensus = calculateConsensus(label.sample_id, labels);
    const nextStatus = consensus.is_disputed ? 'disputed' : 'labeled';

    const { error: statusError } = await (supabase.from('validation_samples') as any)
      .update({ sample_status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', label.sample_id);
    if (statusError) this.fail('sample status update', statusError);

    return data as ValidationReferenceLabel;
  }

  // -------------------------------------------------------------
  // AI Runs & Predictions
  // -------------------------------------------------------------

  async createAiRun(run: Omit<ValidationAiRun, 'id' | 'created_at'>): Promise<ValidationAiRun> {
    const { data, error } = await (supabase.from('validation_ai_runs') as any)
      .insert({
        dataset_id: run.dataset_id,
        run_code: run.run_code,
        model_name: run.model_name,
        prompt_version: run.prompt_version,
        analysis_version: run.analysis_version,
        application_version: run.application_version,
        status: run.status,
        total_samples: run.total_samples,
        successful_samples: run.successful_samples,
        failed_samples: run.failed_samples,
        is_partial_run: run.is_partial_run,
        started_at: run.started_at ?? null,
        completed_at: run.completed_at ?? null,
      })
      .select('*')
      .single();
    if (error) this.fail('AI run creation', error);
    return data as ValidationAiRun;
  }

  async getAiRunById(id: string): Promise<ValidationAiRun | null> {
    const { data, error } = await (supabase.from('validation_ai_runs') as any)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) this.fail('AI run lookup', error);
    return (data as ValidationAiRun) ?? null;
  }

  async listAiRuns(datasetId?: string): Promise<ValidationAiRun[]> {
    let query = (supabase.from('validation_ai_runs') as any)
      .select('*')
      .order('created_at', { ascending: false });
    if (datasetId) query = query.eq('dataset_id', datasetId);
    const { data, error } = await query;
    if (error) this.fail('AI run list', error);
    return (data ?? []) as ValidationAiRun[];
  }

  async updateAiRunStatus(
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
  ): Promise<ValidationAiRun> {
    const { data, error } = await (supabase.from('validation_ai_runs') as any)
      .update(updates)
      .eq('id', runId)
      .select('*')
      .maybeSingle();
    if (error) this.fail('AI run update', error);
    if (!data) throw new Error('AI run not found');
    return data as ValidationAiRun;
  }

  async recordPrediction(
    pred: Omit<ValidationAiPrediction, 'id' | 'created_at'>
  ): Promise<ValidationAiPrediction> {
    assertPredictionIsScorable(pred);

    const { data, error } = await (supabase.from('validation_ai_predictions') as any)
      .insert({
        run_id: pred.run_id,
        sample_id: pred.sample_id,
        image_id: pred.image_id ?? null,
        is_rock: pred.is_rock,
        classification: pred.classification,
        possible_name: pred.possible_name ?? null,
        confidence: pred.confidence,
        confidence_score: pred.confidence_score ?? null,
        observed_features: pred.observed_features,
        reasoning: pred.reasoning,
        limitations: pred.limitations,
        response_time_ms: pred.response_time_ms,
        model_name: pred.model_name,
        prompt_version: pred.prompt_version,
      })
      .select('*')
      .single();
    if (error) this.fail('prediction record', error);
    return this.normalisePrediction(data as ValidationAiPrediction);
  }

  async getPredictionsByRun(runId: string): Promise<ValidationAiPrediction[]> {
    const { data, error } = await (supabase.from('validation_ai_predictions') as any)
      .select('*')
      .eq('run_id', runId);
    if (error) this.fail('prediction list', error);
    return ((data ?? []) as ValidationAiPrediction[]).map((p) => this.normalisePrediction(p));
  }

  private normalisePrediction(row: ValidationAiPrediction): ValidationAiPrediction {
    // PostgREST returns `numeric` as a string to preserve precision. The metric
    // engine expects a number, so it is coerced here, at the boundary.
    const score = row.confidence_score as unknown;
    return {
      ...row,
      confidence_score: score === null || score === undefined ? row.confidence_score : Number(score),
    };
  }

  // -------------------------------------------------------------
  // Error Categorization
  // -------------------------------------------------------------

  async recordError(
    err: Omit<ValidationErrorRecord, 'id' | 'created_at'>
  ): Promise<ValidationErrorRecord> {
    const { data, error } = await (supabase.from('validation_errors') as any)
      .insert({
        run_id: err.run_id,
        sample_id: err.sample_id,
        reference_classification: err.reference_classification,
        ai_classification: err.ai_classification,
        ai_confidence: err.ai_confidence,
        error_category: err.error_category,
        error_notes: err.error_notes ?? null,
        annotated_by: err.annotated_by ?? null,
      })
      .select('*')
      .single();
    if (error) this.fail('error record', error);
    return data as ValidationErrorRecord;
  }

  async getErrorsByRun(runId: string): Promise<ValidationErrorRecord[]> {
    const { data, error } = await (supabase.from('validation_errors') as any)
      .select('*')
      .eq('run_id', runId);
    if (error) this.fail('error list', error);
    return (data ?? []) as ValidationErrorRecord[];
  }
}
