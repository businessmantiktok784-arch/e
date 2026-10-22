import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { whatsappService } from './whatsapp.service.js';
import {
  geoscienceAnalysisService,
  classifyPipelineError,
  USER_FACING_MESSAGES,
  type ProcessOutcome,
} from './geoscience-analysis.service.js';
import { communityCommandService } from './community-commands.service.js';
import {
  checkDurableQueueReadiness,
  REQUIRED_QUEUE_FUNCTIONS,
  REQUIRED_QUEUE_TABLES,
} from './webhook-queue-readiness.js';
import { webhookJobRepository, type WebhookJob, type WebhookJobRepository } from '../repositories/webhook-job.repository.js';
import { webhookClaimRepository, type WebhookClaimRepository } from '../repositories/webhook-claim.repository.js';
import type { WhatsAppMessage, WhatsAppWebhookPayload } from '../types/whatsapp.types.js';

/**
 * Polls between periodic recovery sweeps. At the default 1.5s cadence this is
 * roughly one sweep a minute.
 */
const RECOVERY_SWEEP_TICKS = 40;

export const RESPONSES = {
  START: `🪨 Welcome to Earth Talk!

Send me a photo or a short video of a rock, mineral, fossil, rock layer, landform, spring, slope or any other geological feature you find interesting.

I will help you learn about it.

Type HELP to see what you can do.`,

  HELP: `🪨 EARTH TALK HELP

You can:

📸 Send a photo of a rock, mineral, fossil, layer, landform, spring, slope or geological structure
🎥 Send a short video (a moving view often shows more than a still photo)
📍 Share a location pin first, then send the photo or video, to record where you were
💬 Ask questions
ℹ️ Learn how Earth Talk works

Type START to begin.`,

  UNKNOWN: `🪨 I'm Earth Talk.

Send me a photo or short video of something geological, or type HELP to see what I can do.`,
};

export interface MediaJobPayload extends Record<string, unknown> {
  senderPhoneNumber: string;
  messageId: string;
  mediaId: string;
  declaredMimeType?: string;
  caption?: string;
}

export interface LocationJobPayload extends Record<string, unknown> {
  senderPhoneNumber: string;
  latitude: number;
  longitude: number;
  name?: string | null;
  address?: string | null;
}

export interface TextJobPayload extends Record<string, unknown> {
  senderPhoneNumber: string;
  body: string;
}

export interface UnsupportedJobPayload extends Record<string, unknown> {
  senderPhoneNumber: string;
  reply: string;
}

function determineTextResponse(body: string): string {
  const normalized = (body || '').trim().toLowerCase();
  if (normalized === 'start' || normalized === 'hello' || normalized === 'hi') return RESPONSES.START;
  if (normalized === 'help') return RESPONSES.HELP;
  return RESPONSES.UNKNOWN;
}

export interface AcceptSummary {
  accepted: number;
  duplicates: number;
  statuses: number;
}

/**
 * The durable inbound-event queue.
 *
 * `acceptInbound` normalizes a Meta webhook payload into jobs and persists each
 * one *before* the controller acknowledges Meta. `start` runs the worker that
 * drains the queue: it claims one job at a time, dispatches it, and records the
 * outcome so a crash mid-job is retried rather than lost.
 *
 * The worker is safe to run on multiple instances: job and message claims are
 * atomic. On startup, `recover` returns jobs and claims abandoned by a crashed
 * worker to the retryable pool.
 */
export class WebhookQueueService {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readinessRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private started = false;
  private tickCount = 0;
  private readonly workerId = `webhook-worker-${process.pid}-${randomUUID().slice(0, 8)}`;

  constructor(
    private readonly jobs: WebhookJobRepository = webhookJobRepository,
    private readonly claims: WebhookClaimRepository = webhookClaimRepository
  ) {}

  get isDurable(): boolean {
    return this.jobs.durable;
  }

  /**
   * Persists every inbound message as a durable job.
   *
   * Throws when the queue itself cannot be written: the caller must then refuse
   * to acknowledge Meta, so Meta retries until the event is safely queued.
   */
  async acceptInbound(payload: WhatsAppWebhookPayload): Promise<AcceptSummary> {
    const summary: AcceptSummary = { accepted: 0, duplicates: 0, statuses: 0 };
    const entries = payload.entry || [];

    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value) continue;

        for (const message of value.messages || []) {
          const enqueued = await this.enqueueMessage(message);
          if (enqueued) summary.accepted++;
          else if (enqueued === false) summary.duplicates++;
        }

        if (value.statuses) summary.statuses += value.statuses.length;
      }
    }

    return summary;
  }

  /**
   * Builds and persists the job for one message.
   *
   * Returns true when new work was queued, false when it was a duplicate, and
   * throws if the queue could not be written.
   */
  private async enqueueMessage(message: WhatsAppMessage): Promise<boolean> {
    const built = this.buildJob(message);
    if (!built) return false;
    const result = await this.jobs.enqueue(built);
    if (result === 'duplicate') {
      logger.info('Duplicate inbound message ignored at enqueue', { messageId: message.id });
      return false;
    }
    return true;
  }

  private buildJob(message: WhatsAppMessage): {
    providerMessageId: string;
    jobType: 'media' | 'location' | 'text' | 'unsupported';
    payload: Record<string, unknown>;
  } | null {
    if (!message.id || !message.from) {
      logger.warn('Skipping malformed inbound message without id or sender');
      return null;
    }

    if (message.type === 'image' || message.type === 'video') {
      const media = message.type === 'image' ? message.image : message.video;
      if (media?.id) {
        const payload: MediaJobPayload = {
          senderPhoneNumber: message.from,
          messageId: message.id,
          mediaId: media.id,
          declaredMimeType: media.mime_type,
          caption: media.caption,
        };
        return { providerMessageId: message.id, jobType: 'media', payload };
      }
      // A media message without an id cannot be downloaded, and re-trying will
      // not change that: reply once through the unsupported path.
      const payload: UnsupportedJobPayload = {
        senderPhoneNumber: message.from,
        reply: USER_FACING_MESSAGES.INSUFFICIENT_IMAGE,
      };
      return { providerMessageId: message.id, jobType: 'unsupported', payload };
    }

    if (message.type === 'location' && message.location) {
      const { latitude, longitude, name, address } = message.location;
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        const payload: LocationJobPayload = {
          senderPhoneNumber: message.from,
          latitude,
          longitude,
          name,
          address,
        };
        return { providerMessageId: message.id, jobType: 'location', payload };
      }
      const payload: UnsupportedJobPayload = {
        senderPhoneNumber: message.from,
        reply: USER_FACING_MESSAGES.INVALID_LOCATION,
      };
      return { providerMessageId: message.id, jobType: 'unsupported', payload };
    }

    if (message.type === 'text') {
      const payload: TextJobPayload = {
        senderPhoneNumber: message.from,
        body: message.text?.body ?? '',
      };
      return { providerMessageId: message.id, jobType: 'text', payload };
    }

    const payload: UnsupportedJobPayload = {
      senderPhoneNumber: message.from,
      reply: RESPONSES.UNKNOWN,
    };
    return { providerMessageId: message.id, jobType: 'unsupported', payload };
  }

  /**
   * Processes at most one job. Exposed for tests and for a worker that prefers
   * to drive the loop itself.
   */
  async processOnce(): Promise<'idle' | 'completed' | 'retry' | 'terminal'> {
    const job = await this.jobs.claimNext(this.workerId);
    if (!job) return 'idle';

    let outcome: ProcessOutcome;
    try {
      outcome = await this.dispatch(job);
    } catch (err: unknown) {
      outcome = { state: 'retryable', error: err instanceof Error ? err.message : 'dispatch_error' };
    }

    if (outcome.state === 'completed' || outcome.state === 'duplicate') {
      await this.jobs.markCompleted(job.id);
      return 'completed';
    }

    if (outcome.state === 'terminal') {
      await this.jobs.markTerminal(job.id, outcome.error);
      return 'terminal';
    }

    const retryResult = await this.jobs.markRetryable(job.id, outcome.error, job.attempts);
    if (retryResult === 'terminal') {
      await this.notifyExhausted(job, outcome.error);
      return 'terminal';
    }
    return 'retry';
  }

  protected async dispatch(job: WebhookJob): Promise<ProcessOutcome> {
    switch (job.job_type) {
      case 'media':
        return geoscienceAnalysisService.processRockImage(job.payload as unknown as MediaJobPayload);
      case 'location':
        return this.handleLocation(job.payload as unknown as LocationJobPayload);
      case 'text':
        return this.handleText(job.payload as unknown as TextJobPayload);
      case 'unsupported':
        return this.handleUnsupported(job.payload as unknown as UnsupportedJobPayload);
      default:
        return { state: 'terminal', error: `unknown_job_type:${job.job_type}` };
    }
  }

  private async handleLocation(payload: LocationJobPayload): Promise<ProcessOutcome> {
    try {
      await geoscienceAnalysisService.recordSharedLocation(payload);
      return { state: 'completed' };
    } catch (err: unknown) {
      const classified = classifyPipelineError(err);
      logger.error('Location job failed', { error: classified.error });
      return classified;
    }
  }

  private async handleText(payload: TextJobPayload): Promise<ProcessOutcome> {
    try {
      const handled = await communityCommandService.handleTextMessage(
        payload.senderPhoneNumber,
        payload.body
      );
      if (handled) return { state: 'completed' };

      await whatsappService.sendTextMessage(
        payload.senderPhoneNumber,
        determineTextResponse(payload.body)
      );
      return { state: 'completed' };
    } catch (err: unknown) {
      const classified = classifyPipelineError(err);
      logger.error('Text job failed', { error: classified.error });
      return classified;
    }
  }

  private async handleUnsupported(payload: UnsupportedJobPayload): Promise<ProcessOutcome> {
    try {
      await whatsappService.sendTextMessage(payload.senderPhoneNumber, payload.reply);
      return { state: 'completed' };
    } catch (err: unknown) {
      const classified = classifyPipelineError(err);
      logger.error('Unsupported-message job failed', { error: classified.error });
      return classified;
    }
  }

  /**
   * When a job exhausts its attempts, the sender is told once. Until then a
   * transient failure is silent to the user, because it will be retried.
   */
  private async notifyExhausted(job: WebhookJob, error: string): Promise<void> {
    const phone = (job.payload as { senderPhoneNumber?: string }).senderPhoneNumber;
    logger.error('Webhook job exhausted its attempts', {
      jobId: job.id,
      jobType: job.job_type,
      attempts: job.attempts,
      error,
    });
    if (!phone) return;
    try {
      await whatsappService.sendTextMessage(phone, USER_FACING_MESSAGES.AI_UNAVAILABLE);
    } catch {
      // The user-facing apology is best-effort; failing to send it must not
      // resurrect a job that already reached a terminal state.
    }
  }

  /**
   * Verifies the queue, recovers work abandoned by a crashed worker, then starts
   * the polling loop.
   *
   * When a database is configured the queue is only reported as enabled after
   * the tables and claim functions have been confirmed reachable; otherwise the
   * exact blocker is logged and the check is retried, rather than the worker
   * pretending to be durable and failing on every tick. Idempotent: safe to call
   * on every instance at startup.
   */
  async start(intervalMs = 1_500): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.bootstrap(intervalMs);
  }

  private async bootstrap(intervalMs: number): Promise<void> {
    if (!this.started) return;

    if (this.isDurable) {
      const readiness = await checkDurableQueueReadiness();
      if (!readiness.ready) {
        const retryMs = Math.max(intervalMs, 15_000);
        logger.error('Durable webhook queue NOT enabled', {
          blocker: readiness.blocker,
          retryInMs: retryMs,
        });
        this.scheduleReadinessRetry(intervalMs, retryMs);
        return;
      }
      logger.info('Durable webhook queue enabled', {
        tables: [...REQUIRED_QUEUE_TABLES],
        functions: [...REQUIRED_QUEUE_FUNCTIONS],
      });
    } else {
      logger.warn(
        'WhatsApp webhook events are held in a process-local queue and are NOT durable. ' +
          'Migration 028 defines the durable queue schema, but no usable database is configured, so the in-memory queue is in use. ' +
          'Do not rely on webhook processing guarantees on this deployment.'
      );
    }

    await this.recoverStaleWork();
    logger.info('Webhook queue worker started', {
      workerId: this.workerId,
      durable: this.isDurable,
      intervalMs,
    });
    this.schedule(intervalMs);
  }

  private scheduleReadinessRetry(intervalMs: number, delayMs: number): void {
    this.readinessRetryTimer = setTimeout(() => {
      void this.bootstrap(intervalMs);
    }, delayMs);
    if (
      typeof this.readinessRetryTimer === 'object' &&
      this.readinessRetryTimer &&
      'unref' in this.readinessRetryTimer
    ) {
      (this.readinessRetryTimer as { unref: () => void }).unref();
    }
  }

  /**
   * Returns work abandoned by a crashed worker to the retryable pool.
   *
   * Runs at startup and then periodically, so a worker that dies while others
   * stay up does not strand its jobs/claims indefinitely.
   */
  private async recoverStaleWork(): Promise<void> {
    const recoveredJobs = await this.jobs.recoverStale().catch((err: unknown) => {
      logger.error('Webhook job recovery failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return 0;
    });
    const recoveredClaims = await this.claims.recoverStale().catch((err: unknown) => {
      logger.error('Webhook claim recovery failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return 0;
    });
    if (recoveredJobs || recoveredClaims) {
      logger.info('Recovered stale webhook work', { recoveredJobs, recoveredClaims });
    }
  }

  /** Stops the polling loop. In-flight jobs finish; no new ones are claimed. */
  stop(): void {
    this.started = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.readinessRetryTimer) {
      clearTimeout(this.readinessRetryTimer);
      this.readinessRetryTimer = null;
    }
  }

  private schedule(intervalMs: number): void {
    this.timer = setTimeout(() => {
      void this.tick(intervalMs);
    }, intervalMs);
    // Do not hold the process open for the worker alone.
    if (typeof this.timer === 'object' && this.timer && 'unref' in this.timer) {
      (this.timer as { unref: () => void }).unref();
    }
  }

  private async tick(intervalMs: number): Promise<void> {
    if (this.running) {
      this.schedule(intervalMs);
      return;
    }
    this.running = true;
    try {
      // Drain a bounded batch so one busy instance cannot monopolise the queue.
      for (let i = 0; i < 10; i++) {
        const result = await this.processOnce();
        if (result === 'idle') break;
      }

      // Periodically sweep for work stranded by a crashed worker. The interval
      // is deliberately much longer than the poll cadence: recovery is a
      // safety net, not part of the request path.
      this.tickCount += 1;
      if (this.tickCount % RECOVERY_SWEEP_TICKS === 0) {
        await this.recoverStaleWork();
      }
    } catch (err: unknown) {
      logger.error('Webhook worker tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.running = false;
      if (this.started) this.schedule(intervalMs);
    }
  }
}

export const webhookQueueService = new WebhookQueueService();
