import { describe, expect, it } from 'vitest';
import { buildExportFigure, pickLegendCorner } from '../App.jsx';

const traces = [
    { x: [1, 2], y: [3, 4], type: 'scattergl', mode: 'lines', name: 'a' },
    { x: [1, 2], y: [5, 6], type: 'scatter', mode: 'lines', name: 'b' },
];
const layout = {
    xaxis: { title: { text: 'Wavelength' }, autorange: true },
    yaxis: { title: { text: 'Reflectance' }, autorange: true },
    showlegend: false,
};

// 単調増加（右上が埋まる）/ 単調減少（右上が空く）
const ramp = (from, to) => {
    const xs = [];
    const ys = [];
    for (let i = 0; i <= 100; i++) {
        xs.push(i / 100);
        ys.push(from + ((to - from) * i) / 100);
    }
    return { x: xs, y: ys, type: 'scatter', mode: 'lines', name: 's' };
};

describe('pickLegendCorner', () => {
    it('データが右上を埋めているとき右上は選ばない', () => {
        const corner = pickLegendCorner([ramp(0, 1)]);
        expect(corner).not.toMatchObject({ xanchor: 'right', yanchor: 'top' });
    });

    it('データが左上を埋めているとき右上を選ぶ', () => {
        expect(pickLegendCorner([ramp(1, 0)])).toMatchObject({
            x: 1,
            y: 1,
            xanchor: 'right',
            yanchor: 'top',
        });
    });

    it('上半分が埋まっているとき下側の角を選ぶ', () => {
        const flatHigh = {
            x: [0, 0.25, 0.5, 0.75, 1],
            y: [0.95, 0.9, 0.92, 0.9, 0.95],
            type: 'scatter',
            name: 'h',
        };
        expect(pickLegendCorner([flatHigh]).yanchor).toBe('bottom');
    });

    it('空きが同じなら右上を優先する', () => {
        const middle = {
            x: [0.45, 0.5, 0.55],
            y: [0.5, 0.5, 0.5],
            type: 'scatter',
            name: 'm',
        };
        expect(pickLegendCorner([middle])).toMatchObject({
            x: 1,
            y: 1,
            xanchor: 'right',
            yanchor: 'top',
        });
    });

    it('表示範囲の外にある点は判断に使わない', () => {
        // 右上を埋める点は x > 2 にあるので、範囲を絞れば右上が空く
        const outside = {
            x: [0, 1, 3, 4],
            y: [0.1, 0.1, 0.95, 0.98],
            type: 'scatter',
            name: 'o',
        };
        expect(
            pickLegendCorner([outside], { xRange: [0, 2], yRange: [0, 1] }),
        ).toMatchObject({ xanchor: 'right', yanchor: 'top' });
    });

    it('トレースが無くても右上を返す', () => {
        expect(pickLegendCorner([])).toMatchObject({
            xanchor: 'right',
            yanchor: 'top',
        });
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

    it('画面に凡例が無くても書き出しには凡例を付ける', () => {
        const { layout: out } = buildExportFigure(traces, layout);
        expect(out.showlegend).toBe(true);
    });

    it('凡例はデータの空いている角に置く', () => {
        const { layout: out } = buildExportFigure([ramp(1, 0)], layout);
        expect(out.legend).toMatchObject({
            x: 1,
            y: 1,
            xanchor: 'right',
            yanchor: 'top',
        });
        const { layout: out2 } = buildExportFigure([ramp(0, 1)], layout);
        expect(out2.legend).not.toMatchObject({
            xanchor: 'right',
            yanchor: 'top',
        });
    });

    it('showLegend: false のとき凡例を出さない', () => {
        const { layout: out } = buildExportFigure(traces, layout, {
            showLegend: false,
        });
        expect(out.showlegend).toBe(false);
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
    });

    it('論文用に白背景を強制する', () => {
        const { layout: out } = buildExportFigure(traces, layout);
        expect(out.paper_bgcolor).toBe('#ffffff');
        expect(out.plot_bgcolor).toBe('#ffffff');
    });
});
