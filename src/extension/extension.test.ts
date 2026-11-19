import assert from 'node:assert/strict';
import * as path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const bundle = build({
  entryPoints: ['src/extension/extension.ts'],
  bundle: true,
  external: ['vscode'],
  platform: 'node',
  format: 'cjs',
  write: false,
});

async function createWebview(readFile: () => Promise<Uint8Array>) {
  let provider: { resolveCustomEditor(document: unknown, panel: unknown): Promise<void> } | undefined;
  let receive: ((message: Record<string, unknown>) => Promise<void>) | undefined;
  let dispose: (() => void) | undefined;
  const posted: Record<string, any>[] = [];
  const logs: string[] = [];
  const timers = new Set<() => void>();
  const vscode = {
    workspace: { fs: { readFile } },
    Uri: { joinPath: () => ({ fsPath: '/extension/dist' }) },
    window: {
      registerCustomEditorProvider: (_: string, value: typeof provider) => { provider = value; },
      createOutputChannel: () => ({ appendLine: (line: string) => logs.push(line), show() {}, dispose() {} }),
    },
    commands: { registerCommand: () => ({ dispose() {} }) },
  };
  const module = { exports: {} as { activate(context: unknown): void } };
  const requireMock = (name: string) => {
    if (name === 'vscode') return vscode;
    if (name === 'path') return path;
    if (name === 'fs') return {
      existsSync: () => true,
      readFileSync: () => '<html><head></head><body></body></html>',
    };
    throw new Error(`测试中未预期的模块：${name}`);
  };
  // 执行实际扩展入口，只替换 IDE 与文件系统边界，不复制待测的传输逻辑。
  runInNewContext((await bundle).outputFiles![0].text, {
    require: requireMock, module, exports: module.exports, ArrayBuffer, Uint8Array, performance,
    setTimeout: (callback: () => void) => { timers.add(callback); return callback; },
    clearTimeout: (callback: () => void) => timers.delete(callback),
  });
  module.exports.activate({ extensionUri: {}, subscriptions: [] });
  assert.ok(provider);
  await provider.resolveCustomEditor({ uri: { fsPath: '/workspace/document.pdf' } }, {
    onDidDispose: (handler: () => void) => { dispose = handler; },
    webview: {
      cspSource: 'vscode-webview:',
      asWebviewUri: () => ({ toString: () => 'vscode-webview://test/dist' }),
      onDidReceiveMessage: (handler: typeof receive) => { receive = handler; },
      postMessage: async (message: Record<string, unknown>) => { posted.push(message); return true; },
    },
  });
  assert.ok(receive);
  assert.ok(dispose);
  return { receive, dispose, posted, logs, timers };
}

async function postFileToWebview(source: Uint8Array) {
  const host = await createWebview(async () => source);
  await host.receive({ type: 'ready' });
  const posted = host.posted.find(message => message.type === 'loadPdf');
  assert.ok(posted);
  assert.equal(posted.fileName, 'document.pdf');
  assert.ok(posted.data instanceof ArrayBuffer);
  assert.deepEqual([...new Uint8Array(posted.data)], [...source]);
  host.dispose();
  return posted.data;
}

test('扩展将带偏移的 Buffer 转为精确范围的 ArrayBuffer，不发送相邻字节', async () => {
  const backing = Buffer.from([255, 37, 80, 68, 70, 255]);
  const source = backing.subarray(1, 5);
  assert.ok(source.byteOffset > 0);
  const result = await postFileToWebview(source);
  assert.equal(result.byteLength, 4);
  assert.notEqual(result, backing.buffer);
});

test('扩展对占满缓冲区的 Buffer 保持二进制传输且不额外复制', async () => {
  const source = Buffer.from(new ArrayBuffer(8));
  source.set([37, 80, 68, 70, 45, 49, 46, 54]);
  const result = await postFileToWebview(source);
  assert.equal(result, source.buffer);
});

test('扩展同样支持普通 Uint8Array 子视图', async () => {
  const source = new Uint8Array([255, 37, 80, 68, 70, 255]).subarray(1, 5);
  assert.equal((await postFileToWebview(source)).byteLength, 4);
});

test('宿主发送阶段、耗时并仅接收当前请求的一次确认', async () => {
  const host = await createWebview(async () => new Uint8Array([37]));
  await host.receive({ type: 'ready' });
  assert.deepEqual(host.posted.map(m => m.type), ['pdfLoadProgress', 'pdfLoadProgress', 'loadPdf']);
  const load = host.posted[2];
  assert.equal(host.posted[0].stage, 'reading-file');
  assert.equal(host.posted[1].stage, 'transferring');
  assert.ok(load.timings.readMs >= 0);
  assert.ok(load.timings.prepareMs >= 0);
  assert.ok(load.timings.webviewReadyMs >= 0);
  await host.receive({ type: 'pdfLoadReceived', requestId: 'stale' });
  assert.equal(host.posted.length, 3);
  await host.receive({ type: 'pdfLoadReceived', requestId: load.requestId });
  await host.receive({ type: 'pdfLoadReceived', requestId: load.requestId });
  assert.equal(host.posted.length, 4);
  assert.ok(host.posted[3].timings.transferAckMs >= 0);
  await host.receive({ type: 'pdfLoadStage', requestId: load.requestId, stage: 'worker', elapsedMs: 1 });
  assert.equal(host.timers.size, 1);
  for (const callback of host.timers) callback();
  assert.ok(host.logs.some(line => line.includes('启动 PDF Worker 已等待超过 10 秒')));
  await host.receive({ type: 'pdfLoadStage', requestId: load.requestId, stage: 'ready', elapsedMs: 22 });
  assert.equal(host.timers.size, 0);
  assert.ok(host.logs.every(line => !line.includes('document.pdf') && !line.includes('/workspace')));
  host.dispose();
});

test('读取失败回传错误并停止宿主计时，不遗留无限加载', async () => {
  const host = await createWebview(async () => { throw new Error('敏感文件路径'); });
  await host.receive({ type: 'ready' });
  assert.equal(host.posted.at(-1)?.type, 'pdfLoadError');
  assert.equal(host.timers.size, 0);
  assert.ok(!JSON.stringify(host.posted).includes('敏感文件路径'));
  host.dispose();
});

test('编辑器销毁后迟到的读取结果不发送，计时器全部释放', async () => {
  let resolve!: (bytes: Uint8Array) => void;
  const host = await createWebview(() => new Promise(done => { resolve = done; }));
  const pending = host.receive({ type: 'ready' });
  await new Promise<void>(resolve => setImmediate(resolve));
  host.dispose();
  resolve(new Uint8Array([37]));
  await pending;
  assert.equal(host.posted.filter(m => m.type === 'loadPdf').length, 0);
  assert.equal(host.timers.size, 0);
});

test('重复握手时旧读取结果不能覆盖较新的请求', async () => {
  const reads: ((bytes: Uint8Array) => void)[] = [];
  const host = await createWebview(() => new Promise(resolve => reads.push(resolve)));
  const first = host.receive({ type: 'ready' });
  await new Promise<void>(resolve => setImmediate(resolve));
  const second = host.receive({ type: 'ready' });
  await new Promise<void>(resolve => setImmediate(resolve));
  reads[1](new Uint8Array([2]));
  await second;
  reads[0](new Uint8Array([1]));
  await first;
  const sent = host.posted.filter(m => m.type === 'loadPdf');
  assert.equal(sent.length, 1);
  assert.deepEqual([...new Uint8Array(sent[0].data)], [2]);
  host.dispose();
});
