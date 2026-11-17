import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { ReadingColorMode } from '../utils/pdfState';

interface PdfThumbnailItemProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  isActive: boolean;
  colorMode: ReadingColorMode;
  onSelect: (page: number) => void;
}

const THUMB_FILTER: Record<ReadingColorMode, string> = {
  'dark-paper': 'pdf-paper-dark',
  'light-paper': 'pdf-paper-light',
  sepia: 'pdf-paper-sepia',
  inverted: 'pdf-paper-inverted',
};

export const PdfThumbnailItem: React.FC<PdfThumbnailItemProps> = ({
  pdfDoc,
  pageNumber,
  isActive,
  colorMode,
  onSelect,
}) => {
  const hostRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 6);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    const drawThumb = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const targetWidth = 104;
        const scale = targetWidth / base.width;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        renderTask = page.render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        await renderTask.promise;
        if (!cancelled) setRendered(true);
      } catch {
        // Ignore cancel
      }
    };

    drawThumb();

    return () => {
      cancelled = true;
      try {
        renderTask?.cancel();
      } catch {
        // ignore
      }
    };
  }, [pdfDoc, pageNumber, visible]);

  return (
    <button
      ref={hostRef}
      type="button"
      onClick={() => onSelect(pageNumber)}
      className={`p-1.5 text-left bg-surface-container border transition-colors flex flex-col items-center ${
        isActive
          ? 'border-primary bg-surface-container-high'
          : 'border-outline-variant/40 hover:border-outline'
      }`}
    >
      <div className="w-full flex items-center justify-center bg-surface-container-lowest border border-outline-variant/30 mb-1.5 min-h-[124px] overflow-hidden relative">
        <canvas
          ref={canvasRef}
          className={`block ${THUMB_FILTER[colorMode]} ${rendered ? 'opacity-100' : 'opacity-0'}`}
        />
        {!rendered && (
          <span className="absolute font-mono text-[10px] text-outline tabular-nums">
            P.{pageNumber}
          </span>
        )}
      </div>
      <div className="w-full flex items-center justify-center font-mono text-[10px] tabular-nums">
        <span className={isActive ? 'text-primary font-bold' : 'text-on-surface'}>
          Page {pageNumber}
        </span>
      </div>
    </button>
  );
};
