import assert from 'node:assert/strict';
import test from 'node:test';
import { afterNextPaint } from './pdfRenderScheduling';

function createFrames() {
  let sequence = 0;
  const pending = new Map<number, FrameRequestCallback>();
  return {
    request(callback: FrameRequestCallback) {
      pending.set(++sequence, callback);
      return sequence;
    },
    cancel(id: number) { pending.delete(id); },
    tick() {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(0);
    },
    pending,
  };
}

test('后台任务等待两次动画帧，不在首屏完成的同一帧启动', () => {
  const frames = createFrames();
  let calls = 0;
  afterNextPaint(() => calls++, frames);
  assert.equal(calls, 0);
  frames.tick();
  assert.equal(calls, 0);
  frames.tick();
  assert.equal(calls, 1);
  frames.tick();
  assert.equal(calls, 1);
});

test('首帧前取消不会遗留后续任务', () => {
  const frames = createFrames();
  let calls = 0;
  const cancel = afterNextPaint(() => calls++, frames);
  cancel();
  cancel();
  frames.tick();
  frames.tick();
  assert.equal(calls, 0);
  assert.equal(frames.pending.size, 0);
});

test('两帧之间取消可阻止已经排队的回调', () => {
  const frames = createFrames();
  let calls = 0;
  const cancel = afterNextPaint(() => calls++, frames);
  frames.tick();
  const queued = [...frames.pending.values()][0];
  cancel();
  queued(0);
  frames.tick();
  assert.equal(calls, 0);
  assert.equal(frames.pending.size, 0);
});

test('切换文档后仅新文档的延迟任务执行', () => {
  const frames = createFrames();
  const calls: string[] = [];
  const cancelOld = afterNextPaint(() => calls.push('old'), frames);
  frames.tick();
  cancelOld();
  afterNextPaint(() => calls.push('new'), frames);
  frames.tick();
  assert.deepEqual(calls, []);
  frames.tick();
  assert.deepEqual(calls, ['new']);
});
