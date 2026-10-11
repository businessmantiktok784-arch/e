import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { resolvePublicCoordinates } from '../utils/public-location.js';
import { demoSites, siteObservationRows, demoSiteEvidenceState } from '../data/demo-community.js';
import { communityRepository } from './community.repository.js';
import type { EvidenceState, SiteGroupingBasis } from '../types/community.types.js';
import type { RockClassification } from '../ai/geological.types.js';
import type {
  GeologicalSiteRecord,
  PublicSiteSummary,
} from '../types/site.types.js';

/**
 * Geological site repository.
 *
 * REAL DATA POLICY: there is no seed data and no synthetic fallback. A site only
 * exists once the platform owner (or an evidence-backed grouping) creates it in
 * the database. Observations are never silently clustered into sites by a
 * distance threshold — `grouping_basis` records how a grouping came to exist and
 * is surfaced publicly so a reader can tell a curated site from a suggestion.
 *
 * The single exception is the labelled demonstration mode (see
 * `demoActive`): when `DEMO_POSTS_ENABLED` is on and no real database is
 * configured, the demonstration sites from `src/data/demo-community.ts` are
 * served, each marked `is_demo`, so the "Geological sites" view and the site
 * explorer can be exercised on an empty deployment without inventing data that
 * could be mistaken for collected records.
 */
export class SiteRepository {
  private get ready(): boolean {
    return isDatabaseConfigured();
  }

  /** True when the labelled demonstration sites should be served. */
  get demoActive(): boolean {
    return env.DEMO_POSTS_ENABLED && !isDatabaseConfigured();
  }

  private demoStore: GeologicalSiteRecord[] = [];

  /** Replaces the whole demonstration site store. Safe to call more than once. */
  registerDemoSites(sites: GeologicalSiteRecord[]): number {
    this.demoStore = sites;
    return this.demoStore.length;
  }

  async createSite(input: {
    title: string;
    description?: string | null;
    groupingBasis: SiteGroupingBasis;
    groupingEvidence?: string | null;
    district?: string | null;
    sector?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    publicLocationPrecision: 'district' | 'approximate' | 'exact';
    createdBy: string;
  }): Promise<GeologicalSiteRecord> {
    if (!this.ready) throw new Error('Creating a geological site requires a configured database.');

    const title = input.title.trim();
    if (!title) throw new Error('A site title is required.');
    if (input.district && !input.sector && input.groupingBasis === 'admin_curated') {
      // A curated site should be locatable. District alone is acceptable; we do
      // not require an exact coordinate because that would force false precision.
    }

    const hasPoint = typeof input.latitude === 'number' && typeof input.longitude === 'number';

    const { data, error } = await (supabase.from('geological_sites') as any)
      .insert({
        title,
        description: input.description?.trim() || null,
        grouping_basis: input.groupingBasis,
        grouping_evidence: input.groupingEvidence?.trim() || null,
        district: input.district ?? null,
        sector: input.sector ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        geom: hasPoint
          ? `SRID=4326;POINT(${input.longitude} ${input.latitude})`
          : null,
        public_location_precision: input.publicLocationPrecision,
        is_public: true,
        status: 'active',
        created_by: input.createdBy,
      })
      .select()
      .single();

    if (error || !data) throw new Error(`Could not create geological site: ${error?.message ?? 'unknown error'}`);
    return data as GeologicalSiteRecord;
  }

  async findSiteById(id: string): Promise<GeologicalSiteRecord | null> {
    if (this.demoActive) {
      return this.demoStore.find((s) => s.id === id) ?? null;
    }
    if (!this.ready || !id.trim()) return null;
    const { data, error } = await (supabase.from('geological_sites') as any)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      logger.warn('Failed to read geological site', { error: error.message });
      return null;
    }
    return (data as GeologicalSiteRecord) ?? null;
  }

  async findSiteByCode(siteCode: string): Promise<GeologicalSiteRecord | null> {
    const clean = (siteCode ?? '').trim().toUpperCase();
    if (!clean) return null;

    if (this.demoActive) {
      return this.demoStore.find((s) => s.site_code.toUpperCase() === clean) ?? null;
    }

    if (!this.ready) return null;
    const { data, error } = await (supabase.from('geological_sites') as any)
      .select('*')
      .eq('site_code', clean)
      .maybeSingle();
    if (error) {
      logger.warn('Failed to read geological site by code', { error: error.message });
      return null;
    }
    return (data as GeologicalSiteRecord) ?? null;
  }

  /**
   * Lists public sites via the `public_geological_sites` view, which already
   * nulls out coordinates that are not authorised for exact public release.
   */
  async listPublicSites(options: {
    district?: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: PublicSiteSummary[]; total: number }> {
    if (this.demoActive) {
      let rows = this.demoStore.filter((s) => s.is_public !== false && s.status === 'active');
      if (options.district) rows = rows.filter((s) => s.district === options.district);
      rows = [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const total = rows.length;
      return {
        rows: rows.slice(options.offset, options.offset + options.limit).map((s) => this.demoSummary(s)),
        total,
      };
    }

    if (!this.ready) return { rows: [], total: 0 };

    let query = (supabase.from('public_geological_sites') as any).select('*', { count: 'exact' });
    if (options.district) query = query.eq('district', options.district);

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(options.offset, options.offset + options.limit - 1);

    if (error) {
      logger.warn('Failed to list public geological sites', { error: error.message });
      return { rows: [], total: 0 };
    }

    return { rows: ((data ?? []) as any[]).map((row) => this.mapViewToSummary(row)), total: count ?? 0 };
  }

  /**
   * Reads one site's public summary straight from the `public_geological_sites`
   * view, so the aggregate counts and strongest evidence state come from the
   * database rather than being recomputed (and understated) from a capped page
   * of child rows.
   */
  async findPublicSiteSummaryById(id: string): Promise<PublicSiteSummary | null> {
    if (this.demoActive) {
      const site = this.demoStore.find((s) => s.id === id && s.is_public !== false);
      return site ? this.demoSummary(site) : null;
    }

    if (!this.ready) return null;

    const { data, error } = await (supabase.from('public_geological_sites') as any)
      .select('*')
      .eq('site_id', id)
      .maybeSingle();

    if (error) {
      logger.warn('Failed to read public geological site summary', { error: error.message });
      return null;
    }

    const row = (data ?? null) as any;
    return row ? this.mapViewToSummary(row) : null;
  }

  async listPublicSitesGeoJson(options: {
    district?: string;
    bbox?: { minLon: number; minLat: number; maxLon: number; maxLat: number };
    limit: number;
  }): Promise<{ type: 'FeatureCollection'; features: Array<Record<string, unknown>> }> {
    const empty = { type: 'FeatureCollection' as const, features: [] };

    if (this.demoActive) {
      let sites = this.demoStore.filter((s) => s.is_public !== false && s.status === 'active');
      if (options.district) sites = sites.filter((s) => s.district === options.district);

      if (options.bbox) {
        const { minLon, minLat, maxLon, maxLat } = options.bbox;
        sites = sites.filter(
          (s) =>
            typeof s.longitude === 'number' &&
            typeof s.latitude === 'number' &&
            s.longitude >= minLon &&
            s.longitude <= maxLon &&
            s.latitude >= minLat &&
            s.latitude <= maxLat
        );
      }

      const features: Array<Record<string, unknown>> = [];
      for (const site of [...sites].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, options.limit)) {
        const summary = this.demoSummary(site);
        if (summary.latitude === null || summary.longitude === null) continue;
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [summary.longitude, summary.latitude] },
          properties: {
            site_id: summary.site_id,
            site_code: summary.site_code,
            title: summary.title,
            district: summary.district,
            grouping_basis: summary.grouping_basis,
            location_precision: summary.location_precision,
            observation_count: summary.observation_count,
            investigation_count: summary.investigation_count,
            question_count: summary.question_count,
            evidence_count: summary.evidence_count,
            // Carried so a client can narrow sites by "what was observed" the
            // same way Explore narrows observations. Without it the category
            // filter could only ever apply to the unlocated posts list.
            observed_classifications: summary.observed_classifications,
            highest_evidence_state: summary.highest_evidence_state,
            is_demo: true,
          },
        });
      }
      return { ...empty, features };
    }

    if (!this.ready) return { ...empty, features: [] };

    let query = (supabase.from('public_geological_sites') as any).select('*');
    if (options.district) query = query.eq('district', options.district);

    if (options.bbox) {
      const { minLon, minLat, maxLon, maxLat } = options.bbox;
      // PostGIS bounding-box pre-filter, served through the spatial index.
      query = query.gte('public_longitude', minLon).lte('public_longitude', maxLon);
      query = query.gte('public_latitude', minLat).lte('public_latitude', maxLat);
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(options.limit);
    if (error) {
      logger.warn('Failed to list public geological sites GeoJSON', { error: error.message });
      return { ...empty, features: [] };
    }

    const features: Array<Record<string, unknown>> = [];
    for (const row of (data ?? []) as any[]) {
      const summary = this.mapViewToSummary(row);
      if (summary.latitude === null || summary.longitude === null) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [summary.longitude, summary.latitude] },
        properties: {
          site_id: summary.site_id,
          site_code: summary.site_code,
          title: summary.title,
          district: summary.district,
          grouping_basis: summary.grouping_basis,
          // Published so a map client can tell a precisely located site from one
          // shown at a district centroid. Without this a consumer would render
          // both as an equally authoritative marker.
          location_precision: summary.location_precision,
          observation_count: summary.observation_count,
          investigation_count: summary.investigation_count,
          question_count: summary.question_count,
          evidence_count: summary.evidence_count,
          observed_classifications: summary.observed_classifications,
          highest_evidence_state: summary.highest_evidence_state,
        },
      });
    }

    return { ...empty, features };
  }

  /**
   * The labelled demonstration observations, built once from the demo posts.
   *
   * They are shaped like the `public_observations` view rows (gated coordinates)
   * so the explorer and the nearby list resolve them through the same code path
   * as a real deployment.
   */
  private demoObservationViewsCache: any[] | null = null;

  private demoObservationViews(): any[] {
    if (!this.demoObservationViewsCache) {
      this.demoObservationViewsCache = siteObservationRows();
    }
    return this.demoObservationViewsCache;
  }

  /**
   * Maps a demonstration site to its public summary.
   *
   * Counts come live from the community repository's demonstration store, so a
   * visitor's in-memory vote, question or review is reflected here immediately
   * rather than being fixed at registration time.
   */
  private demoSummary(site: GeologicalSiteRecord): PublicSiteSummary {
    const coords = resolvePublicCoordinates({
      precision: site.public_location_precision,
      district: site.district ? site.district : null,
      latitude: site.latitude,
      longitude: site.longitude,
    });

    const counts = communityRepository.demoSiteCounts(site.id);
    const observations = this.demoObservationViews().filter((r) => r.district === site.district);
    const classifications = Array.from(
      new Set((observations as any[]).map((r) => r.primary_classification as string))
    );

    return {
      site_id: site.id,
      site_code: site.site_code,
      title: site.title,
      description: site.description,
      grouping_basis: site.grouping_basis,
      district: site.district,
      sector: site.sector,
      location_precision: site.public_location_precision,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      observation_count: observations.length,
      visit_count: counts.visit_count,
      investigation_count: counts.investigation_count,
      question_count: counts.question_count,
      evidence_count: counts.evidence_count,
      highest_evidence_state: demoSiteEvidenceState({
        distinctParticipants: counts.participants,
        evidenceCount: counts.evidence_count,
      }),
      observed_classifications: classifications as RockClassification[],
      districts_covered: site.district ? [site.district] : [],
      is_demo: true,
      created_at: site.created_at,
      updated_at: site.updated_at,
    };
  }

  /**
   * Maps a `public_geological_sites` view row to a public summary.
   *
   * Coordinates are re-resolved through the shared privacy helper so a site with
   * `district` or `approximate` precision can never leak its true position, even
   * if the view were to expose it.
   */
  private mapViewToSummary(row: any): PublicSiteSummary {
    const coords = resolvePublicCoordinates({
      precision: row.public_location_precision,
      district: row.district,
      latitude: row.public_latitude ?? null,
      longitude: row.public_longitude ?? null,
    });

    return {
      site_id: String(row.site_id),
      site_code: String(row.site_code),
      title: String(row.title ?? 'Untitled site'),
      description: row.description ?? null,
      grouping_basis: (row.grouping_basis ?? 'suggested') as SiteGroupingBasis,
      district: row.district ?? null,
      sector: row.sector ?? null,
      location_precision: (row.public_location_precision ?? 'district') as 'district' | 'approximate' | 'exact',
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      observation_count: Number(row.observation_count ?? 0),
      visit_count: Number(row.visit_count ?? 0),
      investigation_count: Number(row.investigation_count ?? 0),
      question_count: Number(row.question_count ?? 0),
      evidence_count: Number(row.evidence_count ?? 0),
      highest_evidence_state: (row.highest_evidence_state ?? null) as EvidenceState | null,
      observed_classifications: (row.observed_classifications ?? []) as RockClassification[],
      districts_covered: (row.districts_covered ?? []) as string[],
      is_demo: row.is_demo === true ? true : undefined,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at ?? row.created_at),
    };
  }

  /** Observations attached to a site, via the real `site_id` foreign key. */
  async listObservationsForSite(siteId: string, limit = 100): Promise<any[]> {
    if (this.demoActive) {
      const site = this.demoStore.find((s) => s.id === siteId);
      if (!site) return [];
      return this.demoObservationViews()
        .filter((row) => row.district === site.district)
        .slice(0, limit);
    }

    if (!this.ready) return [];
    const { data, error } = await (supabase.from('public_observations') as any)
      .select('*')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.warn('Failed to list site observations', { error: error.message });
      return [];
    }
    return (data ?? []) as any[];
  }

  /**
   * Nearby public observations using PostGIS geography distance.
   *
   * Distances are computed in the database against `geom`; only rows the public
   * view already exposes are considered, so a private coordinate is never used
   * as a distance reference.
   */
  async findNearbyObservations(
    latitude: number,
    longitude: number,
    radiusKm: number,
    excludePassportId?: string,
    limit = 25
  ): Promise<any[]> {
    if (this.demoActive) {
      return this.demoObservationViews()
        .filter((r) => r.public_latitude !== null && r.public_longitude !== null)
        .filter((r) => r.passport_id !== excludePassportId)
        .map((r) => ({
          row: r,
          distance_km: haversineKm(
            latitude,
            longitude,
            Number(r.public_latitude),
            Number(r.public_longitude)
          ),
        }))
        .filter((r) => Number.isFinite(r.distance_km) && r.distance_km <= radiusKm)
        .sort((a, b) => a.distance_km - b.distance_km)
        .slice(0, limit)
        .map((r) => ({ ...r.row, distance_km: Math.round(r.distance_km * 10) / 10 }));
    }

    if (!this.ready) return [];

    // `public_observations` exposes no `latitude`/`longitude` column: the view
    // gates the true coordinate into `public_latitude`/`public_longitude` and
    // NULLs it unless the contributor published at exact precision. Filtering on
    // the raw name therefore matches nothing, so "nearby observations" was
    // silently always empty. Proximity is measured from the published coordinate
    // only - an observation whose contributor withheld location is not a
    // candidate, rather than being located against its withheld coordinate.
    const { data, error } = await (supabase.from('public_observations') as any)
      .select('*')
      .not('public_latitude', 'is', null)
      .not('public_longitude', 'is', null)
      .limit(500);

    if (error) {
      logger.warn('Failed to load observations for proximity search', { error: error.message });
      return [];
    }

    const originLat = latitude;
    const originLon = longitude;
    const rows = ((data ?? []) as any[])
      .filter((r) => r.passport_id !== excludePassportId)
      .map((r) => ({
        row: r,
        distance_km: haversineKm(
          originLat,
          originLon,
          Number(r.public_latitude),
          Number(r.public_longitude)
        ),
      }))
      .filter((r) => Number.isFinite(r.distance_km) && r.distance_km <= radiusKm)
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, limit);

    return rows.map((r) => ({ ...r.row, distance_km: Math.round(r.distance_km * 10) / 10 }));
  }
}

/**
 * Great-circle distance in kilometres.
 *
 * Used as a proximity fallback when no PostGIS `ST_DWithin` RPC is available.
 * The radius is a search aid for "what is near this point", never a claim that
 * two observations belong to the same geological site.
 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const siteRepository = new SiteRepository();