# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 環境

- Node.js v22 で開発・検証済み（CI も node 22）
- パッケージマネージャは **pnpm 11**（`package.json` の `packageManager: pnpm@11.x` で固定、Node 22.5+ 必須）。npm / `package-lock.json` は使わない
- pnpm の設定（`allowBuilds` / `overrides`）は `pnpm-workspace.yaml` に置く
- 初回セットアップ: `corepack enable`（pnpm 未導入時）→ `pnpm install`

## アーキテクチャ

**Electron + React + Vite** によるデスクトップアプリ。反射スペクトル・時系列データの表示が目的。

### 主要ファイル

- `src/App.jsx` — Reactアプリ本体の単一の大きなコンポーネント（約2750行）。ファイル読み込みの振り分け・状態管理・UI描画を持つ。純粋関数や部品は下記モジュールに分けてある
- `src/constants.js` — `palette`（トレース色）と `PRESET_LABELS`
- `src/lib/normalization.js` — 規格化・スケーリングの純粋関数
- `src/lib/plotLayout.js` — `minorDtick` / `pickLegendPlacement`（凡例配置）/ `buildExportFigure`（エクスポート用フィギュア）
- `src/lib/fileLoaders.js` — 1 ファイル → トレース素データの変換（形式判定・OPUS の絞り込み・単位換算）
- `src/lib/textParsers.js` — テキスト形式のパーサ（`parseDPT` / `parseWhitespaceSeparated` / `isRelabTabFile` / `extractRelabMeta` / `parseRelabTab`）
- `src/components/icons.jsx` — `IconButton` と SVG アイコン
- `src/components/dialogs.jsx` — `ConfirmDialog` / `NoticeBanner` / 各種設定ダイアログ / `UpdateDialog` と `cleanIpcErrorMessage`
- `src/hooks/useEntryField.js` — `entries` からフィールド別の並列配列を派生（参照安定）
- `src/hooks/useUpdater.js` — アップデート関連のステート・起動 3 秒後の自動チェック・進捗/エラー購読・ダイアログ開閉
- `electron/main.cjs` — Electronメインプロセス。`package.json` が `"type": "module"` のため `.cjs` 拡張子でCommonJSを使用。`package.json` からバージョンを読み込んでウィンドウタイトルに反映。開発時は `http://localhost:5173`、本番時は `dist/index.html` を読み込む。IPCハンドラー・自動アップデート・CSP設定を含む。
- `electron/preload.cjs` — ContextBridgeで `window.electronAPI` を公開。`checkForUpdate` / `downloadAndApplyUpdate` / `openExternal` / `onDownloadProgress` / `onUpdateError` / `takePendingFiles` / `onOpenFiles` / `getPlatform` / `quitApp` を提供。
- `vite.config.js` — `base: './'` を設定することで、Electronが `file://` プロトコル経由でビルド成果物を読み込めるようにしている。
- `vitest.config.js` — `jsdom` 環境を使用。セットアップファイルは `src/__tests__/setup.js`。

### App.jsx の状態モデル

トレースは `entries` ステート 1 本で持つ（要素は `{ trace, file, visible, groupId }`）。**更新は必ず `setEntries` で 1 要素単位に行う**（以前の 4 本の並列配列を別々に更新する方式は、更新漏れで長さ・順序がずれる恐れがあったため廃止）。

読み出し側は `useEntryField(entries, key)`（`src/hooks/useEntryField.js`）で派生させた並列配列を使う。中身が変わらなければ前回と同じ配列参照を返すので、表示切替で `traces` の参照が変わって規格化を再計算する、といったことは起きない：

- `traces[]` — Plotlyトレースオブジェクト（`{x, y, type: 'scattergl', mode: 'lines', ...}`）
- `filesInfo[]` — 対応するファイル名
- `visibility[]` — トレースごとの表示/非表示フラグ
- `traceGroupIds[]` — 各トレースが属するグループID

並びはファイル名の降順（新規読み込み分を降順に並べて末尾へ追加）。色は `withTraceColor(entry, color)` で差し替える

`groups[]` でトレースのセットをまとめて表示切替できる。`activeGroupId` が新規ファイルの追加先グループを決定する。

規格化・スタック・UI ステート:
- `normalizationMode` — `'none' | 'wavelength' | 'max' | 'minmax'` + `normalizationMaxScope` (`'view' | 'all'`)
- `stackEnabled` / `stackGap` — 各トレースを `scaleToUnit()` で [0,1] にスケール後、`rank * (1 + gap)` オフセット
- `plotIsZoomed` — `plotly_relayout` を直接購読（react-plotly.js の onRelayout prop は稀に発火しない）
- `confirmState` — 再利用可能な確認ダイアログ。`onDismiss` を渡すと Cancel 時に代替アクション実行
- `notice` — NoticeBanner の状態。`{ type, message, id, actionLabel?, actionFn? }`、8 秒自動消去・Undo 対応
- `seenHeaders` — 選択/却下したヘッダー組を記憶し再問合せ抑制
- `groupColorCountersRef` — グループ別カラーサイクル counter（useEffect で空グループ分を自動削除）

アップデート関連のステート（`useUpdater` フック内）：
- `updateStatus` — `'idle'|'checking'|'available'|'downloading'|'downloaded'|'no-update'|'error'`
- `updateInfo` — `{ hasUpdate, currentVersion, latestVersion, releaseUrl, installKind }`（`installKind` は `'installer'|'portable'`）

### ファイルパース（`src/lib/fileLoaders.js` + `parseAndAddFiles`）

すべて `FileReader` によるクライアントサイド処理。形式ごとの変換は `src/lib/fileLoaders.js` の純粋関数（`loadFile` → `loadOpusBuffer` / `loadTextFile`）が担い、`{ items: [{ x, y, name, header, visible }], labels?, relabMeta? }` を返す。軸ラベル更新・RELAB メタ保存などの副作用は App の `parseAndAddFiles` が戻り値を見て行う（読み込み・解析で例外が出たファイルは空の結果＝「読めなかったファイル」として通知）。拡張子と内容でフォーマットを判定：

| 拡張子 | パーサー |
|--------|----------|
| `.csv` | PapaParse。先頭行が数値でなければヘッダーありと自動判定 |
| `.dpt` | カスタム `parseDPT()` — カンマ区切り、`#` コメント行をスキップ |
| `.tab` | RELAB PDS4 TAB — 先に対応する `.xml` を読み込んでメタデータを取得する必要あり。波長はnm→μmに自動変換 |
| `.xml` | RELABメタデータを `relabMeta` ステートに格納し、後続の `.tab` 読み込みに利用 |
| `.asc` | XRD ASCII — 空白区切り2列（2θ, Intensity） |
| `.txt` | 温度測定データ — 2行目の内容で自動判定。時間を0秒始まりに自動変換 |
| `.0` / `.0001` / `.opus` | Bruker OPUS バイナリ — `src/opusParser.js`（brukeropus を JS 移植）。マジックバイト `\n\n\xfe\xfe` で検証し、1 ファイル内の各スペクトル（AB/TR/R/SM/RF 等）を個別トレースとして展開。x 軸単位は DXU から判定し、WN→μm 自動変換 |
| その他 | 空白/タブ区切り2列のフォールバック |

単位変換：プリセットが `wavelength-reflectance` かつユニットダイアログでユーザーが "nm" を選択した場合、x値を1000で除算してμmに変換。OPUS は DXU 値（WN/MI/LGW）で単位が一意に決まるためダイアログをスキップ。

**色の割当は Promise.all 完了後、ファイル名昇順で実施**（各ファイルの読み込み時点では色未設定）。CSV ヘッダーに `wavenumber` が含まれる場合、確認ダイアログで `λ = 10000 / ν` 変換を提案。DPT は常に wavelength (μm) なので変換対象外。

### OPUS バイナリパーサ (`src/opusParser.js`)

brukeropus (Python, MIT) を JS 移植。`File.arrayBuffer()` → `parseOpusBuffer(ab)` で `{spectra: [{key, label, x, y, dxu, seriesIndex?, srt?, timeRelative?, ...}]}` を返す。

- **WN/MI 二重保存**: OPUS は同一スペクトルを波数 (cm⁻¹) と波長 (μm) で別ブロックに格納する仕様あり。同一 type のデータが複数候補にマッチするため、`pairDataAndStatus` で `npt == data_count` の組を Phase 1 で確定、残りを Phase 2 で greedy 解決。App.jsx は wavelength-reflectance プリセット時に MI を優先 dedup
- **Series (3D) ブロック** (`type[5]==2`): 1 ブロック内に N 個のスペクトル + STRUCT_3D_INFO (`srt`/`ert` 時刻あり、**位置情報なし**)。各 sub-spectrum を別 trace として展開 (`seriesIndex` 付与)、ラベルは `[label #N]` 表記（手動 Hyperion 測定では位置が記録されないため時刻ではなく順序番号採用）
- **Compact ブロック** (`type[5]==4`): メタデータ先頭 + 末尾 npt 個が実データ。`raw.length - npt` を offset として読む
- **較正済 vs 未較正**: ratioed (key='r','a','t' 等) は較正済、`key.endsWith('sm'|'rf')` は raw 単一チャンネル。Series ファイルでは raw をデフォルト非表示 (`newVisibility=false`)
- **拡張子検出**: OPUS は数字拡張子 (`.0`, `.0001`) または `.opus`。`/^\d+$/.test(ext)` で分岐、マジックバイト `\n\n\xfe\xfe` で再検証
- **DPT 検証**: 純正 OPUS の DPT エクスポートと点単位比較で max |Δy| ~5×10⁻¹¹ (Float32 精度) を達成すれば移植正しい

### Windows 配布と自動アップデート

Windows の正規配布は **NSIS インストーラ版**（`Reflectance-Spectra-Viewer-vX.Y.Z_win_setup.exe`）。`package.json` の `build.win.target` は `dir` + `nsis`、`build.nsis` は per-user（`perMachine: false`）・インストール先変更可・ショートカット選択ページ付き（`build/installer.nsh`）。リリースには互換用に従来の portable ZIP（`*_win.zip`）も添付している。

更新は `window.electronAPI`（`preload.cjs` 経由）から行い、Webブラウザ環境では非表示。`check-update` / `download-apply-update` の挙動は実行形態で分かれる（判定は `isInstallerBuild()` = exe と同じフォルダに `Uninstall Reflectance Spectra Viewer.exe` があるか）:

| 形態 | 更新確認 | 適用 |
|---|---|---|
| インストーラ版 | `electron-updater` の `checkForUpdates()`（リリースの `latest.yml`） | `downloadUpdate()` → `quitAndInstall(true, true)` でサイレント更新・再起動 |
| portable 版（旧 ZIP） | GitHub API（`RELEASES_URL`） | `*_win_setup.exe` を TEMP に落として起動し、自分は終了＝**インストーラ版へ移行**。`installer.nsh` が `%LOCALAPPDATA%\ReflectanceSpectraViewer` の旧コピーを削除。残ったインストーラは次回起動時に `cleanupDownloadedInstallers()` が片付ける |
| macOS | GitHub API | `*_mac.dmg` を Downloads に落として Finder で開くまで（未署名のため Squirrel.Mac は使えない。置き換えは利用者が行う） |

> **electron-updater の設定**: `autoDownload` / `autoInstallOnAppQuit` は false（更新ボタンを押してから落とす）、差分ダウンロードと Web インストーラは無効。未署名だが `publisherName` 未設定なので署名検証はスキップされる。`quitAndInstall` は失敗しても例外を投げないので、`autoUpdater.on('error')` で renderer に `update-error` を送って UI が「ダウンロード中」で固まらないようにしている。

> **リリース成果物の整合性**: `release.yml` は `latest.yml` が生成されていること、その `url` がビルドした `*_win_setup.exe` 名と一致することを検査する。ずれると electron-updater の更新が 404 になる。インストーラのファイル名（`build.nsis.artifactName`）を変えるときは `cleanupDownloadedInstallers()` と portable 版のアセット検索（`_win_setup.exe` で終わる名前）も合わせる。

> **インストール場所**: 既定は per-user の `%LOCALAPPDATA%\Programs\Reflectance Spectra Viewer\`（管理者権限不要）。インストーラは旧 portable 版の配置先 `%LOCALAPPDATA%\ReflectanceSpectraViewer\` を、インストール先が別のときだけ削除する。

> **userData / ログのパス**: Electron の userData は `%APPDATA%\reflectance-spectra-viewer\`（小文字ハイフン、`package.json` の `name` に由来）。更新の診断ログは同フォルダの `updater.log`（GUI プロセスの console は捨てられるので、「更新を押しても何も起きない」はまずここを見る）。完全リセット時はインストール先のアンインストールに加えて userData も削除する。

> **旧 portable 版（v2.5.0 未満）**: 旧 updater スクリプトにバグがあり（子プロセスのファイルロック / スペース入りパスでの無音コピー失敗）、GUI の更新ボタンからは上げられない。インストーラを手動で実行してもらう。

### main.cjs のモジュールレベル定数

- `currentVersion` — 起動時に `package.json` から1回だけ読み込み。IPC ハンドラや `createWindow` で共有
- `cachedRelease` — portable 版 / macOS の `check-update` で取得したGitHub Release情報をキャッシュし、`download-apply-update` で再利用（インストーラ版は electron-updater が自前で持つ）
- `RELEASES_URL` / `httpOptions(url)` — GitHub API URL定数とHTTPリクエストオプション共通ヘルパー

### CI/CD

リリース手順：`vX.Y.Z` タグを作成してpushするだけ。タグのバージョンがビルド時に `package.json` へ注入される。

- **ローカル `pnpm run electron:build:win` はタグ注入を経ない**ため package.json の version（コミット上 `2.3.1` 固定）がそのまま EXE ラベルになる。正しい版の配布物は必ずタグ push → `release.yml` で生成する（手元の検証 EXE はラベルが古くても中身は最新）

### Claude Code スキル

- `/release <version>` — README更新 → タグ作成 → push。mainブランチ上でのみ使用。**注意**: スキルは README を main へ直接コミットする手順だが本リポジトリは main 直接禁止 → `docs/readme-vX.Y.Z` ブランチで PR 作成 → マージしてからタグ push する
- `release-testing` — リリース前の検証項目（Playwright 検証パターン・目視必須項目・CI 担保範囲）
- `dependency-maintenance` — Dependabot / OSV-Scanner 運用、install スクリプト（pnpm `allowBuilds`）の扱い

### テスト

Vitest + jsdom を使用。`src/__tests__/setup.js` で以下をモック：

- `react-plotly.js`（Canvas/WebGLエラー回避のため、プレーンな `<div>` をレンダリング）
- `HTMLCanvasElement.getContext`
- `URL.createObjectURL`

Plotly モックは描画に渡された最新の `{ data, layout }` を `globalThis.__plotProps` に残すので、結合テスト（`fileLoading.test.jsx`）はそこからトレースの中身・並び・`visible` を検証する。内部配列の並びはファイル名の**降順**、色はファイル名の昇順に割り当てる点に注意

**バイナリパーサのテスト** (`opusParser.test.js`): 実 OPUS ファイル fixture は使わず、`buildOpusFile([{type, bytes}])` ヘルパーで `DataView` 経由の合成バイト列を構築する。`buildParamBlock` / `buildDataBlock` / `buildSeriesBlock` で各種ブロックを最小構成で生成し、エッジケース（WN/MI 重複、Compact、Series）を網羅。実機検証は `scripts/verify-opus.mjs` / `compare-dpt.mjs` で別途行う（コミット対象外の調査用スクリプト）

### UX 規約

- UI 表示は英語。コードコメントは日本語（上位 CLAUDE.md の指示に従う）
- "Unload" は viewer から外すだけ。ローカルファイルは削除しないため `Delete`/`Remove` に言い換えない
- 破壊的アクション（Unload / Close Group）は `ConfirmDialog` + `danger-btn`（赤）
- ダイアログボタン順は `Cancel | Apply`（Cancel 左、実行系が右下）
- 非ブロッキング通知は `NoticeBanner`、ブロッキングは `ConfirmDialog`
- 凡例パネルの行ラベルは `trace.name`（OPUS 複数 spectrum は `[Reflectance #1]` 等のサフィックス付き）を表示。`filesInfo` は failedNames 検出・ファイル単位グルーピング用
- 同一ファイル名の trace が複数あるとき凡例は階層表示（親 = file 名 + 件数バッジ + ▶/▼、子はインデント）。`expandedFiles: Set<string>` で展開状態管理、親チェックボックスは indeterminate 対応、親 × は `unloadIndices` で一括 unload

### 落とし穴

- ファイル input の同じファイル再選択で `onChange` が発火しない。`onClick={e => e.target.value = ''}` で毎回 reset
- カラーピッカー（`<input type="color">` の `click()`）などユーザー操作が必要な API は、イベントハンドラの中で直接呼ぶ。`setState` の更新関数の中で呼ぶと、React が描画時まで実行を遅らせたときに "A user gesture is required" で開かない（jsdom では再現しないのでテストでは捕まらない）
- `electron/main.cjs` の変更は HMR 対象外。反映に `taskkill //F //IM electron.exe` → `pnpm run dev` 再実行
- Plotly のグラフ div は `getPlotEl()` = `plotRef.current?.el ?? plotRef.current` で取得（**react-plotly.js v4 で ref がグラフ div を直接指す**ようになった。v2 は instance.el。直アクセスすると crosshair/座標表示/ズーム検知が全滅）。ズーム状態は onRelayout prop だと漏れるので `getPlotEl().on('plotly_relayout')` で直接購読
- Playwright MCP のファイルアップロードは `.playwright-mcp/fixtures/` 配下に置く（プロジェクトルート内必須）
- Vite v8 (Rolldown) は CJS の `__esModule: true` を unwrap せず `import X from 'cjs-pkg'` が `{ default: fn, __esModule: true }` を返すことがある → `X?.default ?? X` で吸収（App.jsx の Plot / Plotly import が該当）。症状は React の "Element type is invalid: ... got: object"
- 大型依存更新（plotly / vite / electron のメジャー bump）後に optimizer 由来の interop 不具合が出たら `rm -rf node_modules/.vite` でキャッシュをクリアしてから `pnpm run dev`
