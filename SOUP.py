import sys
import os
import numpy as np
import pandas as pd
from scipy.signal import find_peaks

# 個別にモジュールをインポート
from PyQt5.QtWidgets import (
    QApplication,
    QMainWindow,
    QVBoxLayout,
    QHBoxLayout,
    QPushButton,
    QFileDialog,
    QLabel,
    QWidget,
    QStatusBar,
    QSpacerItem,
    QSizePolicy,
)
from PyQt5.QtCore import Qt, QSize
from PyQt5.QtGui import QPen, QColor, QBrush, QFont
import pyqtgraph as pg


class SpectralViewer(QMainWindow):
    def __init__(self):
        super().__init__()

        # ウィンドウタイトルとサイズの設定
        self.setWindowTitle("FT-IRスペクトルビューアー")
        self.setGeometry(100, 100, 1200, 800)

        # データ保存用の変数（複数スペクトル対応）
        self.spectra = (
            []
        )  # [{df: DataFrame, filename: str, color: tuple, curve: PlotDataItem}]
        self.color_palette = [
            (0, 0, 255),  # 青
            (255, 0, 0),  # 赤
            (0, 150, 0),  # 緑
            (255, 140, 0),  # オレンジ
            (148, 0, 211),  # 紫
            (0, 191, 255),  # 水色
            (255, 20, 147),  # ピンク
            (128, 128, 0),  # オリーブ
            (0, 128, 128),  # ティール
            (128, 0, 0),  # マルーン
        ]
        self.next_color_index = 0

        # UIのセットアップ
        self.setup_ui()

    def setup_ui(self):
        # 中央ウィジェットの設定
        self.central_widget = QWidget()
        self.setCentralWidget(self.central_widget)

        # メインレイアウト
        self.main_layout = QVBoxLayout(self.central_widget)

        # グラフエリアの設定
        self.setup_graph()

        # コントロールエリアの設定
        self.setup_controls()

        # ステータスバー
        self.statusBar = QStatusBar()
        self.setStatusBar(self.statusBar)
        self.statusBar.showMessage("ファイルを開いてスペクトルを表示します")

    def setup_graph(self):
        # グラフウィジェットのスタイル設定
        pg.setConfigOptions(antialias=True)  # アンチエイリアスを有効化

        # プロット領域の作成
        self.plot_widget = pg.PlotWidget()
        self.plot_widget.setBackground("w")  # 白背景
        self.plot_widget.showGrid(x=True, y=True, alpha=0.3)

        # 矩形選択ズーム機能の設定
        self.plot_widget.setMouseEnabled(x=True, y=True)  # X軸とY軸の両方で移動可能
        view_box = self.plot_widget.getViewBox()
        view_box.setMouseMode(pg.ViewBox.RectMode)  # 矩形選択モードを設定

        # 初期状態での表示範囲を固定（データ読み込み前の動きを抑制）
        view_box.setRange(xRange=[0, 20], yRange=[0, 1], padding=0.1)

        # ラベル設定（フォントサイズを大きくし太字に）
        styles = {"color": "#000", "font-size": "24px", "font-weight": "bold"}
        self.plot_widget.setLabel("left", "Reflectance", **styles)
        self.plot_widget.setLabel("bottom", "Wavelength (μm)", **styles)
        self.plot_widget.setTitle("Reflectance Spectrum", color="#000", size="18pt")

        # 座標表示のテキストアイテムをグラフの右上に配置
        self.cursor_text = pg.TextItem(
            text="",
            anchor=(1, 0),  # 右上を基準点に
            color="k",
            fill=(255, 255, 255, 200),
            border=pg.mkPen("k"),
        )
        # フォントサイズとスタイルを設定
        font = QFont()
        font.setPixelSize(14)
        font.setBold(True)
        self.cursor_text.setFont(font)
        self.plot_widget.addItem(self.cursor_text)

        # 初期位置はビューの右上に設定（後でon_view_range_changedで更新される）
        view_range = self.plot_widget.getViewBox().viewRange()
        self.cursor_text.setPos(view_range[0][1], view_range[1][1])

        # カーソル垂直線
        self.vLine = pg.InfiniteLine(
            angle=90, movable=False, pen=pg.mkPen("r", width=1)
        )
        self.plot_widget.addItem(self.vLine)

        # 初期状態では見えない位置に配置（データがない状態）
        self.vLine.setPos(-1000)

        # スペクトル上のポイントをハイライトするためのスキャッターポイント
        self.cursorPoint = pg.ScatterPlotItem(
            size=10, pen=pg.mkPen("r", width=2), brush=pg.mkBrush("r"), symbol="o"
        )
        self.plot_widget.addItem(self.cursorPoint)

        # 初期状態では何も表示しない（空のデータセット）
        self.cursorPoint.setData([], [])

        # マウスイベントプロキシ（パフォーマンス向上のためイベントレート制限）
        self.proxy = pg.SignalProxy(
            self.plot_widget.scene().sigMouseMoved, rateLimit=60, slot=self.mouse_moved
        )

        # ビューボックスの範囲変更イベントを監視（ズーム時に座標表示位置を更新）
        view_box = self.plot_widget.getViewBox()
        view_box.sigRangeChanged.connect(self.on_view_range_changed)

        # レイアウトにグラフウィジェットを追加
        self.main_layout.addWidget(self.plot_widget)

    def setup_controls(self):
        # コントロールエリア
        control_layout = QHBoxLayout()

        # ファイル選択ボタン
        self.open_button = QPushButton("ファイルを追加")
        self.open_button.clicked.connect(self.open_file)
        control_layout.addWidget(self.open_button)

        # 全てクリアボタン
        self.clear_button = QPushButton("全てクリア")
        self.clear_button.clicked.connect(self.clear_all)
        control_layout.addWidget(self.clear_button)

        # ファイル数ラベル
        self.file_label = QLabel("読込数: 0")
        control_layout.addWidget(self.file_label)

        # ズーム操作説明ラベル
        self.zoom_label = QLabel("ズーム: 矩形選択でズーム")
        control_layout.addWidget(self.zoom_label)

        # ズームリセットボタン
        self.reset_zoom_button = QPushButton("ズームリセット")
        self.reset_zoom_button.clicked.connect(self.reset_zoom)
        control_layout.addWidget(self.reset_zoom_button)

        # スペーサーを追加（右側に余白を作る）
        spacer = QSpacerItem(40, 20, QSizePolicy.Expanding, QSizePolicy.Minimum)
        control_layout.addItem(spacer)

        # コントロールエリアをメインレイアウトに追加
        self.main_layout.addLayout(control_layout)

    def open_file(self):
        """ファイルダイアログを開いてデータを読み込む"""
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "スペクトルデータを開く",
            "",
            "DPTファイル (*.dpt);;CSVファイル (*.csv);;全てのファイル (*.*)",
        )

        if file_path:
            try:
                # データ読み込み
                df = self.load_spectrum_file(file_path)
                filename = os.path.basename(file_path)

                # 色を割り当て
                color = self.color_palette[
                    self.next_color_index % len(self.color_palette)
                ]
                self.next_color_index += 1

                # スペクトルデータを追加
                spectrum_data = {
                    "df": df,
                    "filename": filename,
                    "color": color,
                    "curve": None,  # プロット時に設定
                }
                self.spectra.append(spectrum_data)

                # ファイル数を更新
                self.file_label.setText(f"読込数: {len(self.spectra)}")

                # プロットを更新
                self.plot_data()

                self.statusBar.showMessage(
                    f"ファイルを読み込みました: {filename} (全{len(self.spectra)}件)"
                )
            except Exception as e:
                self.statusBar.showMessage(f"エラー: {str(e)}")

    def load_spectrum_file(self, file_path):
        """スペクトルデータファイルを読み込む"""
        try:
            # DPTやCSVファイルを読み込み
            data = pd.read_csv(
                file_path, header=None, names=["Wavelength", "Reflectance"]
            )
            return data
        except Exception as e:
            # 別形式の場合はタブ区切りなども試す
            try:
                data = pd.read_csv(
                    file_path,
                    header=None,
                    names=["Wavelength", "Reflectance"],
                    sep="\t",
                )
                return data
            except:
                # 空白区切りを試す
                try:
                    data = pd.read_csv(
                        file_path,
                        header=None,
                        names=["Wavelength", "Reflectance"],
                        sep=r"\s+",
                        engine="python",
                    )
                    return data
                except Exception as e:
                    raise Exception(f"ファイルを読み込めません: {str(e)}")

    def plot_data(self):
        """データをプロットする"""
        if len(self.spectra) == 0:
            return

        # プロット領域をクリア
        self.plot_widget.clear()

        # カーソルとテキストアイテムを再追加
        self.plot_widget.addItem(self.vLine)
        self.plot_widget.addItem(self.cursorPoint)
        self.plot_widget.addItem(self.cursor_text)

        # テキストアイテムを右上に配置
        self.cursor_text.setPos(1, 1)

        # 全てのスペクトルをプロット
        for spectrum in self.spectra:
            df = spectrum["df"]
            color = spectrum["color"]
            filename = spectrum["filename"]

            # スペクトルプロット
            pen = pg.mkPen(color=color, width=1.5)
            curve = self.plot_widget.plot(
                df["Wavelength"],
                df["Reflectance"],
                pen=pen,
                name=filename,
            )
            spectrum["curve"] = curve

        # グラフのタイトルを更新
        if len(self.spectra) == 1:
            title = f"Reflectance Spectrum: {self.spectra[0]['filename']}"
        else:
            title = f"Reflectance Spectra ({len(self.spectra)} files)"

        self.plot_widget.setTitle(
            title,
            color="#000",
            size="18pt",
            bold=True,
        )

        # レジェンドを追加（複数スペクトルの場合）
        if len(self.spectra) > 1:
            legend = self.plot_widget.addLegend()
            legend.setBrush(QBrush(QColor(255, 255, 255, 200)))

        # スペクトル表示後に適切なズーム倍率に自動調整
        self.adjust_zoom_to_data()

    def detect_and_plot_extrema(self, window=5, prominence=0.0005, width=3):
        """極大値と極小値を検出してプロット - 現在は無効化されています"""
        # ピークと谷のマーキングは無効化されています
        return

    def add_max_min_points(self):
        """全体の最大値と最小値にマークを付ける - この関数は使用しません"""
        # 最大最小値の表示が不要なため、この関数は空にします
        pass

    def mouse_moved(self, evt):
        """マウス移動時の処理"""
        # データが読み込まれていない場合は何もしない
        if len(self.spectra) == 0:
            return

        pos = evt[0]  # マウスのグラフ上の位置を取得
        if self.plot_widget.sceneBoundingRect().contains(pos):
            # マウス位置をデータ座標に変換
            view_box = self.plot_widget.getViewBox()
            if view_box:
                mouse_point = view_box.mapSceneToView(pos)
                mouse_x = mouse_point.x()
            else:
                return

            # 最初のスペクトルを基準にカーソル位置を表示
            df = self.spectra[0]["df"]

            # スペクトル上の最も近いポイントを探す
            if mouse_x >= df["Wavelength"].min() and mouse_x <= df["Wavelength"].max():
                # 最も近い波長のインデックスを取得
                closest_idx = (df["Wavelength"] - mouse_x).abs().idxmin()
                x = df.loc[closest_idx, "Wavelength"]
                y = df.loc[closest_idx, "Reflectance"]

                # 垂直線の位置をスペクトル上のポイントに更新
                self.vLine.setPos(x)
                # スペクトル上のポイントをハイライト
                self.cursorPoint.setData([x], [y])

                # テキスト表示を更新（複数スペクトルの値を表示）
                text_lines = [f"Wavelength: {x:.5f} μm"]
                for i, spectrum in enumerate(self.spectra):
                    df_spec = spectrum["df"]
                    filename = spectrum["filename"]
                    # 該当する波長の値を取得
                    if (
                        x >= df_spec["Wavelength"].min()
                        and x <= df_spec["Wavelength"].max()
                    ):
                        idx = (df_spec["Wavelength"] - x).abs().idxmin()
                        y_spec = df_spec.loc[idx, "Reflectance"]
                        text_lines.append(f"{filename}: {y_spec:.5f}")

                self.cursor_text.setText("\n".join(text_lines))

                # ステータスバーも更新
                self.statusBar.showMessage(f"Wavelength: {x:.5f} μm")

    def on_view_range_changed(self, view_box):
        """ビューの範囲が変更された時（ズーム時）の処理"""
        # データがない場合はテキスト位置だけ更新
        view_range = view_box.viewRange()
        x_max = view_range[0][1]  # X軸の最大値
        y_max = view_range[1][1]  # Y軸の最大値

        # テキストアイテムをビューの右上に配置
        self.cursor_text.setPos(x_max, y_max)

        # データがない場合、テキストは空にする
        if len(self.spectra) == 0:
            self.cursor_text.setText("")

    def adjust_zoom_to_data(self):
        """データに基づいて最適なズーム範囲に調整"""
        if len(self.spectra) == 0:
            return

        # 全スペクトルの範囲を取得
        x_min = float("inf")
        x_max = float("-inf")
        y_min = float("inf")
        y_max = float("-inf")

        for spectrum in self.spectra:
            df = spectrum["df"]
            x_min = min(x_min, df["Wavelength"].min())
            x_max = max(x_max, df["Wavelength"].max())
            y_min = min(y_min, df["Reflectance"].min())
            y_max = max(y_max, df["Reflectance"].max())

        # 余白を追加（データの範囲の5%）
        x_padding = (x_max - x_min) * 0.05
        y_padding = (y_max - y_min) * 0.05

        # 特にY軸（反射率）の表示範囲を調整
        # 反射率が0〜1の範囲に収まるように
        y_min = max(0, y_min - y_padding)
        y_max = min(1, y_max + y_padding)

        # 表示範囲を設定
        self.plot_widget.setXRange(x_min - x_padding, x_max + x_padding)
        self.plot_widget.setYRange(y_min, y_max)

        # ステータスバーに表示
        self.statusBar.showMessage(
            f"表示範囲を調整しました: X=[{x_min:.2f}, {x_max:.2f}], Y=[{y_min:.2f}, {y_max:.2f}]"
        )

    def reset_zoom(self):
        """ズームをリセットして全体を表示"""
        if len(self.spectra) > 0:
            # 全体表示ではなく、データに最適化された表示範囲にリセット
            self.adjust_zoom_to_data()
            self.statusBar.showMessage("Zoom Reset")
            # テキストアイテムの位置は on_view_range_changed で更新される

    def clear_all(self):
        """全てのスペクトルをクリア"""
        self.spectra = []
        self.next_color_index = 0
        self.file_label.setText("読込数: 0")

        # グラフをクリア
        self.plot_widget.clear()

        # カーソルとテキストアイテムを再追加
        self.plot_widget.addItem(self.vLine)
        self.plot_widget.addItem(self.cursorPoint)
        self.plot_widget.addItem(self.cursor_text)

        # カーソルを非表示位置に
        self.vLine.setPos(-1000)
        self.cursorPoint.setData([], [])
        self.cursor_text.setText("")

        # タイトルをリセット
        self.plot_widget.setTitle("Reflectance Spectrum", color="#000", size="18pt")

        self.statusBar.showMessage("全てのスペクトルをクリアしました")


def main():
    app = QApplication(sys.argv)

    # スタイル設定（オプション）
    app.setStyle("Fusion")

    # アプリケーションウィンドウを作成
    window = SpectralViewer()
    window.show()

    # アプリケーションを実行
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()
