/**
 * Stage 11 — Geoscience Intelligence reasoning pipeline.
 *
 * This is the deterministic core of the intelligence layer. It takes the base
 * AI analysis, any structured extras the model produced, the contributor's
 * description, and the context gathered from the platform, and assembles the
 * final presentation. It contains NO model calls so it can be tested precisely.
 *
 * The rules here are the ones that keep evidence honest:
 *
 *  - A contributor's description is USER-REPORTED, never folded into AI-observed
 *    features.
 *  - Hypotheses are candidate interpretations with evidence for and against;
 *    they are never presented as conclusions.
 *  - Geological context is only ever "unavailable" unless a real dataset was
 *    available and used.
 *  - AI confidence is labelled as an uncalibrated internal indicator.
 */

import { AI_CONFIDENCE_STATEMENT, GEOLOGICAL_CONTEXT_UNAVAILABLE } from './geoscience-intelligence.types.js';
import type {
  EvidenceSource,
  GeoscienceIntelligenceResult,
  HypothesisOption,
  IntelligenceEvidenceItem,
  NearbyObservationRef,
  ObservationIntelligenceContext,
  RawIntelligenceExtras,
} from './geoscience-intelligence.types.js';
import type { GeoscienceAnalysisResult } from './geological.types.js';
import { GEOSCIENCE_CATEGORY_LABELS, type GeoscienceCategory } from './geoscience-taxonomy.js';

const HONEST_EXITS: GeoscienceCategory[] = ['insufficient_image', 'non_geoscience', 'unknown'];

/** Splits a contributor's free-text description into individual reported claims. */
export function extractUserReported(userDescription?: string | null): string[] {
  if (!userDescription) return [];
  const cleaned = userDescription.trim();
  if (cleaned.length === 0) return [];
  return cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 400)
    .slice(0, 8);
}

/**
 * Builds the hypothesis list.
 *
 * The primary hypothesis comes first. When the model supplied structured
 * hypotheses, they are used; otherwise one is derived from the base analysis.
 * Every hypothesis may carry both supporting and conflicting evidence, which is
 * the point: a candidate interpretation that has no listed weakness is not
 * being presented honestly.
 */
/**
 * Adds a nearby public observation as supporting context only when its recorded
 * possible name shares a meaningful word with the hypothesis. This is a weak,
 * "consistent with" signal and is never a confirmation; noise does not become
 * evidence. Always labelled `nearby_observation` so the UI can distinguish it.
 */
function nearbyConsistentEvidence(label: string, nearby: NearbyObservationRef[]): IntelligenceEvidenceItem[] {
  const labelWords = new Set(
    label
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 3 && !HYPOTHESIS_STOPWORDS.has(w))
  );
  if (labelWords.size === 0) return [];

  return nearby
    .map((n) => {
      const name = n.possible_name ?? '';
      const nameWords = new Set(
        name
          .toLowerCase()
          .split(/[^a-z]+/)
          .filter((w) => w.length >= 3 && !HYPOTHESIS_STOPWORDS.has(w))
      );
      return { n, sharesMeaningfulWord: [...labelWords].some((w) => nameWords.has(w)) };
    })
    .filter((r) => r.sharesMeaningfulWord)
    .slice(0, 1)
    .map((r) => ({
      claim: `A nearby public observation (${r.n.passport_id}) was recorded as possible "${r.n.possible_name}". This is context only and does not confirm the interpretation.`,
      source: 'nearby_observation' as EvidenceSource,
    }));
}

/** Words too generic to connect a hypothesis to a nearby possible name. */
const HYPOTHESIS_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'possib',
  'possible',
  'bandit',
  'this',
  'that',
  'from',
  'have',
  'which',
  'rock',
  'specimen',
]);

export function buildHypotheses(
  result: GeoscienceAnalysisResult,
  extras: RawIntelligenceExtras,
  nearby: NearbyObservationRef[],
): { primary: string; alternatives: HypothesisOption[]; primaryEvidence: IntelligenceEvidenceItem[] } {
  const isExit = HONEST_EXITS.includes(result.observation_category as GeoscienceCategory);

  const modelHypotheses = extras.hypotheses.map((h) => ({
    label: h.label,
    evidenceFor: [
      ...h.evidence_for.map((c) => ({ claim: c, source: 'ai_inferred' as EvidenceSource })),
      ...nearbyConsistentEvidence(h.label, nearby),
    ],
    evidenceAgainst: h.evidence_against.map((c) => ({ claim: c, source: 'ai_inferred' as EvidenceSource })),
  }));

  if (modelHypotheses.length > 0) {
    const primary = modelHypotheses[0];
    // The primary hypothesis is not just a label. Its supporting evidence, which
    // may carry the nearby-context signal appended above, must reach the result,
    // so it is returned explicitly instead of being dropped on the floor.
    return {
      primary: primary.label,
      alternatives: modelHypotheses.slice(1),
      primaryEvidence: primary.evidenceFor,
    };
  }

  if (isExit) {
    return { primary: result.primary_interpretation, alternatives: [], primaryEvidence: [] };
  }

  const primaryLabel =
    (result.possible_name ? `Possible ${result.possible_name}` : result.primary_interpretation) ||
    `Possible ${GEOSCIENCE_CATEGORY_LABELS[result.observation_category as GeoscienceCategory]?.toLowerCase() ?? 'geoscience'} observation`;

  const alternatives: HypothesisOption[] = result.alternative_possibilities.slice(0, 2).map((label) => ({
    label,
    evidenceFor: [],
    evidenceAgainst: [],
  }));

  return { primary: primaryLabel, alternatives, primaryEvidence: [] };
}

/** The AI-observed features, kept separate from anything the user said. */
export function observedFeatures(result: GeoscienceAnalysisResult): string[] {
  const fromDiagnostic = result.diagnostic_features ?? [];
  const fromLegacy = result.observed_features ?? [];
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const item of [...fromDiagnostic, ...fromLegacy]) {
    const clean = typeof item === 'string' ? item.trim() : '';
    if (clean.length > 0 && !seen.has(clean)) {
      seen.add(clean);
      merged.push(clean);
    }
  }
  return merged.slice(0, 8);
}

function categorySpecificQuestions(category: GeoscienceCategory): string[] {
  switch (category) {
    case 'rock':
      return [
        'Can you add a scale reference or a coin next to the specimen?',
        'Is the surface fresh or weathered?',
        'Are any crystals visible to the eye?',
        'Is the specimen magnetic?',
      ];
    case 'mineral':
      return [
        'Does a magnet attract the specimen?',
        'What does it look like on a freshly scratched surface (streak)?',
        'How hard does it feel — can a fingernail scratch it?',
        'Where did you find it — loose, in rock, or in a vein?',
      ];
    case 'fossil':
      return [
        'Can you take a photo of the whole specimen with a scale?',
        'Which rock layer were you looking at, if you know?',
        'Is it a solid specimen or an imprint?',
      ];
    case 'geological_structure':
      return [
        'What direction does the feature appear to run?',
        'Is it visible at a larger outcrop too?',
        'Does the surface show any offset or displacement?',
      ];
    case 'geological_layer':
      return [
        'How thick is the layer approximately?',
        'Does the layering continue along the outcrop?',
        'What is on either side of the layer?',
      ];
    case 'geomorphology':
      return [
        'How large is the feature?',
        'Is water involved in shaping it?',
        'What surrounds the feature?',
      ];
    case 'volcanic_feature':
      return [
        'Is the material loose or solid?',
        'Are there bubbles or cavities in the material?',
        'Was it hot or smelling of sulfur when you saw it?',
      ];
    case 'hydrogeological_feature':
      return [
        'Is the water flowing or standing?',
        'What does the surrounding ground look like?',
        'Has the feature changed recently? Do not drink or test the water.',
      ];
    case 'mining_observation':
      return [
        'Is the exposure natural or made by digging?',
        'What rock surrounds the mineralised-looking material?',
        'Do not enter active workings and do not sample without permission.',
      ];
    case 'engineering_geology':
      return [
        'How tall is the face or slope?',
        'Is the material loose or consolidated?',
        'Do not climb or stand close to an unstable-looking face.',
      ];
    default:
      return resultQuestionsDefault();
  }
}

function resultQuestionsDefault(): string[] {
  return [
    'Can you add a closer photo of the main feature?',
    'Where did you find it and what surrounds it?',
  ];
}

/** Combines the model's questions with category-specific follow-ups. */
export function buildFollowUpQuestions(
  result: GeoscienceAnalysisResult,
  category: GeoscienceCategory,
): string[] {
  const extras = result.questions_for_user ?? [];
  const categoryQuestions = categorySpecificQuestions(category);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const item of [...categoryQuestions, ...extras]) {
    const clean = typeof item === 'string' ? item.trim() : '';
    if (clean.length > 0 && !seen.has(clean)) {
      seen.add(clean);
      merged.push(clean);
    }
  }
  return merged.slice(0, 6);
}

/** Safe field checks a member of the public could do next, per category. */
export function buildFieldChecks(category: GeoscienceCategory): string[] {
  const base = [
    'Photograph the fresh surface with a scale reference.',
    'Photograph the surrounding outcrop or setting.',
  ];
  switch (category) {
    case 'rock':
      return [...base, 'Check whether a magnet is attracted to it.'];
    case 'mineral':
      return [...base, 'Test a streak on an unglazed surface if you have one.'];
    case 'fossil':
      return [...base, 'Note which layer it came from if the site is safe to reach.'];
    case 'geological_structure':
      return [...base, 'Trace the feature along the exposure.'];
    case 'geological_layer':
      return [...base, 'Measure the approximate thickness without damaging anything.'];
    case 'geomorphology':
      return [...base, 'Describe the shape and scale of the feature.'];
    case 'volcanic_feature':
      return [...base, 'Check whether the material is vesicular (bubble-holed).'];
    case 'hydrogeological_feature':
      return [...base, 'Describe flow and surroundings. Do not touch or taste the water.'];
    case 'mining_observation':
      return [...base, 'Photograph the surrounding rock type.'];
    case 'engineering_geology':
      return [...base, 'Estimate the height from a safe distance.'];
    default:
      return base;
  }
}

/** Builds a context summary that states what was actually available. */
export function summarizeContext(
  context: ObservationIntelligenceContext,
  userDescription?: string | null,
): GeoscienceIntelligenceResult['contextUsed'] {
  return {
    userDescription: typeof userDescription === 'string' && userDescription.trim().length > 0,
    nearbyObservations: context.nearbyObservations.available,
    site: context.site?.available ?? false,
    community: context.community.available,
    geologicalContext: context.geologicalContext.available,
    expertReview: context.expertReview?.available ?? false,
  };
}

/** A short honest narrative tying interpretation to evidence. */
export function buildSummary(
  primary: string,
  uncertainties: string[],
  context: ObservationIntelligenceContext,
): string {
  const parts: string[] = [
    `The available evidence is most consistent with ${primary}.`,
  ];
  if (uncertainties.length > 0) {
    parts.push(`The photograph leaves ${uncertainties[0].toLowerCase()}`);
  }
  if (context.nearbyObservations.available && context.nearbyObservations.count > 0) {
    parts.push(
      `${context.nearbyObservations.count} publicly available observation${context.nearbyObservations.count === 1 ? '' : 's'} near this record offer context, but observation density is not geological abundance.`,
    );
  } else {
    parts.push('No nearby public observations were available, so context could not be compared.');
  }
  parts.push(
    context.geologicalContext.available
      ? 'Geological context from configured datasets was consulted.'
      : GEOLOGICAL_CONTEXT_UNAVAILABLE,
  );
  return parts.join(' ');
}

/**
 * Main entry: assembles the full intelligence result.
 * Pure and deterministic — no IO.
 */
export function assembleIntelligence(params: {
  result: GeoscienceAnalysisResult;
  extras: RawIntelligenceExtras;
  context: ObservationIntelligenceContext;
  userDescription?: string | null;
}): GeoscienceIntelligenceResult {
  const { result, extras, context, userDescription } = params;
  const category = result.observation_category as GeoscienceCategory;
  const isExit = HONEST_EXITS.includes(category);

  const userReported = extractUserReported(userDescription);
  const { primary, alternatives, primaryEvidence: hypothesisEvidence } = buildHypotheses(
    result,
    extras,
    context.nearbyObservations.available ? context.nearbyObservations.items : [],
  );

  const uncertainties = (result.uncertainties ?? []).slice(0, 6);
  const missingEvidence = extras.missing_evidence.length > 0
    ? extras.missing_evidence.slice(0, 6)
    : uncertainties.length > 0
      ? uncertainties
      : ['Additional field context and, where appropriate, laboratory analysis would be required to distinguish the hypotheses.'];

  const primaryEvidence: IntelligenceEvidenceItem[] = (() => {
    const observed = observedFeatures(result).slice(0, 3).map((c) => ({ claim: c, source: 'observed' as EvidenceSource }));
    if (observed.length === 0 && hypothesisEvidence.length === 0) {
      return userReported.slice(0, 2).map((c) => ({ claim: c, source: 'user_reported' as EvidenceSource }));
    }
    // Observed features come first; the primary hypothesis's supporting evidence
    // (which may include the nearby-context signal) follows so it is never lost.
    const seen = new Set<string>();
    const merged: IntelligenceEvidenceItem[] = [];
    for (const item of [...observed, ...hypothesisEvidence]) {
      if (seen.has(item.claim)) continue;
      seen.add(item.claim);
      merged.push(item);
    }
    return merged.slice(0, 6);
  })();

  const recommendedObservations = extras.recommended_observations.length > 0
    ? extras.recommended_observations.slice(0, 3)
    : [
        'Look for a fresh or broken surface and photograph it.',
        'Photograph the surrounding outcrop for context.',
        'Note the approximate location only if you are comfortable sharing it.',
      ];

  const geologicalContextNote = context.geologicalContext.available
    ? context.geologicalContext.note
    : GEOLOGICAL_CONTEXT_UNAVAILABLE;

  return {
    base: {
      observationCategory: category,
      observationSubcategory: result.observation_subcategory,
      primaryClassification: result.primary_classification,
      confidence: result.confidence,
      confidenceScore: result.confidence_score,
    },
    contextUsed: summarizeContext(context, userDescription),
    observedFromMedia: isExit ? [] : observedFeatures(result),
    userReported,
    primaryHypothesis: primary,
    primaryEvidence,
    alternativeHypotheses: alternatives,
    uncertainties: isExit ? ['A preliminary interpretation could not be made from this image.'] : uncertainties,
    missingEvidence,
    followUpQuestions: isExit ? [] : buildFollowUpQuestions(result, category),
    recommendedObservations,
    recommendedFieldChecks: extras.recommended_field_checks.length > 0
      ? extras.recommended_field_checks.slice(0, 3)
      : buildFieldChecks(category),
    scientificLimitations:
      result.limitations.length > 0
        ? result.limitations.join(' ')
        : 'Interpretation is based on the supplied photographs only and is a preliminary AI-assisted reading, not a laboratory or expert determination.',
    safetyNote: result.safety_note,
    geologicalContextNote,
    confidenceStatement: AI_CONFIDENCE_STATEMENT,
    summary: buildSummary(primary, uncertainties, context),
  };
}