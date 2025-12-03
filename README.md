# Reflectance Spectra Viewer

反射スペクトル・時系列データビューアーアプリケーション。反射スペクトルデータ（CSV, DPT, RELAB TAB形式）および温度測定データ（TXT形式）の表示に対応。

## 特徴

- WebGLによる高速描画（Plotly.js）
- クロスヘア、凡例操作、カラーピッカー搭載
- 複数ファイル同時表示
- 自動軸ラベル認識・設定
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
2. 「ファイルを追加」を押して、対応フォーマットのファイルを読み込む（複数一括読み込み可能）
3. グラフが表示されます

### 対応フォーマット

#### 1. CSV形式（反射スペクトル）

ヘッダーあり・なし両方に対応：

**ヘッダーなし**
```
0.38,0.123
0.39,0.124
...
```

**ヘッダーあり**
```
Wavelength,Reflectance
0.38,0.123
0.39,0.124
...
```

- 1列目: 波長（μm）
- 2列目: 反射率

#### 2. DPT形式（反射スペクトル）

**カンマ区切り**のテキストファイル：
```
0.38,0.123
0.39,0.124
...
```

- 1列目: 波長（μm）
- 2列目: 反射率
- **注意**: DPTファイルは必ずカンマ区切り形式である必要があります

#### 3. RELAB PDS4形式（反射スペクトル）

- XML + TAB ファイルペア
- XMLラベルファイルを先に読み込み、その後TABファイルを読み込むと自動認識

#### 4. 温度測定データ（TXT形式）

以下の特徴を持つファイルを自動判定：
- 2行目に `"This document contains measurement data of the following devices:"` を含む
- ヘッダー行に `"Sec. after 00:00"` と `"Temperature"` 列を含む

例：
```
**************************************************
 This document contains measurement data of the following devices:
 At line 8: IN 140/5-H
**************************************************
...
No.  Date  time  Sec. after 00:00  Temperature  Unit  Emissivity
1    ...   ...   40106.302         499.00       °C    1.000
...
```

**自動処理**
- 時間データを0秒始まりに自動変換
- 軸ラベルを「Time (s)」「Temperature (°C)」に自動設定

### 操作方法

- **ズーム**: ドラッグで矩形選択
- **ズームリセット**: ダブルクリック または 「ズームリセット」ボタン
- **スペクトル表示/非表示**: 左側パネルのチェックボックス
- **色変更**: 左側パネルのカラーボックスをクリック
- **軸ラベル変更**: 「軸ラベル設定」ボタン
- **全削除**: 「全てクリア」ボタン

## 動作確認済み環境

- Windows 11 (64-bit)
- macOS（確認中）

## 開発者向け

### ソースからビルドする場合

```bash
git clone https://github.com/Flint8777/Reflectance-Spectra.git
cd Reflectance-Spectra
npm install
npm run build
npm run electron:build:win  # Windows
npm run electron:build:mac  # macOS
```

### 配布用ZIPの作成

```bash
npm run electron:build:win  # ビルド実行
npm run pack:zip             # ZIP化（Windowsのみ）
```

生成物: `dist-electron/Reflectance-Spectra-Viewer-v*_win.zip`

### 使った技術スタック

- Electron 28
- React 18
- Plotly.js (WebGL)
- Vite 5
- PapaParse (CSV解析)

## CI/CD (GitHub Actions)

詳しいCI/CDのワークフローとリリース手順は `GITHUB_ACTIONS.md` を参照してください。

## 変更履歴

### v2.2.0 (2025-11-30)

- ドラッグ＆ドロップでファイル読み込みに対応（エクスプローラーからの投入）
- Reflectance Spectra プリセット時の単位選択ダイアログを導入（nm→μm変換対応）
- 凡例の並べ替え機能（キー: ファイル名/拡張子、順序: 昇順/降順）
- ソートボタンをグループ行の右端へ配置（上矢印/下矢印アイコン）
- グループUIの簡素化（数字のみ表示、縦横センタリング）
- XRDプリセットの横軸ラベルを「2θ (°)」へ変更
- XRDの対応形式に ASC を追加（2θ–Intensity の2列ASCIIを自動パース）
- 初期プリセットダイアログの XRD ツールチップを「CSV, ASC」に更新
- 温度測定データ（TXT形式）の自動判定・読み込みに対応（0秒始まりへ自動補正）
- ヘッダーあり/なしCSVファイルの自動判定

### v2.1.4 (2025-11-08)

- Electron デスクトップアプリ版リリース
- WebGL による高速描画対応
- macOS 自動ビルド（CI）追加
