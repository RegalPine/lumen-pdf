/**
 * Pure helpers that turn the Vite build output into HTML that works inside a VS
 * Code webview. Kept free of the `vscode` API so it stays unit-testable.
 */

/**
 * Rewrites asset URLs emitted by Vite (`base: './'`) to webview URIs, drops
 * `crossorigin` hints and injects a `<base>` plus a Content-Security-Policy.
 */
export function renderWebviewHtml(rawHtml: string, distBaseUri: string, cspSource: string): string {
  let html = rawHtml.replace(/\s+crossorigin(?:="[^"]*")?/gi, '');

  // Vite emits `./assets/...`; the webview needs full vscode-webview URIs.
  // External URLs (https://...) never match because they do not start with `/` or `./`.
  html = html.replace(
    /(href|src)="\.?\/([^"]*)"/g,
    (_match, attr: string, relPath: string) => `${attr}="${distBaseUri}/${relPath}"`
  );

  const csp = [
    "default-src 'none'",
    `img-src ${cspSource} data: blob:`,
    `style-src ${cspSource} 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src ${cspSource} https://fonts.gstatic.com data:`,
    `script-src ${cspSource} 'wasm-unsafe-eval'`,
    `worker-src ${cspSource} blob:`,
    `connect-src ${cspSource} data: blob:`,
  ].join('; ');

  const head = `<base href="${distBaseUri}/">\n<meta http-equiv="Content-Security-Policy" content="${csp}">`;

  return html.includes('<head')
    ? html.replace(/<head[^>]*>/i, (tag) => `${tag}\n${head}`)
    : `${head}\n${html}`;
}
