import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import type {
  AbuseReportReason,
  AbuseReportStatus,
  AbuseReportTargetType,
  CommunityAbuseReport,
} from '../types/community.types.js';

/**
 * Community abuse reports (specification section 25).
 *
 * A report is an allegation, nothing more: it never changes an evidence state
 * and is never counted as agreement. There is no seeded report here; an empty
 * queue is the honest default.
 */

export interface InsertAbuseReportInput {
  target_type: AbuseReportTargetType;
  target_id: string;
  observation_passport_id: string | null;
  reason_code: AbuseReportReason;
  details: string | null;
  reported_by_hash: string | null;
}

/** The public shape of a filed report. The reporter hash is never included. */
export interface FiledAbuseReport {
  public_id: string;
  target_type: AbuseReportTargetType;
  target_id: string;
  reason_code: AbuseReportReason;
  details: string | null;
  status: AbuseReportStatus;
  created_at: string;
}

function reportPublicId(): string {
  // Short, non-sequential and human-quotable, without encoding any identity.
  const token = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `RPT-${token}`;
}

function toFiled(report: CommunityAbuseReport): FiledAbuseReport {
  return {
    public_id: report.public_id,
    target_type: report.target_type,
    target_id: report.target_id,
    reason_code: report.reason_code,
    details: report.details,
    status: report.status,
    created_at: report.created_at,
  };
}

export class AbuseReportRepository {
  private memory: Map<string, CommunityAbuseReport> = new Map();

  private get database(): boolean {
    return isDatabaseConfigured();
  }

  /** Registers a report in the development store. Used by tests only. */
  registerReport(report: CommunityAbuseReport): void {
    this.memory.set(report.public_id, report);
  }

  private requireDatabase(operation: string): void {
    if (!this.database && env.IS_PRODUCTION) {
      throw new Error(
        `Filing a report requires a configured database (${operation}). ` +
          'Set SUPABASE_URL and SUPABASE_SECRET_KEY and run migration 020_community_abuse_reports.sql.'
      );
    }
  }

  async createReport(input: InsertAbuseReportInput): Promise<FiledAbuseReport> {
    this.requireDatabase('create');

    const id = crypto.randomUUID();
    const publicId = reportPublicId();
    const createdAt = new Date().toISOString();

    if (this.database) {
      try {
        const { error } = await (supabase.from('community_abuse_reports') as any).insert({
          id,
          public_id: publicId,
          target_type: input.target_type,
          target_id: input.target_id,
          observation_passport_id: input.observation_passport_id,
          reason_code: input.reason_code,
          details: input.details,
          reported_by_hash: input.reported_by_hash,
          status: 'open',
          created_at: createdAt,
        });
        if (error) throw new Error(error.message);

        return {
          public_id: publicId,
          target_type: input.target_type,
          target_id: input.target_id,
          reason_code: input.reason_code,
          details: input.details,
          status: 'open',
          created_at: createdAt,
        };
      } catch (err) {
        logger.warn('Could not store the abuse report in the database', { error: String(err) });
        throw err;
      }
    }

    const report: CommunityAbuseReport = {
      id,
      public_id: publicId,
      target_type: input.target_type,
      target_id: input.target_id,
      observation_passport_id: input.observation_passport_id,
      reason_code: input.reason_code,
      details: input.details,
      reported_by_hash: input.reported_by_hash,
      status: 'open',
      resolution_note: null,
      resolved_by: null,
      resolved_at: null,
      created_at: createdAt,
    };
    this.memory.set(publicId, report);
    return toFiled(report);
  }

  /**
   * Looks for an existing report with the same target and reporter hash.
   *
   * Used to keep one reader from filing the same allegation repeatedly. A
   * signed-out, tokenless report carries no hash and is never matched here.
   */
  async findExistingReport(
    targetType: AbuseReportTargetType,
    targetId: string,
    reporterHash: string | null
  ): Promise<FiledAbuseReport | null> {
    if (!reporterHash) return null;

    if (this.database) {
      try {
        const { data, error } = await (supabase.from('community_abuse_reports') as any)
          .select('*')
          .eq('target_type', targetType)
          .eq('target_id', targetId)
          .eq('reported_by_hash', reporterHash)
          .limit(1);
        if (error) throw new Error(error.message);
        if (Array.isArray(data) && data.length > 0) {
          return toFiled(data[0] as CommunityAbuseReport);
        }
      } catch (err) {
        logger.warn('Could not check for a duplicate abuse report', { error: String(err) });
      }
    }

    for (const report of this.memory.values()) {
      if (
        report.target_type === targetType &&
        report.target_id === targetId &&
        report.reported_by_hash === reporterHash
      ) {
        return toFiled(report);
      }
    }
    return null;
  }

  /** The moderation queue. Never returns the reporter hash. */
  async listReports(status?: AbuseReportStatus): Promise<FiledAbuseReport[]> {
    if (this.database) {
      try {
        let query = (supabase.from('community_abuse_reports') as any).select('*');
        if (status) query = query.eq('status', status);
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        if (Array.isArray(data)) {
          return (data as CommunityAbuseReport[]).map(toFiled);
        }
      } catch (err) {
        logger.warn('Could not read the abuse report queue', { error: String(err) });
      }
    }

    return Array.from(this.memory.values())
      .filter((report) => !status || report.status === status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(toFiled);
  }

  /**
   * The moderation queue as full records, including the resolution fields.
   *
   * Unlike `listReports` this keeps the reporter hash, because the platform
   * owner is the one caller that may need to see that two reports share a
   * reporter. The hash is still one-way: it identifies no person.
   */
  async listQueue(status?: AbuseReportStatus): Promise<CommunityAbuseReport[]> {
    if (this.database) {
      try {
        let query = (supabase.from('community_abuse_reports') as any).select('*');
        if (status) query = query.eq('status', status);
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        if (Array.isArray(data)) return data as CommunityAbuseReport[];
      } catch (err) {
        logger.warn('Could not read the abuse report queue', { error: String(err) });
      }
    }

    return Array.from(this.memory.values())
      .filter((report) => !status || report.status === status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  /**
   * Records a moderation decision on a report, or returns null when there is no
   * such report. Reopening (`status: 'open'`) clears the resolution.
   */
  async resolveReport(
    publicId: string,
    resolution: { status: AbuseReportStatus; resolutionNote: string | null; resolvedBy: string }
  ): Promise<CommunityAbuseReport | null> {
    const terminal = resolution.status === 'actioned' || resolution.status === 'dismissed';
    const resolvedAt = new Date().toISOString();

    if (this.database) {
      try {
        const { data, error } = await (supabase.from('community_abuse_reports') as any)
          .update({
            status: resolution.status,
            resolution_note: resolution.resolutionNote,
            resolved_by: resolution.status === 'open' ? null : resolution.resolvedBy,
            resolved_at: terminal ? resolvedAt : null,
          })
          .eq('public_id', publicId)
          .select('*');
        if (error) throw new Error(error.message);
        if (Array.isArray(data) && data.length > 0) return data[0] as CommunityAbuseReport;
        return null;
      } catch (err) {
        logger.warn('Could not record the moderation decision', { error: String(err) });
        throw err;
      }
    }

    const existing = this.memory.get(publicId);
    if (!existing) return null;
    const updated: CommunityAbuseReport = {
      ...existing,
      status: resolution.status,
      resolution_note: resolution.resolutionNote,
      resolved_by: resolution.status === 'open' ? null : resolution.resolvedBy,
      resolved_at: terminal ? resolvedAt : null,
    };
    this.memory.set(publicId, updated);
    return updated;
  }
}

export const abuseReportRepository = new AbuseReportRepository();
