export type ReadingColorMode = 'dark-paper' | 'light-paper' | 'sepia' | 'inverted';
export type ViewLayoutMode = 'single' | 'continuous' | 'spread';
export type PointerTool = 'select' | 'pan';

export interface OutlineNode {
  id: string;
  title: string;
  page: number;
  children?: OutlineNode[];
}

export interface PdfAnnotation {
  id: string;
  page: number;
  excerpt: string;
  note: string;
  color: 'tertiary' | 'primary' | 'secondary';
  createdAt: string;
}

export interface PdfBookmark {
  id: string;
  title: string;
  subtitle: string;
  page: number;
  accent: 'tertiary' | 'secondary' | 'primary';
}

export const INITIAL_BOOKMARKS: PdfBookmark[] = [
  {
    id: 'bm-1',
    title: 'Key Projection Formula',
    subtitle: 'Section 3.2 · Eq (2)',
    page: 4,
    accent: 'tertiary',
  },
  {
    id: 'bm-2',
    title: 'Figure 2 Architecture',
    subtitle: 'Dot-Product Slices Diagram',
    page: 4,
    accent: 'secondary',
  },
];

export const INITIAL_ANNOTATIONS: PdfAnnotation[] = [
  {
    id: 'ann-1',
    page: 4,
    excerpt:
      'Multi-head attention allows the model to jointly attend to information from different representation subspaces at different positions.',
    note: 'Core reason for splitting d_model into h=8 parallel heads of 64 dims.',
    color: 'tertiary',
    createdAt: 'Section 3.2',
  },
];

export function clampPage(page: number, totalPages = 15): number {
  if (!Number.isFinite(page)) return 1;
  return Math.max(1, Math.min(totalPages, Math.round(page)));
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 100;
  return Math.max(50, Math.min(250, Math.round(zoom)));
}

export function rotateClockwise(deg: number): number {
  return (deg + 90) % 360;
}

export function filterOutlineNodes(nodes: OutlineNode[], query: string): OutlineNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;

  const filtered: OutlineNode[] = [];
  for (const node of nodes) {
    const matchedChildren = node.children ? filterOutlineNodes(node.children, q) : [];
    if (node.title.toLowerCase().includes(q) || matchedChildren.length > 0) {
      filtered.push({
        ...node,
        children: matchedChildren.length > 0 ? matchedChildren : node.children,
      });
    }
  }
  return filtered;
}
