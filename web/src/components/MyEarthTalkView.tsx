import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Lock,
  MessageCircle,
  Pencil,
  Sparkles,
  Telescope,
  Trash2,
} from 'lucide-react';
import type { CommunityUser, MyPostSummary } from '../types/communityPosts.js';
import { fetchMyPosts } from '../services/postsApi.js';
import {
  clearAvatar,
  setAvatar,
  updateProfile,
  userAvatarSrc,
} from '../services/communityAuth.js';
import {
  canEditDisplayName,
  canEditDisplayNameFor,
  getLocalAccount,
  nextDisplayNameEditAt,
  nextDisplayNameEditAtFor,
  updateLocalAccountDisplayName,
} from '../services/localAccount.js';
import { categoryLabel } from '../types/community.js';
import { fileToDataUrl } from '../lib/file.js';
import { CATEGORY_COLORS } from './MapView.js';
import { ReputationPanel } from './ReputationPanel.js';

interface MyEarthTalkViewProps {
  viewer: CommunityUser | null;
  onRequestLogin: () => void;
  onOpenPost: (passportId: string) => void;
}

/**
 * MY EARTH TALK - the contributor's own dashboard (Stage 12).
 *
 * Shows exactly the caller's own posts, public and private, and their
 * participation record together, so everything a contributor owns is on one
 * screen. The reader's photo/name controls live here rather than in the page
 * header: the identity block itself is the editor.
 */
export const MyEarthTalkView: React.FC<MyEarthTalkViewProps> = ({
  viewer,
  onRequestLogin,
  onOpenPost,
}) => {
  const [posts, setPosts] = useState<MyPostSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [confirmingName, setConfirmingName] = useState(false);
  const [name, setName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  // Guards against an earlier request landing after a newer one (for example
  // after switching accounts), which would show another reader's posts.
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    if (!viewer) return;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const data = await fetchMyPosts();
      if (seq !== loadSeqRef.current) return;
      const list = Array.isArray(data) ? data : [];
      const unique = Array.from(new Map(list.map((p) => [p.passport_id, p])).values());
      setPosts(unique);
    } catch (err: unknown) {
      if (seq !== loadSeqRef.current) return;
      setNotice(err instanceof Error ? err.message : 'Could not load your posts.');
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [viewer]);

  useEffect(() => {
    setPosts([]);
    setNotice(null);
    setEditingName(false);
    setConfirmingName(false);
    setAvatarVersion(0);
    setAvatarFailed(false);
    if (viewer) {
      setName(viewer.display_name ?? '');
      load();
    }
  }, [viewer, load]);

  // A local (auto-created) account renames through the browser store and is
  // bound by the seven-day interval; a WhatsApp-verified account renames on the
  // server, which reports the same timestamp in the session. The identity block
  // reads the same rule either way, and the server enforces it regardless of
  // what the browser believes.
  const local = getLocalAccount();
  const isLocal = Boolean(local && viewer && local.public_user_id === viewer.public_user_id);
  const nameEditable = isLocal
    ? canEditDisplayName(local)
    : canEditDisplayNameFor(viewer?.display_name_updated_at);
  const nextEditAt = isLocal
    ? nextDisplayNameEditAt(local)
    : nextDisplayNameEditAtFor(viewer?.display_name_updated_at);

  if (!viewer) {
    return (
      <div className="p-6">
        <div className="g-card p-8 text-center max-w-lg mx-auto">
          <Telescope className="w-8 h-8 text-[#0b57d0] mx-auto" aria-hidden="true" />
          <h2 className="mt-3 text-[16px] font-medium text-[#1f1f1f]">My Earth Talk</h2>
          <p className="mt-2 text-[13px] text-[#5e5e5e] leading-relaxed">
            Your observations, your questions, your comments - under one sign-in. Verify your
            WhatsApp number once and everything you contribute is in one place.
          </p>
          <button type="button" className="g-btn g-btn-filled mt-4" onClick={onRequestLogin}>
            Sign in with WhatsApp
          </button>
        </div>
      </div>
    );
  }

  const saveName = async () => {
    const next = name.trim();
    if (next === (viewer.display_name ?? '')) {
      setConfirmingName(false);
      setEditingName(false);
      return;
    }
    setNotice(null);
    try {
      if (isLocal) {
        const updated = updateLocalAccountDisplayName(next);
        setNotice(`You now appear as "${updated.display_name}".`);
      } else {
        const updated = await updateProfile(next.length > 0 ? next : null);
        setNotice(
          updated.display_name
            ? `You now appear as "${updated.display_name}".`
            : 'Your posts are now shared anonymously.',
        );
      }
      setEditingName(false);
      setConfirmingName(false);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not update your name.');
      setConfirmingName(false);
    }
  };

  const onAvatarChosen = async (file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    setAvatarBusy(true);
    try {
      let dataUrl: string;
      try {
        dataUrl = await fileToDataUrl(file);
      } catch {
        throw new Error('The image could not be read.');
      }
      const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
      if (!match) throw new Error('Only JPEG, PNG or WebP images are allowed.');
      await setAvatar(match[2], match[1]);
      setAvatarFailed(false);
      setAvatarVersion((v) => v + 1);
      setNotice('Your profile photo was updated.');
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'The photo could not be saved.');
    } finally {
      setAvatarBusy(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const onAvatarRemove = async () => {
    setNotice(null);
    setAvatarBusy(true);
    try {
      await clearAvatar();
      setAvatarFailed(true);
      setAvatarVersion((v) => v + 1);
      setNotice('Your profile photo was removed.');
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'The photo could not be removed.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const avatarSrc = !isLocal && viewer ? userAvatarSrc(viewer.public_user_id, avatarVersion) : null;
  const showAvatarImage = Boolean(avatarSrc) && !avatarFailed;

  const publicCount = posts.filter((post) => post.is_public).length;
  const privateCount = posts.length - publicCount;
  const openQuestions = posts.reduce((total, post) => total + (post.open_question_count ?? 0), 0);

  const daysUntilRename = nextEditAt > Date.now()
    ? Math.ceil((nextEditAt - Date.now()) / (24 * 60 * 60 * 1000))
    : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[15px] font-medium text-[#1f1f1f] flex items-center gap-2">
          <Telescope className="w-5 h-5 text-[#0b57d0]" aria-hidden="true" />
          My Earth Talk
        </h2>
      </div>

      {notice && (
        <div className="mt-3 text-[12px] text-[#5e5e5e] bg-[#f0f4f9] border border-[#e3e3e3] rounded-lg px-3 py-2">
          {notice}
        </div>
      )}

      {/* Identity */}
      <section className="g-card mt-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 flex-col items-center gap-1">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f0f4f9] ring-1 ring-[#e3e3e3]">
              {showAvatarImage ? (
                <img
                  src={avatarSrc ?? undefined}
                  alt={`${viewer.display_name ?? viewer.public_user_id} profile photo`}
                  className="h-full w-full object-cover"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <img src="/icon.png" alt="" className="h-7 w-7 object-contain" />
              )}
            </span>
            {!isLocal && (
              <>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[#5e5e5e] hover:bg-[#f0f4f9] disabled:opacity-40"
                    aria-label="Change profile photo"
                    title="Change profile photo"
                    disabled={avatarBusy}
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <Camera className="w-3 h-3" />
                  </button>
                  {showAvatarImage && (
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[#5e5e5e] hover:bg-[#f0f4f9] disabled:opacity-40"
                      aria-label="Remove profile photo"
                      title="Remove profile photo"
                      disabled={avatarBusy}
                      onClick={onAvatarRemove}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => onAvatarChosen(e.target.files?.[0])}
                />
              </>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your public name"
                    autoFocus
                    className="h-9 flex-1 rounded-lg border border-[#c7c7c7] px-3 text-[13px] focus:outline-none focus:border-[#0b57d0]"
                  />
                  {confirmingName ? (
                    <>
                      <button
                        type="button"
                        className="g-btn g-btn-filled h-9 px-3 text-[12px]"
                        onClick={saveName}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="g-btn g-btn-text h-9 px-2 text-[12px]"
                        onClick={() => setConfirmingName(false)}
                      >
                        Back
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="g-btn g-btn-filled h-9 px-3 text-[12px]"
                        onClick={() => setConfirmingName(true)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="g-btn g-btn-text h-9 px-2 text-[12px]"
                        onClick={() => setEditingName(false)}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
                {confirmingName && (
                  <p className="text-[11px] leading-snug text-[#9f6108]">
                    Change your name to "{name.trim() || 'Anonymous contributor'}"? A name can only be
                    changed once every 7 days.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-medium text-[#1f1f1f]">
                  {viewer.display_name ?? 'Anonymous contributor'}
                </p>
                <button
                  type="button"
                  className="g-icon-btn disabled:opacity-40"
                  aria-label="Edit display name"
                  disabled={!nameEditable}
                  title={
                    nameEditable
                      ? 'Edit your display name'
                      : `Your name can be changed again in ${daysUntilRename} day${daysUntilRename === 1 ? '' : 's'}`
                  }
                  onClick={() => {
                    setName(viewer.display_name ?? '');
                    setEditingName(true);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <p className="text-[11px] text-[#5e5e5e] font-mono mt-0.5">{viewer.public_user_id}</p>
            {isLocal && (
              <p className="text-[11px] text-[#5e5e5e] mt-0.5">
                {nameEditable
                  ? 'This name was created for you. Rename it once to make it your own.'
                  : `You can rename again in ${daysUntilRename} day${daysUntilRename === 1 ? '' : 's'}.`}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Your posts', value: posts.length, icon: Telescope },
          { label: 'Public', value: publicCount, icon: Eye },
          { label: 'Private', value: privateCount, icon: Lock },
          { label: 'Open AI questions', value: openQuestions, icon: Sparkles },
        ].map((stat) => (
          <div key={stat.label} className="g-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#5e5e5e]">{stat.label}</span>
              <stat.icon className="w-4 h-4 text-[#8f8f8f]" aria-hidden="true" />
            </div>
            <p className="mt-1 text-[20px] font-semibold text-[#1f1f1f]">{stat.value}</p>
          </div>
        ))}
      </section>

      {/* Your posts */}
      <section className="mt-4">
        <h3 className="text-[13px] font-medium text-[#1f1f1f] mb-2">Your observations</h3>
        {loading && posts.length === 0 ? (
          <div className="py-16 text-center text-[#5e5e5e] text-sm">Loading your posts…</div>
        ) : posts.length === 0 ? (
          <div className="py-16 text-center text-[#5e5e5e] text-sm bg-white rounded-xl border border-dashed border-[#c7c7c7]">
            <p className="font-medium text-[#1f1f1f] mb-1">Nothing here yet.</p>
            <p className="text-xs">When you send an observation to Earth Talk, it appears here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {posts.map((post) => {
              const color = CATEGORY_COLORS[post.observation_category] ?? '#78716c';
              return (
                <div key={post.passport_id} className="g-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-[14px] font-medium text-[#1f1f1f] break-words">{post.title}</h4>
                    <span
                      className="shrink-0 text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full border"
                      style={{
                        color: post.is_public ? '#2b7f3f' : '#7f5f00',
                        background: post.is_public ? '#c4eed0' : '#fff3cd',
                        borderColor: post.is_public ? '#2b7f3f33' : '#e6c20040',
                      }}
                    >
                      {post.is_public ? 'Public' : 'Private'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border"
                      style={{ color, borderColor: `${color}55`, background: `${color}14` }}
                    >
                      <svg width="8" height="11" viewBox="0 0 42 52" aria-hidden="true">
                        <path
                          d="M21 2C10.5 2 2 10.1 2 20.6 2 35.9 21 49.6 21 49.6S40 35.9 40 20.6C40 10.1 31.5 2 21 2z"
                          fill={color}
                          stroke="#ffffff"
                          strokeWidth="6"
                        />
                      </svg>
                      {categoryLabel(post.observation_category)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-[#5e5e5e]">
                    <span className="flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" aria-hidden="true" />
                      {post.media_count ?? 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" aria-hidden="true" />
                      {post.comment_count ?? 0}
                    </span>
                    {(post.open_question_count ?? 0) > 0 && (
                      <span className="flex items-center gap-1 text-[#9f6108]">
                        <Sparkles className="w-3 h-3" aria-hidden="true" />
                        {post.open_question_count} open question{(post.open_question_count ?? 0) === 1 ? '' : 's'}
                      </span>
                    )}
                    {!post.is_public && (
                      <span className="flex items-center gap-1">
                        <EyeOff className="w-3 h-3" aria-hidden="true" />
                        Not on the map
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="g-btn g-btn-tonal h-8 px-3 mt-3 text-[12px]"
                    onClick={() => onOpenPost(post.passport_id)}
                  >
                    Open
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Contribution record - moved here from the old "My contributions" page */}
      <section className="mt-6">
        <h3 className="text-[13px] font-medium text-[#1f1f1f] mb-2">Your contribution record</h3>
        <ReputationPanel displayName={viewer.display_name} />
      </section>
    </div>
  );
};
