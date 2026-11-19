import test from 'node:test';
import assert from 'node:assert/strict';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { buildSamplePdfBytes } from './samplePdfBuilder';
import {
  ExtractedPdfPage,
  extractPdfTextIndex,
  searchPdfPages,
  stepMatchIndex,
} from './pdfSearch';

async function extractRealSamplePages(): Promise<ExtractedPdfPage[]> {
  const bytes = buildSamplePdfBytes();
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    useWorkerFetch: false,
    verbosity: 0,
  });
  try {
    const doc = await loadingTask.promise;
    return await extractPdfTextIndex(doc);
  } finally {
    await loadingTask.destroy();
  }
}

test('searchPdfPages finds matches across all 15 real PDF pages and maps itemSpans', async () => {
  const pages = await extractRealSamplePages();
  const result = searchPdfPages(pages, 'attention', {
    caseSensitive: false,
    wholeWord: false,
  });

  assert.ok(result.totalMatches > 10);
  assert.ok(result.pageGroups.length >= 4);
  assert.equal(result.flatMatches.length, result.totalMatches);
  assert.ok(result.flatMatches[0].itemSpans.length >= 1);
  assert.equal(
    result.flatMatches[result.flatMatches.length - 1].globalIndex,
    result.totalMatches - 1
  );
});

test('searchPdfPages respects caseSensitive and wholeWord toggles on real PDF text', async () => {
  const pages = await extractRealSamplePages();

  const insensitive = searchPdfPages(pages, 'Adam', {
    caseSensitive: false,
    wholeWord: false,
  });
  const sensitiveLower = searchPdfPages(pages, 'adam', {
    caseSensitive: true,
    wholeWord: false,
  });
  assert.ok(insensitive.totalMatches >= 1);
  assert.equal(sensitiveLower.totalMatches, 0);

  const partial = searchPdfPages(pages, 'head', {
    caseSensitive: false,
    wholeWord: false,
  });
  const whole = searchPdfPages(pages, 'head', {
    caseSensitive: false,
    wholeWord: true,
  });
  assert.ok(partial.totalMatches > whole.totalMatches);
  assert.ok(whole.totalMatches >= 1);
});

test('searchPdfPages escapes special regex characters safely', async () => {
  const pages = await extractRealSamplePages();
  const result = searchPdfPages(pages, 'd_model', {
    caseSensitive: false,
    wholeWord: false,
  });
  assert.ok(result.totalMatches >= 2);
});

function mockIndexDocument(count: number, failurePage = -1) {
  const visited: number[] = [];
  const doc = {
    numPages: count,
    getPage: async (page: number) => {
      visited.push(page);
      if (page === failurePage) throw new Error('损坏的文本页');
      return { getTextContent: async () => ({
        items: [{ str: `needle${page}`, transform: [1, 0, 0, 12, 40, 700], width: 60, height: 12 }],
      }) };
    },
  } as unknown as Pick<PDFDocumentProxy, 'numPages' | 'getPage'>;
  return { doc, visited };
}

test('后台索引在全文完成前发布独立快照，并保持全文搜索页码', async () => {
  const { doc } = mockIndexDocument(25);
  const updates: ExtractedPdfPage[][] = [];
  let yielded = false;
  setTimeout(() => { yielded = true; }, 0);
  const pages = await extractPdfTextIndex(doc, undefined, {
    onProgress: (snapshot) => updates.push(snapshot),
  });
  assert.equal(updates[0].length, 1);
  assert.equal(updates.at(-1)?.length, 25);
  assert.equal(yielded, true);
  assert.notEqual(updates.at(-1), pages);
  const result = searchPdfPages(pages, 'needle25', { caseSensitive: false, wholeWord: true });
  assert.equal(result.totalMatches, 1);
  assert.equal(result.flatMatches[0].page, 25);
});

test('取消后台索引后停止读取后续页并且不发布迟到结果', async () => {
  const { doc, visited } = mockIndexDocument(25);
  const controller = new AbortController();
  const updates: number[] = [];
  await assert.rejects(extractPdfTextIndex(doc, undefined, {
    signal: controller.signal,
    onProgress: (pages) => {
      updates.push(pages.length);
      controller.abort();
    },
  }), { name: 'AbortError' });
  assert.deepEqual(visited, [1]);
  assert.deepEqual(updates, [1]);
});

test('索引取消发生在文本提取期间时也不发布该页', async () => {
  const controller = new AbortController();
  const doc = { numPages: 1, getPage: async () => ({ getTextContent: async () => {
    controller.abort();
    return { items: [] };
  } }) } as unknown as Pick<PDFDocumentProxy, 'numPages' | 'getPage'>;
  let published = false;
  await assert.rejects(extractPdfTextIndex(doc, undefined, {
    signal: controller.signal,
    onProgress: () => { published = true; },
  }), { name: 'AbortError' });
  assert.equal(published, false);
});

test('单页提取失败仍保留页码占位并继续索引，报告失败页', async () => {
  const { doc } = mockIndexDocument(9, 2);
  let failed: number[] = [];
  const pages = await extractPdfTextIndex(doc, undefined, {
    onProgress: (_, failures) => { failed = failures; },
  });
  assert.equal(pages.length, 9);
  assert.equal(pages[1].page, 2);
  assert.equal(pages[1].fullText, '');
  assert.equal(pages[8].fullText, 'needle9');
  assert.deepEqual(failed, [2]);
});

test('stepMatchIndex wraps cleanly in both directions', () => {
  assert.equal(stepMatchIndex(0, -1, 5), 4);
  assert.equal(stepMatchIndex(4, 1, 5), 0);
  assert.equal(stepMatchIndex(1, 1, 5), 2);
  assert.equal(stepMatchIndex(-1, 1, 0), -1);
});
