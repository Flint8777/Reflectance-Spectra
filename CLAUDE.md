# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 環境

- Node.js v22 で開発・検証済み
- 初回セットアップ: `npm install`

## コマンド

```bash
# 開発（Vite devサーバー + Electron 同時起動）
npm run dev

# Vite devサーバーのみ（ブラウザ確認用）
npx vite

# Viteビルドのみ
npm run build

# ビルド＋配布パッケージ作成
npm run electron:build:win   # Windows portable
npm run electron:build:mac   # macOS DMG + ZIP
npm run electron:build:all   # 両プラットフォーム

# Windows portable ZIPの作成（ビルド後に実行）
npm run pack:zip

# テスト（ウォッチモード）
npm test

# テスト（1回実行）
npm run test:run

# 特定のテストファイルのみ実行
npx vitest run src/__tests__/App.test.jsx
```

## アーキテクチャ

**Electron + React + Vite** によるデスクトップアプリ。反射スペクトル・時系列データの表示が目的。

### 主要ファイル

- `src/App.jsx` — Reactアプリ全体が単一の大きなコンポーネント（約1250行）。パース処理・状態管理・UI描画がすべてここに集約されている。
- `electron/main.cjs` — Electronメインプロセス。`package.json` が `"type": "module"` のため `.cjs` 拡張子でCommonJSを使用。`package.json` からバージョンを読み込んでウィンドウタイトルに反映。開発時は `http://localhost:5173`、本番時は `dist/index.html` を読み込む。IPCハンドラー・自動アップデート・CSP設定を含む。
- `electron/preload.cjs` — ContextBridgeで `window.electronAPI` を公開。`checkForUpdate` / `downloadAndApplyUpdate` / `openExternal` / `onDownloadProgress` / `getPlatform` を提供。
- `vite.config.js` — `base: './'` を設定することで、Electronが `file://` プロトコル経由でビルド成果物を読み込めるようにしている。
- `vitest.config.js` — `jsdom` 環境を使用。セットアップファイルは `src/__tests__/setup.js`。

### App.jsx の状態モデル

インデックスで対応付けられた並列配列で管理：

- `traces[]` — Plotlyトレースオブジェクト（`{x, y, type: 'scattergl', mode: 'lines', ...}`）
- `filesInfo[]` — 対応するファイル名
- `visibility[]` — トレースごとの表示/非表示フラグ
- `traceGroupIds[]` — 各トレースが属するグループID

`groups[]` でトレースのセットをまとめて表示切替できる。`activeGroupId` が新規ファイルの追加先グループを決定する。

アップデート関連のステート：
- `updateStatus` — `'idle'|'checking'|'available'|'downloading'|'no-update'|'error'`
- `updateInfo` — `{ hasUpdate, currentVersion, latestVersion, releaseUrl }`

### ファイルパース（`parseAndAddFiles`）

すべて `FileReader` によるクライアントサイド処理。拡張子と内容でフォーマットを判定：

| 拡張子 | パーサー |
|--------|----------|
| `.csv` | PapaParse。先頭行が数値でなければヘッダーありと自動判定 |
| `.dpt` | カスタム `parseDPT()` — カンマ区切り、`#` コメント行をスキップ |
| `.tab` | RELAB PDS4 TAB — 先に対応する `.xml` を読み込んでメタデータを取得する必要あり。波長はnm→μmに自動変換 |
| `.xml` | RELABメタデータを `relabMeta` ステートに格納し、後続の `.tab` 読み込みに利用 |
| `.asc` | XRD ASCII — 空白区切り2列（2θ, Intensity） |
| `.txt` | 温度測定データ — 2行目の内容で自動判定。時間を0秒始まりに自動変換 |
| その他 | 空白/タブ区切り2列のフォールバック |

単位変換：プリセットが `wavelength-reflectance` かつユニットダイアログでユーザーが "nm" を選択した場合、x値を1000で除算してμmに変換。

### Plotly統合

`react-plotly.js` + `scattergl`（WebGL）で高速描画。ズーム状態は `xRange`/`yRange` ステートで管理。

### プリセットダイアログ

初回起動時にプリセット選択ダイアログが表示される（`showPresetDialog: true`）。`wavelength-reflectance` / `xrd` / `temperature` / `auto` の4種。

### 自動アップデート

`window.electronAPI`（`preload.cjs` 経由）でGitHub Releasesと通信し、Windows portable ZIPのダウンロード・展開・再起動を行う。Webブラウザ環境では非表示。

### CI/CD

`.github/workflows/` に5つのワークフローがある：`ci.yml`（テスト+ビルド）、`release.yml`（リリースビルド）、`pr-build-check.yml`（PRビルド検証）、`draft-release.yml`（ドラフトリリース作成）、`verify-artifacts.yml`（成果物検証）。

リリース手順：`vX.Y.Z` タグを作成してpushするだけ。タグのバージョンがビルド時に `package.json` へ注入される。

### テスト

Vitest + jsdom を使用。`src/__tests__/setup.js` で以下をモック：

- `react-plotly.js`（Canvas/WebGLエラー回避のため、プレーンな `<div>` をレンダリング）
- `HTMLCanvasElement.getContext`
- `URL.createObjectURL`
