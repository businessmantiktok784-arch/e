import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search,
  PlusCircle,
  Loader2,
  AlertTriangle,
  ThumbsUp,
  MessageCircleQuestion,
  HelpCircle,
  Award,
  ChevronRight,
  ExternalLink,
  ImagePlus,
  X,
  ShieldCheck,
  BadgeCheck,
  Trash2,
  Pencil,
  Send,
  Flag,
} from 'lucide-react';
import {
  fetchInvestigations,
  fetchInvestigation,
  fetchQuestions,
  fetchQuestion,
  fetchSites,
  fetchMyReputation,
  openInvestigation,
  updateInvestigation,
  castVote,
  checkChecklistItem,
  submitEvidence,
  askQuestion,
  postAnswer,
  uploadCommunityMedia,
  communityMediaSrc,
} from '../services/communityApi.js';
import { SignedOutNotice } from './LocalAccountModal.js';
import { MyQuestionsPanel } from './MyQuestionsPanel.js';
import { ReportDialog } from './ReportDialog.js';
import {
  CATEGORY_LABELS,
  EVIDENCE_TYPE_LABELS,
  investigationStatusLabel,
  type CommunityEvidenceType,
  type PublicInvestigationDetail,
  type PublicInvestigationSummary,
  type PublicQuestionSummary,
  type PublicQuestionDetail,
  type PublicReputationSummary,
  type PublicSiteSummary,
} from '../types/community.js';
import type { CommunityPanel } from '../navigation.js';
import type { CommunityUser } from '../types/communityPosts.js';

interface CommunityDiscoveryViewProps {
  /**
   * Which section is open. The section switcher lives in the app sidebar, not in
   * an inline tab strip inside this view.
   */
  activePanel: CommunityPanel;
  onPanelChange: (panel: CommunityPanel) => void;
  /** The signed-in contributor, or null for a read-only visitor. */
  viewer?: CommunityUser | null;
  /** Opens the sign-in surface when a visitor tries to contribute. */
  onRequestLogin?: () => void;
  /** Opens an observation's side card from "My questions". */
  onOpenPost?: (passportId: string) => void;
}

/** Categories a contribution can be tagged with. */
const SUBJECT_CATEGORIES = [
  'rock',
  'mineral',
  'fossil',
  'geological_structure',
  'geological_layer',
  'geomorphology',
  'volcanic_feature',
  'hydrogeological_feature',
  'mining_observation',
  'engineering_geology',
  'other_geoscience',
] as const;

/**
 * Community Discovery.
 *
 * Reading is open to everyone. Asking, answering, voting and adding files need a
 * signed-in identity, because an attributed contribution is the whole point: a
 * handle nobody can hold to account is not evidence.
 *
 * Empty states are written to be explicit about *why* they are empty. A blank
 * list must never be ambiguous between "nobody has contributed yet" and "the
 * feature is unavailable", because those call for completely different reader
 * responses.
 */
export const CommunityDiscoveryView: React.FC<CommunityDiscoveryViewProps> = ({
  activePanel: panel,
  viewer,
  onRequestLogin,
  onOpenPost,
}) => {
  const [investigations, setInvestigations] = useState<PublicInvestigationSummary[]>([]);
  const [questions, setQuestions] = useState<PublicQuestionSummary[]>([]);
  const [sites, setSites] = useState<PublicSiteSummary[]>([]);
  const [reputation, setReputation] = useState<PublicReputationSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const [showNewInvestigation, setShowNewInvestigation] = useState(false);
  const [showNewQuestion, setShowNewQuestion] = useState(false);
  /** The investigation currently being corrected, if any. */
  const [editingInvestigation, setEditingInvestigation] = useState<PublicInvestigationSummary | null>(null);

  /** Returns true when the viewer may contribute; otherwise asks them to sign in. */
  const requireSignIn = useCallback((): boolean => {
    if (viewer) return true;
    onRequestLogin?.();
    return false;
  }, [viewer, onRequestLogin]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);

    try {
      const [i, q, s] = await Promise.all([
        fetchInvestigations({ limit: 30 }),
        fetchQuestions({ limit: 30 }),
        fetchSites({ limit: 200 }).catch(() => ({ rows: [], total: 0 })),
      ]);
      setInvestigations(i.rows);
      setQuestions(q.rows);
      setSites(s.rows);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not load community data.';
      setError(message);
      // A 503 means the community database is not configured, which is a
      // different situation from "there is nothing here yet".
      setUnavailable(/unavailable|not configured/i.test(message));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReputation = useCallback(async () => {
    try {
      setReputation(await fetchMyReputation());
    } catch {
      // Reputation is supplementary; its absence must not break the page.
    }
  }, []);

  useEffect(() => {
    load();
    loadReputation();
  }, [load, loadReputation]);

  const refreshReputation = () => {
    void loadReputation();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Unavailable state */}
      {unavailable && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[#fef7e0] border border-amber-500/30 text-[#9f6108] text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 text-[#9f6108]" />
          <div>
            <div className="font-semibold">Community features are not available right now.</div>
            <div className="mt-1 text-[#9f6108]/80">
              The community database is not configured on this server, so nothing is being shown and nothing you
              submit will be recorded. This is not an indication that the community has no contributions.
            </div>
          </div>
        </div>
      )}

      {error && !unavailable && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[#ffdad8] border border-rose-500/30 text-[#d32f28] text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 text-[#d32f28]" />
          <span>{error}</span>
        </div>
      )}

      {/* Read-only banner for visitors */}
      {!viewer && !loading && !unavailable && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-white border border-[#e3e3e3] text-sm">
          <div className="flex items-center gap-2 text-[#3c4043]">
            <ShieldCheck className="w-4 h-4 text-[#2b7f3f]" aria-hidden="true" />
            <span>
              You are reading as a visitor. Everything here is public; a name is only needed to contribute.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onRequestLogin?.()}
            className="g-btn g-btn-filled h-9 px-3 text-sm"
          >
            Sign in to contribute
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[#5e5e5e] text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading community data…
        </div>
      ) : (
        <>
          {/* ========================= INVESTIGATIONS ========================= */}
          {panel === 'investigations' && (
            <>
              <SectionHeader
                icon={<Search className="w-6 h-6 text-[#2b7f3f]" />}
                title="Community investigations"
                intro={
                  <>
                    An investigation is a public question about a rock or a site that anyone can help settle. Ask
                    it with fixed answer choices and a photo or two, and every signed-in reader can weigh in once.
                    Many agreeing voices are community input - never expert verification or scientific confirmation.
                  </>
                }
                note={
                  <>
                    contributors appear only as a handle such as &quot;Field Explorer #A82F&quot;. A random token
                    in this browser makes sure your vote is counted once; it contains no personal data.
                  </>
                }
              />
              <section className="space-y-4">
                <button
                  onClick={() => {
                    if (!requireSignIn()) return;
                    setShowNewInvestigation(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2b7f3f] hover:bg-[#257036] text-white text-sm font-medium transition-colors"
                >
                  <PlusCircle className="w-4 h-4" />
                  Ask the community to investigate
                </button>
                {!viewer && <SignedOutNotice onSignIn={() => onRequestLogin?.()} verb="open an investigation" />}

                {showNewInvestigation && (
                  <CommunityComposer
                    kind="investigation"
                    sites={sites}
                    onCancel={() => setShowNewInvestigation(false)}
                    onSubmit={async (payload) => {
                      const created = await openInvestigation({
                        question: payload.text,
                        context: payload.context,
                        category: payload.category,
                        options: payload.options,
                        checklist: payload.checklist,
                        researchInterest: payload.researchInterest,
                        siteId: payload.siteId,
                        mediaIds: payload.mediaIds,
                      });
                      setShowNewInvestigation(false);
                      setInvestigations((prev) => [created, ...prev]);
                      refreshReputation();
                      return created.public_id;
                    }}
                  />
                )}

                {editingInvestigation && (
                  <CommunityComposer
                    kind="investigation"
                    sites={sites}
                    initial={{
                      text: editingInvestigation.question,
                      context: editingInvestigation.context ?? '',
                      category: editingInvestigation.category,
                      siteId: editingInvestigation.site_id ?? '',
                      options: editingInvestigation.options,
                      checklist: editingInvestigation.checklist.map((item) => item.text),
                      researchInterest: editingInvestigation.research_interest,
                    }}
                    onCancel={() => setEditingInvestigation(null)}
                    onSubmit={async (payload) => {
                      const updated = await updateInvestigation(editingInvestigation.public_id, {
                        question: payload.text,
                        context: payload.context,
                        category: payload.category,
                        options: payload.options,
                        checklist: payload.checklist,
                        researchInterest: payload.researchInterest,
                      });
                      setInvestigations((prev) =>
                        prev.map((i) => (i.public_id === updated.public_id ? updated : i))
                      );
                      setEditingInvestigation(null);
                      return updated.public_id;
                    }}
                  />
                )}

                {investigations.length === 0 ? (
                  <EmptyState
                    title="No community investigations yet"
                    body="An investigation is a public question about a rock or site. When one is opened, anyone can vote and add what they observed. Nobody has opened one yet."
                  />
                ) : (
                  investigations.map((inv) => (
                    <InvestigationCard
                      key={inv.public_id}
                      investigation={inv}
                      canContribute={Boolean(viewer)}
                      onRequireSignIn={onRequestLogin}
                      onVoted={load}
                      onEdit={
                        inv.viewer_is_owner ? () => setEditingInvestigation(inv) : undefined
                      }
                    />
                  ))
                )}
              </section>
            </>
          )}

          {/* ============================ MY QUESTIONS ========================= */}
          {panel === 'questions' && (
            <MyQuestionsPanel
              viewer={viewer}
              onOpenPost={onOpenPost}
              onRequestLogin={onRequestLogin}
            />
          )}

          {/* =========================== REPUTATION ============================ */}
          {panel === 'reputation' && (
            <section className="space-y-4">
              {reputation ? (
                <>
                  <div className="p-5 rounded-xl bg-white/60 border border-[#e3e3e3]">
                    <div className="flex items-center gap-2 mb-4">
                      <Award className="w-5 h-5 text-[#9f6108]" />
                      <span className="text-lg font-semibold text-[#1f1f1f]">
                        {viewer?.display_name || reputation.public_handle}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <Stat label="Observations" value={reputation.observations_count} />
                      <Stat label="Evidence" value={reputation.evidence_count} />
                      <Stat label="Votes" value={reputation.votes_count} />
                      <Stat label="Investigations" value={reputation.investigations_count} />
                      <Stat label="Questions" value={reputation.questions_count} />
                      <Stat label="Answers" value={reputation.answers_count} />
                      <Stat label="Visits" value={reputation.visits_count} />
                      <Stat label="Districts" value={reputation.districts_represented} />
                    </div>

                    <p className="text-xs text-[#5e5e5e] mt-4 leading-relaxed">
                      {reputation.disclaimer}
                    </p>
                  </div>

                  {reputation.achievements.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-[#1f1f1f]">Achievements</h3>
                      {reputation.achievements.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#f0f4f9] border border-[#e3e3e3]"
                        >
                          <div>
                            <div className="text-sm text-[#1f1f1f]">{a.label}</div>
                            <div className="text-xs text-[#8f8f8f]">{a.description}</div>
                          </div>
                          {a.earned && (
                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#c4eed0] text-[#2b7f3f] border border-[#2b7f3f]/40">
                              Earned
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <EmptyState
                  title="No contribution record for this browser"
                  body="Contributions are recognised through a random token stored in this browser only. Clearing site data or switching browsers will start a new, empty record. There is no account to recover."
                />
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="p-3 rounded-xl bg-[#f0f4f9] border border-[#e3e3e3]">
    <div className="text-xl font-semibold text-[#1f1f1f]">{value}</div>
    <div className="text-xs text-[#5e5e5e]">{label}</div>
  </div>
);

const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  intro: React.ReactNode;
  note: React.ReactNode;
}> = ({ icon, title, intro, note }) => (
  <header className="space-y-2">
    <div className="flex items-center gap-2">
      {icon}
      <h2 className="text-2xl font-medium text-[#1f1f1f]">{title}</h2>
    </div>
    <p className="text-sm text-[#5e5e5e] max-w-3xl leading-relaxed">{intro}</p>
    <div className="p-3 rounded-xl bg-[#f0f4f9] border border-[#e3e3e3] text-xs text-[#5e5e5e]">
      <span className="font-semibold text-[#3c4043]">Privacy: </span>
      {note}
    </div>
  </header>
);

const EmptyState: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div className="p-8 rounded-xl bg-white/40 border border-dashed border-[#c7c7c7] text-center">
    <div className="text-base font-medium text-[#3c4043]">{title}</div>
    <p className="text-sm text-[#8f8f8f] mt-2 max-w-xl mx-auto leading-relaxed">{body}</p>
  </div>
);

const CategoryChip: React.FC<{ category: string | null }> = ({ category }) => {
  if (!category) return null;
  const label = CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ');
  return <span className="g-chip">{label}</span>;
};

/** Thumbnails for attached community media. */
const MediaStrip: React.FC<{ mediaIds: string[]; alt: string }> = ({ mediaIds, alt }) => {
  if (mediaIds.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {mediaIds.map((id) => (
        <a
          key={id}
          href={communityMediaSrc(id)}
          target="_blank"
          rel="noreferrer noopener"
          className="block w-20 h-20 rounded-lg overflow-hidden border border-[#e3e3e3] bg-[#f0f4f9]"
        >
          <img
            src={communityMediaSrc(id)}
            alt={alt}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        </a>
      ))}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Composer
// -----------------------------------------------------------------------------

interface ComposerPayload {
  text: string;
  context: string | null;
  category: string | null;
  siteId: string | null;
  options: string[];
  checklist: string[];
  researchInterest: boolean;
  requestedExpert: boolean;
  mediaIds: string[];
}

interface Attachment {
  file: File;
  preview: string;
}

/** Prefilled values when editing an already-published investigation. */
interface ComposerInitial {
  text: string;
  context: string;
  category: string | null;
  siteId: string;
  options: string[];
  checklist: string[];
  researchInterest: boolean;
}

const MAX_ATTACHMENTS = 3;

const CommunityComposer: React.FC<{
  kind: 'investigation' | 'question';
  sites: PublicSiteSummary[];
  onCancel: () => void;
  onSubmit: (payload: ComposerPayload) => Promise<string>;
  /** When provided, the composer edits an existing investigation instead of
   *  creating one: site is fixed and attachments are not offered. */
  initial?: ComposerInitial;
}> = ({ kind, sites, onCancel, onSubmit, initial }) => {
  const isInvestigation = kind === 'investigation';
  const isEdit = Boolean(initial);
  const [text, setText] = useState(initial?.text ?? '');
  const [context, setContext] = useState(initial?.context ?? '');
  const [category, setCategory] = useState<string>(initial?.category ?? '');
  const [siteId, setSiteId] = useState<string>(initial?.siteId ?? sites[0]?.site_id ?? '');
  const [survey, setSurvey] = useState(Boolean(initial && initial.options.length > 0));
  const [options, setOptions] = useState<string[]>(
    initial && initial.options.length > 0 ? initial.options : ['', '']
  );
  const [checklist, setChecklist] = useState<string[]>(initial?.checklist ?? []);
  const [researchInterest, setResearchInterest] = useState(initial?.researchInterest ?? false);
  const [requestedExpert, setRequestedExpert] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!siteId && sites.length > 0) setSiteId(sites[0].site_id);
  }, [sites, siteId]);

  useEffect(() => () => attachments.forEach((a) => URL.revokeObjectURL(a.preview)), [attachments]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
      next.push({ file, preview: URL.createObjectURL(file) });
    }
    setAttachments((prev) => [...prev, ...next].slice(0, MAX_ATTACHMENTS));
  };

  const handleSubmit = async () => {
    if (!text.trim()) {
      setError(isInvestigation ? 'Write the question you want settled.' : 'Write your question first.');
      return;
    }
    if (!siteId) {
      setError('Choose the site or area this is about.');
      return;
    }
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (isInvestigation && survey && cleanOptions.length < 2) {
      setError('A survey needs at least two answer choices.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const media = await Promise.all(
        attachments.map((a) => uploadCommunityMedia(a.file))
      );
      const cleanChecklist = checklist.map((item) => item.trim()).filter(Boolean);
      const ref = await onSubmit({
        text: text.trim(),
        context: context.trim() || null,
        category: category || null,
        siteId,
        options: isInvestigation && survey ? cleanOptions : [],
        checklist: isInvestigation ? cleanChecklist : [],
        researchInterest,
        requestedExpert,
        mediaIds: media.map((m) => m.id),
      });
      setReference(ref);
      setText('');
      setContext('');
      setAttachments([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'That could not be submitted. Nothing was saved.');
    } finally {
      setBusy(false);
    }
  };

  const fieldClass =
    'w-full px-3 py-2 rounded-lg bg-[#f8fafd] border border-[#c7c7c7] text-[#1f1f1f] text-sm placeholder-[#8f8f8f] focus:outline-none focus:ring-1 focus:ring-emerald-500/40';

  return (
    <div className="p-5 rounded-xl bg-white/70 border border-[#c7c7c7] space-y-4">
      <h3 className="text-sm font-semibold text-[#1f1f1f]">
        {isEdit
          ? 'Edit this investigation'
          : isInvestigation
            ? 'Open an investigation'
            : 'Ask a geological question'}
      </h3>

      <div>
        <label className="block text-xs font-medium text-[#3c4043] mb-1.5">
          {isInvestigation ? 'What should the community settle?' : 'Your question'}
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            isInvestigation ? 'Example: Is this basalt or granite?' : 'Example: What mineral makes this green colour?'
          }
          maxLength={500}
          rows={2}
          className={`${fieldClass} resize-y`}
        />
        <div className="text-xs text-[#8f8f8f] text-right mt-0.5">{text.length} / 500</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[#3c4043] mb-1.5">Site or area</label>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            disabled={isEdit}
            className={`${fieldClass} disabled:opacity-70`}
          >
            {sites.length === 0 && <option value="">No published sites available</option>}
            {sites.map((s) => (
              <option key={s.site_id} value={s.site_id}>
                {s.title}
                {s.district ? ` — ${s.district}` : ''}
              </option>
            ))}
          </select>
          {isEdit && (
            <p className="text-[11px] text-[#8f8f8f] mt-1">
              The site cannot be changed after publishing; moving it would change what earlier votes were about.
            </p>
          )}
          {!isEdit && sites.length === 0 && (
            <p className="text-[11px] text-[#8f8f8f] mt-1">
              No geological sites have been published yet. Nothing is listed before it genuinely exists, so this
              list stays empty until a real site is recorded.
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-[#3c4043] mb-1.5">Subject</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClass}>
            <option value="">Not specified</option>
            {SUBJECT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-[#3c4043] mb-1.5">
          Context <span className="font-normal text-[#8f8f8f]">(optional)</span>
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="What you saw, where you stood, what makes you unsure."
          maxLength={1000}
          rows={2}
          className={`${fieldClass} resize-y`}
        />
      </div>

      {isInvestigation && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-medium text-[#3c4043]">
            <input
              type="checkbox"
              checked={survey}
              onChange={(e) => setSurvey(e.target.checked)}
              className="rounded border-[#c7c7c7]"
            />
            Give fixed answer choices (a survey)
          </label>
          {survey && (
            <div className="space-y-2 pl-1">
              {options.map((opt, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    value={opt}
                    onChange={(e) =>
                      setOptions((prev) => prev.map((o, i) => (i === index ? e.target.value : o)))
                    }
                    maxLength={80}
                    placeholder={`Choice ${index + 1}`}
                    className={fieldClass}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOptions((prev) => prev.filter((_, i) => i !== index))}
                      className="p-1.5 rounded-lg text-[#8f8f8f] hover:text-[#d32f28] hover:bg-[#ffdad8]"
                      aria-label="Remove choice"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {options.length < 8 && (
                <button
                  type="button"
                  onClick={() => setOptions((prev) => [...prev, ''])}
                  className="text-xs text-[#0b57d0] hover:underline"
                >
                  + Add another choice
                </button>
              )}
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-[#3c4043]">
            <input
              type="checkbox"
              checked={researchInterest}
              onChange={(e) => setResearchInterest(e.target.checked)}
              className="rounded border-[#c7c7c7]"
            />
            Flag as a research opportunity
          </label>

          <div className="space-y-2 pt-1 border-t border-[#e5e7eb]">
            <label className="block text-xs font-medium text-[#3c4043] pt-2">
              Evidence checklist <span className="font-normal text-[#8f8f8f]">(optional)</span>
            </label>
            <p className="text-[11px] text-[#8f8f8f]">
              List what you would need to settle this. Others can mark which items they can provide.
            </p>
            {checklist.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={item}
                  onChange={(e) =>
                    setChecklist((prev) => prev.map((v, i) => (i === index ? e.target.value : v)))
                  }
                  maxLength={120}
                  placeholder={`e.g. a clear close-up of a fresh surface`}
                  className={fieldClass}
                />
                <button
                  type="button"
                  onClick={() => setChecklist((prev) => prev.filter((_, i) => i !== index))}
                  className="p-1.5 rounded-lg text-[#8f8f8f] hover:text-[#d32f28] hover:bg-[#ffdad8]"
                  aria-label="Remove checklist item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {checklist.length < 8 && (
              <button
                type="button"
                onClick={() => setChecklist((prev) => [...prev, ''])}
                className="text-xs text-[#0b57d0] hover:underline"
              >
                + Add an evidence request
              </button>
            )}
          </div>
        </div>
      )}

      {!isInvestigation && (
        <label className="flex items-center gap-2 text-xs text-[#3c4043]">
          <input
            type="checkbox"
            checked={requestedExpert}
            onChange={(e) => setRequestedExpert(e.target.checked)}
            className="rounded border-[#c7c7c7]"
          />
          Request an answer from a qualified practitioner
        </label>
      )}

      {/* Attachments are added once, at open time; an edit corrects the text. */}
      {!isEdit && (
      <div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachments.length >= MAX_ATTACHMENTS}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#eef1f6] hover:bg-[#e3e3e3] disabled:opacity-50 text-[#3c4043] text-xs font-medium"
          >
            <ImagePlus className="w-4 h-4" />
            Add photo
          </button>
          <span className="text-[11px] text-[#8f8f8f]">
            Up to {MAX_ATTACHMENTS} images. Files are validated and, on a live deployment, reviewed before display.
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/mp4"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {attachments.map((a, index) => (
              <div key={index} className="relative w-16 h-16 rounded-lg overflow-hidden border border-[#e3e3e3]">
                <img src={a.preview} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                  className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white"
                  aria-label="Remove attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[#ffdad8] border border-rose-500/30 text-[#d32f28] text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {reference && (
        <div className="p-3 rounded-lg bg-[#c4eed0] border border-[#2b7f3f]/30 text-[#2b7f3f] text-xs">
          {isEdit ? 'Saved. ' : 'Created. '}
          {isEdit ? (
            <span>Your correction is now shown to everyone.</span>
          ) : (
            <>
              Reference: <span className="font-mono font-semibold">{reference}</span>
            </>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2b7f3f] hover:bg-[#257036] disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          <Send className="w-4 h-4" />
          {busy
            ? 'Submitting…'
            : isEdit
              ? 'Save changes'
              : isInvestigation
                ? 'Open investigation'
                : 'Post question'}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-[#eef1f6] hover:bg-[#e3e3e3] text-[#3c4043] text-sm font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Investigation card
// -----------------------------------------------------------------------------

interface InvestigationCardProps {
  investigation: PublicInvestigationSummary;
  canContribute: boolean;
  onRequireSignIn?: () => void;
  onVoted: () => void;
  /** Present only when this browser opened the investigation. */
  onEdit?: () => void;
}

const InvestigationCard: React.FC<InvestigationCardProps> = ({
  investigation,
  canContribute,
  onRequireSignIn,
  onVoted,
  onEdit,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [vote, setVote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState(investigation.checklist);
  const [checkBusy, setCheckBusy] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  // The detail (with its evidence) is loaded only once the card is opened, the
  // same lazy pattern the question card uses for its answers.
  const [detail, setDetail] = useState<PublicInvestigationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [evidenceType, setEvidenceType] = useState<CommunityEvidenceType>('close_up');
  const [evidenceText, setEvidenceText] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceNotice, setEvidenceNotice] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const evidenceFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setChecklist(investigation.checklist), [investigation.checklist]);

  const isSurvey = investigation.options.length > 0;

  const loadDetail = useCallback(async () => {
    setLoadingDetail(true);
    try {
      setDetail(await fetchInvestigation(investigation.public_id));
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [investigation.public_id]);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail) void loadDetail();
  };

  const handleEvidence = async () => {
    if (!canContribute) {
      onRequireSignIn?.();
      return;
    }
    if (!evidenceText.trim()) {
      setEvidenceError('Describe what you observed first.');
      return;
    }
    setEvidenceBusy(true);
    setEvidenceError(null);
    setEvidenceNotice(null);
    try {
      let mediaIds: string[] = [];
      if (evidenceFile) {
        const media = await uploadCommunityMedia(evidenceFile);
        mediaIds = [media.id];
      }
      await submitEvidence({
        investigationId: investigation.public_id,
        evidenceType,
        explanation: evidenceText.trim(),
        mediaIds,
      });
      setEvidenceText('');
      setEvidenceFile(null);
      if (evidenceFileRef.current) evidenceFileRef.current.value = '';
      setEvidenceNotice('Your evidence was recorded for this investigation.');
      await loadDetail();
      onVoted();
    } catch (err: unknown) {
      setEvidenceError(err instanceof Error ? err.message : 'Your evidence was not recorded.');
    } finally {
      setEvidenceBusy(false);
    }
  };

  const toggleCheck = async (itemId: string, checked: boolean) => {
    if (!canContribute) {
      onRequireSignIn?.();
      return;
    }
    setCheckBusy(itemId);
    setError(null);
    try {
      const result = await checkChecklistItem(investigation.public_id, itemId, checked);
      setChecklist((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, viewer_checked: result.checked, check_count: result.check_count }
            : item
        )
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Your check was not recorded.');
    } finally {
      setCheckBusy(null);
    }
  };

  const handleVote = async () => {
    if (!canContribute) {
      onRequireSignIn?.();
      return;
    }
    if (!vote.trim()) {
      setError(isSurvey ? 'Choose an option before voting.' : 'Enter your view before voting.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await castVote(investigation.public_id, vote.trim());
      setMessage(result.message);
      setVote('');
      onVoted();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Your vote was not recorded.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-white/60 border border-[#e3e3e3] space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-[#8f8f8f]">{investigation.public_id}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#eef1f6] border border-[#c7c7c7] text-[#3c4043]">
              {investigationStatusLabel(investigation.status)}
            </span>
            {isSurvey && (
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#e6f4ea] text-[#2b7f3f] border border-[#2b7f3f]/30">
                Survey
              </span>
            )}
            {investigation.research_interest && (
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#f3e8fd] text-[#7627bb] border border-[#7627bb]/30">
                Research interest
              </span>
            )}
            {investigation.is_demo && (
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#fff3d7] text-[#9f6108] border border-[#9f6108]/30">
                Demo
              </span>
            )}
          </div>
          <p className="text-sm text-[#1f1f1f] mt-1.5">{investigation.question}</p>
          {investigation.context && (
            <p className="text-xs text-[#5e5e5e] mt-1 leading-relaxed">{investigation.context}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <CategoryChip category={investigation.category} />
          </div>
          <MediaStrip mediaIds={investigation.media_ids} alt="Investigation attachment" />
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-[#8f8f8f]">
            <span>{investigation.participant_count} participant(s)</span>
            <span>{investigation.vote_count} vote(s)</span>
            <span>{investigation.evidence_count} evidence item(s)</span>
            {investigation.opened_by_handle && <span>opened by {investigation.opened_by_handle}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onEdit && (
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[#0b57d0] hover:bg-[#eef1f6] text-xs font-medium transition-colors"
              aria-label="Edit investigation"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
          <button
            onClick={() => setReporting(true)}
            className="p-1.5 rounded-lg text-[#b3261e] hover:bg-[#ffdad8] transition-colors shrink-0"
            aria-label="Report this investigation"
            title="Report this investigation"
          >
            <Flag className="w-4 h-4" />
          </button>
          <button
            onClick={toggle}
            className="p-1.5 rounded-lg text-[#5e5e5e] hover:text-[#1f1f1f] hover:bg-[#eef1f6] transition-colors shrink-0"
            aria-label={expanded ? 'Hide vote options, evidence and discussion' : 'Show vote options, evidence and discussion'}
          >
            {expanded ? <ChevronRight className="w-4 h-4 rotate-90" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {reporting && (
        <ReportDialog
          isOpen
          onClose={() => setReporting(false)}
          targetType="investigation"
          targetId={investigation.public_id}
          targetLabel={investigation.question}
        />
      )}

      {investigation.vote_distribution.length > 0 && (
        <div className="space-y-1.5">
          {investigation.vote_distribution.map((tally) => (
            <div key={tally.option} className="flex items-center gap-2 text-xs">
              <span className="w-40 truncate text-[#5e5e5e]" title={tally.option}>
                {tally.option}
              </span>
              <div className="flex-1 h-2 rounded-full bg-[#eef1f6] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#0b57d0]"
                  style={{ width: `${Math.min(100, tally.share_pct)}%` }}
                />
              </div>
              <span className="w-16 text-right text-[#8f8f8f]">
                {tally.count} ({tally.share_pct}%)
              </span>
            </div>
          ))}
        </div>
      )}

      {checklist.length > 0 && (
        <div className="pt-2 space-y-1.5 border-t border-[#e3e3e3]">
          <p className="text-xs font-medium text-[#3c4043]">What the community can provide</p>
          <p className="text-[11px] text-[#8f8f8f]">
            Tick an item to say you can provide it. This is not a verification.
          </p>
          {checklist.map((item) => (
            <label
              key={item.id}
              className="flex items-start gap-2 text-sm text-[#3c4043] cursor-pointer"
            >
              <input
                type="checkbox"
                checked={item.viewer_checked}
                disabled={checkBusy === item.id}
                onChange={(e) => toggleCheck(item.id, e.target.checked)}
                className="mt-0.5 rounded border-[#c7c7c7]"
              />
              <span className="flex-1">{item.text}</span>
              <span className="text-xs text-[#8f8f8f] shrink-0">{item.check_count} can provide</span>
            </label>
          ))}
        </div>
      )}

      {expanded && (
        <div className="pt-2 space-y-2 border-t border-[#e3e3e3]">
          <div className="text-xs text-[#5e5e5e]">
            {isSurvey
              ? 'Choose the option you agree with. Your vote is counted once; changing it replaces your earlier vote.'
              : 'Add your view. Your vote is counted once; changing it replaces your earlier vote.'}
          </div>

          {!canContribute && <SignedOutNotice onSignIn={() => onRequireSignIn?.()} verb="vote" />}

          {isSurvey ? (
            <div className="space-y-1.5">
              {investigation.options.map((option) => (
                <label
                  key={option}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${
                    vote === option
                      ? 'border-[#0b57d0] bg-[#e8f0fe] text-[#1f1f1f]'
                      : 'border-[#c7c7c7] bg-white text-[#3c4043] hover:bg-[#f0f4f9]'
                  }`}
                >
                  <input
                    type="radio"
                    name={`vote-${investigation.public_id}`}
                    value={option}
                    checked={vote === option}
                    onChange={(e) => setVote(e.target.value)}
                    disabled={!canContribute}
                  />
                  <span>{option}</span>
                </label>
              ))}
              <button
                onClick={handleVote}
                disabled={busy}
                className="inline-flex items-center gap-2 mt-1 px-4 py-2 rounded-lg bg-[#0b57d0] hover:bg-[#0a4fbb] disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                <ThumbsUp className="w-4 h-4" />
                {busy ? 'Recording…' : 'Vote'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={vote}
                onChange={(e) => setVote(e.target.value)}
                placeholder="Your reading or opinion"
                maxLength={80}
                disabled={!canContribute}
                className="flex-1 px-3 py-2 rounded-lg bg-[#f8fafd] border border-[#c7c7c7] text-[#1f1f1f] text-sm placeholder-[#8f8f8f] focus:outline-none focus:ring-1 focus:ring-sky-500/40"
              />
              <button
                onClick={handleVote}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0b57d0] hover:bg-[#0a4fbb] disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                <ThumbsUp className="w-4 h-4" />
                {busy ? 'Recording…' : 'Vote'}
              </button>
            </div>
          )}
        </div>
      )}

      {expanded && (
        <div className="pt-2 space-y-2 border-t border-[#e3e3e3]">
          <p className="text-xs font-medium text-[#3c4043]">Evidence gathered</p>
          {loadingDetail ? (
            <div className="flex items-center gap-2 text-xs text-[#8f8f8f]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading evidence…
            </div>
          ) : detail && detail.evidence.length > 0 ? (
            <div className="space-y-2">
              {detail.evidence.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg border bg-[#f8fafd] border-[#e3e3e3]"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#5e5e5e]">
                    <span className="font-medium text-[#3c4043]">
                      {EVIDENCE_TYPE_LABELS[item.evidence_type] ??
                        item.evidence_type.replace(/_/g, ' ')}
                    </span>
                    {item.supports_evidence && (
                      <span className="px-1.5 py-0.5 rounded bg-[#e6f4ea] text-[#2b7f3f]">
                        supports
                      </span>
                    )}
                    {item.is_challenge && (
                      <span className="px-1.5 py-0.5 rounded bg-[#ffdad8] text-[#b3261e]">
                        challenges
                      </span>
                    )}
                    <span className="text-[#c7c7c7]">·</span>
                    <span>{item.contributor_handle}</span>
                    <span className="text-[#c7c7c7]">·</span>
                    <span>{new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                  {item.explanation && (
                    <p className="text-sm text-[#1f1f1f] mt-1 leading-relaxed">
                      {item.explanation}
                    </p>
                  )}
                  <MediaStrip mediaIds={item.media_ids} alt="Evidence attachment" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#8f8f8f]">
              No evidence has been added to this investigation yet.
            </p>
          )}

          {!canContribute && (
            <SignedOutNotice onSignIn={() => onRequireSignIn?.()} verb="add evidence" />
          )}

          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={evidenceType}
                onChange={(e) => setEvidenceType(e.target.value as CommunityEvidenceType)}
                disabled={!canContribute}
                aria-label="Kind of evidence"
                className="px-3 py-2 rounded-lg bg-white border border-[#c7c7c7] text-sm text-[#1f1f1f]"
              >
                {(Object.keys(EVIDENCE_TYPE_LABELS) as CommunityEvidenceType[]).map((type) => (
                  <option key={type} value={type}>
                    {EVIDENCE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#c7c7c7] bg-white text-sm text-[#3c4043] cursor-pointer">
                <ImagePlus className="w-4 h-4" />
                <span className="truncate max-w-[180px]">
                  {evidenceFile ? evidenceFile.name : 'Attach a photo (optional)'}
                </span>
                <input
                  ref={evidenceFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={!canContribute}
                  onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <textarea
              value={evidenceText}
              onChange={(e) => setEvidenceText(e.target.value)}
              placeholder="Describe what you found, and where."
              maxLength={2000}
              rows={2}
              disabled={!canContribute}
              className="w-full px-3 py-2 rounded-lg bg-[#f8fafd] border border-[#c7c7c7] text-[#1f1f1f] text-sm placeholder-[#8f8f8f] focus:outline-none focus:ring-1 focus:ring-emerald-500/40 resize-y"
            />
            <button
              onClick={handleEvidence}
              disabled={evidenceBusy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2b7f3f] hover:bg-[#257036] disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              <Send className="w-4 h-4" />
              {evidenceBusy ? 'Adding…' : 'Add evidence'}
            </button>
          </div>
          {evidenceNotice && <p className="text-xs text-[#2b7f3f]">{evidenceNotice}</p>}
          {evidenceError && (
            <p className="text-xs text-[#d32f28] flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" />
              {evidenceError}
            </p>
          )}
        </div>
      )}

      {message && (
        <p className="text-xs text-[#2b7f3f] flex items-center gap-1.5">
          <ExternalLink className="w-3 h-3" />
          {message}
        </p>
      )}
      {error && (
        <p className="text-xs text-[#d32f28] flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3" />
          {error}
        </p>
      )}

      <p className="text-[11px] text-[#8f8f8f] leading-relaxed">{investigation.disclaimer}</p>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Question card
// -----------------------------------------------------------------------------

interface QuestionCardProps {
  question: PublicQuestionSummary;
  canContribute: boolean;
  onRequireSignIn?: () => void;
  onAnswered: () => void;
}

const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  canContribute,
  onRequireSignIn,
  onAnswered,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<PublicQuestionDetail | null>(null);
  const [loadingAnswers, setLoadingAnswers] = useState(false);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const loadAnswers = useCallback(async () => {
    setLoadingAnswers(true);
    try {
      setDetail(await fetchQuestion(question.public_id));
    } catch {
      setDetail(null);
    } finally {
      setLoadingAnswers(false);
    }
  }, [question.public_id]);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail) void loadAnswers();
  };

  const handleAnswer = async () => {
    if (!canContribute) {
      onRequireSignIn?.();
      return;
    }
    if (!answer.trim()) {
      setError('Write your answer first.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await postAnswer(question.public_id, answer.trim());
      setAnswer('');
      setNotice('Your answer was posted.');
      await loadAnswers();
      onAnswered();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Your answer was not posted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-white/60 border border-[#e3e3e3]">
      <div className="flex items-start gap-3">
        <MessageCircleQuestion className="w-4 h-4 text-[#8f8f8f] mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[#1f1f1f]">{question.question}</p>
          {question.context && (
            <p className="text-xs text-[#5e5e5e] mt-1 leading-relaxed">{question.context}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <CategoryChip category={question.category} />
            {question.requested_expert && (
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#e8f0fe] text-[#0b57d0] border border-[#0b57d0]/30 inline-flex items-center gap-1">
                <BadgeCheck className="w-3 h-3" />
                Expert answer requested
              </span>
            )}
          </div>
          <MediaStrip mediaIds={question.media_ids} alt="Question attachment" />
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-[#8f8f8f]">
            <span className="font-mono">{question.public_id}</span>
            {question.is_demo && (
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#fff3d7] text-[#9f6108] border border-[#9f6108]/30">
                Demo
              </span>
            )}
            <span>asked by {question.asked_by_handle}</span>
            <span>
              {question.answer_count} answer(s) · {question.vote_count} vote(s)
            </span>
          </div>
        </div>
        <button
          onClick={() => setReporting(true)}
          className="p-1.5 rounded-lg text-[#b3261e] hover:bg-[#ffdad8] transition-colors shrink-0"
          aria-label="Report this question"
          title="Report this question"
        >
          <Flag className="w-4 h-4" />
        </button>
        <button
          onClick={toggle}
          className="p-1.5 rounded-lg text-[#5e5e5e] hover:text-[#1f1f1f] hover:bg-[#eef1f6] transition-colors shrink-0"
          aria-label={expanded ? 'Hide answers' : 'Show answers'}
        >
          {expanded ? <ChevronRight className="w-4 h-4 rotate-90" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {reporting && (
        <ReportDialog
          isOpen
          onClose={() => setReporting(false)}
          targetType="question"
          targetId={question.public_id}
          targetLabel={question.question}
        />
      )}

      {expanded && (
        <div className="mt-3 pt-3 border-t border-[#e3e3e3] space-y-3">
          {loadingAnswers ? (
            <div className="flex items-center gap-2 text-xs text-[#8f8f8f]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading answers…
            </div>
          ) : detail && detail.answers.length > 0 ? (
            <div className="space-y-2">
              {detail.answers.map((a) => (
                <div
                  key={a.id}
                  className={`p-3 rounded-lg border ${
                    a.is_expert ? 'bg-[#e6f4ea] border-[#2b7f3f]/30' : 'bg-[#f8fafd] border-[#e3e3e3]'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs text-[#5e5e5e]">
                    {a.is_expert ? (
                      <span className="inline-flex items-center gap-1 text-[#2b7f3f] font-medium">
                        <BadgeCheck className="w-3.5 h-3.5" />
                        Expert answer
                      </span>
                    ) : (
                      <span>{a.contributor_handle}</span>
                    )}
                    <span className="text-[#c7c7c7]">·</span>
                    <span>{new Date(a.created_at).toLocaleDateString()}</span>
                  </div>
                  {a.is_expert && a.contributor_handle && (
                    <div className="text-[11px] text-[#5e5e5e] mt-0.5">by {a.contributor_handle}</div>
                  )}
                  <p className="text-sm text-[#1f1f1f] mt-1 leading-relaxed">{a.answer}</p>
                  <MediaStrip mediaIds={a.media_ids} alt="Answer attachment" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#8f8f8f]">No answers yet.</p>
          )}

          {!canContribute && <SignedOutNotice onSignIn={() => onRequireSignIn?.()} verb="answer" />}

          <div className="space-y-2">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Write what you know about this."
              maxLength={2000}
              rows={2}
              disabled={!canContribute}
              className="w-full px-3 py-2 rounded-lg bg-[#f8fafd] border border-[#c7c7c7] text-[#1f1f1f] text-sm placeholder-[#8f8f8f] focus:outline-none focus:ring-1 focus:ring-emerald-500/40 resize-y"
            />
            <button
              onClick={handleAnswer}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2b7f3f] hover:bg-[#257036] disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              <Send className="w-4 h-4" />
              {busy ? 'Posting…' : 'Post answer'}
            </button>
            {notice && <p className="text-xs text-[#2b7f3f]">{notice}</p>}
            {error && (
              <p className="text-xs text-[#d32f28] flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" />
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
