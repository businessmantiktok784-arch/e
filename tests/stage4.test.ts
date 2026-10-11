import assert from 'node:assert/strict';
import { validatePublicFilters } from '../src/utils/public-filters.js';
import {
  resolvePublicCoordinates,
  approximateCoordinates,
  normalizeDistrictName,
  RWANDA_DISTRICTS,
} from '../src/utils/public-location.js';
import { PublicObservationRepository } from '../src/repositories/public-observation.repository.js';
import { PublicObservationService } from '../src/services/public-observation.service.js';
import {
  SYNTHETIC_PUBLIC_OBSERVATIONS,
  SYNTHETIC_FIXTURE_NOTICE,
} from './fixtures/synthetic-observations.js';

console.log('--- Running Earth Talk Stage 4 Test Suite ---');

// SYNTHETIC_TEST_FIXTURE — NOT REAL GEOLOGICAL DATA
// The production repository intentionally starts empty. Fixtures are registered
// explicitly here so the assertions below test filtering/privacy logic against
// known inputs, never against data the platform pretends is real.
function createFixtureBackedRepository(): {
  repo: PublicObservationRepository;
  service: PublicObservationService;
} {
  const repo = new PublicObservationRepository();
  for (const fixture of SYNTHETIC_PUBLIC_OBSERVATIONS) {
    repo.registerPublicObservation(fixture);
  }
  return { repo, service: new PublicObservationService(repo) };
}

// Test 0: A production repository must NEVER fabricate observations
{
  const emptyRepo = new PublicObservationRepository();
  const emptyService = new PublicObservationService(emptyRepo);

  const result = await emptyService.getObservations({});
  assert.equal(
    result.data.length,
    0,
    'A repository with no real published records must return zero observations, never synthetic ones'
  );
  assert.equal(result.pagination.total, 0);

  const stats = await emptyService.getStats();
  assert.equal(stats.total_observations, 0, 'Public statistics must not be fabricated');

  const geojson = await emptyService.getObservationsGeoJson({});
  assert.equal(geojson.features.length, 0, 'GeoJSON must not contain synthetic features');

  const missing = await emptyService.getObservationByPassportId('RT-RW-000101');
  assert.equal(missing, null, 'A synthetic passport ID must not resolve in production');

  assert.ok(
    SYNTHETIC_FIXTURE_NOTICE.includes('SYNTHETIC_TEST_FIXTURE'),
    'Test fixtures must carry an explicit non-real-data notice'
  );
  console.log('✓ Test 0 Passed: Production repository serves no synthetic observations');
}

// Test 1: Public Filter Validation - Defaults and Bounds
{
  const empty = validatePublicFilters({});
  assert.equal(empty.page, 1, 'Default page must be 1');
  assert.equal(empty.limit, 50, 'Default limit must be 50');
  assert.equal(empty.district, undefined);
  assert.equal(empty.classification, undefined);

  // Bounded limit
  const capped = validatePublicFilters({ limit: 500, page: -5 });
  assert.equal(capped.limit, 100, 'Limit should be capped at 100');
  assert.equal(capped.page, 1, 'Negative page should normalize to 1');
  console.log('✓ Test 1 Passed: Filter defaults & boundary enforcement');
}

// Test 2: Public Filter Validation - Classifications & Confidences
{
  const valid = validatePublicFilters({
    classification: 'IGNEOUS',
    confidence: 'HIGH',
    district: 'Gasabo',
  });
  assert.equal(valid.classification, 'igneous', 'Classification should normalize to lowercase');
  assert.equal(valid.confidence, 'high', 'Confidence should normalize to lowercase');
  assert.equal(valid.district, 'Gasabo');

  const invalid = validatePublicFilters({
    classification: 'plastic',
    confidence: 'ultra-high',
  });
  assert.equal(invalid.classification, undefined, 'Invalid classification must be rejected');
  assert.equal(invalid.confidence, undefined, 'Invalid confidence must be rejected');
  console.log('✓ Test 2 Passed: Classification and confidence whitelist enforcement');
}

// Test 3: Public Filter Validation - Bounding Box Parsing
{
  const validBbox = validatePublicFilters({
    bbox: '29.0,-2.5,30.5,-1.5',
  });
  assert.ok(validBbox.bbox, 'Valid bbox should parse');
  assert.equal(validBbox.bbox?.minLon, 29.0);
  assert.equal(validBbox.bbox?.minLat, -2.5);
  assert.equal(validBbox.bbox?.maxLon, 30.5);
  assert.equal(validBbox.bbox?.maxLat, -1.5);

  const invalidBbox = validatePublicFilters({
    bbox: 'invalid,bbox,string',
  });
  assert.equal(invalidBbox.bbox, undefined, 'Malformed bbox must be ignored safely');
  console.log('✓ Test 3 Passed: Bounding box validation');
}

// Test 4: Location Generalization - District Precision
{
  const gasaboCoord = resolvePublicCoordinates({
    precision: 'district',
    district: 'Gasabo',
    latitude: -1.94218, // private exact coordinate
    longitude: 30.08921,
  });
  assert.ok(gasaboCoord);
  // Center of Gasabo is defined in RWANDA_DISTRICTS
  assert.equal(gasaboCoord?.latitude, RWANDA_DISTRICTS.Gasabo.latitude);
  assert.equal(gasaboCoord?.longitude, RWANDA_DISTRICTS.Gasabo.longitude);
  assert.notEqual(gasaboCoord?.latitude, -1.94218, 'Private latitude must NEVER be exposed');
  assert.notEqual(gasaboCoord?.longitude, 30.08921, 'Private longitude must NEVER be exposed');
  console.log('✓ Test 4 Passed: District location privacy generalization');
}

// Test 5: Location Generalization - Approximate Precision (~2km offset / rounding)
{
  const exactLat = -1.94218;
  const exactLon = 30.08921;
  const approx = approximateCoordinates(exactLat, exactLon);

  assert.notEqual(approx.lat, exactLat, 'Approximate latitude must be generalized');
  assert.notEqual(approx.lon, exactLon, 'Approximate longitude must be generalized');
  // Generalization uses 50-grid rounding (~0.02 deg ≈ 2.2 km)
  assert.equal(Math.abs(approx.lat - exactLat) < 0.05, true, 'Approximate should stay reasonably near original point');
  console.log('✓ Test 5 Passed: Approximate coordinate generalization (~2km)');
}

// Test 6: District Name Normalization across Rwanda
{
  assert.equal(normalizeDistrictName('gasabo'), 'Gasabo');
  assert.equal(normalizeDistrictName('Musanze District'), 'Musanze');
  assert.equal(normalizeDistrictName('HUYE'), 'Huye');
  assert.equal(normalizeDistrictName('unknown_place'), null);
  console.log('✓ Test 6 Passed: District name normalization');
}

// Test 7: Public Repository - Seed Data Querying & Filters
{
  const { service } = createFixtureBackedRepository();

  const allResult = await service.getObservations({});
  assert.ok(allResult.data.length > 0, 'Should return registered observations');
  assert.equal(allResult.pagination.page, 1);

  // Filter by classification: igneous
  const igneousResult = await service.getObservations({ classification: 'igneous' });
  assert.ok(igneousResult.data.length > 0);
  assert.ok(igneousResult.data.every((obs) => obs.classification === 'igneous'));

  // Filter by district: Musanze
  const musanzeResult = await service.getObservations({ district: 'Musanze' });
  assert.ok(musanzeResult.data.length > 0);
  assert.ok(musanzeResult.data.every((obs) => obs.district === 'Musanze'));
  console.log('✓ Test 7 Passed: Public observation querying with filters');
}

// Test 8: Public GeoJSON FeatureCollection Generation
{
  const { service } = createFixtureBackedRepository();

  const geojson = await service.getObservationsGeoJson({});
  assert.equal(geojson.type, 'FeatureCollection');
  assert.ok(Array.isArray(geojson.features));
  assert.ok(geojson.features.length > 0);

  const firstFeature = geojson.features[0];
  assert.equal(firstFeature.type, 'Feature');
  assert.equal(firstFeature.geometry.type, 'Point');
  assert.equal(firstFeature.geometry.coordinates.length, 2);

  // Verify privacy: NO raw user data in GeoJSON properties
  const props = firstFeature.properties as Record<string, unknown>;
  assert.equal(props.source_user_hash, undefined, 'User hash must not exist in GeoJSON');
  assert.equal(props.source_message_id, undefined, 'WhatsApp message ID must not exist in GeoJSON');
  assert.equal(props.phone_number, undefined, 'Phone numbers must not exist in GeoJSON');
  assert.ok(props.passport_id, 'Passport ID must exist in GeoJSON');
  assert.ok(props.classification, 'Classification must exist in GeoJSON');
  console.log('✓ Test 8 Passed: GeoJSON structure & privacy sanitization');
}

// Test 9: Public Statistics Aggregation
{
  const { service } = createFixtureBackedRepository();

  const stats = await service.getStats();
  assert.ok(
    stats.total_observations >= SYNTHETIC_PUBLIC_OBSERVATIONS.length,
    'Total observations should count every registered fixture'
  );
  assert.ok(stats.districts_with_observations > 0, 'Districts count should be > 0');
  assert.ok(stats.rock_categories >= 3, 'Rock categories count should be >= 3');

  const districts = await service.getDistricts();
  assert.ok(Array.isArray(districts));
  assert.ok(districts.some((d) => d.name === 'Gasabo'));
  assert.ok(districts.some((d) => d.name === 'Musanze'));
  console.log('✓ Test 9 Passed: Public statistics and district aggregations');
}

// Test 10: Single Geoscience Passport Public Detail Lookup & 404 Behavior
{
  const { service } = createFixtureBackedRepository();

  // Lookup valid public passport
  const passport = await service.getObservationByPassportId('RT-RW-000101');
  assert.ok(passport, 'Known registered passport should exist');
  assert.equal(passport?.passport_id, 'RT-RW-000101');
  assert.equal(passport?.classification, 'igneous');
  assert.equal(passport?.possible_name, 'granite');
  assert.ok(Array.isArray(passport?.observed_features));
  assert.ok(passport?.safety_note);

  // Lookup non-existent or private passport
  const missing = await service.getObservationByPassportId('RT-RW-999999');
  assert.equal(missing, null, 'Unknown passport must return null');

  const emptyId = await service.getObservationByPassportId('');
  assert.equal(emptyId, null, 'Empty passport ID must return null');
  console.log('✓ Test 10 Passed: Public Geoscience Passport detail retrieval and 404 security');
}

console.log('All 11 Stage 4 automated tests passed successfully!');
