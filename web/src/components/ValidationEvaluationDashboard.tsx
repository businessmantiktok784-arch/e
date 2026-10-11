import React, { useState, useEffect } from 'react';
import {
  FlaskConical,
  Lock,
  Play,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Info,
  RefreshCw,
  PlusCircle,
  HelpCircle,
  Scale,
  AlertTriangle,
} from 'lucide-react';
import {
  fetchValidationDatasets,
  fetchValidationDatasetDetail,
  lockValidationDataset,
  triggerValidationRun,
  fetchRunEvaluation,
  fetchRunErrors,
  downloadValidationExportCsv,
} from '../services/validationApi.js';
import type {
  ValidationDataset,
  ValidationSample,
  ValidationAiRun,
  EvaluationMetricResult,
  ValidationErrorRecord,
} from '../types/validation.js';

export const ValidationEvaluationDashboard: React.FC = () => {
  const [datasets, setDatasets] = useState<ValidationDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [datasetDetail, setDatasetDetail] = useState<{
    dataset: ValidationDataset;
    samples: ValidationSample[];
  } | null>(null);
  const [activeRun, setActiveRun] = useState<ValidationAiRun | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationMetricResult | null>(null);
  const [errors, setErrors] = useState<ValidationErrorRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [executingRun, setExecutingRun] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDatasets = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const list = await fetchValidationDatasets();
      setDatasets(list);
      if (list.length > 0 && !selectedDatasetId) {
        setSelectedDatasetId(list[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load validation datasets';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDatasets();
  }, []);

  useEffect(() => {
    if (!selectedDatasetId) {
      setDatasetDetail(null);
      return;
    }

    const loadDetail = async () => {
      try {
        const detail = await fetchValidationDatasetDetail(selectedDatasetId);
        setDatasetDetail(detail);
      } catch (err: unknown) {
        console.error('Failed to load dataset detail', err);
      }
    };
    loadDetail();
  }, [selectedDatasetId]);

  const handleTriggerRun = async () => {
    if (!selectedDatasetId) return;
    setExecutingRun(true);
    setErrorMessage(null);
    try {
      const run = await triggerValidationRun({ dataset_id: selectedDatasetId });
      setActiveRun(run);
      // Immediately evaluate run
      const evalMetrics = await fetchRunEvaluation(run.id);
      const errList = await fetchRunErrors(run.id);
      setEvaluation(evalMetrics);
      setErrors(errList);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Evaluation run failed';
      setErrorMessage(msg);
    } finally {
      setExecutingRun(false);
    }
  };

  const handleLockDataset = async () => {
    if (!selectedDatasetId) return;
    try {
      const updated = await lockValidationDataset(selectedDatasetId);
      setDatasetDetail((prev) => (prev ? { ...prev, dataset: updated } : null));
      setDatasets((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to lock dataset';
      alert(`Lock failed: ${msg}`);
    }
  };

  const handleExportCsv = async () => {
    if (!activeRun) return;
    try {
      const blob = await downloadValidationExportCsv(activeRun.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `validation-evaluation-${activeRun.run_code}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      alert(msg);
    }
  };

  if (loading && datasets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-stone-500">
        <RefreshCw className="w-8 h-8 animate-spin text-amber-600 mb-3" />
        <p className="text-sm font-medium">Checking validation registry...</p>
      </div>
    );
  }

  // Section 36: Explicit Empty State when no real validation dataset is registered
  if (datasets.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-8 text-center max-w-2xl mx-auto shadow-xs">
        <div className="w-12 h-12 bg-[#fef7e0] text-amber-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <FlaskConical className="w-6 h-6" />
        </div>
        <h3 className="text-base font-medium text-stone-900 mb-2">
          No validated geoscience dataset is available yet.
        </h3>
        <p className="text-xs text-stone-500 leading-relaxed mb-6">
          The validation infrastructure is built and operational, but it has not been run against real
          specimens. Until a curated, expert-reviewed reference set is registered and scored, no accuracy,
          precision, recall or F1 figure can be reported. Where a figure is unavailable it reads
          &quot;not measured&quot; &mdash; never zero.
        </p>
        <div className="p-4 bg-stone-50 rounded-xl text-left border border-stone-200 text-xs text-stone-600 space-y-2">
          <div className="font-semibold text-stone-800 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-amber-600" />
            <span>Scientific Evaluation Workflow Requirements:</span>
          </div>
          <ol className="list-decimal pl-5 space-y-1 text-stone-500">
            <li>Register curated geoscience specimens with known geological provenance.</li>
            <li>Capture standardized photographs with uniform lighting and scale markers.</li>
            <li>Acquire independent reference determinations from multiple reviewers.</li>
            <li>Resolve consensus and lock the dataset to guarantee reproducible AI evaluation.</li>
            <li>
              Currently the evaluator scores the three rock classes (igneous, sedimentary, metamorphic).
              Extending it to the rest of the Earth Talk taxonomy is outstanding work.
            </li>
          </ol>
        </div>
      </div>
    );
  }

  const dataset = datasetDetail?.dataset;
  const samples = datasetDetail?.samples || [];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-stone-900 text-white rounded-xl p-6 shadow-sm border border-stone-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-[#fef7e0] text-[#9f6108] border border-amber-500/30">
                Field Validation
              </span>
              <span className="text-xs text-stone-400">Controlled Reference Benchmark</span>
            </div>
            <h2 className="text-xl font-medium tracking-tight">Scientific Evaluation & Model Benchmarking</h2>
            <p className="text-xs text-stone-400 mt-1 max-w-2xl">
              Controlled testing of Gemini GeoAI against multi-expert verified rock specimens under reproducible photography and consensus standards.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedDatasetId || ''}
              onChange={(e) => setSelectedDatasetId(e.target.value)}
              className="px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-xs font-medium text-stone-200"
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.dataset_code} — {d.name} ({d.status})
                </option>
              ))}
            </select>

            <button
              onClick={handleTriggerRun}
              disabled={executingRun || samples.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#a05a00] hover:bg-[#8a4f00] text-white text-xs font-semibold rounded-lg shadow-sm transition disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{executingRun ? 'Evaluating...' : 'Run AI Evaluation'}</span>
            </button>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Dataset Overview & Sample Registry */}
      {dataset && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs lg:col-span-1 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-sm font-medium text-stone-900 flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-amber-600" />
                Dataset Specification
              </h3>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                  dataset.status === 'locked'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-[#c4eed0] text-emerald-800'
                }`}
              >
                {dataset.status}
              </span>
            </div>

            <div className="text-xs space-y-2 text-stone-600">
              <div>
                <span className="text-stone-400 block text-[10px] uppercase font-mono">Dataset Code</span>
                <span className="font-semibold text-stone-900 font-mono">{dataset.dataset_code}</span>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px] uppercase font-mono">Version</span>
                <span className="font-semibold text-stone-900">{dataset.version}</span>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px] uppercase font-mono">Description</span>
                <p className="text-stone-600">{dataset.description}</p>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px] uppercase font-mono">Registered Samples</span>
                <span className="font-medium text-stone-900 font-mono">{samples.length} physical specimens</span>
              </div>
            </div>

            {dataset.status !== 'locked' && (
              <button
                onClick={handleLockDataset}
                className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-semibold transition"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Lock Dataset (Freeze for Testing)</span>
              </button>
            )}
          </div>

          {/* Sample Registry Table */}
          <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs lg:col-span-2">
            <h3 className="text-sm font-medium text-stone-900 mb-3 flex items-center justify-between">
              <span>Specimen Registry & Multi-Expert Consensus</span>
              <span className="text-xs font-normal text-stone-500">{samples.length} registered specimens</span>
            </h3>

            <div className="overflow-x-auto border border-stone-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-stone-50 text-stone-600 font-semibold">
                  <tr>
                    <th className="p-2.5 text-left">Sample Code</th>
                    <th className="p-2.5 text-left">Source Type</th>
                    <th className="p-2.5 text-left">District</th>
                    <th className="p-2.5 text-center">Reviews</th>
                    <th className="p-2.5 text-left">Expert Consensus</th>
                    <th className="p-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {samples.map((s) => {
                    const consensus = s.consensus;
                    return (
                      <tr key={s.id} className="hover:bg-stone-50/60">
                        <td className="p-2.5 font-mono font-medium text-stone-900">{s.sample_code}</td>
                        <td className="p-2.5 text-stone-600 capitalize">{s.source_type.replace(/_/g, ' ')}</td>
                        <td className="p-2.5 text-stone-600">{s.district || 'Rwanda'}</td>
                        <td className="p-2.5 text-center font-mono">{consensus?.reviewer_count || 0}</td>
                        <td className="p-2.5 capitalize font-medium text-stone-800">
                          {consensus?.majority_classification || (
                            <span className="text-stone-400 italic">Pending review</span>
                          )}
                          {consensus && consensus.consensus_percentage > 0 && (
                            <span className="text-[10px] text-stone-400 ml-1.5 font-mono">
                              ({consensus.consensus_percentage}%)
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-center">
                          {consensus?.is_disputed ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#fef7e0] text-amber-800">
                              Disputed
                            </span>
                          ) : consensus?.reviewer_count ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#c4eed0] text-emerald-800">
                              Consensus
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] text-stone-500 bg-stone-100">
                              Unreviewed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Evaluation Results (When Run Executed) */}
      {evaluation && (
        <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-stone-200 gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-medium text-stone-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-600" />
                  AI Evaluation Report — {evaluation.model_name}
                </h3>
                <span className="px-2 py-0.5 rounded text-xs font-mono bg-stone-100 text-stone-700">
                  {evaluation.prompt_version}
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-1">{evaluation.disclaimer}</p>
            </div>

            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-xs font-semibold transition"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Export Evaluation CSV</span>
            </button>
          </div>

          {/* Metric KPIs */}
          {/* Metric KPIs. Every figure is gated on the value itself being non-null, not
              on a separate "is this valid" flag, so a metric the evaluator could
              not compute can never be rendered as 0 - which would read as a
              measured result rather than an absent one. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
              <span className="text-xs text-stone-500 uppercase font-mono block">Agreement Rate</span>
              <span className="text-2xl font-medium font-mono text-emerald-600">
                {evaluation.agreement_rate_pct === null
                  ? 'Not measured'
                  : `${evaluation.agreement_rate_pct}%`}
              </span>
              <span className="text-[10px] text-stone-400 block mt-0.5">
                {evaluation.correct_classifications} / {evaluation.valid_samples} matched
              </span>
            </div>

            <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
              <span className="text-xs text-stone-500 uppercase font-mono block">Macro F1 Score</span>
              <span className="text-2xl font-medium font-mono text-stone-900">
                {evaluation.macro_f1 === null ? 'Not measured' : evaluation.macro_f1}
              </span>
              <span className="text-[10px] text-stone-400 block mt-0.5">Unweighted mean</span>
            </div>

            <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
              <span className="text-xs text-stone-500 uppercase font-mono block">Macro Precision</span>
              <span className="text-2xl font-medium font-mono text-stone-900">
                {evaluation.macro_precision === null ? 'Not measured' : evaluation.macro_precision}
              </span>
              <span className="text-[10px] text-stone-400 block mt-0.5">Across classes</span>
            </div>

            <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
              <span className="text-xs text-stone-500 uppercase font-mono block">Macro Recall</span>
              <span className="text-2xl font-medium font-mono text-stone-900">
                {evaluation.macro_recall === null ? 'Not measured' : evaluation.macro_recall}
              </span>
              <span className="text-[10px] text-stone-400 block mt-0.5">Across classes</span>
            </div>
          </div>

          {/* These two warnings are the difference between infrastructure and
              evidence. A run that scored part of a dataset, or figures that did
              not come from real specimen images, must not be read as a
              validation of the platform. */}
          {evaluation.is_partial_run && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong className="font-semibold">Partial run.</strong> This evaluation covered only a
                subset of the dataset because the per-run sample cap stopped it early. The figures below
                describe the specimens that were scored. They are not a validation of the whole dataset.
              </span>
            </div>
          )}

          {evaluation.is_mixed_model_run && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong className="font-semibold">Mixed model run.</strong> Predictions in this run came
                from {evaluation.models_observed.length} different models (
                {evaluation.models_observed.join(', ')}), so these figures describe no single model and
                are not a model validation.
              </span>
            </div>
          )}

          {!evaluation.metrics_are_real_measurements && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong className="font-semibold">Not real measurements.</strong> No figure on this
                report came from a real specimen image scored by the configured model. Earth Talk does not
                publish accuracy numbers it has not measured.
              </span>
            </div>
          )}

          {/* Multiclass Confusion Matrix */}
          <div>
            <h4 className="text-xs font-medium text-stone-800 mb-2 uppercase tracking-wider font-mono">
              Multiclass Confusion Matrix (Rows = Reference, Columns = AI Predicted)
            </h4>
            <div className="overflow-x-auto border border-stone-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-stone-100 text-stone-700">
                  <tr>
                    <th className="p-2.5 text-left">Expert Reference Standard</th>
                    <th className="p-2.5 text-left">AI Predicted Class</th>
                    <th className="p-2.5 text-right">Specimen Count</th>
                    <th className="p-2.5 text-center">Agreement State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {evaluation.confusion_matrix.map((c, i) => {
                    const match = c.reference_class === c.predicted_class;
                    return (
                      <tr key={i} className={match ? 'bg-[#f7fdf9]' : 'bg-red-50/30'}>
                        <td className="p-2.5 font-medium capitalize text-stone-900">{c.reference_class}</td>
                        <td className="p-2.5 font-medium capitalize text-stone-800">{c.predicted_class}</td>
                        <td className="p-2.5 text-right font-mono font-medium text-stone-900">{c.count}</td>
                        <td className="p-2.5 text-center">
                          {match ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#c4eed0] text-emerald-800">
                              Matched
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800">
                              Misclassification
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 25: Error Categorization Analysis */}
          {errors.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-stone-800 mb-2 uppercase tracking-wider font-mono">
                Error Categorization Analysis ({errors.length} Discrepancies)
              </h4>
              <div className="overflow-x-auto border border-stone-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-stone-100 text-stone-700">
                    <tr>
                      <th className="p-2.5 text-left">Sample</th>
                      <th className="p-2.5 text-left">Reference</th>
                      <th className="p-2.5 text-left">AI Predicted</th>
                      <th className="p-2.5 text-left">Error Category</th>
                      <th className="p-2.5 text-left">Diagnostic Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {errors.map((err) => (
                      <tr key={err.id}>
                        <td className="p-2.5 font-mono font-medium text-stone-800">{err.sample_id}</td>
                        <td className="p-2.5 capitalize text-stone-700">{err.reference_classification}</td>
                        <td className="p-2.5 capitalize text-red-600 font-medium">{err.ai_classification}</td>
                        <td className="p-2.5 font-mono text-[11px] text-amber-700">
                          {err.error_category.replace(/_/g, ' ')}
                        </td>
                        <td className="p-2.5 text-stone-500 text-[11px]">{err.error_notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
