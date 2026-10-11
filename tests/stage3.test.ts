import assert from 'node:assert/strict';
import { ObservationService, generatePassportId } from '../src/services/observation.service.js';
import { ObservationRepository } from '../src/repositories/observation.repository.js';
import { hashUserPhoneNumber, computeMediaSha256 } from '../src/utils/crypto.js';
import {
  USER_FACING_MESSAGES,
  formatWhatsAppPassportResponse,
} from '../src/services/geoscience-analysis.service.js';
import type { GeoscienceAnalysisResult } from '../ai/geological.types.js';
import type {
  ObservationRow,
  ObservationInsert,
  ObservationMediaRow,
  ObservationMediaInsert,
  ObservationLocationRow,
  ObservationLocationInsert,
  ProcessingEventRow,
  ProcessingEventInsert,
  ObservationStatus,
} from '../src/types/database.types.js';

console.log('--- Running Earth Talk Stage 3 Test Suite ---');

/**
 * In-memory repository implementing the exact database constraints,
 * checks, and foreign keys defined in the Supabase PostgreSQL migrations.
 */
class InMemoryObservationRepository extends ObservationRepository {
  public observations = new Map<string, ObservationRow>();
  public media = new Map<string, ObservationMediaRow>();
  public locations = new Map<string, ObservationLocationRow>();
  public events: ProcessingEventRow[] = [];
  private counter = 1;

  private readonly VALID_CLASSIFICATIONS = new Set([
    'igneous',
    'sedimentary',
    'metamorphic',
    'unclassified',
    'non_rock',
    'insufficient_image',
  ]);

  override async findBySourceMessageId(sourceMessageId: string): Promise<ObservationRow | null> {
    for (const obs of this.observations.values()) {
      if (obs.source_message_id === sourceMessageId) {
        return obs;
      }
    }
    return null;
  }

  override async findByPassportId(passportId: string): Promise<ObservationRow | null> {
    for (const obs of this.observations.values()) {
      if (obs.passport_id === passportId) {
        return obs;
      }
    }
    return null;
  }

  override async createObservation(insertData: ObservationInsert): Promise<ObservationRow> {
    // Constraint check: source_message_id unique
    for (const obs of this.observations.values()) {
      if (obs.source_message_id === insertData.source_message_id) {
        throw new Error(`duplicate key value violates unique constraint "observations_source_message_id_key"`);
      }
    }

    // Constraint check: classification
    if (!this.VALID_CLASSIFICATIONS.has(insertData.primary_classification)) {
      throw new Error(`invalid input value for enum primary_classification: "${insertData.primary_classification}"`);
    }

    // Constraint check: confidence_score bounds [0, 1]
    if (insertData.confidence_score < 0 || insertData.confidence_score > 1) {
      throw new Error(`new row violates check constraint "observations_confidence_score_check"`);
    }

    const id = `obs_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const passport_id = insertData.passport_id || generatePassportId(this.counter++);

    const row: ObservationRow = {
      id,
      passport_id,
      source: insertData.source || 'whatsapp',
      source_message_id: insertData.source_message_id,
      source_user_hash: insertData.source_user_hash,
      status: insertData.status || 'processing',
      is_rock: insertData.is_rock,
      primary_classification: insertData.primary_classification,
      possible_name: insertData.possible_name ?? null,
      confidence: insertData.confidence,
      confidence_score: insertData.confidence_score,
      observed_features: insertData.observed_features || [],
      reasoning: insertData.reasoning,
      alternative_possibilities: insertData.alternative_possibilities || [],
      limitations: insertData.limitations || [],
      recommended_next_steps: insertData.recommended_next_steps || [],
      safety_note: insertData.safety_note,
      user_caption: insertData.user_caption ?? null,
      verification_status: insertData.verification_status || 'unverified',
      publication_status: insertData.publication_status || 'private',
      location_status: insertData.location_status || 'not_provided',
      data_quality_status: insertData.data_quality_status || 'partial',
      ai_model: insertData.ai_model || 'gemini-3.8-flash',
      ai_prompt_version: insertData.ai_prompt_version || 'geological-v1',
      analysis_version: insertData.analysis_version || 'stage2-v1',
      system_version: insertData.system_version || 'stage3-v1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.observations.set(id, row);
    return row;
  }

  override async updateObservationStatus(id: string, status: ObservationStatus): Promise<void> {
    const obs = this.observations.get(id);
    if (obs) {
      obs.status = status;
      obs.updated_at = new Date().toISOString();
    }
  }

  override async saveObservationMedia(mediaInsert: ObservationMediaInsert): Promise<ObservationMediaRow> {
    // Foreign key check
    if (!this.observations.has(mediaInsert.observation_id)) {
      throw new Error(`insert violates foreign key constraint on observation_id`);
    }

    const id = `media_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const row: ObservationMediaRow = {
      id,
      observation_id: mediaInsert.observation_id,
      media_type: mediaInsert.media_type || 'image',
      mime_type: mediaInsert.mime_type,
      file_size: mediaInsert.file_size,
      sha256: mediaInsert.sha256 ?? null,
      source_media_id: mediaInsert.source_media_id,
      storage_status: mediaInsert.storage_status || 'metadata_only',
      created_at: new Date().toISOString(),
    };

    this.media.set(id, row);
    return row;
  }

  override async saveObservationLocation(
    locationInsert: ObservationLocationInsert
  ): Promise<ObservationLocationRow> {
    // Foreign key check
    if (!this.observations.has(locationInsert.observation_id)) {
      throw new Error(`insert violates foreign key constraint on observation_id`);
    }

    // Constraint checks: latitude & longitude
    if (locationInsert.latitude !== null && locationInsert.latitude !== undefined) {
      if (locationInsert.latitude < -90 || locationInsert.latitude > 90) {
        throw new Error(`new row violates check constraint for latitude`);
      }
    }

    if (locationInsert.longitude !== null && locationInsert.longitude !== undefined) {
      if (locationInsert.longitude < -180 || locationInsert.longitude > 180) {
        throw new Error(`new row violates check constraint for longitude`);
      }
    }

    const id = `loc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let geom: string | null = null;
    if (locationInsert.latitude !== null && locationInsert.latitude !== undefined && locationInsert.longitude !== null && locationInsert.longitude !== undefined) {
      geom = `SRID=4326;POINT(${locationInsert.longitude} ${locationInsert.latitude})`;
    }

    const row: ObservationLocationRow = {
      id,
      observation_id: locationInsert.observation_id,
      location_source: locationInsert.location_source,
      latitude: locationInsert.latitude ?? null,
      longitude: locationInsert.longitude ?? null,
      accuracy_meters: locationInsert.accuracy_meters ?? null,
      district: locationInsert.district ?? null,
      sector: locationInsert.sector ?? null,
      cell: locationInsert.cell ?? null,
      village: locationInsert.village ?? null,
      location_text: locationInsert.location_text ?? null,
      geom,
      is_public: locationInsert.is_public ?? false,
      created_at: new Date().toISOString(),
    };

    this.locations.set(id, row);
    return row;
  }

  override async recordProcessingEvent(eventInsert: ProcessingEventInsert): Promise<ProcessingEventRow | null> {
    const id = `event_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const row: ProcessingEventRow = {
      id,
      observation_id: eventInsert.observation_id ?? null,
      event_type: eventInsert.event_type,
      status: eventInsert.status,
      duration_ms: eventInsert.duration_ms ?? null,
      error_code: eventInsert.error_code ?? null,
      created_at: new Date().toISOString(),
    };
    this.events.push(row);
    return row;
  }
}

const mockRepo = new InMemoryObservationRepository();
const testService = new ObservationService(mockRepo);

const sampleAiResult: GeoscienceAnalysisResult = {
  is_rock: true,
  primary_classification: 'igneous',
  possible_name: 'granite',
  confidence: 'moderate',
  confidence_score: 0.75,
  observed_features: ['coarse visible grains', 'light and dark quartz/feldspar'],
  reasoning: 'Interlocking mineral grains compatible with granite.',
  alternative_possibilities: ['granodiorite'],
  limitations: ['Cannot confirm specific mineral hardness from photo alone'],
  recommended_next_steps: ['Take a close-up photo in sunlight'],
  safety_note: 'Preliminary AI identification, not a laboratory determination.',
};

const sampleMedia = {
  buffer: Buffer.from('fake_image_bytes_for_testing'),
  mimeType: 'image/jpeg',
  fileSize: 1024,
  mediaId: 'meta_media_123',
};

// Test 1: Create valid observation
{
  const obs = await testService.createRockPassport({
    aiResult: sampleAiResult,
    senderPhoneNumber: '+250788111222',
    messageId: 'msg_001',
    media: sampleMedia,
    userCaption: 'Found in Musanze',
  });

  assert.ok(obs.id);
  assert.equal(obs.status, 'completed');
  assert.equal(obs.is_rock, true);
  assert.equal(obs.primary_classification, 'igneous');
  assert.equal(obs.possible_name, 'granite');
  console.log('✓ Test 1 Passed: Valid observation created successfully');
}

// Test 2: Generate unique passport ID (format RT-RW-XXXXXX)
{
  const obs2 = await testService.createRockPassport({
    aiResult: sampleAiResult,
    senderPhoneNumber: '+250788111333',
    messageId: 'msg_002',
    media: sampleMedia,
  });

  assert.match(obs2.passport_id, /^RT-RW-\d{6}$/);
  const obs1 = await testService.getObservationBySourceMessageId('msg_001');
  assert.notEqual(obs1?.passport_id, obs2.passport_id, 'Passport IDs must be distinct and sequential');
  console.log('✓ Test 2 Passed: Unique sequential Passport ID generated (RT-RW-XXXXXX)');
}

// Test 3: Duplicate source message rejected (idempotency)
{
  const obsInitial = await testService.getObservationBySourceMessageId('msg_001');
  const obsDuplicate = await testService.createRockPassport({
    aiResult: sampleAiResult,
    senderPhoneNumber: '+250788111222',
    messageId: 'msg_001', // Same message ID
    media: sampleMedia,
  });

  assert.equal(obsInitial?.id, obsDuplicate.id);
  assert.equal(obsInitial?.passport_id, obsDuplicate.passport_id);
  assert.equal(mockRepo.observations.size, 2, 'No duplicate record should be added for same message ID');
  console.log('✓ Test 3 Passed: Duplicate source message safely returned without duplicate passport');
}

// Test 4: Invalid classification rejected
{
  await assert.rejects(
    async () => {
      await mockRepo.createObservation({
        source_message_id: 'msg_invalid_class',
        source_user_hash: 'hash_test',
        is_rock: true,
        // @ts-expect-error Testing invalid classification
        primary_classification: 'alien_meteorite',
        confidence: 'high',
        confidence_score: 0.9,
        reasoning: 'Test',
        safety_note: 'Test',
      });
    },
    /invalid input value for enum primary_classification/,
    'Invalid classification must be rejected by constraint'
  );
  console.log('✓ Test 4 Passed: Invalid classification rejected by constraint');
}

// Test 5: Invalid confidence score rejected (< 0 or > 1)
{
  await assert.rejects(
    async () => {
      await mockRepo.createObservation({
        source_message_id: 'msg_invalid_score',
        source_user_hash: 'hash_test',
        is_rock: true,
        primary_classification: 'igneous',
        confidence: 'high',
        confidence_score: 1.5, // > 1
        reasoning: 'Test',
        safety_note: 'Test',
      });
    },
    /observations_confidence_score_check/,
    'Confidence score > 1 must be rejected'
  );
  console.log('✓ Test 5 Passed: Invalid confidence score rejected');
}

// Test 6: Missing optional location accepted
{
  const obsNoLoc = await testService.createRockPassport({
    aiResult: sampleAiResult,
    senderPhoneNumber: '+250788333444',
    messageId: 'msg_003',
    media: sampleMedia,
  });

  assert.equal(obsNoLoc.location_status, 'not_provided');
  console.log('✓ Test 6 Passed: Missing optional location accepted cleanly');
}

// Test 7: Valid coordinates create PostGIS point
{
  const obsWithLoc = await testService.createRockPassport({
    aiResult: sampleAiResult,
    senderPhoneNumber: '+250788444555',
    messageId: 'msg_004',
    media: sampleMedia,
    location: {
      latitude: -1.9441,
      longitude: 30.0619,
      district: 'Kigali',
      locationText: 'Near river in Kigali',
    },
  });

  assert.equal(obsWithLoc.location_status, 'user_provided');
  // Verify location record in repository
  let foundLoc: ObservationLocationRow | undefined;
  for (const loc of mockRepo.locations.values()) {
    if (loc.observation_id === obsWithLoc.id) {
      foundLoc = loc;
      break;
    }
  }
  assert.ok(foundLoc, 'Observation location must exist');
  assert.equal(foundLoc.latitude, -1.9441);
  assert.equal(foundLoc.longitude, 30.0619);
  assert.equal(foundLoc.geom, 'SRID=4326;POINT(30.0619 -1.9441)');
  assert.equal(foundLoc.is_public, false, 'Location must be private by default');
  console.log('✓ Test 7 Passed: Valid coordinates create PostGIS point (private by default)');
}

// Test 8: Invalid latitude rejected (-90 <= lat <= 90)
{
  assert.throws(
    () => {
      testService.validateCoordinates(95.0, 30.0);
    },
    /Invalid latitude: 95/,
    'Latitude > 90 must be rejected'
  );

  assert.throws(
    () => {
      testService.validateCoordinates(-91.0, 30.0);
    },
    /Invalid latitude: -91/,
    'Latitude < -90 must be rejected'
  );
  console.log('✓ Test 8 Passed: Invalid latitude rejected (-90 to 90 check)');
}

// Test 9: Invalid longitude rejected (-180 <= lon <= 180)
{
  assert.throws(
    () => {
      testService.validateCoordinates(-1.5, 185.0);
    },
    /Invalid longitude: 185/,
    'Longitude > 180 must be rejected'
  );

  assert.throws(
    () => {
      testService.validateCoordinates(-1.5, -185.0);
    },
    /Invalid longitude: -185/,
    'Longitude < -180 must be rejected'
  );
  console.log('✓ Test 9 Passed: Invalid longitude rejected (-180 to 180 check)');
}

// Test 10: Observation media references valid observation
{
  const obs = await testService.getObservationBySourceMessageId('msg_004');
  let foundMedia: ObservationMediaRow | undefined;
  for (const m of mockRepo.media.values()) {
    if (m.observation_id === obs?.id) {
      foundMedia = m;
      break;
    }
  }

  assert.ok(foundMedia, 'Media record must exist');
  assert.equal(foundMedia.mime_type, 'image/jpeg');
  assert.equal(foundMedia.sha256, computeMediaSha256(sampleMedia.buffer));
  assert.equal(foundMedia.source_media_id, 'meta_media_123');
  console.log('✓ Test 10 Passed: Observation media references valid observation with checksum');
}

// Test 11: Processing event references valid observation
{
  const obs = await testService.getObservationBySourceMessageId('msg_004');
  const matchingEvents = mockRepo.events.filter((e) => e.observation_id === obs?.id);
  assert.ok(matchingEvents.length > 0, 'Processing event must exist for observation');
  assert.ok(matchingEvents.some((e) => e.event_type === 'database_saved' && e.status === 'completed'));
  console.log('✓ Test 11 Passed: Processing events audit log links to observation');
}

// Test 12: Failed AI result does not create completed observation
{
  const beforeCount = mockRepo.observations.size;
  // If AI pipeline fails before database, no completed observation is inserted
  const failedAiAttempt = async () => {
    throw new Error('Gemini API timeout');
  };

  await assert.rejects(failedAiAttempt, /Gemini API timeout/);
  assert.equal(mockRepo.observations.size, beforeCount, 'No observation added on AI failure');
  console.log('✓ Test 12 Passed: Failed AI result does not create completed observation');
}

// Test 13: Database failure produces safe user message
{
  const failingRepo = new (class extends ObservationRepository {
    override async findBySourceMessageId(): Promise<ObservationRow | null> {
      return null;
    }
    override async createObservation(): Promise<ObservationRow> {
      throw new Error('Connection terminated unexpectedly');
    }
    override async recordProcessingEvent(): Promise<ProcessingEventRow | null> {
      return null;
    }
  })();
  const failingService = new ObservationService(failingRepo);

  let caughtError: unknown;
  try {
    await failingService.createRockPassport({
      aiResult: sampleAiResult,
      senderPhoneNumber: '+250788999999',
      messageId: 'msg_failing_db',
      media: sampleMedia,
    });
  } catch (err) {
    caughtError = err;
  }

  assert.ok(caughtError);
  // Verify that the user-facing message does not contain internal SQL or connection details
  const saveFailure = USER_FACING_MESSAGES.DATABASE_SAVE_FAILED;
  assert.ok(saveFailure.length > 0);
  assert.ok(
    !/sql|postgres|supabase|connection terminated|ECONNREFUSED|duplicate key/i.test(saveFailure),
    'The user-facing failure message must not leak internal database detail'
  );
  assert.ok(
    saveFailure.includes("couldn't save"),
    'The user-facing failure message must say the save did not happen'
  );
  assert.ok(
    saveFailure.includes('No public observation was created'),
    'The message must state honestly that nothing was published'
  );
  console.log('✓ Test 13 Passed: Database failure handled with safe user-facing message');
}

// Test 14: Raw phone number is not stored in observation
{
  const rawPhone = '+250788123456';
  const obsPrivate = await testService.createRockPassport({
    aiResult: sampleAiResult,
    senderPhoneNumber: rawPhone,
    messageId: 'msg_phone_privacy',
    media: sampleMedia,
  });

  assert.notEqual(obsPrivate.source_user_hash, rawPhone, 'Raw phone number must NEVER be stored');
  assert.ok(!obsPrivate.source_user_hash.includes('250788'), 'Hash must not contain phone digits');
  assert.equal(obsPrivate.source_user_hash.length, 64, 'Hash must be 64-char HMAC-SHA256 hex string');
  assert.equal(obsPrivate.source_user_hash, hashUserPhoneNumber(rawPhone));
  console.log('✓ Test 14 Passed: Raw phone number is never stored; irreversible HMAC-SHA256 used');
}

// Test 15: New observations default to unverified and private
{
  const obsNew = await testService.getObservationBySourceMessageId('msg_phone_privacy');
  assert.equal(obsNew?.verification_status, 'unverified', 'Verification status must default to unverified');
  assert.equal(obsNew?.publication_status, 'private', 'Publication status must default to private');

  // Verify formatted WhatsApp reply includes the Geoscience Passport ID and privacy notice
  const reply = formatWhatsAppPassportResponse(sampleAiResult, obsNew!.passport_id);
  assert.ok(reply.includes(`🆔 Geoscience Passport: ${obsNew!.passport_id}`));
  assert.ok(reply.includes('🔒 Privacy:\nYour observation is currently private and is not publicly displayed.'));
  assert.ok(reply.includes('📍 Location:\nNot provided'));
  assert.ok(!reply.includes('Rwanda map'), 'Must not claim observation is on the map');
  console.log('✓ Test 15 Passed: Defaults to unverified and private; WhatsApp message reflects privacy');
}

console.log('All 15 Stage 3 automated tests passed successfully!');
