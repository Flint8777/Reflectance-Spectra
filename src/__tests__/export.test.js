import { describe, expect, it, vi } from 'vitest';
import { buildExportFigure, minorDtick, pickLegendPlacement } from '../App.jsx';

const traces = [
    { x: [1, 2], y: [3, 4], type: 'scattergl', mode: 'lines', name: 'a' },
    { x: [1, 2], y: [5, 6], type: 'scatter', mode: 'lines', name: 'b' },
];
const layout = {
    xaxis: {
        title: { text: 'Wavelength', font: { size: 14 } },
        autorange: true,
    },
    yaxis: { title: { text: 'Reflectance' }, autorange: true },
    showlegend: false,
};

const line = (from, to, n = 101) => {
    const x = [];
    const y = [];
    for (let i = 0; i <= n; i++) {
        x.push(i / n);
        y.push(from + ((to - from) * i) / n);
    }
    return { x, y, type: 'scatter', mode: 'lines', name: 's' };
};

// 返ってきた凡例ボックスと折れ線が重なっていないか、線を細かくサンプルして確かめる
const overlapsBox = (place, trace, opts = {}) => {
    const { boxW = 0.3, boxH = 0.2, xRange = [0, 1], yRange = [0, 1] } = opts;
    const [x0, x1] = xRange;
    const [y0, y1] = yRange;
    const left = place.x;
    const right = place.x + boxW;
    const top = place.y;
    const bottom = place.y - boxH;
    for (let i = 0; i < trace.x.length - 1; i++) {
        for (let s = 0; s <= 200; s++) {
            const t = s / 200;
            const px = trace.x[i] + (trace.x[i + 1] - trace.x[i]) * t;
            const py = trace.y[i] + (trace.y[i + 1] - trace.y[i]) * t;
            const u = (px - x0) / (x1 - x0);
            const v = (py - y0) / (y1 - y0);
            if (u >= left && u <= right && v >= bottom && v <= top) return true;
        }
    }
    return false;
};

describe('minorDtick', () => {
    it('主目盛りを丸い数字の副目盛りに割る', () => {
        const table = [
            [1, 0.2],
            [2, 0.5],
            [2.5, 0.5],
            [5, 1],
            [10, 2],
            [20, 5],
            [50, 10],
            [0.5, 0.1],
            [0.2, 0.05],
            [0.25, 0.05],
            [0.1, 0.02],
            [0.05, 0.01],
            [0.001, 0.0002],
        ];
        for (const [major, minor] of table) {
            expect(minorDtick(major)).toBe(minor);
        }
    });

    it('plotly が渡してくる誤差混じりの主目盛りを正規化する', () => {
        expect(minorDtick(9.999999999999999e-6)).toBe(2e-6);
        expect(minorDtick(1.9999999999999998e-5)).toBe(5e-6);
        expect(minorDtick(0.09999999999999999)).toBe(0.02);
    });

    it('素朴な割り算では出せない値を返す（割り算実装への退行を検出する）', () => {
        expect(minorDtick(1e-5)).toBe(2e-6);
        expect(1e-5 / 5).not.toBe(2e-6);
    });

    it('丸く割れない主目盛りには副目盛りを付けない', () => {
        for (const v of [0.3, 3, 4, 7, 0.37, 1.5]) {
            expect(minorDtick(v)).toBeUndefined();
        }
    });

    it('数値でない dtick（log/date 軸）や異常値では undefined を返し例外を投げない', () => {
        for (const v of [
            0,
            -1,
            -2.5,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            undefined,
            null,
            '2',
            'M1',
            'L2',
            'D1',
        ]) {
            expect(minorDtick(v)).toBeUndefined();
        }
    });

    it('分割数は必ず 4 か 5 の整数になる', () => {
        for (const major of [1, 2, 2.5, 5, 0.1, 0.2, 0.25, 0.5, 100]) {
            const n = major / minorDtick(major);
            expect(Math.abs(n - Math.round(n))).toBeLessThan(1e-9);
            expect([4, 5]).toContain(Math.round(n));
        }
    });
});

describe('pickLegendPlacement', () => {
    it('トレースが無くても枠内の有限値を返す', () => {
        for (const input of [[], null, undefined]) {
            const p = pickLegendPlacement(input, { boxW: 0.3, boxH: 0.2 });
            expect(Number.isFinite(p.x)).toBe(true);
            expect(Number.isFinite(p.y)).toBe(true);
            expect(p.xanchor).toBe('left');
            expect(p.yanchor).toBe('top');
        }
    });

    it('2 点しかない斜め線にも凡例を重ねない（点ではなく線分として見る）', () => {
        const diag = {
            x: [0, 1],
            y: [0, 1],
            type: 'scatter',
            mode: 'lines',
            name: 'd',
        };
        const p = pickLegendPlacement([diag], { boxW: 0.3, boxH: 0.2 });
        expect(p.clear).toBe(true);
        expect(overlapsBox(p, diag)).toBe(false);
    });

    it('右上がりのスペクトルでは左上側へ、右下がりでは右上側へ置く', () => {
        const up = pickLegendPlacement([line(0, 1)], { boxW: 0.3, boxH: 0.2 });
        expect(up.x + 0.3).toBeLessThanOrEqual(0.55);
        expect(up.y).toBeGreaterThanOrEqual(0.5);

        const down = pickLegendPlacement([line(1, 0)], {
            boxW: 0.3,
            boxH: 0.2,
        });
        expect(down.x).toBeGreaterThanOrEqual(0.45);
        expect(down.y).toBeGreaterThanOrEqual(0.5);
    });

    it('データが左右に寄っているときは真ん中の空きへ入る（角に固執しない）', () => {
        const bar = (x) => ({
            x: [x, x],
            y: [0, 1],
            type: 'scatter',
            mode: 'lines',
            name: `v${x}`,
        });
        const p = pickLegendPlacement([bar(0.2), bar(0.8)], {
            boxW: 0.2,
            boxH: 0.2,
        });
        const center = p.x + 0.1;
        expect(center).toBeGreaterThan(0.35);
        expect(center).toBeLessThan(0.65);
    });

    it('非表示のトレースは避けない（visible:false は無視する）', () => {
        const shown = line(0, 0.2);
        const hidden = { ...line(0.8, 1), visible: false, name: 'hidden' };
        const a = pickLegendPlacement([shown], { boxW: 0.3, boxH: 0.2 });
        const b = pickLegendPlacement([shown, hidden], {
            boxW: 0.3,
            boxH: 0.2,
        });
        expect(b).toEqual(a);
    });

    it('間引いても細いスパイクを見落とさない', () => {
        const x = [];
        const y = [];
        for (let i = 0; i < 20000; i++) {
            x.push(i / 19999);
            y.push(i === 10000 ? 0.95 : 0.05);
        }
        const spike = { x, y, type: 'scatter', mode: 'lines', name: 'spike' };
        const p = pickLegendPlacement([spike], { boxW: 0.3, boxH: 0.2 });
        expect(overlapsBox(p, spike)).toBe(false);
    });

    it('空きが無い図では中に置かず clear:false を返す', () => {
        const full = [];
        for (let k = 0; k < 40; k++) {
            full.push({
                x: [0, 1],
                y: [k / 39, k / 39],
                type: 'scatter',
                mode: 'lines',
                name: `t${k}`,
            });
        }
        expect(pickLegendPlacement(full, { boxW: 0.3, boxH: 0.2 }).clear).toBe(
            false,
        );
    });

    it('凡例がプロットに対して大きすぎるときも clear:false を返す', () => {
        const p = pickLegendPlacement([line(0, 1)], { boxW: 0.8, boxH: 0.3 });
        expect(p.clear).toBe(false);
    });

    it('反転した軸レンジでも重ならない位置を返す', () => {
        const up = line(0, 1);
        const p = pickLegendPlacement([up], {
            boxW: 0.3,
            boxH: 0.2,
            xRange: [1, 0],
            yRange: [0, 1],
        });
        expect(p.clear).toBe(true);
        expect(overlapsBox(p, up, { xRange: [1, 0], yRange: [0, 1] })).toBe(
            false,
        );
    });

    it('NaN や Infinity を含んでも落ちず、有限点だけで判断する', () => {
        const dirty = {
            x: [0, 0.25, 0.5, 0.75, 1],
            y: [0.05, Number.NaN, 0.05, Number.POSITIVE_INFINITY, 0.05],
            type: 'scatter',
            mode: 'lines',
            name: 'dirty',
        };
        const p = pickLegendPlacement([dirty], { boxW: 0.3, boxH: 0.2 });
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
        expect(p.y).toBeGreaterThan(0.5);
    });

    it('同じ入力なら必ず同じ位置を返す（乱数も時刻も使わない）', () => {
        const rand = vi.spyOn(Math, 'random');
        const now = vi.spyOn(Date, 'now');
        const input = [line(0, 1), line(0.2, 0.4)];
        const first = pickLegendPlacement(input, { boxW: 0.3, boxH: 0.2 });
        for (let i = 0; i < 4; i++) {
            expect(
                pickLegendPlacement(input, { boxW: 0.3, boxH: 0.2 }),
            ).toEqual(first);
        }
        expect(rand).not.toHaveBeenCalled();
        expect(now).not.toHaveBeenCalled();
        rand.mockRestore();
        now.mockRestore();
    });

    it('どんな形・大きさでも枠の内側に収まる', () => {
        const shapes = [
            [line(0, 1)],
            [line(1, 0)],
            [line(0.5, 0.5)],
            [line(0, 1), line(1, 0)],
        ];
        for (const shape of shapes) {
            for (const [boxW, boxH] of [
                [0.1, 0.1],
                [0.3, 0.2],
                [0.5, 0.4],
            ]) {
                const p = pickLegendPlacement(shape, { boxW, boxH });
                expect(p.x).toBeGreaterThanOrEqual(0.02 - 1e-9);
                expect(p.x + boxW).toBeLessThanOrEqual(0.98 + 1e-9);
                expect(p.y).toBeLessThanOrEqual(0.98 + 1e-9);
                expect(p.y - boxH).toBeGreaterThanOrEqual(0.02 - 1e-9);
            }
        }
    });
});

describe('buildExportFigure', () => {
    it('scattergl を scatter に落としてベクター描画できるようにする', () => {
        const { data } = buildExportFigure(traces, layout);
        expect(data[0].type).toBe('scatter');
        expect(data[1].type).toBe('scatter');
    });

    it('トレースの中身（座標・名前・モード）は保持する', () => {
        const { data } = buildExportFigure(traces, layout);
        expect(data[0]).toMatchObject({
            x: [1, 2],
            y: [3, 4],
            mode: 'lines',
            name: 'a',
        });
    });

    it('画面に凡例が無くても書き出しには不透明な凡例を付ける', () => {
        const { layout: out } = buildExportFigure(traces, layout);
        expect(out.showlegend).toBe(true);
        expect(out.legend.bgcolor).toBe('#ffffff');
    });

    it('showLegend: false のとき凡例を出さない', () => {
        const { layout: out } = buildExportFigure(traces, layout, {
            showLegend: false,
        });
        expect(out.showlegend).toBe(false);
    });

    it('縦横の軸線を描き、左下で終わる L 字にする', () => {
        const { layout: out } = buildExportFigure(traces, layout);
        for (const ax of [out.xaxis, out.yaxis]) {
            expect(ax.showline).toBe(true);
            expect(ax.mirror).toBe(false);
        }
        expect(out.xaxis.side).toBe('bottom');
        expect(out.yaxis.side).toBe('left');
        expect(out.xaxis.linewidth).toBe(out.yaxis.linewidth);
    });

    it('画面 layout に mirror:true があっても書き出しは L 字のまま', () => {
        const framed = {
            ...layout,
            xaxis: { ...layout.xaxis, mirror: true },
        };
        expect(buildExportFigure(traces, framed).layout.xaxis.mirror).toBe(
            false,
        );
    });

    it('グリッド線とゼロ線を両方消す', () => {
        const { layout: out } = buildExportFigure(traces, layout);
        for (const ax of [out.xaxis, out.yaxis]) {
            expect(ax.showgrid).toBe(false);
            expect(ax.zeroline).toBe(false);
            expect(ax.minor.showgrid).toBe(false);
        }
    });

    it('主目盛りより短い副目盛りを外向きに出す', () => {
        const { layout: out } = buildExportFigure(traces, layout);
        for (const ax of [out.xaxis, out.yaxis]) {
            expect(ax.ticks).toBe('outside');
            expect(ax.minor.ticks).toBe('outside');
            expect(ax.minor.ticklen).toBeLessThan(ax.ticklen);
        }
    });

    it('目盛ラベルを消している軸（スタック表示）では目盛も出さない', () => {
        const stacked = {
            ...layout,
            yaxis: { ...layout.yaxis, showticklabels: false },
        };
        const { layout: out } = buildExportFigure(traces, stacked);
        expect(out.yaxis.ticks).toBe('');
        expect(out.yaxis.minor.ticks).toBe('');
        expect(out.xaxis.ticks).toBe('outside');
    });

    it('minor は軸ごと・呼び出しごとに別オブジェクトにする', () => {
        const a = buildExportFigure(traces, layout).layout;
        const b = buildExportFigure(traces, layout).layout;
        expect(a.xaxis.minor).not.toBe(a.yaxis.minor);
        expect(a.xaxis.minor).not.toBe(b.xaxis.minor);
    });

    it('画面 layout のネストしたオブジェクトを共有しない', () => {
        const { layout: out } = buildExportFigure(traces, layout);
        expect(out.xaxis.title).not.toBe(layout.xaxis.title);
        expect(out.xaxis.title.font).not.toBe(layout.xaxis.title.font);
    });

    it('表示中の範囲を autorange:false + range で固定する', () => {
        const { layout: out } = buildExportFigure(traces, layout, {
            xRange: [0.5, 1.5],
            yRange: [0, 1],
        });
        expect(out.xaxis).toMatchObject({
            autorange: false,
            range: [0.5, 1.5],
        });
        expect(out.yaxis).toMatchObject({ autorange: false, range: [0, 1] });
    });

    it('範囲が渡されないときは元の autorange 設定を保つ', () => {
        const { layout: out } = buildExportFigure(traces, layout);
        expect(out.xaxis.autorange).toBe(true);
        expect(out.yaxis.autorange).toBe(true);
        expect(out.xaxis.range).toBeUndefined();
    });

    it('軸タイトルなど元 layout の設定を引き継ぐ', () => {
        const { layout: out } = buildExportFigure(traces, layout);
        expect(out.xaxis.title.text).toBe('Wavelength');
        expect(out.yaxis.title.text).toBe('Reflectance');
    });

    it('入力の traces / layout を書き換えない', () => {
        buildExportFigure(traces, layout, { xRange: [0, 1], yRange: [0, 1] });
        expect(traces[0].type).toBe('scattergl');
        expect(layout.showlegend).toBe(false);
        expect(layout.xaxis.autorange).toBe(true);
        for (const key of ['showgrid', 'zeroline', 'showline', 'minor']) {
            expect(layout.xaxis[key]).toBeUndefined();
            expect(layout.yaxis[key]).toBeUndefined();
        }
    });

    it('論文用に白背景を強制する', () => {
        const { layout: out } = buildExportFigure(traces, layout);
        expect(out.paper_bgcolor).toBe('#ffffff');
        expect(out.plot_bgcolor).toBe('#ffffff');
    });
});
