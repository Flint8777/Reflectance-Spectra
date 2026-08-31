import { describe, expect, it } from 'vitest';
import { buildExportFigure } from '../App.jsx';

const traces = [
    { x: [1, 2], y: [3, 4], type: 'scattergl', mode: 'lines', name: 'a' },
    { x: [1, 2], y: [5, 6], type: 'scatter', mode: 'lines', name: 'b' },
];
const layout = {
    xaxis: { title: { text: 'Wavelength' }, autorange: true },
    yaxis: { title: { text: 'Reflectance' }, autorange: true },
    showlegend: false,
};

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

    it('凡例を右上に配置して表示する', () => {
        const { layout: out } = buildExportFigure(traces, layout, {
            showLegend: true,
        });
        expect(out.showlegend).toBe(true);
        expect(out.legend).toMatchObject({
            x: 1,
            y: 1,
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
        expect(out.xaxis).toMatchObject({ autorange: false, range: [0.5, 1.5] });
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
        buildExportFigure(traces, layout, {
            showLegend: true,
            xRange: [0, 1],
            yRange: [0, 1],
        });
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
