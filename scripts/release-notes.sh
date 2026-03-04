#!/bin/bash
# 使い方: bash scripts/release-notes.sh v2.3.2
set -e

CURRENT_TAG="${1:-}"
if [ -z "$CURRENT_TAG" ]; then
    echo "使い方: $0 <tag>  例: $0 v2.3.2"
    exit 1
fi

# 前回の公開済みリリースタグを取得
PREV_TAG=$(gh release list --limit 20 --json tagName,isDraft \
    --jq "[.[] | select(.isDraft == false and .tagName != \"$CURRENT_TAG\")] | .[0].tagName // \"\"" 2>/dev/null || echo "")
if [ -z "$PREV_TAG" ]; then
    PREV_TAG=$(git rev-list --max-parents=0 HEAD | head -n1)
fi

echo "▶ 差分範囲: $PREV_TAG → $CURRENT_TAG"

# ユーザー向けコミット（CI系除外）
COMMITS=$(git log "${PREV_TAG}..${CURRENT_TAG}" --pretty=format:"- %s" -- src/ electron/ \
    | grep -v -E '^\- .+\(ci\):' || true)

# 変更統計と差分
STAT=$(git diff "${PREV_TAG}..${CURRENT_TAG}" --stat -- src/ electron/)
DIFF=$(git diff "${PREV_TAG}..${CURRENT_TAG}" \
    -- src/App.jsx electron/main.cjs electron/preload.cjs \
    | head -c 10000)

# Claude でリリースノート生成
PROMPT="${PREV_TAG} から ${CURRENT_TAG} への変更点について、エンドユーザー向けの日本語リリースノートを作成してください。

## ユーザー向けコミット
${COMMITS}

## 変更ファイル統計
${STAT}

## 差分（抜粋）
${DIFF}

### 出力ルール
- アプリを使うユーザーが気づく変化のみ記述する
- 新機能・バグ修正・改善を ## セクションで分類（該当するものだけ）
- CI・ワークフロー・開発環境の変更は一切含めない
- 技術的な実装詳細ではなく機能・操作の変化を記述
- Markdownで箇条書き、200〜350字程度"

echo "▶ Claude でリリースノート生成中..."
AI_NOTES=$(claude -p "$PROMPT" 2>/dev/null)

if [ -z "$AI_NOTES" ]; then
    echo "❌ Claude の出力が空でした"
    exit 1
fi

# バージョン番号（v除去）
VER="${CURRENT_TAG#v}"

# リリースノート全体を構築
NOTES="${AI_NOTES}

---

## ダウンロード

### Windows
- \`Reflectance-Spectra-Viewer-${CURRENT_TAG}_win.zip\` — 解凍して \`Reflectance Spectra Viewer.exe\` を実行

### macOS

**Intel Mac**
- \`Reflectance.Spectra.Viewer-${VER}_mac_x64.dmg\`

**Apple Silicon**
- \`Reflectance.Spectra.Viewer-${VER}_mac_arm64.dmg\`

> **初回起動時の注意**（「開発元が未確認」の警告が出る場合）: アプリを右クリック →「開く」→ 警告ダイアログで再度「開く」

### Web版
- \`web-dist-${CURRENT_TAG}.zip\` — ブラウザで動作するWeb版（解凍して \`index.html\` を開く）

---"

# GitHub Release を更新
echo "▶ GitHub Release を更新中..."
echo "$NOTES" | gh release edit "$CURRENT_TAG" --notes-file -

REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
echo "✅ 完了: https://github.com/${REPO}/releases/tag/${CURRENT_TAG}"
