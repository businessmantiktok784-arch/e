/*
 * ============================================================================
 *  SYNTHETIC_TEST_FIXTURE
 *  NOT_REAL_GEOLOGICAL_DATA
 * ============================================================================
 *
 *  Every record in this file is INVENTED. It exists ONLY so automated software
 *  tests have deterministic inputs to assert against.
 *
 *  Hard rules enforced by this module:
 *   1. These records are NEVER served by any production API route.
 *   2. These records are NEVER used to produce a scientific conclusion,
 *      accuracy figure, confusion matrix, or research finding.
 *   3. Nothing in `src/` may import this file. Only `tests/` may.
 *
 *  Production geological content must originate from real observations created
 *  through the actual WhatsApp -> AI -> database pipeline.
 * ============================================================================
 */

import type { RawPublicObservationRecord } from '../../src/repositories/public-observation.repository.js';

export const SYNTHETIC_FIXTURE_NOTICE =
  'SYNTHETIC_TEST_FIXTURE — NOT REAL GEOLOGICAL DATA' as const;

export const SYNTHETIC_PUBLIC_OBSERVATIONS: RawPublicObservationRecord[] = [
  {
    passport_id: 'RT-RW-000101',
    primary_classification: 'igneous',
    possible_name: 'granite',
    confidence: 'moderate',
    confidence_score: 0.76,
    verification_status: 'unverified',
    district: 'Gasabo',
    public_location_precision: 'district',
    latitude: -1.9,
    longitude: 30.1333,
    observed_features: ['Coarse visible grains', 'Light-colored feldspar and quartz', 'Massive plutonic texture'],
    reasoning: 'Interlocking crystalline texture compatible with granitic intrusion.',
    limitations: ['Photograph cannot verify exact mineral hardness or chemical composition'],
    recommended_next_steps: ['Take a close-up photo under natural sunlight', 'Check for magnetic attraction'],
    safety_note: 'Preliminary AI-assisted interpretation, not a laboratory or expert determination.',
    data_quality_status: 'complete',
    created_at: '2026-09-20T08:30:00Z',
  },
  {
    passport_id: 'RT-RW-000102',
    primary_classification: 'igneous',
    possible_name: 'pegmatite',
    confidence: 'moderate',
    confidence_score: 0.72,
    verification_status: 'unverified',
    district: 'Gasabo',
    public_location_precision: 'district',
    latitude: -1.89,
    longitude: 30.12,
    observed_features: ['Very large crystals', 'Book mica sheets', 'Quartz core'],
    reasoning: 'Coarse crystalline intrusive fabric characteristic of regional pegmatite veins.',
    limitations: ['Field context not fully visible'],
    recommended_next_steps: ['Photograph contact with surrounding country rock'],
    safety_note: 'Preliminary AI assessment only.',
    data_quality_status: 'partial',
    created_at: '2026-09-21T09:15:00Z',
  },
  {
    passport_id: 'RT-RW-000103',
    primary_classification: 'metamorphic',
    possible_name: 'quartzite',
    confidence: 'high',
    confidence_score: 0.84,
    verification_status: 'unverified',
    district: 'Gasabo',
    public_location_precision: 'district',
    latitude: -1.915,
    longitude: 30.145,
    observed_features: ['Conchoidal fracture', 'Vitreous luster', 'Dense recrystallized quartz'],
    reasoning: 'Metamorphic recrystallization of sandstone into tough quartzite ridge rock.',
    limitations: ['Cross-bedding structures weathered'],
    recommended_next_steps: ['Examine fresh broken surface'],
    safety_note: 'Preliminary AI assessment only.',
    data_quality_status: 'complete',
    created_at: '2026-09-22T10:00:00Z',
  },
  {
    passport_id: 'RT-RW-000104',
    primary_classification: 'igneous',
    possible_name: 'basalt',
    confidence: 'high',
    confidence_score: 0.88,
    verification_status: 'unverified',
    district: 'Musanze',
    public_location_precision: 'district',
    latitude: -1.5,
    longitude: 29.6333,
    observed_features: ['Dark aphanitic matrix', 'Vesicular degassing cavities', 'Uniform volcanic texture'],
    reasoning: 'Extrusive volcanic lava typical of the Virunga volcanic field in northern Rwanda.',
    limitations: ['Microcrystalline mineralogy requires thin section'],
    recommended_next_steps: ['Photograph vesicular vs dense portions'],
    safety_note: 'Preliminary AI-assisted interpretation, not a laboratory determination.',
    data_quality_status: 'complete',
    created_at: '2026-09-23T11:20:00Z',
  },
  {
    passport_id: 'RT-RW-000105',
    primary_classification: 'igneous',
    possible_name: 'volcanic tuff',
    confidence: 'moderate',
    confidence_score: 0.69,
    verification_status: 'unverified',
    district: 'Musanze',
    public_location_precision: 'district',
    latitude: -1.512,
    longitude: 29.645,
    observed_features: ['Pyroclastic ash fragments', 'Porous weathered matrix', 'Angular lithic clasts'],
    reasoning: 'Consolidated volcanic ash and ejecta from quaternary volcanic activity.',
    limitations: ['Degree of weathering obscures fresh mineral grains'],
    recommended_next_steps: ['Inspect dry versus wet surface'],
    safety_note: 'Preliminary AI-assisted interpretation only.',
    data_quality_status: 'partial',
    created_at: '2026-09-24T14:10:00Z',
  },
  {
    passport_id: 'RT-RW-000106',
    primary_classification: 'metamorphic',
    possible_name: 'schist',
    confidence: 'moderate',
    confidence_score: 0.74,
    verification_status: 'unverified',
    district: 'Huye',
    public_location_precision: 'district',
    latitude: -2.6,
    longitude: 29.7333,
    observed_features: ['Foliated platy minerals', 'Silvery muscovite sheen', 'Parallel alignment of grains'],
    reasoning: 'Regional metamorphic foliation characteristic of southern Rwanda schists.',
    limitations: ['Garnet or accessory porphyroblasts not distinguishable'],
    recommended_next_steps: ['Send an edge-on photograph showing foliation layers'],
    safety_note: 'Preliminary AI-assisted interpretation only.',
    data_quality_status: 'complete',
    created_at: '2026-09-25T15:30:00Z',
  },
  {
    passport_id: 'RT-RW-000107',
    primary_classification: 'sedimentary',
    possible_name: 'sandstone',
    confidence: 'moderate',
    confidence_score: 0.71,
    verification_status: 'unverified',
    district: 'Rwamagana',
    public_location_precision: 'district',
    latitude: -1.95,
    longitude: 30.4333,
    observed_features: ['Visible sand grains', 'Bedding planes', 'Gritty texture'],
    reasoning: 'Detrital sedimentary structure with subrounded clasts.',
    limitations: ['Grain sorting not measurable without magnification'],
    recommended_next_steps: ['Place beside a coin or ruler for grain scale'],
    safety_note: 'Preliminary AI-assisted interpretation only.',
    data_quality_status: 'partial',
    created_at: '2026-09-26T16:00:00Z',
  },
  {
    passport_id: 'RT-RW-000108',
    primary_classification: 'metamorphic',
    possible_name: 'gneiss',
    confidence: 'high',
    confidence_score: 0.82,
    verification_status: 'unverified',
    district: 'Rubavu',
    public_location_precision: 'district',
    latitude: -1.6833,
    longitude: 29.2667,
    observed_features: ['Compositional banding', 'Alternating light felsic and dark mafic bands', 'Crystalline fabric'],
    reasoning: 'High-grade metamorphic gneissic banding.',
    limitations: ['Contact relationships not visible'],
    recommended_next_steps: ['Provide scale and another side photograph'],
    safety_note: 'Preliminary AI-assisted interpretation only.',
    data_quality_status: 'complete',
    created_at: '2026-09-27T09:40:00Z',
  },
  {
    passport_id: 'RT-RW-000109',
    primary_classification: 'sedimentary',
    possible_name: 'shale',
    confidence: 'low',
    confidence_score: 0.58,
    verification_status: 'unverified',
    district: 'Gicumbi',
    public_location_precision: 'district',
    latitude: -1.6,
    longitude: 30.0833,
    observed_features: ['Fine-grained mud appearance', 'Fissile thin laminations', 'Dark grey color'],
    reasoning: 'Clay-rich sedimentary rock splitting along bedding planes.',
    limitations: ['Weathered surface obscures silt content'],
    recommended_next_steps: ['Test whether specimen breaks cleanly into thin flakes'],
    safety_note: 'Preliminary AI-assisted interpretation only.',
    data_quality_status: 'partial',
    created_at: '2026-09-28T11:05:00Z',
  },
  {
    passport_id: 'RT-RW-000110',
    primary_classification: 'unclassified',
    possible_name: 'mineralized quartz vein',
    confidence: 'moderate',
    confidence_score: 0.65,
    verification_status: 'unverified',
    district: 'Karongi',
    public_location_precision: 'district',
    latitude: -2.15,
    longitude: 29.35,
    observed_features: ['Milky quartz host', 'Metallic-looking speckles', 'Fracture fillings'],
    reasoning: 'Hydrothermal quartz vein material. Metallic specks may be pyrite or mica; laboratory testing required.',
    limitations: ['Cannot determine mineral identity or value from visual image alone'],
    recommended_next_steps: ['Streak plate test and hardness check'],
    safety_note: 'Appearance alone cannot determine mineral composition or economic value.',
    data_quality_status: 'complete',
    created_at: '2026-09-29T13:50:00Z',
  },
];

export interface SyntheticReviewFixture {
  passport_id: string;
  status: 'expert_verified' | 'under_review' | 'rejected' | 'unverified';
  expert_classification: string;
  expert_rock_name: string;
  expert_confidence: 'high' | 'moderate' | 'low' | 'insufficient';
  expert_observed_features: string[];
  expert_notes: string;
  scientific_remarks: string | null;
  created_at: string;
}

/**
 * Invented review records used to assert the AI-immutability guarantee:
 * submitting a review must never mutate the stored AI interpretation.
 */
export const SYNTHETIC_REVIEW_FIXTURES: SyntheticReviewFixture[] = [
  {
    passport_id: 'RT-RW-000101',
    status: 'expert_verified',
    expert_classification: 'igneous',
    expert_rock_name: 'Porphyritic Biotite Granite',
    expert_confidence: 'high',
    expert_observed_features: [
      'K-feldspar megacrysts',
      'Accessory tourmaline and biotite books',
      'Consistent with a regional granitic pluton',
    ],
    expert_notes: 'SYNTHETIC_TEST_FIXTURE review note.',
    scientific_remarks: null,
    created_at: '2026-09-21T10:00:00Z',
  },
];
