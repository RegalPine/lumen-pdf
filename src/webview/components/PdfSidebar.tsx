import React, { useMemo, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Filter,
  Plus,
  Trash2,
} from 'lucide-react';
import { PdfThumbnailItem } from './PdfThumbnailItem';
import {
  filterOutlineNodes,
  OutlineNode,
  PdfAnnotation,
  PdfBookmark,
  ReadingColorMode,
} from '../utils/pdfState';
import { PdfSearchMatch, PdfSearchResult } from '../utils/pdfSearch';

export type PdfSidebarTab =
  | 'outline'
  | 'thumbnails'
  | 'annotations'
  | 'bookmarks'
  | 'search';

interface PdfSidebarProps {
  headerHeight: number;
  activeTab: PdfSidebarTab;
  onSelectTab: (tab: PdfSidebarTab) => void;
  pdfDoc: PDFDocumentProxy | null;
  totalPages: number;
  colorMode: ReadingColorMode;
  outline: OutlineNode[];
  isOutlineLoading: boolean;
  backgroundWorkEnabled: boolean;
  currentPage: number;
  annotations: PdfAnnotation[];
  bookmarks: PdfBookmark[];
  searchQuery: string;
  searchResult: PdfSearchResult;
  searchIndexStatus: string | null;
  activeMatchIndex: number;
  onJumpToPage: (page: number) => void;
  onAddAnnotation: (page: number, excerpt: string, note: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onToggleCurrentBookmark: () => void;
  onSelectMatch: (match: PdfSearchMatch) => void;
}

export const PdfSidebar: React.FC<PdfSidebarProps> = ({
  headerHeight,
  activeTab,
  onSelectTab,
  pdfDoc,
  totalPages,
  colorMode,
  outline,
  isOutlineLoading,
  backgroundWorkEnabled,
  currentPage,
  annotations,
  bookmarks,
  searchQuery,
  searchResult,
  searchIndexStatus,
  activeMatchIndex,
  onJumpToPage,
  onAddAnnotation,
  onDeleteAnnotation,
  onToggleCurrentBookmark,
  onSelectMatch,
}) => {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({
    'sec-1': true,
    'sec-3': true,
  });
  const [filterVisible, setFilterVisible] = useState(false);
  const [outlineQuery, setOutlineQuery] = useState('');
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteExcerpt, setNewNoteExcerpt] = useState('');

  const filteredOutline = useMemo(
    () => filterOutlineNodes(outline, outlineQuery),
    [outline, outlineQuery]
  );

  const toggleNode = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    const visit = (nodes: OutlineNode[]) => {
      for (const node of nodes) {
        if (node.children?.length) {
          next[node.id] = true;
          visit(node.children);
        }
      }
    };
    visit(outline);
    setExpandedIds(next);
  };

  const collapseAll = () => {
    setExpandedIds({});
  };

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    onAddAnnotation(
      currentPage,
      newNoteExcerpt.trim() || `Page ${currentPage} excerpt`,
      newNoteText.trim()
    );
    setNewNoteText('');
    setNewNoteExcerpt('');
  };

  const pageNumbers = useMemo(
    () => Array.from({ length: Math.max(0, totalPages) }, (_, idx) => idx + 1),
    [totalPages]
  );

  const renderOutlineNode = (node: OutlineNode): React.ReactNode => {
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = Boolean(expandedIds[node.id] || outlineQuery.trim());
    const isCurrentSection = currentPage === node.page;

    return (
      <div key={node.id}>
        <div className="flex items-start">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleNode(node.id)}
              aria-label={`Toggle ${node.title}`}
              aria-expanded={isExpanded}
              className="p-1 mt-0.5 shrink-0 text-on-surface-variant hover:text-primary"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          ) : (
            <span className="w-5 shrink-0 inline-block" />
          )}
          <button
            type="button"
            onClick={() => onJumpToPage(node.page)}
            onDoubleClick={hasChildren ? () => toggleNode(node.id) : undefined}
            aria-expanded={hasChildren ? isExpanded : undefined}
            className={`flex-1 flex items-start justify-between px-1.5 py-1 text-left min-w-0 transition-colors ${
              isCurrentSection
                ? 'text-primary bg-surface-container-high font-semibold'
                : 'text-on-surface hover:text-primary hover:bg-surface-container'
            }`}
          >
            <span className="min-w-0 flex-1 whitespace-normal break-words">{node.title}</span>
            <span className="text-xs text-outline tabular-nums ml-2 mt-0.5 shrink-0">
              p. {node.page}
            </span>
          </button>
        </div>
        {isExpanded && hasChildren && (
          <div className="pl-5 space-y-0.5 border-l border-surface-container-high ml-2.5">
            {node.children!.map(renderOutlineNode)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sub-Tabs */}
      <nav
        aria-label="PDF Sidebar Sections"
        style={{ height: headerHeight }}
        className="min-w-0 overflow-x-auto bg-surface-container border-b border-outline-variant/30 flex items-center justify-between px-1 gap-0.5 shrink-0"
      >
        {(
          [
            { id: 'outline', label: 'Outline' },
            { id: 'thumbnails', label: 'Pages' },
            { id: 'annotations', label: `Notes(${annotations.length})` },
            { id: 'bookmarks', label: `Pins(${bookmarks.length})` },
            { id: 'search', label: 'Search' },
          ] as const
        ).map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`shrink-0 px-1.5 py-1 font-sans text-xs font-medium text-center whitespace-nowrap transition-colors border-b-2 ${
                active
                  ? 'text-primary bg-surface-container-high border-primary font-bold'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-transparent'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Filter Box */}
      {filterVisible && activeTab === 'outline' && (
        <div className="p-2 bg-surface-container-lowest border-b border-outline-variant/30">
          <label htmlFor="outline-filter" className="sr-only">
            Filter outline sections
          </label>
          <input
            id="outline-filter"
            type="text"
            value={outlineQuery}
            onChange={(e) => setOutlineQuery(e.target.value)}
            placeholder="Filter outline headings..."
            className="w-full px-2 py-1 bg-surface-container border border-outline-variant/60 text-[13px] font-sans text-on-surface focus:outline-none focus:border-primary"
          />
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-3">
        {activeTab === 'outline' && (
          <>
            {/* Outline-only toolbar (expand/collapse/filter) — lives inside the
                Outline tab so other tabs keep a clean header. */}
            <div className="flex items-center justify-end gap-0.5 text-on-surface-variant px-1">
              <button
                type="button"
                onClick={expandAll}
                aria-label="Expand All Outline Nodes"
                title="Expand All"
                className="p-1 hover:text-on-surface hover:bg-surface-container-high transition-colors"
              >
                <ChevronsUpDown className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={collapseAll}
                aria-label="Collapse All Outline Nodes"
                title="Collapse All"
                className="p-1 hover:text-on-surface hover:bg-surface-container-high transition-colors"
              >
                <ChevronsDownUp className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setFilterVisible((v) => !v)}
                aria-label="Filter Outline"
                aria-pressed={filterVisible}
                title="Filter Outline"
                className={`p-1 transition-colors ${
                  filterVisible
                    ? 'text-primary bg-surface-container-high'
                    : 'hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <Filter className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-0.5 font-sans text-[13px] leading-5">
              {filteredOutline.length === 0 ? (
                <p className="px-2 py-3 text-outline text-[13px]">
                  {totalPages === 0
                    ? 'Loading document…'
                    : isOutlineLoading
                      ? backgroundWorkEnabled ? '正在加载目录…' : '首屏完成后加载目录…'
                      : outline.length === 0
                        ? 'This document has no outline entries.'
                        : 'No matching sections.'}
                </p>
              ) : (
                filteredOutline.map(renderOutlineNode)
              )}
            </div>
          </>
        )}

        {activeTab === 'thumbnails' && (
          <div className="grid grid-cols-2 gap-2">
            {pdfDoc && backgroundWorkEnabled ? (
              pageNumbers.map((pageNum) => (
                <PdfThumbnailItem
                  key={pageNum}
                  pdfDoc={pdfDoc}
                  pageNumber={pageNum}
                  isActive={pageNum === currentPage}
                  colorMode={colorMode}
                  onSelect={onJumpToPage}
                />
              ))
            ) : (
              <p className="col-span-2 text-[13px] font-sans text-outline px-1">
                {pdfDoc && !backgroundWorkEnabled ? '首屏完成后加载缩略图…' : '正在加载缩略图…'}
              </p>
            )}
          </div>
        )}

        {activeTab === 'annotations' && (
          <div className="space-y-3">
            <form
              onSubmit={handleCreateNote}
              className="space-y-2 bg-surface-container p-2 border border-outline-variant/40"
            >
              <div className="font-sans text-xs uppercase text-primary font-bold">
                Add Note on Page {currentPage}
              </div>
              <label htmlFor="ann-excerpt" className="sr-only">
                Highlighted excerpt
              </label>
              <input
                id="ann-excerpt"
                type="text"
                value={newNoteExcerpt}
                onChange={(e) => setNewNoteExcerpt(e.target.value)}
                placeholder="Excerpt (optional)..."
                className="w-full px-2 py-1 bg-surface-container-lowest border border-outline-variant/50 text-[13px] font-sans text-on-surface focus:outline-none focus:border-primary"
              />
              <label htmlFor="ann-note" className="sr-only">
                Annotation note
              </label>
              <textarea
                id="ann-note"
                rows={2}
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Write annotation note..."
                className="w-full px-2 py-1 bg-surface-container-lowest border border-outline-variant/50 text-[13px] text-on-surface focus:outline-none focus:border-primary resize-none"
              />
              <button
                type="submit"
                className="w-full h-7 bg-primary-container hover:bg-primary text-on-primary-fixed font-sans text-[13px] font-bold uppercase flex items-center justify-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Save Annotation</span>
              </button>
            </form>

            <div className="space-y-2">
              {annotations.length === 0 ? (
                <p className="text-[13px] font-sans text-outline px-1">
                  No annotations yet. Select PDF text and click Highlight, or add a note above.
                </p>
              ) : (
                annotations.map((ann) => (
                  <div
                    key={ann.id}
                    className="bg-surface-container border border-outline-variant/40 p-2 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onJumpToPage(ann.page)}
                        className="font-sans text-xs text-tertiary hover:underline tabular-nums"
                      >
                        Page {ann.page} · {ann.createdAt}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteAnnotation(ann.id)}
                        aria-label={`Delete annotation ${ann.note.slice(0, 20)}`}
                        className="p-0.5 text-outline hover:text-error transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <p className="text-[13px] font-sans italic text-on-surface-variant line-clamp-2">
                      "{ann.excerpt}"
                    </p>
                    <p className="text-[13px] text-on-surface">{ann.note}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'bookmarks' && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onToggleCurrentBookmark}
              className="w-full h-7 bg-surface-container hover:bg-surface-container-high border border-primary/60 text-primary font-sans text-[13px] font-bold uppercase flex items-center justify-center gap-1.5 transition-colors"
            >
              <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Toggle Pin for Page {currentPage}</span>
            </button>
            {bookmarks.length === 0 ? (
              <p className="text-[13px] font-sans text-outline px-1 py-2">
                No bookmarks pinned for this PDF yet.
              </p>
            ) : (
              bookmarks.map((bm) => (
                <button
                  key={bm.id}
                  type="button"
                  onClick={() => onJumpToPage(bm.page)}
                  className="w-full text-left bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 p-2 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-on-surface truncate">
                      {bm.title}
                    </span>
                    <span className="font-sans text-xs text-primary tabular-nums">
                      p. {bm.page}
                    </span>
                  </div>
                  <div className="text-xs font-sans text-outline mt-0.5 truncate">
                    {bm.subtitle}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {activeTab === 'search' && (
          <div className="space-y-3">
            {/* Result overview only — the input, toggles and stepping live in
                the viewport find bar (Ctrl+F) to avoid two competing inputs. */}
            {searchIndexStatus && (
              <p role="status" className="px-2 font-sans text-xs text-outline">
                {searchIndexStatus}
              </p>
            )}
            {!searchQuery.trim() ? (
              <div className="p-2.5 bg-surface-container border border-outline-variant/30">
                <p className="font-sans text-[13px] text-on-surface-variant">
                  Press Ctrl+F and enter a keyword to search across all {totalPages} pages.
                </p>
              </div>
            ) : searchResult.totalMatches === 0 ? (
              <div className="p-3 bg-surface-container border border-outline-variant/30 space-y-1">
                <p className="font-sans text-[13px] text-error">
                  {searchIndexStatus ? `已索引页面中暂无匹配：${searchQuery}` : `No occurrences found for "${searchQuery}".`}
                </p>
                <p className="text-[13px] text-outline">
                  {searchIndexStatus ? '索引未完成或存在无法提取文本的页面，请留意上方状态。' : 'Adjust the Aa / \\b toggles in the find bar above the page.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="px-1 font-sans text-xs uppercase tracking-wider text-outline tabular-nums">
                  {searchResult.totalMatches} matches across {searchResult.pageGroups.length} pages
                </div>

                {searchResult.pageGroups.map((group) => (
                  <div
                    key={group.page}
                    className="border border-outline-variant/40 bg-surface-container"
                  >
                    <div className="px-2 py-1 bg-surface-container-high border-b border-outline-variant/30 flex items-center justify-between gap-2">
                      <span className="font-sans text-[13px] font-bold text-on-surface truncate">
                        Page {group.page} · {group.sectionTitle}
                      </span>
                      <span className="font-sans text-xs text-primary tabular-nums shrink-0">
                        {group.matches.length}
                      </span>
                    </div>

                    <div className="divide-y divide-outline-variant/20">
                      {group.matches.map((match) => {
                        const isActive = match.globalIndex === activeMatchIndex;
                        return (
                          <button
                            key={match.id}
                            type="button"
                            onClick={() => onSelectMatch(match)}
                            className={`w-full px-2 py-1.5 text-left transition-colors border-l-2 ${
                              isActive
                                ? 'bg-surface-container-highest border-primary'
                                : 'border-transparent hover:bg-surface-container-high'
                            }`}
                          >
                            <div className="text-[13px] text-on-surface-variant leading-snug break-words">
                              <span>{match.snippetBefore}</span>
                              <mark
                                className={
                                  isActive
                                    ? 'bg-primary text-on-primary-fixed font-semibold px-0.5'
                                    : 'bg-tertiary text-on-tertiary px-0.5'
                                }
                              >
                                {match.matchedText}
                              </mark>
                              <span>{match.snippetAfter}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
