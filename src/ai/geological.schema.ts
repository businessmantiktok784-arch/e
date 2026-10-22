import { Type, type Schema } from '@google/genai';
import { trimText, cleanTextList } from '../utils/text.js';
import {
  GEOSCIENCE_CATEGORIES,
  GEOSCIENCE_SUBCATEGORIES,
  GEOSCIENCE_CATEGORY_LABELS,
  findProhibitedClaims,
  normalizeCategoryPair,
  type GeoscienceCategory,
} from './geoscience-taxonomy.js';
import type { GeoscienceAnalysisResult, RockClassification, RockConfidence } from './geological.types.js';

/**
 * Flattens the taxonomy into the string enums the structured-output schema needs.
 *
 * The subcategory enum is the union of every subcategory id. A subcategory is
 * additionally checked against its chosen category during validation, so the
 * model cannot pair `fossil` with `bedding` and have it stored.
 */
const ALL_SUBCATEGORY_IDS: string[] = Object.values(GEOSCIENCE_SUBCATEGORIES).flatMap(
  (entries) => entries.map((entry) => entry.id),
);

const CATEGORY_DESCRIPTIONS: Record<GeoscienceCategory, string> = {
  rock: 'A consolidated rock specimen, hand sample or rock exposure.',
  mineral: 'A mineral specimen, crystal, aggregate or possible mineral occurrence.',
  fossil: 'A fossil, fossil imprint, trace fossil, shell fragment or paleontological feature.',
  geological_structure:
    'A structure within rock: bedding, foliation, joints, faults, folds, unconformities, contacts, veins, dykes or sills.',
  geological_layer:
    'An exposed geological layer, stratigraphic sequence, soil/regolith profile, weathering profile or geological contact.',
  geomorphology:
    'A landform or geomorphic feature: hill, valley, escarpment, erosion feature, landslide, cave, gorge, cliff, terrace or deposit.',
  volcanic_feature: 'Lava, volcanic rock, ash or tephra, a cone, crater, lava flow, volcanic deposit or geothermal feature.',
  hydrogeological_feature:
    'A water-related geological feature: spring, seep, waterfall, river or lake feature, or a groundwater-related feature. Never claim water chemistry.',
  mining_observation:
    'A mining or economic-geology observation: occurrence, visible mineralization, alteration, vein, workings, quarry, waste rock, tailings or exploration indication.',
  engineering_geology:
    'An engineering-geology feature: rock cut, road cut, excavation, slope, unstable material, foundation exposure, tunnel geology or quarry face. Never certify safety.',
  other_geoscience: 'A genuine geoscience observation that does not fit the categories above.',
  unknown: 'The subject may be geoscience-related but the category cannot be determined from this image.',
  insufficient_image: 'The image cannot be read well enough to make any geoscience assessment.',
  non_geoscience: 'The subject is not a geoscience observation.',
};

/**
 * Structured-output contract for the category-first geoscience analysis.
 *
 * The existing rock fields are kept so Stage 2 consumers and historical Rock
 * Passport rows keep working; the category fields are added, not substituted.
 */
export const geologicalResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    // -- Category-first ------------------------------------------------------
    is_geoscience_relevant: {
      type: Type.BOOLEAN,
      description:
        'True if the image shows something relevant to geoscience (rock, mineral, fossil, structure, layer, landform, volcanic, water-related, mining or engineering geology). False for people, animals, buildings, plants, food or manufactured objects with no geological content.',
    },
    observation_category: {
      type: Type.STRING,
      enum: GEOSCIENCE_CATEGORIES,
      description:
        'The geoscience observation category, chosen BEFORE any interpretation. ' +
        Object.entries(CATEGORY_DESCRIPTIONS)
          .map(([id, description]) => `${id} = ${description}`)
          .join(' '),
    },
    observation_subcategory: {
      type: Type.STRING,
      enum: ALL_SUBCATEGORY_IDS,
      description:
        'The detail within the chosen category. Must belong to observation_category. Use the category\'s explicit unknown option whenever the detail cannot be determined.',
    },
    observation_type: {
      type: Type.STRING,
      description:
        'Narrow machine-facing type in snake_case summarising the subcategory, e.g. rock_specimen, possible_fossil, sedimentary_bedding, landslide_scar, spring_discharge.',
    },
    primary_interpretation: {
      type: Type.STRING,
      description:
        'One cautious sentence naming what the feature may be. Must be hedged ("possible", "likely", "consistent with") unless the category is an honest exit such as insufficient_image or non_geoscience. Never claim gold, diamond, ore grade, deposit size, commercial value, laboratory confirmation, exact age, exact formation or engineering safety.',
    },
    geological_context: {
      type: Type.STRING,
      description:
        'The geological setting the feature appears consistent with, phrased cautiously. Never invent a specific place, district, formation name or geographic location. If nothing can be said, return an empty string.',
    },
    diagnostic_features: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'The specific visible features that support the interpretation. Only what is actually visible in the image.',
    },
    uncertainties: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'What cannot be determined from this photograph, stated explicitly.',
    },
    questions_for_user: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Specific questions that would advance the interpretation, e.g. "Is there a scale reference?", "Was this taken in a fresh broken surface?", "Does it react to a magnet?"',
    },

    // -- Existing rock-analysis fields, preserved for backward compatibility --
    is_rock: {
      type: Type.BOOLEAN,
      description:
        'True only when the subject is a rock or rock-like material. False for fossils, structures, layers, landforms, water features and everything else that is not a rock.',
    },
    primary_classification: {
      type: Type.STRING,
      enum: ['igneous', 'sedimentary', 'metamorphic', 'unclassified', 'non_rock', 'insufficient_image'],
      description:
        'Broad rock class. Use "unclassified" whenever the subject is not a rock, and "insufficient_image" when the image cannot be read.',
    },
    possible_name: {
      type: Type.STRING,
      description:
        'Possible specific rock or mineral name only when visual evidence supports it, otherwise null. Never a precious metal, ore grade or commercial claim.',
      nullable: true,
    },
    confidence: {
      type: Type.STRING,
      enum: ['high', 'moderate', 'low', 'insufficient'],
      description: 'Qualitative confidence in the interpretation, never in scientific verification.',
    },
    confidence_score: {
      type: Type.NUMBER,
      description: 'Confidence indicator score between 0.0 and 1.0.',
    },
    observed_features: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Visibly observed characteristics such as texture, grain size, minerals, foliation, layering, colour, porosity, clasts, fracture and weathering.',
    },
    reasoning: {
      type: Type.STRING,
      description:
        'Clear educational explanation that explicitly separates what is OBSERVED, what is INFERRED and what remains UNKNOWN.',
    },
    alternative_possibilities: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Other plausible interpretations consistent with the same image.',
    },
    limitations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Scientific limitations of assessing this subject solely from this photograph.',
    },
    recommended_next_steps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Actionable tips for better photographs, context or tests (maximum 3 items).',
    },
    safety_note: {
      type: Type.STRING,
      description: 'Standard caution and disclaimer statement.',
    },
  },
  required: [
    'is_geoscience_relevant',
    'observation_category',
    'observation_subcategory',
    'observation_type',
    'primary_interpretation',
    'geological_context',
    'diagnostic_features',
    'uncertainties',
    'questions_for_user',
    'is_rock',
    'primary_classification',
    'confidence',
    'confidence_score',
    'observed_features',
    'reasoning',
    'alternative_possibilities',
    'limitations',
    'recommended_next_steps',
    'safety_note',
  ],
};

const VALID_CLASSIFICATIONS: Set<RockClassification> = new Set([
  'igneous',
  'sedimentary',
  'metamorphic',
  'unclassified',
  'non_rock',
  'insufficient_image',
]);

const VALID_CONFIDENCES: Set<RockConfidence> = new Set(['high', 'moderate', 'low', 'insufficient']);

/** Max length for any single free-text field accepted from the model. */
const MAX_TEXT_LENGTH = 2000;
const MAX_LIST_ITEMS = 8;

/** Fields screened for prohibited claims, in the order they are reported. */
const SCREENED_FIELDS = [
  'primary_interpretation',
  'reasoning',
  'geological_context',
  'safety_note',
  'possible_name',
] as const;

function cleanText(value: unknown, maxLength = MAX_TEXT_LENGTH): string {
  return trimText(value, maxLength);
}

function cleanList(value: unknown, maxItems = MAX_LIST_ITEMS): string[] {
  return cleanTextList(value, maxItems);
}

/**
 * Drops a claim the scientific-safety policy forbids.
 *
 * A prohibited claim is not sanitised into something weaker; the field is
 * emptied, because a partially rewritten sentence can still read as an assertion.
 * The observation is then reported as needing more evidence rather than being
 * published with an invented conclusion attached.
 */
function screenProhibitedClaim(text: string): { value: string; blocked: boolean } {
  if (findProhibitedClaims(text).length === 0) return { value: text, blocked: false };
  return { value: '', blocked: true };
}

/**
 * Validates and sanitizes raw model output.
 *
 * The response is treated as untrusted input even though the model produced it:
 * the category pair is coerced to a valid combination, list lengths are bounded,
 * free text is length-capped and screened for prohibited claims, and a reasoning
 * claim that cannot be rendered safe fails the whole response rather than
 * silently publishing an overclaim.
 *
 * `modelUsed` is the model that actually served the request. It is a required
 * argument rather than an inferred field so that the recorded provenance is the
 * one the caller observed, and so a caller cannot forget to set it.
 */
export function validateGeologicalResponse(
  raw: unknown,
  modelUsed = 'unknown'
): GeoscienceAnalysisResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid geological response: output is not a JSON object');
  }

  const obj = raw as Record<string, unknown>;

  // -- Category pair -------------------------------------------------------
  // When the model omits the category fields entirely, the payload is a legacy
  // Stage 2 rock response. Inferring `unknown` for those would discard a valid
  // rock analysis that the prompt and every downstream consumer still speak, so
  // the legacy fields are used to recover the category instead.
  const hasCategoryFields =
    obj.observation_category !== undefined || obj.observation_subcategory !== undefined;
  const inferredCategory = hasCategoryFields
    ? undefined
    : inferLegacyCategory(obj.primary_classification, obj.is_rock);

  const pair = normalizeCategoryPair(obj.observation_category ?? inferredCategory, obj.observation_subcategory);
  const observationCategory = pair.observation_category;
  const observationSubcategory = pair.observation_subcategory;

  const observationType =
    cleanText(obj.observation_type, 80).replace(/[^a-z0-9_]/gi, '_').toLowerCase() ||
    observationSubcategory.replace(/[^a-z0-9_]/gi, '_').toLowerCase();

  const isGeoscienceRelevant =
    typeof obj.is_geoscience_relevant === 'boolean'
      ? obj.is_geoscience_relevant
      : observationCategory !== 'non_geoscience';

  // -- Free text -----------------------------------------------------------
  const blockedClaims: string[] = [];
  const screened: Record<(typeof SCREENED_FIELDS)[number], string> = {
    primary_interpretation: '',
    reasoning: '',
    geological_context: '',
    safety_note: '',
    possible_name: '',
  };

  for (const field of SCREENED_FIELDS) {
    const raw = cleanText(obj[field]);
    const result = screenProhibitedClaim(raw);
    if (result.blocked) {
      blockedClaims.push(`${field}:${findProhibitedClaims(raw).join(',')}`);
      continue;
    }
    screened[field] = result.value;
  }

  // Reasoning is load-bearing: it is what explains the interpretation to the
  // contributor. If it had to be dropped for a prohibited claim, the whole
  // response is discarded rather than returned as an unexplained label.
  if (!screened.reasoning) {
    throw new Error(
      blockedClaims.length > 0
        ? 'Invalid geological response: reasoning contained a prohibited scientific or commercial claim and was discarded'
        : 'Invalid geological response: reasoning is required and cannot be empty',
    );
  }

  // -- Category-correct interpretation -------------------------------------
  const defaultInterpretation = defaultInterpretationFor(observationCategory);
  const primaryInterpretation = screened.primary_interpretation || defaultInterpretation;

  const geologicalContext = screened.geological_context;

  // -- Legacy rock fields ---------------------------------------------------
  const rawClassification = String(obj.primary_classification || '').toLowerCase();
  let primaryClassification = VALID_CLASSIFICATIONS.has(rawClassification as RockClassification)
    ? (rawClassification as RockClassification)
    : 'unclassified';

  // The category is authoritative. A fossil is not an igneous rock, and a
  // hydrological feature is not a rock at all, so the legacy field is derived
  // from the category rather than trusted from the model.
  primaryClassification = reconcileLegacyClassification(observationCategory, primaryClassification);

  const rawConfidence = String(obj.confidence || '').toLowerCase();
  const confidence = VALID_CONFIDENCES.has(rawConfidence as RockConfidence)
    ? (rawConfidence as RockConfidence)
    : 'low';

  const confidenceScore =
    typeof obj.confidence_score === 'number' && Number.isFinite(obj.confidence_score)
      ? Math.max(0, Math.min(1, obj.confidence_score))
      : 0.5;

  const isRock =
    observationCategory === 'rock' || observationCategory === 'volcanic_feature'
      ? obj.is_rock === true || primaryClassification !== 'non_rock'
      : false;

  // Rock-only fields are emptied for categories that are not rock-like so the
  // passport shows "not applicable" instead of a plausible-looking value.
  const rockLike = observationCategory === 'rock' || observationCategory === 'volcanic_feature';
  const possibleName = rockLike ? screened.possible_name || null : null;

  const observedFeatures = cleanList(obj.observed_features);
  const diagnosticFeatures = cleanList(obj.diagnostic_features);
  const alternativePossibilities = cleanList(obj.alternative_possibilities);
  const limitations = cleanList(obj.limitations);
  const recommendedNextSteps = cleanList(obj.recommended_next_steps, 3);
  const uncertainties = cleanList(obj.uncertainties);
  const questionsForUser = cleanList(obj.questions_for_user);

  // An exit category must not carry a confident interpretation.
  const isHonestExit =
    observationCategory === 'insufficient_image' ||
    observationCategory === 'non_geoscience' ||
    observationCategory === 'unknown';

  const safetyNote =
    screened.safety_note ||
    (observationCategory === 'non_geoscience'
      ? 'This does not appear to be a geoscience observation. Nothing geological was interpreted.'
      : observationCategory === 'insufficient_image'
        ? 'The photograph does not contain enough visible detail for a preliminary interpretation.'
        : 'Preliminary AI-assisted interpretation only. Not an authorised laboratory or expert determination.');

  const finalConfidence: RockConfidence =
    isHonestExit && confidence !== 'insufficient' && observationCategory === 'insufficient_image'
      ? 'insufficient'
      : confidence;

  return {
    model_used: modelUsed,
    is_geoscience_relevant: isGeoscienceRelevant,
    observation_category: observationCategory,
    observation_subcategory: observationSubcategory,
    observation_type: observationType,
    primary_interpretation: primaryInterpretation,
    geological_context: geologicalContext,
    diagnostic_features: diagnosticFeatures,
    uncertainties: uncertainties,
    questions_for_user: questionsForUser,
    blocked_claims: blockedClaims,

    is_rock: isRock,
    primary_classification: primaryClassification,
    possible_name: possibleName,
    confidence: finalConfidence,
    confidence_score: isHonestExit && observationCategory === 'insufficient_image' ? 0 : confidenceScore,
    observed_features: observedFeatures,
    reasoning: screened.reasoning,
    alternative_possibilities: alternativePossibilities,
    limitations: limitations,
    recommended_next_steps: recommendedNextSteps,
    safety_note: safetyNote,
  };
}

/**
 * The honest fallback interpretation for a category, used when the model
 * returns nothing usable. Never asserts a specific identification.
 */
function defaultInterpretationFor(category: GeoscienceCategory): string {
  const label = GEOSCIENCE_CATEGORY_LABELS[category];
  if (category === 'insufficient_image') {
    return 'The image does not contain enough visible detail for a preliminary interpretation.';
  }
  if (category === 'non_geoscience') {
    return 'Not a geoscience observation.';
  }
  if (category === 'unknown') {
    return 'Possibly geoscience-related, but the category cannot be determined from this image.';
  }
  return `Possible ${label.toLowerCase()} observation. Requires further evidence before it can be described more precisely.`;
}

/**
 * Recovers the category from a legacy rock-only payload.
 *
 * The category-first schema is what the model is asked for now, but a Stage 2
 * shaped response with no category fields is still a rock analysis and is
 * treated as one. Anything that is not recognisably a rock falls through to
 * `unknown`, which is the honest answer rather than a guess at "rock".
 */
function inferLegacyCategory(classification: unknown, isRock: unknown): GeoscienceCategory {
  const value = String(classification ?? '').toLowerCase();

  if (value === 'igneous' || value === 'sedimentary' || value === 'metamorphic') {
    return 'rock';
  }
  // `non_rock` in the legacy vocabulary means "not a rock". The closest
  // category is `non_geoscience`, but a non-rock is not automatically
  // non-geoscience: a fossil is `non_rock` and is very much a geoscience
  // observation. `unknown` is the honest reading because the legacy payload
  // carries nothing that distinguishes the two.
  if (value === 'insufficient_image') {
    return 'insufficient_image';
  }
  if (value === 'non_rock') {
    return 'unknown';
  }
  if (isRock === true) {
    return 'rock';
  }
  return 'unknown';
}

/**
 * Derives the legacy rock classification from the category.
 *
 * The category is the answer to "what kind of observation is this"; the legacy
 * field only answers "is this a rock, and if so which broad class". Deriving it
 * prevents a stored row from claiming a fossil is igneous.
 */
function reconcileLegacyClassification(
  category: GeoscienceCategory,
  modelClassification: RockClassification,
): RockClassification {
  if (category === 'insufficient_image') return 'insufficient_image';
  if (category === 'non_geoscience') return 'non_rock';

  if (category === 'rock') {
    if (modelClassification === 'igneous' || modelClassification === 'sedimentary' || modelClassification === 'metamorphic') {
      return modelClassification;
    }
    return 'unclassified';
  }

  if (category === 'volcanic_feature') {
    // Volcanic rock keeps a rock class; other volcanic features are not a rock.
    return modelClassification === 'igneous' ||
      modelClassification === 'sedimentary' ||
      modelClassification === 'metamorphic'
      ? modelClassification
      : 'non_rock';
  }

  return 'non_rock';
}
