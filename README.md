# Reflectance Spectra Viewer

高速な反射スペクトル可視化デスクトップアプリケーション。FT-IR測定データ（CSV）をインタラクティブに表示します。

## 特徴

- WebGL による高速描画（Plotly.js）
- クロスヘア、凡例操作、カラーピッカー搭載
- Windows/macOS 対応のポータブル版

## ダウンロード

[Releases](https://github.com/Flint8777/Reflectance-Spectra/releases) から最新版をダウンロードしてください。

### Windows

- `Reflectance-Spectra-Viewer-portable.zip` をダウンロード
- 解凍して `Reflectance Spectra Viewer.exe` を実行

### macOS

**Intel Mac (x64)**
- `Reflectance Spectra Viewer-1.0.0-x64.dmg` をダウンロード

**Apple Silicon (M1/M2/M3)**
- `Reflectance Spectra Viewer-1.0.0-arm64.dmg` をダウンロード

**初回起動時の注意**

macOS では「開発元が未確認」の警告が表示されます。

1. アプリを右クリック → "開く" を選択
2. 警告ダイアログで再度 "開く" をクリック
3. 2回目以降は通常のダブルクリックで起動可能

## 使い方

1. アプリを起動
2. CSV ファイルをウィンドウにドラッグ＆ドロップ
3. グラフが表示されます

### 対応フォーマット

CSVファイルは以下の形式に対応:

```
波数,サンプル1,サンプル2,...
4000,0.123,0.456,...
3999,0.124,0.457,...
...
```

- 1列目: 波数（横軸）
- 2列目以降: 各サンプルの反射率（縦軸）

## 動作確認済み環境

- Windows 10/11 (64-bit)
- macOS 13.x (Ventura) - Intel
- macOS 14.x (Sonoma) - Apple Silicon

## 開発者向け

ソースからビルドする場合:

```bash
git clone https://github.com/Flint8777/Reflectance-Spectra.git
cd Reflectance-Spectra/web-viewer
npm install
npm run build
npm run electron:build:win  # Windows
npm run electron:build:mac  # macOS
```

### 技術スタック

- Electron 28
- React 18
- Plotly.js (WebGL)
- Vite 5

## ライセンス

MIT License

## 変更履歴

### v2.1.x (2025-11-08)

- Electron デスクトップアプリ版リリース
- WebGL による高速描画対応
- macOS 自動ビルド（CI）追加

### 以前のバージョン

- Python + PyQt5 版（v1.x）は `ver-1.1.0` ブランチを参照