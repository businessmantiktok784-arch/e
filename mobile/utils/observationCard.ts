import type { ObservationSummary } from '../types/api';

export interface ObservationCardViewModel { title: string; category: string; location: string | null; description: string | null; verification: string; evidence: string | null; date: string | null }
export function observationCardViewModel(observation: ObservationSummary): ObservationCardViewModel {
  return {
    title: observation.post_title?.trim() || observation.possible_name?.trim() || observation.observation_subcategory || observation.observation_category,
    category: observation.observation_category + (observation.observation_subcategory ? ` · ${observation.observation_subcategory}` : ''),
    location: observation.district || (observation.location_precision === 'private' ? 'Location kept private' : null),
    description: observation.primary_interpretation,
    verification: observation.verification_status === 'expert_verified' ? 'Expert reviewed' : 'Unverified',
    evidence: observation.evidence_state?.replaceAll('_', ' ') || null,
    date: observation.created_at && !Number.isNaN(Date.parse(observation.created_at)) ? new Date(observation.created_at).toLocaleDateString() : null,
  };
}
