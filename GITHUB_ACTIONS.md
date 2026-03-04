# GitHub Actions ガイド

このリポジトリで設定されている GitHub Actions の目的・挙動・使い方をまとめたガイドです。

- ワークフロー定義: `.github/workflows/*.yml`

---

## CI（ユニットテスト＋ビルド検証）

ブランチへの push と main への PR 時に、テストとビルドが通ることを自動検証します。

- ファイル: `.github/workflows/ci.yml`
- 目的: 常時ビルド可能な状態を維持し、テスト破壊を早期検出
- トリガー:
  - push: `main`, `v2.3.0` ブランチ
  - PR: `main` ブランチへのPR作成・更新
- 権限: デフォルト（read）

### 動作概要

| ジョブ | ランナー | 内容 |
|--------|---------|------|
| `build-web` | ubuntu-latest | `npm run test:run` → `npm run build`（Vite） |
| `build-electron-windows` | windows-latest | `npm run electron:build:win` |

- 成果物（Vite dist / Electron Windows ZIP）をアーティファクトとしてアップロード
- タグ push では動作しない（リリースビルドは `release.yml` が担当）

---

## Release builds（Windows & macOS）

Electron アプリを Windows 向け portable ZIP、macOS 向け DMG/ZIP としてビルドし、タグ付き push 時に GitHub Release のアセットとして公開します。

- ファイル: `.github/workflows/release.yml`
- 目的: Windows/macOS の配布ビルド作成とリリース添付
- トリガー: タグ push `v*`（例: `v2.3.0`）
- 権限: `contents: write`
- シークレット: 既定の `GITHUB_TOKEN`（追加の秘密情報は不要）

### ビルド概要

- Node.js v20 を使用
- **バージョン注入**: タグ `vX.Y.Z` を検出すると、ルートの `package.json` の `version` を `X.Y.Z` に上書き。これによりElectronウィンドウタイトルが「Reflectance Spectra Viewer (vX.Y.Z)」に自動反映される
- **Windows ジョブ** (`build-windows`):
  - ネイティブ Rollup バイナリ `@rollup/rollup-win32-x64-msvc` を追加インストール
  - `npm run electron:build:win` → `npm run pack:zip` で ZIP を作成
  - 成果物: `Reflectance-Spectra-Viewer-vX.Y.Z_win.zip`（展開すると `Reflectance Spectra Viewer/` 配下に全ファイル）
  - アーティファクト名: `windows-portable-dist`
- **macOS ジョブ** (`build-macos-x64` / `build-macos-arm64`):
  - x64 は `macos-13`、arm64 は `macos-14` でそれぞれ独立してビルド
  - ネイティブ Rollup バイナリ `@rollup/rollup-darwin-{arch}` を追加インストール
  - ビルド後に成果物を以下の名前にリネーム:
    - `Reflectance.Spectra.Viewer-X.Y.Z_mac_{arch}.dmg`
    - `Reflectance.Spectra.Viewer-X.Y.Z_mac_{arch}.zip`（展開後すぐ `.app` をダブルクリックで起動可能）
  - アーティファクト名: `mac-x64-dist` / `mac-arm64-dist`
- **web ジョブ** (`build-web`):
  - Vite ビルドのみ実行し、`web-dist-vX.Y.Z.zip` を Release アセットに添付
- コードサイン: `CSC_IDENTITY_AUTO_DISCOVERY=false`（非署名ビルド）

### リリース手順

```bash
# タグを作成して push するだけ（CI が全自動で処理）
git tag v2.3.0
git push origin v2.3.0
```

### 注意点

- タグ名は `vX.Y.Z` 形式にすること（`package.json` の version に `X.Y.Z` が注入される）
- macOS は x64/arm64 を別ジョブでビルドするため、Release アセットは合計 5 ファイル（Windows ZIP × 1、macOS DMG × 2、macOS ZIP × 2）
- `workflow_dispatch`（手動実行）は設定されていないため、タグ push のみがトリガー

---

## PR 時のビルドチェック

main ブランチへの PR 作成時、Vite ビルドが通るか Windows/macOS 両環境で自動検証します。

- ファイル: `.github/workflows/pr-build-check.yml`
- 目的: マージ前のビルド破壊検出
- トリガー: main ブランチへの PR（以下のファイルが変更された場合のみ実行）
  - `src/**`, `electron/**`, `package.json`, `vite.config.js`, `.github/workflows/pr-build-check.yml`
- 権限: `contents: read`, `pull-requests: write`

### 動作概要

- Windows / macOS 環境で `npm run build`（Vite ビルド）を並列実行
- electron-builder は実行しない（軽量チェック）
- 成功時は PR にコメントを自動投稿
- 失敗時は PR のチェックが失敗状態になる

---

## 自動ドラフトリリース作成

タグ push 時、前回タグからの変更履歴を自動収集し、リリースノートのドラフトを作成します。

- ファイル: `.github/workflows/draft-release.yml`
- 目的: リリースノート作成の自動化
- トリガー: タグ push `v*`
- 権限: `contents: write`

### 動作概要

1. 前回タグとの差分からコミット履歴を自動抽出
2. ダウンロードリンクのテンプレートを生成
3. ドラフトリリースとして保存（公開前に編集可能）

### 使い方

1. タグを push 後、Actions タブで完了を確認
2. Releases ページにドラフトが作成されている
3. 内容を確認・編集して「Publish release」で公開

---

## ビルド成果物の検証テスト

リリースビルド完了後、Windows/macOS 各プラットフォームで成果物を自動ダウンロードし、起動テストを実施します。

- ファイル: `.github/workflows/verify-artifacts.yml`
- 目的: リリース前の品質チェック（起動クラッシュ検出）
- トリガー: `Release builds (Windows & macOS)` ワークフロー完了時
- 権限: `contents: read`

### 動作概要

- Windows / macOS (x64, arm64) の計 3 環境で並列実行
- ZIP を展開 → アプリを起動 → 5 秒待機 → プロセス名でアプリ稼働確認
- クラッシュや起動失敗時はエラーを報告

---

## トラブルシュート

**権限エラー**
`GITHUB_TOKEN` に依存しています。リポジトリの Actions が有効か、トークンの権限がデフォルトから制限されていないか確認してください。

**タグの付け直し**
誤ったタグを付けた場合は、ローカル/リモート双方で削除後に再作成してください。

```bash
# ローカルタグ削除
git tag -d vX.Y.Z
# リモートタグ削除
git push origin :refs/tags/vX.Y.Z
# 付け直し
git tag vX.Y.Z
git push origin vX.Y.Z
```

---

## 参考

- ワークフローの詳細:
  - `.github/workflows/ci.yml`（テスト＋ブランチビルド）
  - `.github/workflows/release.yml`（リリースビルド）
  - `.github/workflows/pr-build-check.yml`（PR ビルドチェック）
  - `.github/workflows/draft-release.yml`（ドラフトリリース作成）
  - `.github/workflows/verify-artifacts.yml`（成果物検証）
