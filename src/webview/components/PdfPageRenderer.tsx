import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TextLayer, setLayerDimensions } from 'pdfjs-dist';
import type { PDFDocumentProxy, PageViewport, RenderTask } from 'pdfjs-dist';
import { computeMatchRects } from '../utils/pdfEngine';
import { ExtractedPdfTextItem, PdfSearchMatch } from '../utils/pdfSearch';
import { PointerTool, ReadingColorMode } from '../utils/pdfState';

interface PdfPageRendererProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  rotation: number;
  colorMode: ReadingColorMode;
  pointerTool: PointerTool;
  extractedItems: ExtractedPdfTextItem[];
  matchesOnPage: PdfSearchMatch[];
  activeMatchId: string | null;
  registerPageElement?: (pageNumber: number, el: HTMLElement | null) => void;
}

const PAPER_FILTER_CLASS: Record<ReadingColorMode, string> = {
  'dark-paper': 'pdf-paper-dark',
  'light-paper': 'pdf-paper-light',
  sepia: 'pdf-paper-sepia',
  inverted: 'pdf-paper-inverted',
};

const PAPER_FRAME_BORDER: Record<ReadingColorMode, string> = {
  'dark-paper': 'border-[#35312a] bg-[#22201d]',
  'light-paper': 'border-[#d8d0c1] bg-[#ffffff]',
  sepia: 'border-[#473c2d] bg-[#2c251c]',
  inverted: 'border-[#3c4a41] bg-[#080808]',
};

export const PdfPageRenderer: React.FC<PdfPageRendererProps> = ({
  pdfDoc,
  pageNumber,
  zoom,
  rotation,
  colorMode,
  pointerTool,
  extractedItems,
  matchesOnPage,
  activeMatchId,
  registerPageElement,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const activeMarkRef = useRef<HTMLDivElement>(null);

  const [viewportState, setViewportState] = useState<PageViewport | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    registerPageElement?.(pageNumber, containerRef.current);
    return () => registerPageElement?.(pageNumber, null);
  }, [pageNumber, registerPageElement]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let textLayerTask: TextLayer | null = null;

    const renderPage = async () => {
      try {
        setRenderError(null);
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        // 100% zoom maps PDF 72dpi points comfortably at ~1.22 CSS px for crisp reading
        const baseScale = (zoom / 100) * 1.22;
        const viewport = page.getViewport({ scale: baseScale, rotation });
        setViewportState(viewport);

        const canvas = canvasRef.current;
        const textContainer = textLayerRef.current;
        if (!canvas || !textContainer) return;

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
        if (cancelled) return;

        // Render selectable text layer
        textContainer.replaceChildren();
        textContainer.style.setProperty('--total-scale-factor', String(viewport.scale));
        textContainer.style.setProperty('--scale-round-x', '1px');
        textContainer.style.setProperty('--scale-round-y', '1px');
        setLayerDimensions(textContainer, viewport);

        const textContent = await page.getTextContent();
        if (cancelled) return;

        textLayerTask = new TextLayer({
          textContentSource: textContent,
          container: textContainer,
          viewport,
        });
        await textLayerTask.render();
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : '';
        if (name === 'RenderingCancelledException' || name === 'AbortException') {
          return;
        }
        setRenderError(err instanceof Error ? err.message : 'Failed to render PDF page.');
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      try {
        renderTask?.cancel();
      } catch {
        // ignore cancel races
      }
      try {
        textLayerTask?.cancel();
      } catch {
        // ignore cancel races
      }
    };
  }, [pdfDoc, pageNumber, zoom, rotation]);

  const highlightBoxes = useMemo(() => {
    if (!viewportState || matchesOnPage.length === 0 || extractedItems.length === 0) {
      return [];
    }
    return matchesOnPage.flatMap((match) => {
      const rects = computeMatchRects(extractedItems, match, viewportState);
      return rects.map((rect, idx) => ({
        key: `${match.id}-${idx}`,
        isActive: match.id === activeMatchId,
        isFirstOfActive: idx === 0 && match.id === activeMatchId,
        rect,
      }));
    });
  }, [activeMatchId, extractedItems, matchesOnPage, viewportState]);

  useEffect(() => {
    if (activeMatchId && activeMarkRef.current) {
      activeMarkRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeMatchId, pageNumber, viewportState]);

  return (
    <div
      ref={containerRef}
      data-pdf-page={pageNumber}
      aria-label={`PDF Page ${pageNumber}`}
      className="flex flex-col items-center shrink-0"
    >
      {/* Subtle Page Telemetry Strip */}
      <div
        style={{ width: viewportState ? `${viewportState.width}px` : undefined }}
        className="w-full min-w-[260px] flex items-center justify-between px-2 py-1 bg-surface-container-low border border-b-0 border-outline-variant/40 font-mono text-[10px] text-on-surface-variant select-none"
      >
        <span className="tabular-nums">
          PAGE {pageNumber}
          {viewportState
            ? ` · ${Math.round(viewportState.width)}×${Math.round(viewportState.height)}px`
            : ''}
        </span>
        <div className="flex items-center gap-2">
          {matchesOnPage.length > 0 && (
            <span className="text-tertiary tabular-nums">
              {matchesOnPage.length} match{matchesOnPage.length === 1 ? '' : 'es'}
            </span>
          )}
        </div>
      </div>

      {/* Rendered PDF Page Canvas + Search Highlights + Selectable Text Layer */}
      <div
        className={`relative border shadow-2xl overflow-hidden ${PAPER_FRAME_BORDER[colorMode]}`}
        style={{
          width: viewportState ? `${viewportState.width}px` : '744px',
          height: viewportState ? `${viewportState.height}px` : '964px',
        }}
      >
        <canvas
          ref={canvasRef}
          className={`block ${PAPER_FILTER_CLASS[colorMode]}`}
        />

        {/* Search Match Bounding-Box Highlight Layer */}
        {highlightBoxes.length > 0 && (
          <div className="absolute inset-0 pointer-events-none z-[1]">
            {highlightBoxes.map((box) => (
              <div
                key={box.key}
                ref={box.isFirstOfActive ? activeMarkRef : undefined}
                data-active-match={box.isActive ? 'true' : undefined}
                style={{
                  left: `${box.rect.left}px`,
                  top: `${box.rect.top}px`,
                  width: `${box.rect.width}px`,
                  height: `${box.rect.height}px`,
                }}
                className={
                  box.isActive
                    ? 'absolute bg-primary/35 border border-primary shadow-[0_0_0_1px_rgba(75,223,153,0.65)]'
                    : 'absolute bg-tertiary/30 border border-tertiary/80'
                }
              />
            ))}
          </div>
        )}

        {/* pdfjs-dist Selectable TextLayer */}
        <div
          ref={textLayerRef}
          className={`textLayer ${pointerTool === 'pan' ? 'pointer-events-none' : ''}`}
        />

        {renderError && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-container-lowest/90 p-4 font-mono text-xs text-error">
            {renderError}
          </div>
        )}
      </div>
    </div>
  );
};
