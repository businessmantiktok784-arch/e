/**
 * Stage 11 — Geoscience Intelligence structured output.
 *
 * The intelligence schema is built on top of the existing category-first schema
 * and adds a small set of extra fields (hypotheses with evidence for/against,
 * missing evidence, recommended observations and field checks). The base fields
 * stay authoritative; the extras are optional and are sanitised through the same
 * scientific-safety screen before they are allowed into a passport.
 *
 * The result of validating a response is the standard `GeoscienceAnalysisResult`
 * together with `RawIntelligenceExtras`. Downstream code decides how to present
 * the extras; nothing here treats a hypothesis as a conclusion.
 */

import { Type, type Schema } from '@google/genai';
import { geologicalResponseSchema, validateGeologicalResponse } from './geological.schema.js';
import { findProhibitedClaims } from './geoscience-taxonomy.js';
import type { GeoscienceAnalysisResult } from './geological.types.js';
import type { RawIntelligenceExtras } from './geoscience-intelligence.types.js';

/** Optional Stage 11 fields appended on top of the base schema. */
export const intelligenceExtrasSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    hypotheses: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          evidence_for: { type: Type.ARRAY, items: { type: Type.STRING } },
          evidence_against: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['label', 'evidence_for', 'evidence_against'],
      },
      description:
        'Up to 3 candidate interpretations. The first is the primary hypothesis. Each lists the visible evidence that supports it and the visible evidence that weakens it. Hypotheses are interpretations, never confirmed facts, and never gold, diamond, ore grade, commercial value, exact age or laboratory confirmation.',
    },
    missing_evidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Specific evidence that would be needed to choose between the hypotheses (fresh surface, close-up, field context, appropriate laboratory analysis).',
    },
    recommended_observations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Up to 3 nearby-field observations worth making to advance the interpretation, stated as suggestions, not duties.',
    },
    recommended_field_checks: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Up to 3 safe field checks a member of the public could do next (magnet test, streak test, freshness of surface, surrounding outcrop), never laboratory-only claims.',
    },
    user_observed: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'The specific statements the CONTRIBUTOR reported in their description, repeated verbatim. Never add your own observations here. If the contributor gave no description, return an empty list.',
    },
  },
  required: ['hypotheses', 'missing_evidence', 'recommended_observations', 'recommended_field_checks', 'user_observed'],
};

/** Combined schema sent to the model. */
export const intelligenceResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    ...(geologicalResponseSchema.properties ?? {}),
    intelligence: intelligenceExtrasSchema,
  },
  required: [...(geologicalResponseSchema.required ?? []), 'intelligence'],
};

const MAX_EXTRAS_ITEMS = 8;

function cleanText(value: unknown, maxLength = 500): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function cleanList(value: unknown, maxItems = MAX_EXTRAS_ITEMS): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, 400))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function cleanHypotheses(value: unknown): RawIntelligenceExtras['hypotheses'] {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const obj = raw as Record<string, unknown>;
      const label = cleanText(obj.label, 200);
      if (!label) return null;
      // A hypothesis label is free text like evidence lists are, and it must
      // pass the same safety screen: "This is gold" is a prohibited assertion
      // even when it is framed as a "hypothesis".
      if (findProhibitedClaims(label).length > 0) return null;
      const evidenceFor = cleanList(obj.evidence_for).filter((c) => findProhibitedClaims(c).length === 0);
      const evidenceAgainst = cleanList(obj.evidence_against).filter((c) => findProhibitedClaims(c).length === 0);
      return { label, evidence_for: evidenceFor, evidence_against: evidenceAgainst };
    })
    .filter((h): h is RawIntelligenceExtras['hypotheses'][number] => h !== null)
    .slice(0, 3);
  return cleaned;
}

/**
 * Sanitises the optional Stage 11 extras.
 *
 * The base fields must still be validated through `validateGeologicalResponse`;
 * this only cleans the additional intelligence payload. Every list is bounded, a
 * hypothesis that survives screening is still a hypothesis and not a conclusion,
 * and a prohibited claim anywhere in the extras is dropped rather than diluted.
 */
export function validateIntelligenceExtras(raw: unknown): RawIntelligenceExtras {
  if (!raw || typeof raw !== 'object') {
    return emptyExtras();
  }
  const obj = raw as Record<string, unknown>;
  const intelligence = obj.intelligence && typeof obj.intelligence === 'object'
    ? (obj.intelligence as Record<string, unknown>)
    : obj; // tolerate a flattened payload

  return {
    hypotheses: cleanHypotheses(intelligence.hypotheses),
    missing_evidence: cleanList(intelligence.missing_evidence),
    recommended_observations: cleanList(intelligence.recommended_observations, 3),
    recommended_field_checks: cleanList(intelligence.recommended_field_checks, 3),
    user_observed: cleanList(intelligence.user_observed),
  };
}

export function emptyExtras(): RawIntelligenceExtras {
  return {
    hypotheses: [],
    missing_evidence: [],
    recommended_observations: [],
    recommended_field_checks: [],
    user_observed: [],
  };
}

/**
 * Validates a full Stage 11 response: the base analysis through the standard
 * validator (which is authoritative and screens prohibited claims), plus the
 * optional intelligence extras. The base fields are not re-screened here; the
 * extras are sanitised separately because they carry no scientific authority.
 *
 * Returns the validated base result and the sanitised extras so the caller can
 * assemble the intelligence presentation.
 */
export function validateIntelligenceResponse(
  raw: unknown,
  modelUsed = 'unknown'
): { result: GeoscienceAnalysisResult; extras: RawIntelligenceExtras } {
  const result = validateGeologicalResponse(raw, modelUsed);
  const extras = validateIntelligenceExtras(raw);
  return { result, extras };
}