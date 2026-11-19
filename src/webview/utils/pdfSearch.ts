import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

export interface PdfSearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

export interface ExtractedPdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  startOffset: number;
  endOffset: number;
}

export interface ExtractedPdfPage {
  page: number;
  sectionTitle: string;
  fullText: string;
  items: ExtractedPdfTextItem[];
}

export interface PdfMatchItemSpan {
  itemIndex: number;
  charStartRatio: number;
  charEndRatio: number;
}

export interface PdfSearchMatch {
  id: string;
  globalIndex: number;
  page: number;
  start: number;
  end: number;
  matchedText: string;
  snippetBefore: string;
  snippetAfter: string;
  itemSpans: PdfMatchItemSpan[];
}

export interface PdfSearchPageGroup {
  page: number;
  sectionTitle: string;
  matches: PdfSearchMatch[];
}

export interface PdfSearchResult {
  query: string;
  totalMatches: number;
  pageGroups: PdfSearchPageGroup[];
  flatMatches: PdfSearchMatch[];
}

export interface RawTextItemLike {
  str: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildSearchRegExp(
  query: string,
  options: PdfSearchOptions
): RegExp | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const escaped = escapeRegExp(trimmed);
  const pattern = options.wholeWord ? `\\b${escaped}\\b` : escaped;
  const flags = options.caseSensitive ? 'g' : 'gi';
  return new RegExp(pattern, flags);
}

export function buildExtractedPageFromTextItems(
  pageNumber: number,
  rawItems: RawTextItemLike[],
  fallbackTitle?: string
): ExtractedPdfPage {
  const items: ExtractedPdfTextItem[] = [];
  let fullText = '';

  for (const raw of rawItems) {
    const str = raw.str ?? '';
    if (!str) {
      if (raw.hasEOL && fullText.length > 0 && !fullText.endsWith('\n')) {
        fullText += '\n';
      }
      continue;
    }

    if (
      fullText.length > 0 &&
      !/\s$/.test(fullText) &&
      !/^\s/.test(str)
    ) {
      fullText += ' ';
    }

    const startOffset = fullText.length;
    fullText += str;
    const endOffset = fullText.length;

    items.push({
      str,
      transform: raw.transform ? [...raw.transform] : [1, 0, 0, 1, 0, 0],
      width: raw.width ?? 0,
      height: raw.height ?? 12,
      startOffset,
      endOffset,
    });

    if (raw.hasEOL && !fullText.endsWith('\n')) {
      fullText += '\n';
    }
  }

  const candidateLine = items
    .map((i) => i.str.trim())
    .find(
      (s) =>
        s.length >= 4 &&
        !/^arXiv:/i.test(s) &&
        !/^Vaswani et al\./i.test(s) &&
        !/^\d+$/.test(s)
    );

  return {
    page: pageNumber,
    sectionTitle: fallbackTitle || candidateLine || `Page ${pageNumber}`,
    fullText,
    items,
  };
}

export interface PdfTextIndexOptions {
  signal?: AbortSignal;
  onProgress?: (pages: ExtractedPdfPage[], failedPages: number[]) => void;
}

export async function extractPdfTextIndex(
  pdfDoc: Pick<PDFDocumentProxy, 'numPages' | 'getPage'>,
  sectionTitlesByPage?: Record<number, string>,
  { signal, onProgress }: PdfTextIndexOptions = {}
): Promise<ExtractedPdfPage[]> {
  const pages: ExtractedPdfPage[] = [];
  const failedPages: number[] = [];
  let lastUpdate = 0;

  for (let p = 1; p <= pdfDoc.numPages; p++) {
    signal?.throwIfAborted();
    let items: TextItem[] = [];
    try {
      const page = await pdfDoc.getPage(p);
      signal?.throwIfAborted();
      const content = await page.getTextContent();
      items = content.items.filter((item): item is TextItem => 'str' in item);
    } catch (error) {
      signal?.throwIfAborted();
      // 单页文本损坏不能阻止后续页面建立索引，空页占位保持页码对应关系。
      failedPages.push(p);
    }
    signal?.throwIfAborted();
    pages.push(buildExtractedPageFromTextItems(p, items, sectionTitlesByPage?.[p]));

    const now = performance.now();
    if (p === 1 || p === pdfDoc.numPages || now - lastUpdate >= 100) {
      onProgress?.(pages.slice(), failedPages.slice());
      lastUpdate = now;
    }
    // 分批让出主线程，避免缓存命中时连续微任务阻塞交互与绘制。
    if (p % 4 === 0 && p < pdfDoc.numPages) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  signal?.throwIfAborted();
  return pages;
}

function buildSnippet(
  text: string,
  start: number,
  end: number,
  radius = 32
): { snippetBefore: string; matchedText: string; snippetAfter: string } {
  const beforeStart = Math.max(0, start - radius);
  const afterEnd = Math.min(text.length, end + radius);
  const prefix = beforeStart > 0 ? '...' : '';
  const suffix = afterEnd < text.length ? '...' : '';

  return {
    snippetBefore: prefix + text.slice(beforeStart, start).replace(/\s+/g, ' '),
    matchedText: text.slice(start, end),
    snippetAfter: text.slice(end, afterEnd).replace(/\s+/g, ' ') + suffix,
  };
}

function resolveItemSpans(
  items: ExtractedPdfTextItem[],
  matchStart: number,
  matchEnd: number
): PdfMatchItemSpan[] {
  const spans: PdfMatchItemSpan[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.endOffset <= matchStart || item.startOffset >= matchEnd) {
      continue;
    }
    const len = Math.max(1, item.endOffset - item.startOffset);
    const overlapStart = Math.max(item.startOffset, matchStart) - item.startOffset;
    const overlapEnd = Math.min(item.endOffset, matchEnd) - item.startOffset;

    spans.push({
      itemIndex: i,
      charStartRatio: overlapStart / len,
      charEndRatio: overlapEnd / len,
    });
  }

  return spans;
}

export function searchPdfPages(
  pages: ExtractedPdfPage[],
  query: string,
  options: PdfSearchOptions
): PdfSearchResult {
  const regex = buildSearchRegExp(query, options);
  if (!regex) {
    return {
      query,
      totalMatches: 0,
      pageGroups: [],
      flatMatches: [],
    };
  }

  const pageGroups: PdfSearchPageGroup[] = [];
  const flatMatches: PdfSearchMatch[] = [];

  for (const pageItem of pages) {
    const pageMatches: PdfSearchMatch[] = [];
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(pageItem.fullText)) !== null) {
      if (match[0].length === 0) {
        regex.lastIndex += 1;
        continue;
      }
      const start = match.index;
      const end = start + match[0].length;
      const id = `p${pageItem.page}-${start}`;
      const snippet = buildSnippet(pageItem.fullText, start, end);
      const itemSpans = resolveItemSpans(pageItem.items, start, end);

      const entry: PdfSearchMatch = {
        id,
        globalIndex: flatMatches.length,
        page: pageItem.page,
        start,
        end,
        ...snippet,
        itemSpans,
      };
      pageMatches.push(entry);
      flatMatches.push(entry);
    }

    if (pageMatches.length > 0) {
      pageGroups.push({
        page: pageItem.page,
        sectionTitle: pageItem.sectionTitle,
        matches: pageMatches,
      });
    }
  }

  return {
    query,
    totalMatches: flatMatches.length,
    pageGroups,
    flatMatches,
  };
}

export function stepMatchIndex(
  currentIndex: number,
  delta: 1 | -1,
  totalMatches: number
): number {
  if (totalMatches <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= totalMatches) {
    return delta === 1 ? 0 : totalMatches - 1;
  }
  return (currentIndex + delta + totalMatches) % totalMatches;
}
