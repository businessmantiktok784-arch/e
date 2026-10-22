import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraForObservations, createMapRenderItems, filterMapObservations, parsePublicMapData, validateGeographicCoordinate } from '../features/map/geojson.ts';
import type { GeoJsonCollection } from '../types/api.ts';

const properties = { passport_id: 'ET-RW-000001', observation_category: 'rock', observation_subcategory: 'outcrop', possible_name: 'Basalt outcrop', primary_interpretation: null, evidence_state: 'ai_assisted', district: 'Kicukiro', created_at: '2026-01-01T00:00:00Z', primary_media_url: null, is_demo: false };
const point = (id: string, coordinates: unknown, extra: Record<string, unknown> = {}) => ({ type: 'Feature' as const, geometry: { type: 'Point', coordinates }, properties: { ...properties, passport_id: id, ...extra } });

test('validates WGS84 coordinates including boundaries and rejects malformed values', () => {
  assert.deepEqual(validateGeographicCoordinate(-90, 180), { latitude: -90, longitude: 180 });
  assert.deepEqual(validateGeographicCoordinate(90, -180), { latitude: 90, longitude: -180 });
  for (const [lat, lon] of [[-90.01, 0], [90.01, 0], [0, -180.01], [0, 180.01], [undefined, 2], ['1', 2], [Infinity, 2], [NaN, 2]]) {
    assert.equal(validateGeographicCoordinate(lat, lon), null);
  }
});

test('parses GeoJSON [longitude, latitude] without swapping or inventing coordinates', () => {
  const data = { type: 'FeatureCollection', features: [point('ET-1', [30.2, -1.8]), point('ET-2', [-1.8, 30.2]), point('ET-3', [190, 80]), point('ET-4', null), point('ET-DEMO', [30, -2], { is_demo: true })] } as unknown as GeoJsonCollection;
  const parsed = parsePublicMapData(data);
  assert.equal(parsed.observations.length, 2);
  assert.deepEqual([parsed.observations[0]?.longitude, parsed.observations[0]?.latitude], [30.2, -1.8]);
  assert.deepEqual([parsed.observations[1]?.longitude, parsed.observations[1]?.latitude], [-1.8, 30.2]);
  assert.equal(parsed.invalidFeatureCount, 2);
  assert.equal(parsed.demonstrationFeatureCount, 1);
});

test('map rejects records with missing or blank category values', () => {
  const data = { type: 'FeatureCollection', features: [point('ET-valid', [30, -2]), point('ET-blank', [30, -2], { observation_category: '  ' }), point('ET-missing', [30, -2], { observation_category: undefined })] } as unknown as GeoJsonCollection;
  const parsed = parsePublicMapData(data);
  assert.deepEqual(parsed.observations.map((item) => item.id), ['ET-valid']);
  assert.equal(parsed.invalidFeatureCount, 2);
});

test('category filter and clearing return only the matching genuine records', () => {
  const observations = parsePublicMapData({ type: 'FeatureCollection', features: [point('ET-1', [30, -2]), point('ET-2', [31, -2], { observation_category: 'fossil' })] } as unknown as GeoJsonCollection).observations;
  assert.deepEqual(filterMapObservations(observations, 'rock').map((item) => item.id), ['ET-1']);
  assert.equal(filterMapObservations(observations, '').length, 2);
  assert.equal(filterMapObservations(observations, 'unknown').length, 0);
});

test('render items preserve observation ids and cluster counts exactly represent included real points', () => {
  const observations = parsePublicMapData({ type: 'FeatureCollection', features: [point('ET-1', [30, -2]), point('ET-2', [30.001, -2])] } as unknown as GeoJsonCollection).observations;
  const clustered = createMapRenderItems(observations, 6);
  assert.equal(clustered.length, 1);
  assert.match(clustered[0]?.id ?? '', /^cluster:/);
  assert.equal(clustered[0]?.kind, 'cluster');
  if (clustered[0]?.kind === 'cluster') assert.equal(clustered[0].count, observations.length);
  const individual = createMapRenderItems(observations, 20);
  assert.deepEqual(individual.map((item) => item.id), ['ET-1', 'ET-2']);
  if (individual[0]?.kind === 'observation') assert.equal(individual[0].observation.id, 'ET-1');
  const coincident = parsePublicMapData({ type: 'FeatureCollection', features: [point('ET-3', [30, -2]), point('ET-4', [30, -2])] } as unknown as GeoJsonCollection).observations;
  const coincidentItems = createMapRenderItems(coincident, 20);
  assert.equal(coincidentItems[0]?.kind, 'cluster');
  if (coincidentItems[0]?.kind === 'cluster') assert.equal(coincidentItems[0].count, 2);
});

test('camera uses a neutral Rwanda view when no points exist and handles the date line', () => {
  assert.deepEqual(cameraForObservations([]), { latitude: -1.9403, longitude: 29.8739, zoom: 6.5 });
  const observations = parsePublicMapData({ type: 'FeatureCollection', features: [point('ET-east', [179.5, 0]), point('ET-west', [-179.5, 0])] } as unknown as GeoJsonCollection).observations;
  const camera = cameraForObservations(observations);
  assert.ok(Math.abs(Math.abs(camera.longitude) - 180) < 1);
  assert.ok(camera.zoom <= 8.5);
});

test('camera bounds handle large unpaginated result sets without argument-limit failures', () => {
  const observations = Array.from({ length: 130_000 }, (_, index) => ({
    id: `ET-${index}`, latitude: index % 2 ? -2 : -1, longitude: 30, category: 'rock', subcategory: '', title: 'rock', description: null, district: null, createdAt: null, evidenceState: null, imageUrl: null,
  }));
  const camera = cameraForObservations(observations);
  assert.deepEqual([camera.latitude, camera.longitude], [-1.5, 30]);
  assert.ok(Number.isFinite(camera.zoom));
});
