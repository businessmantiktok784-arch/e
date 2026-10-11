import type { Response } from 'express';
import { researchAnalyticsService, ResearchAnalyticsService } from '../services/research-analytics.service.js';
import { expertRepository } from '../repositories/expert.repository.js';
import { dataQualityService } from '../services/data-quality.service.js';
import { checkRateLimit } from '../utils/rate-limiter.js';
import type { AuthenticatedAdminRequest } from '../utils/admin-auth.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class ResearchController {
  constructor(private service: ResearchAnalyticsService = researchAnalyticsService) {}

  /**
   * GET /api/research/summary
   */
  getSummary = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      this.service.recordRequest();
      const summary = await this.service.getResearchSummary();
      res.status(200).json(summary);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error generating research summary';
      logger.error('Error in research getSummary', { error: msg });
      res.status(500).json({ error: 'Failed to generate research summary', requestId: req.requestId });
    }
  };

  /**
   * GET /api/research/dataset-version
   */
  getDatasetVersion = async (_req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    res.status(200).json({
      dataset_version: env.RESEARCH_DATASET_VERSION || 'RT-RW-RESEARCH-2026-001',
      schema_version: '1.0.0',
      description: 'Earth Talk Rwanda Citizen Geoscience Observations Research Dataset',
      updated_at: new Date().toISOString(),
    });
  };

  /**
   * GET /api/research/observations.csv
   */
  exportCsv = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const rateLimitKey = `export_csv_${clientIp}`;

      if (!checkRateLimit(rateLimitKey, env.RESEARCH_EXPORT_RATE_LIMIT_PER_MINUTE)) {
        res.status(429).json({
          error: 'Rate limit exceeded for research dataset exports. Please try again later.',
          code: 'EXPORT_RATE_LIMIT_EXCEEDED',
        });
        return;
      }

      this.service.recordRequest();
      const actorId = req.admin ? req.admin.email : 'super_admin';
      const csv = await this.service.exportObservationsCsv(actorId);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="earth-talk-observations-${env.RESEARCH_DATASET_VERSION}.csv"`
      );
      res.status(200).send(csv);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      logger.error('Error in research exportCsv', { error: msg });
      res.status(500).json({ error: 'Failed to export CSV dataset', requestId: req.requestId });
    }
  };

  /**
   * GET /api/research/observations.geojson
   */
  exportGeoJson = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const rateLimitKey = `export_geojson_${clientIp}`;

      if (!checkRateLimit(rateLimitKey, env.RESEARCH_EXPORT_RATE_LIMIT_PER_MINUTE)) {
        res.status(429).json({
          error: 'Rate limit exceeded for research dataset exports. Please try again later.',
          code: 'EXPORT_RATE_LIMIT_EXCEEDED',
        });
        return;
      }

      this.service.recordRequest();
      const actorId = req.admin ? req.admin.email : 'super_admin';
      const geojson = await this.service.exportObservationsGeoJson(actorId);

      res.setHeader('Content-Type', 'application/geo+json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="earth-talk-observations-${env.RESEARCH_DATASET_VERSION}.geojson"`
      );
      res.status(200).json(geojson);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      logger.error('Error in research exportGeoJson', { error: msg });
      res.status(500).json({ error: 'Failed to export GeoJSON dataset', requestId: req.requestId });
    }
  };

  /**
   * GET /api/research/quality/:passportId
   */
  getQuality = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const { passportId } = req.params;
      const detail = await expertRepository.getObservationForExpert(passportId);
      if (!detail) {
        res.status(404).json({ error: 'Observation not found' });
        return;
      }

      const quality = dataQualityService.assessObservationQuality(detail);
      res.status(200).json(quality);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Quality assessment failed';
      logger.error('Error in getQuality', { error: msg });
      res.status(500).json({ error: 'Failed to assess observation quality', requestId: req.requestId });
    }
  };
}

export const researchController = new ResearchController();
