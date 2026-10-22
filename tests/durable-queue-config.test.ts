/**
 * Durable webhook queue configuration and readiness tests.
 *
 * These run with NO database (see `tests/run.ts`): they assert how the
 * application *recognises* database configuration and how it behaves when the
 * database is missing, broken or holding the wrong kind of credential. They are
 * the hermetic counterpart to `tests/integration/supabase-queue.test.ts`, which
 * exercises the same code against the live project and is run explicitly.
 *
 * Nothing here reads or writes the real project.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { env } from '../src/config/env.js';
import {
  classifySupabaseKey,
  describeDatabaseConfig,
  isSupabaseServerKeyConfigured,
  isSupabaseUrlConfigured,
} from '../src/config/database-config.js';
import { isDatabaseConfigured } from '../src/utils/admin-auth.js';
import { webhookJobRepository, WebhookJobRepository } from '../src/repositories/webhook-job.repository.js';
import { webhookClaimRepository, WebhookClaimRepository } from '../src/repositories/webhook-claim.repository.js';
import { webhookQueueService, WebhookQueueService } from '../src/services/webhook-queue.service.js';
import {
  checkDurableQueueReadiness,
  REQUIRED_QUEUE_FUNCTIONS,
  REQUIRED_QUEUE_TABLES,
} from '../src/services/webhook-queue-readiness.js';
import { handleWebhook } from '../src/controllers/webhook.controller.js';

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

/** Runs `fn` with the two database variables temporarily replaced. */
async function withDatabaseEnv(
  url: string,
  key: string,
  fn: () => void | Promise<void>
): Promise<void> {
  const previousUrl = env.SUPABASE_URL;
  const previousKey = env.SUPABASE_SECRET_KEY;
  env.SUPABASE_URL = url;
  env.SUPABASE_SECRET_KEY = key;
  try {
    await fn();
  } finally {
    env.SUPABASE_URL = previousUrl;
    env.SUPABASE_SECRET_KEY = previousKey;
  }
}

const VALID_URL = 'https://abcdefghijklmnopqrst.supabase.co';
const VALID_SECRET_KEY = `sb_secret_${'A'.repeat(40)}`;

function jwtWithRole(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({ role, iss: 'supabase' })).toString('base64');
  return `${header}.${payload}.signature`;
}

console.log('--- Running Earth Talk Durable Queue Configuration Suite ---');

// =============================================================
section('1. Database configuration is recognised exactly');
// =============================================================

await test('a valid URL and server secret key are recognised', async () => {
  await withDatabaseEnv(VALID_URL, VALID_SECRET_KEY, () => {
    assert.equal(isSupabaseUrlConfigured(VALID_URL), true);
    assert.equal(isSupabaseServerKeyConfigured(VALID_SECRET_KEY), true);
    assert.equal(isDatabaseConfigured(), true);
    assert.deepEqual(describeDatabaseConfig().issues, []);
  });
});

await test('a partially configured environment is NOT reported as configured', async () => {
  // The historical bug: a real URL plus the development sentinel key looked
  // "configured" to the old substring check, so writes failed with 401 while the
  // app advertised durability.
  await withDatabaseEnv(VALID_URL, 'dev_supabase_key_not_configured', () => {
    const status = describeDatabaseConfig();
    assert.equal(status.configured, false);
    assert.equal(isDatabaseConfigured(), false);
    assert.ok(
      status.issues.some((issue) => issue.includes('SUPABASE_SECRET_KEY')),
      `the blocker must name the variable to fix: ${status.issues.join('; ')}`
    );
  });
});

await test('placeholder credentials are treated as no configuration', async () => {
  await withDatabaseEnv('', '', () => {
    assert.equal(isDatabaseConfigured(), false);
  });
  await withDatabaseEnv('https://mock-project-id.supabase.co', 'test_supabase_secret_key_placeholder', () => {
    assert.equal(isDatabaseConfigured(), false);
    const status = describeDatabaseConfig();
    assert.equal(status.configured, false);
    assert.equal(status.issues.length >= 2, true, 'both variables should be named');
  });
});

await test('public/anon keys are never accepted as privileged server credentials', async () => {
  assert.equal(classifySupabaseKey(jwtWithRole('anon')), 'anon');
  assert.equal(classifySupabaseKey(jwtWithRole('service_role')), 'legacy-service');
  assert.equal(classifySupabaseKey(`sb_publishable_${'B'.repeat(20)}`), 'publishable');

  await withDatabaseEnv(VALID_URL, `sb_publishable_${'B'.repeat(20)}`, () => {
    assert.equal(isDatabaseConfigured(), false);
    assert.ok(
      describeDatabaseConfig().issues.some((issue) => issue.includes('public/anon')),
      'the blocker must explain that a public key cannot back the server'
    );
  });
  await withDatabaseEnv(VALID_URL, jwtWithRole('anon'), () => {
    assert.equal(isDatabaseConfigured(), false);
  });

  // A legacy service_role JWT is privileged and must still be accepted.
  await withDatabaseEnv(VALID_URL, jwtWithRole('service_role'), () => {
    assert.equal(isDatabaseConfigured(), true);
  });
});

await test('diagnostics never include the credential value', async () => {
  const secret = `sb_secret_${'Z'.repeat(40)}`;
  await withDatabaseEnv('', secret, () => {
    const text = describeDatabaseConfig().issues.join(' | ');
    assert.ok(!text.includes(secret), 'the secret value must never appear in a message');
  });
});

// =============================================================
section('2. Durable flags follow the live configuration');
// =============================================================

await test('with a valid configuration the queue reports itself durable', async () => {
  await withDatabaseEnv(VALID_URL, VALID_SECRET_KEY, () => {
    assert.equal(webhookJobRepository.durable, true);
    assert.equal(webhookClaimRepository.durable, true);
    assert.equal(webhookQueueService.isDurable, true);
    assert.equal(new WebhookJobRepository().durable, true);
  });
});

await test('without a configuration nothing claims to be durable', async () => {
  await withDatabaseEnv('', '', () => {
    assert.equal(webhookJobRepository.durable, false);
    assert.equal(webhookClaimRepository.durable, false);
    assert.equal(webhookQueueService.isDurable, false);
    const service = new WebhookQueueService(new WebhookJobRepository(), new WebhookClaimRepository());
    assert.equal(service.isDurable, false);
  });
});

await test('enqueue still succeeds in memory but is explicitly not durable', async () => {
  await withDatabaseEnv('', '', async () => {
    const jobs = new WebhookJobRepository();
    assert.equal(
      await jobs.enqueue({ providerMessageId: 'cfg-1', jobType: 'text', payload: {} }),
      'enqueued'
    );
    assert.equal(jobs.durable, false, 'the memory path must never be labelled durable');
  });
});

// =============================================================
section('3. Readiness reports a blocker when the database is unusable');
// =============================================================

await test('readiness fails fast, without network access, when nothing is configured', async () => {
  await withDatabaseEnv('', '', async () => {
    const readiness = await checkDurableQueueReadiness();
    assert.equal(readiness.ready, false);
    assert.ok(readiness.blocker && readiness.blocker.includes('not configured'), 'blocker must say not configured');
  });
});

// =============================================================
section('4. Migration SQL and application code stay in step');
// =============================================================

const migrationSql = [
  'supabase/migrations/027_webhook_message_claims.sql',
  'supabase/migrations/028_durable_webhook_queue.sql',
]
  .map((path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))
  .join('\n');

const jobRepoSource = readFileSync(new URL('../src/repositories/webhook-job.repository.ts', import.meta.url), 'utf8');
const claimRepoSource = readFileSync(
  new URL('../src/repositories/webhook-claim.repository.ts', import.meta.url),
  'utf8'
);

await test('every required queue function exists in the migrations', () => {
  const defined = new Set(
    [...migrationSql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\s*\(/g)].map((m) => m[1])
  );
  for (const name of REQUIRED_QUEUE_FUNCTIONS) {
    assert.ok(defined.has(name), `migration SQL does not define required function ${name}`);
  }
});

await test('every required queue table exists in the migrations', () => {
  for (const table of REQUIRED_QUEUE_TABLES) {
    assert.ok(
      new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`).test(migrationSql),
      `migration SQL does not create required table ${table}`
    );
  }
});

await test('the repositories call the functions with the migration parameter names', () => {
  const expected: Array<[string, string, string]> = [
    ['claim_webhook_job', 'p_worker_id', jobRepoSource],
    ['recover_stale_webhook_jobs', 'p_stale_seconds', jobRepoSource],
    ['webhook_job_stats', '', jobRepoSource],
    ['claim_webhook_message', 'p_message_id', claimRepoSource],
    ['recover_stale_webhook_claims', 'p_stale_seconds', claimRepoSource],
  ];
  for (const [fn, param, source] of expected) {
    assert.ok(source.includes(`'${fn}'`), `no call site for ${fn}`);
    if (param) assert.ok(source.includes(param), `call to ${fn} is missing parameter ${param}`);
  }
});

// =============================================================
section('5. A persist failure refuses the Meta acknowledgement');
// =============================================================

await test('a queue write failure answers 503, never a false 200', async () => {
  const service = webhookQueueService as unknown as {
    acceptInbound: (payload: unknown) => Promise<unknown>;
  };
  const original = service.acceptInbound;
  let acknowledged = false;
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      acknowledged = true;
      return this;
    },
    sendStatus(code: number) {
      this.statusCode = code;
      return this;
    },
  };

  service.acceptInbound = async () => {
    throw new Error('database unavailable');
  };
  try {
    await handleWebhook(
      { body: { object: 'whatsapp_business_account', entry: [] } } as never,
      res as never
    );
  } finally {
    service.acceptInbound = original;
  }

  assert.equal(res.statusCode, 503, 'the handler must refuse the ack with 503');
  assert.equal(acknowledged, false, 'Meta must not be told the event was received');
  assert.deepEqual(res.body, { error: 'EVENT_NOT_PERSISTED' });
});

// =============================================================
section('6. Claiming is safe with more than one worker');
// =============================================================

await test('two concurrent claimants never receive the same job', async () => {
  await withDatabaseEnv('', '', async () => {
    const jobs = new WebhookJobRepository();
    await jobs.enqueue({ providerMessageId: 'race-1', jobType: 'text', payload: {} });
    const [a, b] = await Promise.all([jobs.claimNext('worker-a'), jobs.claimNext('worker-b')]);
    const claimed = [a, b].filter(Boolean).length;
    assert.equal(claimed, 1, 'exactly one worker must win the claim');
  });
});

await test('two concurrent claims on one message yield a single claim', async () => {
  await withDatabaseEnv('', '', async () => {
    const claims = new WebhookClaimRepository();
    const [a, b] = await Promise.all([claims.claim('race-m1'), claims.claim('race-m1')]);
    const results = [a, b].sort();
    assert.deepEqual(results, ['claimed', 'duplicate']);
  });
});

// -----------------------------------------------------------------------------
console.log(`\n${'='.repeat(60)}`);
console.log('Durable Queue Configuration Suite');
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  console.error(`\nLast test: ${currentTest}`);
  process.exit(1);
}
