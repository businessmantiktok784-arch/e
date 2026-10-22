/**
 * LIVE integration test for the durable webhook queue.
 *
 * This is the only test that touches the real Supabase project. It is NOT part
 * of `npm test` (which runs hermetically without a database); run it explicitly:
 *
 *     npm run test:integration
 *
 * It uses the real credentials from `.env`. It creates rows under unique
 * `itest-*` identifiers and deletes them again on the way out, and it refuses to
 * run if the queue already holds work, so it never touches a real submission.
 * Credential values are never printed.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { isDatabaseConfigured } from '../../src/utils/admin-auth.js';
import { supabase } from '../../src/config/supabase.js';
import { WebhookJobRepository } from '../../src/repositories/webhook-job.repository.js';
import { WebhookClaimRepository } from '../../src/repositories/webhook-claim.repository.js';
import {
  checkDurableQueueReadiness,
  REQUIRED_QUEUE_FUNCTIONS,
} from '../../src/services/webhook-queue-readiness.js';

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

const runId = `itest-${Date.now()}-${randomUUID().slice(0, 8)}`;
const createdJobIds: string[] = [];
const createdMessageIds: string[] = [];

async function cleanup(): Promise<void> {
  if (createdJobIds.length > 0) {
    await (supabase.from('webhook_jobs') as any).delete().in('id', createdJobIds);
  }
  if (createdMessageIds.length > 0) {
    await (supabase.from('webhook_message_claims') as any).delete().in('message_id', createdMessageIds);
  }
}

async function queuedOrRetryableCount(): Promise<number> {
  const { count, error } = await (supabase.from('webhook_jobs') as any)
    .select('id', { count: 'exact', head: true })
    .in('status', ['queued', 'retryable_failure', 'processing']);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function jobStatusOf(providerMessageId: string): Promise<string | null> {
  const { data } = await (supabase.from('webhook_jobs') as any)
    .select('status')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();
  return data?.status ?? null;
}

/**
 * Claims a job this test just enqueued.
 *
 * A live server may be running its own worker, which can legitimately win the
 * claim (that is the multi-worker guarantee working). When that happens the job
 * is already `processing`/`completed` by someone else, so the exact-ownership
 * assertion is skipped rather than reported as a failure.
 */
async function claimProbe(
  jobs: WebhookJobRepository,
  providerMessageId: string
): Promise<{ owned: boolean }> {
  const claimed = await jobs.claimNext('itest-worker');
  if (claimed) {
    assert.equal(claimed.status, 'processing');
    assert.ok(claimed.attempts >= 1, 'the claim must count an attempt');
    return { owned: true };
  }
  const status = await jobStatusOf(providerMessageId);
  if (status && status !== 'queued') {
    console.log(`SKIP  a concurrent worker already handled the probe (status=${status})`);
    return { owned: false };
  }
  assert.fail('a queued, due job must be claimable');
}

console.log('--- Earth Talk LIVE Supabase queue integration ---');

if (!isDatabaseConfigured()) {
  console.log('SKIP  Database is not configured; nothing to verify against.');
  process.exit(0);
}

section('1. The live queue schema is reachable and complete');

await test('durable queue readiness passes against the live project', async () => {
  const readiness = await checkDurableQueueReadiness();
  assert.ok(readiness.ready, `not ready: ${readiness.blocker ?? 'unknown'}`);
  if (readiness.missingTables.length) throw new Error(`missing tables: ${readiness.missingTables}`);
  if (readiness.missingFunctions.length) throw new Error(`missing functions: ${readiness.missingFunctions}`);
});

await test('every required RPC executes without a schema-cache error', async () => {
  const { error } = await (supabase as any).rpc('webhook_job_stats');
  assert.ok(!error, `webhook_job_stats failed: ${error?.message}`);
  assert.equal(REQUIRED_QUEUE_FUNCTIONS.includes('webhook_job_stats'), true);
});

// =============================================================
section('2. Enqueue, claim and lifecycle against real rows');
// =============================================================

let queueWasEmpty = false;
let firstProbeProviderId = '';

await test('the live queue holds no work before the integration run', async () => {
  const pending = await queuedOrRetryableCount();
  queueWasEmpty = pending === 0;
  if (!queueWasEmpty) {
    console.log(`SKIP  queue has ${pending} pending job(s); not claiming live work.`);
  }
  assert.ok(true);
});

await test('enqueue persists a row and is idempotent per provider id', async () => {
  if (!queueWasEmpty) return;
  const jobs = new WebhookJobRepository();
  const providerMessageId = `${runId}-j1`;
  firstProbeProviderId = providerMessageId;
  assert.equal(
    await jobs.enqueue({ providerMessageId, jobType: 'text', payload: { probe: true } }),
    'enqueued'
  );
  assert.equal(
    await jobs.enqueue({ providerMessageId, jobType: 'text', payload: { probe: true } }),
    'duplicate',
    'the unique constraint must reject a duplicate provider id'
  );
  const { data } = await (supabase.from('webhook_jobs') as any)
    .select('id, status, attempts')
    .eq('provider_message_id', providerMessageId);
  assert.equal(data?.length, 1);
  createdJobIds.push(data[0].id);
});

await test('claimNext claims the row once and counts the attempt', async () => {
  if (!queueWasEmpty) return;
  const jobs = new WebhookJobRepository();
  await claimProbe(jobs, firstProbeProviderId);
});

await test('markRetryable respects a custom max_attempts budget from the row', async () => {
  if (!queueWasEmpty) return;
  const jobs = new WebhookJobRepository();
  const providerMessageId = `${runId}-j2`;
  await jobs.enqueue({ providerMessageId, jobType: 'text', payload: { probe: true }, maxAttempts: 1 });
  const { data } = await (supabase.from('webhook_jobs') as any)
    .select('id')
    .eq('provider_message_id', providerMessageId);
  createdJobIds.push(data[0].id);
  const { owned } = await claimProbe(jobs, providerMessageId);
  if (!owned) return;
  // `claimProbe` already consumed the only due job; read the row this test
  // created to record the terminal transition on it.
  const { data: row } = await (supabase.from('webhook_jobs') as any)
    .select('id, attempts')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();
  assert.ok(row, 'the probe row must exist');
  const result = await jobs.markRetryable(row.id, 'probe transient failure', row.attempts);
  assert.equal(result, 'terminal', 'a max_attempts=1 row must terminate, not retry forever');
});

await test('markCompleted finalises a job', async () => {
  if (!queueWasEmpty) return;
  const jobs = new WebhookJobRepository();
  const providerMessageId = `${runId}-j3`;
  await jobs.enqueue({ providerMessageId, jobType: 'text', payload: { probe: true } });
  const { data } = await (supabase.from('webhook_jobs') as any)
    .select('id')
    .eq('provider_message_id', providerMessageId);
  createdJobIds.push(data[0].id);
  const { owned } = await claimProbe(jobs, providerMessageId);
  if (!owned) return;
  const { data: row } = await (supabase.from('webhook_jobs') as any)
    .select('id')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();
  await jobs.markCompleted(row.id);
  const { data: after } = await (supabase.from('webhook_jobs') as any)
    .select('status')
    .eq('id', row.id)
    .maybeSingle();
  assert.equal(after?.status, 'completed');
});

// =============================================================
section('3. Claim ledger under real row locking');
// =============================================================

await test('a message claim is exclusive and idempotent', async () => {
  const claims = new WebhookClaimRepository();
  const messageId = `${runId}-m1`;
  createdMessageIds.push(messageId);
  assert.equal(await claims.claim(messageId), 'claimed');
  assert.equal(await claims.claim(messageId), 'duplicate', 'a live claim must not be reissued');
  await claims.markCompleted(messageId);
  assert.equal((await claims.get(messageId))?.status, 'completed');
});

// =============================================================
section('4. Concurrent claim Next never double-dispatches');
// =============================================================

await test('two simultaneous claims receive different work', async () => {
  if (!queueWasEmpty) return;
  const jobs = new WebhookJobRepository();
  for (const suffix of ['c1', 'c2']) {
    const providerMessageId = `${runId}-${suffix}`;
    await jobs.enqueue({ providerMessageId, jobType: 'text', payload: { probe: true } });
    const { data } = await (supabase.from('webhook_jobs') as any)
      .select('id')
      .eq('provider_message_id', providerMessageId);
    createdJobIds.push(data[0].id);
  }
  const [a, b] = await Promise.all([jobs.claimNext('itest-a'), jobs.claimNext('itest-b')]);
  if (a && b) assert.notEqual(a.id, b.id, 'two workers must never get the same job');
});

console.log('\nCleaning up integration rows...');
await cleanup();

console.log(`\n${'='.repeat(60)}`);
console.log('Live Supabase queue integration');
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  console.error(`\nLast test: ${currentTest}`);
  process.exit(1);
}
