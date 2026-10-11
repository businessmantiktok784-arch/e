import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Download,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  MapPin,
  RefreshCw,
  Database,
  Info,
  Activity,
  FileSpreadsheet,
  Globe2,
} from 'lucide-react';
import {
  fetchResearchSummary,
  downloadResearchCsv,
  downloadResearchGeoJson,
} from '../services/expertApi.js';
import type { ResearchAnalyticsSummary } from '../types/expert.js';

interface ResearchAnalyticsDashboardProps {
  onBackToQueue?: () => void;
}

export const ResearchAnalyticsDashboard: React.FC<ResearchAnalyticsDashboardProps> = ({ onBackToQueue }) => {
  const [data, setData] = useState<ResearchAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingGeoJson, setExportingGeoJson] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const summary = await fetchResearchSummary();
      setData(summary);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load research analytics';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleExportCsv = async () => {
    try {
      setExportingCsv(true);
      const blob = await downloadResearchCsv();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `earth-talk-observations-${data?.dataset_version || '2026'}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'CSV Export failed';
      alert(`Export Error: ${msg}`);
    } finally {
      setExportingCsv(false);
    }
  };

  const handleExportGeoJson = async () => {
    try {
      setExportingGeoJson(true);
      const geojson = await downloadResearchGeoJson();
      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `earth-talk-observations-${data?.dataset_version || '2026'}.geojson`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'GeoJSON Export failed';
      alert(`Export Error: ${msg}`);
    } finally {
      setExportingGeoJson(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-stone-500">
        <RefreshCw className="w-8 h-8 animate-spin text-amber-600 mb-3" />
        <p className="text-sm font-medium">Aggregating research analytics and performance metrics...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 my-6 text-red-800">
        <div className="flex items-center gap-2 font-semibold mb-2">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span>Analytics Error</span>
        </div>
        <p className="text-sm mb-4">{error}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Top Banner & Export Actions */}
      <div className="bg-stone-900 text-white rounded-xl p-6 shadow-sm border border-stone-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-[#fef7e0] text-[#9f6108] border border-amber-500/30">
                {data.dataset_version}
              </span>
              <span className="text-xs text-stone-400">
                Generated: {new Date(data.generated_at).toLocaleString()}
              </span>
            </div>
            <h2 className="text-xl font-medium tracking-tight">Geological Research & Model Analytics</h2>
            <p className="text-xs text-stone-400 mt-1 max-w-2xl">
              Quantitative data quality metrics, AI model evaluation against expert reference determinations, and geographic sampling distribution across Rwanda.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportCsv}
              disabled={exportingCsv}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold rounded-lg border border-stone-700 transition"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#2b7f3f]" />
              <span>{exportingCsv ? 'Exporting...' : 'Export Research CSV'}</span>
            </button>

            <button
              onClick={handleExportGeoJson}
              disabled={exportingGeoJson}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold rounded-lg border border-stone-700 transition"
            >
              <Globe2 className="w-4 h-4 text-[#0b57d0]" />
              <span>{exportingGeoJson ? 'Exporting...' : 'Export GeoJSON'}</span>
            </button>

            {onBackToQueue && (
              <button
                onClick={onBackToQueue}
                className="px-3 py-2 text-xs text-stone-400 hover:text-stone-200"
              >
                Back to Queue
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <p className="text-xs text-stone-500 font-medium">Total Observations</p>
          <p className="text-2xl font-medium text-stone-900 mt-1 font-mono">
            {data.observation_stats.total}
          </p>
          <span className="text-[10px] text-stone-400">{data.observation_stats.completed} completed</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <p className="text-xs text-stone-500 font-medium">Expert Verified</p>
          <p className="text-2xl font-medium text-emerald-600 mt-1 font-mono">
            {data.verification_stats.expert_verified}
          </p>
          <span className="text-[10px] text-stone-400">{data.verification_stats.under_review} under review</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <p className="text-xs text-stone-500 font-medium">Rejected Records</p>
          <p className="text-2xl font-medium text-red-600 mt-1 font-mono">
            {data.verification_stats.rejected}
          </p>
          <span className="text-[10px] text-stone-400">Non-rock / artifact</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <p className="text-xs text-stone-500 font-medium">Coverage</p>
          <p className="text-2xl font-medium text-stone-900 mt-1 font-mono">
            {data.geographic_stats.total_districts_represented}
            <span className="text-sm font-normal text-stone-400">/{data.geographic_stats.total_rwanda_districts}</span>
          </p>
          <span className="text-[10px] text-stone-400">Rwanda districts</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <p className="text-xs text-stone-500 font-medium">Data Quality</p>
          <p className="text-2xl font-medium text-amber-600 mt-1 font-mono">
            {data.data_quality_stats.average_score}
            <span className="text-sm font-normal text-stone-400">/100</span>
          </p>
          <span className="text-[10px] text-stone-400">Avg completeness</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <p className="text-xs text-stone-500 font-medium">AI Model Latency</p>
          <p className="text-2xl font-medium text-stone-900 mt-1 font-mono">
            {data.operational_metrics.average_ai_duration_ms}
            <span className="text-sm font-normal text-stone-400">ms</span>
          </p>
          <span className="text-[10px] text-stone-400">Multimodal inference</span>
        </div>
      </div>

      {/* Main Grid: AI vs Expert Evaluation + Data Quality Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 14: AI vs Expert Evaluation */}
        <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-100">
            <div>
              <h3 className="text-sm font-medium text-stone-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600" />
                AI Model vs Expert Reviewer Agreement
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Evaluation comparing preliminary Gemini GeoAI vision classifications with authoritative expert determinations.
              </p>
            </div>
            {data.ai_vs_expert.sufficient_sample_size && (
              <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-[#c4eed0] text-emerald-800">
                {data.ai_vs_expert.agreement_rate_pct}% Agreement
              </span>
            )}
          </div>

          {!data.ai_vs_expert.sufficient_sample_size ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-xs">
              <div className="flex items-center gap-2 font-semibold mb-1">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>Small Sample Notice</span>
              </div>
              <p>{data.ai_vs_expert.disclaimer}</p>
              <p className="mt-2 text-stone-600">
                Currently <strong>{data.ai_vs_expert.eligible_sample_count}</strong> expert-verified specimen(s) recorded in the database. Performance statistics will automatically render as more reviews are verified.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Agreement summary */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-stone-50 rounded-xl border border-stone-100 text-center">
                <div>
                  <span className="text-[10px] text-stone-500 uppercase tracking-wider block">Evaluated</span>
                  <span className="text-lg font-medium font-mono text-stone-900">
                    {data.ai_vs_expert.eligible_sample_count}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-stone-500 uppercase tracking-wider block">Agreement</span>
                  <span className="text-lg font-medium font-mono text-emerald-600">
                    {data.ai_vs_expert.overall_agreement_count}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-stone-500 uppercase tracking-wider block">Macro F1</span>
                  <span className="text-lg font-medium font-mono text-stone-900">
                    {data.ai_vs_expert.macro_f1}
                  </span>
                </div>
              </div>

              {/* Confusion Matrix Table */}
              <div>
                <h4 className="text-xs font-semibold text-stone-700 mb-2">Confusion Matrix (Observed Transitions)</h4>
                <div className="overflow-x-auto border border-stone-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-stone-100 text-stone-600">
                      <tr>
                        <th className="p-2 text-left">AI Preliminary</th>
                        <th className="p-2 text-left">Expert Reference</th>
                        <th className="p-2 text-right">Specimens</th>
                        <th className="p-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {data.ai_vs_expert.confusion_matrix.map((cell, idx) => {
                        const isMatch = cell.ai_classification === cell.expert_classification;
                        return (
                          <tr key={idx} className={isMatch ? 'bg-[#f7fdf9]' : 'bg-amber-50/30'}>
                            <td className="p-2 capitalize font-medium text-stone-800">{cell.ai_classification}</td>
                            <td className="p-2 capitalize font-medium text-stone-800">{cell.expert_classification}</td>
                            <td className="p-2 text-right font-mono font-medium text-stone-900">{cell.count}</td>
                            <td className="p-2 text-center">
                              {isMatch ? (
                                <span className="text-[10px] font-semibold text-emerald-700 bg-[#c4eed0] px-1.5 py-0.5 rounded">
                                  Agreed
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-amber-700 bg-[#fef7e0] px-1.5 py-0.5 rounded">
                                  Discrepancy
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

              {/* Scientific Disclaimer */}
              <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 flex items-start gap-2">
                <Info className="w-4 h-4 text-stone-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  {data.ai_vs_expert.disclaimer}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Section 10: Data Quality & Completeness Tiers */}
        <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-100">
            <div>
              <h3 className="text-sm font-medium text-stone-900 flex items-center gap-2">
                <Database className="w-4 h-4 text-amber-600" />
                Data Quality & Completeness Engine
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Deterministic 0-100 scoring based on image specifications, metadata completeness, location precision, and safety notes.
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-stone-100 text-stone-700">
              Avg {data.data_quality_stats.average_score}/100
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-emerald-700">High Completeness (90–100)</span>
                <span className="font-mono text-stone-600">{data.data_quality_stats.score_distribution.high} records</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2">
                <div
                  className="bg-[#2b7f3f] h-2 rounded-full"
                  style={{
                    width: `${data.observation_stats.total > 0 ? (data.data_quality_stats.score_distribution.high / data.observation_stats.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-blue-700">Good Completeness (70–89)</span>
                <span className="font-mono text-stone-600">{data.data_quality_stats.score_distribution.good} records</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{
                    width: `${data.observation_stats.total > 0 ? (data.data_quality_stats.score_distribution.good / data.observation_stats.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-amber-700">Moderate Completeness (50–69)</span>
                <span className="font-mono text-stone-600">{data.data_quality_stats.score_distribution.moderate} records</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2">
                <div
                  className="bg-[#f9ab00] h-2 rounded-full"
                  style={{
                    width: `${data.observation_stats.total > 0 ? (data.data_quality_stats.score_distribution.moderate / data.observation_stats.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-stone-500">Low Completeness (0–49)</span>
                <span className="font-mono text-stone-600">{data.data_quality_stats.score_distribution.low} records</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2">
                <div
                  className="bg-stone-400 h-2 rounded-full"
                  style={{
                    width: `${data.observation_stats.total > 0 ? (data.data_quality_stats.score_distribution.low / data.observation_stats.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
              <span className="text-stone-500">Duplicate Checksum Suspects:</span>
              <span className={`font-mono font-medium ${data.data_quality_stats.duplicate_suspects_count > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {data.data_quality_stats.duplicate_suspects_count} flagged
              </span>
            </div>

            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 flex items-start gap-2">
              <Info className="w-4 h-4 text-stone-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-stone-500 leading-relaxed">
                Data quality scores measure structural completeness (photo metadata, district tags, coordinate availability, and reasoning depth). They do not represent mineralogical purity.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Section 16: Geographic Distribution & Participation Patterns */}
      <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 mb-4 border-b border-stone-100 gap-2">
          <div>
            <h3 className="text-sm font-medium text-stone-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-600" />
              Citizen Observation Distribution by District
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Breakdown of user submissions and expert verifications across Rwandan districts.
            </p>
          </div>
          <span className="text-xs font-mono text-stone-500">
            {data.geographic_stats.total_districts_represented} of {data.geographic_stats.total_rwanda_districts} Districts
          </span>
        </div>

        {/* Scientific Honesty Notice */}
        <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl mb-4 text-xs text-amber-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="leading-relaxed">
            <strong>Scientific Methodology Notice:</strong> {data.geographic_stats.scientific_note}
          </p>
        </div>

        <div className="overflow-x-auto border border-stone-200 rounded-xl">
          <table className="w-full text-xs">
            <thead className="bg-stone-50 text-stone-600 font-semibold">
              <tr>
                <th className="p-2.5 text-left">District</th>
                <th className="p-2.5 text-right">Observations</th>
                <th className="p-2.5 text-right">% of Total</th>
                <th className="p-2.5 text-right">Verified</th>
                <th className="p-2.5 text-left">Primary Category Mix</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.geographic_stats.districts.slice(0, 10).map((d, i) => (
                <tr key={i} className="hover:bg-stone-50/80">
                  <td className="p-2.5 font-medium text-stone-900">{d.district}</td>
                  <td className="p-2.5 text-right font-mono font-medium text-stone-800">{d.observation_count}</td>
                  <td className="p-2.5 text-right font-mono text-stone-600">{d.percentage_of_total}%</td>
                  <td className="p-2.5 text-right font-mono text-emerald-700 font-semibold">{d.verified_count}</td>
                  <td className="p-2.5">
                    <div className="flex gap-1.5 flex-wrap">
                      {Object.entries(d.classifications).map(([cls, cnt]) => (
                        <span key={cls} className="px-1.5 py-0.5 rounded text-[10px] bg-stone-100 text-stone-700">
                          {cls}: {cnt}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
