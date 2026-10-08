---
name: release-testing
description: リリース前の検証項目一覧。自動テスト・Playwright MCP で検証できる項目とその方法、目視必須の項目、CI が担保する範囲を示す。リリース前の動作確認、Playwright での UI 検証、Electron 実機確認を行うときに使う。
---

# リリース前テスト項目

## テスト層

- **自動 (CI/ローカル)**: `pnpm run lint`（Biome）、`pnpm run test:run`（unit + integration、現在 10 ファイル / 147 件）、`pnpm run build`
- **Playwright MCP**: `pnpm run dev`（Electron も立ち上がる。ブラウザだけなら `pnpm exec vite`）→ `http://localhost:5173` に対し `mcp__playwright__*` で UI 操作 → DOM/Plotly 状態を検証
- **Electron 実機**: `pnpm run electron:build:win` で生成した NSIS インストーラ（`dist-electron/*_win_setup.exe`）で最終確認。ローカルビルドはタグの版が注入されないので、EXE の版ラベルは `package.json` の `2.3.1` のまま

## Playwright で検証できる項目（検証パターン例あり）

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

## Playwright 運用メモ

- ファイルアップロードは `.playwright-mcp/fixtures/` 配下の fixture を使う
- Plotly 内部状態は `document.querySelector('.js-plotly-plot').data` / `._fullLayout` で読める
- `Plotly.relayout()` はプログラマティック実行では `onRelayout` prop が発火しないことがあるので、直接購読した state (`plotIsZoomed`) を使うべき

## 目視必須（Playwright 困難）

- プロットの視覚的妥当性（線の形・色分布）
- Plotly のマウスホイールズーム、ドラッグ選択ズームの滑らかさ
- カラーピッカーダイアログ（OS ネイティブ）
- インストーラ版 Electron ウィンドウ挙動（メニューバー非表示、タイトル、electron-updater による自動アップデート）。CI はインストーラの実行・更新までは確かめない
- 範囲選択ズーム直後の Auto-fit Y / Reset Zoom ボタンの enable 切替視覚フィードバック

## CI が自動担保

いずれも `pnpm/action-setup` + `pnpm install --frozen-lockfile`（node 22）。

- `.github/workflows/ci.yml`: push（main, `v*`）/ PR で lint + test:run + build、Windows の Electron ビルド
- `.github/workflows/release.yml`: タグ push で Windows（NSIS インストーラ + portable ZIP、`latest.yml` の url とインストーラ名の一致を検査）/ macOS（universal DMG）/ Web をビルドして Release に添付し、最後に必要なアセットが揃っているか検査
- `.github/workflows/pr-build-check.yml`: PR で Windows ビルドと macOS universal .app のビルド検証（`src/` / `electron/` / `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` / `vite.config.js` の変更時）
- `.github/workflows/verify-artifacts.yml`: release 完了後、portable ZIP の EXE と DMG の .app（Apple Silicon / Intel）が起動するか
- `.github/workflows/osv-scanner-scheduled.yml`: 毎日 + main への push で依存の脆弱性スキャン（PR では走らない）
