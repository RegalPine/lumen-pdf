import test from 'node:test';
import assert from 'node:assert/strict';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { buildSamplePdfBytes } from './samplePdfBuilder';
import {
  buildExtractedPageFromTextItems,
  ExtractedPdfPage,
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
  const doc = await loadingTask.promise;
  const pages: ExtractedPdfPage[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
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
    pages.push(buildExtractedPageFromTextItems(p, rawItems));
  }

  await loadingTask.destroy();
  return pages;
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

test('stepMatchIndex wraps cleanly in both directions', () => {
  assert.equal(stepMatchIndex(0, -1, 5), 4);
  assert.equal(stepMatchIndex(4, 1, 5), 0);
  assert.equal(stepMatchIndex(1, 1, 5), 2);
  assert.equal(stepMatchIndex(-1, 1, 0), -1);
});
