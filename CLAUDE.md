# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language policy

- Chat responses: Japanese
- Content written to files (`.md`, comments, etc.): English
- Exception: `README.md` body text should be written in Japanese

## Commands

All development commands run from the `Release/` directory:

```bash
cd Release
npm install                    # Install dependencies

npm run electron:dev           # Dev mode: Vite + Electron (hot reload)
npm run dev                    # Vite dev server only (browser preview)

npm run electron:build:win     # Build Windows portable EXE
npm run electron:build:mac     # Build macOS DMG + ZIP
npm run pack:zip               # Create Windows portable ZIP (after win build)
```

## Architecture

```
Release/          # Main Electron app (active development)
  src/App.jsx     # Single-component React app — all UI state and logic lives here
  src/main.jsx    # React entry point
  electron/main.cjs  # Electron main process (CommonJS)
  vite.config.js  # base: './' required for Electron file:// loading

Prototype/        # Legacy Python/PyQt5 version (v1.x) — see ver-1.1.0 branch
```

### Key design points

- **`App.jsx` is intentionally a single large component** — no sub-components. All state (`traces`, `visibility`, `xRange`, `yRange`, `cross`) is co-located.
- **Plotly's built-in legend is disabled** (`showlegend: false`). A custom left-panel legend handles visibility toggles and per-trace color pickers (HTML5 `<input type="color">`).
- **File parsing**: CSV files use PapaParse; all other extensions (e.g. `.dpt`) use the custom `parseDPT()` text parser (splits on whitespace/comma/semicolon/tab).
- **Crosshair**: A CSS overlay (`crosshair-overlay`) draws the crosshair lines; mouse events are throttled via `requestAnimationFrame`. Coordinate conversion uses Plotly's internal `p2l()` axis method.
- **Electron dev detection**: `isDev = !app.isPackaged` — DevTools and menu bar are enabled only in dev mode.

### CI / Release

- Pushing a `v*` tag triggers `.github/workflows/release.yml`, which builds Windows (portable ZIP) and macOS (DMG + ZIP for x64 and arm64) and publishes them to GitHub Releases.
- `workflow_dispatch` triggers a manual build and uploads artifacts instead.
- The workflow injects the tag version into `package.json` at build time via `jq`, so local `package.json` version does not need to be updated manually before tagging.
- CI uses `npm ci` (not `npm install`) to ensure deterministic installs from `package-lock.json`.

### Known pitfalls

- **`??` と三項演算子の優先度**: `a ?? b === c ? x : y` は `(a ?? b) === c ? x : y` と解釈される。`onRelayout` など条件式が複合する箇所では必ず括弧をつける。
- **ファイル読み込みのPromise**: `handleFiles` 内のPromiseは `resolve` だけで `reject` がない設計。FileReaderやPapaParseのエラーコールバックで必ず `resolve()` を呼ぶこと（呼ばないと `Promise.all` が永遠に待ち続ける）。
- **アイコンファイル未同梱**: `Release/electron/icons/` に `icon.png` / `icon.ico` が存在しないため、ビルドするとデフォルトのElectronアイコンになる。`icons/README.md` に作成手順あり。
- **`web-viewer/` は過去の名称**: 旧ディレクトリ名。現在は `Release/` に改名済み。混同しないこと。
