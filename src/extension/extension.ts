import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { renderWebviewHtml } from './webviewHtml.js';

interface PdfCustomDocument extends vscode.CustomDocument {
  readonly uri: vscode.Uri;
}

class PdfCustomEditorProvider implements vscode.CustomReadonlyEditorProvider<PdfCustomDocument> {
  private readonly panels = new Set<vscode.WebviewPanel>();

  private nextRequest = 0;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
  ) {}

  async openCustomDocument(uri: vscode.Uri): Promise<PdfCustomDocument> {
    return {
      uri,
      dispose: () => {},
    };
  }

  async resolveCustomEditor(
    document: PdfCustomDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    const openedAt = performance.now();
    let disposed = false;
    let requestId = '';
    let sentAt: number | undefined;
    let acknowledged = false;
    let stage = '等待 Webview 就绪';
    const log = (text: string) => this.output.appendLine(`[${requestId || '初始化'}] ${text}`);
    let warning: ReturnType<typeof setTimeout> | undefined;
    const watch = (nextStage: string) => {
      stage = nextStage;
      clearTimeout(warning);
      warning = setTimeout(() => log(`${stage} 已等待超过 10 秒`), 10_000);
    };
    watch(stage);
    this.panels.add(webviewPanel);
    webviewPanel.onDidDispose(() => {
      disposed = true;
      clearTimeout(warning);
      this.panels.delete(webviewPanel);
    });

    const distRoot = vscode.Uri.joinPath(this.context.extensionUri, 'dist');
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [distRoot],
    };

    const send = (message: unknown) => webviewPanel.webview.postMessage(message);
    // 先监听，再设置 HTML，避免快启动时丢失 ready 握手。
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (disposed) return;
      if (message?.type === 'ready') {
        const id = requestId = `load-${++this.nextRequest}`;
        sentAt = undefined;
        acknowledged = false;
        const webviewReadyMs = Math.round(performance.now() - openedAt);
        log(`Webview 就绪：${webviewReadyMs} ms`);
        watch('读取 PDF 文件');
        try {
          await send({ type: 'pdfLoadProgress', requestId: id, stage: 'reading-file' });
          if (disposed || requestId !== id) return;
          const readStart = performance.now();
          const fileBytes = await vscode.workspace.fs.readFile(document.uri);
          const readMs = Math.round(performance.now() - readStart);
          if (disposed || requestId !== id) return;
          log(`读取文件：${readMs} ms，${fileBytes.byteLength} 字节`);
          const prepareStart = performance.now();
          // 文件系统可能返回 Buffer，直接发送会触发 toJSON；改用精确字节范围的 ArrayBuffer。
          const data = fileBytes.buffer instanceof ArrayBuffer &&
            fileBytes.byteOffset === 0 && fileBytes.byteLength === fileBytes.buffer.byteLength
            ? fileBytes.buffer
            : new Uint8Array(fileBytes).buffer;
          const prepareMs = Math.round(performance.now() - prepareStart);
          await send({ type: 'pdfLoadProgress', requestId: id, stage: 'transferring' });
          if (disposed || requestId !== id) return;
          watch('等待 Webview 接收确认');
          sentAt = performance.now();
          const delivered = await send({
            type: 'loadPdf', data, fileName: path.basename(document.uri.fsPath),
            requestId: id, timings: { webviewReadyMs, readMs, prepareMs },
          });
          if (!delivered && !disposed && requestId === id) {
            clearTimeout(warning);
            log('消息未投递，编辑器可能已关闭或隐藏；请重新打开 PDF。');
          }
        } catch {
          if (disposed || requestId !== id) return;
          clearTimeout(warning);
          log(`${stage} 失败`);
          await send({ type: 'pdfLoadError', requestId: id,
            message: '读取或传输 PDF 失败，请检查文件是否存在、访问权限及远程连接后重新打开。',
          }).then(undefined, () => {});
        }
      } else if (message?.requestId === requestId && message.type === 'pdfLoadReceived' && sentAt !== undefined && !acknowledged) {
        acknowledged = true;
        clearTimeout(warning);
        const transferAckMs = Math.round(performance.now() - sentAt);
        log(`传输确认往返（含消息调度）：${transferAckMs} ms`);
        await send({ type: 'pdfLoadTiming', requestId, timings: { transferAckMs } }).then(undefined, () => {});
      } else if (message?.requestId === requestId && message.type === 'pdfLoadStage') {
        const stages: Record<string, string> = {
          closing: '释放上一份文档', decoding: '解码接收数据', worker: '启动 PDF Worker',
          parsing: '解析 PDF 结构', rendering: '绘制首屏画布', ready: '首屏画布完成', error: '加载失败',
        };
        const label = stages[message.stage];
        if (!label || !Number.isFinite(message.elapsedMs) || message.elapsedMs < 0) return;
        log(`Webview +${Math.round(message.elapsedMs)} ms：${label}`);
        if (message.stage === 'ready' || message.stage === 'error') clearTimeout(warning);
        else watch(label);
      }
    });
    try {
      webviewPanel.webview.html = this.buildWebviewHtml(webviewPanel.webview, distRoot);
    } catch (error) {
      clearTimeout(warning);
      log('Webview 资源初始化失败，请检查扩展构建产物。');
      throw error;
    }
  }

  public broadcastColorModeToggle(): void {
    for (const panel of this.panels) {
      panel.webview.postMessage({ type: 'toggleColorMode' });
    }
  }

  private buildWebviewHtml(webview: vscode.Webview, distRoot: vscode.Uri): string {
    const indexPath = distRoot.fsPath;
    const indexFile = path.join(indexPath, 'index.html');

    if (!fs.existsSync(indexFile)) {
      throw new Error(
        `Lumen PDF webview assets are missing (${indexFile}). Run "npm run build" before launching the extension.`
      );
    }

    const rawHtml = fs.readFileSync(indexFile, 'utf8');
    const distBaseUri = webview.asWebviewUri(distRoot).toString();

    return renderWebviewHtml(rawHtml, distBaseUri, webview.cspSource);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Lumen PDF 加载诊断');
  const provider = new PdfCustomEditorProvider(context, output);

  context.subscriptions.push(
    output,
    vscode.commands.registerCommand('pdfReader.showLoadDiagnostics', () => output.show(true)),
    vscode.window.registerCustomEditorProvider('pdfReader.viewer', provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
    vscode.commands.registerCommand('pdfReader.toggleColorMode', () => {
      provider.broadcastColorModeToggle();
    })
  );
}

export function deactivate(): void {}
