---
name: release
description: READMEを更新し、セマンティックバージョンのタグを作成してリリースフローを開始する
disable-model-invocation: true
---

# /release スキル

引数としてバージョン番号（例: `1.2.3`）を受け取り、リリースフローを実行する。

## 手順

### フェーズ1: README 更新

1. 前回のリリースタグからの差分（`git log --oneline <prev_tag>..HEAD -- src/ electron/`）を確認する
2. `README.md` を読み、差分に応じて以下のセクションを更新する:
   - **特徴**: 新機能が追加された場合、箇条書きに追記
   - **使い方 > 操作方法**: 操作方法が変わった場合、テーブルを更新
   - **対応フォーマット**: 新しいファイル形式が追加された場合、セクションを追加
   - **使用技術**: 主要ライブラリのバージョンが変わった場合（`package.json` を確認）
3. 変更がある場合のみREADMEを編集する。変更不要な場合はスキップする
4. READMEを更新した場合、コミットする: `docs(readme): update for vX.Y.Z`

### フェーズ2: リリース

5. `package.json` の現在のバージョンを確認して表示する
6. 引数が未指定の場合、ユーザーにバージョン番号を尋ねる
7. `v` プレフィックスなしで渡された場合は自動で `v` を付与する（例: `1.2.3` → `v1.2.3`）
8. 同名のタグが既に存在しないか確認する
9. `git tag vX.Y.Z` でタグを作成する
10. `git push origin main && git push origin vX.Y.Z` でmainとタグをpushする
11. `gh run list --workflow=release.yml --limit=1` でCIの起動を確認する
12. リリースURLを表示する: `https://github.com/{owner}/{repo}/releases`

## 注意事項

- mainブランチ上でのみ実行すること。他のブランチにいる場合は警告して中断する
- タグpush後のビルド・リリースノート生成・アセット添付はCIが自動で行うため、手動操作は不要
- READMEの更新はユーザーに差分を見せて確認を取ってからコミットする
