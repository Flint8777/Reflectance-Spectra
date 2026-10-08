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

1. 形式ごとの読み込みの振り分けを読み、既存パーサーのパターンを把握する
   - `src/lib/fileLoaders.js` — `loadFile`（OPUS 拡張子なら ArrayBuffer、それ以外はテキストで読む）→ `loadTextFile`（拡張子と内容で分岐）。戻り値は `{ items: [{ x, y, name, header, visible }], labels?, relabMeta? }`、読めなければ `{ items: [] }`
   - `src/lib/textParsers.js` — テキスト形式の低レベルのパーサ（`parseDPT` など）
   - バイナリ形式は `src/opusParser.js` のように専用モジュールに置く
2. 既存テストを読み、スタイルに合わせる
   - `src/__tests__/fileLoaders.test.js` — `loadTextFile` / `loadFile` の単体テスト（`describe('loadTextFile')` の中に `'{EXT}: …'` の形で並ぶ）
   - バイナリ形式なら `src/__tests__/opusParser.test.js` — 実ファイルの fixture は使わず、`DataView` で合成したバイト列を渡す
3. 引数で指定された形式のテストを `src/__tests__/fileLoaders.test.js` に追加する（バイナリ形式でパーサを別モジュールにするなら `src/__tests__/{name}Parser.test.js` を新設）
   - 正常系: 期待される x/y・`name`・`labels`（軸ラベル）が返ること。単位換算があればその値
   - 異常系: 空ファイル、不正フォーマットで `{ items: [] }` が返ること
   - 読み込み → 描画まで確かめたいときだけ `src/__tests__/fileLoading.test.jsx` に結合テストを足す（`upload` でファイルを渡し、`globalThis.__plotProps.data` を見る）
4. テストを実行し、失敗することを確認する（`pnpm run test:run`）
5. テストのみコミットする。実装コードは書かない

## テスト構造の例

```javascript
describe('loadTextFile', () => {
    it('{EXT}: 正常なファイルを x/y に変換する', () => {
        const r = loadTextFile('...', 'a.{ext}', reflectance);
        expect(r.items[0]).toMatchObject({ x: [...], y: [...], name: 'a.{ext}' });
    });

    it('{EXT}: 空ファイルは何も返さない', () => {
        expect(loadTextFile('', 'a.{ext}', reflectance)).toEqual({ items: [] });
    });
});
```
