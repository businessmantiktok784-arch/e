import { DEMO_POSTS, type DemoPostSeed } from './demo-posts.js';
import { publicObservationRepository } from '../repositories/public-observation.repository.js';
import type { RawPublicObservationRecord } from '../repositories/public-observation.repository.js';

/**
 * Puts the labelled demonstration posts on the public map and list (Stage 12).
 *
 * The post card reads demonstration entries straight from `demo-posts.ts`, but
 * the map, the observation list and the GeoJSON layer read
 * `public-observation.repository`, which knows nothing about them. Without this
 * adapter a deployment with no collected data shows an empty map while the same
 * deployment serves every demonstration card on direct links: the two
 * views would disagree about what exists.
 *
 * Three rules are preserved here:
 *
 *   1. The records only enter `demoStore`, never the in-memory store of
 *      genuinely published observations, so they are still excluded from every
 *      aggregate, from nearby and similar queries, and from research flags.
 *   2. `is_demo` is true on every record, so the map badge, the list badge and
 *      the card all render the same flag the post card already publishes.
 *   3. The conversion is a data mapping, not a generator. Nothing here invents
 *      a coordinate, a confidence or a classification that the demonstration
 *      post did not already carry.
 *
 * Registration is called at start-up and is gated by `DEMO_POSTS_ENABLED`,
 * which is the same flag the repository checks on every read.
 */

/**
 * The legacy rock classification a demonstration entry is filed under.
 *
 * `unclassified` is the honest answer for a card that is demonstrating an
 * interface rather than classifying a rock, and the two exit categories map to
 * the exit values the vocabulary already defines. No demonstration record ever
 * claims `igneous`, `sedimentary` or `metamorphic`, because it has not been
 * classified by anything.
 */
function classificationFor(post: DemoPostSeed): string {
  if (post.observation_category === 'insufficient_image') return 'insufficient_image';
  if (post.observation_category === 'non_geoscience') return 'non_rock';
  return 'unclassified';
}

function toRecord(post: DemoPostSeed): RawPublicObservationRecord {
  // The map preview shows a real photograph, so it takes the first attached
  // image. A clip is never used here: the preview draws a still frame, so a
  // post whose only media is the clip leaves this null and the preview falls
  // back to its category symbol.
  const primaryImage = post.media.find(
    (item) => item.url && item.mime_type.startsWith('image/')
  );
  return {
    passport_id: post.passport_id,
    observation_category: post.observation_category,
    observation_subcategory: post.observation_subcategory,
    primary_interpretation: post.primary_interpretation,
    primary_classification: classificationFor(post),
    possible_name: null,
    // A demonstration entry has no assessment behind it. The card publishes the
    // same `moderate` / `ai_assisted` pair it always has, and the map shows the
    // same evidence colour, so the two views never disagree about one record.
    confidence: 'moderate',
    confidence_score: 0.5,
    verification_status: 'unverified',
    evidence_state: 'ai_assisted',
    community_status: 'not_started',
    observed_features: post.observed_features,
    diagnostic_features: post.diagnostic_features,
    uncertainties: post.uncertainties,
    reasoning: post.reasoning,
    limitations: post.limitations,
    recommended_next_steps: post.recommended_next_steps,
    safety_note: post.safety_note,
    data_quality_status: 'complete',
    // Never derived: a person sets this flag, and nobody has set it here.
    is_research_opportunity: null,
    media_count: post.media.length,
    public_media_count: post.media.length,
    primary_media_url: primaryImage?.url ?? null,
    district: post.district,
    sector: post.sector,
    post_title: post.title,
    user_report: post.user_report,
    is_demo: true,
    public_location_precision: post.precision,
    // Read only through `resolvePublicCoordinates`, which returns null for a
    // private precision, so a withheld point stays withheld on the map too.
    latitude: post.latitude,
    longitude: post.longitude,
    created_at: post.created_at,
    published_at: post.created_at,
  };
}

/** The demonstration records as the public read path receives them. */
export function demoMapRecords(): RawPublicObservationRecord[] {
  return DEMO_POSTS.map(toRecord);
}

/**
 * Registers the demonstration records with the public repository.
 *
 * Safe to call more than once: `registerDemoRecords` replaces the whole
 * demonstration set rather than appending to it, so a re-registration cannot
 * duplicate a pin.
 */
export function registerDemoObservationRecords(): number {
  const records = demoMapRecords();
  publicObservationRepository.registerDemoRecords(records);
  return records.length;
}
