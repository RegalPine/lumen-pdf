# Changelog

All notable changes to this extension are documented in this file.

## [1.0.1]

### 优化

- 界面文字调整为 12–13px 系统字体，提高文字对比度，改善小字发虚的观感。
- 移除外部字体加载，优化侧栏标签和页码输入框的排布。
- 保留 PDF 原始字体和渲染参数。

## [1.0.0]

### Added

- Custom editor for `*.pdf` files registered as the default handler (`Lumen PDF`).
- Full-text search inside PDFs with match case / whole word options and match stepping.
- Reading color modes, including Dark Paper, cycled via the `Lumen PDF: Cycle Reading Color Mode` command.
- Outline, thumbnail and bookmark sidebar, plus annotation storage per document.
- Single page / continuous scroll / two-page spread layouts, zoom and fit controls.
- SyncTeX-style page jumping driven by extension host messages.
- Standalone browser mode (`npm run dev`) for development alongside the VS Code webview.

### Changed

- Repackaged the project as a single VS Code extension: the webview front-end now builds
  into `dist/` inside the extension folder so it is bundled correctly into `.vsix`.
- Extension host is bundled with esbuild into `out/extension.js` instead of `tsc` output.
