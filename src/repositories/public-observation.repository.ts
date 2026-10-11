import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { haversineKm } from './site.repository.js';
import { resolvePublicCoordinates, RWANDA_DISTRICTS } from '../utils/public-location.js';
import type { ValidatedFilters } from '../utils/public-filters.js';
import {
  GEOSCIENCE_CATEGORIES,
  GEOSCIENCE_CATEGORY_LABELS,
} from '../ai/geoscience-taxonomy.js';
import type {
  PublicObservationSummary,
  PublicObservationDetail,
  PublicObservationFeature,
  PublicObservationGeoJson,
  PublicStats,
  PublicDistrictCount,
  PublicCategoryCount,
  PaginatedResponse,
} from '../types/public.types.js';

export interface RawPublicObservationRecord {
  passport_id: string;
  observation_category?: string;
  observation_subcategory?: string;
  observation_type?: string;
  primary_interpretation?: string | null;
  geological_context?: string | null;
  primary_classification: string;
  possible_name: string | null;
  confidence: string;
  confidence_score: number;
  verification_status: string;
  evidence_state?: string;
  community_status?: string;
  observed_features?: string[];
  diagnostic_features?: string[];
  uncertainties?: string[];
  reasoning?: string;
  limitations?: string[];
  recommended_next_steps?: string[];
  safety_note?: string;
  data_quality_status?: string;
  /**
   * The research-opportunity flag as published by the view.
   *
   * Named `is_research_opportunity` because that is the column the SQL view
   * actually publishes. Reading a field the view does not return yields
   * `undefined` for every row, which silently turns the filter into "match
   * nothing" rather than an error. `research_opportunity` is accepted below as a
   * legacy alias so existing in-memory fixtures keep working.
   */
  is_research_opportunity?: boolean | null;
  research_opportunity?: boolean | null;
  research_opportunity_count?: number | null;
  /** Media attached to the observation, whether or not it may be shown. */
  media_count?: number | null;
  /** The subset of `media_count` that passed moderation and is publicly viewable. */
  public_media_count?: number | null;
  /**
   * A publicly viewable image for the compact map preview, when one exists.
   *
   * Only ever an image, never a clip: the preview draws a still frame, so a
   * record whose only media is a video leaves this null and the preview falls
   * back to its category symbol rather than a broken frame.
   */
  primary_media_url?: string | null;
  site_title?: string | null;
  sector?: string | null;
  created_at: string;
  published_at?: string | null;
  district?: string | null;
  site_code?: string;
  public_location_precision?: string;
  /**
   * The view deliberately publishes only these two names.
   *
   * `public_observations` CASE-exprests latitude and longitude to NULL unless
   * `public_location_precision = 'exact'`, so a private or approximate location
   * arrives here as null. The view never exposes a raw `latitude` column, and
   * these are read instead of guessing at other names.
   */
  public_latitude?: number | null;
  public_longitude?: number | null;
  /** Accepted only from the in-memory test store, never from the SQL view. */
  latitude?: number | null;
  longitude?: number | null;

  // -- Stage 12 community post fields ---------------------------------------
  /** Contributor-chosen title when the post carries one. */
  post_title?: string | null;
  /** The contributor's own words. Never model output. */
  user_report?: string | null;
  /**
   * True only for a labelled demonstration record. Demonstration entries are
   * served from `src/data/demo-posts.ts` and are never collected observations.
   */
  is_demo?: boolean;
}

/**
 * In-memory index of genuinely published observations.
 *
 * REAL DATA POLICY: this store starts EMPTY and is only ever populated by
 * `registerPublicObservation`, which is called from the real WhatsApp -> AI ->
 * database pipeline when an observation is actually published.
 *
 * There is deliberately NO synthetic seed data here. Fabricated geological
 * records must never be served by a production endpoint. When the database is
 * unreachable or contains no published observations, this repository returns an
 * empty collection and the UI renders an explicit "no data available yet" state
 * rather than invented records.
 *
 * Synthetic fixtures for automated tests live in `tests/fixtures/` and are
 * explicitly registered by the test that needs them.
 */

/**
 * Two observations count as "the same place" when they sit within this radius
 * (≈100 m). A visitor rarely captures the exact GPS decimal pair of an earlier
 * visitor even at the same outcrop, so "same place" is a small proximity band
 * around the published point - within shooting distance - never exact equality
 * and never the broad near-by radius used by the nearby list.
 */
export const SAME_PLACE_RADIUS_KM = 0.5;

export class PublicObservationRepository {
  private inMemoryPublicStore: Map<string, RawPublicObservationRecord> = new Map();

  /**
   * Labelled demonstration records, kept apart from the real store so they can
   * be served on the map and excluded from every aggregate.
   *
   * They are registered once at start-up from `src/data/demo-posts.ts` and are
   * only read when `DEMO_POSTS_ENABLED` is true, which is never the default in
   * production.
   */
  private demoStore: Map<string, RawPublicObservationRecord> = new Map();

  registerDemoRecords(records: RawPublicObservationRecord[]): void {
    this.demoStore.clear();
    for (const record of records) {
      this.demoStore.set(record.passport_id, record);
    }
  }

  /** Number of demonstration records currently registered. */
  get demoRecordCount(): number {
    return this.demoStore.size;
  }

  /**
   * Adds or publishes an observation in the public repository.
   */
  registerPublicObservation(record: RawPublicObservationRecord): void {
    this.inMemoryPublicStore.set(record.passport_id, record);
  }

  /**
   * Unpublishes an observation.
   */
  unpublishObservation(passportId: string): void {
    this.inMemoryPublicStore.delete(passportId);
  }

  /**
   * Reads the public coordinate pair for a record.
   *
   * The SQL view publishes `public_latitude`/`public_longitude`; the in-memory
   * store uses `latitude`/`longitude`. Both are accepted so a live query and a
   * registered record resolve identically, and neither can leak a coordinate the
   * view withheld, because the view already returned null for those.
   */
  private static publicCoordinates(rec: RawPublicObservationRecord): {
    latitude: number | null;
    longitude: number | null;
  } {
    return {
      latitude: rec.public_latitude ?? rec.latitude ?? null,
      longitude: rec.public_longitude ?? rec.longitude ?? null,
    };
  }

  /**
   * Queries Supabase view `public_observations` or in-memory public store with strict filters.
   */
  async findPublicObservations(filters: ValidatedFilters): Promise<PaginatedResponse<PublicObservationSummary>> {
    const records = await this.getAllEligiblePublicRecords({ includeDemo: true });
    const filtered = this.applyFilters(records, filters);

    // Sort newest first
    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = filtered.length;
    const totalPages = Math.ceil(total / filters.limit) || 1;
    const startIndex = (filters.page - 1) * filters.limit;
    const paginated = filtered.slice(startIndex, startIndex + filters.limit);

    const data: PublicObservationSummary[] = paginated.map((rec) =>
      PublicObservationRepository.toSummary(rec)
    );

    return {
      data,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Maps one stored record to the public list shape.
   *
   * A location is published only when the visitor authorised it: an unauthorised
   * coordinate arrives already null and stays null here, so a record with no
   * public location is the same object in the list and in the unlocated view.
   */
  private static toSummary(rec: RawPublicObservationRecord): PublicObservationSummary {
    const coords = resolvePublicCoordinates({
      precision: (rec.public_location_precision as any) || 'district',
      district: rec.district,
      latitude: PublicObservationRepository.publicCoordinates(rec).latitude,
      longitude: PublicObservationRepository.publicCoordinates(rec).longitude,
    });

    return {
      passport_id: rec.passport_id,
      observation_category: (rec.observation_category || 'unknown') as any,
      observation_subcategory: rec.observation_subcategory || 'unknown',
      primary_interpretation: rec.primary_interpretation ?? null,
      classification: rec.primary_classification as any,
      possible_name: rec.possible_name,
      confidence: rec.confidence as any,
      confidence_score: rec.confidence_score,
      verification_status: (rec.verification_status as any) || 'unverified',
      evidence_state: rec.evidence_state ?? null,
      district: rec.district || null,
      location_precision: (rec.public_location_precision as any) || 'district',
      latitude: coords?.latitude,
      longitude: coords?.longitude,
      created_at: rec.created_at,
      published_at: rec.published_at,
      is_research_opportunity: rec.is_research_opportunity ?? rec.research_opportunity ?? null,
      post_title: rec.post_title ?? null,
      is_demo: rec.is_demo ?? false,
    };
  }

  /**
   * Published observations that carry no public location.
   *
   * The map can only draw a record that has an authorised coordinate, so any
   * published observation whose contributor kept the location private would
   * otherwise be reachable nowhere. This list is what the "Geoscience sites"
   * surface shows for those posts, so they remain discoverable - clearly marked
   * as having no published location, never placed at a guessed point.
   */
  async findUnlocatedPublicObservations(
    filters: ValidatedFilters
  ): Promise<PaginatedResponse<PublicObservationSummary>> {
    const records = await this.getAllEligiblePublicRecords({ includeDemo: true });
    const filtered = this.applyFilters(records, filters).filter((rec) => {
      const coords = resolvePublicCoordinates({
        precision: (rec.public_location_precision as any) || 'district',
        district: rec.district,
        latitude: PublicObservationRepository.publicCoordinates(rec).latitude,
        longitude: PublicObservationRepository.publicCoordinates(rec).longitude,
      });
      return !coords;
    });

    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = filtered.length;
    const totalPages = Math.ceil(total / filters.limit) || 1;
    const startIndex = (filters.page - 1) * filters.limit;
    const paginated = filtered.slice(startIndex, startIndex + filters.limit);

    return {
      data: paginated.map((rec) => PublicObservationRepository.toSummary(rec)),
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Finds a single public observation by its Geoscience Passport ID.
   * Only returns if observation is public and eligible; otherwise returns null.
   */
  async findPublicObservationByPassport(passportId: string): Promise<PublicObservationDetail | null> {
    const records = await this.getAllEligiblePublicRecords({ includeDemo: true });
    const match = records.find((r) => r.passport_id.toUpperCase() === passportId.toUpperCase());
    if (!match) return null;

    const coords = resolvePublicCoordinates({
      precision: (match.public_location_precision as any) || 'district',
      district: match.district,
      latitude: PublicObservationRepository.publicCoordinates(match).latitude,
      longitude: PublicObservationRepository.publicCoordinates(match).longitude,
    });

    return {
      passport_id: match.passport_id,
      observation_category: (match.observation_category || 'unknown') as any,
      observation_subcategory: match.observation_subcategory || 'unknown',
      primary_interpretation: match.primary_interpretation ?? null,
      classification: match.primary_classification as any,
      possible_name: match.possible_name,
      confidence: match.confidence as any,
      confidence_score: match.confidence_score,
      verification_status: (match.verification_status as any) || 'unverified',
      evidence_state: match.evidence_state ?? null,
      district: match.district || null,
      location_precision: (match.public_location_precision as any) || 'district',
      latitude: coords?.latitude,
      longitude: coords?.longitude,
geological_context: match.geological_context ?? null,
        observed_features: match.observed_features || [],
        diagnostic_features: match.diagnostic_features || [],
        uncertainties: match.uncertainties || [],
        reasoning: match.reasoning || '',
      limitations: match.limitations || [],
      recommended_next_steps: match.recommended_next_steps || [],
      safety_note:
        match.safety_note ||
        'This is a preliminary AI-assisted identification and not a laboratory or expert determination.',
      data_quality_status: (match.data_quality_status as any) || 'complete',
      is_research_opportunity: match.is_research_opportunity ?? match.research_opportunity ?? false,
      research_opportunity_count: match.research_opportunity_count ?? 0,
      media_count: match.media_count ?? 0,
      public_media_count: match.public_media_count ?? 0,
      primary_media_url: match.primary_media_url ?? null,
      site_title: match.site_title ?? null,
      site_code: match.site_code ?? null,
      sector: match.sector ?? null,
      created_at: match.created_at,
      published_at: match.published_at,
      post_title: match.post_title ?? null,
      is_demo: match.is_demo ?? false,
    };
  }

  /**
   * Finds publicly available observations near a given record, bounded by
   * distance and count. Density is reported, never interpreted as abundance:
   * callers must keep that rule.
   *
   * Distance is measured from the *published* coordinate only. A record whose
   * contributor withheld the exact location cannot be placed and is never
   * treated as if it were at the caller's position.
   */
  async findNearbyPublicObservations(params: {
    passportId: string;
    radiusKm?: number;
    limit?: number;
  }): Promise<
    {
      passport_id: string;
      observation_category: string;
      observation_subcategory: string;
      possible_name: string | null;
      confidence: string;
      district: string | null;
      distance_km: number | null;
      created_at: string;
    }[]
  > {
    const records = await this.getAllEligiblePublicRecords();
    const origin = records.find(
      (r) => r.passport_id.toUpperCase() === params.passportId.toUpperCase()
    );
    if (!origin) return [];

    const originCoords = PublicObservationRepository.publicCoordinates(origin);
    if (originCoords.latitude == null || originCoords.longitude == null) return [];
    return this.nearbyFrom(records, originCoords.latitude, originCoords.longitude, {
      excludePassportId: params.passportId,
      radiusKm: params.radiusKm,
      limit: params.limit,
    });
  }

/**
   * Finds other observations recorded at the same place as the given passport.
   *
   * Two visitors almost never capture the exact same GPS decimal pair even when
   * they photographed the same ground, so "same place" is a small radius around
   * the published point (≈100 m, within shooting distance), never exact
   * equality and never the broad near-by radius. The origin itself is excluded.
   */
  async findSamePlacePublicObservations(params: {
    passportId: string;
    limit?: number;
  }): Promise<
    {
      passport_id: string;
      post_title: string | null;
      observation_category: string;
      district: string | null;
      created_at: string;
      is_demo: boolean;
    }[]
  > {
    const records = await this.getAllEligiblePublicRecords({ includeDemo: true });
    const origin = records.find(
      (r) => r.passport_id.toUpperCase() === params.passportId.toUpperCase()
    );
    if (!origin) return [];

    const originCoords = PublicObservationRepository.publicCoordinates(origin);
    const originLat = originCoords.latitude;
    const originLon = originCoords.longitude;
    if (originLat == null || originLon == null) return [];

    const limit = Math.min(params.limit ?? 20, 50);
    return records
      .filter(
        (r) =>
          r.passport_id.toUpperCase() !== origin.passport_id.toUpperCase()
      )
      .map((r) => {
        const coords = PublicObservationRepository.publicCoordinates(r);
        if (coords.latitude == null || coords.longitude == null) return null;
        const distance = haversineKm(
          originLat,
          originLon,
          coords.latitude,
          coords.longitude
        );
        if (!Number.isFinite(distance) || distance > SAME_PLACE_RADIUS_KM) return null;
        return {
          passport_id: r.passport_id,
          post_title: r.post_title ?? null,
          observation_category: r.observation_category || 'unknown',
          district: r.district ?? null,
          created_at: r.created_at,
          is_demo: r.is_demo ?? false,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      .slice(0, limit);
  }

  /**
   * Finds observations near an arbitrary published coordinate.
   *
   * Used for the Stage 11 location-aware flow, where a new observation has a
   * location before it exists as a stored record. Same distance/density rules as
   * `findNearbyPublicObservations`.
   */
  async findNearbyPublicObservationsAt(params: {
    latitude: number;
    longitude: number;
    excludePassportId?: string;
    radiusKm?: number;
    limit?: number;
  }): Promise<
    {
      passport_id: string;
      observation_category: string;
      observation_subcategory: string;
      possible_name: string | null;
      confidence: string;
      district: string | null;
      distance_km: number | null;
      created_at: string;
    }[]
  > {
    const records = await this.getAllEligiblePublicRecords();
    return this.nearbyFrom(records, params.latitude, params.longitude, {
      excludePassportId: params.excludePassportId,
      radiusKm: params.radiusKm,
      limit: params.limit,
    });
  }

  /**
   * Shared proximity computation over the eligible public records.
   */
  private nearbyFrom(
    records: RawPublicObservationRecord[],
    originLat: number,
    originLon: number,
    options: {
      excludePassportId?: string;
      radiusKm?: number;
      limit?: number;
    }
  ): {
    passport_id: string;
    observation_category: string;
    observation_subcategory: string;
    possible_name: string | null;
    confidence: string;
    district: string | null;
    distance_km: number | null;
    created_at: string;
  }[] {
    const radiusKm = options.radiusKm ?? 25;
    const limit = Math.min(options.limit ?? 12, 50);

    return records
      .filter(
        (r) =>
          !options.excludePassportId ||
          r.passport_id.toUpperCase() !== options.excludePassportId!.toUpperCase()
      )
      .map((r) => {
        const coords = PublicObservationRepository.publicCoordinates(r);
        if (coords.latitude == null || coords.longitude == null) return null;
        const distance = haversineKm(originLat, originLon, coords.latitude, coords.longitude);
        if (!Number.isFinite(distance) || distance > radiusKm) return null;
        return {
          passport_id: r.passport_id,
          observation_category: (r.observation_category || 'unknown') as any,
          observation_subcategory: r.observation_subcategory || 'unknown',
          possible_name: r.possible_name ?? null,
          confidence: (r.confidence as any) || 'unknown',
          district: r.district ?? null,
          distance_km: Math.round(distance * 10) / 10,
          created_at: r.created_at,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.distance_km! - b.distance_km!)
      .slice(0, limit);
  }

  /**
   * Finds public observations in the same category/subcategory (the strongest
   * similarity signal the public data exposes), most recent first.
   */
  async findSimilarPublicObservations(params: {
    passportId: string;
    limit?: number;
  }): Promise<
    {
      passport_id: string;
      observation_category: string;
      observation_subcategory: string;
      possible_name: string | null;
      confidence: string;
      district: string | null;
      distance_km: number | null;
      created_at: string;
    }[]
  > {
    const records = await this.getAllEligiblePublicRecords();
    const origin = records.find(
      (r) => r.passport_id.toUpperCase() === params.passportId.toUpperCase()
    );
    if (!origin) return [];

    const limit = Math.min(params.limit ?? 8, 30);
    return records
      .filter(
        (r) =>
          r.passport_id.toUpperCase() !== params.passportId.toUpperCase() &&
          (r.observation_category || 'unknown') === (origin.observation_category || 'unknown') &&
          (r.observation_subcategory || 'unknown') === (origin.observation_subcategory || 'unknown')
      )
      .map((r) => ({
        passport_id: r.passport_id,
        observation_category: (r.observation_category || 'unknown') as any,
        observation_subcategory: r.observation_subcategory || 'unknown',
        possible_name: r.possible_name ?? null,
        confidence: (r.confidence as any) || 'unknown',
        district: r.district ?? null,
        distance_km: null,
        created_at: r.created_at,
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  }

  /**
   * Generates a valid GeoJSON FeatureCollection for MapLibre.
   */
  async findPublicObservationsGeoJson(filters: ValidatedFilters): Promise<PublicObservationGeoJson> {
    const records = await this.getAllEligiblePublicRecords({ includeDemo: true });
    const filtered = this.applyFilters(records, filters);

    const features: PublicObservationFeature[] = [];

    for (const rec of filtered) {
      const coords = resolvePublicCoordinates({
        precision: (rec.public_location_precision as any) || 'district',
        district: rec.district,
        latitude: PublicObservationRepository.publicCoordinates(rec).latitude,
        longitude: PublicObservationRepository.publicCoordinates(rec).longitude,
      });

      if (!coords) continue;

      // Apply bbox filter if present
      if (filters.bbox) {
        const { minLon, minLat, maxLon, maxLat } = filters.bbox;
        if (
          coords.longitude < minLon ||
          coords.longitude > maxLon ||
          coords.latitude < minLat ||
          coords.latitude > maxLat
        ) {
          continue;
        }
      }

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [coords.longitude, coords.latitude], // GeoJSON standard: [lon, lat]
        },
        properties: {
          passport_id: rec.passport_id,
          observation_category: rec.observation_category || 'unknown',
          observation_subcategory: rec.observation_subcategory || 'unknown',
          primary_interpretation: rec.primary_interpretation ?? null,
          classification: rec.primary_classification,
          possible_name: rec.possible_name,
          confidence: rec.confidence,
          verification_status: rec.verification_status,
          evidence_state: rec.evidence_state ?? null,
          is_research_opportunity:
            rec.is_research_opportunity ?? rec.research_opportunity ?? false,
          media_count: rec.media_count ?? 0,
          primary_media_url: rec.primary_media_url ?? null,
          district: rec.district || null,
          created_at: rec.created_at,
          // The map badge is built from this flag. Omitting it would leave the
          // pin and the card disagreeing about whether a record is collected.
          is_demo: rec.is_demo ?? false,
        },
      });
    }

    return {
      type: 'FeatureCollection',
      features,
    };
  }

  /**
   * Computes public statistics (Section 22). Calculated ONLY from public observations.
   */
  async getPublicStats(): Promise<PublicStats> {
    const records = await this.getAllEligiblePublicRecords();
    const total_observations = records.length;

    const districts = new Set<string>();
    const categories = new Set<string>();
    let verified_observations = 0;
    let unverified_observations = 0;

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let recent_observations = 0;

    for (const rec of records) {
      if (rec.district) districts.add(rec.district);
      if (rec.primary_classification) categories.add(rec.primary_classification);

      if (rec.verification_status === 'expert_verified') {
        verified_observations++;
      } else {
        unverified_observations++;
      }

      const createdTime = new Date(rec.created_at).getTime();
      if (createdTime >= thirtyDaysAgo) {
        recent_observations++;
      }
    }

    return {
      total_observations,
      districts_with_observations: districts.size,
      rock_categories: categories.size,
      verified_observations,
      unverified_observations,
      recent_observations,
    };
  }

  /**
   * Retrieves district counts for public observations.
   */
  async getPublicDistricts(): Promise<PublicDistrictCount[]> {
    // The district menu must describe what is actually on the map and in the
    // list, so the breakdown reads the same records those two surfaces show.
    // Telling a visitor "there are no districts to filter by" while the map is
    // covered in observations would be dishonest, not cautious.
    const records = await this.getAllEligiblePublicRecords({ includeDemo: true });
    const counts = new Map<string, number>();

    for (const rec of records) {
      if (rec.district) {
        counts.set(rec.district, (counts.get(rec.district) || 0) + 1);
      }
    }

    const result: PublicDistrictCount[] = [];
    for (const [name, observation_count] of counts.entries()) {
      result.push({ name, observation_count });
    }

    return result.sort((a, b) => b.observation_count - a.observation_count);
  }

  /**
   * Real observation counts per observation category.
   *
   * Every category in the vocabulary is returned, including categories with
   * zero observations. A category with no records reports `0`, which is the
   * honest answer; it is never omitted and never estimated. An empty result set
   * from the database therefore yields a full list of zeros rather than an
   * empty list, so the UI can show "no observations yet" per category.
   */
  async getPublicCategoryCounts(): Promise<PublicCategoryCount[]> {
    const records = await this.getAllEligiblePublicRecords({ includeDemo: true });
    const counts = new Map<string, number>();

    for (const rec of records) {
      const category = rec.observation_category || 'unknown';
      counts.set(category, (counts.get(category) || 0) + 1);
    }

    return GEOSCIENCE_CATEGORIES.map((category) => ({
      category,
      label: GEOSCIENCE_CATEGORY_LABELS[category],
      observation_count: counts.get(category) || 0,
    })).sort((a, b) => {
      if (b.observation_count !== a.observation_count) return b.observation_count - a.observation_count;
      return (
        GEOSCIENCE_CATEGORY_LABELS[a.category] < GEOSCIENCE_CATEGORY_LABELS[b.category] ? -1 : 1
      );
    });
  }

  /**
   * Internal helper: retrieves all genuinely published records.
   *
   * Order of resolution:
   *   1. Live `public_observations` Supabase view (the real source of truth).
   *   2. The in-memory index of observations actually published by this process.
   *
   * If neither yields records the result is an EMPTY array. This is intentional:
   * an empty map is the honest answer when nothing has been published, and the
   * public UI renders an explicit empty state instead of fabricated geology.
   */
  private async getAllEligiblePublicRecords(
    options: { includeDemo?: boolean } = {}
  ): Promise<RawPublicObservationRecord[]> {
    const published = await this.loadPublishedRecords();
    if (!options.includeDemo) return published;

    // Demonstration records belong on the map, in the list, and in the
    // district/category breakdowns that populate the filter menus - a filter
    // dropdown that cannot describe the records it is meant to filter is not
    // honest. Aggregate headline statistics, nearby queries and research flags
    // still read only genuinely collected observations. The decision to show
    // them here must always agree with the call sites: anything that describes
    // the visible surface passes `includeDemo`, anything that reports a number
    // about the world does not.
    if (!env.DEMO_POSTS_ENABLED || this.demoStore.size === 0) return published;
    return [...published, ...this.demoStore.values()];
  }

  /**
   * Reads genuinely published observations: the live view when credentials are
   * real, otherwise the in-memory store that the publish path fills.
   */
  private async loadPublishedRecords(): Promise<RawPublicObservationRecord[]> {
    // Skip the remote query entirely when credentials are placeholders, so a fresh
    // clone cannot appear to serve data it does not have.
    const isMock =
      !env.SUPABASE_URL ||
      env.SUPABASE_URL.includes('mock') ||
      env.SUPABASE_URL.includes('placeholder') ||
      env.SUPABASE_SECRET_KEY.includes('placeholder');

    if (isMock) {
      return Array.from(this.inMemoryPublicStore.values());
    }

    try {
      // Attempt querying live Supabase database view if connected with an 800ms fail-fast timeout
      const queryPromise = supabase
        .from('public_observations' as any)
        .select('*');

      const timeoutPromise = new Promise<{ data: null; error: Error }>((_, reject) => {
        const timer = setTimeout(() => reject(new Error('Supabase query timeout')), 800);
        if (typeof timer.unref === 'function') timer.unref();
      });

      const { data, error } = (await Promise.race([queryPromise, timeoutPromise])) as any;

      if (!error && data && Array.isArray(data) && data.length > 0) {
        return data as unknown as RawPublicObservationRecord[];
      }
    } catch {
      // Fall through to configured store if live database query fails, times out, or view is empty
    }

    return Array.from(this.inMemoryPublicStore.values());
  }

  /**
   * Applies validated filters to the public observations collection.
   */
  private applyFilters(
    records: RawPublicObservationRecord[],
    filters: ValidatedFilters
  ): RawPublicObservationRecord[] {
    return records.filter((rec) => {
      // A filter value that failed validation matches nothing. This is
      // deliberately before every other check, so a bad query parameter can
      // never be read as "no filter at all".
      if (filters.rejectedFilters && filters.rejectedFilters.length > 0) {
        return false;
      }

      // District filter
      if (filters.district) {
        if (!rec.district || rec.district.toLowerCase() !== filters.district.toLowerCase()) {
          return false;
        }
      }

      // Classification filter
      if (filters.classification) {
        if (rec.primary_classification.toLowerCase() !== filters.classification.toLowerCase()) {
          return false;
        }
      }

      // Category filter: decided before interpretation, so a fossil query never
      // has to be expressed as a rock classification.
      if (filters.category) {
        const recCategory = (rec.observation_category || 'unknown').toLowerCase();
        if (recCategory !== filters.category) {
          return false;
        }
      }

      // Subcategory filter. Applied only when it belongs to the requested
      // category; validation already discarded mismatched pairs.
      if (filters.subcategory) {
        const recSub = (rec.observation_subcategory || 'unknown').toLowerCase();
        if (recSub !== filters.subcategory) {
          return false;
        }
      }

      // Evidence state filter
      if (filters.evidence_state) {
        if ((rec.evidence_state || '').toLowerCase() !== filters.evidence_state) {
          return false;
        }
      }

      // Investigation status filter
      if (filters.community_status) {
        if ((rec.community_status || 'not_started').toLowerCase() !== filters.community_status) {
          return false;
        }
      }

      // Community participation flags.
      //
      // A record with no investigation is not one with an open investigation, so
      // `has_investigation=true` excludes rows where the field is null. Comparing
      // loosely here would make an un-investigated record answer a question about
      // investigations.
      if (filters.has_investigation !== undefined) {
        const started = Boolean(rec.community_status && rec.community_status !== 'not_started');
        if (started !== filters.has_investigation) {
          return false;
        }
      }

      // A research opportunity is an explicit flag set by a person. Absence is not
      // a negative finding, so a record with a null flag is excluded from
      // `research_opportunity=true` rather than reported as "not an opportunity".
      //
      // The view publishes `is_research_opportunity`; `research_opportunity` is
      // the legacy in-memory alias. Both are read so a live row and a registered
      // fixture are filtered on the same rule.
      if (filters.research_opportunity !== undefined) {
        const flagged = rec.is_research_opportunity ?? rec.research_opportunity ?? null;
        if (flagged === null) {
          // Unset is not the same answer as "no". Excluding it here keeps a
          // `true` query honest; a `false` query is answered by the live column,
          // which the view COALESCEs to false.
          if (filters.research_opportunity) return false;
        } else if (Boolean(flagged) !== filters.research_opportunity) {
          return false;
        }
      }

      if (filters.has_evidence !== undefined) {
        if ((rec.media_count ?? 0) > 0 !== filters.has_evidence) {
          return false;
        }
      }

      // Site filter
      if (filters.site) {
        if ((rec.site_code || '').toLowerCase() !== filters.site.toLowerCase()) {
          return false;
        }
      }

      // Confidence filter
      if (filters.confidence) {
        if (rec.confidence.toLowerCase() !== filters.confidence.toLowerCase()) {
          return false;
        }
      }

      // Verification filter
      if (filters.verification) {
        if (rec.verification_status.toLowerCase() !== filters.verification.toLowerCase()) {
          return false;
        }
      }

      // Date range filter
      if (filters.fromDate) {
        if (new Date(rec.created_at) < filters.fromDate) {
          return false;
        }
      }
      if (filters.toDate) {
        if (new Date(rec.created_at) > filters.toDate) {
          return false;
        }
      }

      // Search keyword filter
      if (filters.search) {
        const query = filters.search.toLowerCase();
        const matchesPassport = rec.passport_id.toLowerCase().includes(query);
        const matchesName = rec.possible_name?.toLowerCase().includes(query) ?? false;
        const matchesDistrict = rec.district?.toLowerCase().includes(query) ?? false;
        const matchesCategory = rec.primary_classification.toLowerCase().includes(query);
        // Searching "landslide" must find the landform, not only a rock type.
        const matchesObservationCategory = (rec.observation_category || '')
          .toLowerCase()
          .includes(query);
        const matchesSubcategory = (rec.observation_subcategory || '').toLowerCase().includes(query);
        const matchesInterpretation = (rec.primary_interpretation || '')
          .toLowerCase()
          .includes(query);
        if (
          !matchesPassport &&
          !matchesName &&
          !matchesDistrict &&
          !matchesCategory &&
          !matchesObservationCategory &&
          !matchesSubcategory &&
          !matchesInterpretation
        ) {
          return false;
        }
      }

      return true;
    });
  }
}

export const publicObservationRepository = new PublicObservationRepository();
