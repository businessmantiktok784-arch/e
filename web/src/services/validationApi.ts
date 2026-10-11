import type {
  ValidationDataset,
  ValidationSample,
  ValidationAiRun,
  EvaluationMetricResult,
  ValidationErrorRecord,
} from '../types/validation.js';
import { getStoredExpertToken } from './expertApi.js';

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';

function getAuthHeaders(): HeadersInit {
  const token = getStoredExpertToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchValidationDatasets(): Promise<ValidationDataset[]> {
  const res = await fetch(`${API_BASE_URL}/api/research/validation/datasets`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to load validation datasets: ${res.statusText}`);
  const data = await res.json();
  return data.datasets || [];
}

export async function fetchValidationDatasetDetail(id: string): Promise<{
  dataset: ValidationDataset;
  samples: ValidationSample[];
  sample_count: number;
}> {
  const res = await fetch(`${API_BASE_URL}/api/research/validation/datasets/${encodeURIComponent(id)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to load dataset: ${res.statusText}`);
  return res.json();
}

export async function createValidationDataset(payload: {
  dataset_code: string;
  name: string;
  description: string;
  version?: string;
  target_classification_level?: 'broad_class' | 'lithology';
}): Promise<ValidationDataset> {
  const res = await fetch(`${API_BASE_URL}/api/research/validation/datasets`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to create dataset');
  }
  return res.json();
}

export async function lockValidationDataset(id: string): Promise<ValidationDataset> {
  const res = await fetch(`${API_BASE_URL}/api/research/validation/datasets/${encodeURIComponent(id)}/lock`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to lock dataset: ${res.statusText}`);
  const data = await res.json();
  return data.dataset;
}

export async function triggerValidationRun(payload: {
  dataset_id: string;
  model_name?: string;
  prompt_version?: string;
  max_samples?: number;
}): Promise<ValidationAiRun> {
  const res = await fetch(`${API_BASE_URL}/api/research/validation/runs`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to trigger evaluation run');
  }
  return res.json();
}

export async function fetchRunEvaluation(runId: string): Promise<EvaluationMetricResult> {
  const res = await fetch(`${API_BASE_URL}/api/research/validation/evaluations/${encodeURIComponent(runId)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch evaluation: ${res.statusText}`);
  return res.json();
}

export async function fetchRunErrors(runId: string): Promise<ValidationErrorRecord[]> {
  const res = await fetch(`${API_BASE_URL}/api/research/validation/errors/${encodeURIComponent(runId)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch error analysis: ${res.statusText}`);
  const data = await res.json();
  return data.errors || [];
}

export async function downloadValidationExportCsv(runId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/api/research/validation/export/${encodeURIComponent(runId)}?format=csv`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to download export CSV: ${res.statusText}`);
  return res.blob();
}
