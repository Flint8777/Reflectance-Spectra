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

- `src/App.jsx` — Reactアプリ全体が単一の大きなコンポーネント（約1220行）。パース処理・状態管理・UI描画がすべてここに集約されている。
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

規格化・スタック・UI ステート:
- `normalizationMode` — `'none' | 'wavelength' | 'max' | 'minmax'` + `normalizationMaxScope` (`'view' | 'all'`)
- `stackEnabled` / `stackGap` — 各トレースを `scaleToUnit()` で [0,1] にスケール後、`rank * (1 + gap)` オフセット
- `plotIsZoomed` — `plotly_relayout` を直接購読（react-plotly.js の onRelayout prop は稀に発火しない）
- `confirmState` — 再利用可能な確認ダイアログ。`onDismiss` を渡すと Cancel 時に代替アクション実行
- `notice` — NoticeBanner の状態。`{ type, message, id, actionLabel?, actionFn? }`、8 秒自動消去・Undo 対応
- `seenHeaders` — 選択/却下したヘッダー組を記憶し再問合せ抑制
- `groupColorCountersRef` — グループ別カラーサイクル counter（useEffect で空グループ分を自動削除）

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

**色の割当は Promise.all 完了後、ファイル名昇順で実施**（`addTrace` 内では色未設定）。CSV ヘッダーに `wavenumber` が含まれる場合、確認ダイアログで `λ = 10000 / ν` 変換を提案。DPT は常に wavelength (μm) なので変換対象外。

### App.jsx の共通ヘルパー

- `PRESET_LABELS` — プリセット名→軸ラベルのマップ定数。新しいプリセット追加時はここに定義する
- `addTrace(x, y, file, header)` — `parseAndAddFiles` 内のヘルパー。トレース作成・カラー割り当て・グループ追加を一括処理
- `classifyAndAddFiles(files)` — ファイル入力/ドロップ共通。wavelength-reflectanceプリセット時にnm/μm単位選択ダイアログを出すかの分岐を担当
- `parseWhitespaceSeparated(text)` — `.asc` とフォールバックパーサーの共通実装
- エクスポート済み規格化ヘルパー（テスト対象）: `findYatX` / `normalizeByMax` / `normalizeByMaxInRange` / `scaleToUnit` / `scaleToUnitInRange` / `normalizeAtX`。`src/__tests__/normalization.test.js` 参照

### Plotly統合

`react-plotly.js` + `scattergl`（WebGL）で高速描画。ズーム状態は `xRange`/`yRange` ステートで管理。

### プリセットダイアログ

初回起動時にプリセット選択ダイアログが表示される（`showPresetDialog: true`）。`wavelength-reflectance` / `xrd` / `temperature` / `auto` の4種。

### 自動アップデート

`window.electronAPI`（`preload.cjs` 経由）でGitHub Releasesと通信し、Windows portable ZIPのダウンロード・展開・再起動を行う。Webブラウザ環境では非表示。

> **注意**: アップデートスクリプトでは `Wait-Process -Id <pid>` 後に `taskkill /F /IM "*.exe" /T` を実行する。ElectronはGPU・レンダラー等の子プロセスを起動するため、メインPIDの終了待機だけではファイルロックが残り上書きコピーが失敗する。

> **インストール場所**: このアプリはportable版のため `C:\Program Files\` への配置は不可（書き込み権限なしでアップデートが失敗する）。正しい配置先は `C:\Users\<user>\AppData\Local\ReflectanceSpectraViewer\`。

> **userData のパス**: Electron の userData は `%APPDATA%\reflectance-spectra-viewer\`（小文字ハイフン、`package.json` の `name` に由来）。インストール先 `ReflectanceSpectraViewer` と命名が異なるので、完全リセット時は両方を削除する必要がある。

> **自動更新の下限バージョン**: v2.5.0 未満のアプリは updater スクリプト自体にバグがあり（子プロセスロック / スペース入りパスでの無音コピー失敗）、GUI の更新ボタンからは v2.5.0+ へ上げられない。旧版ユーザーには ZIP を手動展開して v2.5.0+ を導入してもらう必要がある。

> **アップデートスクリプトのデバッグ**: コピー失敗は無音で起きやすい。`Copy-Item -Path "$src\*"` はスペース含むパスで不安定なため `Get-ChildItem -LiteralPath $src | Copy-Item` を使うこと（v2.5.0で修正済み）。

### main.cjs のモジュールレベル定数

- `currentVersion` — 起動時に `package.json` から1回だけ読み込み。IPC ハンドラや `createWindow` で共有
- `cachedRelease` — `check-update` で取得したGitHub Release情報をキャッシュし、`download-apply-update` で再利用
- `RELEASES_URL` / `httpOptions(url)` — GitHub API URL定数とHTTPリクエストオプション共通ヘルパー

### CI/CD

`.github/workflows/` に4つのワークフローがある：`ci.yml`（テスト+ビルド）、`release.yml`（リリースビルド＋リリースノート自動生成）、`pr-build-check.yml`（PRビルド検証）、`verify-artifacts.yml`（成果物検証）。

リリース手順：`vX.Y.Z` タグを作成してpushするだけ。タグのバージョンがビルド時に `package.json` へ注入される。

### Claude Code スキル

- `/release <version>` — README更新 → タグ作成 → push。mainブランチ上でのみ使用
- `/parse-test <ext>` — 新しいファイルパーサーのテストをTDDで生成

### テスト

Vitest + jsdom を使用。`src/__tests__/setup.js` で以下をモック：

- `react-plotly.js`（Canvas/WebGLエラー回避のため、プレーンな `<div>` をレンダリング）
- `HTMLCanvasElement.getContext`
- `URL.createObjectURL`

### UX 規約

- UI 表示は英語。コードコメントは日本語（上位 CLAUDE.md の指示に従う）
- "Unload" は viewer から外すだけ。ローカルファイルは削除しないため `Delete`/`Remove` に言い換えない
- 破壊的アクション（Unload / Close Group）は `ConfirmDialog` + `danger-btn`（赤）
- ダイアログボタン順は `Cancel | Apply`（Cancel 左、実行系が右下）
- 非ブロッキング通知は `NoticeBanner`、ブロッキングは `ConfirmDialog`

### 落とし穴

- ファイル input の同じファイル再選択で `onChange` が発火しない。`onClick={e => e.target.value = ''}` で毎回 reset
- `electron/main.cjs` の変更は HMR 対象外。反映に `taskkill //F //IM electron.exe` → `npm run dev` 再実行
- Plotly のズーム状態は `react-plotly.js` の onRelayout だけだと漏れる。`plotRef.current?.el.on('plotly_relayout')` で直接購読
- Playwright MCP のファイルアップロードは `.playwright-mcp/fixtures/` 配下に置く（プロジェクトルート内必須）

### リリース前テスト項目

**テスト層**:
- **自動 (CI/ローカル)**: `npm run test:run`（unit + integration、現在 31 件）、`npm run build`
- **Playwright MCP**: `npm run dev` → `http://localhost:5173` に対し `mcp__playwright__*` で UI 操作 → DOM/Plotly 状態を検証
- **Electron 実機**: `npm run electron:build:win` で生成したパッケージで最終確認

**Playwright で検証できる項目**（検証パターン例あり）:
| 項目 | 検証方法 |
|---|---|
| 初期フロー | Preset 選択 → file_upload → 単位ダイアログ Apply → `plot.data.length` 確認 |
| 規格化 (wavelength/max/minmax) | 値比較 + `plot._fullLayout.yaxis.range` / `xaxis.range` 検査 |
| Reset Zoom 遷移 | `Plotly.relayout(plot, {...})` 後に `button.disabled` が false |
| スタック | トグル後 `yaxis.showticklabels === false` / slider 変更で data.y が即時更新 |
| NoticeBanner | 範囲外波長で規格化 → `.notice-warning` の存在、Wavenumber CSV で `.confirm-dialog` 表示 |
| Undo トースト | Unload → `.notice-action` が出る → クリックで trace 復元 |
| ヘッダー抑制 | 同一ヘッダー CSV を 2 回読み込み → 2 回目は `HeaderSelectDialog` 出ない |
| 同一ファイル再 upload | Unload All → 同じファイル再 upload で `plot.data.length > 0` |
| グループ操作 | 右クリックで context menu、外部クリックで閉じる |
| 凡例 D&D 並び替え | `DataTransfer` を使った drag event シミュレーション |
| 座標表示単位 | mouseover 後の DOM テキストが ` μm` を含む |

**Playwright 運用メモ**:
- ファイルアップロードは `.playwright-mcp/fixtures/` 配下の fixture を使う
- Plotly 内部状態は `document.querySelector('.js-plotly-plot').data` / `._fullLayout` で読める
- `Plotly.relayout()` はプログラマティック実行では `onRelayout` prop が発火しないことがあるので、直接購読した state (`plotIsZoomed`) を使うべき

**目視必須（Playwright 困難）**:
- プロットの視覚的妥当性（線の形・色分布）
- Plotly のマウスホイールズーム、ドラッグ選択ズームの滑らかさ
- カラーピッカーダイアログ（OS ネイティブ）
- インストーラ版 Electron ウィンドウ挙動（メニューバー非表示、タイトル、自動アップデート）
- 範囲選択ズーム直後の Auto-fit Y / Reset Zoom ボタンの enable 切替視覚フィードバック

**CI が自動担保**:
- `.github/workflows/ci.yml`: push/PR で test:run + build
- `.github/workflows/release.yml`: タグ push で electron:build:win/mac
- `.github/workflows/pr-build-check.yml`: PR のビルド検証
- `.github/workflows/verify-artifacts.yml`: 成果物検証
