---
name: parse-test
description: 新しいファイルパーサーのテストを生成する（TDD用）
disable-model-invocation: true
---

# /parse-test スキル

新しいファイル形式のパーサーをTDDで開発するためのテストを生成する。

## 引数

- ファイル形式名（例: `spc`, `jdx`）

## 手順

1. `src/App.jsx` の `parseAndAddFiles` 関数を読み、既存パーサーのパターンを把握する
2. `src/__tests__/App.test.jsx` を読み、既存テストのスタイルに合わせる
3. 引数で指定された形式のパーサーテストを `src/__tests__/App.test.jsx` に追加する
   - ファイル読み込み → パース → traces ステートへの反映を検証するテストケース
   - 正常系: 期待されるx/yデータが正しくパースされること
   - 異常系: 空ファイル、不正フォーマットのハンドリング
4. テストを実行し、失敗することを確認する（`npx vitest run`）
5. テストのみコミットする。実装コードは書かない

## テスト構造の例

```javascript
describe('.{ext} ファイルのパース', () => {
  test('正常なファイルをパースできる', async () => { ... });
  test('空ファイルを処理できる', async () => { ... });
});
```
