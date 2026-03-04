# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

- `src/App.jsx` — Reactアプリ全体が単一の大きなコンポーネント（1500行超）。パース処理・状態管理・UI描画がすべてここに集約されている。
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

- `react-plotly.js` を使用し、`type: 'scattergl'`（WebGL）で高速描画。
- クロスヘア追跡は `onHover` イベント + `requestAnimationFrame`。
- ズーム状態を `xRange`/`yRange` に保持し、Plotlyの `layout` に渡す。
- `plotRef` でPlotly DOMノードを参照し、プログラムからのズームリセットに使用。

### プリセットダイアログ

初回起動時にプリセット選択ダイアログが表示される（`showPresetDialog: true`）：

- `wavelength-reflectance` — 軸を "Wavelength (μm)" / "Reflectance" に設定
- `xrd` — 軸を "2θ (°)" / "Intensity" に設定
- `temperature` — 軸を "Time (s)" / "Temperature (°C)" に設定
- `auto` — ファイル内容から自動判定

### 自動アップデート

`window.electronAPI`（`preload.cjs` 経由）でGitHub Releasesと通信：

1. 起動時に `check-update` IPCで最新リリースを確認
2. 新バージョンがあれば通知バッジを表示
3. ユーザーが「アップデート」を選択すると Windows portable ZIPをダウンロード
4. PowerShell スクリプトを生成・実行してZIPを展開し、アプリを再起動

Webブラウザ環境（`window.electronAPI` が未定義）では自動アップデートUIは非表示。

### CI/CD

- **CI**: `.github/workflows/ci.yml` が `main` / `v2.3.0` へのpush・PRでユニットテスト + Viteビルド + Electronビルド（Windows）を実行。
- **リリースビルド**: `v*` 形式のタグをpushすると `.github/workflows/release.yml` が起動し、Windows portable ZIP・macOS DMG/ZIP・Web distをビルドしてGitHub Releaseにアセットとして添付。タグのバージョンがビルド時に `package.json` へ注入される。
- **PRビルドチェック**: `.github/workflows/pr-build-check.yml` が `main` へのPR時（`src/`・`electron/`・`package.json`・`vite.config.js` 変更時）に Windows・macOS 両環境で `npm run build` を実行しPRにコメント。
- **ドラフトリリース**: `.github/workflows/draft-release.yml` がタグpush時に変更履歴を自動収集してドラフトリリースを作成。
- **成果物検証**: `.github/workflows/verify-artifacts.yml` がリリースビルド完了後にWindows・macOS（x64/arm64）で起動テストを実施。

リリース手順：`vX.Y.Z` タグを作成してpushするだけ。以降はCIが自動処理する。

### テスト

Vitest + jsdom を使用。`src/__tests__/setup.js` で以下をモック：

- `react-plotly.js`（Canvas/WebGLエラー回避のため、プレーンな `<div>` をレンダリング）
- `HTMLCanvasElement.getContext`
- `URL.createObjectURL`
