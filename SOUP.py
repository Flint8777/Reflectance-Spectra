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

        # データ保存用の変数
        self.df = None
        self.filename = None

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
        self.open_button = QPushButton("ファイルを開く")
        self.open_button.clicked.connect(self.open_file)
        control_layout.addWidget(self.open_button)

        # ファイル名ラベル
        self.file_label = QLabel("ファイル: なし")
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
                self.df = self.load_spectrum_file(file_path)
                self.filename = os.path.basename(file_path)
                self.file_label.setText(f"ファイル: {self.filename}")

                # プロットを更新
                self.plot_data()

                self.statusBar.showMessage(f"ファイルを読み込みました: {self.filename}")
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
        if self.df is None or len(self.df) == 0:
            return

        # プロット領域をクリア
        self.plot_widget.clear()

        # カーソルとテキストアイテムを再追加
        self.plot_widget.addItem(self.vLine)
        self.plot_widget.addItem(self.cursorPoint)
        self.plot_widget.addItem(self.cursor_text)

        # テキストアイテムを右上に配置
        self.cursor_text.setPos(1, 1)

        # メインのスペクトルプロット
        main_pen = pg.mkPen(color=(0, 0, 255), width=1.5)
        self.main_curve = self.plot_widget.plot(
            self.df["Wavelength"],
            self.df["Reflectance"],
            pen=main_pen,
            name="Spectrum",
        )

        # 極大値と極小値の検出は無効化済み
        # self.detect_and_plot_extrema()

        # グラフのタイトルを更新（サイズアップして太字に）
        self.plot_widget.setTitle(
            f"Reflectance Spectrum: {self.filename}",
            color="#000",
            size="18pt",
            bold=True,
        )

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
        if self.df is None or len(self.df) == 0:
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

            # スペクトル上の最も近いポイントを探す
            if (
                mouse_x >= self.df["Wavelength"].min()
                and mouse_x <= self.df["Wavelength"].max()
            ):
                # 最も近い波長のインデックスを取得
                closest_idx = (self.df["Wavelength"] - mouse_x).abs().idxmin()
                x = self.df.loc[closest_idx, "Wavelength"]
                y = self.df.loc[closest_idx, "Reflectance"]

                # 垂直線の位置をスペクトル上のポイントに更新
                self.vLine.setPos(x)
                # スペクトル上のポイントをハイライト
                self.cursorPoint.setData([x], [y])

                # テキスト表示を更新（位置はそのまま右上に固定）
                self.cursor_text.setText(
                    f"Wavelength: {x:.5f} μm, Reflectance: {y:.5f}"
                )

                # ステータスバーも更新
                self.statusBar.showMessage(
                    f"Wavelength: {x:.5f} μm, Reflectance: {y:.5f}"
                )

    def on_view_range_changed(self, view_box):
        """ビューの範囲が変更された時（ズーム時）の処理"""
        # データがない場合はテキスト位置だけ更新
        view_range = view_box.viewRange()
        x_max = view_range[0][1]  # X軸の最大値
        y_max = view_range[1][1]  # Y軸の最大値

        # テキストアイテムをビューの右上に配置
        self.cursor_text.setPos(x_max, y_max)

        # データがない場合、テキストは空にする
        if self.df is None or len(self.df) == 0:
            self.cursor_text.setText("")

    def adjust_zoom_to_data(self):
        """データに基づいて最適なズーム範囲に調整"""
        if self.df is None or len(self.df) == 0:
            return

        # データの範囲を取得
        x_min = self.df["Wavelength"].min()
        x_max = self.df["Wavelength"].max()
        y_min = self.df["Reflectance"].min()
        y_max = self.df["Reflectance"].max()

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
        if self.df is not None and len(self.df) > 0:
            # 全体表示ではなく、データに最適化された表示範囲にリセット
            self.adjust_zoom_to_data()
            self.statusBar.showMessage("Zoom Reset")
            # テキストアイテムの位置は on_view_range_changed で更新される


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
