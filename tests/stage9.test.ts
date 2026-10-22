/**
 * Stage 9 - Geoscience taxonomy foundation tests.
 *
 * The platform stopped being rock-only: an observation is classified into a
 * category and subcategory before anything is interpreted. These tests pin the
 * rules that make that expansion safe:
 *
 *   1. Backward compatibility: existing rock fields keep their meaning and data,
 *      and every historical rock record still reads as a rock.
 *   2. Category integrity: a category/subcategory pair that is not registered is
 *      rejected rather than stored, and a subcategory cannot be borrowed from
 *      another category.
 *   3. Honest filtering: unknown filter values return nothing instead of
 *      silently returning everything.
 *   4. Honest counts: a category with no observations reports zero, never an
 *      omission and never an estimate.
 *   5. No fabricated content: no stage introduces reference geology, synthetic
 *      production data or unvalidated AI claims.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GEOSCIENCE_CATEGORIES,
  GEOSCIENCE_CATEGORY_LABELS,
  GEOSCIENCE_SUBCATEGORIES,
  ROCK_LIKE_CATEGORIES,
  PROHIBITED_CLAIM_FIELDS,
  findProhibitedClaims,
  isGeoscienceCategory,
  isSubcategoryOf,
  normalizeCategoryPair,
  defaultSubcategory,
} from '../src/ai/geoscience-taxonomy.js';
import { validatePublicFilters, listSubcategories } from '../src/utils/public-filters.js';
import { EVIDENCE_STATES } from '../src/types/community.types.js';
import { PublicObservationRepository } from '../src/repositories/public-observation.repository.js';

const migration = readFileSync('supabase/migrations/012_geoscience_taxonomy.sql', 'utf8');
const publicTypes = readFileSync('src/types/public.types.ts', 'utf8');
const publicRoutes = readFileSync('src/routes/public.routes.ts', 'utf8');

let passed = 0;
let failed = 0;
let currentTest = '';

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  currentTest = name;
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  PASS  ${name}`);
    })
    .catch((err: unknown) => {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  FAIL  ${name}`);
      console.error(`        ${message.split('\n').slice(0, 6).join('\n        ')}`);
    });
}

function section(title: string): void {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------------------
section('1. Taxonomy vocabulary');
// ---------------------------------------------------------------------------

await test('every category has a human label', () => {
  for (const category of GEOSCIENCE_CATEGORIES) {
    const label = GEOSCIENCE_CATEGORY_LABELS[category];
    assert.equal(typeof label, 'string', `${category} has no label`);
    assert.ok(label.trim().length > 0, `${category} has an empty label`);
  }
});

await test('every category keeps an explicit unknown or exit option', () => {
  // The AI must never be forced into a confident label it cannot support.
  for (const category of GEOSCIENCE_CATEGORIES) {
    const ids = GEOSCIENCE_SUBCATEGORIES[category].map((s) => s.id);
    assert.ok(ids.length > 0, `${category} has no subcategories`);

    const isHonestExit = (id: string) => id.startsWith('unknown') || id === category;
    assert.ok(
      ids.some(isHonestExit),
      `${category} has no unknown or exit subcategory`
    );

    // And the fallback must resolve to that honest option, never to a confident
    // detail such as "bedding" or "landslide".
    const fallback = defaultSubcategory(category);
    assert.ok(
      isHonestExit(fallback),
      `${category} falls back to the confident subcategory "${fallback}"`
    );
  }
});

await test('a category with an explicit unknown option never falls back to a detail', () => {
  // These categories have enough options that a wrong ordering would pick a
  // confident label instead of the unknown one.
  const cases: Array<[string, string]> = [
    ['rock', 'unknown_rock'],
    ['mineral', 'unknown_mineral'],
    ['fossil', 'unknown_fossil_like'],
    ['geological_layer', 'unknown_layer'],
    ['geological_structure', 'unknown_structure'],
    ['geomorphology', 'unknown_landform'],
    ['volcanic_feature', 'unknown_volcanic_feature'],
    ['hydrogeological_feature', 'unknown_hydro_feature'],
    ['mining_observation', 'unknown_mining_observation'],
    ['engineering_geology', 'unknown_engineering_feature'],
  ];
  for (const [category, expected] of cases) {
    assert.equal(defaultSubcategory(category as any), expected, `${category} fallback is wrong`);
  }
});

await test('subcategory ids are unique across the whole vocabulary', () => {
  // geoscience_subcategories.id is the primary key of that table, so a repeated
  // id would silently merge two different categories' subcategories.
  const seen = new Set<string>();
  for (const category of GEOSCIENCE_CATEGORIES) {
    for (const sub of GEOSCIENCE_SUBCATEGORIES[category]) {
      assert.ok(!seen.has(sub.id), `subcategory id ${sub.id} is used by two categories`);
      seen.add(sub.id);
      assert.match(sub.id, /^[a-z0-9_]+$/, `${sub.id} is not a snake_case id`);
      assert.ok(sub.label.trim().length > 0, `${sub.id} has an empty label`);
    }
  }
});

await test('isGeoscienceCategory accepts registered categories and rejects the rest', () => {
  assert.equal(isGeoscienceCategory('fossil'), true);
  assert.equal(isGeoscienceCategory('FOSSIL'), false, 'category check must be exact');
  assert.equal(isGeoscienceCategory('rock; drop table'), false);
  assert.equal(isGeoscienceCategory('meteorite'), false, 'unknown category must not pass');
  assert.equal(isGeoscienceCategory(undefined), false);
  assert.equal(isGeoscienceCategory(42), false);
});

await test('isSubcategoryOf refuses a subcategory borrowed from another category', () => {
  assert.equal(isSubcategoryOf('rock', 'igneous'), true);
  assert.equal(isSubcategoryOf('rock', 'landslide'), false);
  assert.equal(isSubcategoryOf('geomorphology', 'igneous'), false);
  assert.equal(isSubcategoryOf('geomorphology', 'landslide'), true);
  assert.equal(isSubcategoryOf('fossil', 'bedding'), false);
});

await test('normalizeCategoryPair keeps a valid pair and discards a mismatched subcategory', () => {
  const good = normalizeCategoryPair('fossil', 'trace_fossil');
  assert.equal(good.observation_category, 'fossil');
  assert.equal(good.observation_subcategory, 'trace_fossil');

  const mismatch = normalizeCategoryPair('fossil', 'igneous');
  assert.equal(mismatch.observation_category, 'fossil');
  assert.equal(
    mismatch.observation_subcategory,
    defaultSubcategory('fossil'),
    'a subcategory from another category must not survive'
  );

  const bogus = normalizeCategoryPair('meteorite', 'igneous');
  assert.equal(bogus.observation_category, 'unknown', 'an unregistered category must degrade to unknown');
  assert.equal(bogus.observation_subcategory, 'unknown');
});

await test('commercial and safety claims are blocked by field and by pattern', () => {
  assert.ok(PROHIBITED_CLAIM_FIELDS.length > 0);
  assert.ok(
    PROHIBITED_CLAIM_FIELDS.includes('primary_interpretation'),
    'the one-line interpretation is not screened'
  );

  const forbidden = [
    'This is gold.',
    'Confirmed ore deposit at this outcrop.',
    'A guaranteed deposit of rare earth minerals.',
    'The mineral grade here is 4 g per tonne.',
    'This is a valuable ruby, mine it now.',
    'Scientifically confirmed as labradorite.',
    'Safe to walk on, suitable for construction.',
  ];
  for (const text of forbidden) {
    const found = findProhibitedClaims(text);
    assert.ok(found.length > 0, `expected a prohibited claim to be caught in: ${text}`);
  }

  const allowed = [
    'A coarse-grained grey rock, possibly a granite. Not verified.',
    'Possible trace fossil in a bedding surface; the detail is too low to confirm.',
    'Landslide scar on a slope, with weathered material at the base.',
  ];
  for (const text of allowed) {
    assert.equal(findProhibitedClaims(text).length, 0, `cautious wording was blocked: ${text}`);
  }
});

await test('only rock-like categories are allowed to fill the rock analysis fields', () => {
  assert.equal(ROCK_LIKE_CATEGORIES.has('rock'), true);
  assert.equal(ROCK_LIKE_CATEGORIES.has('volcanic_feature'), true);

  // A fossil, a structure, a landform or a failed analysis must not be dressed
  // up in rock analysis fields.
  for (const notRockLike of [
    'fossil',
    'geological_structure',
    'geological_layer',
    'geomorphology',
    'hydrogeological_feature',
    'mining_observation',
    'engineering_geology',
    'other_geoscience',
    'unknown',
    'insufficient_image',
    'non_geoscience',
  ]) {
    assert.equal(
      ROCK_LIKE_CATEGORIES.has(notRockLike as any),
      false,
      `${notRockLike} must not be treated as a rock interpretation`
    );
  }
});

// ---------------------------------------------------------------------------
section('2. Database migration safety');
// ---------------------------------------------------------------------------

await test('migration adds taxonomy columns without dropping or retyping anything', () => {
  const added = [
    'observation_category',
    'observation_subcategory',
    'observation_type',
    'primary_interpretation',
    'geological_context',
    'community_status',
  ];
  for (const column of added) {
    assert.ok(
      migration.includes(`ADD COLUMN IF NOT EXISTS ${column}`),
      `${column} is not added defensively`
    );
  }

  assert.ok(!/DROP\s+COLUMN/i.test(migration), 'migration must not drop a column');
  assert.ok(
    !/ALTER\s+COLUMN\s+primary_classification\s+TYPE/i.test(migration),
    'primary_classification must keep its type'
  );
  assert.ok(
    !/RENAME\s+COLUMN/i.test(migration),
    'migration must not rename an existing column'
  );
});

await test('historical rock columns are preserved, not replaced', () => {
  for (const column of [
    'primary_classification',
    'possible_name',
    'confidence',
    'confidence_score',
    'observed_features',
    'reasoning',
    'limitations',
    'recommended_next_steps',
  ]) {
    assert.ok(migration.includes(column), `${column} is referenced by the migration`);
  }
  assert.ok(
    !/DROP\s+COLUMN\s+(IF\s+EXISTS\s+)?(primary_classification|possible_name|confidence)/i.test(
      migration
    ),
    'a legacy rock column is dropped'
  );
});

await test('existing completed observations are backfilled as rock, non-rock as non-geoscience', () => {
  assert.ok(
    /SET observation_category = 'rock'/.test(migration),
    'completed rock records are not backfilled'
  );
  assert.ok(
    migration.includes("AND primary_classification <> 'non_rock'"),
    'the rock backfill must exclude non-rock records'
  );
  assert.ok(
    /SET observation_category = 'non_geoscience'/.test(migration),
    'non-rock records must not be relabelled as rocks'
  );
});

await test('failed or pending observations are left uncategorised on purpose', () => {
  // Backfilling a category for an observation that was never interpreted would
  // be a fabrication, so the WHERE clauses must exclude non-completed rows.
  const backfills = migration.match(/UPDATE public\.observations[\s\S]*?;/g) || [];
  assert.ok(backfills.length >= 2, 'expected the category and non-geoscience backfills');
  for (const statement of backfills) {
    assert.ok(
      statement.includes("status = 'completed'"),
      'a backfill update is not restricted to completed observations'
    );
  }
});

await test('a subcategory cannot be stored under the wrong category', () => {
  assert.ok(
    migration.includes('enforce_subcategory_belongs_to_category'),
    'the subcategory/category trigger is missing'
  );
  assert.ok(
    migration.includes('CREATE TRIGGER trg_observations_subcategory_category'),
    'the trigger is not attached to the observations table'
  );
  assert.ok(
    migration.includes('s.category_id = NEW.observation_category'),
    'the trigger does not compare the subcategory owner with the row category'
  );
});

await test('taxonomy foreign keys are validated, not left as unenforced metadata', () => {
  assert.ok(
    /VALIDATE CONSTRAINT observations_observation_category_fk/.test(migration),
    'the category foreign key is never validated'
  );
  assert.ok(
    /VALIDATE CONSTRAINT observations_observation_subcategory_fk/.test(migration),
    'the subcategory foreign key is never validated'
  );
});

await test('the public view stops hiding non-rock observations', () => {
  const view = migration.slice(migration.indexOf('CREATE OR REPLACE VIEW public.public_observations'));
  assert.ok(view.includes('o.observation_category'), 'the public view does not expose the category');
  assert.ok(
    !/o\.is_rock\s*=\s*true/.test(view),
    'the public view still filters on is_rock, which hides every non-rock observation'
  );
  assert.ok(
    view.includes("o.publication_status = 'public'") && view.includes('l.is_public = true'),
    'publication and location privacy gates must remain'
  );
});

await test('the public view leaks no contributor identity, location or media path', () => {
  const view = migration.slice(migration.indexOf('CREATE OR REPLACE VIEW public.public_observations'));
  for (const forbidden of [
    'contributor_hash',
    'phone',
    'msisdn',
    'wa_id',
    'file_path',
    'capture_date',
  ]) {
    assert.ok(!view.includes(forbidden), `the public view exposes ${forbidden}`);
  }
  assert.ok(
    /WHEN l\.public_location_precision = 'exact' THEN l\.latitude/.test(view),
    'exact coordinates must stay gated behind an explicit exact precision'
  );
});

await test('migration seeds only the platform vocabulary, never reference geology', () => {
  assert.ok(
    migration.includes('INSERT INTO public.geoscience_categories'),
    'the category vocabulary is not seeded'
  );
  // Migration 012 is a historical applied migration and is deliberately left
  // unmodified by the Earth Talk rename (see migration 014), so it still
  // carries its original "Rock Talk" wording. This assertion pins that the
  // vocabulary tables described themselves as the platform's own vocabulary and
  // never as a geological dataset.
  assert.ok(
    /observation vocabulary/.test(migration),
    'the vocabulary tables are not documented as platform vocabulary'
  );
  // No place names, coordinates or formation claims.
  assert.ok(!/kigali|nyiragongo|karisoke|=-?\d+\.\d{4,}/i.test(migration), 'migration contains place or coordinate data');
});

// ---------------------------------------------------------------------------
section('3. Honest public filtering');
// ---------------------------------------------------------------------------

await test('category filter accepts a registered category', () => {
  const filters = validatePublicFilters({ category: 'fossil' });
  assert.equal(filters.category, 'fossil');
  assert.equal(filters.subcategory, undefined);
});

await test('an unregistered category is rejected, never passed through as a filter', () => {
  const filters = validatePublicFilters({ category: 'meteorite' });
  assert.equal(filters.category, undefined);
  assert.deepEqual(
    filters.rejectedFilters,
    ['category'],
    'an unknown category must be reported as rejected so the query returns nothing'
  );
});

await test('a subcategory from another category is rejected with its category filter', () => {
  const filters = validatePublicFilters({ category: 'fossil', subcategory: 'igneous' });
  assert.equal(filters.category, 'fossil');
  assert.equal(
    filters.subcategory,
    undefined,
    'a rock subcategory must not filter a fossil query'
  );
  assert.deepEqual(
    filters.rejectedFilters,
    ['subcategory'],
    'a mismatched subcategory must return nothing, not every fossil'
  );
});

await test('a subcategory without a category cannot be honoured and is rejected', () => {
  const filters = validatePublicFilters({ subcategory: 'landslide' });
  assert.equal(filters.subcategory, undefined);
  assert.deepEqual(filters.rejectedFilters, ['subcategory']);
});

await test('a matching category and subcategory survive validation', () => {
  const filters = validatePublicFilters({ category: 'geomorphology', subcategory: 'landslide' });
  assert.equal(filters.category, 'geomorphology');
  assert.equal(filters.subcategory, 'landslide');
});

await test('listSubcategories only returns subcategories of the requested category', () => {
  assert.ok(listSubcategories('geomorphology').includes('landslide'));
  assert.deepEqual(listSubcategories('meteorite'), []);
});

await test('evidence state and investigation status are validated', () => {
  // Every canonical state is accepted, including the two honest exits.
  for (const state of EVIDENCE_STATES) {
    assert.equal(
      validatePublicFilters({ evidence_state: state }).evidence_state,
      state,
      `${state} is a canonical evidence state and must be filterable`
    );
  }

  // `expert_verified` is a verification_status, not an evidence state. Accepting
  // it here would let a client filter on a vocabulary no observation row can hold
  // and silently get zero results.
  assert.equal(validatePublicFilters({ evidence_state: 'expert_verified' }).evidence_state, undefined);
  assert.equal(validatePublicFilters({ evidence_state: 'proven' }).evidence_state, undefined);
  assert.equal(validatePublicFilters({ community_status: 'open' }).community_status, 'open');
  assert.equal(validatePublicFilters({ community_status: 'solved' }).community_status, undefined);
});

await test('legacy rock filters still work for existing callers', () => {
  const filters = validatePublicFilters({ classification: 'igneous', confidence: 'moderate' });
  assert.equal(filters.classification, 'igneous');
  assert.equal(filters.confidence, 'moderate');
  assert.equal(validatePublicFilters({ classification: 'meteorite' }).classification, undefined);
});

await test('pagination and bounding box bounds are unchanged', () => {
  assert.equal(validatePublicFilters({ page: '0' }).page, 1);
  assert.equal(validatePublicFilters({ limit: '5000' }).limit, 100);

  const bbox = validatePublicFilters({ bbox: '29.0,-2.0,31.0,-1.0' }).bbox;
  assert.ok(bbox);
  assert.equal(bbox.minLon, 29);
  assert.equal(bbox.maxLat, -1);
  assert.equal(
    validatePublicFilters({ bbox: '31,-1,29,-2' }).bbox,
    undefined,
    'an inverted bounding box must be rejected'
  );
});

// ---------------------------------------------------------------------------
section('4. Repository behaviour with real filtering and honest counts');
// ---------------------------------------------------------------------------

function registerObservation(repo: PublicObservationRepository, over: Record<string, unknown>): void {
  repo.registerPublicObservation({
    passport_id: 'RW-0001',
    observation_category: 'rock',
    observation_subcategory: 'igneous',
    primary_interpretation: 'Coarse-grained grey rock, possibly granite.',
    primary_classification: 'igneous',
    possible_name: 'Possible granite',
    confidence: 'moderate',
    confidence_score: 60,
    verification_status: 'unverified',
    evidence_state: 'ai_assisted',
    community_status: 'not_started',
    district: 'Nyamagabe',
    public_location_precision: 'district',
    created_at: '2026-01-01T00:00:00.000Z',
    published_at: '2026-01-02T00:00:00.000Z',
    ...over,
  } as any);
}

await test('a fossil query returns the fossil and not the rock', async () => {
  const repo = new PublicObservationRepository();
  registerObservation(repo, { passport_id: 'RW-0001' });
  registerObservation(repo, {
    passport_id: 'RW-0002',
    observation_category: 'fossil',
    observation_subcategory: 'trace_fossil',
    primary_interpretation: 'Possible trace fossil in a bedding surface.',
    primary_classification: 'unclassified',
    possible_name: null,
  });

  const fossils = await repo.findPublicObservations(
    validatePublicFilters({ category: 'fossil' })
  );
  assert.equal(fossils.data.length, 1);
  assert.equal(fossils.data[0].passport_id, 'RW-0002');
  assert.equal(fossils.data[0].observation_category, 'fossil');
  assert.equal(fossils.data[0].observation_subcategory, 'trace_fossil');

  const rocks = await repo.findPublicObservations(validatePublicFilters({ category: 'rock' }));
  assert.equal(rocks.data.length, 1);
  assert.equal(rocks.data[0].passport_id, 'RW-0001');
});

await test('a subcategory filter narrows within its category', async () => {
  const repo = new PublicObservationRepository();
  registerObservation(repo, { passport_id: 'RW-0001' });
  registerObservation(repo, {
    passport_id: 'RW-0003',
    observation_category: 'geomorphology',
    observation_subcategory: 'landslide',
    primary_interpretation: 'Recent soil movement on a slope.',
    primary_classification: 'non_rock',
  });
  registerObservation(repo, {
    passport_id: 'RW-0004',
    observation_category: 'geomorphology',
    observation_subcategory: 'river_terrace',
    primary_interpretation: 'A flat step above the present river bed.',
    primary_classification: 'non_rock',
  });

  const slides = await repo.findPublicObservations(
    validatePublicFilters({ category: 'geomorphology', subcategory: 'landslide' })
  );
  assert.equal(slides.data.length, 1);
  assert.equal(slides.data[0].passport_id, 'RW-0003');
});

await test('search finds a non-rock observation by category, subcategory or interpretation', async () => {
  const repo = new PublicObservationRepository();
  registerObservation(repo, { passport_id: 'RW-0001' });
  registerObservation(repo, {
    passport_id: 'RW-0003',
    observation_category: 'geomorphology',
    observation_subcategory: 'landslide',
    primary_interpretation: 'Recent soil movement on a slope.',
    primary_classification: 'non_rock',
  });

  for (const term of ['landslide', 'geomorphology', 'soil movement']) {
    const found = await repo.findPublicObservations(validatePublicFilters({ search: term }));
    assert.equal(found.data.length, 1, `search for "${term}" should find the landform record`);
    assert.equal(found.data[0].passport_id, 'RW-0003');
  }
});

await test('an unknown category filter returns nothing rather than everything', async () => {
  const repo = new PublicObservationRepository();
  registerObservation(repo, { passport_id: 'RW-0001' });

  const found = await repo.findPublicObservations(validatePublicFilters({ category: 'meteorite' }));
  assert.equal(found.data.length, 0, 'an unknown category must not fall back to all records');
  assert.equal(found.pagination.total, 0);
});

await test('category counts report zero instead of omitting empty categories', async () => {
  const repo = new PublicObservationRepository();
  registerObservation(repo, { passport_id: 'RW-0001' });

  const counts = await repo.getPublicCategoryCounts();
  assert.equal(counts.length, GEOSCIENCE_CATEGORIES.length, 'every category must be reported');

  const rock = counts.find((c) => c.category === 'rock');
  assert.ok(rock);
  assert.equal(rock.observation_count, 1);

  const fossil = counts.find((c) => c.category === 'fossil');
  assert.ok(fossil, 'an empty category must still be reported');
  assert.equal(fossil.observation_count, 0, 'an empty category must report zero, not be dropped');
  assert.equal(fossil.label, GEOSCIENCE_CATEGORY_LABELS.fossil);

  // The list is ordered by real count, never by an invented total.
  assert.equal(counts[0].observation_count >= 1, true);
});

await test('an empty repository reports all zeros and no observations', async () => {
  const repo = new PublicObservationRepository();
  const counts = await repo.getPublicCategoryCounts();
  assert.equal(counts.length, GEOSCIENCE_CATEGORIES.length);
  for (const entry of counts) {
    assert.equal(entry.observation_count, 0, `${entry.category} invented a count`);
  }

  const found = await repo.findPublicObservations(validatePublicFilters({}));
  assert.equal(found.data.length, 0, 'an unpublished repository must return no observations');
});

await test('GeoJSON features carry the category so the map can style and filter by it', async () => {
  const repo = new PublicObservationRepository();
  registerObservation(repo, {
    passport_id: 'RW-0003',
    observation_category: 'geomorphology',
    observation_subcategory: 'landslide',
    primary_interpretation: 'Recent soil movement on a slope.',
    primary_classification: 'non_rock',
    public_location_precision: 'exact',
    latitude: -2.5,
    longitude: 29.75,
  });

  const geojson = await repo.findPublicObservationsGeoJson(validatePublicFilters({}));
  assert.equal(geojson.features.length, 1);
  const properties = geojson.features[0].properties;
  assert.equal(properties.observation_category, 'geomorphology');
  assert.equal(properties.observation_subcategory, 'landslide');
  assert.equal(properties.primary_interpretation, 'Recent soil movement on a slope.');
});

await test('private or district-only records never expose exact coordinates', async () => {
  const repo = new PublicObservationRepository();
  registerObservation(repo, {
    passport_id: 'RW-0009',
    public_location_precision: 'district',
    latitude: -2.5,
    longitude: 29.75,
  });

  const geojson = await repo.findPublicObservationsGeoJson(validatePublicFilters({}));
  const [lon, lat] = geojson.features[0].geometry.coordinates;
  assert.notEqual(lon, 29.75, 'a district-precision record leaked its longitude');
  assert.notEqual(lat, -2.5, 'a district-precision record leaked its latitude');
});

// ---------------------------------------------------------------------------
section('5. Public API surface');
// ---------------------------------------------------------------------------

await test('the categories endpoint is routed and returns every category', () => {
  assert.ok(
    publicRoutes.includes("'/api/public/categories'"),
    'the public categories endpoint is not routed'
  );
  assert.ok(
    publicTypes.includes('PublicCategoryCount'),
    'the public category count type is missing'
  );
  assert.ok(
    publicTypes.includes('observation_category'),
    'the public observation type does not expose the category'
  );
  assert.ok(
    publicTypes.includes('category?: string') && publicTypes.includes('subcategory?: string'),
    'the public filter type does not accept a category filter'
  );
});

console.log(`\n${'='.repeat(60)}`);
console.log(`Stage 9 - Geoscience taxonomy foundation`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  console.error(`\nLast test: ${currentTest}`);
  process.exit(1);
}