# GitHub Actions ガイド

このリポジトリで設定されている GitHub Actions の目的・挙動・使い方をまとめたガイドです。必要に応じて手動実行の手順やタグ運用のコマンド例も記載します。

- ワークフロー定義: `.github/workflows/*.yml`

---

## Release builds (Windows & macOS)

Electron アプリを Windows 向け portable ZIP、macOS 向け DMG/ZIP としてビルドし、タグ付き push 時に GitHub Release のアセットとして公開します。手動実行時は成果物を Actions のアーティファクトとして取得できます。

- ファイル: `.github/workflows/release.yml`
- 目的: Windows/macOS の配布ビルド作成とリリース添付
- トリガー:
  - タグ push: `v*`（例: `v2.2.0`）
  - 手動実行: `workflow_dispatch`
- 権限: `contents: write`, `issues: write`
- シークレット: 既定の `GITHUB_TOKEN` を使用（追加の秘密情報は不要）

### ビルド概要
- Node.js: v20 を使用
- バージョン注入: タグ `vX.Y.Z` を検出すると、`Release/package.json` の `version` を `X.Y.Z` に上書き
- Windows ジョブ:
  - ネイティブ Rollup バイナリ `@rollup/rollup-win32-x64-msvc` を同一バージョンで追加インストール
  - `npm run electron:build:win` → `npm run pack:zip` で ZIP を作成
  - ZIP成果物は `Reflectance-Spectra-Viewer-vX.Y.Z_win.zip` というファイル名で出力
  - ZIPを展開すると親ディレクトリ「Reflectance Spectra Viewer」配下に全ファイルが入る
  - 手動実行時はアーティファクト `windows-portable-dist` としてアップロード
  - タグ push 時は `softprops/action-gh-release` で Release アセットに添付
- macOS ジョブ:
  - マトリクスで x64 (`macos-13`) / arm64 (`macos-14`) をビルド
  - ネイティブ Rollup バイナリ `@rollup/rollup-darwin-{arch}` を同一バージョンで追加インストール
  - `npm run electron:build:mac` 実行後、成果物は `Reflectance.Spectra.Viewer-X.Y.Z_mac_{arch}.dmg` および `Reflectance.Spectra.Viewer-X.Y.Z_mac_{arch}.zip` へリネーム
  - ZIPを展開すると「Reflectance-Spectra-Viewer.app」ディレクトリがルートに現れ、ダブルクリックで起動可能
  - 手動実行時はアーティファクト `mac-{arch}-dist` としてアップロード
  - タグ push 時は Release アセットに添付
- コードサイン: `CSC_IDENTITY_AUTO_DISCOVERY=false` により自動検出を無効化（非署名ビルド）
- **ウィンドウタイトル自動化**: タグから注入されたバージョンがElectronウィンドウタイトル「Reflectance Spectra Viewer (vX.Y.Z)」に自動反映されます

### 使い方
- 手動実行（アーティファクト取得）:
  1. GitHub の Actions タブ → "Release builds (Windows & macOS)"
  2. "Run workflow" を押下
  3. 完了後、各ジョブのアーティファクトから ZIP/DMG をダウンロード
- タグリリース（Release へ自動添付）:
  1. リリースしたいコミットにタグを作成
  2. タグを push すると自動的にビルドされ、完成物が Release に添付されます

cmd.exe 用コマンド例:

```cmd
REM 例: v2.2.0 を作成して push
git tag v2.2.0
git push origin v2.2.0
```

### 注意点
- タグ名は `vX.Y.Z` 形式にしてください（`package.json` の version に `X.Y.Z` が注入されます）
- 手動実行では Release には添付されず、アーティファクトとしてのみ提供されます
- macOS は x64/arm64 を別々にビルドし、ファイル名に `mac_{arch}` が付与されます
- Windows/macOSともにzip展開時の親ディレクトリ名が統一されています（Windows: Reflectance Spectra Viewer、macOS: Reflectance-Spectra-Viewer.app）
- macOS zipは展開後すぐ「Reflectance-Spectra-Viewer.app」をダブルクリックで起動できます
- アプリウィンドウ上部のタイトルも自動で「Reflectance Spectra Viewer (vX.Y.Z)」となります

---

## PR時のビルドチェック

mainブランチへのPull Request作成時、ビルドが通るか自動検証します。成果物は作成せず、ビルドの成否のみを確認します。

- ファイル: `.github/workflows/pr-build-check.yml`
- 目的: マージ前のビルド破壊検出
- トリガー: mainブランチへのPR作成・更新（`Release/`配下の変更時のみ）
- 権限: `contents: read`, `pull-requests: write`
- シークレット: `GITHUB_TOKEN`

### 動作概要
- Windows/macOS環境で並列にビルド検証
- `npm run build`（Viteビルド）のみ実行
- 成功時はPRにコメントを自動投稿
- 失敗時はPRのチェックが失敗状態になる

### メリット
- リリース前にビルド破壊を検出
- マージ後も常にビルド可能な状態を維持
- 軽量（electron-builderは実行しない）

---

## 自動ドラフトリリース作成

タグpush時、前回タグからの変更履歴を自動収集し、リリースノートのテンプレートをドラフトとして作成します。

- ファイル: `.github/workflows/draft-release.yml`
- 目的: リリースノート作成の自動化
- トリガー: タグ push (`v*`)
- 権限: `contents: write`
- シークレット: `GITHUB_TOKEN`

### 動作概要
1. 前回タグとの差分からコミット履歴を自動抽出
2. ダウンロードリンクのテンプレートを生成
3. ドラフトリリースとして保存（公開前に編集可能）

### 使い方
1. タグをpush後、Actionsタブで確認
2. Releasesページにドラフトが作成されます
3. 内容を確認・編集して「Publish release」で公開

---

## ビルド成果物の検証テスト

リリースビルド完了後、Windows/macOS各プラットフォームで成果物を自動ダウンロードし、起動テストを実施します。

- ファイル: `.github/workflows/verify-artifacts.yml`
- 目的: リリース前の品質チェック（起動クラッシュ検出）
- トリガー: `Release builds` ワークフロー完了時
- 権限: `contents: read`
- シークレット: `GITHUB_TOKEN`

### 動作概要
- Windows/macOS (x64/arm64) 各環境で並列実行
- ZIPを展開 → アプリを起動 → 5秒待機 → 正常稼働確認
- クラッシュや起動失敗時はエラーを報告

### 使い方
- 自動実行されます（手動操作不要）
- Actionsタブで結果を確認
- 失敗時はログで原因を特定

---

## トラブルシュート
- 権限エラー: `GITHUB_TOKEN` に依存しています。リポジトリの Actions が有効か、トークンの権限がデフォルトから厳しく制限されていないか確認してください。
- タグの付け直し: 誤ったタグを付けた場合は、ローカル/リモート双方で削除後に再作成してください。
  
  ```cmd
  REM ローカルタグ削除
  git tag -d v2.2.0
  REM リモートタグ削除
  git push origin :refs/tags/v2.2.0
  REM 付け直し
  git tag v2.2.0
  git push origin v2.2.0
  ```

---

## 参考
- Release ビルドはルート配下の `package.json` と npm scripts に依存します。
- ワークフローの詳細:
  - `.github/workflows/release.yml` (リリースビルド)
  - `.github/workflows/pr-build-check.yml` (PRビルドチェック)
  - `.github/workflows/draft-release.yml` (ドラフトリリース作成)
  - `.github/workflows/verify-artifacts.yml` (成果物検証)
