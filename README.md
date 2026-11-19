# Lumen PDF

A VS Code **Custom Editor** extension for reading and searching PDF documents, with SyncTeX-style
navigation and a Dark Paper reading mode.

The extension UI is a React + [pdf.js](https://mozilla.github.io/pdf.js/) front-end that runs inside
a VS Code webview. The same front-end can also be run standalone in a browser for fast development.

## Features

- Opens every `*.pdf` with the Lumen PDF editor (registered with `priority: default`).
- Full-text search with match case / whole word options and match stepping.
- Reading color modes including **Dark Paper**, cycled with the command
  `Lumen PDF: Cycle Reading Color Mode`.
- Sidebar with document outline, page thumbnails, bookmarks and annotations.
- Single page / continuous scroll / two-page spread layouts, zoom and fit controls.
- Page jumping driven by extension host messages (SyncTeX-style forward navigation).

## Requirements

- Node.js
- VS Code `^1.90.0`

## Setup

```bash
npm install
```

## Development

### Debug the extension inside VS Code

1. Open this folder in VS Code.
2. Press <kbd>F5</kbd> (configuration **Run Extension**). This starts the `watch: ext` and
   `watch: webview` tasks first, then launches an Extension Development Host with the extension
   loaded from this folder.
3. In the Development Host, open any `.pdf` file.

Reload the Development Host window (`Developer: Reload Window`) to pick up a fresh webview build.

### Debug the front-end in a browser

```bash
npm run dev
```

Then open `http://localhost:3000`. Outside the webview the app loads a built-in sample PDF, so no
host messages are required. The **Run Web (browser)** launch configuration attaches Chrome to this
server.

## Build

```bash
npm run build:all   # vite build -> dist/  +  esbuild -> out/extension.js
npm run lint        # type-check the webview and the extension host
npm test            # node:test unit tests for search + sample PDF generation
```

## Package and install a .vsix

```bash
npm run package                     # lint + build + vsce package
code --install-extension lumen-pdf-1.0.1.vsix
```

To publish to the Marketplace, set a real `publisher` in `package.json`, add a `repository` field,
then run `vsce publish`.

## Project layout

```
src/extension/extension.ts   extension host: custom editor provider, webview HTML + CSP
src/webview/                 React front-end rendered inside the webview
dist/                        webview build output, embedded in the extension
out/                         bundled extension host
index.html                   browser development entry point only
```

## Notes

- `dist/` must exist before launching the extension; the host throws a readable error if the
  webview assets are missing.
- The webview loads its assets from the extension's own `dist/` folder, so a `.vsix` is fully
  self-contained and works offline. Google Fonts are allow-listed in the CSP and fall back to
  system fonts when unreachable.
