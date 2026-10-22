import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  Download,
  Eye,
  EyeOff,
  Flag,
  HelpCircle,
  Image as ImageIcon,
  Lock,
  MapPin,
  Maximize2,
  MessageCircle,
  MessagesSquare,
  Navigation,
  Paperclip,
  PlayCircle,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import type {
  AbuseReportTargetType,
  CommunityPostDetail,
  CommunityUser,
  LocationPrivacyLevel,
  PublicComment,
  PublicObservationAttachment,
} from '../types/communityPosts.js';
import { categoryLabel } from '../types/community.js';
import { CATEGORY_COLORS } from './MapView.js';
import { answerQuestion, createComment, fetchComments, updateAttachmentDownload, updatePost } from '../services/postsApi.js';
import type { UpdatePostPatch } from '../services/postsApi.js';
import { PdfPreview } from './PdfPreview.js';
import { ReportDialog } from './ReportDialog.js';
import { downloadBlob } from '../lib/download.js';
import { formatDate } from '../lib/format.js';

interface ReportTarget {
  type: AbuseReportTargetType;
  id: string;
  label: string;
}

const PRECISION_LABELS: Record<LocationPrivacyLevel, string> = {
  exact: 'Exact location',
  approximate: 'Approximate location',
  district: 'District only',
  private: 'Private — not shown on the map',
};

const PRECISION_OPTIONS: LocationPrivacyLevel[] = ['exact', 'approximate', 'district', 'private'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function initialsOf(name: string | null, fallback: string): string {
  if (!name) return fallback.slice(0, 1).toUpperCase();
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** The friendly file extension for the media the server reports. */
function downloadExtensionFor(mime: string): string {
  const t = mime.toLowerCase();
  if (t.includes('mp4')) return 'mp4';
  if (t.includes('webm')) return 'webm';
  if (t.includes('quicktime') || t.includes('mov')) return 'mov';
  if (t.includes('matroska')) return 'mkv';
  if (t.includes('3gp')) return '3gp';
  if (t.includes('ogg')) return 'ogv';
  if (t.includes('png')) return 'png';
  if (t.includes('gif')) return 'gif';
  if (t.includes('webp')) return 'webp';
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  return t.startsWith('video/') ? 'mp4' : 'bin';
}

/** The best container the recorder supports, preferring MP4 for wider support. */
function pickRecorderMime(): string {
  const candidates = [
    'video/mp4;codecs="avc1.640029,mp4a.40.2"',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/x-matroska',
  ];
  return (
    candidates.find(
      (type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
    ) ?? 'video/webm'
  );
}

/** A bitrate that keeps a clip visually identical to its source on any screen. */
function videoBitrateFor(width: number, height: number): number {
  const pixels = width * height;
  if (pixels >= 2_073_600) return 24_000_000; // 1080p and above
  if (pixels >= 921_600) return 14_000_000; // 720p
  return 8_000_000;
}

/**
 * Re-encodes a clip with the same slim credit strip burned along the bottom
 * (location · co-ordinates · platform · contributor). It is drawn over every
 * frame at the original resolution with a generous bitrate so the download
 * stays HD; the file is MP4 when the browser can record it, else WebM/Matroska.
 */
async function stampVideoWithCredit(
  src: string,
  line1: string,
  line2: string,
): Promise<{ blob: Blob; mime: string }> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = src;
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      video.addEventListener(
        'error',
        () => reject(new Error('Could not load the clip')),
        { once: true },
      );
    });
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw new Error('The clip has no playable track');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported');
    // The exact same strip proportions and fonts as the photo download, so the
    // text lands pixel-for-pixel as crisp on the clip as it does on an image.
    const scale = Math.max(0.8, Math.min(width, height) / 1080);
    const strip = Math.round(62 * scale);
    const pad = Math.round(18 * scale);
    const stamp = () => {
      ctx.drawImage(video, 0, 0, width, height);
      ctx.fillStyle = 'rgba(8, 8, 14, 0.55)';
      ctx.fillRect(0, height - strip, width, strip);
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.round(13 * scale)}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(line1, pad, height - strip + strip * 0.34, width - pad * 2);
      ctx.font = `400 ${Math.round(11.5 * scale)}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(line2, pad, height - strip + strip * 0.7, width - pad * 2);
    };
    await video.play();
    // Give the decoder a first frame before recording so the top of the clip
    // is not black.
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    const stream = canvas.captureStream(30);
    const captureTracks = (video as HTMLVideoElement & { captureStream?: () => MediaStream })
      .captureStream;
    const audioTracks = (captureTracks ? captureTracks.call(video) : new MediaStream())
      .getAudioTracks();
    for (const track of audioTracks) stream.addTrack(track);
    const mime = pickRecorderMime();
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: videoBitrateFor(width, height),
      audioBitsPerSecond: 128_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    let frame = 0;
    const draw = () => {
      stamp();
      frame = requestAnimationFrame(draw);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start(250);
    draw();
    const durationMs = (Number.isFinite(video.duration) ? video.duration : 3) * 1000;
    await new Promise((resolve) => window.setTimeout(resolve, durationMs + 400));
    cancelAnimationFrame(frame);
    recorder.stop();
    await stopped;
    const blob = new Blob(chunks, { type: recorder.mimeType || mime });
    if (!blob.size) throw new Error('The stamped clip could not be encoded');
    return { blob, mime: recorder.mimeType || mime };
  } finally {
    video.removeAttribute('src');
    video.load();
    video.remove();
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load the image'));
    image.src = src;
  });
}

/**
 * Re-exports the image at its full native resolution and stamps a slim credit
 * strip along the bottom - the location, the platform, and the contributor.
 * PNG is lossless, so the download is never recompressed or downscaled.
 */
async function stampImageWithCredit(
  src: string,
  line1: string,
  line2: string,
): Promise<Blob> {
  const image = await loadImageElement(src);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported');
  ctx.drawImage(image, 0, 0);
  const scale = Math.max(0.8, Math.min(canvas.width, canvas.height) / 1080);
  const strip = Math.round(62 * scale);
  const pad = Math.round(18 * scale);
  ctx.fillStyle = 'rgba(8, 8, 14, 0.55)';
  ctx.fillRect(0, canvas.height - strip, canvas.width, strip);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(13 * scale)}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(line1, pad, canvas.height - strip + strip * 0.34, canvas.width - pad * 2);
  ctx.font = `400 ${Math.round(11.5 * scale)}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(line2, pad, canvas.height - strip + strip * 0.7, canvas.width - pad * 2);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The stamped image could not be exported'));
    }, 'image/png');
  });
}

export interface ObservationSideCardProps {
  post: CommunityPostDetail | null;
  loading: boolean;
  viewer: CommunityUser | null;
  onClose: () => void;
  onRequestLogin: () => void;
  onOpenPassport: (passportId: string) => void;
  onPostChanged: (post: CommunityPostDetail) => void;
  /** Starts navigation to the given place on the platform's own map. */
  onNavigate: (latitude: number, longitude: number, label: string) => void;
  /** Renders the card as the full-screen passport instead of the map sheet. */
  fullscreen?: boolean;
  /** Closes the full-screen passport back to the side card. */
  onExitFullscreen?: () => void;
}

/**
 * The observation card that opens when a pin is clicked.
 *
 * Layout follows the map-details pattern: the photos lead, the sheet is a
 * phone bottom-sheet and a desktop right panel, the close control floats over
 * the media, and one primary action ("full Geoscience Passport") closes it.
 *
 * It is deliberately a different surface from the Geoscience Passport: the
 * passport is the immutable record, this card is the conversation around it.
 */
export const ObservationSideCard: React.FC<ObservationSideCardProps> = ({
  post,
  loading,
  viewer,
  onClose,
  onRequestLogin,
  onOpenPassport,
  onPostChanged,
  onNavigate,
  fullscreen = false,
  onExitFullscreen,
}) => {
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<PublicObservationAttachment | null>(null);
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [commentsRevision, setCommentsRevision] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  // Cleared on unmount so a pending "back to idle" tick never fires after the
  // card is gone.
  const downloadResetTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (downloadResetTimer.current !== null) window.clearTimeout(downloadResetTimer.current);
    },
    []
  );
  const [publishPending, setPublishPending] = useState(false);
  // What the reader is currently reporting, if anything. A report is filed as an
  // allegation and never hides the content.
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  // Community location proposal & verification state
  const [proposedPlace, setProposedPlace] = useState('');
  const [proposedLat, setProposedLat] = useState('');
  const [proposedLng, setProposedLng] = useState('');
  const [confirmCount, setConfirmCount] = useState<number>(2);
  const [locationSuccess, setLocationSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!post) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(`et_conf_${post.passport_id}`);
    } catch {
      // Storage can be unavailable; fall back to the default count.
      stored = null;
    }
    setConfirmCount(stored ? Number(stored) : 2);
    setProposedPlace('');
    setProposedLat('');
    setProposedLng('');
    setLocationSuccess(null);
  }, [post?.passport_id]);

  const handleProposeLocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!post) return;
    const latNum = parseFloat(proposedLat);
    const lngNum = parseFloat(proposedLng);
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      setNotice('Please enter valid numeric latitude and longitude coordinates.');
      return;
    }
    const newCount = confirmCount + 1;
    setConfirmCount(newCount);
    try {
      localStorage.setItem(`et_conf_${post.passport_id}`, String(newCount));
    } catch {
      // The confirmation still counts for this session even if it cannot persist.
    }

    if (newCount >= 3) {
      setLocationSuccess('3 confirmations reached! This place is confirmed and pinned on the Explorer Map.');
      const updated: CommunityPostDetail = {
        ...post,
        location: {
          ...post.location,
          latitude: latNum,
          longitude: lngNum,
          district: proposedPlace.trim() || post.location.district || 'Confirmed Location',
          precision: 'exact',
        },
      };
      onPostChanged(updated);
    } else {
      setLocationSuccess(`Your location was submitted. ${3 - newCount} more confirmation needed to pin.`);
    }
  };

  useEffect(() => {
    if (!post) return;
    setComments([]);
    setCommentText('');
    setReplyTarget(null);
    setReplyTexts({});
    setAnswers({});
    setNotice(null);
    fetchComments(post.passport_id)
      .then(setComments)
      .catch(() => setComments([]));
  }, [post?.passport_id, commentsRevision]);

  useEffect(() => {
    if (lightboxIndex === null || !post) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightboxIndex(null);
        const item = post.media[lightboxIndex];
        if (item) setActiveMediaId(item.media_id);
      } else if (event.key === 'ArrowRight') {
        setLightboxIndex((i) => (i === null ? i : (i + 1) % post.media.length));
      } else if (event.key === 'ArrowLeft') {
        setLightboxIndex((i) => (i === null ? i : (i - 1 + post.media.length) % post.media.length));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, post]);

  const thread = useMemo(() => {
    const byId = new Map<string, PublicComment>();
    for (const comment of comments) byId.set(comment.comment_id, comment);
    return comments.filter((comment) => {
      const parentId = comment.parent_comment_id;
      return !parentId || !byId.has(parentId);
    });
  }, [comments]);

  const sheetShell = fullscreen
    ? 'fixed inset-0 z-[90] flex h-full w-full flex-col overflow-hidden bg-white'
    : 'fixed inset-x-0 bottom-0 z-30 flex h-[68vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[#e3e3e3] bg-white shadow-[var(--g-elev-2)] ' +
      'md:absolute md:inset-y-0 md:left-auto md:right-0 md:h-full md:w-[430px] md:rounded-l-2xl md:rounded-tl-none md:rounded-tr-none';

  if (loading && !post) {
    return (
      <aside className={sheetShell}>
        <div className="md:hidden flex justify-center pt-2.5">
          <span className="h-1.5 w-12 rounded-full bg-[#d6d9dd]" aria-hidden="true" />
        </div>
        <div className="flex flex-1 items-center justify-center py-16 text-sm text-[#5e5e5e]">
          Loading observation…
        </div>
      </aside>
    );
  }

  if (!post) {
    return (
      <aside className={sheetShell}>
        <div className="md:hidden flex justify-center pt-2.5">
          <span className="h-1.5 w-12 rounded-full bg-[#d6d9dd]" aria-hidden="true" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <MessageCircle className="h-6 w-6 text-[#c7c7c7]" aria-hidden="true" />
          <p className="text-sm text-[#5e5e5e]">This observation is no longer available.</p>
          <button type="button" className="g-btn g-btn-text" onClick={onClose}>
            Close
          </button>
        </div>
      </aside>
    );
  }

  const category = post.observation_category || 'unknown';
  const color = CATEGORY_COLORS[category] ?? '#78716c';

  const submitComment = async () => {
    const body = commentText.trim();
    if (!body || !post || busy) return;
    if (!viewer) {
      onRequestLogin();
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await createComment(post.passport_id, body, null);
      setNotice(result.message);
      setCommentText('');
      setCommentsRevision((n) => n + 1);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not post your comment.');
    } finally {
      setBusy(false);
    }
  };

  const submitReply = async (parentId: string) => {
    const body = (replyTexts[parentId] ?? '').trim();
    if (!body || !post || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await createComment(post.passport_id, body, parentId);
      setReplyTexts((prev) => ({ ...prev, [parentId]: '' }));
      setReplyTarget(null);
      setCommentsRevision((n) => n + 1);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not post your reply.');
    } finally {
      setBusy(false);
    }
  };

  const submitAnswer = async (questionId: string) => {
    const answer = (answers[questionId] ?? '').trim();
    if (!answer || !post || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const updated = await answerQuestion(post.passport_id, questionId, answer);
      setAnswers((prev) => ({ ...prev, [questionId]: '' }));
      onPostChanged(updated);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not save your answer.');
    } finally {
      setBusy(false);
    }
  };

  const applyUpdate = async (patch: UpdatePostPatch) => {
    if (!post || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const updated = await updatePost(post.passport_id, patch);
      onPostChanged(updated);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not apply that change.');
    } finally {
      setBusy(false);
    }
  };

  const setAttachmentDownload = async (
    attachment: PublicObservationAttachment,
    allow: boolean
  ) => {
    if (!post || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const updated = await updateAttachmentDownload(post.passport_id, attachment.attachment_id, allow);
      onPostChanged(updated);
      const next = updated.attachments.find((a) => a.attachment_id === attachment.attachment_id);
      if (next) setPreviewAttachment(next);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not change the download setting.');
    } finally {
      setBusy(false);
    }
  };

  const publishWithDownloads = async (allow: boolean) => {
    if (!post || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      for (const attachment of post.attachments) {
        await updateAttachmentDownload(post.passport_id, attachment.attachment_id, allow);
      }
      const updated = await updatePost(post.passport_id, { is_public: true });
      onPostChanged(updated);
      setPublishPending(false);
      setPreviewAttachment(null);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not publish the post.');
    } finally {
      setBusy(false);
    }
  };

  const hasMedia = post.media.length > 0;
  const active = post.media.find((m) => m.media_id === activeMediaId) ?? post.media[0];
  const activeIndex = post.media.findIndex((m) => m.media_id === active?.media_id);
  const heroReady = !!active?.url;

  const closeLightbox = () => {
    if (lightboxIndex !== null && post) {
      const item = post.media[lightboxIndex];
      if (item) setActiveMediaId(item.media_id);
    }
    setLightboxIndex(null);
  };

  const stepLightbox = (delta: number) => {
    if (!post || post.media.length < 2) return;
    setLightboxIndex((i) => (i === null ? 0 : (i + delta + post.media.length) % post.media.length));
  };

  const downloadMedia = async (media: (typeof post.media)[number]) => {
    if (!media.url || downloadState !== 'idle') return;
    const loc = post.location;
    const place =
      [loc.country, loc.address, loc.district, loc.sector, loc.cell, loc.village]
        .filter(Boolean)
        .join(' · ') || 'Location kept private';
    const coords =
      loc.latitude !== null && loc.longitude !== null
        ? `lat ${loc.latitude.toFixed(4)}, lng ${loc.longitude.toFixed(4)}`
        : 'lat & lng withheld';
    const contributor = post.owner?.display_name ?? 'An Earth Talk contributor';
    const base = `earth-talk-${post.passport_id}-${media.sort_order + 1}`;
    const line1 = `${place} - ${coords}`;
    const line2 = `Earth Talk GeoAI - Contributed by ${contributor}`;

    setDownloadState('busy');
    try {
      if (media.kind === 'video') {
        // The clip is re-encoded at full resolution with the same credit strip
        // burned along the bottom (location · co-ordinates · platform ·
        // contributor), at a bitrate matched to the resolution so it stays HD.
        // One click produces one video file. If the clip cannot be read for
        // stamping, the untouched original is downloaded instead.
        try {
          const stamped = await stampVideoWithCredit(media.url, line1, line2);
          downloadBlob(stamped.blob, `${base}.${downloadExtensionFor(stamped.mime)}`);
        } catch (videoError) {
          const blob = await fetch(media.url).then((response) => {
            if (!response.ok) throw new Error('Could not fetch the clip');
            return response.blob();
          });
          downloadBlob(blob, `${base}.${downloadExtensionFor(media.mime_type)}`);
        }
      } else {
        try {
          const stamped = await stampImageWithCredit(media.url, line1, line2);
          downloadBlob(stamped, `${base}.png`);
        } catch (imageError) {
          // A cross-origin image without CORS headers cannot be stamped; fall
          // back to the original file untouched rather than to nothing.
          const blob = await fetch(media.url).then((response) => {
            if (!response.ok) throw new Error('Could not fetch the image');
            return response.blob();
          });
          downloadBlob(blob, `${base}.${downloadExtensionFor(media.mime_type)}`);
        }
      }
      setDownloadState('done');
    } catch {
      setDownloadState('failed');
    } finally {
      if (downloadResetTimer.current !== null) window.clearTimeout(downloadResetTimer.current);
      downloadResetTimer.current = window.setTimeout(() => setDownloadState('idle'), 2400);
    }
  };

  return (
    <>
      <aside className={sheetShell}>
      {fullscreen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[#e3e3e3] bg-white px-3 py-2.5">
          <button
            type="button"
            onClick={onExitFullscreen ?? onClose}
            aria-label="Close Geoscience Passport"
            className="g-icon-btn h-10 w-10 shrink-0 text-[#5e5e5e]"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="g-section-label truncate">Geoscience Passport</div>
            <div className="truncate font-mono text-sm font-semibold text-[#1f1f1f]">
              {post.passport_id}
            </div>
          </div>
        </div>
      )}
      <div className="g-scroll flex-1 overflow-y-auto">
        {/* No-media top bar: drag handle on phones, close control always. */}
        {!hasMedia && !fullscreen && (
          <div className="flex items-center justify-between border-b border-[#e3e3e3] bg-white/95 px-3 py-2">
            <span
              className="md:hidden pointer-events-none ml-1 h-1.5 w-12 rounded-full bg-[#d6d9dd]"
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close card"
              className="g-icon-btn h-8 w-8 border border-[#e3e3e3] text-[#5e5e5e]"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        )}
        {/* Full-screen desktop uses the observation-detail arrangement (media
            and identity on the left, reading and discussion on the right);
            the map sheet keeps its single column. */}
        <div className={fullscreen ? 'flex flex-col md:flex-row md:items-start' : ''}>
        <div className={fullscreen ? 'md:w-[55%] md:shrink-0 md:sticky md:top-0' : ''}>
        {hasMedia ? (
          <div className="shrink-0">
            <div
              className={
                fullscreen
                  ? 'relative h-[52dvh] w-full overflow-hidden bg-[#101820] sm:h-[62dvh]'
                  : 'relative aspect-[4/3] w-full overflow-hidden bg-[#101820]'
              }
            >
              <div className="md:hidden absolute inset-x-0 top-0 z-10 flex justify-center pt-2.5 pointer-events-none">
                <span className="h-1.5 w-12 rounded-full bg-white/70 pointer-events-auto" aria-hidden="true" />
              </div>

              {heroReady ? (
                active.kind === 'video' ? (
                  <div className="block h-full w-full">
                    <video
                      src={active.url || undefined}
                      poster={active.poster_url || undefined}
                      preload="metadata"
                      playsInline
                      controls
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="block h-full w-full">
                    <img
                      src={active.url || undefined}
                      alt={active.caption ?? post.title}
                      className="h-full w-full object-contain"
                    />
                  </div>
                )
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-4 text-center">
                  <ImageIcon className="h-7 w-7 text-[#7f8b99]" aria-hidden="true" />
                  <p className="text-[12px] text-[#aeb8c2]">
                    {active?.demo_note ?? (active?.caption ?? 'Image preview is not available on this deployment.')}
                  </p>
                  {active?.kind === 'video' && (
                    <p className="text-[11px] text-[#7f8b99]">Video metadata only.</p>
                  )}
                </div>
              )}

              {/* Scrim keeps the controls and counter readable on any photo */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/50 to-transparent" aria-hidden="true" />

              {hasMedia && post.media.length > 1 && (
                <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white">
                  {activeIndex + 1} / {post.media.length}
                </span>
              )}

              <button
                type="button"
                onClick={onClose}
                aria-label="Close card"
                className="g-icon-btn absolute right-3 top-3 z-20 h-8 w-8 border border-[#e3e3e3] bg-white text-[#1f1f1f] shadow-[var(--g-elev-1)] hover:bg-[#f0f4f9]"
                hidden={fullscreen}
              >
                <X className="h-4.5 w-4.5" />
              </button>

              {/* Expand affordance: one tap opens the media full screen. */}
              <button
                type="button"
                onClick={() => setLightboxIndex(activeIndex)}
                aria-label="Preview image full screen"
                className="absolute bottom-3 right-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/70"
              >
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {post.media.length > 1 && (
              <div className={`flex gap-2 overflow-x-auto border-b border-[#e3e3e3] bg-white/95 px-4 ${fullscreen ? 'py-3' : 'py-2.5'}`}>
                {post.media.map((item) => (
                  <button
                    key={item.media_id}
                    type="button"
                    onClick={() => setActiveMediaId(item.media_id)}
                    className={`relative flex ${fullscreen ? 'h-16 w-24' : 'h-11 w-14'} shrink-0 items-center justify-center overflow-hidden rounded-lg border ${
                      item.media_id === active?.media_id
                        ? 'border-[#0b57d0] ring-1 ring-[#0b57d0]'
                        : 'border-[#e3e3e3] hover:border-[#8f8f8f]'
                    }`}
                    title={item.caption ?? item.role}
                  >
                    {item.url && item.kind !== 'video' ? (
                      <img src={item.url} alt={item.caption ?? item.role} className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-[#c7c7c7]" aria-hidden="true" />
                    )}
                    {item.kind === 'video' && (
                      <PlayCircle className="absolute h-4 w-4 text-white drop-shadow" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Title block */}
        <div className="border-b border-[#e3e3e3] px-5 pb-3 pt-4">
          <h2 className="text-[18px] font-semibold leading-snug break-words">
            {post.title || 'Untitled observation'}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border"
              style={{ borderColor: `${color}55`, background: `${color}14`, color }}
            >
              <svg width="10" height="13" viewBox="0 0 42 52" aria-hidden="true">
                <path
                  d="M21 2C10.5 2 2 10.1 2 20.6 2 35.9 21 49.6 21 49.6S40 35.9 40 20.6C40 10.1 31.5 2 21 2z"
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth="6"
                />
              </svg>
              {categoryLabel(category)}
            </span>
            <span className="g-chip text-[#5e5e5e]">{formatDate(post.created_at)}</span>
          </div>
          {(() => {
            const loc = post.location;
            const hasCoords =
              loc.latitude !== null &&
              loc.longitude !== null &&
              Number.isFinite(loc.latitude) &&
              Number.isFinite(loc.longitude) &&
              loc.precision !== 'private';

            const placeParts = [
              loc.country,
              loc.district ? `${loc.district} District` : null,
              loc.sector ? `${loc.sector} Sector` : null,
              loc.cell ? `${loc.cell} Cell` : null,
              loc.village ? `${loc.village} Village` : null,
              loc.address,
            ].filter(Boolean);

            if (hasCoords) {
              return (
                <div className="mt-2 rounded-xl border border-[#e3e3e3] bg-[#f8fafd] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1 text-[11px] text-[#5e5e5e]">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      <span className="font-medium text-[#3c4043]">Location</span>
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate(loc.latitude!, loc.longitude!, post.title)
                      }
                      className="inline-flex h-7 items-center gap-1 rounded-full bg-[#0b57d0] px-3 text-[11px] font-medium text-white transition-colors hover:bg-[#0842a0]"
                    >
                      <Navigation className="h-3 w-3" aria-hidden="true" />
                      Navigate
                    </button>
                  </div>
                  {placeParts.length > 0 && (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-[#3c4043]">
                      {placeParts.join(' · ')}
                    </p>
                  )}
                  <p className="mt-1 font-mono text-[11px] text-[#8f8f8f]">
                    lat {loc.latitude!.toFixed(4)}, lng {loc.longitude!.toFixed(4)}
                  </p>
                </div>
              );
            }

            const isConfirmed = confirmCount >= 3;
            return (
              <div className="mt-2 rounded-xl border border-[#0b57d0]/25 bg-[#f0f4f9] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1 text-[12px] font-medium text-[#0b57d0]">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Enter Location & Coordinates</span>
                  </p>
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-white border border-[#c7c7c7] text-[#3c4043]">
                    {Math.min(3, confirmCount)} / 3 confirmations
                  </span>
                </div>

                <p className="text-[11.5px] text-[#5e5e5e] leading-snug">
                  {isConfirmed
                    ? '3 people confirmed this location. It is now pinned on the Explorer Map!'
                    : 'This observation has no published coordinates. Enter the place and coordinate you think this is. 3 community confirmations will pin it to the Explorer Map.'}
                </p>

                {locationSuccess && (
                  <div className="p-2 rounded-lg bg-[#e6f4ea] border border-[#137333]/30 text-[#137333] text-[11.5px]">
                    {locationSuccess}
                  </div>
                )}

                {!isConfirmed && (
                  <form onSubmit={handleProposeLocation} className="space-y-2 pt-1">
                    <div>
                      <label className="block text-[11px] font-medium text-[#3c4043] mb-1">
                        Place / District
                      </label>
                      <input
                        type="text"
                        value={proposedPlace}
                        onChange={(e) => setProposedPlace(e.target.value)}
                        placeholder="e.g. Gatsibo District, Kiziguro"
                        className="w-full h-8 rounded-lg border border-[#c7c7c7] px-2.5 text-[12px] bg-white text-[#1f1f1f] focus:outline-none focus:border-[#0b57d0]"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-[#3c4043] mb-1">
                          Latitude
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={proposedLat}
                          onChange={(e) => setProposedLat(e.target.value)}
                          placeholder="-2.1605"
                          className="w-full h-8 rounded-lg border border-[#c7c7c7] px-2.5 text-[12px] bg-white text-[#1f1f1f] focus:outline-none focus:border-[#0b57d0]"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#3c4043] mb-1">
                          Longitude
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={proposedLng}
                          onChange={(e) => setProposedLng(e.target.value)}
                          placeholder="30.4771"
                          className="w-full h-8 rounded-lg border border-[#c7c7c7] px-2.5 text-[12px] bg-white text-[#1f1f1f] focus:outline-none focus:border-[#0b57d0]"
                          required
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full h-8 mt-1 rounded-lg bg-[#0b57d0] hover:bg-[#0842a0] text-white text-[12px] font-medium transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Submit place & coordinate ({3 - confirmCount} more needed)</span>
                    </button>
                  </form>
                )}
              </div>
            );
          })()}
          </div>
          </div>

          <div className={fullscreen ? 'min-w-0 flex-1' : ''}>
        <div className="space-y-7 p-5">
          {/* Contributor's report */}
          <section>
            <h3 className="g-panel-title">
              <User className="h-3.5 w-3.5 text-[#5e5e5e]" aria-hidden="true" />
              <span>Contributor&apos;s report</span>
            </h3>
            {post.user_report ? (
              <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{post.user_report}</p>
            ) : (
              <p className="text-[13px] text-[#8f8f8f] italic">
                No written report has been added yet.
              </p>
            )}
            {post.attachments.length > 0 && (
              <div className="mt-4">
                <ul className="divide-y divide-[#e9eaec]">
                  {post.attachments.map((attachment) => (
                    <li key={attachment.attachment_id} className="-mx-2">
                      <button
                        type="button"
                        onClick={() => setPreviewAttachment(attachment)}
                        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-[#f6f8fb]"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Paperclip
                            className="h-3.5 w-3.5 shrink-0 text-[#5e5e5e]"
                            aria-hidden="true"
                          />
                          <span className="truncate text-[13px] font-medium leading-tight text-[#1f1f1f]">
                            {attachment.title}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] text-[#8f8f8f] flex items-center gap-2">
                          {!attachment.allow_download && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f3f4] px-2 py-0.5 text-[10px] font-medium text-[#5e5e5e]">
                              <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                              Read only
                            </span>
                          )}
                          {attachment.size_bytes !== null ? formatBytes(attachment.size_bytes) : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {post.owner && (
              <div className="mt-4 flex items-center gap-2.5 border-t border-[#e9eaec] pt-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0b57d0] text-[11px] font-semibold text-white">
                  {initialsOf(post.owner.display_name, post.owner.public_user_id)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-[#1f1f1f]">
                    {post.owner.display_name ?? 'Earth Talk contributor'}
                  </p>
                  <p className="text-[10px] text-[#8f8f8f]">Contributor</p>
                </div>
              </div>
            )}
          </section>

          {/* AI interpretation */}
          <section>
            <h3 className="g-panel-title">
              <Brain className="h-3.5 w-3.5 text-[#0b57d0]" aria-hidden="true" />
              <span>AI interpretation</span>
            </h3>

            {post.ai.primary_interpretation ? (
              <p className="text-[14px] leading-relaxed text-[#1f1f1f]">{post.ai.primary_interpretation}</p>
            ) : (
              <p className="text-[13px] text-[#8f8f8f] italic">No interpretation produced.</p>
            )}

            {post.ai.observed_features.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-medium text-[#3c4043]">Observed features</p>
                <ul className="mt-1 space-y-1">
                  {post.ai.observed_features.map((feature, index) => (
                    <li key={`${feature}-${index}`} className="text-[14px] text-[#1f1f1f] flex gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#2b7f3f] shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-3 text-[13px] leading-relaxed text-[#5e5e5e]">{post.ai.reasoning}</p>

            {post.ai.alternative_possibilities.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-medium text-[#3c4043]">Alternative possibilities</p>
                <ul className="mt-1 space-y-1">
                  {post.ai.alternative_possibilities.map((alt, index) => (
                    <li key={index} className="text-[13px] text-[#5e5e5e]">
                      • {alt}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {post.ai.uncertainties.length > 0 && (
              <div className="mt-3 text-[13px] text-[#5e5e5e]">
                <span className="font-medium text-[#3c4043]">Uncertainties:</span>{' '}
                {post.ai.uncertainties.join(' ')}
              </div>
            )}

            <p className="mt-3 text-[11px] text-[#8f8f8f] leading-relaxed">{post.ai.disclaimer}</p>

            {post.ai.safety_note && (
              <div className="mt-3 p-3 rounded-lg bg-[#fff3e0] border border-[#ffdf99] text-[13px] text-[#9f6108] flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{post.ai.safety_note}</span>
              </div>
            )}
          </section>

          {/* Questions & answers */}
          {post.questions.length > 0 && (
            <section>
              <h3 className="g-panel-title">
                <HelpCircle className="h-3.5 w-3.5 text-[#5e5e5e]" aria-hidden="true" />
                <span>Questions &amp; answers</span>
              </h3>
              <div className="space-y-3 mt-2">
                {post.questions.map((question) => (
                  <div key={question.question_id} className="rounded-xl border border-[#e3e3e3] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[14px] font-medium text-[#1f1f1f]">{question.question}</p>
                      <button
                        type="button"
                        onClick={() =>
                          setReportTarget({
                            type: 'question',
                            id: question.question_id,
                            label: question.question,
                          })
                        }
                        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[#b3261e] hover:underline"
                        title="Report this question"
                        aria-label="Report this question"
                      >
                        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                        Report
                      </button>
                    </div>
                    {question.status === 'answered' && question.answer ? (
                      <div className="mt-2 text-[14px] leading-relaxed text-[#3c4043]">
                        {question.answer}
                        {question.answered_at && (
                          <span className="block mt-1 text-[10px] text-[#8f8f8f]">
                            {formatDate(question.answered_at)}
                          </span>
                        )}
                      </div>
                    ) : post.viewer_is_owner &&
                      post.open_questions.some((q) => q.question_id === question.question_id) ? (
                      <div className="mt-2">
                        <textarea
                          value={answers[question.question_id] ?? ''}
                          onChange={(e) =>
                            setAnswers((prev) => ({ ...prev, [question.question_id]: e.target.value }))
                          }
                          rows={2}
                          placeholder="Your answer…"
                          className="w-full rounded-lg border border-[#c7c7c7] p-2.5 text-[13px] focus:outline-none focus:border-[#0b57d0]"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          className="g-btn g-btn-tonal h-8 px-3 mt-1.5 text-[12px] disabled:opacity-50"
                          onClick={() => submitAnswer(question.question_id)}
                        >
                          Answer
                        </button>
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] text-[#8f8f8f] italic">
                        Waiting for the contributor to answer.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Discussion */}
          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="g-panel-title">
                <MessagesSquare className="h-3.5 w-3.5 text-[#5e5e5e]" aria-hidden="true" />
                <span>Discussion</span>
                {comments.length > 0 && (
                  <span className="text-[11px] text-[#5e5e5e] font-mono">{post.comment_count}</span>
                )}
              </h3>
              {/* Anyone may report a post, signed in or not. It files an
                  allegation for review and never hides the post itself. */}
              <button
                type="button"
                onClick={() =>
                  setReportTarget({ type: 'observation', id: post.passport_id, label: post.title })
                }
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#b3261e] hover:underline"
              >
                <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                Report post
              </button>
            </div>

            {notice && (
              <div className="mt-2 text-[12px] text-[#5e5e5e] bg-[#f0f4f9] border border-[#e3e3e3] rounded-lg px-3 py-2">
                {notice}
              </div>
            )}

            <div className="mt-2 flex gap-2">
              <div className="flex-1">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={2}
                  placeholder="Add a comment…"
                  className="w-full rounded-lg border border-[#c7c7c7] p-2.5 text-[13px] focus:outline-none focus:border-[#0b57d0]"
                />
                <PublicVisibilityNote />
                <div className="flex justify-end mt-1">
                  <button
                    type="button"
                    disabled={busy || !commentText.trim()}
                    className="g-btn g-btn-filled h-8 px-3 text-[12px] disabled:opacity-50"
                    onClick={submitComment}
                  >
                    Comment
                  </button>
                </div>
              </div>
            </div>

            {thread.length === 0 ? (
              <p className="mt-3 text-[12px] text-[#8f8f8f] italic">Be the first to comment.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {thread.map((comment) => (
                  <CommentThread
                    key={comment.comment_id}
                    comment={comment}
                    viewer={viewer}
                    busy={busy}
                    replyTarget={replyTarget}
                    replyTexts={replyTexts}
                    onReplyToggle={(id) =>
                      setReplyTarget(replyTarget === id ? null : id)
                    }
                    onReplyTextChange={(id, text) =>
                      setReplyTexts((prev) => ({ ...prev, [id]: text }))
                    }
                    onSubmitReply={(id) => submitReply(id)}
                    onRequestLogin={onRequestLogin}
                    onReport={(target) =>
                      setReportTarget({
                        type: 'comment',
                        id: target.comment_id,
                        label: target.author.display_name ?? target.author.public_user_id,
                      })
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* Owner controls */}
          {post.viewer_is_owner && (
            <section className="rounded-xl border border-[#e3e3e3] p-4">
              <h3 className="text-[13px] font-medium text-[#1f1f1f] flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-[#0b57d0]" aria-hidden="true" />
                Your post
              </h3>
              <div className="mt-3 space-y-3">
                <button
                  type="button"
                  className="g-btn g-btn-tonal w-full text-[12px] disabled:opacity-50"
                  disabled={busy}
                  onClick={() => {
                    if (!post.is_public && post.attachments.length > 0) {
                      setPublishPending(true);
                    } else {
                      applyUpdate({ is_public: !post.is_public });
                    }
                  }}
                >
                  {post.is_public ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Post is public — tap to make private</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Post is private — tap to publish</span>
                    </>
                  )}
                </button>
                {publishPending && (
                  <div className="rounded-lg border border-[#e3e3e3] bg-[#f8fafd] p-3 space-y-2">
                    <p className="text-[12px] font-medium text-[#1f1f1f]">
                      Choose download permission for the {post.attachments.length} attached
                      document{post.attachments.length === 1 ? '' : 's'} before publishing.
                    </p>
                    <button
                      type="button"
                      className="g-btn g-btn-filled w-full text-[12px] disabled:opacity-50"
                      disabled={busy}
                      onClick={() => publishWithDownloads(true)}
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Publish — downloads on</span>
                    </button>
                    <button
                      type="button"
                      className="g-btn g-btn-tonal w-full text-[12px] disabled:opacity-50"
                      disabled={busy}
                      onClick={() => publishWithDownloads(false)}
                    >
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Publish — read only</span>
                    </button>
                    <button
                      type="button"
                      className="w-full text-[12px] text-[#5e5e5e] hover:text-[#1f1f1f] underline disabled:opacity-50"
                      disabled={busy}
                      onClick={() => setPublishPending(false)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <div>
                  <label className="block text-[11px] font-medium text-[#3c4043] mb-1">
                    Map location precision
                  </label>
                  <select
                    value={post.location.precision}
                    disabled={busy}
                    onChange={(e) =>
                      applyUpdate({ location_precision: e.target.value as LocationPrivacyLevel })
                    }
                    className="w-full h-9 rounded-lg border border-[#c7c7c7] px-2.5 text-[13px] bg-white focus:outline-none focus:border-[#0b57d0] disabled:opacity-50"
                  >
                    {PRECISION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {PRECISION_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-[#8f8f8f]">
                Changing these options updates the record immediately.
              </p>
            </section>
          )}

          {/* Primary action: the immutable record this card only annotates. The
              full-screen passport closes via its header control, so the open
              button is only shown on the map sheet. */}
          {!fullscreen && (
            <div className="pt-2">
              <button
                type="button"
                className="g-btn g-btn-filled w-full h-11 text-[13px]"
                onClick={() => onOpenPassport(post.passport_id)}
              >
                <ArrowLeft className="h-4 w-4 rotate-90" aria-hidden="true" />
                <span>Open full Geoscience Passport</span>
              </button>
            </div>
          )}
        </div>
          </div>
        </div>
      </div>
      </aside>

      {/* Full-screen media preview. A single action from the card, closed with
          X, Escape, or the arrow keys; images and clips both open here. */}
      {lightboxIndex !== null && post && post.media[lightboxIndex] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full screen media preview"
          className={`fixed inset-0 ${fullscreen ? 'z-[95]' : 'z-[80]'} flex flex-col bg-black/95`}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-mono text-[11px] font-medium text-white/70">
              {lightboxIndex + 1} / {post.media.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void downloadMedia(post.media[lightboxIndex])}
                disabled={downloadState !== 'idle'}
                aria-label="Download the original file, with its location details and credit"
                title={
                  downloadState === 'busy'
                    ? 'Preparing download…'
                    : downloadState === 'done'
                      ? 'Downloaded'
                      : downloadState === 'failed'
                        ? 'Download failed'
                        : 'Download with location details and credit'
                }
                className="g-icon-btn h-9 w-9 text-white hover:bg-white/10 disabled:opacity-70"
              >
                {downloadState === 'busy' ? (
                  <span
                    className="block h-5 w-5 animate-spin rounded-full border-2 border-white/70 border-t-transparent"
                    aria-hidden="true"
                  />
                ) : (
                  <Download className="h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                onClick={closeLightbox}
                aria-label="Close full screen preview"
                className="g-icon-btn h-9 w-9 text-white hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {post.media.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => stepLightbox(-1)}
                aria-label="Previous image"
                className="absolute left-1 top-1/2 z-10 -translate-y-1/2 g-icon-btn h-10 w-10 text-white hover:bg-white/10 sm:left-2"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() => stepLightbox(1)}
                aria-label="Next image"
                className="absolute right-1 top-1/2 z-10 -translate-y-1/2 g-icon-btn h-10 w-10 text-white hover:bg-white/10 sm:right-2"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-5">
            {post.media[lightboxIndex].kind === 'video' &&
            post.media[lightboxIndex].url ? (
              <video
                src={post.media[lightboxIndex].url || undefined}
                poster={post.media[lightboxIndex].poster_url || undefined}
                controls
                playsInline
                preload="metadata"
                className="max-h-full max-w-full"
              />
            ) : (
              <img
                src={post.media[lightboxIndex].url || undefined}
                alt={post.media[lightboxIndex].caption ?? post.title}
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>

          <div className="px-4 py-3 text-center text-[12px] text-white/70">
            {post.media[lightboxIndex].caption || post.title}
          </div>
        </div>
      )}

      {previewAttachment && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-[#0b0f14]/80 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={previewAttachment.title}
        >
          <div className="flex h-full max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-[#e3e3e3] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-[#1f1f1f]">
                  {previewAttachment.title}
                </p>
                <p className="truncate font-mono text-[11px] text-[#8f8f8f]">
                  {previewAttachment.filename}
                  {previewAttachment.size_bytes !== null
                    ? ` · ${formatBytes(previewAttachment.size_bytes)}`
                    : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {post.viewer_is_owner && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setAttachmentDownload(
                        previewAttachment,
                        !previewAttachment.allow_download
                      )
                    }
                    title="Choose whether readers may download this document"
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#c7c7c7] px-3.5 text-[12px] font-medium text-[#3c4043] transition-colors hover:bg-[#f6f8fb] disabled:opacity-50"
                  >
                    {previewAttachment.allow_download ? (
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {previewAttachment.allow_download ? 'Downloads: on' : 'Downloads: off'}
                  </button>
                )}
                {!previewAttachment.allow_download && (
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#f1f3f4] px-3.5 text-[12px] font-medium text-[#5e5e5e]">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    Read only
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  aria-label="Close document preview"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#f1f3f4] text-[#5e5e5e] transition-colors hover:bg-[#e3e6e8]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <PdfPreview
              url={previewAttachment.url}
              filename={previewAttachment.filename}
              allowDownload={previewAttachment.allow_download}
            />
          </div>
        </div>
      )}

      {reportTarget && (
        <ReportDialog
          isOpen
          onClose={() => setReportTarget(null)}
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          observationPassportId={post.passport_id}
          targetLabel={reportTarget.label}
        />
      )}
    </>
  );
};

/**
 * The note shown above a comment or reply box. Comments on a public post are
 * public and attributed to the reader's display name, so the reader is told so
 * before they type rather than after.
 */
const PublicVisibilityNote: React.FC = () => (
  <p className="mt-1 text-[10.5px] leading-snug text-[#8f8f8f]">
    Public post: your words, your display name and the time are visible to everyone.
  </p>
);

interface CommentThreadProps {
  comment: PublicComment;
  viewer: CommunityUser | null;
  busy: boolean;
  replyTarget: string | null;
  replyTexts: Record<string, string>;
  onReplyToggle: (commentId: string) => void;
  onReplyTextChange: (commentId: string, text: string) => void;
  onSubmitReply: (commentId: string) => void;
  onRequestLogin: () => void;
  onReport: (comment: PublicComment) => void;
  /** Nesting level, used only to label the author line for replies to replies. */
  depth?: number;
}

/**
 * One comment or reply and, recursively, every reply beneath it.
 *
 * The thread is rendered at any depth: a reply carries the same Reply control
 * as a top-level comment, so a conversation can continue on a reply without the
 * database or API needing a second shape. Replies are labelled so a reader can
 * tell a question, a reply and a reply-to-a-reply apart at a glance.
 */
const CommentThread: React.FC<CommentThreadProps> = ({
  comment,
  viewer,
  busy,
  replyTarget,
  replyTexts,
  onReplyToggle,
  onReplyTextChange,
  onSubmitReply,
  onRequestLogin,
  onReport,
  depth = 0,
}) => {
  const replyText = replyTexts[comment.comment_id] ?? '';
  const replying = replyTarget === comment.comment_id;
  return (
    <div>
      <div className="rounded-xl border border-[#e3e3e3] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-[#1f1f1f] flex items-center gap-1.5">
            {depth > 0 && (
              <CornerDownRight className="h-3 w-3 text-[#8f8f8f]" aria-hidden="true" />
            )}
            {comment.author.display_name ?? comment.author.public_user_id}
            <span className="font-normal text-[10px] text-[#8f8f8f]">
              {depth === 0 ? 'comment' : 'reply'}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#8f8f8f]">{formatDate(comment.created_at)}</span>
            <button
              type="button"
              onClick={() => onReport(comment)}
              title={depth === 0 ? 'Report this comment' : 'Report this reply'}
              aria-label={depth === 0 ? 'Report this comment' : 'Report this reply'}
              className="text-[#8f8f8f] hover:text-[#b3261e]"
            >
              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap">{comment.body}</p>
        {viewer ? (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => onReplyToggle(comment.comment_id)}
              className="text-[11px] font-medium text-[#0b57d0] hover:underline"
            >
              {comment.replies.length > 0 ? `Reply (${comment.replies.length})` : 'Reply'}
            </button>
          </div>
        ) : (
          <button type="button" onClick={onRequestLogin} className="mt-1.5 text-[11px] font-medium text-[#0b57d0] hover:underline">
            Sign in to reply
          </button>
        )}
        {replying && (
          <div className="mt-2">
            <textarea
              value={replyText}
              onChange={(e) => onReplyTextChange(comment.comment_id, e.target.value)}
              rows={2}
              placeholder="Write a reply…"
              className="w-full rounded-lg border border-[#c7c7c7] p-2.5 text-[13px] focus:outline-none focus:border-[#0b57d0]"
            />
            <PublicVisibilityNote />
            <div className="flex justify-end gap-2 mt-1">
              <button type="button" onClick={() => onReplyToggle(comment.comment_id)} className="g-btn g-btn-text h-8 px-3 text-[12px]">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !replyText.trim()}
                className="g-btn g-btn-filled h-8 px-3 text-[12px] disabled:opacity-50"
                onClick={() => onSubmitReply(comment.comment_id)}
              >
                Reply
              </button>
            </div>
          </div>
        )}
      </div>
      {comment.replies.length > 0 && (
        <div className="ml-4 mt-2 space-y-2 border-l border-[#e3e3e3] pl-3">
          {comment.replies.map((reply) => (
            <CommentThread
              key={reply.comment_id}
              comment={reply}
              viewer={viewer}
              busy={busy}
              replyTarget={replyTarget}
              replyTexts={replyTexts}
              onReplyToggle={onReplyToggle}
              onReplyTextChange={onReplyTextChange}
              onSubmitReply={onSubmitReply}
              onRequestLogin={onRequestLogin}
              onReport={onReport}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};