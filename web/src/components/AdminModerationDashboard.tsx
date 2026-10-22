import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Flag,
  Loader2,
  LogOut,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import type { ExpertUser } from '../types/expert.js';
import {
  fetchAbuseReports,
  fetchModerationComments,
  moderateCommunityComment,
  resolveAbuseReport,
  type AbuseReportStatus,
  type AdminAbuseReport,
  type AdminModerationComment,
  type CommentModerationStatus,
} from '../services/adminApi.js';

interface AdminModerationDashboardProps {
  currentUser: ExpertUser;
  onLogout: () => void;
}

type Tab = 'reports' | 'comments';

const REPORT_STATUS_LABELS: Record<AbuseReportStatus, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  actioned: 'Actioned',
  dismissed: 'Dismissed',
};

const REPORT_STATUS_STYLE: Record<AbuseReportStatus, string> = {
  open: 'bg-[#fef7e0] text-[#9f6108] border-[#9f6108]/30',
  acknowledged: 'bg-[#e8f0fe] text-[#0b57d0] border-[#0b57d0]/30',
  actioned: 'bg-[#e6f4ea] text-[#2b7f3f] border-[#2b7f3f]/30',
  dismissed: 'bg-[#eef1f6] text-[#5e5e5e] border-[#c7c7c7]',
};

/**
 * MODERATION - the Super Admin's queue for community abuse reports.
 *
 * Reports were accepted and never read back until this screen existed. It shows
 * the queue, lets the owner record a decision that is attributed to the session,
 * and states plainly that a report is an allegation that changes nothing on its
 * own. A second tab covers the comment moderation queue that the backend already
 * exposed but no screen consumed.
 */
export const AdminModerationDashboard: React.FC<AdminModerationDashboardProps> = ({
  currentUser,
  onLogout,
}) => {
  const [tab, setTab] = useState<Tab>('reports');

  const [reports, setReports] = useState<AdminAbuseReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [reportFilter, setReportFilter] = useState<AbuseReportStatus | 'all'>('open');
  const [selected, setSelected] = useState<AdminAbuseReport | null>(null);

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    setReportsError(null);
    try {
      setReports(await fetchAbuseReports());
    } catch (err: unknown) {
      setReportsError(err instanceof Error ? err.message : 'The report queue could not be loaded.');
    } finally {
      setLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const counts = reports.reduce<Record<string, number>>((acc, report) => {
    acc[report.status] = (acc[report.status] ?? 0) + 1;
    return acc;
  }, {});
  const visibleReports =
    reportFilter === 'all' ? reports : reports.filter((r) => r.status === reportFilter);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-medium text-[#1f1f1f] flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#b3261e]" aria-hidden="true" />
            Moderation
          </h2>
          <p className="mt-1 text-[12px] text-[#5e5e5e] max-w-2xl leading-relaxed">
            Community abuse reports and flagged discussion. A report is an allegation: filing it never
            changed what was shown, and resolving it records who decided and why.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[#5e5e5e]">{currentUser.email}</span>
          <button type="button" onClick={onLogout} className="g-btn g-btn-text h-9 px-3 text-[12px]">
            <LogOut className="w-3.5 h-3.5" />
            Log out
          </button>
        </div>
      </header>

      <div className="flex items-center gap-1 border-b border-[#e3e3e3]">
        {(['reports', 'comments'] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-[#0b57d0] text-[#0b57d0]'
                : 'border-transparent text-[#5e5e5e] hover:text-[#1f1f1f]'
            }`}
          >
            {id === 'reports' ? 'Abuse reports' : 'Comment queue'}
          </button>
        ))}
      </div>

      {tab === 'reports' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(['open', 'acknowledged', 'actioned', 'dismissed', 'all'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setReportFilter(value)}
                aria-pressed={reportFilter === value}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${
                  reportFilter === value
                    ? 'bg-[#e8f0fe] border-[#0b57d0] text-[#0b57d0]'
                    : 'bg-white border-[#c7c7c7] text-[#5e5e5e] hover:bg-[#f0f4f9]'
                }`}
              >
                {value === 'all' ? 'All' : REPORT_STATUS_LABELS[value]}
                {value !== 'all' && counts[value] ? ` (${counts[value]})` : ''}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void loadReports()}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] text-[#5e5e5e] hover:bg-[#f0f4f9] transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingReports ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {loadingReports ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[#5e5e5e] text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading reports…
            </div>
          ) : reportsError ? (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[#ffdad8] border border-rose-500/30 text-[#d32f28] text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{reportsError}</span>
            </div>
          ) : visibleReports.length === 0 ? (
            <div className="p-8 rounded-xl bg-white/40 border border-dashed border-[#c7c7c7] text-center">
              <Flag className="w-6 h-6 text-[#8f8f8f] mx-auto" aria-hidden="true" />
              <div className="mt-2 text-base font-medium text-[#3c4043]">
                {reportFilter === 'open' ? 'No open reports' : `No ${reportFilter} reports`}
              </div>
              <p className="text-sm text-[#8f8f8f] mt-1">
                When a reader reports a record, it appears here for review.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-[#e3e3e3] overflow-hidden bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f0f4f9] text-[11px] uppercase tracking-wide text-[#5e5e5e]">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Report</th>
                    <th className="px-4 py-2.5 font-medium">Reason</th>
                    <th className="px-4 py-2.5 font-medium">Target</th>
                    <th className="px-4 py-2.5 font-medium">Filed</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleReports.map((report) => (
                    <tr
                      key={report.public_id}
                      className="border-t border-[#e3e3e3] hover:bg-[#f8fafd] cursor-pointer"
                      onClick={() => setSelected(report)}
                    >
                      <td className="px-4 py-2.5 font-mono text-[12px] text-[#3c4043]">
                        {report.public_id}
                      </td>
                      <td className="px-4 py-2.5 text-[#1f1f1f]">{report.reason_label}</td>
                      <td className="px-4 py-2.5 text-[#5e5e5e]">
                        <span className="capitalize">{report.target_type}</span>
                        <span className="block font-mono text-[11px] text-[#8f8f8f]">
                          {report.target_id}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[#5e5e5e]">
                        {new Date(report.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block text-[11px] px-2 py-0.5 rounded-md border ${
                            REPORT_STATUS_STYLE[report.status]
                          }`}
                        >
                          {REPORT_STATUS_LABELS[report.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selected && (
            <ReportDetail
              report={selected}
              onClose={() => setSelected(null)}
              onResolved={(updated) => {
                setReports((prev) =>
                  prev.map((r) => (r.public_id === updated.public_id ? updated : r))
                );
                setSelected(updated);
              }}
            />
          )}
        </section>
      ) : (
        <CommentsTab />
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Report detail and resolution
// -----------------------------------------------------------------------------

const ReportDetail: React.FC<{
  report: AdminAbuseReport;
  onClose: () => void;
  onResolved: (report: AdminAbuseReport) => void;
}> = ({ report, onClose, onResolved }) => {
  const [status, setStatus] = useState<AbuseReportStatus>(report.status);
  const [note, setNote] = useState(report.resolution_note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setStatus(report.status);
    setNote(report.resolution_note ?? '');
    setError(null);
    setNotice(null);
  }, [report.public_id, report.status, report.resolution_note]);

  const needsNote = status === 'actioned' || status === 'dismissed';

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await resolveAbuseReport(report.public_id, { status, note: note.trim() || null });
      setNotice('The decision was recorded.');
      onResolved(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'The decision could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="g-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-medium text-[#1f1f1f]">
            Report {report.public_id}
          </h3>
          <p className="text-[12px] text-[#5e5e5e] mt-0.5">
            {report.reason_label} · {report.has_reporter_identity ? 'signed-in reporter' : 'anonymous reporter'}
          </p>
        </div>
        <button type="button" className="g-btn g-btn-text h-8 px-2 text-[12px]" onClick={onClose}>
          Close
        </button>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt className="text-[#8f8f8f]">Target</dt>
          <dd className="text-[#1f1f1f] capitalize">
            {report.target_type} <span className="font-mono text-[11px]">{report.target_id}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[#8f8f8f]">Filed</dt>
          <dd className="text-[#1f1f1f]">{new Date(report.created_at).toLocaleString()}</dd>
        </div>
      </dl>

      {report.details && (
        <div className="text-[12px]">
          <div className="text-[#8f8f8f] mb-1">What the reporter said</div>
          <p className="text-[#1f1f1f] leading-relaxed whitespace-pre-wrap">{report.details}</p>
        </div>
      )}

      {report.resolved_by && (
        <p className="text-[11px] text-[#5e5e5e]">
          Resolved by {report.resolved_by}
          {report.resolved_at ? ` on ${new Date(report.resolved_at).toLocaleString()}` : ''}.
        </p>
      )}

      <div className="pt-3 border-t border-[#e3e3e3] space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {(['open', 'acknowledged', 'actioned', 'dismissed'] as AbuseReportStatus[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              aria-pressed={status === value}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${
                status === value
                  ? 'bg-[#e8f0fe] border-[#0b57d0] text-[#0b57d0]'
                  : 'bg-white border-[#c7c7c7] text-[#5e5e5e] hover:bg-[#f0f4f9]'
              }`}
            >
              {REPORT_STATUS_LABELS[value]}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder={
            needsNote
              ? 'Explain the decision. Required to action or dismiss a report.'
              : 'Optional note for the record.'
          }
          className="w-full px-3 py-2 rounded-lg bg-[#f8fafd] border border-[#c7c7c7] text-[13px] text-[#1f1f1f] placeholder-[#8f8f8f] focus:outline-none focus:ring-1 focus:ring-sky-500/40 resize-y"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy || (needsNote && note.trim().length === 0)}
          className="g-btn g-btn-filled h-9 px-4 text-[12px] disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save decision'}
        </button>
        {notice && <p className="text-[12px] text-[#2b7f3f]">{notice}</p>}
        {error && (
          <p className="text-[12px] text-[#d32f28] flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" />
            {error}
          </p>
        )}
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Comment moderation
// -----------------------------------------------------------------------------

const CommentsTab: React.FC = () => {
  const [rows, setRows] = useState<AdminModerationComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CommentModerationStatus | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchModerationComments({ limit: 100 });
      setRows(result.rows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'The comment queue could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = filter === 'all' ? rows : rows.filter((r) => r.moderation_status === filter);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'visible', 'hidden', 'removed'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium border capitalize transition-colors ${
              filter === value
                ? 'bg-[#e8f0fe] border-[#0b57d0] text-[#0b57d0]'
                : 'bg-white border-[#c7c7c7] text-[#5e5e5e] hover:bg-[#f0f4f9]'
            }`}
          >
            {value}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] text-[#5e5e5e] hover:bg-[#f0f4f9] transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[#5e5e5e] text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading comments…
        </div>
      ) : error ? (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[#ffdad8] border border-rose-500/30 text-[#d32f28] text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="p-8 rounded-xl bg-white/40 border border-dashed border-[#c7c7c7] text-center">
          <MessageSquare className="w-6 h-6 text-[#8f8f8f] mx-auto" aria-hidden="true" />
          <div className="mt-2 text-base font-medium text-[#3c4043]">No comments in this view</div>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <CommentModerationRow key={row.comment_id} row={row} onUpdated={load} />
          ))}
        </div>
      )}
    </section>
  );
};

const CommentModerationRow: React.FC<{
  row: AdminModerationComment;
  onUpdated: () => void | Promise<void>;
}> = ({ row, onUpdated }) => {
  const [status, setStatus] = useState<CommentModerationStatus>(
    row.moderation_status === 'visible' ? 'hidden' : row.moderation_status
  );
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async (next: CommentModerationStatus) => {
    setBusy(true);
    setError(null);
    try {
      await moderateCommunityComment(row.comment_id, { moderationStatus: next, reason });
      await onUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'The comment could not be moderated.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-white border border-[#e3e3e3] space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#5e5e5e]">
        <span className="font-medium text-[#3c4043]">
          {row.author.display_name ?? row.author.public_user_id}
        </span>
        <span className="font-mono">{row.passport_id}</span>
        <span className="px-2 py-0.5 rounded-md border border-[#c7c7c7] capitalize">
          {row.moderation_status.replace(/_/g, ' ')}
        </span>
        {row.is_demo && (
          <span className="px-2 py-0.5 rounded-md bg-[#fff3d7] text-[#9f6108] border border-[#9f6108]/30">
            Demo
          </span>
        )}
        <span>{new Date(row.created_at).toLocaleString()}</span>
      </div>
      <p className="text-[13px] text-[#1f1f1f] leading-relaxed whitespace-pre-wrap">{row.body}</p>
      {row.is_demo ? (
        <p className="text-[11px] text-[#8f8f8f]">
          A demonstration comment is read-only and cannot be moderated.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(['visible', 'hidden', 'removed'] as CommentModerationStatus[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              aria-pressed={status === value}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border capitalize transition-colors ${
                status === value
                  ? 'bg-[#e8f0fe] border-[#0b57d0] text-[#0b57d0]'
                  : 'bg-white border-[#c7c7c7] text-[#5e5e5e] hover:bg-[#f0f4f9]'
              }`}
            >
              {value}
            </button>
          ))}
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="Reason (required)"
            className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg bg-[#f8fafd] border border-[#c7c7c7] text-[12px] text-[#1f1f1f] placeholder-[#8f8f8f] focus:outline-none focus:ring-1 focus:ring-sky-500/40"
          />
          <button
            type="button"
            onClick={() => apply(status)}
            disabled={busy || reason.trim().length === 0}
            className="g-btn g-btn-filled h-8 px-3 text-[12px] disabled:opacity-50"
          >
            {busy ? 'Applying…' : 'Apply'}
          </button>
        </div>
      )}
      {error && (
        <p className="text-[11px] text-[#d32f28] flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
};
