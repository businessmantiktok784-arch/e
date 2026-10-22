/**
 * Geoscience observation taxonomy.
 *
 * This is the single source of truth for what Earth Talk can observe. The AI
 * prompt, the runtime response validation, the database constraints, the public
 * API filters and the client-side filters all read from here, so a category
 * cannot exist in one layer and be missing from another.
 *
 * Design rules encoded in this file:
 *
 *  - Category first. A photograph is classified by what kind of geoscience
 *    observation it is before any interpretation is attempted.
 *  - Honest exits. `insufficient_image` and `non_geoscience` are first-class
 *    results, not failures. A photograph that cannot be read is reported as
 *    unreadable rather than guessed at.
 *  - No commercial or safety conclusions. Mining observations may describe
 *    "possible mineralization"; they may never assert ore, grade, value or
 *    engineering safety.
 */

export type GeoscienceCategory =
  | 'rock'
  | 'mineral'
  | 'fossil'
  | 'geological_structure'
  | 'geological_layer'
  | 'geomorphology'
  | 'volcanic_feature'
  | 'hydrogeological_feature'
  | 'mining_observation'
  | 'engineering_geology'
  | 'other_geoscience'
  | 'unknown'
  | 'insufficient_image'
  | 'non_geoscience';

export interface Subcategory {
  id: string;
  label: string;
}

/**
 * Subcategories per category, from the product specification. Every category
 * keeps an explicit "unknown" option so the AI is never forced into a confident
 * label it cannot support.
 */
export const GEOSCIENCE_SUBCATEGORIES: Record<GeoscienceCategory, Subcategory[]> = {
  rock: [
    { id: 'igneous', label: 'Igneous' },
    { id: 'sedimentary', label: 'Sedimentary' },
    { id: 'metamorphic', label: 'Metamorphic' },
    { id: 'unknown_rock', label: 'Unknown rock' },
  ],
  mineral: [
    { id: 'mineral_specimen', label: 'Mineral specimen' },
    { id: 'crystal', label: 'Crystal' },
    { id: 'mineral_aggregate', label: 'Mineral aggregate' },
    { id: 'possible_ore_occurrence', label: 'Possible ore or mineral occurrence' },
    { id: 'unknown_mineral', label: 'Unknown mineral' },
  ],
  fossil: [
    { id: 'fossil', label: 'Fossil' },
    { id: 'possible_fossil', label: 'Possible fossil' },
    { id: 'fossil_imprint', label: 'Fossil imprint' },
    { id: 'trace_fossil', label: 'Trace fossil' },
    { id: 'shell_fossil_fragment', label: 'Shell or fossil fragment' },
    { id: 'paleontological_feature', label: 'Paleontological feature' },
    { id: 'unknown_fossil_like', label: 'Unknown fossil-like object' },
  ],
  geological_structure: [
    { id: 'bedding', label: 'Bedding' },
    { id: 'foliation', label: 'Foliation' },
    { id: 'cleavage', label: 'Cleavage' },
    { id: 'lineation', label: 'Lineation' },
    { id: 'joint', label: 'Joint' },
    { id: 'fracture', label: 'Fracture' },
    { id: 'fault', label: 'Fault' },
    { id: 'fold', label: 'Fold' },
    { id: 'unconformity', label: 'Unconformity' },
    { id: 'contact', label: 'Contact' },
    { id: 'vein', label: 'Vein' },
    { id: 'dyke', label: 'Dyke' },
    { id: 'sill', label: 'Sill' },
    { id: 'other_structure', label: 'Other geological structure' },
    { id: 'unknown_structure', label: 'Unknown structure' },
  ],
  geological_layer: [
    { id: 'sedimentary_layer', label: 'Sedimentary layer' },
    { id: 'stratigraphic_sequence', label: 'Stratigraphic sequence' },
    { id: 'exposed_geological_layer', label: 'Exposed geological layer' },
    { id: 'soil_regolith_profile', label: 'Soil or regolith profile' },
    { id: 'weathering_profile', label: 'Weathering profile' },
    { id: 'geological_contact', label: 'Geological contact' },
    { id: 'unknown_layer', label: 'Unknown layer' },
  ],
  geomorphology: [
    { id: 'hill', label: 'Hill' },
    { id: 'valley', label: 'Valley' },
    { id: 'escarpment', label: 'Escarpment' },
    { id: 'erosion_feature', label: 'Erosion feature' },
    { id: 'landslide', label: 'Landslide' },
    { id: 'cave', label: 'Cave' },
    { id: 'gorge', label: 'Gorge' },
    { id: 'cliff', label: 'Cliff' },
    { id: 'river_terrace', label: 'River terrace' },
    { id: 'alluvial_deposit', label: 'Alluvial deposit' },
    { id: 'volcanic_landform', label: 'Volcanic landform' },
    { id: 'other_landform', label: 'Other landform' },
    { id: 'unknown_landform', label: 'Unknown landform' },
  ],
  volcanic_feature: [
    { id: 'lava', label: 'Lava' },
    { id: 'volcanic_rock', label: 'Volcanic rock' },
    { id: 'volcanic_ash_tephra', label: 'Volcanic ash or tephra' },
    { id: 'volcanic_cone', label: 'Volcanic cone' },
    { id: 'crater', label: 'Crater' },
    { id: 'lava_flow', label: 'Lava flow' },
    { id: 'volcanic_deposit', label: 'Volcanic deposit' },
    { id: 'geothermal_feature', label: 'Geothermal feature' },
    { id: 'unknown_volcanic_feature', label: 'Unknown volcanic feature' },
  ],
  hydrogeological_feature: [
    { id: 'spring', label: 'Spring' },
    { id: 'geological_seep', label: 'Geological seep' },
    { id: 'waterfall', label: 'Waterfall' },
    { id: 'river_geological_feature', label: 'River geological feature' },
    { id: 'lake_geological_feature', label: 'Lake geological feature' },
    { id: 'groundwater_feature', label: 'Groundwater-related feature' },
    { id: 'mineralized_water_indication', label: 'Mineralized water indication' },
    { id: 'unknown_hydro_feature', label: 'Unknown water-related feature' },
  ],
  mining_observation: [
    { id: 'mineral_occurrence', label: 'Mineral occurrence' },
    { id: 'visible_mineralization', label: 'Visible mineralization' },
    { id: 'alteration', label: 'Alteration' },
    { id: 'vein_mining', label: 'Vein' },
    { id: 'mine_workings', label: 'Mine workings' },
    { id: 'quarry', label: 'Quarry' },
    { id: 'waste_rock', label: 'Waste rock' },
    { id: 'tailings', label: 'Tailings' },
    { id: 'geological_exposure', label: 'Geological exposure' },
    { id: 'exploration_indication', label: 'Exploration indication' },
    { id: 'unknown_mining_observation', label: 'Undetermined mining observation' },
  ],
  engineering_geology: [
    { id: 'rock_cut', label: 'Rock cut' },
    { id: 'road_cut', label: 'Road cut' },
    { id: 'excavation_exposure', label: 'Excavation exposure' },
    { id: 'slope', label: 'Slope' },
    { id: 'unstable_geological_material', label: 'Unstable geological material' },
    { id: 'foundation_exposure', label: 'Foundation exposure' },
    { id: 'construction_geology_feature', label: 'Construction geology feature' },
    { id: 'tunnel_geology', label: 'Tunnel geology' },
    { id: 'quarry_face', label: 'Quarry face' },
    { id: 'unknown_engineering_feature', label: 'Undetermined engineering geology feature' },
  ],
  other_geoscience: [{ id: 'other_geoscience', label: 'Other geoscience observation' }],
  unknown: [{ id: 'unknown', label: 'Undetermined' }],
  insufficient_image: [{ id: 'insufficient_image', label: 'Image not readable' }],
  non_geoscience: [{ id: 'non_geoscience', label: 'Not a geoscience observation' }],
};

/** Human labels for the category, used in the API, the UI and the passport. */
export const GEOSCIENCE_CATEGORY_LABELS: Record<GeoscienceCategory, string> = {
  rock: 'Rock',
  mineral: 'Mineral',
  fossil: 'Fossil or paleontological',
  geological_structure: 'Geological structure',
  geological_layer: 'Geological layer or stratigraphy',
  geomorphology: 'Landform or geomorphology',
  volcanic_feature: 'Volcanic feature',
  hydrogeological_feature: 'Hydrogeological feature',
  mining_observation: 'Mining or economic geology',
  engineering_geology: 'Engineering geology',
  other_geoscience: 'Other geoscience',
  unknown: 'Undetermined',
  insufficient_image: 'Insufficient image',
  non_geoscience: 'Not geoscience',
};

export const GEOSCIENCE_CATEGORIES = Object.keys(GEOSCIENCE_CATEGORY_LABELS) as GeoscienceCategory[];

const SUBCATEGORY_IDS_BY_CATEGORY: Record<GeoscienceCategory, Set<string>> =
  Object.fromEntries(
    GEOSCIENCE_CATEGORIES.map((category) => [
      category,
      new Set(GEOSCIENCE_SUBCATEGORIES[category].map((entry) => entry.id)),
    ]),
  ) as Record<GeoscienceCategory, Set<string>>;

export function isGeoscienceCategory(value: unknown): value is GeoscienceCategory {
  return typeof value === 'string' && (GEOSCIENCE_CATEGORIES as string[]).includes(value);
}

export function isSubcategoryOf(category: GeoscienceCategory, value: unknown): boolean {
  return typeof value === 'string' && SUBCATEGORY_IDS_BY_CATEGORY[category].has(value);
}

/**
 * Coerces a model-supplied category and subcategory into a valid pair.
 *
 * An unknown category becomes `unknown` rather than throwing away the rest of a
 * valid interpretation, and a subcategory that does not belong to the chosen
 * category falls back to that category's own unknown option. A model returning
 * a mismatched pair is a bug in the prompt, not a reason to fail a contributor
 * who sent a good photograph.
 */
export function normalizeCategoryPair(
  category: unknown,
  subcategory: unknown,
): { observation_category: GeoscienceCategory; observation_subcategory: string } {
  const resolvedCategory = isGeoscienceCategory(category) ? category : 'unknown';
  const resolvedSubcategory =
    isSubcategoryOf(resolvedCategory, subcategory) ? String(subcategory) : defaultSubcategory(resolvedCategory);

  return {
    observation_category: resolvedCategory,
    observation_subcategory: resolvedSubcategory,
  };
}

/** The subcategory used when a category is known but the detail is not. */
export function defaultSubcategory(category: GeoscienceCategory): string {
  const options = GEOSCIENCE_SUBCATEGORIES[category];
  // An explicit unknown option always wins. Without this ordering a category
  // whose first subcategory happens to repeat the category name (a fossil with
  // subcategory "fossil") would resolve to a confident label instead of to the
  // honest "unknown fossil-like object" the contributor deserves.
  const unknownOption = options.find((entry) => entry.id.startsWith('unknown'));
  if (unknownOption) return unknownOption.id;

  // The exit categories ("other_geoscience", "insufficient_image",
  // "non_geoscience") have no more specific option to retreat to, so their own
  // id is the honest answer.
  const selfOption = options.find((entry) => entry.id === category);
  return (selfOption ?? options[0]).id;
}

/**
 * Categories that carry a rock interpretation. These keep the existing rock
 * analysis fields meaningful, so the older passport fields stay populated for
 * rocks and are honestly empty for everything else.
 */
export const ROCK_LIKE_CATEGORIES: ReadonlySet<GeoscienceCategory> = new Set<GeoscienceCategory>([
  'rock',
  'volcanic_feature',
]);

/**
 * Claims the AI must never make from a photograph alone. Used by the prompt,
 * by the response validation and by the tests that guard this policy.
 */
export const PROHIBITED_CLAIM_PATTERNS: readonly RegExp[] = [
  /\b(?:is|are|this is|you (?:have|found))\s+gold\b/i,
  /\bconfirmed\s+(?:gold|diamond|diamond(s)?|ore|deposit|mineral deposit)\b/i,
  /\b(?:ore|mineral)\s+grade\b/i,
  /\beconomically\s+(?:viable|valuable|profitable)\b/i,
  /\bcommercial\s+value\b/i,
  /\bproven\s+reserve\b/i,
  // A hedged adjective in front of a commodity does not make a deposit claim safe.
  // "a proven gold deposit" asserts the same thing as "this is gold", and "worth
  // millions" asserts a value just as firmly as a number would.
  /\b(?:proven|confirmed|verified|established)\s+(?:gold|silver|copper|iron|ore|mineral)\s+deposi(?:t|ts)\b/i,
  /\bworth\s+(?:a\s+)?(?:[a-z]+\s+)?(?:millions?|billions?|thousands)\b/i,
  /\b(?:guaranteed|certain)\s+(?:deposit|reserve|ore|money|revenue)\b/i,
  /\b(?:valuable|precious)\s+(?:ruby|emerald|diamond|gold|gem|jewel|mineral|deposit)\b/i,
  /\bworth\s+(?:usd|us\$|\$|rwf|frw)?\s?\d/i,
  /\bmine\s+(?:it|this)\s+(?:now|quickly)\b/i,
  /\blaboratory[-\s]confirmed\b/i,
  /\bexact\s+(?:mineral\s+composition|geological\s+age|formation)\b/i,
  /\bscientifically\s+confirmed\b/i,
  /\bsafe\b[^.]{0,20}\b(?:for|to)\s+(?:walk|climb|build|construction)\b/i,
];

/** Field names whose free text is screened for prohibited claims. */
export const PROHIBITED_CLAIM_FIELDS = [
  'primary_interpretation',
  'reasoning',
  'geological_context',
  'safety_note',
  'possible_name',
] as const;

/**
 * Returns the phrases a text field must not contain. The caller decides how to
 * respond: the prompt forbids them, and validation strips a matching
 * interpretation rather than publishing it.
 */
export function findProhibitedClaims(text: string | null | undefined): string[] {
  if (!text) return [];
  return PROHIBITED_CLAIM_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}