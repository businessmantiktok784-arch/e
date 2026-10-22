import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  EyeOff,
  Sparkles,
  MapPin,
  Lock,
  Layers,
  History,
  FileCheck2,
  AlertTriangle,
  ZoomIn,
} from 'lucide-react';
import { fetchExpertObservationDetail, submitExpertReview } from '../services/expertApi.js';
import type {
  ExpertUser,
  ExpertObservationDetail,
  ExpertVerificationStatus,
  ExpertPublicationStatus,
} from '../types/expert.js';
import type { RockClassification, RockConfidence } from '../types/public.js';

interface ExpertWorkspaceModalProps {
  passportId: string | null;
  currentUser: ExpertUser;
  onClose: () => void;
  onReviewSubmitted: (updated: ExpertObservationDetail) => void;
}

const ROCK_NAME_SUGGESTIONS: Record<string, string[]> = {
  igneous: [
    'Porphyritic Biotite Granite',
    'Tourmaline Pegmatite',
    'Alkali Feldspar Granite',
    'Virunga Basalt',
    'Olivine Basanite',
    'Syenite',
  ],
  metamorphic: [
    'Graphitic Schist',
    'Tough Ridge Quartzite',
    'Amphibolite',
    'Staurolite Micaschist',
    'Banded Gneiss',
    'Phyllite',
  ],
  sedimentary: [
    'Kibaran Quartz Sandstone',
    'Ferruginous Siltstone',
    'Conglomerate',
    'Lacustrine Mudstone',
    'Kaolinitic Claystone',
  ],
  unclassified: ['Mineral Aggregate', 'Weathered Regolith', 'Vein Quartz'],
  non_rock: ['Industrial Glass / Furnace Slag', 'Refractory Ceramic', 'Construction Concrete', 'Road Slag'],
};

export const ExpertWorkspaceModal: React.FC<ExpertWorkspaceModalProps> = ({
  passportId,
  currentUser,
  onClose,
  onReviewSubmitted,
}) => {
  const [detail, setDetail] = useState<ExpertObservationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [decision, setDecision] = useState<ExpertVerificationStatus>('expert_verified');
  const [expertClassification, setExpertClassification] = useState<RockClassification>('igneous');
  const [expertRockName, setExpertRockName] = useState('');
  const [expertConfidence, setExpertConfidence] = useState<RockConfidence>('high');
  const [expertNotes, setExpertNotes] = useState('');
  const [scientificRemarks, setScientificRemarks] = useState('');
  const [pubStatus, setPubStatus] = useState<ExpertPublicationStatus>('public');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  // Cleared on unmount so a pending "hide the confirmation" tick never fires
  // after the modal is gone.
  const submitSuccessTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (submitSuccessTimer.current !== null) window.clearTimeout(submitSuccessTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!passportId) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setSubmitSuccess(false);

    fetchExpertObservationDetail(passportId)
      .then((data) => {
        if (!isMounted) return;
        if (!data) {
          setError(`Observation '${passportId}' not found.`);
          return;
        }
        setDetail(data);

        // Prepopulate with latest verification if available, otherwise AI suggestions
        if (data.latest_verification) {
          setDecision(data.latest_verification.status);
          setExpertClassification(
            data.latest_verification.expert_classification || data.ai_analysis.primary_classification
          );
          setExpertRockName(data.latest_verification.expert_rock_name || '');
          setExpertConfidence(data.latest_verification.expert_confidence || 'high');
          setExpertNotes(data.latest_verification.expert_notes || '');
          setScientificRemarks(data.latest_verification.scientific_remarks || '');
        } else {
          setDecision(data.verification_status === 'unverified' ? 'expert_verified' : data.verification_status);
          setExpertClassification(data.ai_analysis.primary_classification);
          setExpertRockName(data.ai_analysis.possible_name || '');
          setExpertConfidence(
            data.ai_analysis.confidence === 'insufficient' ? 'moderate' : data.ai_analysis.confidence
          );
          setExpertNotes('');
          setScientificRemarks('');
        }
        setPubStatus(data.publication_status);
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Failed to load observation');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [passportId]);

  if (!passportId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await submitExpertReview(detail.passport_id, {
        verification_status: decision,
        expert_classification: expertClassification,
        expert_rock_name: expertRockName.trim() || undefined,
        expert_confidence: expertConfidence,
        expert_notes: expertNotes.trim() || undefined,
        scientific_remarks: scientificRemarks.trim() || undefined,
        publication_status: pubStatus,
      });

      setSubmitSuccess(true);
      setDetail(res.updatedObservation);
      onReviewSubmitted(res.updatedObservation);
      if (submitSuccessTimer.current !== null) window.clearTimeout(submitSuccessTimer.current);
      submitSuccessTimer.current = window.setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit verification');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentSuggestions = ROCK_NAME_SUGGESTIONS[expertClassification] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#0b0b0c]/70 backdrop-blur-md overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col bg-white border border-[#c7c7c7] rounded-xl shadow-2xl text-[#1f1f1f] overflow-hidden my-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e3e3e3] bg-white/90 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#c4eed0] border border-[#2b7f3f]/30 text-[#2b7f3f]">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-medium font-mono text-[#1f1f1f]">{passportId}</h2>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${
                    detail?.verification_status === 'expert_verified'
                      ? 'bg-[#c4eed0] text-[#2b7f3f] border-[#2b7f3f]/30'
                      : detail?.verification_status === 'under_review'
                      ? 'bg-[#e8f0fe] text-[#0b57d0] border-sky-500/30'
                      : detail?.verification_status === 'rejected'
                      ? 'bg-[#ffdad8] text-[#d32f28] border-rose-500/30'
                      : 'bg-[#fef7e0] text-[#9f6108] border-amber-500/30'
                  }`}
                >
                  {detail?.verification_status === 'expert_verified'
                    ? '✓ Expert Verified'
                    : detail?.verification_status === 'under_review'
                    ? '⧗ Under Review'
                    : detail?.verification_status === 'rejected'
                    ? '✕ Rejected'
                    : '● Awaiting Review'}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-[#eef1f6] text-[#5e5e5e] border border-[#c7c7c7]">
                  {detail?.publication_status === 'public'
                    ? 'Public on Map'
                    : detail?.publication_status === 'pending'
                    ? 'Pending Visibility'
                    : 'Private'}
                </span>
              </div>
              <p className="text-xs text-[#5e5e5e]">
                Authoritative Geological Verification Workspace & Audit Record
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#5e5e5e] hover:text-[#1f1f1f] hover:bg-[#eef1f6] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-16 space-y-3">
            <div className="w-8 h-8 border-2 border-[#2b7f3f] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-[#5e5e5e]">Loading observation record and audit logs...</p>
          </div>
        ) : error && !detail ? (
          <div className="p-8 text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-[#d32f28] mx-auto" />
            <p className="text-[#3c4043]">{error}</p>
            <button onClick={onClose} className="px-4 py-2 bg-[#eef1f6] rounded-lg text-sm text-[#1f1f1f]">
              Close
            </button>
          </div>
        ) : detail ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {submitSuccess && (
              <div className="flex items-center space-x-2 p-3.5 rounded-xl bg-[#c4eed0] border border-[#2b7f3f]/30 text-[#2b7f3f] text-sm animate-in fade-in">
                <CheckCircle2 className="w-5 h-5 text-[#2b7f3f] shrink-0" />
                <span>Authoritative verification decision successfully recorded and audited!</span>
              </div>
            )}

            {error && (
              <div className="flex items-center space-x-2 p-3.5 rounded-xl bg-[#ffdad8] border border-rose-500/30 text-[#d32f28] text-sm">
                <AlertTriangle className="w-5 h-5 text-[#d32f28] shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* 3-Column Scientific Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Column 1: Specimen Imagery & Location (4 Cols) */}
              <div className="lg:col-span-4 space-y-4">
                {/* Specimen Photograph */}
                <div className="relative rounded-xl overflow-hidden border border-[#c7c7c7] bg-[#f8fafd] aspect-[4/3] flex items-center justify-center">
                  <img
                    src={`/api/expert/media/${detail.passport_id}`}
                    alt={`Specimen ${detail.passport_id}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2 px-2 py-1 rounded bg-white/90 backdrop-blur-sm border border-[#e3e3e3] text-[10px] text-[#3c4043] font-mono flex items-center gap-1">
                    <ZoomIn className="w-3 h-3 text-[#2b7f3f]" />
                    High-Res Specimen
                  </div>
                </div>

                {/* Location & Contributor Privacy Inspector */}
                <div className="p-4 rounded-xl bg-[#f0f4f9] border border-[#e3e3e3] space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#3c4043]">
                    <span className="flex items-center gap-1.5 text-[#2b7f3f]">
                      <MapPin className="w-4 h-4" />
                      Geographic Provenance
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#eef1f6] text-[#3c4043] text-[11px] font-mono">
                      Precision: {detail.location.precision}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-white border border-[#e3e3e3]">
                      <span className="text-[#8f8f8f] block text-[10px]">District</span>
                      <span className="font-medium text-[#1f1f1f]">{detail.location.district || 'Unspecified'}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-[#e3e3e3]">
                      <span className="text-[#8f8f8f] block text-[10px]">Sector</span>
                      <span className="font-medium text-[#1f1f1f]">{detail.location.sector || 'Unspecified'}</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white/80 border border-[#e3e3e3] text-xs flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Lock className="w-3.5 h-3.5 text-[#8f8f8f]" />
                      <span className="text-[#5e5e5e] text-[11px]">Contributor ID (Anonymized)</span>
                    </div>
                    <span className="font-mono text-[11px] text-[#3c4043] font-semibold">
                      {detail.source_contributor_hash}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#8f8f8f] italic">
                    Strict privacy rule: Citizen telephone numbers are never exposed in verification workflows.
                  </p>
                </div>
              </div>

              {/* Column 2: Immutable AI Preliminary Assessment (4 Cols) */}
              <div className="lg:col-span-4 space-y-4">
                <div className="p-4 rounded-xl bg-[#f8fafd] border border-[#e3e3e3] space-y-4 h-full">
                  <div className="flex items-center justify-between pb-3 border-b border-[#e3e3e3]">
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-4 h-4 text-[#0b57d0]" />
                      <span className="text-xs font-medium uppercase tracking-wider text-[#0b57d0]">
                        Immutable AI Record
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#e8f0fe] text-[#0b57d0] border border-sky-500/20 font-mono">
                      {detail.ai_analysis.ai_model}
                    </span>
                  </div>

                  {/* AI Prediction Summary */}
                  <div>
                    <span className="text-[11px] text-[#5e5e5e] block mb-1">AI Classification & Candidate</span>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-[#eef1f6] text-[#1f1f1f] text-xs font-semibold capitalize border border-[#c7c7c7]">
                        {detail.ai_analysis.primary_classification}
                      </span>
                      <span className="text-sm font-semibold text-[#1f1f1f] capitalize">
                        {detail.ai_analysis.possible_name || 'Unclassified Rock'}
                      </span>
                    </div>
                  </div>

                  {/* AI Confidence */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#5e5e5e]">Preliminary Confidence</span>
                      <span className="font-mono text-[#3c4043]">
                        {Math.round(detail.ai_analysis.confidence_score * 100)}% ({detail.ai_analysis.confidence})
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#eef1f6] overflow-hidden">
                      <div
                        className="h-full bg-[#0b57d0] rounded-full"
                        style={{ width: `${Math.round(detail.ai_analysis.confidence_score * 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Observed Features */}
                  <div>
                    <span className="text-[11px] text-[#5e5e5e] block mb-1.5 font-medium">
                      AI Detected Features
                    </span>
                    <ul className="space-y-1 text-xs text-[#3c4043]">
                      {detail.ai_analysis.observed_features.map((feat, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-[#0b57d0] font-medium">•</span>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Reasoning */}
                  <div>
                    <span className="text-[11px] text-[#5e5e5e] block mb-1 font-medium">AI Reasoning</span>
                    <p className="text-xs text-[#3c4043] leading-relaxed bg-white/60 p-2.5 rounded-lg border border-[#e3e3e3]">
                      {detail.ai_analysis.reasoning}
                    </p>
                  </div>

                  {/* Notice of Separation */}
                  <div className="p-2.5 rounded-lg bg-[#d3e3fd] border border-[#c7c7c7] text-[11px] text-[#0b57d0]/80">
                    <p className="font-medium">Scientific Separation Rule:</p>
                    <p className="text-[10px] text-[#0b57d0]/70">
                      Expert verification acts as the authoritative truth and never overwrites this preliminary AI log.
                    </p>
                  </div>
                </div>
              </div>

              {/* Column 3: Authoritative Verification Workspace (4 Cols) */}
              <div className="lg:col-span-4 space-y-4">
                <form
                  onSubmit={handleSubmit}
                  className="p-4 rounded-xl bg-[#f8fafd] border border-[#2b7f3f]/40 shadow-lg shadow-[#c4eed0] space-y-4"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-[#e3e3e3]">
                    <div className="flex items-center space-x-2">
                      <ShieldCheck className="w-4 h-4 text-[#2b7f3f]" />
                      <span className="text-xs font-medium uppercase tracking-wider text-[#2b7f3f]">
                        Expert Verification
                      </span>
                    </div>
                    <span className="text-[11px] text-[#5e5e5e] font-medium">Reviewer Workspace</span>
                  </div>

                  {/* Verification Decision Buttons */}
                  <div>
                    <label className="block text-xs font-semibold text-[#3c4043] mb-1.5">
                      Authoritative Decision
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDecision('expert_verified')}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-1 border transition-all ${
                          decision === 'expert_verified'
                            ? 'bg-[#2b7f3f] text-white border-[#2b7f3f] shadow-md shadow-[#c4eed0]'
                            : 'bg-white text-[#5e5e5e] border-[#e3e3e3] hover:text-[#1f1f1f]'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Verify</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDecision('under_review')}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-1 border transition-all ${
                          decision === 'under_review'
                            ? 'bg-[#0b57d0] text-white border-sky-500 shadow-md shadow-[#d3e3fd]'
                            : 'bg-white text-[#5e5e5e] border-[#e3e3e3] hover:text-[#1f1f1f]'
                        }`}
                      >
                        <Clock className="w-4 h-4" />
                        <span>In Review</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDecision('rejected');
                          setPubStatus('hidden');
                        }}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-1 border transition-all ${
                          decision === 'rejected'
                            ? 'bg-[#c5221f] text-white border-rose-500 shadow-md shadow-[#ffdad8]'
                            : 'bg-white text-[#5e5e5e] border-[#e3e3e3] hover:text-[#1f1f1f]'
                        }`}
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>

                  {/* Classification */}
                  <div>
                    <label className="block text-xs font-medium text-[#3c4043] mb-1">
                      Authoritative Classification
                    </label>
                    <select
                      value={expertClassification}
                      onChange={(e) => setExpertClassification(e.target.value as RockClassification)}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-[#c7c7c7] text-[#1f1f1f] text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="igneous">Igneous</option>
                      <option value="sedimentary">Sedimentary</option>
                      <option value="metamorphic">Metamorphic</option>
                      <option value="unclassified">Unclassified Natural Rock</option>
                      <option value="non_rock">Non-Rock / Artificial Slag</option>
                    </select>
                  </div>

                  {/* Rock Name with Suggestions */}
                  <div>
                    <label className="block text-xs font-medium text-[#3c4043] mb-1">
                      Expert Verified Rock Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Porphyritic Biotite Granite"
                      value={expertRockName}
                      onChange={(e) => setExpertRockName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-[#c7c7c7] text-[#1f1f1f] text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />

                    {currentSuggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {currentSuggestions.map((sug) => (
                          <button
                            type="button"
                            key={sug}
                            onClick={() => setExpertRockName(sug)}
                            className="text-[10px] px-2 py-0.5 rounded bg-[#eef1f6] text-[#3c4043] hover:bg-[#e3e3e3] hover:text-[#2b7f3f] transition-colors"
                          >
                            + {sug}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Confidence */}
                  <div>
                    <label className="block text-xs font-medium text-[#3c4043] mb-1">Expert Confidence</label>
                    <div className="grid grid-cols-3 gap-1">
                      {(['high', 'moderate', 'low'] as RockConfidence[]).map((conf) => (
                        <button
                          key={conf}
                          type="button"
                          onClick={() => setExpertConfidence(conf)}
                          className={`py-1 rounded text-xs capitalize border ${
                            expertConfidence === conf
                              ? 'bg-[#eef1f6] text-[#2b7f3f] border-[#2b7f3f] font-semibold'
                              : 'bg-white text-[#5e5e5e] border-[#e3e3e3]'
                          }`}
                        >
                          {conf}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notes / Lithology */}
                  <div>
                    <label className="block text-xs font-medium text-[#3c4043] mb-1">
                      Expert Notes & Lithological Details
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Document mineralogical composition, texture, regional formation context..."
                      value={expertNotes}
                      onChange={(e) => setExpertNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-[#c7c7c7] text-[#1f1f1f] text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Public Visibility Toggle */}
                  <div className="p-2.5 rounded-lg bg-white border border-[#e3e3e3] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[#3c4043] flex items-center gap-1.5">
                        {pubStatus === 'public' ? (
                          <Eye className="w-3.5 h-3.5 text-[#2b7f3f]" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-[#8f8f8f]" />
                        )}
                        Public Map Visibility
                      </span>
                      <select
                        value={pubStatus}
                        onChange={(e) => setPubStatus(e.target.value as ExpertPublicationStatus)}
                        className="px-2 py-1 rounded bg-[#eef1f6] border border-[#c7c7c7] text-[#1f1f1f] text-[11px]"
                      >
                        <option value="public">Public (Visible on Map)</option>
                        <option value="private">Private (Restricted)</option>
                        <option value="hidden">Hidden</option>
                      </select>
                    </div>
                  </div>

                  {/* Reviewer Stamp */}
                  <div className="text-[11px] text-[#5e5e5e] bg-white/60 p-2 rounded-lg border border-[#e3e3e3]">
                    <span className="text-[#8f8f8f] block text-[10px]">Authoritative Reviewer Stamp:</span>
                    <span className="font-semibold text-[#1f1f1f]">{currentUser.name}</span> •{' '}
                    <span>{currentUser.organization}</span>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#2b7f3f] hover:bg-[#2b7f3f] active:bg-[#2b7f3f] text-white font-medium text-xs transition-colors shadow-lg shadow-[#c4eed0] disabled:opacity-50 flex items-center justify-center space-x-2"
                  >
                    {isSubmitting ? (
                      <span>Recording verification in audit log...</span>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Record Authoritative Decision</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Bottom Section: Audit Trail & Traceability Timeline */}
            <div className="p-4 rounded-xl bg-[#f8fafd] border border-[#e3e3e3] space-y-3">
              <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-[#5e5e5e]">
                <History className="w-4 h-4 text-[#2b7f3f]" />
                <span>Verification Audit Log & Traceability History</span>
              </div>

              {detail.audit_logs.length === 0 ? (
                <p className="text-xs text-[#8f8f8f] italic">
                  No previous audit actions recorded. This observation is awaiting initial expert review.
                </p>
              ) : (
                <div className="divide-y divide-[#e3e3e3] text-xs">
                  {detail.audit_logs.map((log) => (
                    <div key={log.id} className="py-2.5 flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-[#1f1f1f]">{log.reviewer_name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#eef1f6] text-[#5e5e5e] uppercase font-mono">
                            {log.action}
                          </span>
                          <span className="text-[#8f8f8f] text-[11px]">
                            {log.previous_status} →{' '}
                            <span className="font-semibold text-[#2b7f3f]">{log.new_status}</span>
                          </span>
                        </div>
                        {log.notes && <p className="text-[#5e5e5e] text-[11px]">{log.notes}</p>}
                      </div>
                      <span className="text-[10px] text-[#8f8f8f] font-mono shrink-0">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
