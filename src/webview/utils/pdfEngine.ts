import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { OutlineNode } from './pdfState';
import {
  buildExtractedPageFromTextItems,
  ExtractedPdfPage,
  ExtractedPdfTextItem,
  PdfSearchMatch,
} from './pdfSearch';

let workerConfigured = false;

export function ensurePdfWorkerConfigured(): void {
  if (!workerConfigured && typeof window !== 'undefined') {
    // Vite hands back a build-time asset URL. Inside a VS Code webview the document
    // origin is synthetic, so resolve it against the injected <base> instead of the
    // page origin to keep the worker on the extension's own resource root.
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      pdfWorkerUrl,
      document.baseURI
    ).href;
    workerConfigured = true;
  }
}

export interface LoadedPdfHandle {
  doc: PDFDocumentProxy;
  destroy: () => Promise<void>;
}

export async function loadPdfDocumentFromBytes(bytes: Uint8Array): Promise<LoadedPdfHandle> {
  ensurePdfWorkerConfigured();
  // Clone bytes so pdfjs transferring the buffer to worker does not detach caller's copy
  const copy = new Uint8Array(bytes);
  const loadingTask = pdfjsLib.getDocument({
    data: copy,
    useWorkerFetch: false,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;
  return {
    doc,
    destroy: () => loadingTask.destroy(),
  };
}

async function resolveDestPageNumber(
  pdfDoc: PDFDocumentProxy,
  dest: unknown
): Promise<number> {
  try {
    let resolved = dest;
    if (typeof resolved === 'string') {
      resolved = await pdfDoc.getDestination(resolved);
    }
    if (Array.isArray(resolved) && resolved.length > 0) {
      const ref = resolved[0];
      if (typeof ref === 'number') {
        return Math.max(1, Math.min(pdfDoc.numPages, ref + 1));
      }
      if (ref && typeof ref === 'object') {
        const pageIdx = await pdfDoc.getPageIndex(ref as never);
        return Math.max(1, Math.min(pdfDoc.numPages, pageIdx + 1));
      }
    }
  } catch {
    // Fallback below
  }
  return 1;
}

type RawOutlineEntry = NonNullable<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>[number];

async function convertOutlineItems(
  pdfDoc: PDFDocumentProxy,
  items: RawOutlineEntry[],
  prefix: string
): Promise<OutlineNode[]> {
  const result: OutlineNode[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const id = `${prefix}-${i + 1}`;
    const page = item.dest
      ? await resolveDestPageNumber(pdfDoc, item.dest)
      : 1;
    const children =
      item.items && item.items.length > 0
        ? await convertOutlineItems(pdfDoc, item.items, id)
        : undefined;

    result.push({
      id,
      title: item.title || `Section ${i + 1}`,
      page,
      children,
    });
  }
  return result;
}

export async function extractOutlineFromPdf(
  pdfDoc: PDFDocumentProxy,
  extractedPages?: ExtractedPdfPage[]
): Promise<OutlineNode[]> {
  const rawOutline = await pdfDoc.getOutline();
  if (rawOutline && rawOutline.length > 0) {
    return convertOutlineItems(pdfDoc, rawOutline, 'sec');
  }

  // Fallback for PDFs without embedded /Outlines: build clean page index entries
  const count = pdfDoc.numPages;
  return Array.from({ length: count }, (_, idx) => {
    const page = idx + 1;
    const inferredTitle = extractedPages?.[idx]?.sectionTitle;
    return {
      id: `page-${page}`,
      title:
        inferredTitle && inferredTitle !== `Page ${page}`
          ? `${page}. ${inferredTitle.slice(0, 44)}`
          : `Page ${page}`,
      page,
    };
  });
}

export async function extractAllPagesText(
  pdfDoc: PDFDocumentProxy,
  sectionTitlesByPage?: Record<number, string>
): Promise<ExtractedPdfPage[]> {
  const pages: ExtractedPdfPage[] = [];

  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p);
    const tc = await page.getTextContent();
    const rawItems = tc.items
      .filter((item): item is TextItem => 'str' in item && 'transform' in item)
      .map((item) => ({
        str: item.str,
        transform: item.transform,
        width: item.width,
        height: item.height,
        hasEOL: item.hasEOL,
      }));
    pages.push(
      buildExtractedPageFromTextItems(p, rawItems, sectionTitlesByPage?.[p])
    );
  }

  return pages;
}

export interface ViewportHighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

let cachedMeasureCtx: CanvasRenderingContext2D | null | undefined;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (cachedMeasureCtx !== undefined) return cachedMeasureCtx;
  if (typeof document === 'undefined') {
    cachedMeasureCtx = null;
    return null;
  }
  const canvas = document.createElement('canvas');
  cachedMeasureCtx = canvas.getContext('2d');
  return cachedMeasureCtx;
}

export function computeMatchRects(
  items: ExtractedPdfTextItem[],
  match: PdfSearchMatch,
  viewport: PageViewport
): ViewportHighlightRect[] {
  const rects: ViewportHighlightRect[] = [];
  const measureCtx = getMeasureContext();

  for (const span of match.itemSpans) {
    const item = items[span.itemIndex];
    if (!item || !item.transform) continue;

    // Combine viewport transform with PDF item text matrix [a, b, c, d, e, f]
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.max(
      10,
      Math.hypot(tx[2], tx[3]) || (item.height || 12) * viewport.scale
    );
    const totalWidth = Math.max(8, (item.width || item.str.length * 5) * viewport.scale);

    let startRatio = span.charStartRatio;
    let endRatio = span.charEndRatio;

    if (measureCtx && item.str.length > 0 && (startRatio > 0 || endRatio < 1)) {
      measureCtx.font = `${fontHeight}px serif`;
      const fullMeasured = measureCtx.measureText(item.str).width;
      if (fullMeasured > 0) {
        const startIdx = Math.round(startRatio * item.str.length);
        const endIdx = Math.round(endRatio * item.str.length);
        startRatio = measureCtx.measureText(item.str.slice(0, startIdx)).width / fullMeasured;
        endRatio = measureCtx.measureText(item.str.slice(0, endIdx)).width / fullMeasured;
      }
    }

    const startOffsetPx = totalWidth * startRatio;
    const spanWidthPx = Math.max(6, totalWidth * (endRatio - startRatio));

    rects.push({
      left: tx[4] + startOffsetPx - 1,
      top: tx[5] - fontHeight * 0.86,
      width: spanWidthPx + 2,
      height: fontHeight * 1.08,
    });
  }

  return rects;
}

export { pdfjsLib };
