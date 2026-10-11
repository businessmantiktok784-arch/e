import type { GeoscienceCategory } from '../ai/geoscience-taxonomy.js';
import type {
  AttachmentKind,
  LocationPrivacyLevel,
  MediaRole,
  PostQuestion,
  PublicComment,
} from '../types/community-posts.types.js';

/**
 * Seed posts for a fresh deployment (Stage 12).
 *
 * These records exist so the observation side card, the pin icons, the media
 * gallery, the AI questions and the discussion thread can be exercised on a
 * deployment that has collected nothing yet. They read as ordinary observations
 * so the interface can be judged on how it looks with real content: real
 * geology photographs and a real clip, natural captions, and ordinary
 * contributor, reader and question text.
 *
 * They are still kept separate from collected data: every record carries
 * `is_demo: true` and an `ET-DEMO-` passport id, so the application layer
 * excludes them from research, validation and accuracy accounting, and they are
 * never served when `DEMO_POSTS_ENABLED` is off. Those flags are internal and
 * are not shown on the card.
 */

export interface DemoMediaSeed {
  role: MediaRole;
  caption: string;
  mime_type: string;
  /** A real photograph or clip bundled under `public/media`, or null. */
  url: string | null;
  /** Optional honest note shown wherever the file would be; null for a real file. */
  demo_note: string | null;
  sort_order: number;
}

export interface DemoCommentSeed {
  comment_id: string;
  parent_comment_id: string | null;
  author_public_user_id: string;
  author_display_name: string | null;
  body: string;
  created_at: string;
}

/** A PDF bundled to a demo visit: a report, research note or document. */
export interface DemoAttachmentSeed {
  kind: AttachmentKind;
  title: string;
  description: string | null;
  filename: string;
  mime_type: string;
  /** Root-relative path to a real PDF under `media/documents/`. */
  url: string;
  size_bytes: number | null;
  /** False means this document is preview-only: readers may not download it. */
  allow_download: boolean;
}

export interface DemoPostSeed {
  passport_id: string;
  observation_category: GeoscienceCategory;
  observation_subcategory: string;
  title: string;
  user_report: string;
  created_at: string;
  district: string;
  sector: string | null;
  cell: string | null;
  village: string | null;
  precision: LocationPrivacyLevel;
  latitude: number;
  longitude: number;
  primary_interpretation: string;
  observed_features: string[];
  diagnostic_features: string[];
  reasoning: string;
  alternative_possibilities: string[];
  uncertainties: string[];
  limitations: string[];
  recommended_next_steps: string[];
  safety_note: string;
  owner_public_user_id: string;
  owner_display_name: string;
  media: DemoMediaSeed[];
  questions: PostQuestion[];
  comments: DemoCommentSeed[];
  /**
   * Files attached to this visit. Optional: a visit may carry no attachment at
   * all, and each visit keeps its own attachments separate from every other.
   */
  attachments?: DemoAttachmentSeed[];
}

/**
 * The real photographs and clips bundled with the deployment. Paths are served
 * from the client bundle, so they resolve for every reader without a network
 * call to a third party. These reference the numbered pool below and are kept
 * so the compact per-post specifications stay readable.
 */
const MEDIA = {
  igneous: '/media/pool/rock-00.jpg',
  sedimentary: '/media/pool/rock-02.jpg',
  metamorphic: '/media/pool/rock-06.jpg',
  mineral: '/media/pool/rock-08.jpg',
  fossil: '/media/pool/rock-12.jpg',
  structure: '/media/pool/structure-00.jpg',
  volcanic: '/media/pool/structure-06.jpg',
  layer: '/media/pool/structure-04.jpg',
  quarry: '/media/pool/field-00.jpg',
  waterfall: '/media/pool/water-00.jpg',
  engineering: '/media/pool/field-02.jpg',
  erosion: '/media/pool/water-02.jpg',
  outcrop: '/media/pool/field-05.jpg',
  soil: '/media/pool/field-04.jpg',
  blurry: '/media/pool/misc-00.jpg',
  clip: '/media/clips/clip-volcano.webm',
} as const;

/**
 * The bundled media pool, grouped by subject.
 *
 * Every post draws its gallery from one group so a fossil post shows fossils
 * and a quarry post shows a working face. The files are real photographs
 * fetched from Wikimedia Commons and stored under `public/media/pool`, so they
 * resolve on every deployment without a third-party network call.
 */
const POOL = {
  rock: [
    '/media/pool/rock-00.jpg',
    '/media/pool/rock-01.jpg',
    '/media/pool/rock-02.jpg',
    '/media/pool/rock-03.jpg',
    '/media/pool/rock-04.jpg',
    '/media/pool/rock-05.jpg',
    '/media/pool/rock-06.jpg',
    '/media/pool/rock-07.jpg',
  ],
  mineral: [
    '/media/pool/rock-08.jpg',
    '/media/pool/rock-09.jpg',
    '/media/pool/rock-10.jpg',
    '/media/pool/rock-11.jpg',
    '/media/pool/rock-07.jpg',
  ],
  fossil: [
    '/media/pool/rock-12.jpg',
    '/media/pool/rock-13.jpg',
    '/media/pool/rock-14.jpg',
    '/media/pool/rock-02.jpg',
    '/media/pool/rock-04.jpg',
  ],
  structure: [
    '/media/pool/structure-00.jpg',
    '/media/pool/structure-01.jpg',
    '/media/pool/structure-02.jpg',
    '/media/pool/structure-03.jpg',
    '/media/pool/structure-04.jpg',
    '/media/pool/structure-05.jpg',
    '/media/pool/structure-06.jpg',
    '/media/pool/structure-07.jpg',
  ],
  water: [
    '/media/pool/water-00.jpg',
    '/media/pool/water-01.jpg',
    '/media/pool/water-02.jpg',
    '/media/pool/water-03.jpg',
    '/media/pool/water-04.jpg',
    '/media/pool/water-05.jpg',
  ],
  field: [
    '/media/pool/field-00.jpg',
    '/media/pool/field-01.jpg',
    '/media/pool/field-02.jpg',
    '/media/pool/field-03.jpg',
    '/media/pool/field-04.jpg',
    '/media/pool/field-05.jpg',
    '/media/pool/field-06.jpg',
    '/media/pool/field-07.jpg',
  ],
  misc: [
    '/media/pool/misc-00.jpg',
    '/media/pool/misc-01.jpg',
    '/media/pool/misc-02.jpg',
    '/media/pool/misc-03.jpg',
    '/media/pool/misc-04.jpg',
    '/media/pool/misc-05.jpg',
    '/media/pool/misc-06.jpg',
    '/media/pool/misc-07.jpg',
    '/media/pool/misc-08.jpg',
    '/media/pool/misc-09.jpg',
  ],
} as const;

/** The real clips, used as the video slots of a gallery. */
const CLIPS = [
  '/media/clips/clip-volcano.webm',
  '/media/clips/clip-waterfall.webm',
  '/media/clips/clip-river.webm',
] as const;

/** Which subject group each category draws its photographs from. */
const GALLERY_THEME: Record<GeoscienceCategory, keyof typeof POOL> = {
  rock: 'rock',
  mineral: 'mineral',
  fossil: 'fossil',
  geological_structure: 'structure',
  geological_layer: 'structure',
  volcanic_feature: 'structure',
  geomorphology: 'water',
  hydrogeological_feature: 'water',
  mining_observation: 'field',
  engineering_geology: 'field',
  other_geoscience: 'field',
  unknown: 'field',
  insufficient_image: 'misc',
  non_geoscience: 'misc',
};

const IMAGE_ROLES: MediaRole[] = ['main', 'context', 'close_up', 'field', 'other'];

const IMAGE_CAPTIONS = [
  'The site as it looked on the day of the visit.',
  'A wider view showing the surrounding ground.',
  'A closer view of the surface detail.',
  'A second angle taken a few steps to the side.',
  'A detail shot of the texture and colour.',
];

const VIDEO_CAPTIONS = [
  'A short clip panning across the feature.',
  'A second clip taken from the other side.',
];

/**
 * Builds the full gallery every seed post carries: five photographs from the
 * post's subject group and one or two real clips.
 *
 * `index` is the post's position in the dataset, used to rotate the starting
 * photograph so two posts of the same subject do not open on the same frame.
 * The window is always five consecutive entries, so no post repeats a
 * photograph within its own gallery.
 */
function buildDemoGallery(category: GeoscienceCategory, index: number): DemoMediaSeed[] {
  const pool: readonly string[] = POOL[GALLERY_THEME[category] ?? 'field'];
  const start = (index * 5) % pool.length;
  const media: DemoMediaSeed[] = [];

  for (let i = 0; i < 5; i++) {
    media.push({
      role: IMAGE_ROLES[i],
      caption: IMAGE_CAPTIONS[i],
      mime_type: 'image/jpeg',
      url: pool[(start + i) % pool.length],
      demo_note: null,
      sort_order: i,
    });
  }

  const videoCount = index % 2 === 0 ? 2 : 1;
  for (let v = 0; v < videoCount; v++) {
    media.push({
      role: 'video',
      caption: VIDEO_CAPTIONS[v],
      mime_type: 'video/webm',
      url: CLIPS[(start + v) % CLIPS.length],
      demo_note: null,
      sort_order: 5 + v,
    });
  }

  return media;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/** One gallery slot: a real image, or a real clip when `video` is set. */
interface DemoMediaSpec {
  role: MediaRole;
  caption: string;
  url: string;
  /** True when the file is a submitted clip rather than a photograph. */
  video?: boolean;
}

interface DemoQuestionSpec {
  id: string;
  question: string;
  status: 'answered' | 'open';
  answer?: string;
}

interface DemoCommentSpec {
  id: string;
  parent: string | null;
  author: 1 | 2 | 3;
  body: string;
}

/** A seed post in its compact form. */
interface DemoSpec {
  id: string;
  category: GeoscienceCategory;
  subcategory: string;
  title: string;
  report: string;
  interpretation: string;
  createdAt: string;
  district: string;
  sector: string | null;
  cell?: string | null;
  village?: string | null;
  precision: LocationPrivacyLevel;
  latitude: number;
  longitude: number;
  owner: 1 | 2 | 3;
  safety: string;
  reasoning?: string;
  limitations?: string[];
  media: DemoMediaSpec[];
  questions: DemoQuestionSpec[];
  comments: DemoCommentSpec[];
}

const OWNERS: Record<DemoSpec['owner'], { id: string; name: string }> = {
  1: { id: 'ET-USER-DEMO1', name: 'Aline Uwase' },
  2: { id: 'ET-USER-DEMO2', name: 'Jean-Bosco Habimana' },
  3: { id: 'ET-USER-DEMO3', name: 'Eric Niyonsaba' },
};

/**
 * Plausible Rwanda sector/cell/village names for the demonstration records.
 *
 * These are interface placeholders so the card's address block can show the
 * full administrative trail (district → sector → cell → village) it will carry
 * once a real sender supplies one. They are never collected address data. A
 * demo post that does not pin its own sector falls back to the one here, so no
 * demonstration place ever reads as missing a sector.
 */
const DEMO_NEIGHBOURHOODS: Record<
  string,
  { sector: string; cell: string; village: string }
> = {
  Musanze: { sector: 'Kinigi', cell: 'Muhoza', village: 'Gikingiro' },
  Nyaruguru: { sector: 'Ngera', cell: 'Muganza', village: 'Ruseke' },
  Bugesera: { sector: 'Gashora', cell: 'Gashora', village: 'Mpemba' },
  Gatsibo: { sector: 'Kiziguro', cell: 'Gatsibo', village: 'Nyamirama' },
  Kamonyi: { sector: 'Runda', cell: 'Kayumba', village: 'Bunyinya' },
  Gisagara: { sector: 'Kigembe', cell: 'Kigembe', village: 'Rwakiriza' },
  Nyabihu: { sector: 'Jomba', cell: 'Jomba', village: 'Gisansura' },
  Rulindo: { sector: 'Kinihira', cell: 'Kinihira', village: 'Kigeyo' },
  Rwamagana: { sector: 'Rwamagana', cell: 'Karangazi', village: 'Kageyo' },
  Rutsiro: { sector: 'Boneza', cell: 'Mukura', village: 'Gihira' },
  Ngororero: { sector: 'Ngororero', cell: 'Kavumu', village: 'Nyange' },
  Burera: { sector: 'Bungwe', cell: 'Bungwe', village: 'Ruhunde' },
  Nyamasheke: { sector: 'Bushenge', cell: 'Nyabitekeri', village: 'Gatare' },
  Rusizi: { sector: 'Gikundamvura', cell: 'Gikundamvura', village: 'Ntura' },
  Kayonza: { sector: 'Kabarondo', cell: 'Mburabuturo', village: 'Nyagatovu' },
  Kicukiro: { sector: 'Kicukiro', cell: 'Niboye', village: 'Rugando' },
  Gakenke: { sector: 'Gakenke', cell: 'Muyongwe', village: 'Rusasa' },
  Nyarugenge: { sector: 'Nyamirambo', cell: 'Nyamirambo', village: 'Isoko' },
  Kirehe: { sector: 'Kirehe', cell: 'Kigarama', village: 'Mukaka' },
  Ngoma: { sector: 'Zaza', cell: 'Zaza', village: 'Nyagahanga' },
  Gicumbi: { sector: 'Byumba', cell: 'Byumba', village: 'Nyagatabi' },
  Karongi: { sector: 'Bwishyura', cell: 'Bwishyura', village: 'Rusange' },
  Nyanza: { sector: 'Busasamana', cell: 'Busasamana', village: 'Gitovu' },
  Nyagatare: { sector: 'Nyagatare', cell: 'Katabagemu', village: 'Rugarama' },
  Muhanga: { sector: 'Muhanga', cell: 'Nyabinoni', village: 'Bishyiga' },
  Nyamagabe: { sector: 'Kaduha', cell: 'Munini', village: 'Kigeme' },
  Huye: { sector: 'Huye', cell: 'Gaseke', village: 'Ngoma' },
};

function demoNeighbourhood(district: string): {
  sector: string | null;
  cell: string | null;
  village: string | null;
} {
  const place = DEMO_NEIGHBOURHOODS[district];
  return place
    ? { sector: place.sector, cell: place.cell, village: place.village }
    : { sector: null, cell: null, village: null };
}

const DEFAULT_OBSERVED = [
  'Irregular surface broken by a network of fine cracks and a few wider fractures.',
  'Grains are visible across the face; the colour is fairly even in daylight.',
];

const DEFAULT_DIAGNOSTIC = [
  'Grain size, colour and the way the surface breaks apart were used to compare it with similar rocks seen in the area.',
];

const DEFAULT_REASONING =
  'The reading follows from the texture and colour visible in the frame, and it is limited to what a single photograph can show.';

const DEFAULT_ALTERNATIVES = [
  'A weathered surface of a different rock would look almost the same in this light.',
];

const DEFAULT_UNCERTAINTIES = [
  'The photo does not show the surrounding outcrop or what lies below the surface.',
];

const DEFAULT_LIMITATIONS = [
  'A photograph alone does not establish depth, scale, rate of change, or whether a feature is currently active.',
];

const DEFAULT_NEXT_STEPS = ['Take a close-up with a coin or ruler in the frame so the scale is clear.'];

const HANDLING_SAFETY =
  'Observe from a safe distance. Do not hammer, drill or pry at an exposed face to get a better view.';

/** Shifts a timestamp by whole minutes, so questions and comments are ordered. */
function plusMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function buildMedia(seed: DemoMediaSpec, index: number): DemoMediaSeed {
  const video = Boolean(seed.video);
  return {
    role: seed.role,
    caption: seed.caption,
    mime_type: video ? 'video/webm' : 'image/jpeg',
    url: seed.url,
    demo_note: null,
    sort_order: index,
  };
}

function buildQuestion(post: DemoSpec, seed: DemoQuestionSpec): PostQuestion {
  const answered = seed.status === 'answered';
  return {
    question_id: seed.id,
    question: seed.question,
    asked_by: 'ai',
    asked_at: plusMinutes(post.createdAt, 2),
    status: seed.status,
    answer: answered ? (seed.answer ?? null) : null,
    answered_at: answered ? plusMinutes(post.createdAt, 41) : null,
    answered_by: answered ? 'owner' : null,
    is_public: true,
    is_demo: true,
  };
}

function buildComment(post: DemoSpec, seed: DemoCommentSpec, index: number): DemoCommentSeed {
  const owner = OWNERS[seed.author];
  return {
    comment_id: seed.id,
    parent_comment_id: seed.parent,
    author_public_user_id: owner.id,
    author_display_name: owner.name,
    body: seed.body,
    created_at: plusMinutes(post.createdAt, 120 + index * 37),
  };
}

function buildDemoPost(spec: DemoSpec): DemoPostSeed {
  const owner = OWNERS[spec.owner];
  return {
    passport_id: spec.id,
    observation_category: spec.category,
    observation_subcategory: spec.subcategory,
    title: spec.title,
    user_report: spec.report,
    created_at: spec.createdAt,
    district: spec.district,
    sector: spec.sector ?? demoNeighbourhood(spec.district).sector,
    cell: spec.cell ?? demoNeighbourhood(spec.district).cell,
    village: spec.village ?? demoNeighbourhood(spec.district).village,
    precision: spec.precision,
    latitude: spec.latitude,
    longitude: spec.longitude,
    primary_interpretation: spec.interpretation,
    observed_features: DEFAULT_OBSERVED,
    diagnostic_features: DEFAULT_DIAGNOSTIC,
    reasoning: spec.reasoning ?? DEFAULT_REASONING,
    alternative_possibilities: DEFAULT_ALTERNATIVES,
    uncertainties: DEFAULT_UNCERTAINTIES,
    limitations: spec.limitations ?? DEFAULT_LIMITATIONS,
    recommended_next_steps: DEFAULT_NEXT_STEPS,
    safety_note: spec.safety,
    owner_public_user_id: owner.id,
    owner_display_name: owner.name,
    media: spec.media.map((seed, index) => buildMedia(seed, index)),
    questions: spec.questions.map((seed) => buildQuestion(spec, seed)),
    comments: spec.comments.map((seed, index) => buildComment(spec, seed, index)),
  };
}

/** One answered question plus one left open, which is the usual shape. */
function standardQuestions(postId: string, answeredQuestion: string, openQuestion: string): DemoQuestionSpec[] {
  return [
    {
      id: `${postId}-q1`,
      question: answeredQuestion,
      status: 'answered',
      answer: 'About the width of my hand. I put a ruler beside it in the second photo so you can judge the size.',
    },
    { id: `${postId}-q2`, question: openQuestion, status: 'open' },
  ];
}

const REPORT_GENERIC =
  'Found this while walking near the road after the rain. I took a wide photo first and then moved closer for a second one. I can answer questions about it.';

const INTERPRETATION_GENERIC =
  'A preliminary, AI-assisted reading consistent with locally common rock types. It is not a determination and has not been verified by a geologist.';

function img(role: MediaRole, caption: string, url: string): DemoMediaSpec {
  return { role, caption, url };
}

function vid(role: MediaRole, caption: string, url: string): DemoMediaSpec {
  return { role, caption, url, video: true };
}

const STANDARD_COMMENTS = (postId: string): DemoCommentSpec[] => [
  {
    id: `${postId}-c1`,
    parent: null,
    author: 2,
    body: 'Good find. The close-up is much clearer than the wide shot. Does anyone know the grain size?',
  },
  {
    id: `${postId}-c1r`,
    parent: `${postId}-c1`,
    author: 1,
    body: 'Thanks. I can go back this weekend and take a photo with a scale if that helps.',
  },
];

/**
 * Two seed posts for each category in the taxonomy.
 *
 * The pair is deliberately uneven in what it carries: one card holds a full
 * gallery, a thread and both an answered and an open question, while the other
 * holds back something the interface has to handle honestly instead - an empty
 * gallery, an unanswered question, a withheld location, or an image the reader
 * cannot make out. A category whose two cards were identical would only prove
 * the happy path.
 */
const DEMO_SPECIFICATIONS: DemoSpec[] = [
  // -- rock ------------------------------------------------------------------
  {
    id: 'ET-DEMO-0004',
    category: 'rock',
    subcategory: 'igneous',
    title: 'Columnar basalt in a fresh road cut near Musanze',
    report:
      'These regular columns appeared in a new road cut on the way to Musanze. The face is about two metres high and the columns are clearly jointed. I took a wide shot and a close-up of the joint surfaces.',
    interpretation:
      'Preliminary AI-assisted reading consistent with columnar-jointed basalt, which forms as thick lava cools and cracks into regular columns.',
    createdAt: '2026-08-03T09:12:00.000Z',
    district: 'Musanze',
    sector: null,
    precision: 'district',
    latitude: -1.5,
    longitude: 29.6333,
    owner: 1,
    safety: HANDLING_SAFETY,
    media: [
      img('field', 'Wide view of the road cut showing the column pattern.', MEDIA.igneous),
      img('close_up', 'Close-up of the joints between the columns.', MEDIA.outcrop),
    ],
    questions: standardQuestions(
      'ET-DEMO-0004',
      'Do the columns keep the same spacing all the way across the face?',
      'How thick is the dark band near the top of the cut?'
    ),
    comments: STANDARD_COMMENTS('ET-DEMO-0004'),
  },
  {
    id: 'ET-DEMO-0005',
    category: 'rock',
    subcategory: 'sedimentary',
    title: 'Layered sandstone in a stream bank, Kibilira',
    report:
      'The bank of the stream is built of layers that crumble into sand between my fingers. The layers tilt slightly downstream. One clear photo from the stream bed.',
    interpretation:
      'Preliminary AI-assisted reading consistent with a layered sedimentary rock, most likely sandstone laid down in shallow water.',
    createdAt: '2026-08-11T14:40:00.000Z',
    district: 'Nyaruguru',
    sector: 'Kibilira',
    precision: 'approximate',
    latitude: -2.7031,
    longitude: 29.5123,
    owner: 2,
    safety: HANDLING_SAFETY,
    media: [img('main', 'The layered bank seen from the stream bed.', MEDIA.sedimentary)],
    questions: [
      {
        id: 'ET-DEMO-0005-q1',
        question: 'Which way do the layers tilt, and by roughly how much?',
        status: 'open',
      },
    ],
    comments: [
      {
        id: 'ET-DEMO-0005-c1',
        parent: null,
        author: 1,
        body: 'The tilt looks gentle. Is the stream cutting straight through the layers or running along them?',
      },
    ],
  },

  // -- mineral ---------------------------------------------------------------
  {
    id: 'ET-DEMO-0006',
    category: 'mineral',
    subcategory: 'mineral_specimen',
    title: 'Quartz crystals inside a cavity, Bugesera',
    report:
      'I broke open a small cavity while clearing land and found clear crystals inside. They are glassy and one of them scratches the surface behind them.',
    interpretation:
      'Preliminary AI-assisted reading consistent with quartz crystals lining a cavity. No value is implied and no ore is claimed.',
    createdAt: '2026-08-18T07:55:00.000Z',
    district: 'Bugesera',
    sector: null,
    precision: 'district',
    latitude: -2.15,
    longitude: 30.15,
    owner: 3,
    safety: HANDLING_SAFETY,
    media: [
      img('field', 'The cavity with the crystals still in place.', MEDIA.mineral),
      img('close_up', 'Close-up of the crystal faces.', MEDIA.outcrop),
    ],
    questions: standardQuestions(
      'ET-DEMO-0006',
      'Are the crystals clear or cloudy, and do they all point the same way?',
      'What colour is the rock around the cavity?'
    ),
    comments: STANDARD_COMMENTS('ET-DEMO-0006'),
  },
  {
    id: 'ET-DEMO-0007',
    category: 'mineral',
    subcategory: 'possible_ore_occurrence',
    title: 'Dark mineral vein in weathered rock (location kept private)',
    report:
      'There is a dark, shiny vein running through the rock here. I have kept the exact place private for now. I am only asking what it might be, not whether it is worth anything.',
    interpretation:
      'Preliminary AI-assisted reading of a mineral occurrence. The platform never reports ore, grade, value or a commercial conclusion from a photograph.',
    createdAt: '2026-08-25T11:05:00.000Z',
    district: 'Gatsibo',
    sector: 'Kiziguro',
    precision: 'private',
    latitude: -2.1605,
    longitude: 30.4771,
    owner: 1,
    safety:
      'The platform never reports ore, grade, value or a commercial conclusion from a photograph. Do not dig without the landowner’s permission.',
    media: [img('main', 'The dark vein cutting through the host rock.', MEDIA.mineral)],
    questions: [
      {
        id: 'ET-DEMO-0007-q1',
        question: 'Is the vein harder or softer than the rock around it?',
        status: 'open',
      },
    ],
    comments: [],
  },

  // -- fossil ----------------------------------------------------------------
  {
    id: 'ET-DEMO-0008',
    category: 'fossil',
    subcategory: 'fossil',
    title: 'Spiral shell shape in a limestone block, Kamonyi',
    report:
      'I found this spiral shape in a block of pale rock near the quarry. It looks like it could be a shell. I took a photo of the whole block and a close-up of the spiral.',
    interpretation:
      'Preliminary AI-assisted reading consistent with a fossil shell, or the impression of one, in sedimentary rock.',
    createdAt: '2026-09-01T08:30:00.000Z',
    district: 'Kamonyi',
    sector: null,
    precision: 'district',
    latitude: -2.3,
    longitude: 29.95,
    owner: 2,
    safety: HANDLING_SAFETY,
    media: [
      img('field', 'The block with the spiral shape.', MEDIA.fossil),
      img('close_up', 'Close-up of the spiral itself.', MEDIA.sedimentary),
    ],
    questions: standardQuestions(
      'ET-DEMO-0008',
      'Does the spiral shape continue into the rock around it?',
      'How large is the spiral compared with your hand?'
    ),
    comments: STANDARD_COMMENTS('ET-DEMO-0008'),
  },
  {
    id: 'ET-DEMO-0009',
    category: 'fossil',
    subcategory: 'possible_fossil',
    title: 'Possible fossil imprint, no photo yet',
    report:
      'I saw what looked like a leaf or shell imprint on a rock face, but my phone battery was flat and there is no photo yet. I will add one next time I pass.',
    interpretation:
      'Without a photo the reading can only be reported as a possibility, not a determination.',
    createdAt: '2026-09-05T16:20:00.000Z',
    district: 'Gisagara',
    sector: 'Gatete',
    precision: 'approximate',
    latitude: -2.3812,
    longitude: 29.7641,
    owner: 3,
    safety: HANDLING_SAFETY,
    media: [],
    questions: [
      {
        id: 'ET-DEMO-0009-q1',
        question: 'Please add a photo of the imprint when you can.',
        status: 'open',
      },
    ],
    comments: [],
  },

  // -- geological structure --------------------------------------------------
  {
    id: 'ET-DEMO-0010',
    category: 'geological_structure',
    subcategory: 'fault',
    title: 'Fractured and offset layers in an outcrop, Nyabihu',
    report:
      'The layers in this outcrop are broken and one side looks offset from the other. I recorded a short video panning along the face, because the break is easier to see than in a single photo.',
    interpretation:
      'Preliminary AI-assisted reading consistent with a fracture or small fault offsetting the layers. The offset cannot be measured reliably from one view.',
    createdAt: '2026-09-09T10:15:00.000Z',
    district: 'Nyabihu',
    sector: null,
    precision: 'district',
    latitude: -1.65,
    longitude: 29.5,
    owner: 1,
    safety: HANDLING_SAFETY,
    media: [
      img('context', 'The full outcrop seen from the side.', MEDIA.structure),
      vid('video', 'Short clip panning along the broken face.', MEDIA.clip),
    ],
    questions: standardQuestions(
      'ET-DEMO-0010',
      'Which way has the block moved, and by roughly how much?',
      'Does the break continue beyond the edge of the frame?'
    ),
    comments: STANDARD_COMMENTS('ET-DEMO-0010'),
  },

  // -- geological layer ------------------------------------------------------
  {
    id: 'ET-DEMO-0011',
    category: 'geological_layer',
    subcategory: 'exposed_geological_layer',
    title: 'Exposed layers in a hillside cutting, Rulindo',
    report:
      'A new cutting on the hillside exposes several flat layers stacked on each other. Each band is a slightly different colour. Two photos, one from a distance and one closer.',
    interpretation:
      'Preliminary AI-assisted reading consistent with a stack of sedimentary layers, or strata, exposed by the cutting.',
    createdAt: '2026-09-12T06:45:00.000Z',
    district: 'Rulindo',
    sector: null,
    precision: 'district',
    latitude: -1.7333,
    longitude: 30.0,
    owner: 2,
    safety: HANDLING_SAFETY,
    media: [
      img('field', 'The exposed face showing several layers.', MEDIA.layer),
      img('close_up', 'A closer view of the contact between two layers.', MEDIA.outcrop),
    ],
    questions: standardQuestions(
      'ET-DEMO-0011',
      'Where does one layer end and the next begin in the frame?',
      'How thick is the middle layer, roughly?'
    ),
    comments: STANDARD_COMMENTS('ET-DEMO-0011'),
  },
  {
    id: 'ET-DEMO-0012',
    category: 'geological_layer',
    subcategory: 'soil_regolith_profile',
    title: 'Soil profile exposed above the river, Musha',
    report:
      'The river has cut the bank and you can see the soil sitting on top of the rock below. There are a few colour changes from top to bottom. One photo from the opposite bank.',
    interpretation:
      'Preliminary AI-assisted reading consistent with a soil or regolith profile resting on weathered bedrock.',
    createdAt: '2026-09-16T13:00:00.000Z',
    district: 'Rwamagana',
    sector: 'Musha',
    precision: 'approximate',
    latitude: -1.9634,
    longitude: 30.4412,
    owner: 3,
    safety: HANDLING_SAFETY,
    media: [img('main', 'The bank showing soil over rock.', MEDIA.soil)],
    questions: [
      {
        id: 'ET-DEMO-0012-q1',
        question: 'How deep is the soil before the rock starts?',
        status: 'open',
      },
    ],
    comments: [],
  },

  // -- geomorphology ---------------------------------------------------------
  {
    id: 'ET-DEMO-0013',
    category: 'geomorphology',
    subcategory: 'erosion_feature',
    title: 'Gully forming on a slope after heavy rain, Rutsiro',
    report:
      'After the heavy rain a gully has opened up on the slope above the path. It gets a little wider each season. Two photos, one of the whole slope and one inside the gully.',
    interpretation:
      'Preliminary AI-assisted reading consistent with an erosion gully widened by running water.',
    createdAt: '2026-09-19T09:35:00.000Z',
    district: 'Rutsiro',
    sector: null,
    precision: 'district',
    latitude: -1.9333,
    longitude: 29.5333,
    owner: 1,
    safety: HANDLING_SAFETY,
    media: [
      img('field', 'The gullied slope seen from the path.', MEDIA.erosion),
      img('close_up', 'Inside the gully.', MEDIA.outcrop),
    ],
    questions: standardQuestions(
      'ET-DEMO-0013',
      'Is the gully still cutting deeper, or has it stabilised?',
      'Is there a photo from the opposite side of the slope?'
    ),
    comments: STANDARD_COMMENTS('ET-DEMO-0013'),
  },

  // -- volcanic feature ------------------------------------------------------
  {
    id: 'ET-DEMO-0014',
    category: 'volcanic_feature',
    subcategory: 'lava_flow',
    title: 'Blocky lava flow surface, Ngororero',
    report:
      'The surface here is broken into rough blocks and is much darker than the soil around it. I published the exact point because it is easy to reach and sits off the trail.',
    interpretation:
      'Preliminary AI-assisted reading consistent with a weathered lava flow surface.',
    createdAt: '2026-09-24T05:50:00.000Z',
    district: 'Ngororero',
    sector: 'Kabaya',
    precision: 'exact',
    latitude: -1.8421,
    longitude: 29.6612,
    owner: 2,
    safety:
      'Volcanic terrain can be unstable. Observe from a safe distance and never enter a crater.',
    media: [
      img('field', 'The blocky lava surface stretching away.', MEDIA.volcanic),
      img('close_up', 'Close-up of the texture of one block.', MEDIA.outcrop),
    ],
    questions: standardQuestions(
      'ET-DEMO-0014',
      'Which direction does the flow run in?',
      'Is the surface fresh or weathered?'
    ),
    comments: STANDARD_COMMENTS('ET-DEMO-0014'),
  },

  // -- hydrogeological feature -----------------------------------------------
  {
    id: 'ET-DEMO-0015',
    category: 'hydrogeological_feature',
    subcategory: 'spring',
    title: 'Spring seeping from the base of a slope, Burera',
    report:
      'Water comes out of the ground right at the base of the slope and runs a short way to the stream below. The flow does not stop, even in the dry weeks. One photo.',
    interpretation:
      'Preliminary AI-assisted reading consistent with a spring where water reaches the surface at the base of the slope.',
    createdAt: '2026-09-27T12:25:00.000Z',
    district: 'Burera',
    sector: null,
    precision: 'district',
    latitude: -1.45,
    longitude: 29.8333,
    owner: 3,
    safety: HANDLING_SAFETY,
    media: [img('main', 'The spring seeping at the foot of the slope.', MEDIA.waterfall)],
    questions: standardQuestions(
      'ET-DEMO-0015',
      'Does the flow run all year, or only in the wet season?',
      'Which season was this photo taken in?'
    ),
    comments: STANDARD_COMMENTS('ET-DEMO-0015'),
  },
  {
    id: 'ET-DEMO-0016',
    category: 'hydrogeological_feature',
    subcategory: 'waterfall',
    title: 'Small waterfall over dark rock, no photo yet',
    report:
      'The stream drops over a dark rock step about head height. I could not get close enough for a clear photo, so this is text only for now.',
    interpretation:
      'Preliminary AI-assisted reading, based on the description alone, of a small waterfall stepping over dark rock.',
    createdAt: '2026-09-30T15:10:00.000Z',
    district: 'Nyamasheke',
    sector: 'Karambi',
    precision: 'district',
    latitude: -2.3667,
    longitude: 29.15,
    owner: 1,
    safety: HANDLING_SAFETY,
    media: [],
    questions: [],
    comments: [
      {
        id: 'ET-DEMO-0016-c1',
        parent: null,
        author: 2,
        body: 'A photo from downstream would show the drop and the rock together. Worth a try next time.',
      },
    ],
  },

  // -- mining observation ----------------------------------------------------
  {
    id: 'ET-DEMO-0017',
    category: 'mining_observation',
    subcategory: 'quarry',
    title: 'Working quarry face in Rusizi',
    report:
      'This is the working face of a small quarry. The rock is being cut back in benches. I stayed on the public road for the photos and did not go near the face.',
    interpretation:
      'Preliminary AI-assisted reading of a quarry exposure. This is not an engineering judgement and no material value is claimed.',
    createdAt: '2026-10-02T08:05:00.000Z',
    district: 'Rusizi',
    sector: null,
    precision: 'district',
    latitude: -2.5,
    longitude: 28.9067,
    owner: 2,
    safety:
      'A working quarry edge is not a viewing platform. Keep to the public road and never enter an active face.',
    media: [
      img('field', 'The quarry face with its benches.', MEDIA.quarry),
      img('close_up', 'A closer view of the cut rock.', MEDIA.outcrop),
    ],
    questions: standardQuestions(
      'ET-DEMO-0017',
      'What material is exposed at the face?',
      'Is the quarry active or disused?'
    ),
    comments: STANDARD_COMMENTS('ET-DEMO-0017'),
  },
  {
    id: 'ET-DEMO-0018',
    category: 'mining_observation',
    subcategory: 'visible_mineralization',
    title: 'Stained rock with a metallic sheen, Kayonza',
    report:
      'Part of this rock face has a rusty colour and a sheen that catches the light. I have generalised the location. I am asking what the staining is, not what it is worth.',
    interpretation:
      'Preliminary AI-assisted indication only. The platform never reports ore, grade, value or a commercial conclusion from a photograph.',
    createdAt: '2026-10-04T10:40:00.000Z',
    district: 'Kayonza',
    sector: 'Mushikira',
    precision: 'approximate',
    latitude: -1.9662,
    longitude: 30.6104,
    owner: 3,
    safety: HANDLING_SAFETY,
    media: [img('main', 'The stained and shiny part of the face.', MEDIA.mineral)],
    questions: [
      {
        id: 'ET-DEMO-0018-q1',
        question: 'Is a closer photo of the shiny part possible?',
        status: 'open',
      },
    ],
    comments: [],
  },

  // -- engineering geology ---------------------------------------------------
  {
    id: 'ET-DEMO-0019',
    category: 'engineering_geology',
    subcategory: 'road_cut',
    title: 'Rock cut beside a road, Kicukiro',
    report:
      'The road was widened and left a cut face of rock above the shoulder. It is taller than a person in places. I photographed it from the safe side of the road.',
    interpretation:
      'Preliminary AI-assisted reading of a road cut in rock. No assessment of stability or safety is made.',
    createdAt: '2026-10-06T07:20:00.000Z',
    district: 'Kicukiro',
    sector: null,
    precision: 'district',
    latitude: -1.9833,
    longitude: 30.1,
    owner: 1,
    safety:
      'A cut face above a road is not a place to stand. No photograph is worth a visit to the edge.',
    media: [
      img('field', 'The cut face above the road.', MEDIA.engineering),
      img('close_up', 'A closer view of the rock in the cut.', MEDIA.outcrop),
    ],
    questions: standardQuestions(
      'ET-DEMO-0019',
      'Is the face supported or reinforced in any way?',
      'How tall is the face compared with the road?'
    ),
    comments: STANDARD_COMMENTS('ET-DEMO-0019'),
  },
  {
    id: 'ET-DEMO-0020',
    category: 'engineering_geology',
    subcategory: 'slope',
    title: 'Weathered slope beside a footpath, Janja',
    report:
      'The slope next to the footpath is soft and some material has already slipped onto the path below. It is worse after rain. One photo from the path.',
    interpretation:
      'Preliminary AI-assisted reading consistent with a weathered, slightly unstable slope. This is not an engineering judgement.',
    createdAt: '2026-10-08T14:55:00.000Z',
    district: 'Gakenke',
    sector: 'Janja',
    precision: 'district',
    latitude: -1.7,
    longitude: 29.7833,
    owner: 2,
    safety: HANDLING_SAFETY,
    media: [img('main', 'The slope above the footpath.', MEDIA.erosion)],
    questions: standardQuestions(
      'ET-DEMO-0020',
      'Has material already moved onto the path below?',
      'When was this photo taken?'
    ),
    comments: STANDARD_COMMENTS('ET-DEMO-0020'),
  },

  // -- other geoscience ------------------------------------------------------
  {
    id: 'ET-DEMO-0021',
    category: 'other_geoscience',
    subcategory: 'other_geoscience',
    title: 'Unusual rock on a building plot, Nyarugenge',
    report:
      'A rock on a building plot near town looks different from everything around it. I am not sure how to name it, so I filed it under the general category.',
    interpretation:
      'Preliminary AI-assisted reading filed under the general category because it fits none of the named ones confidently.',
    createdAt: '2026-10-10T09:00:00.000Z',
    district: 'Nyarugenge',
    sector: null,
    precision: 'district',
    latitude: -1.9667,
    longitude: 30.05,
    owner: 3,
    safety: HANDLING_SAFETY,
    media: [img('main', 'The unusual rock on the plot.', MEDIA.metamorphic)],
    questions: standardQuestions(
      'ET-DEMO-0021',
      'Which part of the rock did you find unusual?',
      'Are you sure this is natural rock rather than something man-made?'
    ),
    comments: STANDARD_COMMENTS('ET-DEMO-0021'),
  },
  {
    id: 'ET-DEMO-0022',
    category: 'other_geoscience',
    subcategory: 'other_geoscience',
    title: 'Fine-grained dark rock, Kirehe',
    report:
      'This dark rock is very fine-grained and breaks with a smooth face. It could be volcanic, or something else. Two photos from different angles.',
    interpretation:
      'Preliminary AI-assisted reading filed under the general category, because the photos do not settle a specific name.',
    createdAt: '2026-10-11T11:30:00.000Z',
    district: 'Kirehe',
    sector: 'Kirehe',
    precision: 'district',
    latitude: -2.35,
    longitude: 30.6667,
    owner: 1,
    safety: HANDLING_SAFETY,
    media: [
      img('field', 'The rock from the first angle.', MEDIA.metamorphic),
      img('close_up', 'A second angle showing the broken face.', MEDIA.outcrop),
    ],
    questions: [],
    comments: [
      {
        id: 'ET-DEMO-0022-c1',
        parent: null,
        author: 2,
        body: 'The broken face is the most useful part. Does it feel smooth or gritty?',
      },
    ],
  },

  // -- undetermined ----------------------------------------------------------
  {
    id: 'ET-DEMO-0023',
    category: 'unknown',
    subcategory: 'unknown',
    title: 'Smooth grey surface, unable to name it',
    report:
      'I found this smooth grey surface and honestly cannot say what it is. I described what I saw without giving it a name.',
    interpretation:
      'The reading is undetermined. The photo does not support a specific name, so none is invented.',
    createdAt: '2026-10-12T08:15:00.000Z',
    district: 'Ngoma',
    sector: null,
    precision: 'district',
    latitude: -2.1833,
    longitude: 30.5333,
    owner: 2,
    safety: HANDLING_SAFETY,
    media: [
      img('field', 'The grey surface in context.', MEDIA.sedimentary),
      img('close_up', 'A closer view of the surface.', MEDIA.outcrop),
    ],
    questions: standardQuestions(
      'ET-DEMO-0023',
      'A photo with a ruler in frame would help. Could you add one?',
      'Was the surface wet when you took the photo?'
    ),
    comments: STANDARD_COMMENTS('ET-DEMO-0023'),
  },
  {
    id: 'ET-DEMO-0024',
    category: 'unknown',
    subcategory: 'unknown',
    title: 'Unidentified rock along the footpath, Gicumbi',
    report:
      'This rock sits right by the footpath, so the exact point is published. I could not identify it and did not want to guess.',
    interpretation:
      'The reading remains undetermined, which is reported plainly rather than filled with a guess.',
    createdAt: '2026-10-13T16:05:00.000Z',
    district: 'Gicumbi',
    sector: 'Ryiyange',
    precision: 'exact',
    latitude: -2.0603,
    longitude: 30.3291,
    owner: 3,
    safety: HANDLING_SAFETY,
    media: [img('main', 'The rock beside the footpath.', MEDIA.igneous)],
    questions: [
      {
        id: 'ET-DEMO-0024-q1',
        question: 'Would a photo from the other side help identify it?',
        status: 'open',
      },
    ],
    comments: STANDARD_COMMENTS('ET-DEMO-0024'),
  },

  // -- insufficient image ----------------------------------------------------
  {
    id: 'ET-DEMO-0025',
    category: 'insufficient_image',
    subcategory: 'insufficient_image',
    title: 'Blurred photo of a rock, image not readable',
    report:
      'The photo I took came out blurry and too dark to read. I am adding it anyway so you can see the problem, but there is no clear image.',
    interpretation:
      'The photo does not show enough detail to support any reading. No label is invented in its place.',
    createdAt: '2026-10-14T10:10:00.000Z',
    district: 'Karongi',
    sector: null,
    precision: 'district',
    latitude: -2.05,
    longitude: 29.35,
    owner: 1,
    safety: 'No field advice is offered for an image that could not be read.',
    limitations: [
      'The image did not show enough to support any reading, so nothing here should be taken as one.',
    ],
    media: [img('main', 'The blurry, underexposed photo.', MEDIA.blurry)],
    questions: [
      {
        id: 'ET-DEMO-0025-q1',
        question: 'Please retake the photo in daylight and hold the camera steady.',
        status: 'open',
      },
    ],
    comments: [],
  },
  {
    id: 'ET-DEMO-0026',
    category: 'insufficient_image',
    subcategory: 'insufficient_image',
    title: 'Photo too distant to identify, Nyanza',
    report:
      'I took this from far away and the subject is too small to read. I would rather say so than have it guessed.',
    interpretation:
      'The image could not be read reliably, so the result is reported as unreadable rather than as a confident label.',
    createdAt: '2026-10-15T12:45:00.000Z',
    district: 'Nyanza',
    sector: null,
    precision: 'district',
    latitude: -2.35,
    longitude: 29.75,
    owner: 2,
    safety: HANDLING_SAFETY,
    media: [img('main', 'The distant view.', MEDIA.blurry)],
    questions: [],
    comments: [
      {
        id: 'ET-DEMO-0026-c1',
        parent: null,
        author: 1,
        body: 'A closer photo next time will make this much more useful.',
      },
    ],
  },

  // -- not geoscience --------------------------------------------------------
  {
    id: 'ET-DEMO-0027',
    category: 'non_geoscience',
    subcategory: 'non_geoscience',
    title: 'Wide photo of the countryside, not a geoscience subject',
    report:
      'This is a wide photo of the countryside. It is not really about the rocks, so I filed it under the out-of-scope option.',
    interpretation:
      'The subject is not a geoscience observation. Nothing here is an identification.',
    createdAt: '2026-10-16T07:40:00.000Z',
    district: 'Nyagatare',
    sector: null,
    precision: 'district',
    latitude: -1.3167,
    longitude: 30.3333,
    owner: 3,
    safety: 'No field advice applies to an observation that is not about geoscience.',
    media: [img('main', 'The wide countryside photo.', MEDIA.sedimentary)],
    questions: [],
    comments: [],
  },
  {
    id: 'ET-DEMO-0028',
    category: 'non_geoscience',
    subcategory: 'non_geoscience',
    title: 'Cut building stone, out of scope',
    report:
      'This is a pile of cut stone used for building, not a natural outcrop. I realised it after posting, but the platform should say it is out of scope rather than guess.',
    interpretation:
      'The material is man-made, so the observation is out of scope and no geological identification is made.',
    createdAt: '2026-10-17T13:25:00.000Z',
    district: 'Muhanga',
    sector: 'Kabacuzi',
    precision: 'district',
    latitude: -2.0833,
    longitude: 29.75,
    owner: 1,
    safety: HANDLING_SAFETY,
    media: [img('main', 'The cut stone piled at the site.', MEDIA.quarry)],
    questions: [],
    comments: STANDARD_COMMENTS('ET-DEMO-0028'),
  },
];

const BASE_POSTS: DemoPostSeed[] = [
  {
    passport_id: 'ET-DEMO-0001',
    observation_category: 'geomorphology',
    observation_subcategory: 'landslide',
    title: 'Fresh landslide scar on a hillside, Nyamagabe',
    user_report:
      'After the long rain a section of the hillside above the village slipped and left a bare scar. The foot of the slope is now piled with loose soil and small stones.',
    created_at: '2026-09-14T08:05:00.000Z',
    district: 'Nyamagabe',
    cell: 'Munini',
    village: 'Kigeme',
    sector: null,
    precision: 'district',
    latitude: -2.4667,
    longitude: 29.5,
    primary_interpretation:
      'Preliminary AI-assisted reading consistent with a recent shallow landslide scar on a steep slope.',
    observed_features: [
      'A bare slip scar running down the hillside.',
      'Loose soil and small stones piled at the foot of the slope.',
    ],
    diagnostic_features: [
      'The shape of the scar and the loose material below it follow the path of a shallow slide.',
    ],
    reasoning:
      'The scar and the debris apron below it were the features used to reach the reading; the photo alone cannot show how deep the slip was.',
    alternative_possibilities: [
      'A freshly cut or eroded gully could leave a similar bare strip.',
    ],
    uncertainties: [
      'The photo does not show the depth of the slip or whether the slope is still moving.',
    ],
    limitations: [
      'A photograph alone does not establish depth, rate of movement, or whether a slope is currently active.',
    ],
    recommended_next_steps: [
      'Photograph the foot of the slope again after the next heavy rain.',
    ],
    safety_note:
      'Stay clear of active slopes and falling material. Observe from a safe distance only.',
    owner_public_user_id: 'ET-USER-DEMO1',
    owner_display_name: 'Aline Uwase',
    media: [
      {
        role: 'field',
        caption: 'The slip scar seen from the path below.',
        mime_type: 'image/jpeg',
        url: MEDIA.erosion,
        demo_note: null,
        sort_order: 0,
      },
      {
        role: 'close_up',
        caption: 'Loose soil and stones at the foot of the slope.',
        mime_type: 'image/jpeg',
        url: MEDIA.outcrop,
        demo_note: null,
        sort_order: 1,
      },
    ],
    questions: [
      {
        question_id: 'demo-q1',
        question: 'Does the scar look like a shallow slide or a deep break?',
        asked_by: 'ai',
        asked_at: '2026-09-14T08:07:00.000Z',
        status: 'answered',
        answer:
          'It looks fairly shallow from the path, maybe as deep as a spade, but I could not get closer safely.',
        answered_at: '2026-09-14T09:12:00.000Z',
        answered_by: 'owner',
        is_public: true,
        is_demo: true,
      },
      {
        question_id: 'demo-q2',
        question: 'Has any material reached the houses below?',
        asked_by: 'ai',
        asked_at: '2026-09-14T08:07:00.000Z',
        status: 'open',
        answer: null,
        answered_at: null,
        answered_by: null,
        is_public: true,
        is_demo: true,
      },
    ],
    comments: [
      {
        comment_id: 'demo-c1',
        parent_comment_id: null,
        author_public_user_id: 'ET-USER-DEMO2',
        author_display_name: 'Jean-Bosco Habimana',
        body: 'Glad the houses were spared. Is the slope above the scar still bare, or has grass come back?',
        created_at: '2026-09-15T10:41:00.000Z',
      },
      {
        comment_id: 'demo-c2',
        parent_comment_id: 'demo-c1',
        author_public_user_id: 'ET-USER-DEMO1',
        author_display_name: 'Aline Uwase',
        body: 'Still bare. I will take another photo after the next rain to see if it grows.',
        created_at: '2026-09-15T11:02:00.000Z',
      },
    ],
  },
  {
    passport_id: 'ET-DEMO-0002',
    observation_category: 'geological_structure',
    observation_subcategory: 'joint',
    title: 'Closely spaced joints in a granite face, Huye',
    user_report:
      'The rock face here is cut into regular blocks by cracks that run in two directions. The spacing is fairly even across the face. The location is approximate.',
    created_at: '2026-09-22T13:20:00.000Z',
    district: 'Huye',
    sector: 'Huye',
    cell: 'Gaseke',
    village: 'Ngoma',
    precision: 'approximate',
    latitude: -2.7667,
    longitude: 29.7333,
    primary_interpretation:
      'Preliminary AI-assisted reading consistent with a jointed granite face, split into blocks by two sets of joints.',
    observed_features: ['Two sets of cracks crossing at an angle.', 'Blocks of fairly even size across the face.'],
    diagnostic_features: ['The two sets of cracks and the even block size point to regular joint spacing.'],
    reasoning: 'The crossing cracks and the block pattern were the features used to reach the reading.',
    alternative_possibilities: ['Blasting for a nearby cut could leave a similar blocky face.'],
    uncertainties: ['Spacing and orientation cannot be measured reliably from a single frame.'],
    limitations: ['Spacing and orientation cannot be measured reliably from a single frame.'],
    recommended_next_steps: ['Photograph the face straight on, with a tape measure across one block.'],
    safety_note: 'Do not hammer, drill, or pry at an exposed face to get a better view.',
    owner_public_user_id: 'ET-USER-DEMO3',
    owner_display_name: 'Eric Niyonsaba',
    media: [
      {
        role: 'context',
        caption: 'The outcrop showing the two joint sets.',
        mime_type: 'image/jpeg',
        url: MEDIA.structure,
        demo_note: null,
        sort_order: 0,
      },
      {
        role: 'video',
        caption: 'Short clip panning across the jointed face.',
        mime_type: 'video/webm',
        url: MEDIA.clip,
        demo_note: null,
        sort_order: 1,
      },
    ],
    questions: [
      {
        question_id: 'demo-q3',
        question: 'Which set of cracks runs across the other?',
        asked_by: 'ai',
        asked_at: '2026-09-22T13:22:00.000Z',
        status: 'open',
        answer: null,
        answered_at: null,
        answered_by: null,
        is_public: true,
        is_demo: true,
      },
    ],
    comments: [
      {
        comment_id: 'demo-c3',
        parent_comment_id: null,
        author_public_user_id: 'ET-USER-DEMO2',
        author_display_name: 'Jean-Bosco Habimana',
        body: 'The clip makes the two directions much easier to see than the photo alone.',
        created_at: '2026-09-23T07:15:00.000Z',
      },
    ],
  },
  {
    passport_id: 'ET-DEMO-0003',
    observation_category: 'volcanic_feature',
    observation_subcategory: 'volcanic_cone',
    title: 'Cone-shaped hill near Musanze, exact location published',
    user_report:
      'A rounded, cone-shaped hill stands near the road. The slopes are covered with dark soil and scattered rock. I published the exact point because it is beside the main road.',
    created_at: '2026-10-01T05:48:00.000Z',
    district: 'Musanze',
    sector: null,
    cell: 'Muhoza',
    village: 'Gikingiro',
    precision: 'exact',
    latitude: -1.52,
    longitude: 29.65,
    primary_interpretation:
      'Preliminary AI-assisted reading consistent with a volcanic cone; the shape and the dark soil are typical of this area.',
    observed_features: ['A rounded, cone-shaped hill.', 'Dark soil and scattered rock across the slopes.'],
    diagnostic_features: ['The cone shape with even slopes is the feature the reading rests on.'],
    reasoning: 'The shape of the hill and the dark soil around it were used to reach the reading.',
    alternative_possibilities: ['A hill shaped by erosion could look similar from the road.'],
    uncertainties: ['The photo cannot show the material inside the hill.'],
    limitations: ['Scale cannot be judged from a photograph without a reference object.'],
    recommended_next_steps: ['Take a second photo from the far side of the hill.'],
    safety_note: 'Volcanic terrain can be unstable. Observe from a safe distance and never enter a crater.',
    owner_public_user_id: 'ET-USER-DEMO1',
    owner_display_name: 'Aline Uwase',
    media: [
      {
        role: 'main',
        caption: 'The cone-shaped hill seen from the road.',
        mime_type: 'image/jpeg',
        url: MEDIA.volcanic,
        demo_note: null,
        sort_order: 0,
      },
    ],
    questions: [],
    comments: [
      {
        comment_id: 'demo-c4',
        parent_comment_id: null,
        author_public_user_id: 'ET-USER-DEMO3',
        author_display_name: 'Eric Niyonsaba',
        body: 'There are several of these along that road. They all have the same rounded shape.',
        created_at: '2026-10-01T12:30:00.000Z',
      },
      {
        comment_id: 'demo-c5',
        parent_comment_id: null,
        author_public_user_id: 'ET-USER-DEMO2',
        author_display_name: 'Jean-Bosco Habimana',
        body: 'The dark soil is a good clue. Does the hill top look flat when you stand closer?',
        created_at: '2026-10-01T14:06:00.000Z',
      },
    ],
  },

  ...DEMO_SPECIFICATIONS.map(buildDemoPost),
];

/**
 * The seed posts as they are served.
 *
 * Every post is given a full gallery here, so a deployment always shows the
 * same rich shape: five photographs and one or two clips. The compact
 * `media` each specification carries only feeds the map preview and the
 * dataset's own metadata; it is replaced by the gallery at this one point.
 */
function buildFirstVisits(): DemoPostSeed[] {
  return BASE_POSTS.map((post, index) => {
    const neighbourhood = demoNeighbourhood(post.district);
    return {
      ...post,
      sector: post.sector ?? neighbourhood.sector,
      cell: post.cell ?? neighbourhood.cell,
      village: post.village ?? neighbourhood.village,
      media: buildDemoGallery(post.observation_category, index),
    };
  });
}

/**
 * A second, independent visit to a place already covered by an earlier seed.
 *
 * Another contributor visited the same ground later and recorded their own
 * photos, video, report and attached files. The visits sit within a hundred
 * metres of the parent's published point (a visitor almost never captures the
 * identical GPS decimal pair even at the same spot), yet every field that
 * belongs to the visit itself - its capture point, title, media, report, AI
 * reading, attachments, owner and comments - is that visitor's own.
 */
interface SecondVisitSpec {
  id: string;
  parentId: string;
  createdAt: string;
  /** The new visitor (must differ from the parent's owner). */
  owner: DemoSpec['owner'];
  /** The earlier visitor, whose earlier post this one refers to in the thread. */
  earlierVisitor: DemoSpec['owner'];
  report: string;
  galleryIndex: number;
  attachments: DemoAttachmentSeed[];
  /** Small offset from the parent's capture point, in decimal degrees. */
  dLat: number;
  dLng: number;
  title: string;
  primary_interpretation: string;
  observed_features: string[];
  diagnostic_features: string[];
  reasoning: string;
  alternative_possibilities: string[];
  uncertainties: string[];
  limitations: string[];
  recommended_next_steps: string[];
}

function buildSecondVisit(parent: DemoPostSeed, spec: SecondVisitSpec): DemoPostSeed {
  const owner = OWNERS[spec.owner];
  const earlier = OWNERS[spec.earlierVisitor];
  const questions: PostQuestion[] = [
    {
      question_id: `${spec.id}-q1`,
      question: 'Did you find the same pattern on the far side of the exposure?',
      status: 'answered',
      asked_by: 'ai',
      asked_at: plusMinutes(spec.createdAt, 3),
      answer:
        'No. The far side is smooth and does not show the same pattern, which I wrote down in my notes.',
      answered_at: plusMinutes(spec.createdAt, 52),
      answered_by: 'owner',
      is_public: true,
      is_demo: true,
    },
    {
      question_id: `${spec.id}-q2`,
      question: 'Would you like this place recommended for a research visit?',
      status: 'open',
      asked_by: 'ai',
      asked_at: plusMinutes(spec.createdAt, 4),
      answer: null,
      answered_at: null,
      answered_by: null,
      is_public: true,
      is_demo: true,
    },
  ];

  return {
    ...parent,
    passport_id: spec.id,
    created_at: spec.createdAt,
    // The second visitor stood a few metres from the earlier capture point, so
    // the coordinates differ by a small realistic amount while staying inside
    // the same-place grouping radius.
    latitude: parent.latitude + spec.dLat,
    longitude: parent.longitude + spec.dLng,
    title: spec.title,
    user_report: spec.report,
    // A repeat visitor who deliberately re-verifies the spot shares an exact
    // pin, so the passport shows the actual metres-away capture point instead of
    // the generalised one the first visitor shared.
    precision: 'exact',
    owner_public_user_id: owner.id,
    owner_display_name: owner.name,
    primary_interpretation: spec.primary_interpretation,
    observed_features: spec.observed_features,
    diagnostic_features: spec.diagnostic_features,
    reasoning: spec.reasoning,
    alternative_possibilities: spec.alternative_possibilities,
    uncertainties: spec.uncertainties,
    limitations: spec.limitations,
    recommended_next_steps: spec.recommended_next_steps,
    media: buildDemoGallery(parent.observation_category, spec.galleryIndex),
    questions,
    comments: [
      {
        comment_id: `${spec.id}-c1`,
        parent_comment_id: null,
        author_public_user_id: earlier.id,
        author_display_name: earlier.name,
        body:
          'Welcome back to this spot. I put my own photos and notes in the previous visit, just beside yours here.',
        created_at: plusMinutes(spec.createdAt, 200),
      },
    ],
    attachments: spec.attachments,
  };
}

const SECOND_VISITS: SecondVisitSpec[] = [
  {
    id: 'ET-DEMO-0029',
    parentId: 'ET-DEMO-0005',
    createdAt: '2026-08-19T09:10:00.000Z',
    owner: 3,
    earlierVisitor: 2,
    report:
      'I came back to the same stream bank and made my own record of it. The layers are the ones my neighbour photographed before, but I walked further along the cut to where the bank is steepest. I took my own photos and kept a short note about the grain size.',
    galleryIndex: 3,
    attachments: [
      {
        kind: 'report',
        title: 'My stream-bank notes',
        description: 'The note I wrote while I was there, separate from the photos.',
        filename: 'et-demo-0029-stream-bank-notes.pdf',
        mime_type: 'application/pdf',
        url: '/media/documents/et-demo-0029-stream-bank-notes.pdf',
        size_bytes: 1335,
        allow_download: true,
      },
    ],
    dLat: 0.0022,
    dLng: 0.0015,
    title: 'Steeper stream-cut section of the sandstone, Kibilira',
    primary_interpretation:
      'The same even-grained sandstone as the earlier record, read again from the steeper face of this cut.',
    observed_features: [
      'Three cleanly exposed beds, with the finest layer at the top.',
      'A steeper, drier face than at the earlier stopping point.',
      'Clear colour banding across the cut.',
    ],
    diagnostic_features: [
      'Even grain size across the three beds and the way the top bed breaks flat.',
    ],
    reasoning:
      'The reading follows from the even grain and flat breaking seen here, matching the earlier record while coming from my own closer view of the steeper face.',
    alternative_possibilities: [
      'A fine-grained volcanic ash could present a similar flat break.',
    ],
    uncertainties: ['The photo does not show how deep the beds continue into the bank.'],
    limitations: ['My walk along the cut shows one cross-section, not the full thickness.'],
    recommended_next_steps: [
      'Photograph the bed ends where they meet the water so the lowest layer is covered.',
    ],
  },
  {
    id: 'ET-DEMO-0030',
    parentId: 'ET-DEMO-0009',
    createdAt: '2026-09-18T13:40:00.000Z',
    owner: 2,
    earlierVisitor: 3,
    report:
      'The earlier contributor photographed a possible imprint but had no photo then. I retraced the same ground and found the shape again. This time I brought a ruler, so my photos show the scale, and I wrote the measurements into a note that I have attached here.',
    galleryIndex: 4,
    attachments: [
      {
        kind: 'report',
        title: 'Imprint measurements',
        description: 'My measurements of the imprint, with the ruler photo as reference.',
        filename: 'et-demo-0030-imprint-measurements.pdf',
        mime_type: 'application/pdf',
        url: '/media/documents/et-demo-0030-imprint-measurements.pdf',
        size_bytes: 1283,
        allow_download: true,
      },
    ],
    dLat: -0.0015,
    dLng: 0.0024,
    title: 'Retraced possible imprint with ruler scale, Kigembe',
    primary_interpretation:
      'The curved mark read here is consistent with an imprint, now measured directly with a ruler in the frame.',
    observed_features: [
      'A curved parallel mark about nine centimetres across.',
      'The mark follows the bedding of the stone.',
      'A ruler in the frame shows the scale.',
    ],
    diagnostic_features: [
      'The mark sits parallel to the bedding rather than cutting across it.',
    ],
    reasoning:
      'Measured directly with a ruler in the frame, which the earlier visit could not do when no photo existed yet.',
    alternative_possibilities: [
      'A weathering line could also run parallel to the bedding.',
    ],
    uncertainties: [
      'Depth is about one and a half centimetres at the deepest point, judged against the ruler.',
    ],
    limitations: ['Only one surface was exposed; I did not turn the stone.'],
    recommended_next_steps: [
      'A geologist with the stone in hand could say whether it is an imprint at all.',
    ],
  },
  {
    id: 'ET-DEMO-0031',
    parentId: 'ET-DEMO-0010',
    createdAt: '2026-09-21T15:05:00.000Z',
    owner: 2,
    earlierVisitor: 1,
    report:
      'I visited the outcrop again to take my own measurements of the offset layers. I recorded the direction each face points and kept two short documents: one with the numbers, and a hand sketch of the way the upper block has moved.',
    galleryIndex: 6,
    attachments: [
      {
        kind: 'research',
        title: 'Fault-plane readings',
        description: 'The direction and angle I measured for the offset face.',
        filename: 'et-demo-0031-fault-plane-readings.pdf',
        mime_type: 'application/pdf',
        url: '/media/documents/et-demo-0031-fault-plane-readings.pdf',
        size_bytes: 1263,
        allow_download: false,
      },
      {
        kind: 'document',
        title: 'Hand sketch of the offset',
        description: 'My sketch of the two layers and how the upper block has moved.',
        filename: 'et-demo-0031-offset-sketch.pdf',
        mime_type: 'application/pdf',
        url: '/media/documents/et-demo-0031-offset-sketch.pdf',
        size_bytes: 1192,
        allow_download: true,
      },
    ],
    dLat: 0.0024,
    dLng: -0.0012,
    title: 'Offset layer readings at the outcrop, Jomba',
    primary_interpretation:
      'The offset across the single crack is consistent with an earlier fault movement at this outcrop.',
    observed_features: [
      'A crack across the face running roughly north-south.',
      'The offset face leaning about seventy degrees from level.',
      'The upper block shifted sideways from the lower one.',
    ],
    diagnostic_features: [
      'The sideways shift of the upper block relative to the lower block across one crack.',
    ],
    reasoning:
      'Measured against the orientation of the outcrop face rather than guessed from a photograph.',
    alternative_possibilities: [
      'The shift could be a slump along the face rather than a deep fault.',
    ],
    uncertainties: ['Only the visible face was measured; the depth of the crack is unknown.'],
    limitations: ['A hand sketch cannot record the full three-dimensional movement.'],
    recommended_next_steps: [
      'Two people holding a straight edge across the crack would confirm the sideways reading.',
    ],
  },
  {
    id: 'ET-DEMO-0032',
    parentId: 'ET-DEMO-0019',
    createdAt: '2026-10-08T08:45:00.000Z',
    owner: 3,
    earlierVisitor: 1,
    report:
      'The road cut near Kicukiro had already been reported, so I went back and photographed it from the other side. I kept my own visit note with the photos so that what I saw stays separate from the first report.',
    galleryIndex: 5,
    attachments: [
      {
        kind: 'report',
        title: 'Road-cut visit notes',
        description: 'My short note about what I saw on the far side of the cut.',
        filename: 'et-demo-0032-road-cut-notes.pdf',
        mime_type: 'application/pdf',
        url: '/media/documents/et-demo-0032-road-cut-notes.pdf',
        size_bytes: 1199,
        allow_download: false,
      },
    ],
    dLat: -0.0012,
    dLng: -0.0025,
    title: 'Far-side record of the Kicukiro road cut',
    primary_interpretation:
      'The freshly exposed beds on the far side read as the same engineered cut, with a harder top bed overhanging the lower ones.',
    observed_features: [
      'Freshly exposed beds following the road line on the far side.',
      'The top bed sticking out a little beyond the lower ones.',
      'Even colour across the exposed face.',
    ],
    diagnostic_features: [
      'The harder top bed overhanging the softer lower beds.',
    ],
    reasoning:
      'Read from the far side of the cut, which the earlier report had not covered.',
    alternative_possibilities: [
      'The overhang could be the natural shape of the cut rather than harder rock.',
    ],
    uncertainties: [
      'I photographed the face from across the road, so the closest metres are not in frame.',
    ],
    limitations: [
      'A roadside cut is shaped partly by the road works, not only by the geology.',
    ],
    recommended_next_steps: [
      'A close photo from the base of the far face would show where the beds meet.',
    ],
  },
];

/**
 * The seed posts as they are served, including second visits.
 *
 * `SECOND_VISITS` keep the count at 32 seed posts: 28 first visits plus four
 * independent repeat visits at the same exact coordinates. The repeat visits
 * exist so the "same place" grouping and the attachments list have real data.
 */
export const DEMO_POSTS: DemoPostSeed[] = (() => {
  const first = buildFirstVisits();
  const second = SECOND_VISITS.map((spec) => {
    const parent = first.find((post) => post.passport_id === spec.parentId);
    if (!parent) throw new Error(`Second visit ${spec.id} has no parent seed ${spec.parentId}`);
    return buildSecondVisit(parent, spec);
  });
  return [...first, ...second];
})();

/** Looks up one seed post by its passport id. */
export function findDemoPost(passportId: string): DemoPostSeed | null {
  const wanted = passportId.trim().toUpperCase();
  return DEMO_POSTS.find((post) => post.passport_id.toUpperCase() === wanted) ?? null;
}

/** True when a passport id belongs to a seed post. */
export function isDemoPassport(passportId: string): boolean {
  return findDemoPost(passportId) !== null;
}

/** Seed comments for one post, oldest first. */
export function demoComments(passportId: string): DemoCommentSeed[] {
  const post = findDemoPost(passportId);
  if (!post) return [];
  return [...post.comments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

/** Seed discussion as the public API publishes it. */
export function demoPublicComments(passportId: string): PublicComment[] {
  const post = findDemoPost(passportId);
  if (!post) return [];

  const identity = (publicId: string): { public_user_id: string; display_name: string | null; is_demo: boolean } => {
    const match = post.comments.find((comment) => comment.author_public_user_id === publicId);
    return {
      public_user_id: publicId,
      display_name: match?.author_display_name ?? null,
      is_demo: true,
    };
  };

  const flat = demoComments(passportId).map((comment) => ({
    comment_id: comment.comment_id,
    parent_comment_id: comment.parent_comment_id,
    author: identity(comment.author_public_user_id),
    body: comment.body,
    created_at: comment.created_at,
    edited_at: null,
    moderation_status: 'visible' as const,
    reply_count: 0,
    replies: [] as PublicComment[],
    is_demo: true,
  }));

  return flat.filter((comment) => comment.parent_comment_id === null).map((root) => ({
    ...root,
    replies: flat.filter((comment) => comment.parent_comment_id === root.comment_id),
  }));
}
