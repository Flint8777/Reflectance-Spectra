# Reflectance Spectra Viewer

反射スペクトル・XRDパターン・温度プロファイルなど、2列形式の科学データを表示するデスクトップアプリケーション。

## 特徴

- WebGLによる高速描画（Plotly.js）
- CSV / DPT / RELAB TAB / ASC / TXT 形式に対応
- 複数ファイル同時表示・グループ管理
- ドラッグ＆ドロップでファイル読み込み
- クロスヘア、カラーピッカー、凡例ソート搭載
- 軸ラベル・表示範囲をUIから直接設定
- Windows / macOS 対応

## ダウンロード

[Releases](https://github.com/Flint8777/Reflectance-Spectra/releases) から最新版をダウンロードしてください。

### Windows

`Reflectance-Spectra-Viewer-vX.Y.Z_win.zip` をダウンロードして解凍し、`Reflectance Spectra Viewer.exe` を実行。

### macOS

| Mac の種類 | ダウンロードファイル |
|-----------|------------------|
| Intel | `Reflectance.Spectra.Viewer-X.Y.Z_mac_x64.dmg` |
| Apple Silicon | `Reflectance.Spectra.Viewer-X.Y.Z_mac_arm64.dmg` |

**初回起動時の注意**（「開発元が未確認」の警告が出る場合）

1. アプリを右クリック → "開く" を選択
2. 警告ダイアログで再度 "開く" をクリック
3. 2回目以降は通常のダブルクリックで起動可能

## 使い方

### 起動フロー

1. アプリを起動するとデータタイプ選択ダイアログが表示される
2. データに合ったプリセットを選択（下表参照）
3. ファイルを読み込む（ボタンまたはドラッグ＆ドロップ）

| プリセット | 軸設定 | 対応フォーマット |
|-----------|--------|----------------|
| Reflectance Spectra | Wavelength (μm) / Reflectance | CSV, DPT, TAB+XML |
| XRD Pattern | 2θ (°) / Intensity | CSV, ASC |
| Temperature Profile | Time (s) / Temperature (°C) | TXT (InfraWin) |
| Auto | ファイル内容から自動判定 | すべて |

### 操作方法

| 操作 | 方法 |
|------|------|
| ファイル追加 | ツールバーの「ファイル追加」ボタン、またはウィンドウへドラッグ＆ドロップ |
| 個別削除 | 左パネルの ✕ ボタン |
| 全削除 | ツールバーの「全てクリア」ボタン |
| 表示/非表示 | 左パネルのチェックボックス |
| 色変更 | 左パネルのカラーボックスをクリック |
| ズーム | グラフ上をドラッグで矩形選択 |
| ズームリセット | ダブルクリック または「ズームリセット」ボタン |
| 表示範囲指定 | ツールバーの X/Y min・max 入力欄に数値を入力して Enter |
| 軸ラベル変更 | ツールバーの「軸ラベル設定」ボタン |
| 凡例ソート | 左パネル上部のソートボタン（ファイル名/拡張子、昇順/降順） |
| グループ切替 | 左パネルの番号ボタンをクリック |
| グループ間移動 | 左パネルのトレースをグループボタンへドラッグ |
| グループ間コピー | 同上（Ctrl を押しながらドロップ） |

### 対応フォーマット

#### CSV

ヘッダーあり・なし両方を自動判定：

```
Wavelength,Reflectance
0.38,0.123
0.39,0.124
```

または

```
0.38,0.123
0.39,0.124
```

#### DPT（OPUS ソフトウェア出力）

カンマ区切り2列のテキストファイル。ヘッダーなし。

```
0.38,0.123
0.39,0.124
```

> **注意**: DPT はカンマ区切りのみ対応。スペース区切りは読み込めません。

#### RELAB PDS4（TAB + XML）

XML ラベルファイルと TAB データファイルのペア。XML を先に読み込んでから TAB を読み込むと自動認識。波長はアプリ内で nm → μm に自動変換。

#### ASC（XRD データ）

空白区切り2列（2θ, Intensity）のテキストファイル：

```
10.00 120
10.05 135
```

#### TXT（温度測定データ・InfraWin 出力）

2行目に `This document contains measurement data of the following devices:` を含むファイルを自動判定。時間データを 0 秒始まりに自動変換。

## 動作確認済み環境

- Windows 11 (64-bit)
- macOS（確認中）

## 開発者向け

### ビルド手順

```bash
git clone https://github.com/Flint8777/Reflectance-Spectra.git
cd Reflectance-Spectra
npm ci
npm run electron:build:win   # Windows
npm run electron:build:mac   # macOS
```

### Windows 配布用 ZIP 作成

```bash
npm run electron:build:win
npm run pack:zip
```

生成物: `dist-electron/Reflectance-Spectra-Viewer-vX.Y.Z_win.zip`

### テスト実行

```bash
npm run test:run
```

### 使用技術

- Electron 28
- React 18
- Plotly.js（WebGL）
- Vite 5
- PapaParse（CSV解析）

### CI/CD

タグ（`vX.Y.Z`）を push すると GitHub Actions が自動的に Windows / macOS 向けビルドを作成し、GitHub Release にアセットとして添付します。詳細は `GITHUB_ACTIONS.md` を参照。

