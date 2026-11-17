import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { renderWebviewHtml } from './webviewHtml.js';

interface PdfCustomDocument extends vscode.CustomDocument {
  readonly uri: vscode.Uri;
}

class PdfCustomEditorProvider implements vscode.CustomReadonlyEditorProvider<PdfCustomDocument> {
  private readonly panels = new Set<vscode.WebviewPanel>();

  constructor(private readonly context: vscode.ExtensionContext) {}

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
    this.panels.add(webviewPanel);
    webviewPanel.onDidDispose(() => this.panels.delete(webviewPanel));

    const distRoot = vscode.Uri.joinPath(this.context.extensionUri, 'dist');
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [distRoot],
    };

    webviewPanel.webview.html = this.buildWebviewHtml(webviewPanel.webview, distRoot);

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message?.type === 'ready') {
        const fileBytes = await vscode.workspace.fs.readFile(document.uri);
        const fileName = path.basename(document.uri.fsPath);
        await webviewPanel.webview.postMessage({
          type: 'loadPdf',
          data: Array.from(fileBytes),
          fileName,
        });
      }
    });
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
  const provider = new PdfCustomEditorProvider(context);

  context.subscriptions.push(
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
