import type {
  ValidationDataset,
  ValidationSample,
  ValidationAiRun,
  EvaluationMetricResult,
  ValidationErrorRecord,
} from '../types/validation.js';
import { getStoredExpertToken } from './expertApi.js';
import { bearerHeaders, requestBlob, requestJson } from './http.js';

function getAuthHeaders(): Record<string, string> {
  return bearerHeaders(getStoredExpertToken());
}

function statusFallback(label: string): (res: Response) => string {
  return (res) => `${label}: ${res.statusText}`;
}

export async function fetchValidationDatasets(): Promise<ValidationDataset[]> {
  const data = await requestJson<{ datasets?: ValidationDataset[] }>(
    '/api/research/validation/datasets',
    { headers: getAuthHeaders(), errorMessage: statusFallback('Failed to load validation datasets') }
  );
  return data.datasets || [];
}

export async function fetchValidationDatasetDetail(id: string): Promise<{
  dataset: ValidationDataset;
  samples: ValidationSample[];
  sample_count: number;
}> {
  return requestJson(
    `/api/research/validation/datasets/${encodeURIComponent(id)}`,
    { headers: getAuthHeaders(), errorMessage: statusFallback('Failed to load dataset') }
  );
}

export async function createValidationDataset(payload: {
  dataset_code: string;
  name: string;
  description: string;
  version?: string;
  target_classification_level?: 'broad_class' | 'lithology';
}): Promise<ValidationDataset> {
  return requestJson('/api/research/validation/datasets', {
    method: 'POST',
    headers: getAuthHeaders(),
    json: payload,
    errorMessage: 'Failed to create dataset',
  });
}

export async function lockValidationDataset(id: string): Promise<ValidationDataset> {
  const data = await requestJson<{ dataset: ValidationDataset }>(
    `/api/research/validation/datasets/${encodeURIComponent(id)}/lock`,
    { method: 'POST', headers: getAuthHeaders(), errorMessage: statusFallback('Failed to lock dataset') }
  );
  return data.dataset;
}

export async function triggerValidationRun(payload: {
  dataset_id: string;
  model_name?: string;
  prompt_version?: string;
  max_samples?: number;
}): Promise<ValidationAiRun> {
  return requestJson('/api/research/validation/runs', {
    method: 'POST',
    headers: getAuthHeaders(),
    json: payload,
    errorMessage: 'Failed to trigger evaluation run',
  });
}

export async function fetchRunEvaluation(runId: string): Promise<EvaluationMetricResult> {
  return requestJson(
    `/api/research/validation/evaluations/${encodeURIComponent(runId)}`,
    { headers: getAuthHeaders(), errorMessage: statusFallback('Failed to fetch evaluation') }
  );
}

export async function fetchRunErrors(runId: string): Promise<ValidationErrorRecord[]> {
  const data = await requestJson<{ errors?: ValidationErrorRecord[] }>(
    `/api/research/validation/errors/${encodeURIComponent(runId)}`,
    { headers: getAuthHeaders(), errorMessage: statusFallback('Failed to fetch error analysis') }
  );
  return data.errors || [];
}

export async function downloadValidationExportCsv(runId: string): Promise<Blob> {
  return requestBlob(`/api/research/validation/export/${encodeURIComponent(runId)}?format=csv`, {
    headers: getAuthHeaders(),
    errorMessage: statusFallback('Failed to download export CSV'),
  });
}
