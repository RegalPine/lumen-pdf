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
import {
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

  // Reader View State (restores VS Code Webview state when running inside VS Code)
  const initialVsCodeState = getVsCodeApi()?.getState<{
    currentPage?: number;
    zoom?: number;
    colorMode?: ReadingColorMode;
  }>();
  const [currentPage, setCurrentPage] = useState<number>(
    initialVsCodeState?.currentPage ?? 1
  );
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
      bytes: Uint8Array,
      fileName: string,
      custom: boolean,
      initialPage: number
    ) => {
      setIsLoadingPdf(true);
      setPdfLoadError(null);
      try {
        const { doc, destroy } = await loadPdfDocumentFromBytes(bytes);

        if (activeDestroyRef.current) {
          try {
            await activeDestroyRef.current();
          } catch {
            // ignore cleanup errors
          }
        }
        activeDestroyRef.current = destroy;

        const sectionTitles: Record<number, string> = {};
        if (!custom) {
          for (const p of PDF_PAGES) {
            sectionTitles[p.page] = p.sectionTitle;
          }
        }

        const pagesText = await extractAllPagesText(doc, sectionTitles);
        const docOutline = await extractOutlineFromPdf(doc, pagesText);

        const key = custom ? `${fileName}:${bytes.byteLength}` : SAMPLE_PDF_NAME;
        setPdfFileName(fileName);
        setDocStorageKey(key);
        setIsCustomPdf(custom);
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setExtractedPages(pagesText);
        setOutline(docOutline);
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
        const msg = err instanceof Error ? err.message : 'Unable to parse PDF binary.';
        setPdfLoadError(msg);
        // Never leave a failed document showing the previous one's structure.
        setOutline([]);
        setExtractedPages([]);
        setTotalPages(0);
        setDocReady(false);
      } finally {
        setIsLoadingPdf(false);
      }
    },
    []
  );

  // Listen for VS Code Extension Host messages or load standalone sample PDF
  // (totalPages is read through a ref so a late document parse cannot re-run
  // this effect and re-load / reset the page while the user is reading).
  const totalPagesRef = useRef(0);
  useEffect(() => {
    const insideVsCode = postToVsCodeHost({ type: 'ready' });
    if (!insideVsCode) {
      const sampleBytes = buildSamplePdfBytes();
      loadPdfStream(sampleBytes, SAMPLE_PDF_NAME, false, 1);
    }

    const handleHostMessage = async (event: MessageEvent<IncomingHostMessage>) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'loadPdf') {
        if (msg.data) {
          const bytes =
            msg.data instanceof Uint8Array
              ? msg.data
              : msg.data instanceof ArrayBuffer
              ? new Uint8Array(msg.data)
              : new Uint8Array(msg.data);
          await loadPdfStream(bytes, msg.fileName || 'document.pdf', true, 1);
        } else if (msg.url) {
          try {
            const res = await fetch(msg.url);
            const buf = await res.arrayBuffer();
            const inferredName =
              msg.fileName || msg.url.split('/').pop()?.split('?')[0] || 'document.pdf';
            await loadPdfStream(new Uint8Array(buf), inferredName, true, 1);
          } catch (err) {
            setPdfLoadError(
              err instanceof Error ? err.message : 'Failed to fetch PDF from host.'
            );
          }
        }
      } else if (msg.type === 'toggleColorMode') {
        const order: ReadingColorMode[] = ['dark-paper', 'light-paper', 'sepia', 'inverted'];
        setColorMode((prev) => order[(order.indexOf(prev) + 1) % order.length]);
      } else if (msg.type === 'jumpToLocation' && msg.payload?.page) {
        setCurrentPage((prev) => clampPage(msg.payload?.page ?? prev, totalPagesRef.current));
      }
    };

    window.addEventListener('message', handleHostMessage);

    return () => {
      window.removeEventListener('message', handleHostMessage);
      if (activeDestroyRef.current) {
        activeDestroyRef.current().catch(() => {});
        activeDestroyRef.current = null;
      }
    };
  }, [loadPdfStream]);

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
    syncMatchPage(nextRes.totalMatches, nextRes.flatMatches, 0);
  }, [extractedPages, pdfSearchOptions, pdfSearchQuery, syncMatchPage]);

  const handleToggleWholeWord = useCallback(() => {
    const nextOpts = {
      ...pdfSearchOptions,
      wholeWord: !pdfSearchOptions.wholeWord,
    };
    setPdfSearchOptions(nextOpts);
    const nextRes = searchPdfPages(extractedPages, pdfSearchQuery, nextOpts);
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
            activeTab={pdfSidebarTab}
            onSelectTab={setPdfSidebarTab}
            pdfDoc={pdfDoc}
            totalPages={totalPages}
            colorMode={colorMode}
            outline={outline}
            currentPage={currentPage}
            annotations={annotations}
            bookmarks={bookmarks}
            searchQuery={pdfSearchQuery}
            searchResult={pdfSearchResult}
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
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((s) => !s)}
          pdfDoc={pdfDoc}
          pdfFileName={pdfFileName}
          isLoadingPdf={isLoadingPdf}
          pdfLoadError={pdfLoadError}
          totalPages={totalPages}
          extractedPages={extractedPages}
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
