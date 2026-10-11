import type { PublicObservationFilters } from '../types/public.types.js';
import {
  GEOSCIENCE_SUBCATEGORIES,
  isGeoscienceCategory,
  isSubcategoryOf,
} from '../ai/geoscience-taxonomy.js';
import {
  EVIDENCE_STATES,
  INVESTIGATION_STATUSES,
  isEvidenceState,
  type EvidenceState,
} from '../types/community.types.js';

export interface ValidatedFilters {
  page: number;
  limit: number;
  district?: string;
  classification?: string;
  category?: string;
  subcategory?: string;
  confidence?: string;
  verification?: string;
  evidence_state?: string;
  community_status?: string;
  site?: string;
  /** Restrict to records attached to at least one public community investigation. */
  has_investigation?: boolean;
  /** Restrict to records the community flagged as a research opportunity. */
  research_opportunity?: boolean;
  /** Restrict to records carrying at least one submitted evidence item. */
  has_evidence?: boolean;
  fromDate?: Date;
  toDate?: Date;
  bbox?: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  search?: string;
  /**
   * Query parameters that were supplied but are not valid values. A rejected
   * filter must produce zero results, never a fallback to "no filter at all":
   * silently ignoring `category=meteorite` would answer the question the client
   * did not ask and hide the mistake.
   */
  rejectedFilters?: string[];
}

const ALLOWED_CLASSIFICATIONS = new Set([
  'igneous',
  'sedimentary',
  'metamorphic',
  'unclassified',
]);

const ALLOWED_CONFIDENCES = new Set(['high', 'moderate', 'low', 'insufficient']);

const ALLOWED_VERIFICATIONS = new Set(['unverified', 'expert_verified']);

/**
 * Evidence state and investigation status are reported as raw strings from the
 * database. They are validated against the canonical vocabulary declared in
 * `community.types.ts` rather than against a second copy of the list.
 *
 * A duplicated list previously drifted: the filter accepted `community_reported`
 * and `field_verified`, which no database row can have, and rejected
 * `community_supported`, `community_investigated` and `unresolved`, which every
 * qualifying row does have. Both directions fail silently as zero results, so
 * the drift was invisible. Deriving the sets removes the possibility.
 */
const ALLOWED_EVIDENCE_STATES: ReadonlySet<string> = new Set<string>(EVIDENCE_STATES);

/**
 * Investigation status vocabulary. `observations.community_status` is a
 * superset of this because an observation may be `not_started`, so that value is
 * admitted here too.
 */
const ALLOWED_COMMUNITY_STATUSES: ReadonlySet<string> = new Set<string>([
  ...INVESTIGATION_STATUSES,
  'not_started',
]);

export { isEvidenceState };
export type { EvidenceState };

/**
 * Validates, normalizes, and bounds all public API query parameters.
 */
export function validatePublicFilters(query: Record<string, unknown>): ValidatedFilters {
  // 1. Pagination bounds
  let page = parseInt(String(query.page || '1'), 10);
  if (isNaN(page) || page < 1) page = 1;

  let limit = parseInt(String(query.limit || '50'), 10);
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100; // Enforce maximum 100

  // 2. District
  let district: string | undefined;
  if (typeof query.district === 'string' && query.district.trim().length > 0) {
    district = query.district.trim().slice(0, 50);
  }

  // 3. Classification (legacy rock-only filter, still honoured)
  let classification: string | undefined;
  if (typeof query.classification === 'string') {
    const lower = query.classification.trim().toLowerCase();
    if (ALLOWED_CLASSIFICATIONS.has(lower)) {
      classification = lower;
    }
  }

  // 4. Category and subcategory
  //
  // A category that is not in the vocabulary is rejected rather than dropped.
  // Dropping it would remove the filter and return every record, which reads as
  // "this category has observations" when in fact the category does not exist.
  const rejected: string[] = [];
  let category: string | undefined;
  let subcategory: string | undefined;
  if (typeof query.category === 'string' && query.category.trim().length > 0) {
    const lower = query.category.trim().toLowerCase();
    if (isGeoscienceCategory(lower)) {
      category = lower;
      if (typeof query.subcategory === 'string' && query.subcategory.trim().length > 0) {
        const sub = query.subcategory.trim().toLowerCase();
        if (isSubcategoryOf(lower, sub)) {
          subcategory = sub;
        } else {
          rejected.push('subcategory');
        }
      }
    } else {
      rejected.push('category');
    }
  } else if (typeof query.subcategory === 'string' && query.subcategory.trim().length > 0) {
    // A subcategory without a category cannot be checked, so it cannot be
    // honoured. Reject it rather than filtering across every category.
    rejected.push('subcategory');
  }

  // 5. Confidence
  let confidence: string | undefined;
  if (typeof query.confidence === 'string') {
    const lower = query.confidence.trim().toLowerCase();
    if (ALLOWED_CONFIDENCES.has(lower)) {
      confidence = lower;
    }
  }

  // 6. Verification status
  let verification: string | undefined;
  if (typeof query.verification === 'string') {
    const lower = query.verification.trim().toLowerCase();
    if (ALLOWED_VERIFICATIONS.has(lower)) {
      verification = lower;
    }
  }

  // 6b. Evidence state and investigation status
  let evidence_state: string | undefined;
  if (typeof query.evidence_state === 'string') {
    const lower = query.evidence_state.trim().toLowerCase();
    if (ALLOWED_EVIDENCE_STATES.has(lower)) {
      evidence_state = lower;
    }
  }

  let community_status: string | undefined;
  if (typeof query.community_status === 'string') {
    const lower = query.community_status.trim().toLowerCase();
    if (ALLOWED_COMMUNITY_STATUSES.has(lower)) {
      community_status = lower;
    }
  }

  // 6c. Site code
  let site: string | undefined;
  if (typeof query.site === 'string' && query.site.trim().length > 0) {
    site = query.site.trim().slice(0, 50);
  }

  // 6d. Community participation flags
  //
  // These are strictly boolean. An unrecognised value is rejected rather than
  // coerced, because treating `has_investigation=nope` as false would quietly
  // return records that have no investigation and look like a correct answer.
  const parseBooleanFlag = (value: unknown): boolean | undefined => {
    if (typeof value !== 'string') return undefined;
    const lower = value.trim().toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
    return undefined;
  };

  const has_investigation = parseBooleanFlag(query.has_investigation);
  if (has_investigation === undefined && query.has_investigation !== undefined) {
    rejected.push('has_investigation');
  }
  const research_opportunity = parseBooleanFlag(query.research_opportunity);
  if (research_opportunity === undefined && query.research_opportunity !== undefined) {
    rejected.push('research_opportunity');
  }
  const has_evidence = parseBooleanFlag(query.has_evidence);
  if (has_evidence === undefined && query.has_evidence !== undefined) {
    rejected.push('has_evidence');
  }

  // 7. Dates
  let fromDate: Date | undefined;
  if (typeof query.from === 'string') {
    const parsed = new Date(query.from);
    if (!isNaN(parsed.getTime())) {
      fromDate = parsed;
    }
  }

  let toDate: Date | undefined;
  if (typeof query.to === 'string') {
    const parsed = new Date(query.to);
    if (!isNaN(parsed.getTime())) {
      toDate = parsed;
    }
  }

  // 8. Bounding box: minLon,minLat,maxLon,maxLat
  let bbox: ValidatedFilters['bbox'];
  if (typeof query.bbox === 'string') {
    const parts = query.bbox.split(',').map((p) => parseFloat(p.trim()));
    if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
      const [minLon, minLat, maxLon, maxLat] = parts;
      if (
        minLon >= -180 &&
        maxLon <= 180 &&
        minLat >= -90 &&
        maxLat <= 90 &&
        minLon <= maxLon &&
        minLat <= maxLat
      ) {
        bbox = { minLon, minLat, maxLon, maxLat };
      }
    }
  }

  // 9. Search query
  let search: string | undefined;
  if (typeof query.search === 'string' && query.search.trim().length > 0) {
    search = query.search.trim().slice(0, 100);
  }

  return {
    page,
    limit,
    district,
    classification,
    category,
    subcategory,
    confidence,
    verification,
    evidence_state,
    community_status,
    site,
    has_investigation,
    research_opportunity,
    has_evidence,
    fromDate,
    toDate,
    bbox,
    search,
    rejectedFilters: rejected.length > 0 ? rejected : undefined,
  };
}

/**
 * All subcategories of a category, for populating a filter control.
 */
export function listSubcategories(category: string): string[] {
  if (!isGeoscienceCategory(category)) return [];
  return GEOSCIENCE_SUBCATEGORIES[category].map((s) => s.id);
}