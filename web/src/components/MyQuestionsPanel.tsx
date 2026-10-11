import React, { useCallback, useEffect, useState } from 'react';
import { CornerDownRight, ExternalLink, Flag, Loader2, MessageCircleQuestion, Send } from 'lucide-react';
import { createComment, fetchMyQuestions } from '../services/postsApi.js';
import type { CommunityUser, MyDiscussionThread, PublicComment } from '../types/communityPosts.js';
import { SignedOutNotice } from './LocalAccountModal.js';
import { ReportDialog } from './ReportDialog.js';

interface MyQuestionsPanelProps {
  viewer?: CommunityUser | null;
  /** Opens the observation the thread belongs to, so the reader can see context. */
  onOpenPost?: (passportId: string) => void;
  onRequestLogin?: () => void;
}

function authorName(comment: PublicComment): string {
  return comment.author.display_name || comment.author.public_user_id;
}

function when(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * "My questions" - the reader's own discussion threads across every post.
 *
 * Each row is a question or comment the reader started, with the replies other
 * people left on it and a reply box, so the conversation can continue without
 * hunting for the post first. "Open observation" still goes to the full record.
 */
export const MyQuestionsPanel: React.FC<MyQuestionsPanelProps> = ({
  viewer,
  onOpenPost,
  onRequestLogin,
}) => {
  const [threads, setThreads] = useState<MyDiscussionThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  // The reply currently being reported, if any. Reporting a reply files an
  // allegation; it never hides or changes anything in the thread.
  const [reportTarget, setReportTarget] = useState<{ id: string; label: string } | null>(null);

  const load = useCallback(async () => {
    if (!viewer) {
      setThreads([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setThreads(await fetchMyQuestions());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not load your questions.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [viewer]);

  useEffect(() => {
    void load();
  }, [load]);

  // A reply can itself be replied to; render the whole sub-tree, not one level,
  // so a multi-step conversation stays readable on this dashboard.
  const renderReplies = (replies: PublicComment[], depth = 0): React.ReactNode =>
    replies.map((reply) => (
      <div key={reply.comment_id} style={{ marginLeft: depth > 0 ? 16 : 0 }} className="flex items-start gap-2">
        <CornerDownRight className="w-3.5 h-3.5 text-[#8f8f8f] mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-[#1f1f1f]">{authorName(reply)}</span>
            <span className="text-[11px] text-[#8f8f8f]">{when(reply.created_at)}</span>
            <button
              type="button"
              onClick={() => setReportTarget({ id: reply.comment_id, label: authorName(reply) })}
              title="Report this reply"
              aria-label="Report this reply"
              className="text-[#8f8f8f] hover:text-[#b3261e]"
            >
              <Flag className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
          <p className="text-[13px] text-[#3c4043] whitespace-pre-wrap break-words">{reply.body}</p>
          {reply.replies.length > 0 && (
            <div className="mt-2 space-y-2">{renderReplies(reply.replies, depth + 1)}</div>
          )}
        </div>
      </div>
    ));

  const sendReply = async (thread: MyDiscussionThread) => {
    const body = (drafts[thread.comment_id] ?? '').trim();
    if (!body) return;
    setSending((prev) => ({ ...prev, [thread.comment_id]: true }));
    setError(null);
    try {
      await createComment(thread.passport_id, body, thread.comment_id);
      setDrafts((prev) => ({ ...prev, [thread.comment_id]: '' }));
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not post your reply.');
    } finally {
      setSending((prev) => ({ ...prev, [thread.comment_id]: false }));
    }
  };

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <MessageCircleQuestion className="w-6 h-6 text-[#2b7f3f]" />
          <h2 className="text-2xl font-medium text-[#1f1f1f]">My questions</h2>
        </div>
        <p className="text-sm text-[#5e5e5e] max-w-3xl leading-relaxed">
          The questions and comments you have started, across every observation, with the replies people
          left on them. Answer back here, or open the observation for the full record and discussion.
        </p>
      </header>

      {!viewer ? (
        <SignedOutNotice onSignIn={() => onRequestLogin?.()} verb="see your questions" />
      ) : error ? (
        <div className="p-4 rounded-xl bg-[#fef7e0] border border-amber-500/30 text-[#9f6108] text-sm">
          {error}
        </div>
      ) : loading && threads.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-[#5e5e5e] text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading your questions…
        </div>
      ) : threads.length === 0 ? (
        <div className="p-8 rounded-xl bg-white/40 border border-dashed border-[#c7c7c7] text-center">
          <div className="text-base font-medium text-[#3c4043]">You have not asked anything yet</div>
          <p className="text-sm text-[#8f8f8f] mt-2 max-w-xl mx-auto leading-relaxed">
            Open an observation and start a discussion. Your question appears here, with every reply, so
            you can pick the conversation back up.
          </p>
        </div>
      ) : (
        threads.map((thread) => (
          <article
            key={thread.comment_id}
            className="rounded-xl border border-[#e3e3e3] bg-white p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide text-[#8f8f8f]">You asked</div>
                <p className="text-[14px] text-[#1f1f1f] mt-0.5 whitespace-pre-wrap break-words">
                  {thread.body}
                </p>
                <div className="text-[11px] text-[#8f8f8f] mt-1">{when(thread.created_at)}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[11px] text-[#5e5e5e]">
                  {thread.reply_count} {thread.reply_count === 1 ? 'reply' : 'replies'}
                </span>
                {onOpenPost && (
                  <button
                    type="button"
                    className="g-btn g-btn-text h-8 px-2 text-[12px]"
                    onClick={() => onOpenPost(thread.passport_id)}
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="max-w-[16rem] truncate">{thread.post_title}</span>
                  </button>
                )}
              </div>
            </div>

            {thread.replies.length > 0 && (
              <div className="space-y-2 border-l-2 border-[#e3e3e3] pl-3">
                {renderReplies(thread.replies)}
              </div>
            )}

            <p className="text-[10.5px] leading-snug text-[#8f8f8f]">
              Public post: your reply, your display name and the time are visible to everyone.
            </p>

            <div className="flex items-end gap-2">
              <textarea
                value={drafts[thread.comment_id] ?? ''}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [thread.comment_id]: e.target.value }))}
                rows={2}
                placeholder="Reply to this thread…"
                className="g-textarea min-h-[44px] flex-1 text-[13px]"
              />
              <button
                type="button"
                className="g-btn g-btn-filled h-9 px-3 text-[12px]"
                disabled={sending[thread.comment_id] || !(drafts[thread.comment_id] ?? '').trim()}
                onClick={() => sendReply(thread)}
              >
                {sending[thread.comment_id] ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>Reply</span>
              </button>
            </div>
          </article>
        ))
      )}

      {reportTarget && (
        <ReportDialog
          isOpen
          onClose={() => setReportTarget(null)}
          targetType="comment"
          targetId={reportTarget.id}
          targetLabel={reportTarget.label}
        />
      )}
    </section>
  );
};
