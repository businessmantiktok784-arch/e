import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import PdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize,
  Maximize2,
  Minimize,
  Presentation,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

GlobalWorkerOptions.workerSrc = PdfWorkerUrl;

interface PdfPreviewProps {
  url: string;
  filename: string;
  allowDownload: boolean;
}

const MIN_SCALE = 0.3;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.25;
const PAGE_GAP = 12;

interface PageSize {
  width: number;
  height: number;
}

interface PdfPageCanvasProps {
  page: PDFPageProxy;
  scale: number;
}

function PdfPageCanvas({ page, scale }: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const taskRef = useRef<RenderTask | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    taskRef.current?.cancel();

    const run = async () => {
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale });
      const outViewport = page.getViewport({ scale: scale * dpr });
      canvas.width = Math.ceil(outViewport.width);
      canvas.height = Math.ceil(outViewport.height);
      canvas.style.width = `${Math.ceil(viewport.width)}px`;
      canvas.style.height = `${Math.ceil(viewport.height)}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const task = page.render({ canvasContext: ctx, viewport: outViewport });
      taskRef.current = task;
      try {
        await task.promise;
      } catch {
        // A newer render cancelled this one; nothing to surface.
      }
    };

    void run();
    return () => {
      taskRef.current?.cancel();
    };
  }, [page, scale]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded-sm bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
    />
  );
}

/**
 * A self-contained PDF reader used instead of the browser's built-in viewer,
 * so the page owns every control: navigation, zoom, full screen, presentation
 * and — critically — the download button, which only appears when the
 * contributor allows downloads.
 */
export function PdfPreview({ url, filename, allowDownload }: PdfPreviewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const presentingRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pages, setPages] = useState<PDFPageProxy[]>([]);
  const [pageSizes, setPageSizes] = useState<PageSize[]>([]);
  const [scale, setScale] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [container, setContainer] = useState<PageSize>({ width: 0, height: 0 });
  const [errorText, setErrorText] = useState<string | null>(null);

  presentingRef.current = presenting;

  const startPresentation = useCallback(() => {
    setPresenting(true);
    const el = rootRef.current;
    if (el && !document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {
        // Full screen may be unsupported; presentation still works in place.
      });
    }
  }, []);

  const stopPresentation = useCallback(() => {
    setPresenting(false);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      const isFullscreen = Boolean(document.fullscreenElement);
      setFullscreen(isFullscreen);
      if (!isFullscreen && presentingRef.current) setPresenting(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setErrorText(null);

    void getDocument(url)
      .promise.then(async (doc) => {
        if (cancelled) {
          void doc.destroy();
          return;
        }
        const loadedPages: PDFPageProxy[] = [];
        const sizes: PageSize[] = [];
        for (let n = 1; n <= doc.numPages; n += 1) {
          const page = await doc.getPage(n);
          if (cancelled) {
            page.cleanup();
            void doc.destroy();
            return;
          }
          loadedPages.push(page);
          const viewport = page.getViewport({ scale: 1 });
          sizes.push({ width: viewport.width, height: viewport.height });
        }
        docRef.current?.destroy();
        docRef.current = doc;
        setPages(loadedPages);
        setPageSizes(sizes);
        setCurrentPage(1);
        const containerWidth = scrollRef.current?.clientWidth ?? 560;
        const fit = Math.max(
          MIN_SCALE,
          Math.min(2, (containerWidth - PAGE_GAP * 2) / (sizes[0]?.width || 1))
        );
        setFitScale(fit);
        setScale(fit);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
        setErrorText('This document could not be opened for preview.');
      });

    return () => {
      cancelled = true;
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setContainer({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const zoomBy = useCallback((multiplier: number) => {
    setScale((prev) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * multiplier)));
  }, []);

  const resetZoom = useCallback(() => {
    setScale(fitScale);
  }, [fitScale]);

  const goToPage = useCallback(
    (delta: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const nodes = Array.from(el.querySelectorAll<HTMLElement>('[data-page]'));
      const target = currentPage + delta;
      const node = nodes[Math.min(nodes.length - 1, Math.max(0, target - 1))];
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setCurrentPage(Math.min(pages.length, Math.max(1, target)));
    },
    [currentPage, pages.length]
  );

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop + Math.min(40, el.clientHeight * 0.2);
    let current = 1;
    el.querySelectorAll<HTMLElement>('[data-page]').forEach((node) => {
      if (node.offsetTop <= top) current = Number(node.dataset.page);
    });
    setCurrentPage(current);
  }, []);

  // Presentation keyboard navigation and Esc-to-exit.
  useEffect(() => {
    if (!presenting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        stopPresentation();
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === ' ') {
        event.preventDefault();
        goToPage(1);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        goToPage(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenting, goToPage, stopPresentation]);

  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      el.requestFullscreen?.().catch(() => undefined);
    }
  }, []);

  const currentSize = pageSizes[currentPage - 1];
  const presentScale =
    presenting && currentSize && container.width > 0 && container.height > 0
      ? Math.max(
          0.1,
          Math.min(
            (container.width - 24) / currentSize.width,
            (container.height - 24) / currentSize.height
          )
        )
      : 1;

  return (
    <div
      ref={rootRef}
      className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#1f2327]"
    >
      {!presenting && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#dadce0] bg-white px-3 py-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => goToPage(-1)}
              disabled={status !== 'ready' || currentPage <= 1}
              aria-label="Previous page"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#3c4043] transition-colors hover:bg-[#f1f3f4] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="px-1 font-mono text-[12px] text-[#3c4043]">
              {status === 'ready' ? `${currentPage} / ${pages.length}` : '—'}
            </span>
            <button
              type="button"
              onClick={() => goToPage(1)}
              disabled={status !== 'ready' || currentPage >= pages.length}
              aria-label="Next page"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#3c4043] transition-colors hover:bg-[#f1f3f4] disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => zoomBy(1 / ZOOM_STEP)}
              disabled={status !== 'ready' || scale <= MIN_SCALE}
              aria-label="Zoom out"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#3c4043] transition-colors hover:bg-[#f1f3f4] disabled:opacity-40"
            >
              <ZoomOut className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="px-1 font-mono text-[12px] text-[#3c4043]">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => zoomBy(ZOOM_STEP)}
              disabled={status !== 'ready' || scale >= MAX_SCALE}
              aria-label="Zoom in"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#3c4043] transition-colors hover:bg-[#f1f3f4] disabled:opacity-40"
            >
              <ZoomIn className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={resetZoom}
              disabled={status !== 'ready' || Math.abs(scale - fitScale) < 0.001}
              aria-label="Fit to width"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#3c4043] transition-colors hover:bg-[#f1f3f4] disabled:opacity-40"
            >
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => startPresentation()}
              disabled={status !== 'ready'}
              aria-label="Present"
              title="Presentation mode"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#3c4043] transition-colors hover:bg-[#f1f3f4] disabled:opacity-40"
            >
              <Presentation className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              disabled={status !== 'ready'}
              aria-label={fullscreen ? 'Exit full screen' : 'Enter full screen'}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#3c4043] transition-colors hover:bg-[#f1f3f4] disabled:opacity-40"
            >
              {fullscreen ? (
                <Minimize className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Maximize className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>

          {allowDownload && (
            <a
              href={url}
              download={filename}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-[#0b57d0] px-3.5 text-[12px] font-medium text-white transition-colors hover:bg-[#0842a0]"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Save
            </a>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={
          presenting
            ? 'min-h-0 flex-1 overflow-hidden'
            : 'min-h-0 flex-1 overflow-auto'
        }
      >
        {status === 'loading' && (
          <p className="px-4 py-8 text-center text-[12px] text-[#9aa0a6]">
            Opening the document…
          </p>
        )}
        {status === 'error' && (
          <p className="px-4 py-8 text-center text-[12px] text-[#f28b82]">{errorText}</p>
        )}
        {status === 'ready' &&
          (presenting ? (
            <div
              className="flex h-full w-full items-center justify-center"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const x = event.clientX - rect.left;
                if (x > rect.width / 2) {
                  goToPage(1);
                } else {
                  goToPage(-1);
                }
              }}
            >
              <PdfPageCanvas page={pages[currentPage - 1]} scale={presentScale} />
            </div>
          ) : (
            <div
              className="flex flex-col items-center"
              style={{
                gap: PAGE_GAP,
                padding: `${PAGE_GAP}px ${PAGE_GAP}px ${PAGE_GAP * 3}px`,
              }}
            >
              {pages.map((page, index) => (
                <div key={page.pageNumber} data-page={index + 1}>
                  <PdfPageCanvas page={page} scale={scale} />
                </div>
              ))}
            </div>
          ))}
      </div>

      {presenting && status === 'ready' && pages.length > 0 && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-t border-white/10 bg-[#1f2327]/90 px-3 py-2">
          <button
            type="button"
            onClick={() => goToPage(-1)}
            disabled={currentPage <= 1}
            aria-label="Previous page"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="px-2 font-mono text-[12px] text-white/80">
            {currentPage} / {pages.length}
          </span>
          <button
            type="button"
            onClick={() => goToPage(1)}
            disabled={currentPage >= pages.length}
            aria-label="Next page"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={stopPresentation}
            className="ml-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12px] font-medium text-white transition-colors hover:bg-white/20"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Exit
          </button>
        </div>
      )}
    </div>
  );
}