import { PDF_PAGES } from '../data/workspaceFixtures';

interface PdfObjectEntry {
  id: number;
  body: string;
}

function toWinAnsiSafe(text: string): string {
  return text
    .replace(/—/g, '--')
    .replace(/–/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/₁/g, '_1')
    .replace(/ₕ/g, '_h')
    .replace(/ᵢ/g, '_i')
    .replace(/ᴼ/g, '^O')
    .replace(/ᴷ/g, '^K')
    .replace(/ⱽ/g, '^V')
    .replace(/∈/g, ' in ')
    .replace(/ℝ/g, 'R')
    .replace(/×/g, 'x')
    .replace(/β/g, 'beta')
    .replace(/ε/g, 'epsilon')
    .replace(/α/g, 'alpha')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function escapePdfLiteral(text: string): string {
  return toWinAnsiSafe(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapLines(text: string, maxChars: number): string[] {
  const words = toWinAnsiSafe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface OutlineSpec {
  title: string;
  page: number;
  children?: Array<{ title: string; page: number }>;
}

const OUTLINE_SPECS: OutlineSpec[] = [
  {
    title: '1. Introduction',
    page: 1,
    children: [
      { title: '1.1 Background', page: 1 },
      { title: '1.2 Attention Concept', page: 2 },
    ],
  },
  {
    title: '2. Model Architecture',
    page: 2,
    children: [{ title: '2.1 Encoder & Decoder Stacks', page: 3 }],
  },
  {
    title: '3. Attention Mechanisms',
    page: 4,
    children: [
      { title: '3.1 Scaled Dot-Product Attention', page: 4 },
      { title: '3.2 Multi-Head Attention', page: 4 },
      { title: '3.3 Position-wise Feed-Forward', page: 5 },
    ],
  },
  {
    title: '4. Training Routine',
    page: 7,
    children: [{ title: '4.1 Optimizer & Schedule', page: 8 }],
  },
  {
    title: '5. Empirical Results',
    page: 10,
    children: [
      { title: '5.1 Machine Translation BLEU', page: 11 },
      { title: '5.2 Ablations & Conclusions', page: 14 },
    ],
  },
];

function buildPageContentStream(pageIndex: number): string {
  const page = PDF_PAGES[pageIndex];
  const ops: string[] = [];

  const drawText = (
    font: 'F1' | 'F2' | 'F3' | 'F4' | 'F5',
    size: number,
    x: number,
    y: number,
    text: string
  ) => {
    ops.push(`BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfLiteral(text)}) Tj ET`);
  };

  // White paper background ensures consistent rendering & color filters
  ops.push('q 1 1 1 rg 0 0 612 792 re f Q');

  // Running Header
  ops.push('0.45 0.45 0.45 rg');
  drawText('F5', 9, 64, 742, 'arXiv:1706.03762v7 [cs.CL]');
  drawText('F2', 9, 325, 742, page.headerRight);
  ops.push('0.78 0.78 0.78 RG 0.6 w 64 734 m 548 734 l S');

  // Page 1 Title Banner
  let y = 706;
  if (page.page === 1) {
    ops.push('0.08 0.08 0.08 rg');
    drawText('F2', 18, 64, y, 'Attention Is All You Need');
    y -= 20;
    ops.push('0.35 0.35 0.35 rg');
    drawText(
      'F1',
      10,
      64,
      y,
      'Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez'
    );
    y -= 26;
  }

  // Section Heading
  ops.push('0.08 0.08 0.08 rg');
  drawText('F4', 14.5, 64, y, page.sectionTitle);
  y -= 24;

  // Paragraphs
  for (let pIdx = 0; pIdx < page.paragraphs.length; pIdx++) {
    const para = page.paragraphs[pIdx];
    const lines = wrapLines(para, 82);

    // Subtle yellow highlight bar on Page 4 paragraph 2
    if (page.page === 4 && pIdx === 1) {
      const boxHeight = lines.length * 15 + 10;
      ops.push(`q 0.99 0.95 0.78 rg 60 ${y - boxHeight + 14} 492 ${boxHeight} re f Q`);
      ops.push(`q 0.85 0.65 0.10 rg 60 ${y - boxHeight + 14} 3 ${boxHeight} re f Q`);
    }

    ops.push('0.12 0.12 0.12 rg');
    for (const line of lines) {
      drawText('F3', 11, 64, y, line);
      y -= 15.5;
    }
    y -= 8;

    // Equation & Figure 2 after paragraph 2 on Page 4
    if (page.page === 4 && pIdx === 1 && page.equation) {
      ops.push(`q 0.95 0.95 0.96 rg 64 ${y - 44} 484 52 re f Q`);
      ops.push(`q 0.78 0.78 0.82 RG 0.6 w 64 ${y - 44} 484 52 re S Q`);
      ops.push('0.08 0.08 0.08 rg');
      drawText('F4', 11.5, 118, y - 14, 'MultiHead(Q, K, V) = Concat(head_1, ..., head_h) W^O');
      drawText('F3', 10.5, 146, y - 32, 'where head_i = Attention(Q W_i^Q, K W_i^K, V W_i^V)');
      ops.push('0.4 0.4 0.4 rg');
      drawText('F5', 10, 520, y - 22, page.equation.number);
      y -= 64;

      // SyncTeX projection formula line
      ops.push('0.12 0.12 0.12 rg');
      const projLines = wrapLines(
        'Where the projections are parameter matrices W_i^Q in R^(d_model x d_k), W_i^K in R^(d_model x d_k), W_i^V in R^(d_model x d_v) and W^O in R^(h*d_v x d_model).',
        82
      );
      for (const pl of projLines) {
        drawText('F3', 11, 64, y, pl);
        y -= 15.5;
      }
      y -= 12;

      // Vector Figure 2 box
      const figBottom = y - 196;
      ops.push(`q 0.97 0.97 0.98 rg 64 ${figBottom} 484 196 re f Q`);
      ops.push(`q 0.76 0.76 0.80 RG 0.8 w 64 ${figBottom} 484 196 re S Q`);
      ops.push('0.08 0.08 0.08 rg');
      drawText(
        'F4',
        10,
        82,
        y - 18,
        'Figure 2: (left) Scaled Dot-Product Attention. (right) Multi-Head Attention layers.'
      );

      // Left Panel: Scaled Dot-Product Attention
      ops.push(`q 0.99 0.99 1.0 rg 84 ${figBottom + 14} 195 154 re f Q`);
      ops.push(`q 0.78 0.78 0.82 RG 0.6 w 84 ${figBottom + 14} 195 154 re S Q`);
      ops.push('0.25 0.25 0.25 rg');
      drawText('F2', 8.5, 114, figBottom + 152, 'Scaled Dot-Product Attention');

      const drawNode = (
        nx: number,
        ny: number,
        nw: number,
        nh: number,
        fillRgb: string,
        strokeRgb: string,
        label: string
      ) => {
        ops.push(`q ${fillRgb} rg ${nx} ${ny} ${nw} ${nh} re f Q`);
        ops.push(`q ${strokeRgb} RG 0.7 w ${nx} ${ny} ${nw} ${nh} re S Q`);
        ops.push('0.08 0.08 0.08 rg');
        drawText('F5', 8, nx + 12, ny + 6, label);
      };

      drawNode(124, figBottom + 24, 115, 19, '0.96 0.86 0.86', '0.78 0.32 0.32', 'MatMul (Q, K)');
      ops.push(`0.4 0.4 0.4 RG 1 w 181 ${figBottom + 43} m 181 ${figBottom + 51} l S`);
      drawNode(136, figBottom + 51, 90, 18, '0.98 0.94 0.78', '0.80 0.64 0.14', 'Scale');
      ops.push(`0.4 0.4 0.4 RG 1 w 181 ${figBottom + 69} m 181 ${figBottom + 77} l S`);
      drawNode(132, figBottom + 77, 98, 18, '0.92 0.92 0.94', '0.50 0.50 0.55', 'Mask (opt.)');
      ops.push(`0.4 0.4 0.4 RG 1 w 181 ${figBottom + 95} m 181 ${figBottom + 103} l S`);
      drawNode(132, figBottom + 103, 98, 18, '0.84 0.96 0.89', '0.10 0.65 0.42', 'SoftMax');
      ops.push(`0.4 0.4 0.4 RG 1 w 181 ${figBottom + 121} m 181 ${figBottom + 128} l S`);
      drawNode(124, figBottom + 128, 115, 18, '0.96 0.86 0.86', '0.78 0.32 0.32', 'MatMul with V');

      // Right Panel: Multi-Head Parallel Slices
      ops.push(`q 0.99 0.99 1.0 rg 314 ${figBottom + 14} 214 154 re f Q`);
      ops.push(`q 0.78 0.78 0.82 RG 0.6 w 314 ${figBottom + 14} 214 154 re S Q`);
      ops.push('0.25 0.25 0.25 rg');
      drawText('F2', 8.5, 355, figBottom + 152, 'Multi-Head Parallel Slices');

      // Stacked heads
      ops.push(`q 0.86 0.96 0.90 rg 352 ${figBottom + 62} 138 36 re f Q`);
      ops.push(`q 0.10 0.65 0.42 RG 0.7 w 352 ${figBottom + 62} 138 36 re S Q`);
      ops.push(`q 0.88 0.97 0.92 rg 356 ${figBottom + 66} 138 36 re f Q`);
      ops.push(`q 0.10 0.65 0.42 RG 0.8 w 356 ${figBottom + 66} 138 36 re S Q`);
      ops.push('0.06 0.28 0.18 rg');
      drawText('F5', 8.5, 372, figBottom + 86, 'Scaled Dot-Product');
      drawText('F5', 7.5, 376, figBottom + 74, 'Head 1...h parallel');

      ops.push(`0.4 0.4 0.4 RG 1 w 421 ${figBottom + 102} m 421 ${figBottom + 112} l S`);
      drawNode(364, figBottom + 112, 114, 19, '0.86 0.92 0.99', '0.20 0.52 0.85', 'Concat + Linear');
      ops.push('0.25 0.25 0.25 rg');
      drawText('F5', 9, 356, figBottom + 28, 'V');
      drawText('F5', 9, 418, figBottom + 28, 'K');
      drawText('F5', 9, 480, figBottom + 28, 'Q');
      ops.push(`0.45 0.45 0.45 RG 0.9 w 360 ${figBottom + 38} m 382 ${figBottom + 62} l S`);
      ops.push(`0.45 0.45 0.45 RG 0.9 w 421 ${figBottom + 38} m 421 ${figBottom + 62} l S`);
      ops.push(`0.45 0.45 0.45 RG 0.9 w 482 ${figBottom + 38} m 460 ${figBottom + 62} l S`);

      y = figBottom - 16;
    }
  }

  // Running Footer
  ops.push('0.78 0.78 0.78 RG 0.6 w 64 56 m 548 56 l S');
  ops.push('0.42 0.42 0.42 rg');
  drawText('F5', 9, 64, 40, page.footerLeft);
  ops.push('0.10 0.10 0.10 rg');
  drawText('F2', 10, 534, 40, String(page.page));

  return ops.join('\n');
}

export function buildSamplePdfBytes(): Uint8Array {
  const objects: PdfObjectEntry[] = [];
  const nextId = () => objects.length + 1;
  const reserve = (): number => {
    const id = nextId();
    objects.push({ id, body: '' });
    return id;
  };
  const setObj = (id: number, body: string) => {
    objects[id - 1].body = body;
  };

  const catalogId = reserve();
  const pagesId = reserve();
  const outlinesId = reserve();

  // Fonts
  const f1Id = reserve(); // Helvetica
  const f2Id = reserve(); // Helvetica-Bold
  const f3Id = reserve(); // Times-Roman
  const f4Id = reserve(); // Times-Bold
  const f5Id = reserve(); // Courier

  setObj(f1Id, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  setObj(f2Id, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  setObj(f3Id, '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>');
  setObj(f4Id, '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>');
  setObj(f5Id, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');

  const resourcesDict = `<< /Font << /F1 ${f1Id} 0 R /F2 ${f2Id} 0 R /F3 ${f3Id} 0 R /F4 ${f4Id} 0 R /F5 ${f5Id} 0 R >> >>`;

  // Pages & Content Streams
  const pageIds: number[] = [];
  for (let i = 0; i < PDF_PAGES.length; i++) {
    const pageId = reserve();
    const contentId = reserve();
    pageIds.push(pageId);

    const stream = buildPageContentStream(i);
    setObj(
      contentId,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    );
    setObj(
      pageId,
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources ${resourcesDict} /Contents ${contentId} 0 R >>`
    );
  }

  // Outlines tree
  interface AllocatedOutline {
    id: number;
    title: string;
    pageId: number;
    parentId: number;
    children: AllocatedOutline[];
  }

  const topNodes: AllocatedOutline[] = OUTLINE_SPECS.map((spec) => {
    const id = reserve();
    const pageId = pageIds[Math.max(0, Math.min(pageIds.length - 1, spec.page - 1))];
    const children: AllocatedOutline[] = (spec.children ?? []).map((child) => ({
      id: reserve(),
      title: child.title,
      pageId: pageIds[Math.max(0, Math.min(pageIds.length - 1, child.page - 1))],
      parentId: id,
      children: [],
    }));
    return { id, title: spec.title, pageId, parentId: outlinesId, children };
  });

  const countTotalDescendants = (nodes: AllocatedOutline[]): number =>
    nodes.reduce((sum, n) => sum + 1 + countTotalDescendants(n.children), 0);

  const wireOutlineSiblings = (nodes: AllocatedOutline[]) => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const prev = i > 0 ? nodes[i - 1].id : null;
      const next = i < nodes.length - 1 ? nodes[i + 1].id : null;
      const parts = [
        `/Title (${escapePdfLiteral(node.title)})`,
        `/Parent ${node.parentId} 0 R`,
        `/Dest [${node.pageId} 0 R /Fit]`,
      ];
      if (prev) parts.push(`/Prev ${prev} 0 R`);
      if (next) parts.push(`/Next ${next} 0 R`);
      if (node.children.length > 0) {
        parts.push(`/First ${node.children[0].id} 0 R`);
        parts.push(`/Last ${node.children[node.children.length - 1].id} 0 R`);
        parts.push(`/Count ${node.children.length}`);
        wireOutlineSiblings(node.children);
      }
      setObj(node.id, `<< ${parts.join(' ')} >>`);
    }
  };

  wireOutlineSiblings(topNodes);

  setObj(
    outlinesId,
    `<< /Type /Outlines /First ${topNodes[0].id} 0 R /Last ${topNodes[topNodes.length - 1].id} 0 R /Count ${countTotalDescendants(topNodes)} >>`
  );
  setObj(
    pagesId,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
  );
  setObj(
    catalogId,
    `<< /Type /Catalog /Pages ${pagesId} 0 R /Outlines ${outlinesId} 0 R /PageMode /UseOutlines >>`
  );

  // Serialize PDF with exact xref byte offsets
  const chunks: string[] = ['%PDF-1.4\n'];
  let offset = chunks[0].length;
  const xrefOffsets: number[] = [0];

  for (const obj of objects) {
    xrefOffsets.push(offset);
    const entry = `${obj.id} 0 obj\n${obj.body}\nendobj\n`;
    chunks.push(entry);
    offset += entry.length;
  }

  const xrefStart = offset;
  const xrefRows = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
  for (let i = 1; i < xrefOffsets.length; i++) {
    xrefRows.push(`${String(xrefOffsets[i]).padStart(10, '0')} 00000 n \n`);
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  const pdfText = chunks.join('') + xrefRows.join('') + trailer;

  const bytes = new Uint8Array(pdfText.length);
  for (let i = 0; i < pdfText.length; i++) {
    bytes[i] = pdfText.charCodeAt(i) & 0xff;
  }
  return bytes;
}
