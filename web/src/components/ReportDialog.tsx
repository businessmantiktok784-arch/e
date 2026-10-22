import React, { useEffect, useState } from 'react';
import { Flag, Loader2, X } from 'lucide-react';
import { reportContent } from '../services/postsApi.js';
import {
  ABUSE_REPORT_REASON_LABEL,
  ABUSE_REPORT_REASONS,
  type AbuseReportReason,
  type AbuseReportTargetType,
} from '../types/communityPosts.js';

interface ReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: AbuseReportTargetType;
  targetId: string;
  /** The reported observation's passport id, when the target sits on a post. */
  observationPassportId?: string | null;
  /** A short label for what is being reported, shown to the reader. */
  targetLabel?: string;
}

/**
 * Report a post, a question or a comment.
 *
 * A report is an allegation. This dialog is deliberately plain: it gathers a
 * reason and optional detail, files the report, and says so. It never hides the
 * content and never suggests the report has been upheld.
 */
export const ReportDialog: React.FC<ReportDialogProps> = ({
  isOpen,
  onClose,
  targetType,
  targetId,
  observationPassportId,
  targetLabel,
}) => {
  const [reason, setReason] = useState<AbuseReportReason>('incorrect_information');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicId, setPublicId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason('incorrect_information');
      setDetails('');
      setSubmitting(false);
      setError(null);
      setPublicId(null);
    }
  }, [isOpen, targetId]);

  if (!isOpen) return null;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await reportContent({
        target_type: targetType,
        target_id: targetId,
        reason_code: reason,
        details: details.trim() || null,
        observation_passport_id: observationPassportId ?? null,
      });
      setPublicId(result.report.public_id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Your report could not be filed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0b0c]/60 p-4"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-[#e3e3e3] bg-white text-[#1f1f1f] shadow-[var(--g-elev-3)]">
        <div className="flex items-center justify-between border-b border-[#e3e3e3] px-6 py-4">
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-[#b3261e]" aria-hidden="true" />
            <h3 className="text-base font-medium">Report</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="g-icon-btn">
            <X className="w-5 h-5" />
          </button>
        </div>

        {publicId ? (
          <div className="space-y-4 p-6">
            <p className="text-sm leading-relaxed text-[#3c4043]">
              Thank you. Your report has been recorded for review under reference{' '}
              <span className="font-mono text-[#0b57d0]">{publicId}</span>.
            </p>
            <p className="text-xs leading-relaxed text-[#5e5e5e]">
              A report is an allegation. It does not by itself change what is shown, and it is never
              counted as community agreement.
            </p>
            <button type="button" onClick={onClose} className="g-btn g-btn-filled w-full h-10">
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-4 p-6">
            <p className="text-sm leading-relaxed text-[#5e5e5e]">
              Reporting {targetLabel ? <span className="font-medium text-[#1f1f1f]">{targetLabel}</span> : 'this content'}.
              Tell us what is wrong. Anyone can report, signed in or not.
            </p>

            <label className="block space-y-1.5">
              <span className="g-section-label">Reason</span>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as AbuseReportReason)}
                className="g-input h-10 text-sm"
              >
                {ABUSE_REPORT_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {ABUSE_REPORT_REASON_LABEL[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="g-section-label">Details (optional)</span>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Add anything that helps a reviewer understand the problem."
                className="g-textarea min-h-[80px] text-sm p-2"
              />
            </label>

            {error && (
              <div className="rounded-lg bg-[#ffdad8] border border-[#b3261e]/30 px-3 py-2 text-[13px] text-[#8c1d18]">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="g-btn g-btn-text h-10 px-4">
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="g-btn h-10 px-4 text-white"
                style={{ background: 'var(--g-danger)' }}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Flag className="w-4 h-4" aria-hidden="true" />
                )}
                <span>File report</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
