import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfReaderCanvas } from './components/PdfReaderCanvas';
import { PdfSidebar, PdfSidebarTab } from './components/PdfSidebar';
import { PDF_PAGES } from './data/workspaceFixtures';
import {
  extractAllPagesText,
  extractOutlineFromPdf,
  loadPdfDocumentFromBytes,
} from './utils/pdfEngine';
import {
  clampPage,
  clampZoom,
  INITIAL_ANNOTATIONS,
  INITIAL_BOOKMARKS,
  OutlineNode,
  PdfAnnotation,
  PdfBookmark,
  PointerTool,
  ReadingColorMode,
  ViewLayoutMode,
} from './utils/pdfState';
import {
  ExtractedPdfPage,
  PdfSearchMatch,
  PdfSearchOptions,
  searchPdfPages,
  stepMatchIndex,
} from './utils/pdfSearch';
import { buildSamplePdfBytes } from './utils/samplePdfBuilder';
import { PdfLoadTrace } from './utils/pdfLoadDiagnostics';
import { afterNextPaint } from './utils/pdfRenderScheduling';
import {
  decodePdfBytes,
  getVsCodeApi,
  IncomingHostMessage,
  postToVsCodeHost,
} from './utils/vscodeBridge';

const SAMPLE_PDF_NAME = 'paper-attention.pdf';

function readStoredList<T>(key: string, fallback: T[]): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [pdfSidebarTab, setPdfSidebarTab] = useState<PdfSidebarTab>('outline');
  const [toolbarHeight, setToolbarHeight] = useState(40);

  // PDF.js Document State
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>(SAMPLE_PDF_NAME);
  const [docStorageKey, setDocStorageKey] = useState<string>(SAMPLE_PDF_NAME);
  const [isCustomPdf, setIsCustomPdf] = useState<boolean>(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(true);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  // True once a document is bound to its own storage key. Annotations and
  // bookmarks must not be persisted before that, or the empty pre-load state
  // would overwrite the entries already stored for the document being opened.
  const [docReady, setDocReady] = useState<boolean>(false);
  const [extractedPages, setExtractedPages] = useState<ExtractedPdfPage[]>([]);
  const activeDestroyRef = useRef<(() => Promise<void>) | null>(null);
  const activeLoadRef = useRef<AbortController | null>(null);
  const indexAbortRef = useRef<AbortController | null>(null);
  const activeDocRef = useRef<PDFDocumentProxy | null>(null);
  const [firstPageRendered, setFirstPageRendered] = useState(false);
  const [backgroundReadyDoc, setBackgroundReadyDoc] = useState<PDFDocumentProxy | null>(null);
  const backgroundWorkEnabled = pdfDoc !== null && backgroundReadyDoc === pdfDoc;
  const [isOutlineLoading, setIsOutlineLoading] = useState(true);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);
  const pendingSearchJumpRef = useRef(false);
  const [initialLoadTrace] = useState(() => new PdfLoadTrace('waiting'));
  const loadTraceRef = useRef(initialLoadTrace);
  const firstRenderPageRef = useRef(1);
  const traceSequenceRef = useRef(0);
  const beginLoadTrace = useCallback((id = `webview-${++traceSequenceRef.current}`) => {
    activeLoadRef.current?.abort();
    indexAbortRef.current?.abort();
    activeDocRef.current = null;
    setPdfDoc(null);
    setDocReady(false);
    setTotalPages(0);
    setOutline([]);
    setExtractedPages([]);
    setFirstPageRendered(false);
    setBackgroundReadyDoc(null);
    setIsOutlineLoading(true);
    setIsIndexing(false);
    setIndexError(null);
    setIsLoadingPdf(true);
    setPdfLoadError(null);
    const trace = new PdfLoadTrace(id, () => performance.now(), (stage, elapsedMs) => {
      if (stage !== 'waiting-host') {
        postToVsCodeHost({ type: 'pdfLoadStage', requestId: loadTraceRef.current.requestId, stage, elapsedMs });
      }
    });
    loadTraceRef.current = trace;
    return trace;
  }, []);

  // Reader View State (restores VS Code Webview state when running inside VS Code)
  const initialVsCodeState = getVsCodeApi()?.getState<{
    currentPage?: number;
    zoom?: number;
    colorMode?: ReadingColorMode;
  }>();
  const [currentPage, setCurrentPage] = useState<number>(
    initialVsCodeState?.currentPage ?? 1
  );
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const [zoom, setZoom] = useState<number>(initialVsCodeState?.zoom ?? 100);
  const [rotation, setRotation] = useState<number>(0);
  const [colorMode, setColorMode] = useState<ReadingColorMode>(
    initialVsCodeState?.colorMode ?? 'light-paper'
  );
  const [layoutMode, setLayoutMode] = useState<ViewLayoutMode>('continuous');
  const [pointerTool, setPointerTool] = useState<PointerTool>('select');

  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [bookmarks, setBookmarks] = useState<PdfBookmark[]>([]);

  // PDF Search State
  const [pdfSearchOpen, setPdfSearchOpen] = useState<boolean>(false);
  const [pdfSearchQuery, setPdfSearchQuery] = useState<string>('');
  const [pdfSearchOptions, setPdfSearchOptions] = useState<PdfSearchOptions>({
    caseSensitive: false,
    wholeWord: false,
  });
  const [activeMatchIndex, setActiveMatchIndex] = useState<number>(0);

  const loadPdfStream = useCallback(
    async (
      data: unknown,
      fileName: string,
      custom: boolean,
      initialPage: number,
      trace = beginLoadTrace(),
    ) => {
      activeLoadRef.current?.abort();
      indexAbortRef.current?.abort();
      const controller = new AbortController();
      activeLoadRef.current = controller;
      activeDocRef.current = null;
      const previousDestroy = activeDestroyRef.current;
      activeDestroyRef.current = null;
      setIsLoadingPdf(true);
      setPdfFileName(fileName);
      setPdfLoadError(null);
      setDocReady(false);
      setPdfDoc(null);
      setTotalPages(0);
      setOutline([]);
      setExtractedPages([]);
      setFirstPageRendered(false);
      setBackgroundReadyDoc(null);
      setIsOutlineLoading(true);
      setIsIndexing(false);
      setIndexError(null);
      setActiveMatchIndex(0);
      pendingSearchJumpRef.current = false;
      try {
        if (previousDestroy) trace.mark('closing');
        await previousDestroy?.().catch(() => {});
        controller.signal.throwIfAborted();
        trace.mark('decoding');
        const bytes = decodePdfBytes(data);
        trace.update({ bytes: bytes.byteLength });
        // PDF.js 会转移缓冲区，存储键必须在转移前记录文件长度。
        const key = custom ? `${fileName}:${bytes.byteLength}` : SAMPLE_PDF_NAME;
        const { doc, destroy } = await loadPdfDocumentFromBytes(bytes, controller.signal, stage => {
          if (!controller.signal.aborted) trace.mark(stage);
        });
        if (controller.signal.aborted) {
          await destroy();
          return;
        }
        activeDestroyRef.current = destroy;
        activeDocRef.current = doc;
        firstRenderPageRef.current = Math.max(1, Math.min(doc.numPages, initialPage));
        trace.update({ pages: doc.numPages });
        trace.mark('rendering');
        setPdfFileName(fileName);
        setDocStorageKey(key);
        setIsCustomPdf(custom);
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setIsIndexing(true);
        setCurrentPage(Math.max(1, Math.min(doc.numPages, initialPage)));
        setDocReady(true);

        setAnnotations(
          readStoredList(
            `pdf-reader-pro:annotations:${key}`,
            custom ? [] : INITIAL_ANNOTATIONS
          )
        );
        setBookmarks(
          readStoredList(
            `pdf-reader-pro:bookmarks:${key}`,
            custom ? [] : INITIAL_BOOKMARKS
          )
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        trace.mark('error');
        const msg = err instanceof Error ? err.message : 'Unable to parse PDF binary.';
        setPdfLoadError(msg);
        // Never leave a failed document showing the previous one's structure.
        setOutline([]);
        setExtractedPages([]);
        setTotalPages(0);
        setDocReady(false);
      } finally {
        if (!controller.signal.aborted) setIsLoadingPdf(false);
      }
    },
    [beginLoadTrace]
  );

  const handlePageRendered = useCallback((doc: PDFDocumentProxy, page: number, phase: 'canvas' | 'text' | 'error') => {
    if (activeDocRef.current !== doc) return;
    const trace = loadTraceRef.current;
    if (trace.snapshot().stage === 'rendering') {
      // 首屏尚未完成时用户可能已跳页，不能把邻页预加载当作首屏成功。
      if (page !== currentPageRef.current) return;
      firstRenderPageRef.current = page;
    }
    if (page !== firstRenderPageRef.current) return;
    if (phase === 'canvas') {
      trace.mark('ready');
      setFirstPageRendered(true);
    } else {
      trace.textLayer(phase === 'error');
      if (phase === 'error') {
        trace.mark('error');
        // 当前页损坏也要解除后台门槛，允许通过目录或缩略图继续阅读其他页。
        setFirstPageRendered(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!pdfDoc || !firstPageRendered) return;
    return afterNextPaint(() => {
      // 延迟回调只能解锁所属文档，切换文件后不得影响新文档的首屏。
      if (activeDocRef.current === pdfDoc) setBackgroundReadyDoc(pdfDoc);
    });
  }, [pdfDoc, firstPageRendered]);

  useEffect(() => {
    if (!pdfDoc || !backgroundWorkEnabled) return;
    let cancelled = false;
    // 目录解析延后到首屏获得绘制机会后，异常目录不应阻止正文阅读。
    extractOutlineFromPdf(pdfDoc).then((nodes) => {
      if (!cancelled && activeDocRef.current === pdfDoc) setOutline(nodes);
    }).catch(() => {}).finally(() => {
      if (!cancelled && activeDocRef.current === pdfDoc) setIsOutlineLoading(false);
    });
    return () => { cancelled = true; };
  }, [pdfDoc, backgroundWorkEnabled]);

  useEffect(() => {
    if (!pdfDoc || !backgroundWorkEnabled) return;
    const controller = new AbortController();
    indexAbortRef.current = controller;
    const sectionTitles = isCustomPdf
      ? undefined
      : Object.fromEntries(PDF_PAGES.map((page) => [page.page, page.sectionTitle]));
    // 与目录和邻页共用首屏门槛，避免邻页文字层提前触发全文索引。
    extractAllPagesText(pdfDoc, sectionTitles, {
      signal: controller.signal,
      onProgress: (pages, failedPages) => {
        if (controller.signal.aborted) return;
        setExtractedPages(pages);
        setIndexError(failedPages.length ? `${failedPages.length} 页无法提取文本，搜索结果可能不完整。` : null);
      },
    }).then(() => {
      if (!controller.signal.aborted) setIsIndexing(false);
    }).catch(() => {
      if (!controller.signal.aborted) {
        setIsIndexing(false);
        setIndexError('搜索索引建立失败，仍可继续阅读 PDF。');
      }
    });
    return () => controller.abort();
  }, [pdfDoc, backgroundWorkEnabled, isCustomPdf]);

  const displayOutline = useMemo(() => outline.map((node) => {
    const page = extractedPages[node.page - 1];
    return node.id === `page-${node.page}` && page && page.sectionTitle !== `Page ${node.page}`
      ? { ...node, title: `${node.page}. ${page.sectionTitle.slice(0, 44)}` }
      : node;
  }), [outline, extractedPages]);
  const searchIndexStatus = isIndexing
    ? `正在建立搜索索引 ${extractedPages.length} / ${totalPages} 页，结果陆续更新`
    : indexError;

  // Listen for VS Code Extension Host messages or load standalone sample PDF
  // (totalPages is read through a ref so a late document parse cannot re-run
  // this effect and re-load / reset the page while the user is reading).
  const totalPagesRef = useRef(0);
  totalPagesRef.current = totalPages;
  useEffect(() => {
    let hostRequestId = 0;
    const handleHostMessage = async (event: MessageEvent<IncomingHostMessage>) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'pdfLoadProgress') {
        if (msg.stage === 'reading-file') {
          hostRequestId++;
          const trace = loadTraceRef.current.snapshot().stage === 'waiting-host'
            ? loadTraceRef.current : beginLoadTrace(msg.requestId);
          trace.requestId = msg.requestId;
          trace.mark('reading-file');
          setIsLoadingPdf(true);
          setPdfLoadError(null);
        } else if (msg.requestId === loadTraceRef.current.requestId && msg.stage === 'transferring') {
          loadTraceRef.current.mark('transferring');
        }
      } else if (msg.type === 'pdfLoadTiming') {
        if (msg.requestId === loadTraceRef.current.requestId) loadTraceRef.current.update({ host: msg.timings });
      } else if (msg.type === 'pdfLoadError') {
        if (msg.requestId !== loadTraceRef.current.requestId) return;
        hostRequestId++;
        activeLoadRef.current?.abort();
        indexAbortRef.current?.abort();
        activeDocRef.current = null;
        setFirstPageRendered(false);
        setBackgroundReadyDoc(null);
        void activeDestroyRef.current?.().catch(() => {});
        activeDestroyRef.current = null;
        loadTraceRef.current.mark('error');
        setIsLoadingPdf(false);
        setPdfLoadError(msg.message);
        setPdfDoc(null);
        setDocReady(false);
        setTotalPages(0);
        setOutline([]);
        setExtractedPages([]);
        setIsIndexing(false);
      } else if (msg.type === 'loadPdf') {
        if (msg.requestId && msg.requestId !== loadTraceRef.current.requestId) return;
        const requestId = ++hostRequestId;
        const trace = msg.requestId ? loadTraceRef.current : beginLoadTrace();
        trace.update({ host: msg.timings });
        if (msg.requestId) postToVsCodeHost({ type: 'pdfLoadReceived', requestId: msg.requestId });
        if (msg.data !== undefined) {
          await loadPdfStream(msg.data, msg.fileName || 'document.pdf', true, 1, trace);
        } else if (msg.url) {
          trace.mark('fetching');
          setIsLoadingPdf(true);
          setPdfLoadError(null);
          try {
            const res = await fetch(msg.url);
            if (!res.ok) throw new Error(`PDF request failed: ${res.status}`);
            const buf = await res.arrayBuffer();
            if (requestId !== hostRequestId) return;
            const inferredName =
              msg.fileName || msg.url.split('/').pop()?.split('?')[0] || 'document.pdf';
            await loadPdfStream(new Uint8Array(buf), inferredName, true, 1, trace);
          } catch (err) {
            if (requestId !== hostRequestId) return;
            trace.mark('error');
            setIsLoadingPdf(false);
            setPdfLoadError(
              err instanceof Error ? err.message : 'Failed to fetch PDF from host.'
            );
          }
        } else {
          await loadPdfStream(undefined, msg.fileName || 'document.pdf', true, 1, trace);
        }
      } else if (msg.type === 'toggleColorMode') {
        const order: ReadingColorMode[] = ['dark-paper', 'light-paper', 'sepia', 'inverted'];
        setColorMode((prev) => order[(order.indexOf(prev) + 1) % order.length]);
      } else if (msg.type === 'jumpToLocation' && msg.payload?.page) {
        setCurrentPage((prev) => clampPage(msg.payload?.page ?? prev, totalPagesRef.current));
      }
    };

    window.addEventListener('message', handleHostMessage);
    const trace = beginLoadTrace();
    const insideVsCode = postToVsCodeHost({ type: 'ready' });
    if (!insideVsCode) loadPdfStream(buildSamplePdfBytes(), SAMPLE_PDF_NAME, false, 1, trace);

    return () => {
      window.removeEventListener('message', handleHostMessage);
      hostRequestId++;
      activeLoadRef.current?.abort();
      indexAbortRef.current?.abort();
      activeDocRef.current = null;
      if (activeDestroyRef.current) {
        activeDestroyRef.current().catch(() => {});
        activeDestroyRef.current = null;
      }
    };
  }, [loadPdfStream, beginLoadTrace]);

  // Sync Webview reading state to VS Code host (no-op in standalone preview)
  useEffect(() => {
    getVsCodeApi()?.setState({ currentPage, zoom, colorMode });
  }, [currentPage, zoom, colorMode]);

  // Persist annotations & bookmarks per active PDF document
  useEffect(() => {
    if (!docReady) return;
    try {
      window.localStorage.setItem(
        `pdf-reader-pro:annotations:${docStorageKey}`,
        JSON.stringify(annotations)
      );
      window.localStorage.setItem(
        `pdf-reader-pro:bookmarks:${docStorageKey}`,
        JSON.stringify(bookmarks)
      );
    } catch {
      // ignore storage quota errors
    }
  }, [annotations, bookmarks, docStorageKey, docReady]);

  const pdfSearchResult = useMemo(
    () => searchPdfPages(extractedPages, pdfSearchQuery, pdfSearchOptions),
    [extractedPages, pdfSearchQuery, pdfSearchOptions]
  );

  useEffect(() => {
    if (!pendingSearchJumpRef.current || pdfSearchResult.totalMatches === 0) return;
    pendingSearchJumpRef.current = false;
    setActiveMatchIndex(0);
    setCurrentPage(pdfSearchResult.flatMatches[0].page);
  }, [pdfSearchResult]);

  const matchesByPage = useMemo(() => {
    const map: Record<number, PdfSearchMatch[]> = {};
    for (const group of pdfSearchResult.pageGroups) {
      map[group.page] = group.matches;
    }
    return map;
  }, [pdfSearchResult.pageGroups]);

  const clampedMatchIndex =
    pdfSearchResult.totalMatches > 0
      ? Math.min(activeMatchIndex, pdfSearchResult.totalMatches - 1)
      : -1;
  const activeMatch =
    clampedMatchIndex >= 0
      ? pdfSearchResult.flatMatches[clampedMatchIndex]
      : null;

  const handleAddAnnotation = useCallback(
    (page: number, excerpt: string, note: string) => {
      const next: PdfAnnotation = {
        id: `ann-${Date.now()}`,
        page,
        excerpt,
        note,
        color: 'primary',
        createdAt: `Page ${page} · Note`,
      };
      setAnnotations((prev) => [next, ...prev]);
    },
    []
  );

  const handleQuickHighlight = useCallback(
    (page: number, excerpt: string) => {
      handleAddAnnotation(
        page,
        excerpt,
        'Highlighted from PDF TextLayer selection.'
      );
      setPdfSidebarTab('annotations');
      setSidebarOpen(true);
    },
    [handleAddAnnotation]
  );

  const handleToggleCurrentBookmark = useCallback(() => {
    const existing = bookmarks.find((b) => b.page === currentPage);
    if (existing) {
      setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
    } else {
      const pageMeta = extractedPages[currentPage - 1];
      setBookmarks((prev) => [
        {
          id: `bm-${Date.now()}`,
          title: pageMeta?.sectionTitle ?? `Page ${currentPage}`,
          subtitle: `${pdfFileName} · Page ${currentPage}`,
          page: currentPage,
          accent: 'primary',
        },
        ...prev,
      ]);
    }
  }, [bookmarks, currentPage, extractedPages, pdfFileName]);

  const syncMatchPage = useCallback(
    (nextResultCount: number, matches: PdfSearchMatch[], preferredIndex: number) => {
      if (nextResultCount <= 0) {
        setActiveMatchIndex(0);
        return;
      }
      const targetIdx = Math.max(0, Math.min(preferredIndex, nextResultCount - 1));
      setActiveMatchIndex(targetIdx);
      setCurrentPage(matches[targetIdx].page);
    },
    []
  );

  const handleChangePdfSearchQuery = useCallback(
    (nextQuery: string) => {
      setPdfSearchQuery(nextQuery);
      const nextRes = searchPdfPages(extractedPages, nextQuery, pdfSearchOptions);
      pendingSearchJumpRef.current = Boolean(nextQuery.trim()) && nextRes.totalMatches === 0;
      if (nextRes.totalMatches > 0) {
        const onCurrentIdx = nextRes.flatMatches.findIndex((m) => m.page === currentPage);
        syncMatchPage(
          nextRes.totalMatches,
          nextRes.flatMatches,
          onCurrentIdx >= 0 ? onCurrentIdx : 0
        );
      } else {
        setActiveMatchIndex(0);
      }
    },
    [currentPage, extractedPages, pdfSearchOptions, syncMatchPage]
  );

  const handleToggleCaseSensitive = useCallback(() => {
    const nextOpts = {
      ...pdfSearchOptions,
      caseSensitive: !pdfSearchOptions.caseSensitive,
    };
    setPdfSearchOptions(nextOpts);
    const nextRes = searchPdfPages(extractedPages, pdfSearchQuery, nextOpts);
    pendingSearchJumpRef.current = Boolean(pdfSearchQuery.trim()) && nextRes.totalMatches === 0;
    syncMatchPage(nextRes.totalMatches, nextRes.flatMatches, 0);
  }, [extractedPages, pdfSearchOptions, pdfSearchQuery, syncMatchPage]);

  const handleToggleWholeWord = useCallback(() => {
    const nextOpts = {
      ...pdfSearchOptions,
      wholeWord: !pdfSearchOptions.wholeWord,
    };
    setPdfSearchOptions(nextOpts);
    const nextRes = searchPdfPages(extractedPages, pdfSearchQuery, nextOpts);
    pendingSearchJumpRef.current = Boolean(pdfSearchQuery.trim()) && nextRes.totalMatches === 0;
    syncMatchPage(nextRes.totalMatches, nextRes.flatMatches, 0);
  }, [extractedPages, pdfSearchOptions, pdfSearchQuery, syncMatchPage]);

  const handleStepMatch = useCallback(
    (delta: 1 | -1) => {
      if (pdfSearchResult.totalMatches <= 0) return;
      const nextIdx = stepMatchIndex(
        clampedMatchIndex,
        delta,
        pdfSearchResult.totalMatches
      );
      setActiveMatchIndex(nextIdx);
      const target = pdfSearchResult.flatMatches[nextIdx];
      if (target) {
        setCurrentPage(target.page);
      }
    },
    [clampedMatchIndex, pdfSearchResult]
  );

  const handleSelectMatch = useCallback((match: PdfSearchMatch) => {
    setActiveMatchIndex(match.globalIndex);
    setCurrentPage(match.page);
    setPdfSearchOpen(true);
  }, []);

  const handleSearchFromSelection = useCallback(
    (query: string) => {
      setPdfSearchOpen(true);
      handleChangePdfSearchQuery(query);
      setPdfSidebarTab('search');
      setSidebarOpen(true);
    },
    [handleChangePdfSearchQuery]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setPdfSearchOpen(true);
        setPdfSidebarTab('search');
        setSidebarOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarOpen((s) => !s);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setZoom((z) => clampZoom(z + 15));
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        setZoom((z) => clampZoom(z - 15));
      } else if (!isEditingInput && (e.key === 'ArrowLeft' || e.key === 'PageUp')) {
        e.preventDefault();
        setCurrentPage((p) => clampPage(p - 1, totalPages));
      } else if (!isEditingInput && (e.key === 'ArrowRight' || e.key === 'PageDown')) {
        e.preventDefault();
        setCurrentPage((p) => clampPage(p + 1, totalPages));
      }
    };
    const onResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [totalPages]);

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-surface text-on-surface relative">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close Sidebar Drawer"
          onClick={() => setSidebarOpen(false)}
          className="md:hidden fixed inset-0 z-20 bg-black/50"
        />
      )}

      {/* Collapsible PDF Navigation & Search Sidebar */}
      {sidebarOpen && (
        <aside
          aria-label="PDF Navigation Sidebar"
          className="w-[276px] max-md:w-72 shrink-0 bg-surface-container-low border-r border-outline-variant/40 flex flex-col min-h-0 z-30 max-md:absolute max-md:left-0 max-md:top-0 max-md:bottom-0 max-md:shadow-2xl"
        >
          <PdfSidebar
            headerHeight={toolbarHeight}
            activeTab={pdfSidebarTab}
            onSelectTab={setPdfSidebarTab}
            pdfDoc={pdfDoc}
            totalPages={totalPages}
            colorMode={colorMode}
            outline={displayOutline}
            isOutlineLoading={isOutlineLoading}
            backgroundWorkEnabled={backgroundWorkEnabled}
            currentPage={currentPage}
            annotations={annotations}
            bookmarks={bookmarks}
            searchQuery={pdfSearchQuery}
            searchResult={pdfSearchResult}
            searchIndexStatus={searchIndexStatus}
            activeMatchIndex={clampedMatchIndex}
            onJumpToPage={(page) => setCurrentPage(page)}
            onAddAnnotation={handleAddAnnotation}
            onDeleteAnnotation={(id) =>
              setAnnotations((prev) => prev.filter((a) => a.id !== id))
            }
            onToggleCurrentBookmark={handleToggleCurrentBookmark}
            onSelectMatch={handleSelectMatch}
          />
        </aside>
      )}

      {/* Main Full-Bleed PDF Reader Canvas */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        <PdfReaderCanvas
          onToolbarHeightChange={setToolbarHeight}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((s) => !s)}
          pdfDoc={pdfDoc}
          pdfFileName={pdfFileName}
          isLoadingPdf={isLoadingPdf}
          pdfLoadError={pdfLoadError}
          backgroundWorkEnabled={backgroundWorkEnabled}
          totalPages={totalPages}
          extractedPages={extractedPages}
          searchIndexStatus={searchIndexStatus}
          onPageRendered={handlePageRendered}
          currentPage={currentPage}
          zoom={zoom}
          rotation={rotation}
          colorMode={colorMode}
          layoutMode={layoutMode}
          pointerTool={pointerTool}
          searchOpen={pdfSearchOpen}
          searchQuery={pdfSearchQuery}
          searchOptions={pdfSearchOptions}
          matchesByPage={matchesByPage}
          totalMatches={pdfSearchResult.totalMatches}
          activeMatchIndex={clampedMatchIndex}
          activeMatchId={activeMatch?.id ?? null}
          onChangePage={setCurrentPage}
          onChangeZoom={setZoom}
          onChangeRotation={setRotation}
          onChangeColorMode={setColorMode}
          onChangeLayoutMode={setLayoutMode}
          onChangePointerTool={setPointerTool}
          onQuickHighlight={handleQuickHighlight}
          onSetSearchOpen={setPdfSearchOpen}
          onChangeSearchQuery={handleChangePdfSearchQuery}
          onToggleCaseSensitive={handleToggleCaseSensitive}
          onToggleWholeWord={handleToggleWholeWord}
          onStepMatch={handleStepMatch}
          onSearchFromSelection={handleSearchFromSelection}
        />
      </main>
    </div>
  );
}
