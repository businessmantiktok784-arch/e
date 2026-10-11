import { demoMapRecords } from './demo-map-records.js';
import { approximateCoordinates } from '../utils/public-location.js';
import type { EvidenceState, SiteGroupingBasis } from '../types/community.types.js';
import type { GeologicalSiteRecord } from '../types/site.types.js';

/**
 * Demonstration community data (Geological sites, Investigations, Questions).
 *
 * These records exist so the site explorer, the community discovery feed and the
 * "Geological sites" map can be exercised on a deployment that has collected
 * nothing yet. They are served only when `DEMO_POSTS_ENABLED` is true AND no real
 * Supabase database is configured, and every record carries `is_demo: true` so
 * nothing here is ever mistaken for collected data.
 *
 * They deliberately mirror the labelled demonstration posts in `demo-posts.ts`:
 * each site groups the demo observation of one district, and investigations,
 * questions, evidence and visits refer back to those same places and passports,
 * so the map, the post cards and the community feed never disagree about what
 * exists.
 *
 * Integrity rules preserved:
 *   - Evidence states are derived, never claimed. `community_investigated` only
 *     appears where the seed carries at least two substantive evidence items,
 *     and `scientifically_confirmed` is never produced, because no demonstration
 *     record has a laboratory or documented-reference basis.
 *   - One vote per contributor per investigation, exactly like the database
 *     constraint.
 *   - Nothing here is ever written into a real database, and the interactive
 *     writes a visitor makes in demonstration mode live only in memory.
 */

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

interface DemoGeologicalSiteSeed {
  id: string;
  site_code: string;
  title: string;
  description: string;
  grouping_basis: SiteGroupingBasis;
  grouping_evidence: string | null;
  district: string;
  sector: string | null;
  latitude: number;
  longitude: number;
  public_location_precision: 'district' | 'approximate' | 'exact';
  created_at: string;
}

const DEMO_SITE_SEEDS: DemoGeologicalSiteSeed[] = [
  {
    id: 'd1000000-0000-4000-8000-000000000001',
    site_code: 'ET-SITE-DEMO-0001',
    title: 'Columnar basalt exposure on the road to Musanze',
    description:
      'Regular basalt columns exposed in a fresh road cut. The demonstration site groups the labelled Musanze observation and the community activity around it.',
    grouping_basis: 'evidence_backed',
    grouping_evidence: 'Grouped from the labelled demonstration observation ET-DEMO-0004 and the field notes attached to it.',
    district: 'Musanze',
    sector: 'Kinigi',
    latitude: -1.5,
    longitude: 29.6333,
    public_location_precision: 'district',
    created_at: '2026-09-02T09:00:00.000Z',
  },
  {
    id: 'd1000000-0000-4000-8000-000000000002',
    site_code: 'ET-SITE-DEMO-0002',
    title: 'Blocky lava flow front near Kabaya, Ngororero',
    description:
      'A weathered lava flow surface broken into rough blocks. The exact point is published because it sits beside a trail and is easy to reach.',
    grouping_basis: 'evidence_backed',
    grouping_evidence: 'Grouped from the labelled demonstration observation ET-DEMO-0014, which published its exact location.',
    district: 'Ngororero',
    sector: 'Kabaya',
    latitude: -1.8421,
    longitude: 29.6612,
    public_location_precision: 'exact',
    created_at: '2026-09-25T06:00:00.000Z',
  },
  {
    id: 'd1000000-0000-4000-8000-000000000003',
    site_code: 'ET-SITE-DEMO-0003',
    title: 'Limestone exposure with possible fossil impressions, Kamonyi',
    description:
      'Pale limestone blocks in the quarry area with a spiral shape that looks like a fossil shell impression.',
    grouping_basis: 'evidence_backed',
    grouping_evidence: 'Grouped from the labelled demonstration observation ET-DEMO-0008.',
    district: 'Kamonyi',
    sector: 'Runda',
    latitude: -2.3,
    longitude: 29.95,
    public_location_precision: 'district',
    created_at: '2026-09-03T08:30:00.000Z',
  },
  {
    id: 'd1000000-0000-4000-8000-000000000004',
    site_code: 'ET-SITE-DEMO-0004',
    title: 'Tilted sedimentary strata in a hillside cutting, Rulindo',
    description:
      'A new cutting exposes several flat layers stacked on each other, each band a slightly different colour.',
    grouping_basis: 'evidence_backed',
    grouping_evidence: 'Grouped from the labelled demonstration observation ET-DEMO-0011.',
    district: 'Rulindo',
    sector: 'Kinihira',
    latitude: -1.7333,
    longitude: 30.0,
    public_location_precision: 'district',
    created_at: '2026-09-13T06:50:00.000Z',
  },
  {
    id: 'd1000000-0000-4000-8000-000000000005',
    site_code: 'ET-SITE-DEMO-0005',
    title: 'Sandstone layers in a stream bank, Kibilira',
    description:
      'Layered sedimentary rock that crumbles into sand between the fingers; the layers tilt gently downstream.',
    grouping_basis: 'evidence_backed',
    grouping_evidence: 'Grouped from the labelled demonstration observation ET-DEMO-0005.',
    district: 'Nyaruguru',
    sector: 'Kibilira',
    latitude: -2.7031,
    longitude: 29.5123,
    public_location_precision: 'approximate',
    created_at: '2026-09-12T14:50:00.000Z',
  },
  {
    id: 'd1000000-0000-4000-8000-000000000006',
    site_code: 'ET-SITE-DEMO-0006',
    title: 'Cavity-lined quartz exposure on cleared land, Bugesera',
    description:
      'A small cavity lined with glassy quartz crystals, opened while clearing land. Suggested grouping by the community; not yet confirmed.',
    grouping_basis: 'suggested',
    grouping_evidence: 'Suggested from the labelled demonstration observation ET-DEMO-0006. Not confirmed by a site owner.',
    district: 'Bugesera',
    sector: 'Gashora',
    latitude: -2.15,
    longitude: 30.15,
    public_location_precision: 'district',
    created_at: '2026-09-19T08:00:00.000Z',
  },
];

function toSiteRecord(seed: DemoGeologicalSiteSeed): GeologicalSiteRecord {
  return {
    id: seed.id,
    site_code: seed.site_code,
    title: seed.title,
    description: seed.description,
    grouping_basis: seed.grouping_basis,
    grouping_evidence: seed.grouping_evidence,
    district: seed.district,
    sector: seed.sector,
    latitude: seed.latitude,
    longitude: seed.longitude,
    public_location_precision: seed.public_location_precision,
    is_public: true,
    status: 'active',
    created_by: 'demo',
    created_at: seed.created_at,
    updated_at: seed.created_at,
  };
}

export function demoSites(): GeologicalSiteRecord[] {
  return DEMO_SITE_SEEDS.map(toSiteRecord);
}

// ---------------------------------------------------------------------------
// Site observation views
//
// Rebuilt from the demonstration posts so the explorer, the nearby list and the
// site summaries always match the map pins. Coordinates follow the same public
// view contract as the database: exact precision publishes the true point,
// approximate precision publishes a generalised one, and district precision
// publishes none (the resolver then uses the district centre).
// ---------------------------------------------------------------------------

export function siteObservationRows(): Array<
  Record<string, unknown> & {
    passport_id: string;
    district: string;
    public_location_precision: string;
    created_at: string;
  }
> {
  const rows: Array<
    Record<string, unknown> & {
      passport_id: string;
      district: string;
      public_location_precision: string;
      created_at: string;
    }
  > = [];

  for (const rec of demoMapRecords()) {
    const precision = rec.public_location_precision ?? 'district';
    let publicLat: number | null = null;
    let publicLon: number | null = null;

    if (precision === 'exact' && typeof rec.latitude === 'number' && typeof rec.longitude === 'number') {
      publicLat = rec.latitude;
      publicLon = rec.longitude;
    } else if (precision === 'approximate' && typeof rec.latitude === 'number' && typeof rec.longitude === 'number') {
      const approx = approximateCoordinates(rec.latitude, rec.longitude);
      publicLat = approx.lat;
      publicLon = approx.lon;
    }

    rows.push({
      passport_id: rec.passport_id,
      observation_category: rec.observation_category,
      observation_subcategory: rec.observation_subcategory,
      primary_classification: rec.primary_classification,
      possible_name: rec.possible_name ?? null,
      confidence: rec.confidence,
      confidence_score: rec.confidence_score,
      evidence_state: rec.evidence_state,
      verification_status: rec.verification_status ?? 'unverified',
      observed_features: rec.observed_features ?? [],
      reasoning: rec.reasoning ?? '',
      limitations: rec.limitations ?? [],
      recommended_next_steps: rec.recommended_next_steps ?? [],
      safety_note: rec.safety_note ?? null,
      district: rec.district ?? '',
      public_location_precision: precision,
      public_latitude: publicLat,
      public_longitude: publicLon,
      latitude: rec.latitude ?? null,
      longitude: rec.longitude ?? null,
      is_demo: true,
      created_at: rec.created_at ?? '',
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Community records
// ---------------------------------------------------------------------------

/**
 * Stable fake contributor keys for the demonstration contributors.
 *
 * These are HMAC-shaped placeholders used only to give each demonstration
 * participant a stable, distinct public handle ("Field Explorer #…"). They never
 * correspond to a real person and are never echoed anywhere as an identifier.
 */
const DEMO_CONTRIBUTORS = {
  aline: 'demo:contributor:aline-uwase',
  jean: 'demo:contributor:jean-bosco-habimana',
  eric: 'demo:contributor:eric-niyonsaba',
  claude: 'demo:contributor:claude-mugisha',
  sandrine: 'demo:contributor:sandrine-mukamana',
} as const;

interface DemoVoteSeed {
  contributor: keyof typeof DEMO_CONTRIBUTORS;
  option: string;
  created_at: string;
}

interface DemoInvestigationSeed {
  id: string;
  public_id: string;
  site_id: string | null;
  observation_id: string | null;
  question: string;
  status: 'open' | 'investigating' | 'community_supported' | 'resolved';
  opened_by: keyof typeof DEMO_CONTRIBUTORS;
  research_interest: boolean;
  /** Fixed answer choices, so the investigation is a survey rather than a poll. */
  options: string[];
  context: string;
  category: string;
  created_at: string;
  votes: DemoVoteSeed[];
}

interface DemoEvidenceSeed {
  id: string;
  investigation_id: string | null;
  site_id: string | null;
  observation_id: string | null;
  contributor: keyof typeof DEMO_CONTRIBUTORS;
  evidence_type: 'photo' | 'close_up' | 'texture' | 'outcrop' | 'environment' | 'field_note' | 'discussion' | 'reference';
  explanation: string;
  supports_evidence: boolean;
  is_challenge: boolean;
  created_at: string;
}

interface DemoAnswerSeed {
  id: string;
  contributor: keyof typeof DEMO_CONTRIBUTORS;
  answer: string;
  /** True only for a determination recorded by a qualified practitioner. */
  is_expert?: boolean;
  created_at: string;
}

interface DemoQuestionSeed {
  id: string;
  public_id: string;
  site_id: string | null;
  observation_id: string | null;
  investigation_id: string | null;
  question: string;
  asked_by: keyof typeof DEMO_CONTRIBUTORS;
  status: 'open' | 'investigating' | 'community_supported' | 'expert_reviewed' | 'resolved';
  requested_expert: boolean;
  context: string;
  category: string;
  created_at: string;
  answers: DemoAnswerSeed[];
}

interface DemoVisitSeed {
  id: string;
  site_id: string;
  contributor: keyof typeof DEMO_CONTRIBUTORS;
  visited_on: string;
  notes: string;
  created_at: string;
}

const SITE = (code: string): string => {
  const match = DEMO_SITE_SEEDS.find((s) => s.site_code === code);
  if (!match) throw new Error(`Unknown demo site code ${code}`);
  return match.id;
};

const INVESTIGATIONS: DemoInvestigationSeed[] = [
  {
    id: 'e1000000-0000-4000-8000-000000000001',
    public_id: 'ET-INV-DEMO-0001',
    site_id: SITE('ET-SITE-DEMO-0001'),
    observation_id: 'ET-DEMO-0004',
    question: 'Are the Musanze columns columnar-jointed basalt or part of an older trachyte flow?',
    status: 'community_supported',
    opened_by: 'aline',
    research_interest: true,
    options: ['Columnar-jointed basalt', 'Trachyte flow'],
    context: 'The face shows tall, evenly spaced columns. I am unsure whether the host rock is basalt or an older trachyte flow.',
    category: 'volcanic_feature',
    created_at: '2026-09-02T10:15:00.000Z',
    votes: [
      { contributor: 'aline', option: 'Columnar-jointed basalt', created_at: '2026-09-02T10:15:00.000Z' },
      { contributor: 'jean', option: 'Columnar-jointed basalt', created_at: '2026-09-03T08:45:00.000Z' },
      { contributor: 'sandrine', option: 'Columnar-jointed basalt', created_at: '2026-09-04T11:20:00.000Z' },
      { contributor: 'claude', option: 'Trachyte flow', created_at: '2026-09-05T09:10:00.000Z' },
    ],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000002',
    public_id: 'ET-INV-DEMO-0002',
    site_id: SITE('ET-SITE-DEMO-0002'),
    observation_id: 'ET-DEMO-0014',
    question: 'What produced the blocky surface at the Kabaya flow front?',
    status: 'investigating',
    opened_by: 'eric',
    research_interest: false,
    options: ['Weathered lava flow (aa-type)', 'Block field from slope processes'],
    context: 'There is a wide field of loose, angled blocks just below the flow front. I want to know whether this is an original aa surface or blocks moved by slope processes.',
    category: 'geomorphology',
    created_at: '2026-09-25T07:30:00.000Z',
    votes: [
      { contributor: 'eric', option: 'Weathered lava flow (aa-type)', created_at: '2026-09-25T07:30:00.000Z' },
      { contributor: 'aline', option: 'Weathered lava flow (aa-type)', created_at: '2026-09-27T12:05:00.000Z' },
      { contributor: 'claude', option: 'Block field from slope processes', created_at: '2026-09-28T16:40:00.000Z' },
    ],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000003',
    public_id: 'ET-INV-DEMO-0003',
    site_id: SITE('ET-SITE-DEMO-0003'),
    observation_id: 'ET-DEMO-0008',
    question: 'Is the Kamonyi spiral a fossil shell or an inorganic structure?',
    status: 'resolved',
    opened_by: 'jean',
    research_interest: false,
    options: ['Fossil shell impression', 'Inorganic nodule'],
    context: 'A spiral pattern is preserved on the limestone surface. It could be a fossil shell cast or a mineral growth.',
    category: 'fossil',
    created_at: '2026-09-03T09:00:00.000Z',
    votes: [
      { contributor: 'jean', option: 'Fossil shell impression', created_at: '2026-09-03T09:00:00.000Z' },
      { contributor: 'aline', option: 'Fossil shell impression', created_at: '2026-09-06T15:10:00.000Z' },
      { contributor: 'sandrine', option: 'Fossil shell impression', created_at: '2026-09-07T10:30:00.000Z' },
      { contributor: 'eric', option: 'Fossil shell impression', created_at: '2026-09-08T09:45:00.000Z' },
      { contributor: 'claude', option: 'Inorganic nodule', created_at: '2026-09-09T14:25:00.000Z' },
    ],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000004',
    public_id: 'ET-INV-DEMO-0004',
    site_id: SITE('ET-SITE-DEMO-0004'),
    observation_id: 'ET-DEMO-0011',
    question: 'Which of the Rulindo layers could be a volcanic ash band?',
    status: 'open',
    opened_by: 'sandrine',
    research_interest: true,
    options: ['The pale middle clay band', 'A lower or upper band'],
    context: 'The road cut exposes several horizontal layers. One pale, fine-grained band looks different from the rest and may be volcanic ash.',
    category: 'geological_layer',
    created_at: '2026-09-13T07:10:00.000Z',
    votes: [
      { contributor: 'sandrine', option: 'The pale middle clay band', created_at: '2026-09-13T07:10:00.000Z' },
    ],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000005',
    public_id: 'ET-INV-DEMO-0005',
    site_id: SITE('ET-SITE-DEMO-0005'),
    observation_id: 'ET-DEMO-0005',
    question: 'Do the stream-bank layers at Kibilira dip downstream?',
    status: 'open',
    opened_by: 'claude',
    research_interest: false,
    options: ['Yes, a gentle downstream tilt', 'No, the layers are flat', 'Hard to tell from the bank alone'],
    context: 'The stream has undercut the bank and exposed the layering in section. I want to read the dip direction along the bank.',
    category: 'geological_structure',
    created_at: '2026-09-12T15:20:00.000Z',
    votes: [
      { contributor: 'claude', option: 'Yes, a gentle downstream tilt', created_at: '2026-09-12T15:20:00.000Z' },
      { contributor: 'eric', option: 'Hard to tell from the bank alone', created_at: '2026-09-14T10:05:00.000Z' },
    ],
  },
];

const EVIDENCE: DemoEvidenceSeed[] = [
  {
    id: 'demo-ev-001',
    investigation_id: 'e1000000-0000-4000-8000-000000000001',
    site_id: SITE('ET-SITE-DEMO-0001'),
    observation_id: null,
    contributor: 'jean',
    evidence_type: 'close_up',
    explanation: 'A close-up of the column joint surfaces showing consistent spacing across the visible face.',
    supports_evidence: true,
    is_challenge: false,
    created_at: '2026-09-03T08:50:00.000Z',
  },
  {
    id: 'demo-ev-002',
    investigation_id: 'e1000000-0000-4000-8000-000000000001',
    site_id: SITE('ET-SITE-DEMO-0001'),
    observation_id: null,
    contributor: 'sandrine',
    evidence_type: 'texture',
    explanation: 'Grain texture is glassy with no visible phenocrysts, which fits a fast-cooled basalt more than a trachyte.',
    supports_evidence: true,
    is_challenge: false,
    created_at: '2026-09-04T11:30:00.000Z',
  },
  {
    id: 'demo-ev-003',
    investigation_id: 'e1000000-0000-4000-8000-000000000001',
    site_id: SITE('ET-SITE-DEMO-0001'),
    observation_id: null,
    contributor: 'claude',
    evidence_type: 'discussion',
    explanation: 'Trachyte flows around Musanze usually show blockier, more weathered jointing; the fresh regular columns here look like cooling joints.',
    supports_evidence: false,
    is_challenge: true,
    created_at: '2026-09-05T09:20:00.000Z',
  },
  {
    id: 'demo-ev-004',
    investigation_id: 'e1000000-0000-4000-8000-000000000002',
    site_id: SITE('ET-SITE-DEMO-0002'),
    observation_id: null,
    contributor: 'aline',
    evidence_type: 'outcrop',
    explanation: 'The blocky surface continued for about thirty metres along the trail before the flow edge. Blocks are rough and vesicular.',
    supports_evidence: true,
    is_challenge: false,
    created_at: '2026-09-27T12:10:00.000Z',
  },
  {
    id: 'demo-ev-005',
    investigation_id: 'e1000000-0000-4000-8000-000000000002',
    site_id: SITE('ET-SITE-DEMO-0002'),
    observation_id: null,
    contributor: 'claude',
    evidence_type: 'environment',
    explanation: 'The slope below the flow front has loose blocks that could have moved downhill, so size alone does not prove they came from lava.',
    supports_evidence: false,
    is_challenge: true,
    created_at: '2026-09-28T16:45:00.000Z',
  },
  {
    id: 'demo-ev-006',
    investigation_id: 'e1000000-0000-4000-8000-000000000003',
    site_id: SITE('ET-SITE-DEMO-0003'),
    observation_id: null,
    contributor: 'aline',
    evidence_type: 'close_up',
    explanation: 'The spiral has the coiled form of a shell impression rather than a fracture pattern; the block is fine-grained pale limestone.',
    supports_evidence: true,
    is_challenge: false,
    created_at: '2026-09-06T15:15:00.000Z',
  },
  {
    id: 'demo-ev-007',
    investigation_id: 'e1000000-0000-4000-8000-000000000003',
    site_id: SITE('ET-SITE-DEMO-0003'),
    observation_id: null,
    contributor: 'eric',
    evidence_type: 'discussion',
    explanation: 'A note that inorganic nodules can form a similar spiral on weathered surfaces, so a single photo is not conclusive.',
    supports_evidence: false,
    is_challenge: true,
    created_at: '2026-09-08T09:55:00.000Z',
  },
  {
    id: 'demo-ev-008',
    investigation_id: 'e1000000-0000-4000-8000-000000000004',
    site_id: SITE('ET-SITE-DEMO-0004'),
    observation_id: null,
    contributor: 'sandrine',
    evidence_type: 'texture',
    explanation: 'The pale middle band is fine-grained and lighter than the layers above and below it.',
    supports_evidence: true,
    is_challenge: false,
    created_at: '2026-09-13T07:20:00.000Z',
  },
  {
    id: 'demo-ev-009',
    investigation_id: 'e1000000-0000-4000-8000-000000000005',
    site_id: SITE('ET-SITE-DEMO-0005'),
    observation_id: null,
    contributor: 'eric',
    evidence_type: 'field_note',
    explanation: 'From the stream bed the layers appear to tilt gently downstream, but the exposed face is short.',
    supports_evidence: true,
    is_challenge: false,
    created_at: '2026-09-14T10:10:00.000Z',
  },
  {
    id: 'demo-ev-010',
    investigation_id: null,
    site_id: SITE('ET-SITE-DEMO-0006'),
    observation_id: null,
    contributor: 'eric',
    evidence_type: 'photo',
    explanation: 'Quartz crystals lining the cavity, photographed with the crystals still in place.',
    supports_evidence: true,
    is_challenge: false,
    created_at: '2026-09-19T08:10:00.000Z',
  },
];

const QUESTIONS: DemoQuestionSeed[] = [
  {
    id: 'f1000000-0000-4000-8000-000000000001',
    public_id: 'ET-Q-DEMO-0001',
    site_id: SITE('ET-SITE-DEMO-0001'),
    observation_id: null,
    investigation_id: 'e1000000-0000-4000-8000-000000000001',
    question: 'Does the column spacing stay the same across the whole face?',
    asked_by: 'jean',
    status: 'community_supported',
    requested_expert: false,
    context: 'I want to know whether I can rely on the column spacing as a marker across the whole outcrop.',
    category: 'volcanic_feature',
    created_at: '2026-09-03T09:30:00.000Z',
    answers: [
      {
        id: 'demo-ans-001',
        contributor: 'aline',
        answer:
          'The spacing looked even where the face was exposed, but a wide section was still behind the safety barrier. A ruler alongside a column would settle it.',
        created_at: '2026-09-05T08:15:00.000Z',
      },
      {
        id: 'demo-ans-002',
        contributor: 'jean',
        answer: 'I agree the joints are evenly spaced in the visible part. The top of the cut was not reachable.',
        created_at: '2026-09-06T10:40:00.000Z',
      },
    ],
  },
  {
    id: 'f1000000-0000-4000-8000-000000000002',
    public_id: 'ET-Q-DEMO-0002',
    site_id: SITE('ET-SITE-DEMO-0003'),
    observation_id: null,
    investigation_id: null,
    question: 'How thick is the limestone block that holds the spiral?',
    asked_by: 'claude',
    status: 'open',
    requested_expert: true,
    context: 'I need the true thickness for a field description and I cannot measure the base of the block.',
    category: 'fossil',
    created_at: '2026-09-08T16:50:00.000Z',
    answers: [],
  },
  {
    id: 'f1000000-0000-4000-8000-000000000003',
    public_id: 'ET-Q-DEMO-0003',
    site_id: SITE('ET-SITE-DEMO-0002'),
    observation_id: 'ET-DEMO-0014',
    investigation_id: null,
    question: 'Are the blocks at the Kabaya flow front fresh or weathered?',
    asked_by: 'sandrine',
    status: 'resolved',
    requested_expert: false,
    context: 'I passed the flow front twice and could not decide whether the blocks are in place or moved.',
    category: 'geomorphology',
    created_at: '2026-09-26T11:05:00.000Z',
    answers: [
      {
        id: 'demo-ans-003',
        contributor: 'eric',
        is_expert: true,
        answer:
          'Well weathered. The surfaces are rounded and there is soil in most of the gaps; fresh aa-blocks are usually sharper with lighter fracture faces.',
        created_at: '2026-09-26T11:40:00.000Z',
      },
    ],
  },
  {
    id: 'f1000000-0000-4000-8000-000000000004',
    public_id: 'ET-Q-DEMO-0004',
    site_id: SITE('ET-SITE-DEMO-0004'),
    observation_id: null,
    investigation_id: null,
    question: 'Where does one Rulindo layer end and the next begin in the frame?',
    asked_by: 'aline',
    status: 'open',
    requested_expert: true,
    context: 'The boundaries between the pale and dark bands are not obvious in my photos and I want to label them correctly.',
    category: 'geological_layer',
    created_at: '2026-09-14T09:00:00.000Z',
    answers: [],
  },
  {
    id: 'f1000000-0000-4000-8000-000000000005',
    public_id: 'ET-Q-DEMO-0005',
    site_id: SITE('ET-SITE-DEMO-0005'),
    observation_id: null,
    investigation_id: 'e1000000-0000-4000-8000-000000000005',
    question: 'How steep is the downstream tilt of the Kibilira layers?',
    asked_by: 'jean',
    status: 'resolved',
    requested_expert: false,
    context: 'I want to record the dip for the site notes but I have no instrument.',
    category: 'geological_structure',
    created_at: '2026-09-13T09:25:00.000Z',
    answers: [
      {
        id: 'demo-ans-004',
        contributor: 'claude',
        answer:
          'Roughly ten degrees by eye from the stream bed, but there was no clinometer. The bed of the stream follows the same gentle dip.',
        created_at: '2026-09-15T09:50:00.000Z',
      },
    ],
  },
];

const VISITS: DemoVisitSeed[] = [
  {
    id: 'demo-vis-001',
    site_id: SITE('ET-SITE-DEMO-0001'),
    contributor: 'sandrine',
    visited_on: '2026-09-06',
    notes: 'Visited the same exposure; the columns are evenly jointed and the face is stable to observe from the road side.',
    created_at: '2026-09-06T17:20:00.000Z',
  },
  {
    id: 'demo-vis-002',
    site_id: SITE('ET-SITE-DEMO-0002'),
    contributor: 'aline',
    visited_on: '2026-09-28',
    notes: 'Walked to the end of the flow front along the trail. The blocky surface continues to the slope edge.',
    created_at: '2026-09-28T13:45:00.000Z',
  },
  {
    id: 'demo-vis-003',
    site_id: SITE('ET-SITE-DEMO-0005'),
    contributor: 'eric',
    visited_on: '2026-09-16',
    notes: 'Checked the stream bank after the weekend rain; the layers are still exposed and no new slip has buried them.',
    created_at: '2026-09-16T09:30:00.000Z',
  },
];

export interface DemoCommunityData {
  investigations: import('../types/community.types.js').CommunityInvestigationRecord[];
  votes: import('../types/community.types.js').CommunityVoteRecord[];
  evidence: import('../types/community.types.js').CommunityEvidenceRecord[];
  questions: import('../types/community.types.js').CommunityQuestionRecord[];
  answers: import('../types/community.types.js').CommunityAnswerRecord[];
  visits: import('../types/community.types.js').CommunityVisitRecord[];
}

/**
 * Builds the fully-shaped demonstration community records.
 *
 * Counters (participant_count, vote_count, answer_count …) are derived from the
 * seed rows exactly as the database recount would, so a displayed count is
 * always the count of the rows that justify it.
 */
export function buildDemoCommunityData(): DemoCommunityData {
  const contributorHash = (who: keyof typeof DEMO_CONTRIBUTORS): string => DEMO_CONTRIBUTORS[who];

  const investigations = INVESTIGATIONS.map((inv) => {
    const totalVotes = inv.votes.length;
    const participants = new Set(inv.votes.map((v) => contributorHash(v.contributor))).size;
    return {
      id: inv.id,
      public_id: inv.public_id,
      site_id: inv.site_id,
      observation_id: inv.observation_id,
      question: inv.question,
      status: inv.status,
      opened_by_hash: contributorHash(inv.opened_by),
      is_public: true,
      participant_count: participants,
      evidence_count: 0,
      vote_count: totalVotes,
      research_interest: inv.research_interest,
      options: inv.options,
      context: inv.context,
      category: inv.category,
      media_ids: [],
      is_demo: true,
      created_at: inv.created_at,
      updated_at: inv.votes[inv.votes.length - 1]?.created_at ?? inv.created_at,
    } as import('../types/community.types.js').CommunityInvestigationRecord;
  });

  const votes = INVESTIGATIONS.flatMap((inv, invIndex) =>
    inv.votes.map((v, voteIndex) => ({
      id: `demo-vote-${inv.id}-${voteIndex}`,
      investigation_id: inv.id,
      contributor_hash: contributorHash(v.contributor),
      option: v.option,
      created_at: v.created_at,
      updated_at: v.created_at,
    }))
  );

  const evidence = EVIDENCE.map((e) => ({
    id: e.id,
    investigation_id: e.investigation_id,
    site_id: e.site_id,
    observation_id: e.observation_id,
    media_id: null,
    media_ids: [],
    contributor_hash: contributorHash(e.contributor),
    evidence_type: e.evidence_type,
    explanation: e.explanation,
    supports_evidence: e.supports_evidence,
    is_challenge: e.is_challenge,
    moderation_status: 'visible' as const,
    created_at: e.created_at,
    updated_at: e.created_at,
  }));

  const questions = QUESTIONS.map((q) => ({
    id: q.id,
    public_id: q.public_id,
    site_id: q.site_id,
    observation_id: q.observation_id,
    investigation_id: q.investigation_id,
    question: q.question,
    contributor_hash: contributorHash(q.asked_by),
    status: q.status,
    is_public: true,
    answer_count: q.answers.length,
    vote_count: 0,
    requested_expert: q.requested_expert,
    context: q.context,
    category: q.category,
    media_ids: [],
    is_demo: true,
    created_at: q.created_at,
    updated_at: q.created_at,
  }));

  const answers = QUESTIONS.flatMap((q) =>
    q.answers.map((a) => ({
      id: a.id,
      question_id: q.id,
      contributor_hash: contributorHash(a.contributor),
      answer: a.answer,
      evidence_id: null,
      media_ids: [],
      is_expert: a.is_expert === true,
      created_at: a.created_at,
    }))
  );

  const visits = VISITS.map((v) => ({
    id: v.id,
    site_id: v.site_id,
    contributor_hash: contributorHash(v.contributor),
    visited_on: v.visited_on,
    notes: v.notes,
    media_id: null,
    created_at: v.created_at,
  }));

  for (const inv of investigations) {
    inv.evidence_count = evidence.filter(
      (e) => e.investigation_id === inv.id && e.moderation_status === 'visible'
    ).length;
  }

  return { investigations, votes, evidence, questions, answers, visits };
}

// ---------------------------------------------------------------------------
// Highest demo evidence state
// ---------------------------------------------------------------------------

/**
 * Derives the highest evidence state a demonstration site may claim.
 *
 * Mirrors the platform ladder: never `scientifically_confirmed` (no laboratory
 * or documented-reference basis exists), and `community_investigated` only when
 * the seed actually carries two or more substantive evidence items.
 */
export function demoSiteEvidenceState(input: {
  distinctParticipants: number;
  evidenceCount: number;
  unresolved?: boolean;
  rejected?: boolean;
}): EvidenceState {
  if (input.unresolved) return 'unresolved';
  if (input.rejected) return 'rejected';
  if (input.evidenceCount < 0) return 'ai_assisted';
  if (input.evidenceCount >= 2) return 'community_investigated';
  if (input.distinctParticipants >= 3) return 'community_supported';
  return 'ai_assisted';
}