import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Hand,
  Highlighter,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  MousePointer,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RectangleVertical,
  RotateCw,
  Scan,
  ScrollText,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { PdfPageRenderer } from './PdfPageRenderer';
import {
  clampPage,
  clampZoom,
  PointerTool,
  ReadingColorMode,
  rotateClockwise,
  ViewLayoutMode,
} from '../utils/pdfState';
import {
  ExtractedPdfPage,
  PdfSearchMatch,
  PdfSearchOptions,
} from '../utils/pdfSearch';

interface PdfReaderCanvasProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  pdfDoc: PDFDocumentProxy | null;
  pdfFileName: string;
  isLoadingPdf: boolean;
  pdfLoadError: string | null;
  totalPages: number;
  extractedPages: ExtractedPdfPage[];
  currentPage: number;
  zoom: number;
  rotation: number;
  colorMode: ReadingColorMode;
  layoutMode: ViewLayoutMode;
  pointerTool: PointerTool;
  searchOpen: boolean;
  searchQuery: string;
  searchOptions: PdfSearchOptions;
  matchesByPage: Record<number, PdfSearchMatch[]>;
  totalMatches: number;
  activeMatchIndex: number;
  activeMatchId: string | null;
  onChangePage: (page: number) => void;
  onChangeZoom: (zoom: number) => void;
  onChangeRotation: (deg: number) => void;
  onChangeColorMode: (mode: ReadingColorMode) => void;
  onChangeLayoutMode: (mode: ViewLayoutMode) => void;
  onChangePointerTool: (tool: PointerTool) => void;
  onQuickHighlight: (page: number, excerpt: string) => void;
  onSetSearchOpen: (open: boolean) => void;
  onChangeSearchQuery: (query: string) => void;
  onToggleCaseSensitive: () => void;
  onToggleWholeWord: () => void;
  onStepMatch: (delta: 1 | -1) => void;
  onSearchFromSelection: (query: string) => void;
}

const COLOR_MODE_LABELS: Record<ReadingColorMode, { full: string; short: string }> = {
  'dark-paper': { full: 'Dark Paper', short: 'Dark' },
  'light-paper': { full: 'Light Paper', short: 'Light' },
  sepia: { full: 'Sepia Archive', short: 'Sepia' },
  inverted: { full: 'High Contrast', short: 'Contrast' },
};

interface SelectionPopupState {
  text: string;
  page: number;
  x: number;
  y: number;
}

export const PdfReaderCanvas: React.FC<PdfReaderCanvasProps> = ({
  sidebarOpen,
  onToggleSidebar,
  pdfDoc,
  pdfFileName,
  isLoadingPdf,
  pdfLoadError,
  totalPages,
  extractedPages,
  currentPage,
  zoom,
  rotation,
  colorMode,
  layoutMode,
  pointerTool,
  searchOpen,
  searchQuery,
  searchOptions,
  matchesByPage,
  totalMatches,
  activeMatchIndex,
  activeMatchId,
  onChangePage,
  onChangeZoom,
  onChangeRotation,
  onChangeColorMode,
  onChangeLayoutMode,
  onChangePointerTool,
  onQuickHighlight,
  onSetSearchOpen,
  onChangeSearchQuery,
  onToggleCaseSensitive,
  onToggleWholeWord,
  onStepMatch,
  onSearchFromSelection,
}) => {
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopupState | null>(null);
  const [copiedPopup, setCopiedPopup] = useState(false);

  const findInputRef = useRef<HTMLInputElement>(null);
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageElementsRef = useRef<Map<number, HTMLElement>>(new Map());
  const panDragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const prevLayoutRef = useRef<ViewLayoutMode>(layoutMode);
  const prevPageRef = useRef<number>(currentPage);
  const scrollingFromSpyRef = useRef(false);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => findInputRef.current?.focus(), 20);
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!colorMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (colorMenuRef.current && !colorMenuRef.current.contains(e.target as Node)) {
        setColorMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setColorMenuOpen(false);
    };
    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [colorMenuOpen]);

  const registerPageElement = useCallback((pageNum: number, el: HTMLElement | null) => {
    if (el) {
      pageElementsRef.current.set(pageNum, el);
    } else {
      pageElementsRef.current.delete(pageNum);
    }
  }, []);

  // Scroll to target page in continuous mode when currentPage jumps externally or mode switches
  useEffect(() => {
    const modeChanged = prevLayoutRef.current !== layoutMode;
    const pageChanged = prevPageRef.current !== currentPage;
    prevLayoutRef.current = layoutMode;
    prevPageRef.current = currentPage;

    if (scrollingFromSpyRef.current) {
      scrollingFromSpyRef.current = false;
      return;
    }

    if (layoutMode === 'single' && (modeChanged || pageChanged)) {
      // A freshly flipped/selected page always presents from its top.
      if (viewportRef.current) viewportRef.current.scrollTop = 0;
    } else if (layoutMode === 'continuous' && (modeChanged || pageChanged)) {
      const targetEl = pageElementsRef.current.get(currentPage);
      if (targetEl && viewportRef.current) {
        targetEl.scrollIntoView({ block: 'start', behavior: modeChanged ? 'auto' : 'smooth' });
      }
    }
  }, [currentPage, layoutMode]);

  const handleViewportScroll = () => {
    if (layoutMode !== 'continuous' || !viewportRef.current) return;
    const containerTop = viewportRef.current.getBoundingClientRect().top + 80;
    let closestPage = currentPage;
    let bestDist = Infinity;

    for (const [pageNum, el] of pageElementsRef.current.entries()) {
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top - containerTop);
      if (dist < bestDist) {
        bestDist = dist;
        closestPage = pageNum;
      }
    }

    if (closestPage !== currentPage) {
      scrollingFromSpyRef.current = true;
      onChangePage(closestPage);
    }
  };

  // Single-page mode: a wheel gesture past the page's top/bottom edge flips to
  // the adjacent page (the viewport only holds one page, so ordinary scrolling
  // can never leave it). Native non-passive listener so the overscroll can be
  // preventDefault-ed; the 350ms guard swallows trackpad inertia bursts.
  const wheelFlipAtRef = useRef(0);
  useEffect(() => {
    if (layoutMode !== 'single') return;
    const el = viewportRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      const overEdge = (e.deltaY > 0 && atBottom) || (e.deltaY < 0 && atTop);
      if (!overEdge) return;
      e.preventDefault();
      const now = Date.now();
      if (now - wheelFlipAtRef.current < 350) return;
      if (e.deltaY > 0 && currentPage < totalPages) {
        wheelFlipAtRef.current = now;
        onChangePage(currentPage + 1);
      } else if (e.deltaY < 0 && currentPage > 1) {
        wheelFlipAtRef.current = now;
        onChangePage(currentPage - 1);
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [layoutMode, currentPage, totalPages, onChangePage]);

  const handlePageInputCommit = () => {
    const parsed = parseInt(pageInput, 10);
    if (!Number.isNaN(parsed)) {
      const clamped = clampPage(parsed, Math.max(1, totalPages));
      onChangePage(clamped);
      setPageInput(String(clamped));
    } else {
      setPageInput(String(currentPage));
    }
  };

  const handleSelectLayoutMode = async (mode: ViewLayoutMode) => {
    onChangeLayoutMode(mode);
    if (mode === 'spread' && pdfDoc && viewportRef.current) {
      try {
        const page = await pdfDoc.getPage(currentPage);
        const baseViewport = page.getViewport({ scale: 1, rotation });
        const availableEach = Math.max(240, (viewportRef.current.clientWidth - 96) / 2);
        const fitZoom = clampZoom(Math.floor((availableEach / (baseViewport.width * 1.22)) * 100));
        if (zoom > fitZoom) {
          onChangeZoom(fitZoom);
        }
      } catch {
        // ignore
      }
    }
  };

  const handleFitWidth = async () => {
    if (!pdfDoc || !viewportRef.current) return;
    try {
      const page = await pdfDoc.getPage(currentPage);
      const baseViewport = page.getViewport({ scale: 1, rotation });
      const availableWidth = Math.max(280, viewportRef.current.clientWidth - 72);
      const nextZoom = clampZoom(Math.round((availableWidth / (baseViewport.width * 1.22)) * 100));
      onChangeZoom(nextZoom);
    } catch {
      onChangeZoom(100);
    }
  };

  const handleFitPage = async () => {
    if (!pdfDoc || !viewportRef.current) return;
    try {
      const page = await pdfDoc.getPage(currentPage);
      const baseViewport = page.getViewport({ scale: 1, rotation });
      const availW = Math.max(280, viewportRef.current.clientWidth - 72);
      const availH = Math.max(320, viewportRef.current.clientHeight - 88);
      const scaleW = availW / (baseViewport.width * 1.22);
      const scaleH = availH / (baseViewport.height * 1.22);
      onChangeZoom(clampZoom(Math.round(Math.min(scaleW, scaleH) * 100)));
    } catch {
      onChangeZoom(100);
    }
  };

  const handleViewportMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (pointerTool !== 'pan' || !viewportRef.current) return;
    panDragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: viewportRef.current.scrollLeft,
      scrollTop: viewportRef.current.scrollTop,
    };
  };

  const handleViewportMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const drag = panDragRef.current;
    if (!drag || !drag.active || !viewportRef.current) return;
    viewportRef.current.scrollLeft = drag.scrollLeft - (e.clientX - drag.startX);
    viewportRef.current.scrollTop = drag.scrollTop - (e.clientY - drag.startY);
  };

  const handleViewportMouseUp = () => {
    if (panDragRef.current) {
      panDragRef.current.active = false;
    }
    if (pointerTool !== 'select') {
      setSelectionPopup(null);
      return;
    }
    const sel = window.getSelection();
    const selectedText = sel?.toString().trim() ?? '';
    if (!selectedText || !sel || sel.rangeCount === 0 || !viewportRef.current) {
      setSelectionPopup(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const hostRect = viewportRef.current.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setSelectionPopup(null);
      return;
    }

    let node: Node | null = range.startContainer;
    let detectedPage = currentPage;
    while (node) {
      if (node instanceof HTMLElement && node.dataset.pdfPage) {
        const parsed = parseInt(node.dataset.pdfPage, 10);
        if (!Number.isNaN(parsed)) detectedPage = parsed;
        break;
      }
      node = node.parentNode;
    }

    setSelectionPopup({
      text: selectedText,
      page: detectedPage,
      x: Math.max(16, Math.min(hostRect.width - 260, rect.left - hostRect.left)),
      y: Math.max(12, rect.top - hostRect.top + viewportRef.current.scrollTop - 42),
    });
    setCopiedPopup(false);
  };

  const pageNumbersToRender = useMemo(() => {
    const count = Math.max(1, totalPages);
    if (layoutMode === 'continuous') {
      return Array.from({ length: count }, (_, i) => i + 1);
    }
    if (layoutMode === 'spread') {
      return currentPage + 1 <= count ? [currentPage, currentPage + 1] : [currentPage];
    }
    return [clampPage(currentPage, count)];
  }, [currentPage, layoutMode, totalPages]);

  return (
    <div
      className={`flex flex-col flex-1 min-h-0 bg-surface ${
        presentationMode ? 'fixed inset-0 z-50' : ''
      }`}
    >
      {/* PDF Reader Primary Action Toolbar */}
      <div
        role="toolbar"
        aria-label="PDF Reader Toolbar"
        className="min-h-10 py-1.5 px-2 sm:px-2.5 bg-surface-container border-b border-outline-variant/40 flex flex-wrap items-center justify-between gap-1.5 select-none relative z-20"
      >
        {/* Zone 1 (Left): Sidebar Toggle & Page Navigation */}
        <div className="contents sm:flex sm:items-center sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? 'Collapse PDF Sidebar' : 'Expand PDF Sidebar'}
            title={sidebarOpen ? 'Collapse Sidebar (Ctrl+B)' : 'Expand Sidebar (Ctrl+B)'}
            className={`w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center border transition-colors ${
              sidebarOpen
                ? 'bg-surface-container-high border-primary/50 text-primary'
                : 'bg-surface-container-lowest border-outline-variant/40 text-on-surface-variant hover:text-on-surface hover:border-primary/50'
            }`}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          <div className="inline-flex items-center h-8 sm:h-7 bg-surface-container-lowest border border-outline-variant/40">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => onChangePage(clampPage(currentPage - 1, totalPages))}
              aria-label="Previous Page"
              title="Previous Page (←)"
              className="w-6.5 h-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container disabled:opacity-35 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <div className="h-full flex items-center px-1.5 border-x border-outline-variant/30 font-mono text-[11px] tabular-nums">
              <label htmlFor="pdf-page-input" className="sr-only">
                Current Page Number
              </label>
              <input
                id="pdf-page-input"
                type="text"
                inputMode="numeric"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={handlePageInputCommit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePageInputCommit();
                }}
                className="w-7 h-5 text-center bg-surface text-primary font-mono text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-outline mx-1">/</span>
              <span className="text-on-surface-variant">{totalPages}</span>
            </div>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => onChangePage(clampPage(currentPage + 1, totalPages))}
              aria-label="Next Page"
              title="Next Page (→)"
              className="w-6.5 h-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container disabled:opacity-35 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Zone 2 (Center): Zoom, Page Layout & Pointer Tools */}
        <div className="contents sm:flex sm:items-center sm:gap-1.5">
          <div className="inline-flex items-center h-8 sm:h-7 bg-surface-container-lowest border border-outline-variant/40">
            <button
              type="button"
              disabled={zoom <= 40}
              onClick={() => onChangeZoom(clampZoom(zoom - 15))}
              aria-label="Zoom Out"
              title="Zoom Out (Ctrl+-)"
              className="w-6.5 h-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container disabled:opacity-35 disabled:pointer-events-none transition-colors"
            >
              <Minus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onChangeZoom(100)}
              aria-label="Reset Zoom to 100%"
              title="Reset Zoom to 100%"
              className="h-full px-1.5 font-mono text-[11px] text-on-surface hover:text-primary hover:bg-surface-container tabular-nums border-x border-outline-variant/30 transition-colors"
            >
              {zoom}%
            </button>
            <button
              type="button"
              disabled={zoom >= 240}
              onClick={() => onChangeZoom(clampZoom(zoom + 15))}
              aria-label="Zoom In"
              title="Zoom In (Ctrl++)"
              className="w-6.5 h-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container disabled:opacity-35 disabled:pointer-events-none transition-colors"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <span className="w-px h-4 bg-outline-variant/40" aria-hidden="true" />
            <button
              type="button"
              onClick={handleFitWidth}
              aria-label="Fit to Page Width"
              title="Fit to Width"
              className="w-6.5 h-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
            >
              <Scan className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleFitPage}
              aria-label="Fit Entire Page"
              title="Fit Entire Page"
              className="w-6.5 h-full hidden sm:flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
            >
              <RectangleVertical className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div
            role="group"
            aria-label="Page Layout Mode"
            className="hidden sm:inline-flex items-center h-7 bg-surface-container-lowest border border-outline-variant/40 divide-x divide-outline-variant/30"
          >
            <button
              type="button"
              onClick={() => handleSelectLayoutMode('single')}
              aria-label="Single Page View"
              aria-pressed={layoutMode === 'single'}
              title="Single Page View"
              className={`w-6.5 h-full flex items-center justify-center transition-colors ${
                layoutMode === 'single'
                  ? 'text-primary bg-surface-container-high'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleSelectLayoutMode('continuous')}
              aria-label="Continuous Scroll View"
              aria-pressed={layoutMode === 'continuous'}
              title="Continuous Scroll"
              className={`w-6.5 h-full flex items-center justify-center transition-colors ${
                layoutMode === 'continuous'
                  ? 'text-primary bg-surface-container-high'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <ScrollText className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleSelectLayoutMode('spread')}
              aria-label="Two-Page Spread View"
              aria-pressed={layoutMode === 'spread'}
              title="Two-Page Spread"
              className={`w-6.5 h-full flex items-center justify-center transition-colors ${
                layoutMode === 'spread'
                  ? 'text-primary bg-surface-container-high'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div
            role="group"
            aria-label="Pointer Tool"
            className="inline-flex items-center h-8 sm:h-7 bg-surface-container-lowest border border-outline-variant/40 divide-x divide-outline-variant/30"
          >
            <button
              type="button"
              onClick={() => onChangePointerTool('select')}
              aria-label="Text Select Tool"
              aria-pressed={pointerTool === 'select'}
              title="Text Select Tool"
              className={`w-8 sm:w-6.5 h-full flex items-center justify-center transition-colors ${
                pointerTool === 'select'
                  ? 'text-primary bg-surface-container-high'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <MousePointer className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onChangePointerTool('pan')}
              aria-label="Hand Pan Tool"
              aria-pressed={pointerTool === 'pan'}
              title="Hand / Pan Tool"
              className={`w-8 sm:w-6.5 h-full flex items-center justify-center transition-colors ${
                pointerTool === 'pan'
                  ? 'text-primary bg-surface-container-high'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <Hand className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Zone 3 (Right): Color Theme & Document Actions */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto sm:ml-0">
          <div ref={colorMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setColorMenuOpen((o) => !o)}
              aria-expanded={colorMenuOpen}
              aria-haspopup="menu"
              title="Reading Color Mode"
              className="h-8 sm:h-7 px-2 flex items-center gap-1.5 bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/40 border-b-2 border-b-tertiary text-tertiary font-mono text-[11px] transition-colors whitespace-nowrap"
            >
              {colorMode === 'light-paper' ? (
                <Sun className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Moon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="sm:hidden">{COLOR_MODE_LABELS[colorMode].short}</span>
              <span className="hidden sm:inline">{COLOR_MODE_LABELS[colorMode].full}</span>
              <ChevronDown className="w-3 h-3 text-outline shrink-0" aria-hidden="true" />
            </button>

            {colorMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 w-44 bg-surface-container-highest border border-primary z-50 shadow-[2px_2px_0px_0px_#000000]"
              >
                {(Object.keys(COLOR_MODE_LABELS) as ReadingColorMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="menuitemradio"
                    aria-checked={colorMode === mode}
                    onClick={() => {
                      onChangeColorMode(mode);
                      setColorMenuOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left font-mono text-[11px] flex items-center justify-between hover:bg-surface-container ${
                      colorMode === mode ? 'text-primary font-bold' : 'text-on-surface'
                    }`}
                  >
                    <span>{COLOR_MODE_LABELS[mode].full}</span>
                    {colorMode === mode && <span>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="inline-flex items-center h-8 sm:h-7 bg-surface-container-lowest border border-outline-variant/40 divide-x divide-outline-variant/30">
            <button
              type="button"
              onClick={() => onSetSearchOpen(!searchOpen)}
              aria-label="Search Inside PDF"
              aria-pressed={searchOpen}
              title="Search Inside PDF (Ctrl+F)"
              className={`w-8 sm:w-6.5 h-full flex items-center justify-center transition-colors ${
                searchOpen
                  ? 'text-primary bg-surface-container-high'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onChangeRotation(rotateClockwise(rotation))}
              aria-label="Rotate Clockwise 90 Degrees"
              title="Rotate 90°"
              className="w-8 sm:w-6.5 h-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setPresentationMode((p) => !p)}
              aria-label={presentationMode ? 'Exit Fullscreen' : 'Presentation Mode'}
              aria-pressed={presentationMode}
              title="Toggle Presentation Mode"
              className={`w-8 sm:w-6.5 h-full flex items-center justify-center transition-colors ${
                presentationMode
                  ? 'text-primary bg-surface-container-high'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              {presentationMode ? (
                <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Inline PDF Find Bar */}
      {searchOpen && (
        <div className="px-3 py-1.5 bg-surface-container-low border-b border-outline-variant/40 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 max-w-sm bg-surface-container-lowest border border-outline-variant/60 px-2 py-1 focus-within:border-primary">
            <Search className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
            <label htmlFor="pdf-find-input" className="sr-only">
              Find text in PDF
            </label>
            <input
              ref={findInputRef}
              id="pdf-find-input"
              type="text"
              value={searchQuery}
              onChange={(e) => onChangeSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && totalMatches > 0) {
                  e.preventDefault();
                  onStepMatch(e.shiftKey ? -1 : 1);
                } else if (e.key === 'Escape') {
                  onSetSearchOpen(false);
                }
              }}
              placeholder="Find in PDF..."
              className="flex-1 min-w-0 bg-transparent font-mono text-xs text-on-surface focus:outline-none placeholder:text-outline"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onChangeSearchQuery('')}
                aria-label="Clear Find Input"
                className="p-0.5 text-outline hover:text-on-surface"
              >
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleCaseSensitive}
              aria-label="Case Sensitive"
              aria-pressed={searchOptions.caseSensitive}
              title="Match Case (Aa)"
              className={`h-6 px-1.5 font-mono text-[11px] border transition-colors ${
                searchOptions.caseSensitive
                  ? 'bg-surface-container-high border-primary text-primary font-bold'
                  : 'bg-surface-container-lowest border-outline-variant/50 text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Aa
            </button>
            <button
              type="button"
              onClick={onToggleWholeWord}
              aria-label="Whole Word"
              aria-pressed={searchOptions.wholeWord}
              title="Match Whole Word"
              className={`h-6 px-1.5 font-mono text-[11px] border transition-colors ${
                searchOptions.wholeWord
                  ? 'bg-surface-container-high border-primary text-primary font-bold'
                  : 'bg-surface-container-lowest border-outline-variant/50 text-on-surface-variant hover:text-on-surface'
              }`}
            >
              \b
            </button>
          </div>

          <div className="flex items-center gap-1">
            <span className="font-mono text-[11px] text-on-surface-variant tabular-nums px-1.5">
              {searchQuery.trim()
                ? totalMatches > 0
                  ? `${activeMatchIndex + 1} / ${totalMatches}`
                  : '0 matches'
                : '0 / 0'}
            </span>
            <button
              type="button"
              disabled={totalMatches === 0}
              onClick={() => onStepMatch(-1)}
              aria-label="Find Previous Match"
              title="Previous Match (Shift+Enter)"
              className="w-6 h-6 flex items-center justify-center bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant hover:text-primary disabled:opacity-40"
            >
              <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={totalMatches === 0}
              onClick={() => onStepMatch(1)}
              aria-label="Find Next Match"
              title="Next Match (Enter)"
              className="w-6 h-6 flex items-center justify-center bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant hover:text-primary disabled:opacity-40"
            >
              <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onSetSearchOpen(false)}
            aria-label="Close Find Bar"
            className="font-mono text-[11px] text-outline hover:text-on-surface px-2 ml-auto"
          >
            Close
          </button>
        </div>
      )}

      {/* Real PDF Viewport (Canvas + TextLayer + Floating Selection Toolbar) */}
      <div
        ref={viewportRef}
        onScroll={handleViewportScroll}
        onMouseDown={handleViewportMouseDown}
        onMouseMove={handleViewportMouseMove}
        onMouseUp={handleViewportMouseUp}
        className={`relative flex-1 overflow-auto p-6 sm:p-8 bg-surface-dim ${
          pointerTool === 'pan' ? 'cursor-grab active:cursor-grabbing select-none' : ''
        }`}
      >

        {/* Inline Floating Text-Selection Action Bar */}
        {selectionPopup && (
          <div
            style={{ left: `${selectionPopup.x}px`, top: `${selectionPopup.y}px` }}
            className="absolute z-30 inline-flex items-center gap-1 bg-surface-container-highest border border-primary px-1.5 py-1 text-on-surface shadow-[2px_2px_0px_0px_#000000] select-none"
          >
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(selectionPopup.text);
                } catch {
                  // ignore clipboard restrictions
                }
                setCopiedPopup(true);
                setTimeout(() => setCopiedPopup(false), 1200);
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-surface-container text-[11px] font-mono transition-colors"
            >
              <Copy className="w-3 h-3" aria-hidden="true" />
              <span>{copiedPopup ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onQuickHighlight(selectionPopup.page, selectionPopup.text);
                setSelectionPopup(null);
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-surface-container text-[11px] font-mono text-tertiary transition-colors"
            >
              <Highlighter className="w-3 h-3" aria-hidden="true" />
              <span>Highlight</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onSearchFromSelection(selectionPopup.text.slice(0, 48));
                setSelectionPopup(null);
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-surface-container text-[11px] font-mono text-secondary transition-colors"
            >
              <Search className="w-3 h-3" aria-hidden="true" />
              <span>Search in PDF</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectionPopup(null)}
              aria-label="Dismiss Selection Actions"
              className="p-0.5 text-outline hover:text-on-surface"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        )}

        {pdfLoadError ? (
          <div className="max-w-lg mx-auto w-full p-5 bg-surface-container border border-error/60 font-mono text-xs space-y-2">
            <div className="text-error font-bold uppercase">PDF Parse Error</div>
            <p className="text-on-surface-variant">{pdfLoadError}</p>
          </div>
        ) : isLoadingPdf || !pdfDoc ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 font-mono text-xs text-on-surface-variant">
            <span className="text-primary font-bold">Loading PDF Document...</span>
            <span>Parsing pages, outline bookmarks, and searchable text index</span>
          </div>
        ) : (
          <div
            className={
              layoutMode === 'spread'
                ? 'mx-auto w-max min-w-full flex flex-wrap xl:flex-nowrap items-start justify-center gap-6'
                : 'mx-auto w-max min-w-full flex flex-col items-center gap-8'
            }
          >
            {pageNumbersToRender.map((pageNumber) => {
              const extracted = extractedPages[pageNumber - 1];
              return (
                <PdfPageRenderer
                  key={`${pdfFileName}-${pageNumber}`}
                  pdfDoc={pdfDoc}
                  pageNumber={pageNumber}
                  zoom={zoom}
                  rotation={rotation}
                  colorMode={colorMode}
                  pointerTool={pointerTool}
                  extractedItems={extracted?.items ?? []}
                  matchesOnPage={matchesByPage[pageNumber] ?? []}
                  activeMatchId={activeMatchId}
                  registerPageElement={registerPageElement}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
