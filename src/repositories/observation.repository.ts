import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
import type { EvidenceState } from '../types/community.types.js';
import type {
  ObservationRow,
  ObservationInsert,
  ObservationStatus,
  ObservationMediaRow,
  ObservationMediaInsert,
  ObservationLocationRow,
  ObservationLocationInsert,
  ProcessingEventRow,
  ProcessingEventInsert,
  MediaModerationStatus,
} from '../types/database.types.js';

export class ObservationRepository {
  /**
   * Finds an observation by its unique source WhatsApp message ID.
   * Used for idempotency and duplicate webhook protection.
   *
   * A database error is thrown, never returned as null: treating an outage as
   * "this message is new" would let a retried webhook run the analysis again and
   * attempt a second observation for the same message.
   */
  async findBySourceMessageId(sourceMessageId: string): Promise<ObservationRow | null> {
    try {
      const { data, error } = await supabase
        .from('observations')
        .select('*')
        .eq('source_message_id', sourceMessageId)
        .maybeSingle();

      if (error) throw new Error(error.message);

      return (data as unknown as ObservationRow) || null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown database error';
      logger.error('Database error in findBySourceMessageId', { error: msg });
      throw new ServiceUnavailableError('observation idempotency check', err);
    }
  }

  /**
   * Finds an observation by its public-friendly Geoscience Passport ID (e.g. RT-RW-000001).
   */
  async findByPassportId(passportId: string): Promise<ObservationRow | null> {
    try {
      const { data, error } = await supabase
        .from('observations')
        .select('*')
        .eq('passport_id', passportId)
        .maybeSingle();

      if (error) {
        logger.error('Database error in findByPassportId', { error: error.message });
        return null;
      }

      return (data as unknown as ObservationRow) || null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown database error';
      logger.error('Exception in findByPassportId', { error: msg });
      return null;
    }
  }

  /**
   * Creates a new observation record.
   */
  async createObservation(insertData: ObservationInsert): Promise<ObservationRow> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('observations') as any)
      .insert(insertData)
      .select('*')
      .single();

    if (error || !data) {
      logger.error('Failed to insert observation in Supabase', {
        error: error?.message || 'No row returned',
      });
      throw new Error(`Database error creating observation: ${error?.message || 'Unknown'}`);
    }

    return data as ObservationRow;
  }

  /**
   * Updates an observation's processing status (processing -> completed / failed).
   */
  async updateObservationStatus(id: string, status: ObservationStatus): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('observations') as any)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      logger.error('Failed to update observation status', { id, status, error: error.message });
    }
  }

  /**
   * Saves image metadata associated with an observation.
   */
  async saveObservationMedia(mediaInsert: ObservationMediaInsert): Promise<ObservationMediaRow> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('observation_media') as any)
      .insert(mediaInsert)
      .select('*')
      .single();

    if (error || !data) {
      logger.error('Failed to insert observation media', { error: error?.message });
      throw new Error(`Database error saving observation media: ${error?.message}`);
    }

    return data as ObservationMediaRow;
  }

  /**
   * Saves voluntary geographic or descriptive location associated with an observation.
   */
  async saveObservationLocation(
    locationInsert: ObservationLocationInsert
  ): Promise<ObservationLocationRow> {
    // If coordinates are present, build PostGIS point geometry representation
    const insertPayload = { ...locationInsert };
    if (
      locationInsert.latitude !== null &&
      locationInsert.latitude !== undefined &&
      locationInsert.longitude !== null &&
      locationInsert.longitude !== undefined &&
      !locationInsert.geom
    ) {
      insertPayload.geom = `SRID=4326;POINT(${locationInsert.longitude} ${locationInsert.latitude})`;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('observation_locations') as any)
      .insert(insertPayload)
      .select('*')
      .single();

    if (error || !data) {
      logger.error('Failed to insert observation location', { error: error?.message });
      throw new Error(`Database error saving observation location: ${error?.message}`);
    }

    return data as ObservationLocationRow;
  }

  /**
   * Records a processing pipeline event for auditability without storing sensitive payloads.
   */
  async recordProcessingEvent(eventInsert: ProcessingEventInsert): Promise<ProcessingEventRow | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('processing_events') as any)
        .insert(eventInsert)
        .select('*')
        .single();

      if (error) {
        logger.warn('Failed to record processing event', {
          event_type: eventInsert.event_type,
          error: error.message,
        });
        return null;
      }

      return (data as ProcessingEventRow) || null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn('Exception recording processing event', { error: msg });
      return null;
    }
  }

  /**
   * Attaches an observation to a geological site.
   *
   * Grouping is only ever explicit. Nothing here decides that two records belong
   * together, because a distance threshold is not a geological relationship and a
   * silently created cluster would present a guess as a fact.
   */
  async setObservationSite(observationId: string, siteId: string, actor: string): Promise<void> {
    const { error } = await (supabase.from('observations') as any)
      .update({ site_id: siteId, updated_at: new Date().toISOString() })
      .eq('id', observationId);

    if (error) {
      throw new Error(`Database error attaching observation to site: ${error.message}`);
    }

    await this.writeAuditLog({
      action: 'observation.site_assigned',
      targetType: 'observation',
      targetId: observationId,
      reason: `Attached to geological site ${siteId}`,
      details: { site_id: siteId },
      actor,
    });
  }

  /**
   * Sets publication status and stamps `published_at` when publishing.
   */
  async setPublicationStatus(
    observationId: string,
    publicationStatus: 'public' | 'private' | 'hidden',
    reason: string,
    actor: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      publication_status: publicationStatus,
      updated_at: now,
    };

    if (publicationStatus === 'public') patch.published_at = now;

    const { error } = await (supabase.from('observations') as any).update(patch).eq('id', observationId);

    if (error) {
      throw new Error(`Database error setting publication status: ${error.message}`);
    }

    await this.writeAuditLog({
      action: 'observation.publication_changed',
      targetType: 'observation',
      targetId: observationId,
      reason,
      details: { publication_status: publicationStatus },
      actor,
    });
  }

  /**
   * Sets the evidence state with its mandatory reason and actor.
   *
   * The reason is written in the same transaction boundary as the state change
   * so the two can never diverge. An evidence state without a stated reason is
   * the one thing a reader of the public map must never be unable to interrogate.
   */
  async setEvidenceState(
    observationId: string,
    state: EvidenceState,
    reason: string,
    actor: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await (supabase.from('observations') as any)
      .update({
        evidence_state: state,
        evidence_state_reason: reason,
        evidence_state_changed_at: now,
        evidence_state_changed_by: actor,
        updated_at: now,
      })
      .eq('id', observationId);

    if (error) {
      throw new Error(`Database error setting evidence state: ${error.message}`);
    }

    await this.writeAuditLog({
      action: 'observation.evidence_state_changed',
      targetType: 'observation',
      targetId: observationId,
      reason,
      details: { evidence_state: state },
      actor,
    });
  }

  /**
   * Lists media rows for an observation, newest first.
   *
   * Media bytes are never returned. A consumer that needs an image must go
   * through an authorised media endpoint, so a database read cannot become a way
   * to serve private media.
   */
  async listObservationMedia(observationId: string): Promise<ObservationMediaRow[]> {
    const { data, error } = await (supabase.from('observation_media') as any)
      .select('*')
      .eq('observation_id', observationId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.warn('Failed to list observation media', { error: error.message });
      return [];
    }

    return (data as ObservationMediaRow[]) ?? [];
  }

  /**
   * Sets media visibility. Publication is always explicit and always audited.
   */
  async setMediaVisibility(
    mediaId: string,
    visibility: 'private' | 'pending' | 'public' | 'hidden',
    reason: string,
    actor: string
  ): Promise<void> {
    const { error } = await (supabase.from('observation_media') as any)
      .update({ visibility })
      .eq('id', mediaId);

    if (error) {
      throw new Error(`Database error setting media visibility: ${error.message}`);
    }

    await this.writeAuditLog({
      action: 'media.visibility_changed',
      targetType: 'media',
      targetId: mediaId,
      reason,
      details: { visibility },
      actor,
    });
  }

  /**
   * Moderates a media row. The database rejects a hidden or removed row without
   * a recorded actor, so a media item can never disappear without a trace.
   */
  async moderateMedia(
    mediaId: string,
    moderationStatus: MediaModerationStatus,
    reason: string,
    actor: string
  ): Promise<void> {
    const { error } = await (supabase.from('observation_media') as any)
      .update({
        moderation_status: moderationStatus,
        moderated_by: actor,
        moderated_at: new Date().toISOString(),
      })
      .eq('id', mediaId);

    if (error) {
      throw new Error(`Database error moderating media: ${error.message}`);
    }

    await this.writeAuditLog({
      action: 'media.moderated',
      targetType: 'media',
      targetId: mediaId,
      reason,
      details: { moderation_status: moderationStatus },
      actor,
    });
  }

  /**
   * Writes one entry to the durable audit log.
   *
   * An audit write that fails is logged as a warning rather than thrown: the
   * authoritative change has already been applied, and refusing to report success
   * for a completed action would be its own kind of dishonesty.
   */
  private async writeAuditLog(entry: {
    action: string;
    targetType: string;
    targetId: string;
    reason: string;
    details?: Record<string, unknown>;
    actor: string;
    actorRole?: 'super_admin' | 'system' | 'contributor';
  }): Promise<void> {
    try {
      const { error } = await (supabase.from('admin_audit_log') as any).insert({
        actor: entry.actor,
        actor_role: entry.actorRole ?? 'super_admin',
        action: entry.action,
        target_type: entry.targetType,
        target_id: entry.targetId,
        reason: entry.reason,
        details: entry.details ?? null,
      });

      if (error) {
        logger.warn('Failed to write audit log entry', { action: entry.action, error: error.message });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn('Exception writing audit log entry', { action: entry.action, error: msg });
    }
  }

  /**
   * Reads audit log entries, newest first. Never exposes media paths or
   * coordinates; the details payload is written by this layer only.
   */
  async listAuditLog(options: {
    limit: number;
    offset: number;
    action?: string;
    targetType?: string;
    targetId?: string;
  }): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    let query = (supabase.from('admin_audit_log') as any).select('*', { count: 'exact' });

    if (options.action) query = query.eq('action', options.action);
    if (options.targetType) query = query.eq('target_type', options.targetType);
    if (options.targetId) query = query.eq('target_id', options.targetId);

    const { data, count, error } = await query
      .order('occurred_at', { ascending: false })
      .range(options.offset, options.offset + options.limit - 1);

    if (error) {
      logger.warn('Failed to read audit log', { error: error.message });
      return { rows: [], total: 0 };
    }

    return { rows: (data as Record<string, unknown>[]) ?? [], total: count ?? 0 };
  }
}

export const observationRepository = new ObservationRepository();
