"""アプリアイコンを生成する（暗紺タイル＋反射スペクトル曲線）。一度きりの生成用。"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

S = 1024
SS = 4  # スーパーサンプリング倍率
W = S * SS
OUT = Path("electron/icons")


def spectrum(x, dips):
    """0..1 の x に対する 0..1 の反射率。dips = [(中心, 幅, 深さ), ...]"""
    y = 0.28 + 0.46 * (1 - math.exp(-3.2 * x))
    for c, w, d in dips:
        y -= d * math.exp(-(((x - c) / w) ** 2))
    return y


def stroke(base, dips, color, width, offset, box):
    """円ブラシで曲線を描く（Pillow の joint="curve" は太線でトゲが出るため使わない）"""
    x0, x1, y0, y1 = box
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    r = width / 2
    shift = (y1 - y0) * offset
    n = 1600
    for i in range(n + 1):
        t = i / n
        x = x0 + (x1 - x0) * t
        y = y1 - (y1 - y0) * spectrum(t, dips) + shift
        d.ellipse([x - r, y - r, x + r, y + r], fill=(*color[:3], 255))
    if color[3] < 255:
        layer.putalpha(layer.getchannel("A").point(lambda a: a * color[3] // 255))
    return Image.alpha_composite(base, layer)


# 角丸タイル（上から下へ暗くなる縦グラデーション）
tile = Image.new("RGBA", (W, W))
td = ImageDraw.Draw(tile)
top, bottom = (21, 48, 94), (8, 18, 39)
for row in range(W):
    t = row / (W - 1)
    color = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    td.line([(0, row), (W, row)], fill=(*color, 255))
mask = Image.new("L", (W, W), 0)
ImageDraw.Draw(mask).rounded_rectangle(
    [0, 0, W - 1, W - 1], radius=int(W * 0.18), fill=255
)
img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
img.paste(tile, (0, 0), mask)

pad = int(W * 0.17)
box = (pad, W - pad, int(W * 0.26), int(W * 0.76))
x0, x1, y0, y1 = box

# 軸（控えめ）
axis = Image.new("RGBA", (W, W), (0, 0, 0, 0))
ad = ImageDraw.Draw(axis)
aw = int(W * 0.012)
ad.line([(x0, y0 - aw), (x0, y1 + int(W * 0.06))], fill=(255, 255, 255, 70), width=aw)
ad.line(
    [(x0, y1 + int(W * 0.06)), (x1 + int(W * 0.02), y1 + int(W * 0.06))],
    fill=(255, 255, 255, 70),
    width=aw,
)
img = Image.alpha_composite(img, axis)

# スペクトル 3 本（主線＝白、補助＝アプリのカラーサイクル由来）
curves = [
    ([(0.60, 0.10, 0.30), (0.87, 0.05, 0.12)], (255, 183, 77, 240), 0.054, 0.17),
    ([(0.61, 0.10, 0.26), (0.87, 0.05, 0.11)], (79, 195, 247, 245), 0.054, 0.05),
    ([(0.62, 0.10, 0.22), (0.87, 0.05, 0.10)], (255, 255, 255, 255), 0.062, -0.07),
]
for dips, color, width, offset in curves:
    img = stroke(img, dips, color, W * width, offset, box)

icon = img.resize((S, S), Image.LANCZOS)
OUT.mkdir(parents=True, exist_ok=True)
icon.save(OUT / "icon.png")
icon.save(
    OUT / "icon.ico",
    sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
)
print("wrote", OUT / "icon.png", OUT / "icon.ico")
