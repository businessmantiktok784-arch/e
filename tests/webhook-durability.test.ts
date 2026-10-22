/**
 * Durable WhatsApp processing tests (Task 1 & Task 2).
 *
 * These tests exercise the two guarantees the priority remediation added:
 *
 *   1. An inbound event is persisted before Meta is acknowledged, so it cannot
 *      be lost between the acknowledgement and the work (`webhook_jobs`).
 *   2. A claimed message always reaches a definite state on every exit path, so
 *      nothing is stuck in `processing` forever (`webhook_message_claims`).
 *
 * They run against the process-local adapters. Those adapters implement the same
 * state machine as the SQL functions in migration 028 (which cannot be reached
 * without a live database), so the transitions are verifiable here while the
 * atomicity guarantee itself is stated as NOT FULLY VERIFIED in the report.
 */

import assert from 'node:assert/strict';
import { ServiceUnavailableError } from '../src/utils/service-error.js';
import { GeologicalAnalysisError } from '../src/ai/geological.types.js';
import {
  WebhookClaimRepository,
  backoffDelayMs,
} from '../src/repositories/webhook-claim.repository.js';
import {
  WebhookJobRepository,
  DEFAULT_MAX_ATTEMPTS,
} from '../src/repositories/webhook-job.repository.js';
import {
  WebhookQueueService,
  type ProcessOutcome,
} from '../src/services/webhook-queue.service.js';
import { classifyPipelineError } from '../src/services/geoscience-analysis.service.js';
import type { WebhookJob } from '../src/repositories/webhook-job.repository.js';
import type { WhatsAppWebhookPayload } from '../src/types/whatsapp.types.js';

let passed = 0;
let failed = 0;
let currentTest = '';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  currentTest = name;
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}`);
    console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

function section(title: string): void {
  console.log(`\n${'-'.repeat(60)}\n${title}\n${'-'.repeat(60)}`);
}

/** A queue whose dispatch outcome the test controls, to exercise job accounting. */
class ControllableQueue extends WebhookQueueService {
  public outcome: ProcessOutcome = { state: 'completed' };

  protected override async dispatch(_job: WebhookJob): Promise<ProcessOutcome> {
    return this.outcome;
  }
}

function payloadWith(messages: WhatsAppWebhookPayload['entry'][number]['changes'][number]['value']['messages']): WhatsAppWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '123', phone_number_id: '456' },
              messages,
            },
          },
        ],
      },
    ],
  };
}

console.log('--- Running Earth Talk Webhook Durability Suite ---');

// =============================================================
section('1. Message-claim lifecycle never sticks in processing');
// =============================================================

await test('a fresh message is claimed exactly once, then blocks duplicates', async () => {
  const claims = new WebhookClaimRepository();
  assert.equal(await claims.claim('m1'), 'claimed');
  assert.equal(await claims.claim('m1'), 'duplicate', 'a held claim must not be handed out twice');
  assert.equal((await claims.get('m1'))?.status, 'processing');
});

await test('a retryable failure can be re-claimed but a completed claim cannot', async () => {
  const claims = new WebhookClaimRepository();
  await claims.claim('m2');
  await claims.markRetryable('m2', 'transient');
  assert.equal((await claims.get('m2'))?.status, 'retryable_failure');
  assert.equal(await claims.claim('m2'), 'claimed', 'a transient failure must be retryable');

  await claims.markCompleted('m2');
  assert.equal((await claims.get('m2'))?.status, 'completed');
  assert.equal(await claims.claim('m2'), 'duplicate', 'a completed message must never run again');
});

await test('a terminal failure is never re-claimed', async () => {
  const claims = new WebhookClaimRepository();
  await claims.claim('m3');
  await claims.markTerminal('m3', 'invalid_media');
  assert.equal((await claims.get('m3'))?.status, 'terminal_failure');
  assert.equal(await claims.claim('m3'), 'duplicate');
});

await test('a message abandoned mid-processing is recovered for retry', async () => {
  const claims = new WebhookClaimRepository();
  await claims.claim('m4');
  // A negative stale window treats any current lock as expired, standing in for
  // a worker that crashed and left the claim locked.
  const recovered = await claims.recoverStale(-1);
  assert.ok(recovered >= 1, 'an abandoned claim must be recovered');
  assert.equal((await claims.get('m4'))?.status, 'retryable_failure');
  assert.equal(await claims.claim('m4'), 'claimed', 'the recovered message is retryable');
});

await test('backoff grows and is capped', () => {
  assert.equal(backoffDelayMs(1), 5_000);
  assert.ok(backoffDelayMs(4) > backoffDelayMs(3), 'backoff must grow with attempts');
  assert.ok(backoffDelayMs(40) <= 15 * 60_000, 'backoff must be capped');
});

// =============================================================
section('2. Durable job queue accounting');
// =============================================================

await test('enqueue is idempotent per provider message id', async () => {
  const jobs = new WebhookJobRepository();
  const input = { providerMessageId: 'j1', jobType: 'media' as const, payload: { a: 1 } };
  assert.equal(await jobs.enqueue(input), 'enqueued');
  assert.equal(await jobs.enqueue(input), 'duplicate');
  assert.equal((await jobs.listByStatus('queued')).length, 1);
});

await test('claimNext hands a job to exactly one worker and counts the attempt', async () => {
  const jobs = new WebhookJobRepository();
  await jobs.enqueue({ providerMessageId: 'j2', jobType: 'text', payload: {} });
  const job = await jobs.claimNext('worker-a');
  assert.ok(job, 'a due job must be claimable');
  assert.equal(job?.status, 'processing');
  assert.equal(job?.attempts, 1);
  assert.equal(await jobs.claimNext('worker-b'), null, 'a processing job must not be double-claimed');
});

await test('a retryable failure schedules a delayed retry, not an immediate one', async () => {
  const jobs = new WebhookJobRepository();
  await jobs.enqueue({ providerMessageId: 'j3', jobType: 'media', payload: {} });
  const job = (await jobs.claimNext('worker-a'))!;
  const result = await jobs.markRetryable(job.id, 'temporary', job.attempts);
  assert.equal(result, 'retry');
  const [record] = await jobs.listByStatus('retryable_failure');
  assert.ok(record, 'the failed job must be retryable');
  assert.ok(
    Date.parse(record.next_attempt_at) > Date.now(),
    'the retry must not be due immediately'
  );
  assert.equal(await jobs.claimNext('worker-a'), null, 'a backed-off job is not claimable yet');
});

await test('a job that exhausts its attempts becomes terminal, never an infinite retry', async () => {
  const jobs = new WebhookJobRepository();
  await jobs.enqueue({
    providerMessageId: 'j4',
    jobType: 'media',
    payload: {},
    maxAttempts: 1,
  });
  const job = (await jobs.claimNext('worker-a'))!;
  const result = await jobs.markRetryable(job.id, 'still failing', job.attempts);
  assert.equal(result, 'terminal', `attempts >= max_attempts (${DEFAULT_MAX_ATTEMPTS}) must terminate`);
  assert.equal((await jobs.listByStatus('terminal_failure')).length, 1);
  assert.equal(await jobs.claimNext('worker-a'), null);
});

await test('an abandoned job is recovered after a crash', async () => {
  const jobs = new WebhookJobRepository();
  await jobs.enqueue({ providerMessageId: 'j5', jobType: 'location', payload: {} });
  await jobs.claimNext('worker-a');
  const recovered = await jobs.recoverStale(-1);
  assert.ok(recovered >= 1);
  assert.equal((await jobs.listByStatus('retryable_failure')).length, 1);
});

// =============================================================
section('3. Inbound normalization writes the right job type');
// =============================================================

await test('every inbound message type is normalized into a durable job', async () => {
  const jobs = new WebhookJobRepository();
  const queue = new WebhookQueueService(jobs, new WebhookClaimRepository());

  const payload = payloadWith([
    { from: '1', id: 'i1', timestamp: '1', type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg' } },
    { from: '1', id: 'i2', timestamp: '2', type: 'video', video: { id: 'media-2', mime_type: 'video/mp4' } },
    { from: '1', id: 'i3', timestamp: '3', type: 'location', location: { latitude: 1, longitude: 2 } },
    { from: '1', id: 'i4', timestamp: '4', type: 'text', text: { body: 'help' } },
    { from: '1', id: 'i5', timestamp: '5', type: 'audio', audio: { id: 'media-3' } },
  ]);

  const summary = await queue.acceptInbound(payload);
  assert.equal(summary.accepted, 5);

  const queued = await jobs.listByStatus('queued');
  const types = queued.map((j) => j.job_type).sort();
  assert.deepEqual(types, ['location', 'media', 'media', 'text', 'unsupported']);

  const duplicate = await queue.acceptInbound(payload);
  assert.equal(duplicate.accepted, 0);
  assert.equal(duplicate.duplicates, 5, 'a Meta redelivery must not queue duplicate work');
});

await test('a media message with no media id becomes a terminal reply, not a media job', async () => {
  const jobs = new WebhookJobRepository();
  const queue = new WebhookQueueService(jobs, new WebhookClaimRepository());
  await queue.acceptInbound(
    payloadWith([{ from: '1', id: 'i6', timestamp: '6', type: 'image', image: { id: '' } }])
  );
  const queued = await jobs.listByStatus('queued');
  assert.equal(queued.length, 1);
  assert.equal(queued[0].job_type, 'unsupported');
});

// =============================================================
section('4. The worker maps outcomes onto the job state');
// =============================================================

await test('a completed outcome marks the job completed', async () => {
  const jobs = new WebhookJobRepository();
  const queue = new ControllableQueue(jobs, new WebhookClaimRepository());
  await jobs.enqueue({ providerMessageId: 'o1', jobType: 'unsupported', payload: {} });
  queue.outcome = { state: 'completed' };
  assert.equal(await queue.processOnce(), 'completed');
  assert.equal((await jobs.listByStatus('completed')).length, 1);
});

await test('a duplicate outcome is treated as done', async () => {
  const jobs = new WebhookJobRepository();
  const queue = new ControllableQueue(jobs, new WebhookClaimRepository());
  await jobs.enqueue({ providerMessageId: 'o2', jobType: 'unsupported', payload: {} });
  queue.outcome = { state: 'duplicate' };
  assert.equal(await queue.processOnce(), 'completed');
  assert.equal((await jobs.listByStatus('completed')).length, 1);
});

await test('a retryable outcome leaves the job retryable', async () => {
  const jobs = new WebhookJobRepository();
  const queue = new ControllableQueue(jobs, new WebhookClaimRepository());
  await jobs.enqueue({ providerMessageId: 'o3', jobType: 'unsupported', payload: {}, maxAttempts: 3 });
  queue.outcome = { state: 'retryable', error: 'transient' };
  assert.equal(await queue.processOnce(), 'retry');
  assert.equal((await jobs.listByStatus('retryable_failure')).length, 1);
});

await test('a terminal outcome marks the job terminal', async () => {
  const jobs = new WebhookJobRepository();
  const queue = new ControllableQueue(jobs, new WebhookClaimRepository());
  await jobs.enqueue({ providerMessageId: 'o4', jobType: 'unsupported', payload: {} });
  queue.outcome = { state: 'terminal', error: 'permanent' };
  assert.equal(await queue.processOnce(), 'terminal');
  assert.equal((await jobs.listByStatus('terminal_failure')).length, 1);
});

await test('processOnce reports idle when the queue is empty', async () => {
  const jobs = new WebhookJobRepository();
  const queue = new ControllableQueue(jobs, new WebhookClaimRepository());
  assert.equal(await queue.processOnce(), 'idle');
});

// =============================================================
section('5. Error classification keeps temporary failures retryable');
// =============================================================

await test('a database outage is retryable, never silently terminal', () => {
  assert.equal(classifyPipelineError(new ServiceUnavailableError('db')).state, 'retryable');
});

await test('permanent failures are terminal and transient ones are not', () => {
  assert.equal(classifyPipelineError(new GeologicalAnalysisError('MEDIA_VALIDATION_ERROR', 'x')).state, 'terminal');
  assert.equal(classifyPipelineError(new GeologicalAnalysisError('GEMINI_PROHIBITED_CLAIM', 'x')).state, 'terminal');
  assert.equal(classifyPipelineError(new GeologicalAnalysisError('GEMINI_TIMEOUT', 'x')).state, 'retryable');
  assert.equal(classifyPipelineError(new GeologicalAnalysisError('GEMINI_API_ERROR', 'x')).state, 'retryable');
  assert.equal(classifyPipelineError(new Error('unexpected')).state, 'retryable');
});

// -----------------------------------------------------------------------------
console.log(`\n${'='.repeat(60)}`);
console.log('Webhook Durability Suite');
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  console.error(`\nLast test: ${currentTest}`);
  process.exit(1);
}
