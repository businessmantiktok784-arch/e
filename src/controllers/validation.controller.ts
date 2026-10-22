import type { Response } from 'express';
import { validationEvaluationService, ValidationEvaluationService } from '../services/validation-evaluation.service.js';
import type { AuthenticatedAdminRequest } from '../utils/admin-auth.js';
import { logger } from '../utils/logger.js';

export class ValidationController {
  constructor(private service: ValidationEvaluationService = validationEvaluationService) {}

  /**
   * Maps a thrown error onto the status code it deserves.
   *
   * A missing run is not a malformed request. Answering 400 told an integrator
   * their call was wrong when in fact the run they asked for does not exist, and
   * there is no way to recover from that except by guessing a different id.
   */
  private static fail(res: Response, err: unknown, fallback: string): void {
    const msg = err instanceof Error ? err.message : fallback;
    const notFound = /not found/i.test(msg);
    res.status(notFound ? 404 : 400).json({ error: msg });
  }

  /**
   * GET /api/research/validation/datasets
   */
  listDatasets = async (_req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const datasets = await this.service.listDatasets();
      res.status(200).json({ datasets, count: datasets.length });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to list datasets';
      logger.error('Error in listDatasets', { error: msg });
      res.status(500).json({ error: msg });
    }
  };

  /**
   * POST /api/research/validation/datasets
   */
  createDataset = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const { dataset_code, name, description, version, status, target_classification_level } = req.body || {};
      if (!dataset_code || !name) {
        res.status(400).json({ error: 'dataset_code and name are required fields' });
        return;
      }

      const dataset = await this.service.createDataset({
        dataset_code,
        name,
        description: description || '',
        version: version || '1.0.0',
        status: status || 'draft',
        target_classification_level: target_classification_level || 'broad_class',
        created_by: req.admin?.email ?? 'super_admin',
      });

      res.status(201).json(dataset);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create dataset';
      res.status(400).json({ error: msg });
    }
  };

  /**
   * GET /api/research/validation/datasets/:id
   */
  getDataset = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const dataset = await this.service.getDataset(req.params.id);
      if (!dataset) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
      }
      const samples = await this.service.listSamples(dataset.id);
      res.status(200).json({ dataset, samples, sample_count: samples.length });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to get dataset';
      res.status(500).json({ error: msg });
    }
  };

  /**
   * POST /api/research/validation/datasets/:id/lock
   */
  lockDataset = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const dataset = await this.service.lockDataset(req.params.id);
      res.status(200).json({ message: 'Dataset locked successfully for evaluation reproducibility', dataset });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to lock dataset';
      res.status(400).json({ error: msg });
    }
  };

  /**
   * POST /api/research/validation/samples
   */
  createSample = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const {
        dataset_id,
        sample_code,
        source_type,
        collection_date,
        country,
        district,
        site_description,
        specimen_notes,
        data_partition,
        research_use_consent,
        image_use_consent,
      } = req.body || {};

      if (!dataset_id || !sample_code || !source_type) {
        res.status(400).json({ error: 'dataset_id, sample_code, and source_type are required fields' });
        return;
      }

      const sample = await this.service.registerSample({
        dataset_id,
        sample_code,
        source_type,
        collection_date: collection_date || null,
        country: country || 'Rwanda',
        district: district || null,
        site_description: site_description || null,
        specimen_notes: specimen_notes || null,
        sample_status: 'registered',
        data_partition: data_partition || 'evaluation',
        research_use_consent: research_use_consent !== false,
        image_use_consent: image_use_consent !== false,
      });

      res.status(201).json(sample);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to register sample';
      res.status(400).json({ error: msg });
    }
  };

  /**
   * GET /api/research/validation/samples/:id
   */
  getSample = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const sample = await this.service.getSample(req.params.id);
      if (!sample) {
        res.status(404).json({ error: 'Sample not found' });
        return;
      }
      res.status(200).json(sample);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to get sample';
      res.status(500).json({ error: msg });
    }
  };

  /**
   * POST /api/research/validation/samples/:id/images
   */
  addImage = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const {
        storage_path,
        image_hash,
        image_width,
        image_height,
        file_size_bytes,
        lighting_condition,
        background_condition,
        view_type,
        scale_reference_present,
      } = req.body || {};

      if (!storage_path || !image_hash) {
        res.status(400).json({ error: 'storage_path and image_hash are required' });
        return;
      }

      const img = await this.service.addImage({
        sample_id: req.params.id,
        storage_path,
        image_hash,
        image_width: image_width || 1024,
        image_height: image_height || 1024,
        file_size_bytes: file_size_bytes || 204800,
        lighting_condition: lighting_condition || 'diffuse_lab',
        background_condition: background_condition || 'neutral_grey',
        view_type: view_type || 'overview',
        scale_reference_present: Boolean(scale_reference_present),
        quality_status: 'accepted',
      });

      res.status(201).json(img);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to attach image';
      res.status(400).json({ error: msg });
    }
  };

  /**
   * POST /api/research/validation/reference-labels
   */
  submitReferenceLabel = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const {
        sample_id,
        classification,
        rock_name,
        confidence,
        diagnostic_features,
        notes,
        reference_method,
        reviewer_label,
        organization,
      } = req.body || {};

      if (!sample_id || !classification) {
        res.status(400).json({ error: 'sample_id and classification are required' });
        return;
      }

      const reviewerId = req.admin?.adminId ?? 'unknown';
      const reviewerName = reviewer_label ?? 'Unattributed review';
      const reviewerRole = 'admin';
      const reviewerOrg = organization ?? 'Recorded by the platform owner';

      const label = await this.service.submitReferenceLabel({
        sample_id,
        reviewer_id: reviewerId,
        reviewer_name: reviewerName,
        reviewer_role: reviewerRole,
        reviewer_organization: reviewerOrg,
        classification,
        rock_name: rock_name || null,
        confidence: confidence || 'high',
        diagnostic_features: diagnostic_features || [],
        notes: notes || null,
        reference_method: reference_method || 'expert_visual_identification',
      });

      res.status(201).json(label);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit reference label';
      res.status(400).json({ error: msg });
    }
  };

  /**
   * POST /api/research/validation/runs
   */
  triggerRun = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const { dataset_id, model_name, prompt_version, max_samples } = req.body || {};
      if (!dataset_id) {
        res.status(400).json({ error: 'dataset_id is required' });
        return;
      }

      const run = await this.service.createAndExecuteRun(dataset_id, {
        modelName: model_name,
        promptVersion: prompt_version,
        maxSamples: max_samples,
      });

      res.status(201).json(run);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to trigger evaluation run';
      res.status(400).json({ error: msg });
    }
  };

  /**
   * GET /api/research/validation/evaluations/:runId
   */
  getEvaluation = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const evaluation = await this.service.computeRunEvaluation(req.params.runId);
      res.status(200).json(evaluation);
    } catch (err: unknown) {
      ValidationController.fail(res, err, 'Failed to compute evaluation');
    }
  };

  /**
   * GET /api/research/validation/errors/:runId
   */
  getErrors = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const errors = await this.service.getRunErrors(req.params.runId);
      res.status(200).json({ errors, count: errors.length });
    } catch (err: unknown) {
      ValidationController.fail(res, err, 'Failed to get errors');
    }
  };

  /**
   * GET /api/research/validation/export/:runId
   */
  exportResults = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const format = (req.query.format as string) || 'csv';
      if (format === 'json') {
        const json = await this.service.exportEvaluationJson(req.params.runId);
        res.status(200).json(json);
        return;
      }

      const csv = await this.service.exportEvaluationCsv(req.params.runId);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="evaluation-${req.params.runId}.csv"`);
      res.status(200).send(csv);
    } catch (err: unknown) {
      ValidationController.fail(res, err, 'Failed to export evaluation');
    }
  };
}

export const validationController = new ValidationController();
