import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWebviewHtml } from './webviewHtml.js';

const DIST_BASE = 'vscode-webview://1abc2def/f:/proj/dist';
const CSP_SOURCE = 'vscode-webview://1abc2def';

/** Mirrors the shape Vite emits with `base: './'` for the webview build. */
const VITE_OUTPUT = [
  '<!doctype html>',
  '<html lang="en" class="dark">',
  '  <head>',
  '    <meta charset="UTF-8" />',
  '    <title>Lumen PDF</title>',
  '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
  '    <link',
  '      href="https://fonts.googleapis.com/css2?family=Space+Mono&display=swap"',
  '      rel="stylesheet"',
  '    />',
  '    <script type="module" crossorigin src="./assets/index-Cq11NEkq.js"></script>',
  '    <link rel="stylesheet" crossorigin href="./assets/index-CU0vbFdO.css">',
  '  </head>',
  '  <body><div id="root"></div></body>',
  '</html>',
].join('\n');

function run(html = VITE_OUTPUT): string {
  return renderWebviewHtml(html, DIST_BASE, CSP_SOURCE);
}

test('rewrites Vite relative asset URLs to webview URIs', () => {
  const out = run();
  assert.match(
    out,
    /src="vscode-webview:\/\/1abc2def\/f:\/proj\/dist\/assets\/index-Cq11NEkq\.js"/
  );
  assert.match(
    out,
    /href="vscode-webview:\/\/1abc2def\/f:\/proj\/dist\/assets\/index-CU0vbFdO\.css"/
  );
  assert.ok(!out.includes('"./assets/'), 'relative asset URLs must not survive');
});

test('leaves external https URLs untouched', () => {
  const out = run();
  assert.ok(
    out.includes('https://fonts.googleapis.com/css2?family=Space+Mono&display=swap'),
    'Google Fonts stylesheet URL must not be rewritten'
  );
  assert.ok(out.includes('href="https://fonts.gstatic.com"'));
});

test('strips bare and valued crossorigin attributes', () => {
  const out = run(`${VITE_OUTPUT}\n<img src="./a.png" crossorigin="anonymous">`);
  assert.ok(!/crossorigin/i.test(out), 'all crossorigin hints must be removed');
  assert.match(out, /<script type="module" src=/);
});

test('injects base and CSP inside head', () => {
  const out = run();
  const head = out.slice(out.indexOf('<head>'), out.indexOf('</head>'));
  assert.ok(head.includes(`<base href="${DIST_BASE}/">`), '<base> must live in <head>');
  assert.ok(head.includes('Content-Security-Policy'));
  assert.ok(out.indexOf('<base') < out.indexOf('<script'), 'injected tags precede the bundle');
});

test('CSP allows bundled scripts, workers and inline styles from the webview origin', () => {
  const out = run();
  const csp = out.match(/Content-Security-Policy" content="([^"]+)"/)![1];
  const directives = new Map(
    csp.split(';').map((part) => {
      const [name, ...rest] = part.trim().split(/\s+/);
      return [name, rest];
    })
  );

  assert.deepEqual(directives.get('default-src'), ["'none'"]);
  assert.ok(directives.get('script-src')?.includes(CSP_SOURCE));
  assert.ok(directives.get('script-src')?.includes("'wasm-unsafe-eval'"));
  assert.ok(directives.get('worker-src')?.includes(CSP_SOURCE));
  assert.ok(directives.get('worker-src')?.includes('blob:'));
  assert.ok(directives.get('style-src')?.includes("'unsafe-inline'"));
  assert.ok(directives.get('style-src')?.includes('https://fonts.googleapis.com'));
  assert.ok(directives.get('font-src')?.includes('https://fonts.gstatic.com'));
  assert.ok(directives.get('connect-src')?.includes('data:'));
});

test('also handles root-absolute URLs and documents without head', () => {
  assert.ok(
    run('<html><head><script src="/assets/x.js"></script></head></html>').includes(
      `src="${DIST_BASE}/assets/x.js"`
    )
  );
  const headless = run('<div id="root"></div>');
  assert.ok(headless.startsWith('<base href='), 'fallback prepends head tags when absent');
});
