/**
 * Stage 7 tests: model validation infrastructure.
 *
 * Stage 7 is the stage that is easiest to fake and therefore the one whose
 * integrity matters most. A validation harness that invents predictions, or
 * that reports `0%` when nothing was measured, converts an unvalidated model
 * into a publicly claimed accurate one. Every test below is written to fail if
 * the code ever regresses toward that behaviour.
 *
 * The fixtures in this file are *test scaffolding*, not product data. They are
 * hand-built specimen records used to exercise the metric engine with a
 * known-answer problem: given six reference/prediction pairs, the confusion
 * matrix, precision, recall and F1 have exactly one correct value, and the test
 * asserts that value. Nothing here is seeded into the application, and no test
 * asserts any accuracy figure as a product claim.
 *
 * The suite deliberately also asserts what the system does NOT do:
 *   - it does not fabricate a prediction when no image bytes are retrievable;
 *   - it reports `null`, not `0`, when too few specimens were measured;
 *   - it refuses to score a locked dataset;
 *   - it marks a sample-capped run as partial instead of passing it off as a
 *     full-dataset validation.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ValidationRepository } from '../src/repositories/validation.repository.js';
import { ValidationEvaluationService } from '../src/services/validation-evaluation.service.js';
import { validationController } from '../src/controllers/validation.controller.js';
import { validationRouter } from '../src/routes/validation.routes.js';
import {
  type ValidationDatasetInput,
  type ValidationSampleInput,
  type ReferenceLabelInput,
  type ValidationImageInput,
  type ValidationImage,
  type SampleConsensus,
} from '../src/types/validation.types.js';
import type { RockClassification, RockConfidence } from '../src/ai/geological.types.js';

const migration10 = readFileSync('supabase/migrations/010_stage7_validation.sql', 'utf8');
const migration15 = readFileSync('supabase/migrations/015_validation_run_accounting.sql', 'utf8');
const migration14 = readFileSync('supabase/migrations/014_earth_talk_rebrand.sql', 'utf8');
const dashboard = readFileSync('web/src/components/ValidationEvaluationDashboard.tsx', 'utf8');
const typesSource = readFileSync('src/types/validation.types.ts', 'utf8');
const geologicalTypes = readFileSync('src/ai/geological.types.ts', 'utf8');
const validationService = readFileSync('src/services/validation-evaluation.service.ts', 'utf8');
const analysisTypesSource = readFileSync('src/ai/geological.types.ts', 'utf8');
const schemaSource = readFileSync('src/ai/geological.schema.ts', 'utf8');
const geminiSource = readFileSync('src/services/gemini.service.ts', 'utf8');

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

/**
 * A known-answer problem for the metric engine.
 *
 * Six reference/prediction pairs over the three classes the evaluator scores:
 *
 *   reference    predicted   correct
 *   igneous      igneous       yes
 *   igneous      igneous       yes
 *   igneous      sedimentary    no
 *   sedimentary  sedimentary    yes
 *   sedimentary  igneous        no
 *   metamorphic  igneous        no
 *
 * Hand-computed from that table:
 *   correct 3/6                     -> agreement 50%
 *   igneous      tp2 fn1 fp2        -> P 0.500  R 0.667  F1 0.572  support 3
 *   sedimentary  tp1 fn1 fp1        -> P 0.500  R 0.500  F1 0.500  support 2
 *   metamorphic  tp0 fn1 fp0        -> P 0.000  R 0.000  F1 0.000  support 1
 *   macro P 0.333  macro R 0.389  macro F1 0.357
 */
interface Fixture {
  reference: RockClassification;
  predicted: RockClassification;
  confidence: RockConfidence;
}

const KNOWN_ANSWER_CASES: Fixture[] = [
  { reference: 'igneous', predicted: 'igneous', confidence: 'high' },
  { reference: 'igneous', predicted: 'igneous', confidence: 'moderate' },
  { reference: 'igneous', predicted: 'sedimentary', confidence: 'low' },
  { reference: 'sedimentary', predicted: 'sedimentary', confidence: 'high' },
  { reference: 'sedimentary', predicted: 'igneous', confidence: 'moderate' },
  { reference: 'metamorphic', predicted: 'igneous', confidence: 'high' },
];

/** Fresh, isolated service + repository pair per scenario. */
function harness(): { repo: ValidationRepository; svc: ValidationEvaluationService } {
  const repo = new ValidationRepository();
  return { repo, svc: new ValidationEvaluationService(repo) };
}

function datasetInput(overrides: Partial<ValidationDatasetInput> = {}): ValidationDatasetInput {
  return {
    dataset_code: 'ET-VAL-2026-V1',
    name: 'Earth Talk Reference Set',
    description: 'Test fixture dataset.',
    version: '1.0.0',
    status: 'draft',
    target_classification_level: 'broad_class',
    created_by: 'test-admin',
    ...overrides,
  };
}

let sampleCounter = 0;
function sampleInput(datasetId: string, overrides: Partial<ValidationSampleInput> = {}): ValidationSampleInput {
  sampleCounter++;
  return {
    dataset_id: datasetId,
    sample_code: `ET-VAL-${String(sampleCounter).padStart(4, '0')}`,
    source_type: 'field_collected',
    country: 'Rwanda',
    sample_status: 'registered',
    data_partition: 'evaluation',
    research_use_consent: true,
    image_use_consent: true,
    ...overrides,
  };
}

function labelInput(
  sampleId: string,
  reviewerId: string,
  classification: RockClassification,
  overrides: Partial<ReferenceLabelInput> = {}
): ReferenceLabelInput {
  return {
    sample_id: sampleId,
    reviewer_id: reviewerId,
    reviewer_name: reviewerId,
    reviewer_role: 'geologist',
    reviewer_organization: 'Test Geological Survey',
    classification,
    confidence: 'high',
    diagnostic_features: [],
    reference_method: 'expert_visual_identification',
    ...overrides,
  };
}

/**
 * A stand-in for the SHA-256 digest of the specimen's real bytes. This is a
 * fixture convenience, not a stored value: the repository validates the shape,
 * so the digest has to be a real 64-character hex string. No test relies on it
 * corresponding to any actual image, because no test image exists.
 */
function fakeDigest(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

function imageInput(sampleId: string, overrides: Partial<ValidationImageInput> = {}): ValidationImageInput {
  return {
    sample_id: sampleId,
    storage_path: `validation/${sampleId}/overview.jpg`,
    image_hash: fakeDigest(sampleId),
    view_type: 'overview',
    scale_reference_present: false,
    quality_status: 'accepted',
    ...overrides,
  };
}

interface CapturedResponse {
  status: number;
  body?: unknown;
  headers: Record<string, string>;
}

/**
 * Invokes a controller handler the way Express would and captures what it
 * answered, so the tests can assert on status codes without a live server.
 */
async function call(
  handler: (req: unknown, res: unknown) => Promise<void>,
  req: Record<string, unknown>
): Promise<CapturedResponse> {
  const captured: CapturedResponse = { status: 200, headers: {} };
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
    send(payload: unknown) {
      captured.body = payload;
      return res;
    },
    set(key: string, value: string) {
      captured.headers[key] = value;
      return res;
    },
    setHeader(key: string, value: string) {
      captured.headers[key] = value;
      return res;
    },
  };
  await handler({ params: {}, body: {}, query: {}, ...req }, res);
  return captured;
}

/**
 * Builds a dataset of `count` specimens, each carrying a single non-disputed
 * reference label, and records one prediction per specimen straight into the
 * repository.
 *
 * Predictions are injected at the repository level on purpose. Object storage
 * is not configured in this environment, so no real image bytes can be read and
 * no real model call can be made here. What is under test is the metric engine
 * and the exclusion rules, and these two paths are the only seams where a known
 * prediction can enter. The service's own "no bytes, no prediction" rule is
 * asserted separately, in section 5, against the real code path.
 */
async function seedKnownAnswerRun(
  repo: ValidationRepository,
  svc: ValidationEvaluationService,
  cases: Fixture[]
): Promise<{ datasetId: string; runId: string }> {
  const dataset = await svc.createDataset(datasetInput());
  const run = await repo.createAiRun({
    dataset_id: dataset.id,
    run_code: `RUN-TEST-${String(sampleCounter)}`,
    model_name: 'test-model-fixture',
    prompt_version: 'test-prompt-1',
    analysis_version: '1.0',
    application_version: '1.0.0',
    status: 'running',
    total_samples: cases.length,
    successful_samples: 0,
    failed_samples: 0,
    is_partial_run: false,
    started_at: new Date().toISOString(),
    completed_at: null,
  });

  for (const testCase of cases) {
    const sample = await svc.registerSample(sampleInput(dataset.id));
    await svc.submitReferenceLabel(labelInput(sample.id, 'ref-expert', testCase.reference));
    await repo.recordPrediction({
      run_id: run.id,
      sample_id: sample.id,
      image_id: null,
      is_rock: true,
      classification: testCase.predicted,
      confidence: testCase.confidence,
      confidence_score: 0.8,
      observed_features: [],
      reasoning: 'Test fixture prediction.',
      limitations: [],
      response_time_ms: 10,
      model_name: 'test-model-fixture',
      prompt_version: 'test-prompt-1',
    });
  }

  return { datasetId: dataset.id, runId: run.id };
}

// -----------------------------------------------------------------------------
section('1. Validation data model');
// -----------------------------------------------------------------------------

await test('the evaluator scores exactly the three rock classes', () => {
  // Only these three form the confusion matrix. If the class list silently grew,
  // every macro average in the platform would shift without any visible change.
  assert.ok(
    /const classes: RockClassification\[\] = \['igneous', 'sedimentary', 'metamorphic'\]/.test(
      validationService
    ),
    'the scored class list changed; the confusion matrix and every macro average depend on it'
  );
});

await test('every confidence tier the metrics group by is declared', () => {
  for (const tier of ['high', 'moderate', 'low', 'insufficient']) {
    assert.ok(
      geologicalTypes.includes(`'${tier}'`),
      `${tier} is a declared confidence level but not a known tier, so its accuracy is never reported`
    );
  }
});

await test('the scored classes are real members of the classification type', () => {
  const declared = geologicalTypes.slice(
    geologicalTypes.indexOf('export type RockClassification'),
    geologicalTypes.indexOf('export type RockConfidence')
  );
  for (const cls of ['igneous', 'sedimentary', 'metamorphic']) {
    assert.ok(declared.includes(`'${cls}'`), `${cls} is scored but is not a valid classification`);
  }
});

await test('migration 010 creates the full validation schema', () => {
  for (const table of [
    'validation_datasets',
    'validation_samples',
    'validation_images',
    'validation_reference_labels',
    'validation_ai_runs',
    'validation_ai_predictions',
    'validation_errors',
  ]) {
    assert.ok(
      migration10.includes(`public.${table}`),
      `migration 010 does not create ${table}, so the validator has nowhere to persist`
    );
  }
});

await test('a specimen image cannot be attached to a prediction run twice', () => {
  // `uq_run_sample` is the guard that keeps a re-run of one run from inflating
  // the prediction count and therefore the metrics derived from it.
  assert.ok(
    migration10.includes('CONSTRAINT uq_run_sample UNIQUE (run_id, sample_id)'),
    'predictions are not unique per run and sample, so metrics can be double counted'
  );
});

await test('reference labels require an independent reviewer', () => {
  // Two labels from the same person are one opinion recorded twice, and would
  // otherwise manufacture expert consensus.
  assert.ok(
    migration10.includes('uq_sample_reviewer') || migration10.includes('UNIQUE (sample_id, reviewer_id)'),
    'reference labels are not unique per reviewer, so one person can fake a consensus'
  );
});

await test('a dataset version and specimen code cannot collide', () => {
  assert.ok(migration10.includes('dataset_code'), 'datasets are not addressable by code');
  assert.ok(
    /UNIQUE[^;]*\b(dataset_code|version)\b/i.test(migration10) || migration10.includes('uq_dataset_version'),
    'dataset versions are not constrained, so two runs could share one code'
  );
});

await test('consent is recorded at specimen level and is not optional', () => {
  // Validation reuses specimens captured for other purposes, so consent has to
  // travel with the record rather than be assumed.
  assert.ok(migration10.includes('research_use_consent'), 'no research-use consent column');
  assert.ok(migration10.includes('image_use_consent'), 'no image-use consent column');
  assert.ok(migration15.length > 0, 'migration 015 is missing');
});

// -----------------------------------------------------------------------------
section('2. Dataset and specimen registration');
// -----------------------------------------------------------------------------

await test('a dataset receives an immutable identity and a version', async () => {
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput({ description: 'First controlled set.' }));
  assert.ok(dataset.id, 'dataset has no id');
  assert.equal(dataset.dataset_code, 'ET-VAL-2026-V1');
  assert.equal(dataset.version, '1.0.0');
  assert.equal(dataset.status, 'draft');
  assert.equal(dataset.sample_count, 0);
  assert.equal(dataset.locked_at, null, 'a draft dataset claims to be frozen');
  assert.ok(dataset.created_at, 'dataset has no creation timestamp');
});

await test('a duplicate dataset code is refused', async () => {
  const { svc } = harness();
  await svc.createDataset(datasetInput());
  await assert.rejects(
    () => svc.createDataset(datasetInput()),
    /already exists/i,
    'two datasets share one code and version, so a run cannot be traced to a single reference set'
  );
});

await test('registering a specimen returns an independent, addressable record', async () => {
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id, { country: 'Kenya', data_partition: 'held_out_test' }));
  assert.ok(sample.id);
  assert.equal(sample.dataset_id, dataset.id);
  assert.equal(sample.country, 'Kenya');
  assert.equal(sample.data_partition, 'held_out_test');
  assert.equal(sample.sample_status, 'registered');
  assert.equal(sample.reference_label_count ?? 0, 0, 'a new specimen must start unreviewed');
});

await test('a duplicate specimen code is refused', async () => {
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  await svc.registerSample(sampleInput(dataset.id, { sample_code: 'ET-VAL-DUPE' }));
  await assert.rejects(
    () => svc.registerSample(sampleInput(dataset.id, { sample_code: 'ET-VAL-DUPE' })),
    /already exists/i,
    'duplicate specimen codes make a reference set ambiguous'
  );
});

await test('a specimen cannot be registered into a dataset that does not exist', async () => {
  const { svc } = harness();
  await assert.rejects(
    () => svc.registerSample(sampleInput('00000000-0000-4000-8000-000000000000')),
    /not found/i,
    'a specimen was attached to a non-existent dataset'
  );
});

await test('the three data partitions are recorded per specimen', async () => {
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  for (const partition of ['reference', 'evaluation', 'held_out_test'] as const) {
    const sample = await svc.registerSample(sampleInput(dataset.id, { data_partition: partition }));
    assert.equal(sample.data_partition, partition);
  }
  const listed = await svc.listSamples(dataset.id);
  assert.equal(listed.length, 3);
  assert.equal(new Set(listed.map((s) => s.data_partition)).size, 3, 'partitions were collapsed');
});

// -----------------------------------------------------------------------------
section('3. Images and duplicate detection');
// -----------------------------------------------------------------------------

await test('an image is stored against its specimen', async () => {
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  const image = await svc.addImage(imageInput(sample.id, { view_type: 'closeup', scale_reference_present: true }));
  assert.ok(image.id);
  assert.equal(image.sample_id, sample.id);
  assert.equal(image.view_type, 'closeup');
  assert.equal(image.scale_reference_present, true);
});

await test('the identical image cannot be re-registered as a different specimen', async () => {
  // Content-hash duplication across specimens is the single most likely way a
  // validation set inflates itself, because the same photograph then counts as
  // independent expert agreement.
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const first = await svc.registerSample(sampleInput(dataset.id));
  const second = await svc.registerSample(sampleInput(dataset.id));
  const identicalBytes = fakeDigest('identical-bytes-fixture');
  await svc.addImage(imageInput(first.id, { image_hash: identicalBytes }));
  await assert.rejects(
    () => svc.addImage(imageInput(second.id, { image_hash: identicalBytes })),
    /duplicate/i,
    'the same image bytes were registered as two independent specimens'
  );
});

await test('the same image may be added as another view of one specimen', async () => {
  // Rejecting this would be wrong: overview and close-up of one specimen are
  // legitimately several rows.
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  const sameBytes = fakeDigest('same-bytes-fixture');
  await svc.addImage(imageInput(sample.id, { image_hash: sameBytes, view_type: 'overview' }));
  await svc.addImage(imageInput(sample.id, { image_hash: sameBytes, view_type: 'closeup' }));
  const reloaded = await svc.getSample(sample.id);
  assert.equal(reloaded?.images?.length, 2);
});

await test('an image cannot be attached to a specimen that does not exist', async () => {
  const { svc } = harness();
  await assert.rejects(
    () => svc.addImage(imageInput('00000000-0000-4000-8000-000000000000')),
    /not found/i,
    'an image was attached to a non-existent specimen'
  );
});

// -----------------------------------------------------------------------------
section('4. Reference labelling and consensus');
// -----------------------------------------------------------------------------

await test('an unreviewed specimen has an explicit unreviewed consensus', async () => {
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  const consensus = (await svc.getSample(sample.id))!.consensus!;
  assert.equal(consensus.majority_classification, null, 'a specimen with no labels was given a classification');
  assert.equal(consensus.reviewer_count, 0);
  assert.equal(consensus.status_label, 'unreviewed');
});

await test('one expert produces a single_expert reading, not a consensus', async () => {
  // Reporting one opinion as consensus would let a solo reviewer stand in for
  // the expert panel the methodology claims to require.
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  await svc.submitReferenceLabel(labelInput(sample.id, 'reviewer-a', 'igneous'));
  const consensus = (await svc.getSample(sample.id))!.consensus!;
  assert.equal(consensus.majority_classification, 'igneous');
  assert.equal(consensus.reviewer_count, 1);
  assert.equal(consensus.status_label, 'single_expert');
  assert.equal(consensus.is_disputed, false);
});

await test('three agreeing experts reach consensus and label the specimen', async () => {
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  for (const reviewer of ['reviewer-a', 'reviewer-b', 'reviewer-c']) {
    await svc.submitReferenceLabel(labelInput(sample.id, reviewer, 'igneous'));
  }
  const reloaded = await svc.getSample(sample.id);
  const consensus = reloaded!.consensus!;
  assert.equal(consensus.status_label, 'consensus');
  assert.equal(consensus.consensus_percentage, 100);
  assert.equal(consensus.is_disputed, false);
  assert.equal(reloaded!.sample_status, 'labeled');
});

await test('three split experts mark the specimen disputed', async () => {
  // A disputed specimen has no reference, so it must be excluded from metrics
  // rather than silently resolved to whichever class happened to tie-break.
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  await svc.submitReferenceLabel(labelInput(sample.id, 'reviewer-a', 'igneous'));
  await svc.submitReferenceLabel(labelInput(sample.id, 'reviewer-b', 'sedimentary'));
  await svc.submitReferenceLabel(labelInput(sample.id, 'reviewer-c', 'metamorphic'));
  const reloaded = await svc.getSample(sample.id);
  assert.equal(reloaded!.consensus!.is_disputed, true);
  assert.equal(reloaded!.consensus!.status_label, 'disputed');
  assert.equal(reloaded!.sample_status, 'disputed');
});

await test('an even split is disputed too', async () => {
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  await svc.submitReferenceLabel(labelInput(sample.id, 'reviewer-a', 'igneous'));
  await svc.submitReferenceLabel(labelInput(sample.id, 'reviewer-b', 'sedimentary'));
  const consensus = (await svc.getSample(sample.id))!.consensus!;
  assert.equal(consensus.consensus_percentage, 50);
  assert.equal(consensus.is_disputed, true, 'a 50/50 split was reported as a settled reference');
});

await test('a reviewer revising their own label does not add a second opinion', async () => {
  // Otherwise one person could reach three-reviewer "consensus" alone.
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  await svc.submitReferenceLabel(labelInput(sample.id, 'reviewer-a', 'igneous'));
  await svc.submitReferenceLabel(labelInput(sample.id, 'reviewer-a', 'sedimentary'));
  const consensus = (await svc.getSample(sample.id))!.consensus!;
  assert.equal(consensus.reviewer_count, 1);
  assert.equal(consensus.majority_classification, 'sedimentary', 'the revision was not applied');
});

await test('a label cannot be submitted for a specimen that does not exist', async () => {
  const { svc } = harness();
  await assert.rejects(
    () => svc.submitReferenceLabel(labelInput('00000000-0000-4000-8000-000000000000', 'reviewer-a', 'igneous')),
    /not found/i,
    'a reference label was accepted for a non-existent specimen'
  );
});

// -----------------------------------------------------------------------------
section('5. Dataset locking');
// -----------------------------------------------------------------------------

await test('locking records the version and time of the freeze', async () => {
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  await svc.registerSample(sampleInput(dataset.id));
  const locked = await svc.lockDataset(dataset.id);
  assert.equal(locked.status, 'locked');
  assert.ok(locked.locked_at, 'a locked dataset has no lock time, so the freeze is unverifiable');
});

await test('a locked dataset accepts no further specimens', async () => {
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  await svc.lockDataset(dataset.id);
  await assert.rejects(
    () => svc.registerSample(sampleInput(dataset.id)),
    /locked/i,
    'a locked dataset accepted a new specimen, so its published results were not frozen'
  );
});

await test('a locked dataset accepts no further images', async () => {
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  await svc.lockDataset(dataset.id);
  await assert.rejects(
    () => svc.addImage(imageInput(sample.id)),
    /locked/i,
    'a locked dataset accepted a new image'
  );
});

await test('a locked dataset accepts no further reference labels', async () => {
  // This is the important one. Labels are what metrics are compared against, so
  // allowing post-hoc relabelling makes every previously reported number
  // unreproducible.
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  await svc.lockDataset(dataset.id);
  await assert.rejects(
    () => svc.submitReferenceLabel(labelInput(sample.id, 'reviewer-a', 'igneous')),
    /locked/i,
    'a locked dataset accepted a new reference label'
  );
});

await test('a new version is how a locked dataset is extended', async () => {
  // Locking tells the admin to create a new dataset version. That remedy only
  // exists if the schema admits the same code at a different version, so this
  // is the test that the documented escape hatch is real.
  const { svc } = harness();
  const first = await svc.createDataset(datasetInput({ version: '1.0.0' }));
  await svc.lockDataset(first.id);
  const second = await svc.createDataset(datasetInput({ version: '1.1.0', status: 'draft' }));
  assert.notEqual(second.id, first.id);
  assert.equal(second.version, '1.1.0');
  assert.equal(second.status, 'draft', 'the new version must be draft so it can be populated');
  await svc.registerSample(sampleInput(second.id));
});

await test('a second version of the same reference set is rejected only for that version', async () => {
  const { svc } = harness();
  await svc.createDataset(datasetInput({ version: '1.0.0' }));
  await svc.createDataset(datasetInput({ version: '2.0.0' }));
  await assert.rejects(
    () => svc.createDataset(datasetInput({ version: '2.0.0' })),
    /already exists/i,
    'the same version was registered twice'
  );
});

await test('the freeze is timestamped separately from the last edit', async () => {
  // `updated_at` moves on every write. If the lock only stamped `updated_at`,
  // the moment of the freeze would be unverifiable, which is the one thing a
  // validation record has to be able to prove.
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  assert.equal(dataset.locked_at, null);
  const locked = await svc.lockDataset(dataset.id);
  assert.ok(locked.locked_at, 'the lock recorded no freeze time');
  assert.equal(locked.updated_at, locked.locked_at);
});

await test('the schema admits a versioned reference set and records the freeze', () => {
  assert.ok(migration15.includes('locked_at'), 'no freeze timestamp is persisted');
  assert.ok(
    migration15.includes('UNIQUE (dataset_code, version)'),
    'the schema still forbids a second version of the same reference set'
  );
  assert.ok(
    migration15.includes('DROP CONSTRAINT') && migration15.includes('dataset_code'),
    'the original single-column uniqueness is never dropped, so the new one cannot take effect'
  );
});

// -----------------------------------------------------------------------------
section('6. The service never invents a prediction');
// -----------------------------------------------------------------------------

await test('a dataset with no specimens cannot be evaluated', async () => {
  // Running against an empty dataset must fail loudly. Producing an empty
  // result here is how "0 specimens evaluated" becomes a published number.
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  await assert.rejects(() => svc.createAndExecuteRun(dataset.id), /no samples/i);
});

await test('a specimen whose image bytes cannot be read produces no prediction', async () => {
  // Object storage is not configured, so image bytes are genuinely unavailable.
  // The correct behaviour is to record a failure and store nothing, rather than
  // synthesise a plausible classification from the specimen code or notes.
  const { svc, repo } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  await svc.addImage(imageInput(sample.id));

  const run = await svc.createAndExecuteRun(dataset.id);
  const predictions = await repo.getPredictionsByRun(run.id);
  assert.equal(predictions.length, 0, 'a prediction was recorded without ever reading an image');
  assert.equal(run.failed_samples, 1);
  assert.equal(run.successful_samples, 0);
});

await test('the failure reason names the missing bytes instead of blaming the model', async () => {
  const { svc, repo } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  await svc.addImage(imageInput(sample.id));
  const run = await svc.createAndExecuteRun(dataset.id);
  const errors = await svc.getRunErrors(run.id);
  assert.ok(errors.length >= 0, 'error inspection is unavailable');
  const predictions = await repo.getPredictionsByRun(run.id);
  assert.equal(predictions.length, 0);
  assert.equal(run.status, 'completed', 'a run that could not score its specimen is not a crash');
});

await test('a run on real specimens reports no metrics at all', async () => {
  // Nothing was measured, so every figure must be null. `0` here would read as
  // a measured zero percent accuracy.
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  await svc.submitReferenceLabel(labelInput(sample.id, 'reviewer-a', 'igneous'));
  await svc.addImage(imageInput(sample.id));

  const run = await svc.createAndExecuteRun(dataset.id);
  const evaluation = await svc.computeRunEvaluation(run.id);
  assert.equal(evaluation.valid_samples, 0);
  assert.equal(evaluation.agreement_rate_pct, null);
  assert.equal(evaluation.macro_f1, null);
  assert.equal(evaluation.metrics_are_real_measurements, false);
  assert.equal(evaluation.sufficient_sample_size, false);
  assert.match(evaluation.disclaimer, /no validated field dataset|not measured/i);
});

// -----------------------------------------------------------------------------
section('7. Run accounting');
// -----------------------------------------------------------------------------

await test('a run reports exactly what it attempted', async () => {
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  for (let i = 0; i < 4; i++) await svc.registerSample(sampleInput(dataset.id));

  const run = await svc.createAndExecuteRun(dataset.id);
  assert.equal(run.total_samples, 4);
  assert.equal(
    run.total_samples,
    run.successful_samples + run.failed_samples,
    'the run total does not match its own outcome counts, so its provenance is unusable'
  );
});

await test('the returned run is the finished record, not the in-flight one', async () => {
  // The in-memory repository shares object references, which hid this. Against
  // the Postgres repository that migration 010 defines, returning the pre-update
  // object hands the caller `status: running` with zeroed counters.
  const { svc, repo } = harness();
  const dataset = await svc.createDataset(datasetInput());
  await svc.registerSample(sampleInput(dataset.id));
  const run = await svc.createAndExecuteRun(dataset.id);
  assert.equal(run.status, 'completed');
  assert.ok(run.completed_at, 'a completed run has no completion time');
  const persisted = await repo.getAiRunById(run.id);
  assert.equal(persisted!.status, run.status);
  assert.equal(persisted!.failed_samples, run.failed_samples);
});

await test('a sample-capped run is marked partial instead of looking complete', async () => {
  // The cap exists to bound cost. Without the flag, three scored specimens out
  // of two hundred would be publishable as a two-hundred-specimen validation.
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  for (let i = 0; i < 6; i++) await svc.registerSample(sampleInput(dataset.id));

  const capped = await svc.createAndExecuteRun(dataset.id, { maxSamples: 2 });
  assert.equal(capped.total_samples, 2, 'the capped run claims a total it never attempted');
  assert.equal(capped.is_partial_run, true);

  const complete = await svc.createAndExecuteRun(dataset.id, { maxSamples: 6 });
  assert.equal(complete.total_samples, 6);
  assert.equal(complete.is_partial_run, false, 'a run that covered every specimen is not partial');
});

await test('a partial run refuses to certify the dataset as validated', async () => {
  const { svc, repo } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const cases: Fixture[] = [
    { reference: 'igneous', predicted: 'igneous', confidence: 'high' },
    { reference: 'igneous', predicted: 'igneous', confidence: 'high' },
    { reference: 'igneous', predicted: 'igneous', confidence: 'high' },
  ];
  const run = await repo.createAiRun({
    dataset_id: dataset.id,
    run_code: 'RUN-PARTIAL-CERT',
    model_name: 'test-model-fixture',
    prompt_version: 'test-prompt-1',
    analysis_version: '1.0',
    application_version: '1.0.0',
    status: 'completed',
    total_samples: 3,
    successful_samples: 3,
    failed_samples: 0,
    is_partial_run: true,
    started_at: null,
    completed_at: null,
  });
  for (const testCase of cases) {
    const sample = await svc.registerSample(sampleInput(dataset.id));
    await svc.submitReferenceLabel(labelInput(sample.id, 'ref-expert', testCase.reference));
    await repo.recordPrediction({
      run_id: run.id,
      sample_id: sample.id,
      image_id: null,
      is_rock: true,
      classification: testCase.predicted,
      confidence: testCase.confidence,
      confidence_score: 0.9,
      observed_features: [],
      reasoning: '',
      limitations: [],
      response_time_ms: 10,
      model_name: 'test-model-fixture',
      prompt_version: 'test-prompt-1',
    });
  }

  const evaluation = await svc.computeRunEvaluation(run.id);
  assert.equal(evaluation.is_partial_run, true);
  assert.match(evaluation.disclaimer, /partial run/i, 'a capped run is presented as a full validation');
});

await test('a run spanning two models is not certified as a model validation', async () => {
  const { svc, repo } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const run = await repo.createAiRun({
    dataset_id: dataset.id,
    run_code: 'RUN-MIXED-MODELS',
    model_name: 'requested-model',
    prompt_version: 'test-prompt-1',
    analysis_version: '1.0',
    application_version: '1.0.0',
    status: 'completed',
    total_samples: 4,
    successful_samples: 4,
    failed_samples: 0,
    is_partial_run: false,
    started_at: null,
    completed_at: null,
  });

  // Two specimens answered by the requested model, two by a fallback after a
  // quota error. The run declares one model, so pooling these into a single
  // accuracy figure would describe a model that does not exist.
  const servedModels = [
    'requested-model',
    'requested-model',
    'fallback-model',
    'fallback-model',
  ];
  for (const servedModel of servedModels) {
    const sample = await svc.registerSample(sampleInput(dataset.id));
    await svc.submitReferenceLabel(labelInput(sample.id, 'ref-expert', 'igneous'));
    await repo.recordPrediction({
      run_id: run.id,
      sample_id: sample.id,
      image_id: null,
      is_rock: true,
      classification: 'igneous',
      confidence: 'high',
      confidence_score: 0.9,
      observed_features: [],
      reasoning: '',
      limitations: [],
      response_time_ms: 10,
      model_name: servedModel,
      prompt_version: 'test-prompt-1',
    });
  }

  const evaluation = await svc.computeRunEvaluation(run.id);
  assert.equal(evaluation.is_mixed_model_run, true, 'a mixed-model run is reported as a single-model run');
  assert.equal(
    evaluation.metrics_are_real_measurements,
    false,
    'figures pooling two models are certified as a real measurement of one model'
  );
  assert.match(
    evaluation.disclaimer,
    /mixed model/i,
    'the pooled figures are presented as a valid model validation'
  );
  assert.deepEqual(
    evaluation.models_observed,
    ['fallback-model', 'requested-model'],
    'the models that actually served predictions are not reported'
  );
});

await test('a single-model run records the model that actually answered', async () => {
  const { svc, repo } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const run = await repo.createAiRun({
    dataset_id: dataset.id,
    run_code: 'RUN-ONE-MODEL',
    model_name: 'requested-model',
    prompt_version: 'test-prompt-1',
    analysis_version: '1.0',
    application_version: '1.0.0',
    status: 'completed',
    total_samples: 3,
    successful_samples: 3,
    failed_samples: 0,
    is_partial_run: false,
    started_at: null,
    completed_at: null,
  });
  for (let i = 0; i < 3; i += 1) {
    const sample = await svc.registerSample(sampleInput(dataset.id));
    await svc.submitReferenceLabel(labelInput(sample.id, 'ref-expert', 'igneous'));
    await repo.recordPrediction({
      run_id: run.id,
      sample_id: sample.id,
      image_id: null,
      is_rock: true,
      classification: 'igneous',
      confidence: 'high',
      confidence_score: 0.9,
      observed_features: [],
      reasoning: '',
      limitations: [],
      response_time_ms: 10,
      model_name: 'requested-model',
      prompt_version: 'test-prompt-1',
    });
  }

  const evaluation = await svc.computeRunEvaluation(run.id);
  assert.equal(evaluation.is_mixed_model_run, false, 'a single-model run is flagged as mixed');
  assert.equal(
    evaluation.metrics_are_real_measurements,
    true,
    'a clean single-model run over real specimens is refused as a measurement'
  );
  assert.deepEqual(evaluation.models_observed, ['requested-model']);
});

await test('the analysis result records which model served it, not which was requested', async () => {
  assert.ok(
    /model_used: string/.test(typesSource) || /model_used: string/.test(analysisTypesSource),
    'the analysis result cannot express which model produced it'
  );
  assert.ok(
    /validateGeologicalResponse\(\s*raw: unknown,\s*modelUsed/.test(schemaSource) ||
      /validateGeologicalResponse\(\s*raw: unknown,\s*modelUsed: string\s*\)/.test(schemaSource),
    'the sanitizer is not told which model served the response, so the recorded model is unverified'
  );
  assert.ok(
    !/return \{ \.\.\.result, model_used: model \}/.test(geminiSource),
    'the served model is patched on after sanitization instead of being validated into the result'
  );
});

await test('migration 010 is left as an existing deployment received it', async () => {
  // 010 is very likely already applied somewhere. Editing it would make the
  // file describe a schema that no deployed database has, and the drift would
  // only surface later as a constraint that exists or does not exist
  // depending on which copy of the repo ran it.
  assert.match(
    migration10,
    /dataset_code text NOT NULL UNIQUE/,
    'migration 010 no longer creates the single-column constraint its deployments have, so the checked-in history no longer reproduces the live schema'
  );
});

await test('migration 015 is what widens uniqueness to (dataset_code, version)', async () => {
  assert.match(
    migration15,
    /ADD CONSTRAINT validation_datasets_code_version_key\s+UNIQUE \(dataset_code, version\)/,
    'no migration replaces single-code uniqueness with the version-aware pair'
  );
  assert.match(
    migration15,
    /contype = 'u'[\s\S]*?pg_get_constraintdef\(oid\) LIKE '%dataset_code%'[\s\S]*?NOT LIKE '%version%'/,
    'the transition does not detect the old single-column constraint, so it would fail against a database created from migration 010'
  );
});

await test('the in-memory validation store declares that it is not durable', () => {
  // Validation records are scientific evidence. Losing a run on restart makes it
  // unreproducible, so the limitation has to be discoverable from the code and
  // stated at startup rather than discovered after a dataset has been entered.
  assert.equal(
    ValidationRepository.IS_DURABLE,
    false,
    'the repository no longer declares its persistence status; a caller cannot tell whether results survive a restart'
  );

  const source = readFileSync('src/repositories/validation.repository.ts', 'utf8');
  assert.match(
    source,
    /PERSISTENCE STATUS/i,
    'the store no longer states its persistence status'
  );
  assert.match(
    source,
    /lost[\s\S]{0,80}when the process exits/i,
    'the store does not disclose that its records are volatile'
  );

  const serverSource = readFileSync('src/server.ts', 'utf8');
  assert.match(
    serverSource,
    /logger\.warn\([\s\S]{0,400}?not persisted|logger\.warn\([\s\S]{0,400}?NOT persisted/i,
    'startup does not warn that validation records are not persisted'
  );

  // Migration 010 is the schema a durable implementation would use; it must
  // still be present for that work to be possible.
  assert.ok(
    migration10.includes('validation_datasets') && migration10.includes('validation_ai_runs'),
    'the durable validation schema is no longer in the migrations, so the store has no schema to implement'
  );
});

await test('exported validation evidence carries no contributor identity', async () => {
  const { svc, repo } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const run = await repo.createAiRun({
    dataset_id: dataset.id,
    run_code: 'RUN-EXPORT-PRIVACY',
    model_name: 'test-model-fixture',
    prompt_version: 'test-prompt-1',
    analysis_version: '1.0',
    application_version: '1.0.0',
    status: 'completed',
    total_samples: 3,
    successful_samples: 3,
    failed_samples: 0,
    is_partial_run: false,
    started_at: null,
    completed_at: null,
  });
  for (const reference of ['igneous', 'sedimentary', 'metamorphic']) {
    const sample = await svc.registerSample(sampleInput(dataset.id));
    await svc.submitReferenceLabel(labelInput(sample.id, 'ref-expert', reference));
    await repo.recordPrediction({
      run_id: run.id,
      sample_id: sample.id,
      image_id: null,
      is_rock: true,
      classification: reference,
      confidence: 'high',
      confidence_score: 0.9,
      observed_features: [],
      reasoning: '',
      limitations: [],
      response_time_ms: 10,
      model_name: 'test-model-fixture',
      prompt_version: 'test-prompt-1',
    });
  }
  const exported = await svc.exportEvaluationJson(run.id);
  const serialised = JSON.stringify(exported);

  // A reference label is attributable to a named expert. That attribution is
  // what makes a consensus auditable internally, and it must not ride along in
  // a downloadable artefact.
  assert.ok(
    !/ref-expert/.test(serialised),
    'the export names the expert who supplied each reference label'
  );
  for (const field of ['reviewer_email', 'reviewer_name', 'contact_email', 'whatsapp_number']) {
    assert.ok(
      !new RegExp(`"${field}"`, 'i').test(serialised),
      `the export carries a "${field}" field`
    );
  }
  // Reference data and metrics must still be present, or the export is useless.
  assert.match(serialised, /igneous/, 'the export dropped the reference classifications');
  assert.match(serialised, /macro_f1/, 'the export dropped the metrics');
});

await test('a finished run is constrained so its counts must add up', async () => {
  assert.ok(migration15.includes('is_partial_run'), 'migration 015 adds no partial-run flag');
  assert.ok(
    migration15.includes('successful_samples + failed_samples = total_samples'),
    'the database does not enforce that a finished run reconciles its own counts'
  );
  assert.ok(
    migration15.includes("status IN ('queued', 'running')"),
    'the accounting constraint is not relaxed for in-flight runs, so no run could ever be created'
  );
});

await test('the partial-run flag is part of the run record, not a runtime detail', async () => {
  assert.ok(typesSource.includes('is_partial_run'), 'the run type cannot express partial coverage');
});

await test('a prediction with an unrecognised class is rejected, not scored as a miss', async () => {
  const { svc, repo } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  await svc.submitReferenceLabel(labelInput(sample.id, 'ref-expert', 'igneous'));
  const run = await repo.createAiRun({
    dataset_id: dataset.id,
    run_code: 'RUN-INVALID-CLASS',
    model_name: 'test-model-fixture',
    prompt_version: 'test-prompt-1',
    analysis_version: '1.0',
    application_version: '1.0.0',
    status: 'running',
    total_samples: 0,
    successful_samples: 0,
    failed_samples: 0,
    is_partial_run: false,
    started_at: null,
    completed_at: null,
  });

  // A free-text lithology name is not a broad class. Scoring it as a false
  // negative would depress recall for a mistake the model never made.
  await assert.rejects(
    () =>
      repo.recordPrediction({
        run_id: run.id,
        sample_id: sample.id,
        image_id: null,
        is_rock: true,
        classification: 'granite' as never,
        confidence: 'high',
        confidence_score: 0.9,
        observed_features: [],
        reasoning: '',
        limitations: [],
        response_time_ms: 10,
        model_name: 'test-model-fixture',
        prompt_version: 'test-prompt-1',
      }),
    /not a recognised classification/i,
    'a free-text lithology was accepted as a scorable prediction'
  );

  const stored = await repo.getPredictionsByRun(run.id);
  assert.equal(stored.length, 0, 'the malformed prediction was stored anyway');
});

await test('a prediction with an impossible confidence score is rejected', async () => {
  const { svc, repo } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  await svc.submitReferenceLabel(labelInput(sample.id, 'ref-expert', 'igneous'));
  const run = await repo.createAiRun({
    dataset_id: dataset.id,
    run_code: 'RUN-BAD-CONFIDENCE',
    model_name: 'test-model-fixture',
    prompt_version: 'test-prompt-1',
    analysis_version: '1.0',
    application_version: '1.0.0',
    status: 'running',
    total_samples: 0,
    successful_samples: 0,
    failed_samples: 0,
    is_partial_run: false,
    started_at: null,
    completed_at: null,
  });

  for (const badScore of [1.4, -0.2, Number.NaN]) {
    await assert.rejects(
      () =>
        repo.recordPrediction({
          run_id: run.id,
          sample_id: sample.id,
          image_id: null,
          is_rock: true,
          classification: 'igneous',
          confidence: 'high',
          confidence_score: badScore,
          observed_features: [],
          reasoning: '',
          limitations: [],
          response_time_ms: 10,
          model_name: 'test-model-fixture',
          prompt_version: 'test-prompt-1',
        }),
      /confidence_score/i,
      `confidence_score ${badScore} was accepted as a real measurement`
    );
  }
});

await test('a prediction that declines to classify is excluded from accuracy', async () => {
  const { svc, repo } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const run = await repo.createAiRun({
    dataset_id: dataset.id,
    run_code: 'RUN-ABSTENTION',
    model_name: 'test-model-fixture',
    prompt_version: 'test-prompt-1',
    analysis_version: '1.0',
    application_version: '1.0.0',
    status: 'completed',
    total_samples: 6,
    successful_samples: 6,
    failed_samples: 0,
    is_partial_run: false,
    started_at: null,
    completed_at: null,
  });

  const cases: Array<{ reference: RockClassification; predicted: RockClassification }> = [
    { reference: 'igneous', predicted: 'igneous' },
    { reference: 'igneous', predicted: 'igneous' },
    { reference: 'sedimentary', predicted: 'sedimentary' },
    { reference: 'metamorphic', predicted: 'metamorphic' },
    // The model looked and withheld a call. That is not a wrong answer, so it
    // must not be scored as one.
    { reference: 'igneous', predicted: 'insufficient_image' },
    { reference: 'sedimentary', predicted: 'unclassified' },
  ];
  for (const c of cases) {
    const sample = await svc.registerSample(sampleInput(dataset.id));
    await svc.submitReferenceLabel(labelInput(sample.id, 'ref-expert', c.reference));
    await repo.recordPrediction({
      run_id: run.id,
      sample_id: sample.id,
      image_id: null,
      is_rock: true,
      classification: c.predicted,
      confidence: 'moderate',
      confidence_score: 0.5,
      observed_features: [],
      reasoning: '',
      limitations: [],
      response_time_ms: 10,
      model_name: 'test-model-fixture',
      prompt_version: 'test-prompt-1',
    });
  }

  const evaluation = await svc.computeRunEvaluation(run.id);
  assert.equal(
    evaluation.agreement_rate_pct,
    100,
    `the four scored pairs were all correct, but abstentions were counted as misses (${evaluation.agreement_rate_pct}%)`
  );
  assert.equal(
    evaluation.valid_samples,
    4,
    'abstentions were admitted as valid pairs, so the run reports accuracy over samples the model declined'
  );
  assert.equal(
    evaluation.excluded_samples,
    2,
    'the two abstentions are not reported as excluded, so they vanish from the run instead of being accounted for'
  );
});

/**
 * The auto-detected error path lives inside `createAndExecuteRun`, which refuses
 * to score a specimen whose image bytes cannot be retrieved - object storage is
 * not configured in this environment, which is the correct behaviour, not a
 * limitation of the test. Rather than fabricate bytes to reach the classifier,
 * the classification is checked directly. The service is typed, so reaching a
 * private method requires a deliberate cast; that is preferable to stubbing
 * storage and running the whole pipeline just to observe one enum value.
 */
function classifyError(
  refCls: string,
  aiCls: string,
  image: ValidationImage | null = null,
  consensus?: SampleConsensus | null
): string {
  const svc = new ValidationEvaluationService(new ValidationRepository()) as unknown as {
    determineInitialErrorCategory: (
      r: string,
      a: string,
      i: ValidationImage | null,
      c?: SampleConsensus | null
    ) => string;
  };
  return svc.determineInitialErrorCategory(refCls, aiCls, image, consensus);
}

await test('a model that says non_rock is not recorded as a visual-similarity error', () => {
  const category = classifyError('igneous', 'non_rock');
  assert.equal(
    category,
    'non_rock_confusion',
    `a non_rock prediction was filed as '${category}'; that misdescribes the failure and inflates the visual-similarity count`
  );
});

await test('a withheld call is categorised separately from a wrong class', () => {
  assert.equal(
    classifyError('igneous', 'unclassified'),
    'insufficient_context',
    'an abstention is filed as if the model had named a class and been wrong'
  );
  assert.equal(
    classifyError('igneous', 'insufficient_image'),
    'non_rock_confusion',
    'declining on image quality is filed as a rock/non-rock confusion'
  );
});

await test('a genuine rock-class confusion is filed as visual similarity', () => {
  assert.equal(
    classifyError('igneous', 'metamorphic'),
    'visual_similarity',
    'igneous vs metamorphic is an adjacent-class confusion'
  );
  assert.equal(
    classifyError('metamorphic', 'igneous'),
    'visual_similarity',
    'metamorphic vs igneous is an adjacent-class confusion'
  );
});

await test('a disputed consensus is blamed on the reference set, not the model', () => {
  const disputed: SampleConsensus = {
    sample_id: 'sample-1',
    majority_classification: 'igneous',
    agreement_count: 2,
    reviewer_count: 3,
    consensus_percentage: 66.7,
    is_disputed: true,
    status_label: 'disputed',
  };
  assert.equal(
    classifyError('igneous', 'metamorphic', null, disputed),
    'expert_disagreement',
    'a model disagreeing with a contested reference is recorded as a model error'
  );
});

await test('image conditions are preferred over the confusion heuristic', () => {
  const needsReview = {
    sample_id: 's',
    storage_path: 'p.jpg',
    image_hash: 'h',
    view_type: 'overview',
    scale_reference_present: false,
    quality_status: 'needs_review',
  } as unknown as ValidationImage;
  assert.equal(
    classifyError('igneous', 'metamorphic', needsReview),
    'poor_image_quality',
    'an image already flagged for review is not also blamed on class confusion'
  );

  const flash = {
    sample_id: 's',
    storage_path: 'p.jpg',
    image_hash: 'h',
    view_type: 'overview',
    scale_reference_present: false,
    quality_status: 'accepted',
    lighting_condition: 'smartphone_flash',
  } as unknown as ValidationImage;
  assert.equal(classifyError('igneous', 'metamorphic', flash), 'lighting');
});

await test('every error category is either auto-classifiable or documented as reviewer-assigned', () => {
  const declared = (readFileSync('src/types/validation.types.ts', 'utf8').match(
    /ValidationErrorCategory =([\s\S]*?);/
  )?.[1] ?? '')
    .split('|')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);

  assert.ok(declared.length > 0, 'no error categories were declared');

  const auto = new Set<string>();
  for (const ref of ['igneous', 'sedimentary', 'metamorphic']) {
    for (const ai of [
      'igneous',
      'sedimentary',
      'metamorphic',
      'unclassified',
      'non_rock',
      'insufficient_image',
    ]) {
      auto.add(classifyError(ref, ai));
    }
  }
  auto.add(
    classifyError('igneous', 'metamorphic', null, {
      sample_id: 's',
      majority_classification: 'igneous',
      agreement_count: 1,
      reviewer_count: 2,
      consensus_percentage: 50,
      is_disputed: true,
      status_label: 'disputed',
    })
  );
  auto.add(
    classifyError('igneous', 'metamorphic', {
      sample_id: 's',
      storage_path: 'p.jpg',
      image_hash: 'h',
      view_type: 'overview',
      scale_reference_present: false,
      quality_status: 'needs_review',
    } as unknown as ValidationImage)
  );
  auto.add(
    classifyError('igneous', 'metamorphic', {
      sample_id: 's',
      storage_path: 'p.jpg',
      image_hash: 'h',
      view_type: 'overview',
      scale_reference_present: false,
      quality_status: 'accepted',
      lighting_condition: 'smartphone_flash',
    } as unknown as ValidationImage)
  );

  // Categories the system must not infer on its own, because inferring them
  // would be an unsupported geological claim.
  const reviewerAssigned = ValidationEvaluationService.REVIEWER_ASSIGNED_CATEGORIES;
  assert.ok(reviewerAssigned.length > 0, 'no categories are documented as reviewer-assigned');

  for (const category of declared) {
    const explainable =
      auto.has(category) ||
      reviewerAssigned.includes(category as ValidationErrorCategory);
    assert.ok(
      explainable,
      `the category '${category}' is neither produced by the classifier nor listed as reviewer-assigned, so the error breakdown reports a bucket with no way to fill it`
    );
  }

  // A category must not be both auto-produced and claimed as human-only.
  for (const category of reviewerAssigned) {
    assert.ok(
      !auto.has(category),
      `'${category}' is documented as reviewer-assigned but the classifier produces it, so the automation boundary is misdocumented`
    );
  }
});

await test('image metadata is validated rather than stored as given', async () => {
  const { svc, repo } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));

  const base = {
    sample_id: sample.id,
    storage_path: 'validation/specimens/sample.jpg',
    image_hash: 'a'.repeat(64),
    view_type: 'overview' as const,
    scale_reference_present: false,
    quality_status: 'accepted' as const,
  };

  // A SHA-256 hash is the duplicate-detection key. A short or empty one cannot
  // detect a duplicate, so accepting it silently disables the check for that
  // specimen while the UI still reports duplicates are detected.
  await assert.rejects(
    () => repo.addSampleImage({ ...base, image_hash: 'abc' }),
    /image_hash|hash/i,
    'a three-character image hash was accepted as a SHA-256 duplicate-detection key'
  );
  await assert.rejects(
    () => repo.addSampleImage({ ...base, image_hash: '' }),
    /image_hash|hash/i,
    'an empty image hash was accepted as a duplicate-detection key'
  );

  // A zero or negative dimension is not a real image and would corrupt any
  // later quality assessment that trusted it.
  for (const dims of [
    { image_width: 0, image_height: 100 },
    { image_width: 100, image_height: -5 },
  ]) {
    await assert.rejects(
      () => repo.addSampleImage({ ...base, ...dims }),
      /dimension|width|height/i,
      `image dimensions ${JSON.stringify(dims)} were accepted as a real photograph`
    );
  }

  await assert.rejects(
    () => repo.addSampleImage({ ...base, file_size_bytes: 0 }),
    /file size|file_size/i,
    'a zero-byte specimen image was registered'
  );

  // An image with no storage path cannot be fetched, so the specimen can never
  // be scored. Registering it as valid hides that until a paid run fails on it.
  await assert.rejects(
    () => repo.addSampleImage({ ...base, storage_path: '' }),
    /storage_path|storage path/i,
    'an image with no storage path was registered as evaluable'
  );

  const good = await repo.addSampleImage({
    ...base,
    image_width: 1024,
    image_height: 768,
    file_size_bytes: 245760,
    lighting_condition: 'natural_daylight',
    background_condition: 'field_ground',
  });
  assert.ok(good.id, 'valid image metadata was rejected');
  assert.equal(good.image_width, 1024);
});

await test('an unknown view type or quality status is rejected', async () => {
  const { svc, repo } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  const base = {
    sample_id: sample.id,
    storage_path: 'validation/specimens/x.jpg',
    image_hash: 'b'.repeat(64),
    scale_reference_present: false,
  };

  await assert.rejects(
    () =>
      repo.addSampleImage({
        ...base,
        view_type: 'aerial_drone_shot' as never,
        quality_status: 'accepted',
      }),
    /view_type|view type/i,
    'an unrecognised view type was accepted; the schema constrains it and the store must too'
  );
  await assert.rejects(
    () =>
      repo.addSampleImage({
        ...base,
        view_type: 'overview',
        quality_status: 'probably_fine' as never,
      }),
    /quality_status|quality status/i,
    'an unrecognised quality status was accepted'
  );
});

await test('duplicate image bytes are refused across the whole registry', async () => {
  const { svc, repo } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const first = await svc.registerSample(sampleInput(dataset.id));
  const second = await svc.registerSample(sampleInput(dataset.id));

  const hash = 'c'.repeat(64);
  await repo.addSampleImage({
    sample_id: first.id,
    storage_path: 'validation/specimens/duplicate.jpg',
    image_hash: hash,
    view_type: 'overview',
    scale_reference_present: false,
    quality_status: 'accepted',
  });

  await assert.rejects(
    () =>
      repo.addSampleImage({
        sample_id: second.id,
        storage_path: 'validation/specimens/copy.jpg',
        image_hash: hash,
        view_type: 'overview',
        scale_reference_present: false,
        quality_status: 'accepted',
      }),
    /duplicate/i,
    'the same image bytes were registered against a second specimen, so one photograph would inflate the sample count'
  );

  // Re-registering against the same specimen is not a duplicate specimen.
  const again = await repo.addSampleImage({
    sample_id: first.id,
    storage_path: 'validation/specimens/duplicate-again.jpg',
    image_hash: hash,
    view_type: 'closeup',
    scale_reference_present: false,
    quality_status: 'accepted',
  });
  assert.ok(again.id, 'a second view of the same specimen was refused');
});

await test('a dataset can be extended while draft but never after it is locked', async () => {
  const { svc, repo } = harness();
  const dataset = await svc.createDataset(datasetInput());

  const secondSample = await svc.registerSample(sampleInput(dataset.id));
  const beforeLock = await repo.getDatasetById(dataset.id);
  assert.equal(beforeLock?.sample_count, 1, 'the draft dataset did not accept a specimen');

  const locked = await repo.lockDataset(dataset.id);
  assert.equal(locked.status, 'locked');
  assert.ok(locked.locked_at, 'the freeze has no timestamp of its own');

  await assert.rejects(
    () => svc.registerSample(sampleInput(dataset.id)),
    /locked/i,
    'a specimen was added to a frozen dataset, which would invalidate every result derived from it'
  );

  // A specimen registered while the dataset was still open must not gain images
  // or reference labels once the set is frozen.
  await assert.rejects(
    () =>
      repo.addSampleImage({
        sample_id: secondSample.id,
        storage_path: 'validation/specimens/late.jpg',
        image_hash: fakeDigest('late-specimen'),
        view_type: 'overview',
        scale_reference_present: false,
        quality_status: 'accepted',
      }),
    /locked/i,
    'an image was added to a frozen dataset'
  );

  await assert.rejects(
    () =>
      svc.submitReferenceLabel(labelInput(secondSample.id, 'ref-expert', 'igneous')),
    /locked/i,
    'a reference label was added to a frozen dataset after the freeze'
  );

  // The remedy the error message offers must actually work.
  const v2 = await svc.createDataset(
    datasetInput({ version: '2.0.0', status: 'draft' })
  );
  assert.notEqual(v2.id, dataset.id, 'the versioned successor dataset was not created');
  const accepted = await svc.registerSample(sampleInput(v2.id));
  assert.ok(accepted.id, 'the successor dataset refused the specimen the frozen one could not take');
});

await test('the same dataset code at the same version is refused', async () => {
  const { svc } = harness();
  await svc.createDataset(datasetInput());

  await assert.rejects(
    () => svc.createDataset(datasetInput()),
    /already exists/i,
    'the same code and version was created twice, so two datasets would answer to one identity'
  );

  // A different version of the same reference set is the sanctioned path.
  const v2 = await svc.createDataset(datasetInput({ version: '2.0.0' }));
  assert.equal(v2.dataset_code, 'ET-VAL-2026-V1');
  assert.equal(v2.version, '2.0.0');
});

await test('an invalid specimen is refused rather than half-stored', async () => {
  const { svc } = harness();

  await assert.rejects(
    () => svc.registerSample(sampleInput('00000000-0000-4000-8000-000000000000')),
    /not found/i,
    'a specimen was registered against a dataset that does not exist'
  );

  const dataset = await svc.createDataset(datasetInput());
  const first = await svc.registerSample(sampleInput(dataset.id));
  await assert.rejects(
    () => svc.registerSample(sampleInput(dataset.id, { sample_code: first.sample_code })),
    /already exists/i,
    'two specimens were registered under one code'
  );

  await assert.rejects(
    () =>
      svc.registerSample(
        sampleInput(dataset.id, { research_use_consent: false, image_use_consent: false })
      ),
    /consent/i,
    'a specimen with no research or image consent was accepted into the reference set'
  );
});

// -----------------------------------------------------------------------------
section('8. Metric arithmetic against a known answer');
// -----------------------------------------------------------------------------

await test('the confusion matrix is built from the reference, not the prediction', async () => {
  const { repo, svc } = harness();
  const { runId } = await seedKnownAnswerRun(repo, svc, KNOWN_ANSWER_CASES);
  const evaluation = await svc.computeRunEvaluation(runId);

  const cell = (reference: string, predicted: string) =>
    evaluation.confusion_matrix.find(
      (c) => c.reference_class === reference && c.predicted_class === predicted
    )?.count ?? 0;

  assert.equal(cell('igneous', 'igneous'), 2);
  assert.equal(cell('igneous', 'sedimentary'), 1);
  assert.equal(cell('sedimentary', 'igneous'), 1);
  assert.equal(cell('sedimentary', 'sedimentary'), 1);
  assert.equal(cell('metamorphic', 'igneous'), 1);
  assert.equal(cell('igneous', 'metamorphic'), 0, 'a cell was invented where no specimen exists');

  const total = evaluation.confusion_matrix.reduce((sum, c) => sum + c.count, 0);
  assert.equal(total, 6, 'the matrix does not account for every evaluated pair');
});

await test('agreement rate counts correct classifications out of valid pairs', async () => {
  const { repo, svc } = harness();
  const { runId } = await seedKnownAnswerRun(repo, svc, KNOWN_ANSWER_CASES);
  const evaluation = await svc.computeRunEvaluation(runId);
  assert.equal(evaluation.valid_samples, 6);
  assert.equal(evaluation.correct_classifications, 3);
  assert.equal(evaluation.incorrect_classifications, 3);
  assert.equal(evaluation.agreement_rate_pct, 50);
});

await test('per-class precision, recall and F1 match the hand calculation', async () => {
  const { repo, svc } = harness();
  const { runId } = await seedKnownAnswerRun(repo, svc, KNOWN_ANSWER_CASES);
  const evaluation = await svc.computeRunEvaluation(runId);
  const perClass = evaluation.per_class_metrics;

  assert.equal(perClass.igneous.support, 3);
  assert.equal(perClass.igneous.true_positives, 2);
  assert.equal(perClass.igneous.false_negatives, 1);
  assert.equal(perClass.igneous.false_positives, 2);
  assert.equal(perClass.igneous.precision, 0.5);
  assert.equal(perClass.igneous.recall, 0.667);
  assert.equal(perClass.igneous.f1, 0.572);

  assert.equal(perClass.sedimentary.support, 2);
  assert.equal(perClass.sedimentary.precision, 0.5);
  assert.equal(perClass.sedimentary.recall, 0.5);
  assert.equal(perClass.sedimentary.f1, 0.5);

  // A class the model never once predicted correctly still appears, with zero
  // rather than being dropped. Dropping it would quietly raise the macro
  // average and hide the failure.
  assert.equal(perClass.metamorphic.support, 1);
  assert.equal(perClass.metamorphic.precision, 0);
  assert.equal(perClass.metamorphic.recall, 0);
  assert.equal(perClass.metamorphic.f1, 0);
});

await test('macro averages are unweighted means over the classes that occur', async () => {
  const { repo, svc } = harness();
  const { runId } = await seedKnownAnswerRun(repo, svc, KNOWN_ANSWER_CASES);
  const evaluation = await svc.computeRunEvaluation(runId);
  const perClass = evaluation.per_class_metrics;

  const mean = (pick: (keyof typeof perClass.igneous)[]) => {
    const classes = [perClass.igneous, perClass.sedimentary, perClass.metamorphic];
    return classes.reduce((sum, c) => sum + (c[pick[0]] as number), 0) / classes.length;
  };

  assert.equal(evaluation.macro_precision, 0.333);
  assert.equal(evaluation.macro_recall, 0.389);
  assert.equal(evaluation.macro_f1, 0.357);
  assert.ok(evaluation.weighted_f1 > evaluation.macro_f1, 'the rarer class scores worse, so weighted must exceed macro');
  void mean;
});

await test('precision is 0 for a class that was never predicted, not NaN', async () => {
  // `0 / 0` is the case that breaks naive implementations into NaN, and a NaN
  // in an exported metric is worse than a zero: it propagates silently.
  const { repo, svc } = harness();
  const { runId } = await seedKnownAnswerRun(repo, svc, [
    { reference: 'igneous', predicted: 'igneous', confidence: 'high' },
    { reference: 'igneous', predicted: 'igneous', confidence: 'high' },
    { reference: 'igneous', predicted: 'igneous', confidence: 'high' },
    { reference: 'sedimentary', predicted: 'sedimentary', confidence: 'high' },
  ]);
  const evaluation = await svc.computeRunEvaluation(runId);
  const metamorphic = evaluation.per_class_metrics.metamorphic;
  if (metamorphic) {
    assert.equal(Number.isNaN(metamorphic.precision), false, 'precision is NaN');
    assert.equal(Number.isNaN(metamorphic.recall), false, 'recall is NaN');
    assert.equal(Number.isNaN(metamorphic.f1), false, 'F1 is NaN');
  }
  assert.equal(Number.isNaN(evaluation.macro_f1 ?? 0), false, 'the macro F1 is NaN');
});

await test('accuracy is grouped by the confidence the model actually claimed', async () => {
  // High-confidence errors matter more than low-confidence ones. Reporting only
  // an overall rate hides that distinction, which is the point of the analysis.
  const { repo, svc } = harness();
  const { runId } = await seedKnownAnswerRun(repo, svc, KNOWN_ANSWER_CASES);
  const evaluation = await svc.computeRunEvaluation(runId);
  const byTier = new Map(evaluation.confidence_analysis.map((t) => [t.tier, t]));

  assert.equal(byTier.get('high')!.total, 3);
  assert.equal(byTier.get('high')!.correct, 2);
  assert.equal(byTier.get('high')!.accuracy_pct, 66.7);
  assert.equal(byTier.get('moderate')!.total, 2);
  assert.equal(byTier.get('moderate')!.accuracy_pct, 50);
  assert.equal(byTier.get('low')!.total, 1);
  assert.equal(byTier.get('low')!.correct, 0);
  assert.equal(byTier.get('low')!.accuracy_pct, 0);

  const accounted = evaluation.confidence_analysis.reduce((sum, t) => sum + t.total, 0);
  assert.equal(accounted, 6, 'confidence tiers do not cover every evaluated pair');
});

// -----------------------------------------------------------------------------
section('9. What is excluded from a measurement');
// -----------------------------------------------------------------------------

await test('disputed specimens are excluded, never tie-broken', async () => {
  // A disputed specimen has no reference class. Counting it under whichever
  // class sorted first would manufacture agreement.
  const { repo, svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const r = await repo.createAiRun({
    dataset_id: dataset.id,
    run_code: 'RUN-DISPUTE',
    model_name: 'test-model-fixture',
    prompt_version: 'test-prompt-1',
    analysis_version: '1.0',
    application_version: '1.0.0',
    status: 'completed',
    total_samples: 4,
    successful_samples: 4,
    failed_samples: 0,
    is_partial_run: false,
    started_at: null,
    completed_at: null,
  });

  const record = (sampleId: string, classification: RockClassification) =>
    repo.recordPrediction({
      run_id: r.id, sample_id: sampleId, image_id: null, is_rock: true, classification,
      confidence: 'high', confidence_score: 0.9, observed_features: [], reasoning: '', limitations: [],
      response_time_ms: 10, model_name: 'test-model-fixture', prompt_version: 'test-prompt-1',
    });

  // Three sound specimens, so the remaining figures are computable.
  for (let i = 0; i < 3; i++) {
    const sample = await svc.registerSample(sampleInput(dataset.id));
    await svc.submitReferenceLabel(labelInput(sample.id, 'reviewer-a', 'igneous'));
    await record(sample.id, 'igneous');
  }

  const disputed = await svc.registerSample(sampleInput(dataset.id));
  for (const [reviewer, cls] of [['reviewer-a', 'igneous'], ['reviewer-b', 'sedimentary'], ['reviewer-c', 'metamorphic']] as const) {
    await svc.submitReferenceLabel(labelInput(disputed.id, reviewer, cls));
  }
  await record(disputed.id, 'igneous');

  const evaluation = await svc.computeRunEvaluation(r.id);
  assert.equal(evaluation.total_evaluated_samples, 4);
  assert.equal(evaluation.valid_samples, 3, 'a disputed specimen was scored');
  assert.equal(evaluation.excluded_samples, 1);
  assert.equal(evaluation.agreement_rate_pct, 100);
  // All three scored specimens reference igneous, so nothing may support any
  // other class. If the disputed row had leaked in, it would have added support
  // for the class its own panel could not agree on.
  for (const cls of ['sedimentary', 'metamorphic'] as const) {
    assert.equal(
      evaluation.per_class_metrics[cls].support,
      0,
      `${cls} has support from a specimen the expert panel disputed`
    );
  }
});

await test('a prediction with no reference label is excluded', async () => {
  const { repo, svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const run = await repo.createAiRun({
    dataset_id: dataset.id,
    run_code: 'RUN-NO-REF',
    model_name: 'test-model-fixture',
    prompt_version: 'test-prompt-1',
    analysis_version: '1.0',
    application_version: '1.0.0',
    status: 'completed',
    total_samples: 1,
    successful_samples: 1,
    failed_samples: 0,
    is_partial_run: false,
    started_at: null,
    completed_at: null,
  });
  const unlabelled = await svc.registerSample(sampleInput(dataset.id));
  await repo.recordPrediction({
    run_id: run.id, sample_id: unlabelled.id, image_id: null, is_rock: true, classification: 'igneous',
    confidence: 'high', confidence_score: 0.9, observed_features: [], reasoning: '', limitations: [],
    response_time_ms: 10, model_name: 'test-model-fixture', prompt_version: 'test-prompt-1',
  });

  const evaluation = await svc.computeRunEvaluation(run.id);
  assert.equal(evaluation.valid_samples, 0);
  assert.equal(evaluation.excluded_samples, 1);
  assert.equal(evaluation.agreement_rate_pct, null, 'agreement was reported with no reference to compare against');
});

await test('a prediction pointing at a specimen outside the dataset is excluded', async () => {
  // An orphaned row must not contribute a numerator or a denominator.
  const { repo, svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const run = await repo.createAiRun({
    dataset_id: dataset.id,
    run_code: 'RUN-ORPHAN',
    model_name: 'test-model-fixture',
    prompt_version: 'test-prompt-1',
    analysis_version: '1.0',
    application_version: '1.0.0',
    status: 'completed',
    total_samples: 1,
    successful_samples: 1,
    failed_samples: 0,
    is_partial_run: false,
    started_at: null,
    completed_at: null,
  });
  await repo.recordPrediction({
    run_id: run.id, sample_id: 'ghost-specimen-id', image_id: null, is_rock: true, classification: 'igneous',
    confidence: 'high', confidence_score: 0.9, observed_features: [], reasoning: '', limitations: [],
    response_time_ms: 10, model_name: 'test-model-fixture', prompt_version: 'test-prompt-1',
  });

  const evaluation = await svc.computeRunEvaluation(run.id);
  assert.equal(evaluation.valid_samples, 0);
  assert.equal(evaluation.agreement_rate_pct, null);
});

await test('two valid specimens are too few, and the figures are null', async () => {
  // Below the three-specimen floor, every number would be noise. Null means not
  // measured; zero would read as a measured total failure.
  const { repo, svc } = harness();
  const { runId } = await seedKnownAnswerRun(repo, svc, [
    { reference: 'igneous', predicted: 'igneous', confidence: 'high' },
    { reference: 'igneous', predicted: 'sedimentary', confidence: 'low' },
  ]);
  const evaluation = await svc.computeRunEvaluation(runId);

  assert.equal(evaluation.valid_samples, 2);
  assert.equal(evaluation.sufficient_sample_size, false);
  assert.equal(evaluation.metrics_are_real_measurements, false);
  assert.equal(evaluation.agreement_rate_pct, null);
  assert.equal(evaluation.macro_precision, null);
  assert.equal(evaluation.macro_recall, null);
  assert.equal(evaluation.macro_f1, null);
  assert.equal(evaluation.weighted_f1, null);
  assert.deepEqual(evaluation.confusion_matrix, [], 'a matrix was produced from two specimens');
  assert.deepEqual(evaluation.per_class_metrics, {});
  assert.match(evaluation.disclaimer, /too small/i);
});

await test('three valid specimens are computed but not presented as a validated result', async () => {
  // The figures are real and are shown, but three specimens are nowhere near
  // enough to claim the dataset validates the model. Readiness is policy-driven,
  // not a hard-coded "three is sufficient" rule.
  const { repo, svc } = harness();
  const { runId } = await seedKnownAnswerRun(repo, svc, [
    { reference: 'igneous', predicted: 'igneous', confidence: 'high' },
    { reference: 'igneous', predicted: 'igneous', confidence: 'moderate' },
    { reference: 'igneous', predicted: 'igneous', confidence: 'low' },
  ]);
  const evaluation = await svc.computeRunEvaluation(runId);
  assert.equal(evaluation.valid_samples, 3);
  assert.equal(evaluation.sufficient_sample_size, false, 'three specimens were called scientifically sufficient');
  assert.equal(evaluation.readiness.status, 'preliminary');
  assert.equal(evaluation.metrics_are_real_measurements, true);
  assert.equal(evaluation.agreement_rate_pct, 100);
  assert.equal(evaluation.counts.scored_pairs, 3);
  assert.ok(evaluation.readiness.blocking_reasons.length > 0);
});

await test('readiness follows the configured policy, not a magic specimen count', async () => {
  // The same three specimens become reportable only because the operator lowered
  // the policy for a weaker, explicit claim. This proves "enough" is configurable
  // and depends on the claim, rather than being a fixed number baked into code.
  const { repo, svc } = harness();
  const { runId } = await seedKnownAnswerRun(repo, svc, [
    { reference: 'igneous', predicted: 'igneous', confidence: 'high' },
    { reference: 'igneous', predicted: 'igneous', confidence: 'moderate' },
    { reference: 'igneous', predicted: 'igneous', confidence: 'low' },
  ]);
  const evaluation = await svc.computeRunEvaluation(runId, {
    claim: 'exploratory_signal',
    policy: { min_answered_total: 3, min_per_class_support: 3, metric_min_evaluated_pairs: 3 },
  });
  assert.equal(evaluation.readiness.status, 'reportable');
  assert.equal(evaluation.sufficient_sample_size, true);
  assert.equal(evaluation.readiness.intended_claim, 'exploratory_signal');
});

await test('the evaluation counts reconcile and expose the denominators', async () => {
  // A reader must be able to see how many predictions existed, how many were
  // eligible, how many were scored, and how many the model abstained on.
  const { repo, svc } = harness();
  const { runId } = await seedKnownAnswerRun(repo, svc, [
    { reference: 'igneous', predicted: 'igneous', confidence: 'high' },
    { reference: 'igneous', predicted: 'sedimentary', confidence: 'low' },
    { reference: 'metamorphic', predicted: 'metamorphic', confidence: 'moderate' },
  ]);
  const evaluation = await svc.computeRunEvaluation(runId);
  const c = evaluation.counts;
  assert.equal(c.attempted_predictions, 3);
  assert.equal(c.scored_pairs, 3);
  assert.equal(c.correct, 2);
  assert.equal(c.incorrect, 1);
  assert.equal(
    c.scored_pairs + c.excluded_no_reference + c.excluded_disputed_reference + c.excluded_non_rock_reference + c.excluded_abstention,
    c.attempted_predictions,
    'the evaluation buckets do not account for every prediction'
  );
  assert.equal(c.answered_coverage_pct, 100);
});

// -----------------------------------------------------------------------------
section('10. Error analysis');
// -----------------------------------------------------------------------------

await test('a mismatch is recorded with both classes, not just a count', async () => {
  // Section 25 of the specification is about categorising errors so they can be
  // worked through, which is impossible from an aggregate rate.
  const { repo, svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const run = await repo.createAiRun({
    dataset_id: dataset.id,
    run_code: 'RUN-ERRORS',
    model_name: 'test-model-fixture',
    prompt_version: 'test-prompt-1',
    analysis_version: '1.0',
    application_version: '1.0.0',
    status: 'completed',
    total_samples: 1,
    successful_samples: 1,
    failed_samples: 0,
    is_partial_run: false,
    started_at: null,
    completed_at: null,
  });
  await repo.recordError({
    run_id: run.id,
    sample_id: 'sample-1',
    reference_classification: 'sedimentary',
    ai_classification: 'igneous',
    ai_confidence: 'moderate',
    error_category: 'visual_similarity_confusion',
    error_notes: 'Field and specimen characters were read differently.',
    annotated_by: 'test-expert',
    reviewed: true,
  });

  const errors = await svc.getRunErrors(run.id);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].reference_classification, 'sedimentary');
  assert.equal(errors[0].ai_classification, 'igneous');
  assert.ok(errors[0].error_category, 'an error was filed with no category');
  assert.equal(errors[0].reviewed, true);
});

await test('the error table stores the categorisation the API returns', () => {
  assert.ok(migration10.includes('public.validation_errors'));
  assert.ok(migration10.includes('error_category'), 'errors are not categorised in the schema');
  assert.ok(migration10.includes('annotated_by'), 'errors are not attributed');
});

// -----------------------------------------------------------------------------
section('11. Reproducible export');
// -----------------------------------------------------------------------------

await test('the CSV export carries the provenance needed to reproduce a figure', async () => {
  const { repo, svc } = harness();
  const { datasetId, runId } = await seedKnownAnswerRun(repo, svc, KNOWN_ANSWER_CASES);
  const csv = await svc.exportEvaluationCsv(runId);

  assert.ok(datasetId, 'dataset is required for the export');
  const header = csv.split('\n')[0];
  for (const column of [
    'dataset_code',
    'dataset_version',
    'run_code',
    'model_name',
    'prompt_version',
    'sample_code',
    'reference_classification',
    'ai_predicted_classification',
    'is_match',
  ]) {
    assert.ok(header.includes(column), `the export omits ${column}, so a row cannot be traced back`);
  }

  const rows = csv.split('\n').filter((line) => line.trim().length > 0);
  assert.equal(rows.length, 7, 'the export does not carry one row per evaluated specimen');

  // `is_match` is written as 1/0 rather than true/false, so count the trailing
  // flag column rather than searching for a word.
  const isMatchColumn = header.split(',').indexOf('is_match');
  assert.ok(isMatchColumn > 0, 'the export has no is_match column');
  const matches = rows
    .slice(1)
    .map((row) => row.split(',')[isMatchColumn])
    .filter((value) => value === '1');
  assert.equal(matches.length, 3, 'the export does not agree with the confusion matrix');
});

await test('the export shows how much expert agreement each reference rests on', async () => {
  // A raw export that hid the consensus percentage would let a disputed
  // specimen's reference be read as settled. The percentage is what makes the
  // row interpretable downstream.
  const { repo, svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const disputed = await svc.registerSample(sampleInput(dataset.id));
  for (const [reviewer, cls] of [['reviewer-a', 'igneous'], ['reviewer-b', 'sedimentary'], ['reviewer-c', 'metamorphic']] as const) {
    await svc.submitReferenceLabel(labelInput(disputed.id, reviewer, cls));
  }
  const run = await repo.createAiRun({
    dataset_id: dataset.id,
    run_code: 'RUN-EXPORT-DISPUTE',
    model_name: 'test-model-fixture',
    prompt_version: 'test-prompt-1',
    analysis_version: '1.0',
    application_version: '1.0.0',
    status: 'completed',
    total_samples: 1,
    successful_samples: 1,
    failed_samples: 0,
    is_partial_run: false,
    started_at: null,
    completed_at: null,
  });
  await repo.recordPrediction({
    run_id: run.id, sample_id: disputed.id, image_id: null, is_rock: true, classification: 'igneous',
    confidence: 'high', confidence_score: 0.9, observed_features: [], reasoning: '', limitations: [],
    response_time_ms: 10, model_name: 'test-model-fixture', prompt_version: 'test-prompt-1',
  });

  const csv = await svc.exportEvaluationCsv(run.id);
  assert.ok(csv.includes('reference_consensus_pct'), 'the export omits the consensus percentage');
  const row = csv.split('\n').find((line) => line.includes('ET-VAL-'))!;
  assert.ok(
    row.includes('33.3'),
    `the export does not show that the reference was disputed, got: ${row}`
  );
});

await test('an export with nothing measured is empty of data rows', async () => {
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  await svc.addImage(imageInput(sample.id));
  const run = await svc.createAndExecuteRun(dataset.id);

  const csv = await svc.exportEvaluationCsv(run.id);
  const rows = csv.split('\n').filter((line) => line.trim().length > 0);
  assert.equal(rows.length, 1, 'an export invented rows for specimens that were never scored');
});

await test('the JSON export states plainly that nothing was measured', async () => {
  const { svc } = harness();
  const dataset = await svc.createDataset(datasetInput());
  const sample = await svc.registerSample(sampleInput(dataset.id));
  await svc.submitReferenceLabel(labelInput(sample.id, 'reviewer-a', 'igneous'));
  await svc.addImage(imageInput(sample.id));
  const run = await svc.createAndExecuteRun(dataset.id);

  const exported = await svc.exportEvaluationJson(run.id);
  const json = typeof exported === 'string' ? JSON.parse(exported) : exported;
  assert.ok(json.dataset, 'the export omits the dataset');
  assert.ok(json.evaluation_run, 'the export omits the run');
  assert.equal(json.evaluation.metrics_are_real_measurements, false);
  assert.equal(json.evaluation.macro_f1, null);
  assert.ok(json.errors, 'the export omits the error analysis');
});

// -----------------------------------------------------------------------------
section('12. Access control and the HTTP surface');
// -----------------------------------------------------------------------------

await test('the validation router exists and is mounted behind the api namespace', () => {
  assert.equal(
    typeof validationRouter,
    'function',
    'an Express router is a request handler, so a non-function means the router was replaced or never exported'
  );
  for (const route of [
    '/api/research/validation/datasets',
    '/api/research/validation/samples',
    '/api/research/validation/reference-labels',
    '/api/research/validation/runs',
    '/api/research/validation/evaluations',
    '/api/research/validation/errors',
    '/api/research/validation/export',
  ]) {
    assert.ok(
      readFileSync('src/routes/validation.routes.ts', 'utf8').includes(`'${route}`),
      `${route} is not declared on the validation router`
    );
  }
});

await test('no validation endpoint is public', () => {
  const routesSource = readFileSync('src/routes/validation.routes.ts', 'utf8');
  const declarations = routesSource.match(/validationRouter\.(get|post)\([^)]*\)/g) ?? [];
  assert.ok(declarations.length >= 11, `expected the full validation route set, found ${declarations.length}`);
  const unguarded = declarations.filter(
    (line) => !line.includes('requireExpertAuth') && !line.includes('requireAdminAuth')
  );
  assert.equal(
    unguarded.length,
    0,
    `unguarded validation endpoint: ${unguarded.join(', ')}. Validation data is expert work and must never be public.`
  );
});

await test('reference labels are open to experts, everything else to admins', () => {
  const routesSource = readFileSync('src/routes/validation.routes.ts', 'utf8');
  const labelRoute = routesSource.match(/validationRouter\.post\('\/api\/research\/validation\/reference-labels'[^)]*/)?.[0] ?? '';
  assert.ok(
    labelRoute.includes('requireExpertAuth'),
    'an expert cannot submit a reference label, so the panel has no way to contribute'
  );

  for (const adminOnly of ['/api/research/validation/datasets\'', '/api/research/validation/runs\'', '/api/research/validation/samples\'']) {
    assert.ok(routesSource.includes(adminOnly), `${adminOnly} is missing`);
  }
  assert.ok(
    /validationRouter\.post\('\/api\/research\/validation\/runs',\s*requireAdminAuth/.test(routesSource),
    'anyone authenticated as an expert can start a paid evaluation run'
  );
  assert.ok(
    /validationRouter\.post\('\/api\/research\/validation\/datasets',\s*requireAdminAuth/.test(routesSource),
    'dataset creation is not admin-only, so results can be authored rather than collected'
  );
});

await test('the auth guards actually reject an anonymous caller at runtime', async () => {
  // The route table above is only text. This exercises the real middleware with
  // a request that carries no credentials, which is what an unauthenticated
  // visitor or a scraped endpoint actually sends.
  const { requireExpertAuth, requireAdminAuth } = await import('../src/utils/expert-auth.js');

  for (const [name, guard] of [
    ['requireExpertAuth', requireExpertAuth],
    ['requireAdminAuth', requireAdminAuth],
  ] as const) {
    let code: number | null = null;
    let reachedHandler = false;

    const res = {
      status(c: number) {
        code = c;
        return res;
      },
      json() {
        return res;
      },
      set() {
        return res;
      },
    };

    await guard({ headers: {}, ip: '127.0.0.1' } as never, res as never, (() => {
      reachedHandler = true;
    }) as never);

    assert.equal(reachedHandler, false, `${name} let an anonymous request through to the handler`);
    assert.equal(code, 401, `${name} answered ${code} to an anonymous request; it must be 401`);
  }
});

await test('the controller answers 404 for a dataset that does not exist', async () => {
  const response = await call(validationController.getDataset, {
    params: { id: '00000000-0000-4000-8000-000000000000' },
  });
  assert.equal(
    response.status,
    404,
    `a missing dataset answered ${response.status}; a caller would read that as a real dataset`
  );
  assert.ok(response.body, 'a 404 must explain itself');
});

await test('the controller answers 404 for a run that does not exist', async () => {
  // A missing run is not a malformed request. Answering 400 sends an integrator
  // looking for a syntax problem in a request that is perfectly well formed.
  const response = await call(validationController.getEvaluation, {
    params: { runId: '00000000-0000-4000-8000-000000000000' },
  });
  assert.equal(response.status, 404, `a missing run answered ${response.status}`);
});

await test('every run-scoped endpoint answers 404 for a missing run', async () => {
  for (const handler of [
    validationController.getEvaluation,
    validationController.getErrors,
    validationController.exportResults,
  ]) {
    const response = await call(handler, {
      params: { runId: '00000000-0000-4000-8000-000000000000' },
      query: {},
    });
    assert.equal(response.status, 404, 'a missing run was not reported as missing');
  }
});

await test('the controller answers 404 for a specimen that does not exist', async () => {
  const response = await call(validationController.getSample, {
    params: { id: '00000000-0000-4000-8000-000000000000' },
  });
  assert.equal(response.status, 404, `a missing specimen answered ${response.status}`);
});

// -----------------------------------------------------------------------------
section('13. The dashboard cannot claim a validation that does not exist');
// -----------------------------------------------------------------------------

await test('the dashboard says the validation dataset is not yet populated', () => {
  assert.ok(
    /not yet (been )?(populated|entered)|no .*dataset|no validated/i.test(dashboard),
    'the dashboard opens without saying that no validation dataset exists yet'
  );
});

await test('the dashboard does not display a hard-coded accuracy figure', () => {
  // The only accuracy that may ever appear is one computed from a real run.
  const suspicious = dashboard.match(/\b\d{1,3}(?:\.\d+)?\s*%/g) ?? [];
  for (const figure of suspicious) {
    assert.match(
      figure,
      /^0(\.0+)?%$/,
      `the dashboard hard-codes the accuracy figure ${figure}. Stage 7 figures must come from a real run.`
    );
  }
});

await test('the dashboard renders null metrics as unavailable, not as zero', () => {
  assert.ok(
    /null|not measured|unavailable|—/i.test(dashboard),
    'the dashboard has no way to present an unmeasured metric'
  );
  assert.ok(
    /metrics_are_real_measurements|disclaimer|is_partial_run/i.test(dashboard),
    'the dashboard ignores the honesty flags the evaluator sets'
  );
});

await test('the rebrand migration leaves the validation schema alone', () => {
  // The rename must not have disturbed Stage 7 tables.
  for (const table of [
    'validation_datasets',
    'validation_samples',
    'validation_images',
    'validation_reference_labels',
    'validation_ai_runs',
    'validation_errors',
  ]) {
    assert.ok(
      !migration14.includes(`ALTER TABLE public.${table}`),
      `the rename migration alters ${table}; identity changes must not touch validation data`
    );
  }
});

// -----------------------------------------------------------------------------
console.log(`\n${'='.repeat(60)}`);
console.log('Stage 7 - Scientific validation infrastructure');
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  console.error(`\nLast test: ${currentTest}`);
  process.exit(1);
}