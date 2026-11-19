import assert from 'node:assert/strict';
import test from 'node:test';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildSamplePdfBytes } from './samplePdfBuilder';
import { decodePdfBytes } from './vscodeBridge';

const HEADER = [37, 80, 68, 70, 45, 49, 46, 54];

test('ArrayBuffer 解码复用原缓冲区，避免大文件整份复制', () => {
  const buffer = new Uint8Array(HEADER).buffer;
  const bytes = decodePdfBytes(buffer);
  assert.equal(bytes.buffer, buffer);
  assert.deepEqual([...bytes], HEADER);
});

test('Uint8Array 解码保留子视图的字节偏移和长度', () => {
  const source = new Uint8Array([255, ...HEADER, 255]);
  const view = source.subarray(1, source.length - 1);
  const bytes = decodePdfBytes(view);
  assert.equal(bytes, view);
  assert.equal(bytes.byteOffset, 1);
  assert.deepEqual([...bytes], HEADER);
});

test('兼容旧 number[] 消息', () => {
  assert.deepEqual([...decodePdfBytes(HEADER)], HEADER);
});

test('真实 Node.js Buffer JSON 消息不会被误解码成空 PDF', () => {
  const source = Buffer.from(HEADER);
  const message = JSON.parse(JSON.stringify({ data: source }));
  assert.equal(new Uint8Array(message.data).byteLength, 0);
  assert.deepEqual([...decodePdfBytes(message.data)], HEADER);
});

test('拒绝未知消息对象，区分传输格式错误和空文件', () => {
  for (const data of [null, undefined, {}, { 0: 37 }, { type: 'Buffer' }, { type: 'Buffer', data: 'PDF' }]) {
    assert.throws(() => decodePdfBytes(data), /传输格式无效/);
  }
});

test('拒绝越界、非数字或稀疏的旧版字节数组', () => {
  for (const data of [[-1], [256], [1.5], ['37'], [NaN], new Array(1)]) {
    assert.throws(() => decodePdfBytes(data), /无效字节/);
    assert.throws(() => decodePdfBytes({ type: 'Buffer', data }), /无效字节/);
  }
});

test('所有受支持的空数据格式均给出明确提示', () => {
  for (const data of [[], new Uint8Array(), new ArrayBuffer(0), { type: 'Buffer', data: [] }]) {
    assert.throws(() => decodePdfBytes(data), /0 字节/);
  }
});

test('真实 PDF 经 Buffer JSON 传输后仍可完整解析', async () => {
  const source = buildSamplePdfBytes();
  const wireData = JSON.parse(JSON.stringify(Buffer.from(source)));
  const bytes = decodePdfBytes(wireData);
  assert.equal(bytes.byteLength, source.byteLength);
  assert.deepEqual(bytes, source);
  const task = pdfjsLib.getDocument({ data: bytes, useWorkerFetch: false, verbosity: 0 });
  try {
    const doc = await task.promise;
    assert.equal(doc.numPages, 15);
    const content = await (await doc.getPage(15)).getTextContent();
    assert.ok(content.items.length > 0);
  } finally {
    await task.destroy();
  }
});
