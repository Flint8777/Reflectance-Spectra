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
    QScrollArea,
    QCheckBox,
    QColorDialog,
    QFrame,
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
        )  # [{wavelengths: ndarray, reflectances: ndarray, filename: str, color: tuple, curve: PlotDataItem}]
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

        # キャッシュ用の変数（高速化）
        self.wavelength_cache = {}  # {spectrum_index: (min, max)}
        self.last_mouse_x = None  # 前回のマウス位置をキャッシュ

        # UIのセットアップ
        self.setup_ui()

    def setup_ui(self):
        # 中央ウィジェットの設定
        self.central_widget = QWidget()
        self.setCentralWidget(self.central_widget)

        # メインレイアウト
        self.main_layout = QVBoxLayout(self.central_widget)

        # グラフエリアとレジェンドエリアを含む水平レイアウト
        self.graph_and_legend_layout = QHBoxLayout()

        # レジェンドエリアの設定
        self.setup_legend_panel()

        # グラフエリアの設定
        self.setup_graph()

        # レイアウトに追加
        self.main_layout.addLayout(self.graph_and_legend_layout)

        # コントロールエリアの設定
        self.setup_controls()

        # ステータスバー
        self.statusBar = QStatusBar()
        self.setStatusBar(self.statusBar)
        self.statusBar.showMessage("ファイルを開いてスペクトルを表示します")

    def setup_legend_panel(self):
        """レジェンドパネルの設定"""
        # レジェンドエリアのフレーム
        self.legend_frame = QFrame()
        self.legend_frame.setFrameShape(QFrame.StyledPanel)
        self.legend_frame.setMaximumWidth(250)
        self.legend_frame.setMinimumWidth(200)

        # レジェンドエリアのレイアウト
        legend_layout = QVBoxLayout(self.legend_frame)

        # タイトルラベル
        title_label = QLabel("スペクトル一覧")
        title_label.setFont(QFont("Arial", 12, QFont.Bold))
        title_label.setAlignment(Qt.AlignCenter)
        legend_layout.addWidget(title_label)

        # スクロールエリア（スペクトルが多い場合に対応）
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)

        # スクロール内のコンテンツウィジェット
        self.legend_content = QWidget()
        self.legend_content_layout = QVBoxLayout(self.legend_content)
        self.legend_content_layout.setAlignment(Qt.AlignTop)

        scroll_area.setWidget(self.legend_content)
        legend_layout.addWidget(scroll_area)

        # レジェンドエリアをメインレイアウトに追加
        self.graph_and_legend_layout.addWidget(self.legend_frame)

        # レジェンドアイテムを保存するリスト
        self.legend_items = (
            []
        )  # [{checkbox: QCheckBox, color_button: QPushButton, index: int}]

    def setup_graph(self):
        # グラフウィジェットのスタイル設定
        pg.setConfigOptions(antialias=True)  # アンチエイリアスを有効化
        pg.setConfigOptions(
            useOpenGL=True
        )  # OpenGLアクセラレーションを有効化（大幅な高速化）

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
        # レート制限を20fpsに下げて負荷をさらに軽減
        self.proxy = pg.SignalProxy(
            self.plot_widget.scene().sigMouseMoved, rateLimit=20, slot=self.mouse_moved
        )

        # ビューボックスの範囲変更イベントを監視（ズーム時に座標表示位置を更新）
        view_box = self.plot_widget.getViewBox()
        view_box.sigRangeChanged.connect(self.on_view_range_changed)

        # レイアウトにグラフウィジェットを追加
        self.graph_and_legend_layout.addWidget(self.plot_widget)

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
        """ファイルダイアログを開いてデータを読み込む（複数選択可能）"""
        file_paths, _ = QFileDialog.getOpenFileNames(
            self,
            "スペクトルデータを開く（複数選択可）",
            "",
            "DPTファイル (*.dpt);;CSVファイル (*.csv);;全てのファイル (*.*)",
        )

        if file_paths:
            success_count = 0
            error_files = []

            for file_path in file_paths:
                try:
                    # データ読み込み
                    df = self.load_spectrum_file(file_path)
                    filename = os.path.basename(file_path)

                    # numpy配列として保存（pandasを使わず高速化）
                    wavelengths = np.asarray(df["Wavelength"].values, dtype=np.float64)
                    reflectances = np.asarray(
                        df["Reflectance"].values, dtype=np.float64
                    )

                    # 色を割り当て
                    color = self.color_palette[
                        self.next_color_index % len(self.color_palette)
                    ]
                    self.next_color_index += 1

                    # スペクトルデータを追加（numpy配列のみ保存）
                    spectrum_data = {
                        "wavelengths": wavelengths,
                        "reflectances": reflectances,
                        "filename": filename,
                        "color": color,
                        "curve": None,  # プロット時に設定
                        "visible": True,  # 表示/非表示フラグ
                    }
                    self.spectra.append(spectrum_data)

                    # 波長範囲をキャッシュ
                    idx = len(self.spectra) - 1
                    self.wavelength_cache[idx] = (wavelengths.min(), wavelengths.max())

                    # レジェンドアイテムを追加
                    self.add_legend_item(idx, filename, color)

                    success_count += 1

                except Exception as e:
                    error_files.append(os.path.basename(file_path))

            # ファイル数を更新
            self.file_label.setText(f"読込数: {len(self.spectra)}")

            # プロットを更新
            if success_count > 0:
                self.plot_data()

            # ステータスメッセージ
            if success_count > 0 and len(error_files) == 0:
                self.statusBar.showMessage(
                    f"{success_count}個のファイルを読み込みました (全{len(self.spectra)}件)"
                )
            elif success_count > 0 and len(error_files) > 0:
                self.statusBar.showMessage(
                    f"{success_count}個のファイルを読み込みました。エラー: {', '.join(error_files)}"
                )
            else:
                self.statusBar.showMessage(
                    f"ファイルの読み込みに失敗しました: {', '.join(error_files)}"
                )

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

    def add_legend_item(self, index, filename, color):
        """レジェンドアイテムを追加"""
        # アイテム用のフレーム
        item_frame = QFrame()
        item_frame.setFrameShape(QFrame.Box)
        item_layout = QHBoxLayout(item_frame)
        item_layout.setContentsMargins(5, 5, 5, 5)

        # チェックボックス（表示/非表示）
        checkbox = QCheckBox(filename)
        checkbox.setChecked(True)
        checkbox.stateChanged.connect(
            lambda state, idx=index: self.toggle_spectrum_visibility(idx, state)
        )
        # ファイル名が長い場合でも色ボタンが見えるようにサイズポリシーを設定
        checkbox.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        # テキストを省略表示
        checkbox.setToolTip(filename)  # ツールチップで完全なファイル名を表示
        item_layout.addWidget(checkbox, stretch=1)

        # 色選択ボタン
        color_button = QPushButton()
        color_button.setFixedSize(30, 20)
        color_button.setStyleSheet(
            f"background-color: rgb({color[0]}, {color[1]}, {color[2]})"
        )
        color_button.clicked.connect(
            lambda checked, idx=index: self.change_spectrum_color(idx)
        )
        color_button.setToolTip("色を変更")
        item_layout.addWidget(color_button, stretch=0)

        # レジェンドアイテムを保存
        legend_item = {
            "checkbox": checkbox,
            "color_button": color_button,
            "frame": item_frame,
            "index": index,
        }
        self.legend_items.append(legend_item)

        # レイアウトに追加
        self.legend_content_layout.addWidget(item_frame)

    def toggle_spectrum_visibility(self, index, state):
        """スペクトルの表示/非表示を切り替え"""
        if index < len(self.spectra):
            self.spectra[index]["visible"] = state == Qt.Checked
            self.plot_data()

    def change_spectrum_color(self, index):
        """スペクトルの色を変更"""
        if index < len(self.spectra):
            current_color = self.spectra[index]["color"]
            color = QColorDialog.getColor(
                QColor(current_color[0], current_color[1], current_color[2]),
                self,
                "色を選択",
            )

            if color.isValid():
                new_color = (color.red(), color.green(), color.blue())
                self.spectra[index]["color"] = new_color

                # 色ボタンの色を更新
                self.legend_items[index]["color_button"].setStyleSheet(
                    f"background-color: rgb({new_color[0]}, {new_color[1]}, {new_color[2]})"
                )

                # プロットを更新
                self.plot_data()

    def plot_data(self):
        """データをプロットする"""
        if len(self.spectra) == 0:
            return

        # プロット領域をクリア
        self.plot_widget.clear()

        # 表示されているスペクトルの数をカウント
        visible_count = sum(1 for s in self.spectra if s.get("visible", True))

        # レジェンドを追加（複数スペクトルの場合）- プロット前に追加
        if visible_count > 1:
            legend = self.plot_widget.addLegend()
            legend.setBrush(QBrush(QColor(255, 255, 255, 200)))

        # 全てのスペクトルをプロット（表示フラグがTrueのもののみ）
        for i, spectrum in enumerate(self.spectra):
            # 非表示の場合はスキップ
            if not spectrum.get("visible", True):
                spectrum["curve"] = None
                continue

            wavelengths = spectrum["wavelengths"]
            reflectances = spectrum["reflectances"]
            color = spectrum["color"]
            filename = spectrum["filename"]

            # スペクトルプロット（numpy配列を直接使用して高速化）
            pen = pg.mkPen(color=color, width=1.5)
            curve = self.plot_widget.plot(
                wavelengths,
                reflectances,
                pen=pen,
                name=filename,
                # ダウンサンプリングとクリッピングで大幅に高速化
                downsample=2,  # より強力なダウンサンプリング
                autoDownsample=True,
                clipToView=True,
                skipFiniteCheck=True,  # 有限値チェックをスキップして高速化
            )
            spectrum["curve"] = curve

        # カーソルとテキストアイテムを追加（プロットの後に追加して最前面に表示）
        self.plot_widget.addItem(self.vLine)
        self.plot_widget.addItem(self.cursorPoint)
        self.plot_widget.addItem(self.cursor_text)

        # グラフのタイトルを更新
        if len(self.spectra) == 1:
            title = f"Reflectance Spectrum: {self.spectra[0]['filename']}"
        elif visible_count > 0:
            title = f"Reflectance Spectra ({visible_count}/{len(self.spectra)} files visible)"
        else:
            title = f"Reflectance Spectra ({len(self.spectra)} files)"

        self.plot_widget.setTitle(
            title,
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
        """マウス移動時の処理（最適化版）"""
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

            # 前回と同じ位置なら処理をスキップ（超高速化）
            if (
                self.last_mouse_x is not None
                and abs(mouse_x - self.last_mouse_x) < 0.001
            ):
                return
            self.last_mouse_x = mouse_x

            # 最初のスペクトルを基準にカーソル位置を表示
            wavelengths = self.spectra[0]["wavelengths"]

            # キャッシュされた範囲チェック（高速化）
            w_min, w_max = self.wavelength_cache[0]
            if mouse_x < w_min or mouse_x > w_max:
                return

            # numpy配列を使用した超高速検索（searchsortedを使用）
            closest_idx = np.searchsorted(wavelengths, mouse_x)
            # 境界チェック
            if closest_idx >= len(wavelengths):
                closest_idx = len(wavelengths) - 1
            elif closest_idx > 0:
                # 左右どちらが近いか確認
                if abs(wavelengths[closest_idx - 1] - mouse_x) < abs(
                    wavelengths[closest_idx] - mouse_x
                ):
                    closest_idx -= 1

            x = wavelengths[closest_idx]
            y = self.spectra[0]["reflectances"][closest_idx]

            # 垂直線の位置をスペクトル上のポイントに更新
            self.vLine.setPos(x)
            # スペクトル上のポイントをハイライト
            self.cursorPoint.setData([x], [y])

            # テキスト表示を更新（複数スペクトルの値を表示）
            text_lines = [f"Wavelength: {x:.5f} μm"]
            for i, spectrum in enumerate(self.spectra):
                wavelengths_spec = spectrum["wavelengths"]
                filename = spectrum["filename"]

                # キャッシュされた範囲チェック（高速化）
                w_min, w_max = self.wavelength_cache[i]
                if x >= w_min and x <= w_max:
                    # searchsortedで高速検索
                    idx = np.searchsorted(wavelengths_spec, x)
                    if idx >= len(wavelengths_spec):
                        idx = len(wavelengths_spec) - 1
                    elif idx > 0:
                        if abs(wavelengths_spec[idx - 1] - x) < abs(
                            wavelengths_spec[idx] - x
                        ):
                            idx -= 1

                    y_spec = spectrum["reflectances"][idx]
                    text_lines.append(f"{filename}: {y_spec:.5f}")

            self.cursor_text.setText("\n".join(text_lines))

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

        # 表示されているスペクトルの範囲を取得（キャッシュから高速取得）
        x_min = float("inf")
        x_max = float("-inf")
        y_min = float("inf")
        y_max = float("-inf")

        visible_count = 0

        for i, spectrum in enumerate(self.spectra):
            # 非表示のスペクトルはスキップ
            if not spectrum.get("visible", True):
                continue

            visible_count += 1
            w_min, w_max = self.wavelength_cache[i]
            x_min = min(x_min, w_min)
            x_max = max(x_max, w_max)

            reflectances = spectrum["reflectances"]
            y_min = min(y_min, reflectances.min())
            y_max = max(y_max, reflectances.max())

        # 表示されているスペクトルがない場合は何もしない
        if visible_count == 0:
            return

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
        self.wavelength_cache = {}
        self.last_mouse_x = None
        self.file_label.setText("読込数: 0")

        # レジェンドアイテムをクリア
        for item in self.legend_items:
            item["frame"].deleteLater()
        self.legend_items = []

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
