# Reflectance Spectra Viewer

反射スペクトルビューアーアプリケーション。FT-IR測定データ（CSV形式）を表示可能。

## 特徴

- WebGLによる描画（Plotly.js）
- クロスヘア、凡例操作、カラーピッカー搭載
- Windows/macOS対応

## ダウンロード

[Releases](https://github.com/Flint8777/Reflectance-Spectra/releases) から最新版をダウンロードしてください。

### Windows

- `Reflectance-Spectra-Viewer-portable.zip` をダウンロード
- 解凍して `Reflectance Spectra Viewer.exe` を実行

### macOS

**Intel Mac (x64)**
- `Reflectance Spectra Viewer-x.x.x-x64.dmg` をダウンロード

**Apple Silicon (M1/M2/M3)**
- `Reflectance Spectra Viewer-x.x.x-arm64.dmg` をダウンロード

**初回起動時の注意**

macOSでは「開発元が未確認」の警告が表示されます。

1. アプリを右クリック → "開く" を選択
2. 警告ダイアログで再度 "開く" をクリック
3. 2回目以降は通常のダブルクリックで起動可能

## 使い方

1. アプリを起動
2. 「ファイルを追加」を押して、CSV形式のファイルを読み込む（複数一括読み込み可能）
3. グラフが表示されます

### 対応フォーマット

ファイルは以下の形式に対応（ヘッダーなし）:

```
0.38,0.123
0.39,0.124
...
```

- 1列目: 波長（um, 横軸）
- 2列目: 反射率（縦軸）

## 動作確認済み環境

- Windows 11 (64-bit)
- macOS（確認中）

## 開発者向け

### ソースからビルドする場合

```bash
git clone https://github.com/Flint8777/Reflectance-Spectra.git
cd Reflectance-Spectra/Release
npm install
npm run build
npm run electron:build:win  # Windows
npm run electron:build:mac  # macOS
```

### 配布用ZIPの作成

```bash
cd Release
npm run electron:build:win  # ビルド実行
npm run pack:zip             # ZIP化（Windowsのみ）
```

生成物: `Release/dist-electron/Reflectance-Spectra-Viewer-portable.zip`

### 使った技術スタック

- Electron 28
- React 18
- Plotly.js (WebGL)
- Vite 5

## 変更履歴

### v2.1.4 (2025-11-08)

- Electron デスクトップアプリ版リリース
- WebGL による高速描画対応
- macOS 自動ビルド（CI）追加

### 以前のバージョン（Prototype）
git checkout main
git pull origin maingit checkout main
git pull origin main
- Python + PyQt5 版（v1.x）は `ver-1.1.0` ブランチを参照
