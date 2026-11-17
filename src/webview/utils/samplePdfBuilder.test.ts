import assert from 'node:assert/strict';
import test from 'node:test';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildSamplePdfBytes } from './samplePdfBuilder';

test('buildSamplePdfBytes generates a valid 15-page PDF parseable by pdfjs-dist', async () => {
  const bytes = buildSamplePdfBytes();
  const header = new TextDecoder().decode(bytes.slice(0, 8));
  assert.equal(header, '%PDF-1.4');

  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    useWorkerFetch: false,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;

  assert.equal(doc.numPages, 15);

  const outline = await doc.getOutline();
  assert.ok(outline && outline.length >= 5, 'Expected embedded PDF outline tree');
  assert.equal(outline[0].title, '1. Introduction');
  assert.ok(outline[2].items && outline[2].items.length >= 2);

  const page4 = await doc.getPage(4);
  const textContent = await page4.getTextContent();
  const page4Text = textContent.items
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ');
  assert.ok(page4Text.includes('Multi-Head Attention'));
  assert.ok(page4Text.includes('MultiHead(Q, K, V)'));

  await loadingTask.destroy();
});
