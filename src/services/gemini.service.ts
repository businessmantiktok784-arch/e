import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { GEOLOGICAL_SYSTEM_INSTRUCTION, buildGeologicalUserPrompt } from '../ai/geological.prompt.js';
import { geologicalResponseSchema, validateGeologicalResponse } from '../ai/geological.schema.js';
import { GeologicalAnalysisError, type GeoscienceAnalysisResult } from '../ai/geological.types.js';
import {
  GEOSCIENCE_INTELLIGENCE_SYSTEM_INSTRUCTION,
  buildIntelligenceUserPrompt,
} from '../ai/geoscience-intelligence.prompt.js';
import { intelligenceResponseSchema, validateIntelligenceResponse } from '../ai/geoscience-intelligence.schema.js';
import type { MediaPart, ObservationIntelligenceContext, RawIntelligenceExtras } from '../ai/geoscience-intelligence.types.js';

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  /**
   * Sends a photograph (or a video frame) to Gemini for a preliminary,
   * category-first geoscience assessment.
   *
   * The response is validated and screened after it arrives. A model response
   * that asserts something the scientific-safety policy forbids is discarded
   * rather than softened, because a partially rewritten sentence still reads as
   * an assertion.
   *
   * @param mediaBuffer Raw image or video bytes.
   * @param mimeType Validated MIME type (e.g. image/jpeg, image/png, video/mp4).
   * @param userCaption Optional unverified context from the sender's caption.
   */
  async analyzeGeoscienceMedia(
    mediaBuffer: Buffer,
    mimeType: string,
    userCaption?: string | null,
    mediaType: 'image' | 'video' = 'image'
  ): Promise<GeoscienceAnalysisResult> {
    const modelsToTry = [
      env.GEMINI_MODEL,
      env.GEMINI_MODEL !== 'gemini-2.5-flash' ? 'gemini-2.5-flash' : null,
      'gemini-2.5-flash-lite',
    ].filter((m): m is string => Boolean(m) && m !== '');

    const uniqueModels = Array.from(new Set(modelsToTry));
    let lastError: unknown = null;

    for (const model of uniqueModels) {
      try {
        const startTime = Date.now();
        logger.info(`Gemini geoscience analysis started with model ${model}`, {
          mimeType,
          mediaType,
          mediaBytes: mediaBuffer.length,
        });

        const result = await this.executeAnalysisWithTimeout(
          mediaBuffer,
          mimeType,
          userCaption,
          model,
          mediaType
        );
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(`Gemini geoscience analysis completed in ${duration}s using ${model}`, {
          category: result.observation_category,
          subcategory: result.observation_subcategory,
          classification: result.primary_classification,
          confidence: result.confidence,
        });

        // A blocked claim is a warning, not a failure: the observation is still
        // real and the rest of the assessment is still usable.
        if (result.blocked_claims.length > 0) {
          logger.warn('Gemini response contained a prohibited claim; the field was dropped', {
            model,
            blocked: result.blocked_claims,
          });
        }

        return result;
      } catch (err: unknown) {
        lastError = err;
        const isAuthError = err instanceof Error && /api key|unauthorized|forbidden|401|403/i.test(err.message);
        const isQuotaError =
          err instanceof Error &&
          /quota|rate limit|429|resource_exhausted|exceeded your current quota/i.test(err.message);

        if (isAuthError) {
          logger.error('Gemini authentication failed. Please verify GEMINI_API_KEY.');
          throw new GeologicalAnalysisError('GEMINI_AUTH_ERROR', 'Gemini authentication failure', err);
        }

        if (isQuotaError) {
          logger.warn(`Model ${model} quota exhausted. Trying fallback model if available...`, {
            error: err instanceof Error ? err.message : 'Quota exceeded',
          });
          continue;
        }

        logger.warn(`Gemini geoscience analysis with ${model} failed, trying fallback...`, {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    if (lastError instanceof GeologicalAnalysisError) {
      throw lastError;
    }
    const finalMsg = lastError instanceof Error ? lastError.message : 'Gemini analysis failed';
    throw new GeologicalAnalysisError('GEMINI_API_ERROR', finalMsg, lastError);
  }

  /**
   * Backward-compatible alias.
   *
   * Existing callers and Stage 2 tests use `analyzeRockImage`. The pipeline is
   * no longer rock-only, so the canonical name is `analyzeGeoscienceMedia`;
   * this alias keeps the historical entry point working.
   */
  async analyzeRockImage(
    imageBuffer: Buffer,
    mimeType: string,
    userCaption?: string
  ): Promise<GeoscienceAnalysisResult> {
    return this.analyzeGeoscienceMedia(imageBuffer, mimeType, userCaption, 'image');
  }

  /**
   * Stage 11 — context-aware analysis of one or more media items.
   *
   * Sends every media part (overview, close-up, texture, fresh surface, outcrop,
   * environmental, video frame) plus any contributor description plus the
   * platform context (nearby public observations, site, community activity,
   * geological-context status) to the model in a single structured call, and
   * returns the validated base analysis together with the sanitised intelligence
   * extras.
   *
   * The same model fallback chain and timeout that protect the base pipeline
   * protect this call. When the model is unreachable the caller is expected to
   * fall back to the standard single-media analysis rather than to invent data.
   */
  async analyzeGeoscienceIntelligence(params: {
    media: MediaPart[];
    userDescription?: string | null;
    context: ObservationIntelligenceContext;
  }): Promise<{ result: GeoscienceAnalysisResult; extras: RawIntelligenceExtras }> {
    const media = params.media.slice(0, 6);
    if (media.length === 0) {
      throw new GeologicalAnalysisError('GEMINI_API_ERROR', 'No media was provided for analysis');
    }

    const modelsToTry = [
      env.GEMINI_MODEL,
      env.GEMINI_MODEL !== 'gemini-2.5-flash' ? 'gemini-2.5-flash' : null,
      'gemini-2.5-flash-lite',
    ].filter((m): m is string => Boolean(m) && m !== '');

    const uniqueModels = Array.from(new Set(modelsToTry));
    let lastError: unknown = null;

    for (const model of uniqueModels) {
      try {
        const startTime = Date.now();
        logger.info('Gemini context-aware intelligence analysis started', {
          model,
          mediaCount: media.length,
          mediaBytes: media.reduce((sum, m) => sum + m.buffer.length, 0),
        });

        const { result, extras } = await this.executeIntelligenceWithTimeout(
          media,
          params.userDescription,
          params.context,
          model
        );
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(`Gemini context-aware intelligence analysis completed in ${duration}s using ${model}`, {
          category: result.observation_category,
          subcategory: result.observation_subcategory,
          classification: result.primary_classification,
          confidence: result.confidence,
          hypotheses: extras.hypotheses.length,
        });

        if (result.blocked_claims.length > 0) {
          logger.warn('Gemini intelligence response contained a prohibited claim; the field was dropped', {
            model,
            blocked: result.blocked_claims,
          });
        }

        return { result, extras };
      } catch (err: unknown) {
        lastError = err;
        const isAuthError =
          err instanceof Error && /api key|unauthorized|forbidden|401|403/i.test(err.message);
        const isQuotaError =
          err instanceof Error &&
          /quota|rate limit|429|resource_exhausted|exceeded your current quota/i.test(err.message);

        if (isAuthError) {
          logger.error('Gemini authentication failed. Please verify GEMINI_API_KEY.');
          throw new GeologicalAnalysisError('GEMINI_AUTH_ERROR', 'Gemini authentication failure', err);
        }

        if (isQuotaError) {
          logger.warn(`Model ${model} quota exhausted. Trying fallback model if available...`, {
            error: err instanceof Error ? err.message : 'Quota exceeded',
          });
          continue;
        }

        logger.warn(`Gemini context-aware analysis with ${model} failed, trying fallback...`, {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    if (lastError instanceof GeologicalAnalysisError) {
      throw lastError;
    }
    const finalMsg = lastError instanceof Error ? lastError.message : 'Gemini context-aware analysis failed';
    throw new GeologicalAnalysisError('GEMINI_API_ERROR', finalMsg, lastError);
  }

  /**
   * Runs the context-aware analysis with the same timeout policy as the base
   * pipeline.
   */
  private async executeIntelligenceWithTimeout(
    media: MediaPart[],
    userDescription: string | null | undefined,
    context: ObservationIntelligenceContext,
    modelName: string
  ): Promise<{ result: GeoscienceAnalysisResult; extras: RawIntelligenceExtras }> {
    const parts: object[] = [];
    for (const part of media) {
      parts.push({
        inlineData: {
          mimeType: part.mimeType,
          data: part.buffer.toString('base64'),
        },
      });
    }
    parts.push({
      text: buildIntelligenceUserPrompt({ media, userDescription, context }),
    });

    const callPromise = this.ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        systemInstruction: GEOSCIENCE_INTELLIGENCE_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: intelligenceResponseSchema,
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(
          new GeologicalAnalysisError(
            'GEMINI_TIMEOUT',
            `Gemini request timed out after ${env.GEMINI_TIMEOUT_MS}ms`
          )
        );
      }, env.GEMINI_TIMEOUT_MS);
      timer.unref?.();
    });

    const response = await Promise.race([callPromise, timeoutPromise]);
    const jsonText = response.text;

    if (!jsonText || jsonText.trim().length === 0) {
      throw new GeologicalAnalysisError('GEMINI_INVALID_RESPONSE', 'Gemini returned empty text response');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText.trim());
    } catch (parseErr) {
      throw new GeologicalAnalysisError('GEMINI_INVALID_RESPONSE', 'Failed to parse Gemini output as JSON', parseErr);
    }

    try {
      return validateIntelligenceResponse(parsed, modelName);
    } catch (validationErr) {
      throw new GeologicalAnalysisError(
        'GEMINI_INVALID_RESPONSE',
        validationErr instanceof Error ? validationErr.message : 'Invalid schema',
        validationErr
      );
    }
  }

  /**
   * Internal helper executing generateContent wrapped in the configured timeout.
   */
  private async executeAnalysisWithTimeout(
    mediaBuffer: Buffer,
    mimeType: string,
    userCaption: string | null | undefined,
    modelName: string = env.GEMINI_MODEL,
    mediaType: 'image' | 'video' = 'image'
  ): Promise<GeoscienceAnalysisResult> {
    const base64Data = mediaBuffer.toString('base64');
    const userPrompt = buildGeologicalUserPrompt({ userCaption, mediaType });

    const callPromise = this.ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          {
            text: userPrompt,
          },
        ],
      },
      config: {
        systemInstruction: GEOLOGICAL_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: geologicalResponseSchema,
      },
    });

    // Enforce timeout using Promise.race
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(
          new GeologicalAnalysisError(
            'GEMINI_TIMEOUT',
            `Gemini request timed out after ${env.GEMINI_TIMEOUT_MS}ms`
          )
        );
      }, env.GEMINI_TIMEOUT_MS);
      // Clean up timer if process unrefs
      timer.unref?.();
    });

    const response = await Promise.race([callPromise, timeoutPromise]);
    const jsonText = response.text;

    if (!jsonText || jsonText.trim().length === 0) {
      throw new GeologicalAnalysisError('GEMINI_INVALID_RESPONSE', 'Gemini returned empty text response');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText.trim());
    } catch (parseErr) {
      throw new GeologicalAnalysisError('GEMINI_INVALID_RESPONSE', 'Failed to parse Gemini output as JSON', parseErr);
    }

    try {
      // `modelName` is threaded down from the caller, which knows which model
      // in the fallback chain actually produced this response.
      return validateGeologicalResponse(parsed, modelName);
    } catch (validationErr) {
      throw new GeologicalAnalysisError(
        'GEMINI_INVALID_RESPONSE',
        validationErr instanceof Error ? validationErr.message : 'Invalid schema',
        validationErr
      );
    }
  }
}

export const geminiService = new GeminiService();
