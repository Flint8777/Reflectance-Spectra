---
name: release
description: セマンティックバージョンのタグを作成してリリースフローを開始する
disable-model-invocation: true
---

# /release スキル

引数としてバージョン番号（例: `1.2.3`）を受け取り、リリースフローを実行する。

## 手順

1. `package.json` の現在のバージョンを確認して表示する
2. 引数が未指定の場合、ユーザーにバージョン番号を尋ねる
3. `v` プレフィックスなしで渡された場合は自動で `v` を付与する（例: `1.2.3` → `v1.2.3`）
4. 同名のタグが既に存在しないか確認する
5. `git tag vX.Y.Z` でタグを作成する
6. `git push origin vX.Y.Z` でタグをpushする
7. `gh run list --workflow=release.yml --limit=1` でCIの起動を確認する
8. リリースURLを表示する: `https://github.com/{owner}/{repo}/releases`

## 注意事項

- mainブランチ上でのみ実行すること。他のブランチにいる場合は警告して中断する
- タグpush後のビルド・リリース作成はCIが自動で行うため、手動操作は不要
