import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLoadTrace, LOAD_WARNING_MS, PdfLoadTrace } from './pdfLoadDiagnostics';

test('阶段超时按单调时钟计算，进入新阶段后重新计时', () => {
  let now = 0;
  const trace = new PdfLoadTrace('test', () => now);
  now = LOAD_WARNING_MS;
  assert.equal(trace.snapshot().slow, true);
  trace.mark('worker');
  assert.equal(trace.snapshot().slow, false);
  now += LOAD_WARNING_MS;
  assert.equal(trace.snapshot().slow, true);
  trace.mark('parsing');
  assert.equal(trace.snapshot().stageElapsedMs, 0);
});

test('首屏完成后冻结总耗时，文字层和迟到宿主计时仍可更新', () => {
  let now = 0;
  const trace = new PdfLoadTrace('test', () => now);
  trace.mark('rendering');
  now = 200;
  trace.mark('ready');
  now = 400;
  trace.textLayer(false);
  trace.mark('error');
  trace.update({ bytes: 100, pages: 626, host: { transferAckMs: 123 } });
  const report = trace.snapshot();
  assert.equal(report.elapsedMs, 200);
  assert.equal(report.stage, 'ready');
  assert.equal(report.textLayerMs, 400);
  assert.equal(report.host.transferAckMs, 123);
  assert.equal(report.slow, false);
  assert.match(formatLoadTrace(report), /非单向传输/);
});

test('失败不是首屏成功，重复阶段不累积且旧快照不被改写', () => {
  let now = 0;
  const trace = new PdfLoadTrace('test', () => now);
  trace.mark('parsing');
  const before = trace.snapshot();
  trace.mark('parsing');
  now = 80;
  trace.mark('error');
  trace.mark('ready');
  assert.equal(trace.snapshot().stage, 'error');
  assert.equal(trace.snapshot().events.length, 3);
  assert.equal(before.events.length, 2);
  assert.equal(before.stage, 'parsing');
});

test('新请求计时独立，拒绝无效宿主耗时，取消订阅后不再通知', () => {
  let calls = 0;
  const old = new PdfLoadTrace('old', () => 0);
  const current = new PdfLoadTrace('new', () => 200);
  const unsubscribe = current.subscribe(() => calls++);
  current.mark('worker');
  unsubscribe();
  current.update({ host: { readMs: NaN, prepareMs: -1, transferAckMs: Infinity, webviewReadyMs: 15 } });
  old.mark('error');
  assert.equal(calls, 1);
  assert.equal(current.snapshot().stage, 'worker');
  assert.deepEqual(current.snapshot().host, { webviewReadyMs: 15 });
  assert.equal(current.snapshot().elapsedMs, 0);
});
