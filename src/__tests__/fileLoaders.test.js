import { describe, expect, it } from 'vitest';
import { PRESET_LABELS } from '../constants.js';
import {
    isOpusExtension,
    loadFile,
    loadTextFile,
    selectOpusSpectra,
} from '../lib/fileLoaders.js';

const reflectance = { presetSelected: 'wavelength-reflectance' };

describe('loadTextFile', () => {
    it('CSV: ヘッダー行があれば軸ラベル候補として返す', () => {
        const r = loadTextFile(
            'Wavelength,Reflectance\n1,0.1\n2,0.2\n',
            'a.csv',
            reflectance,
        );
        expect(r.items).toHaveLength(1);
        expect(r.items[0]).toMatchObject({
            x: [1, 2],
            y: [0.1, 0.2],
            name: 'a.csv',
            header: { xLabel: 'Wavelength', yLabel: 'Reflectance' },
            visible: true,
        });
        expect(r.labels).toBeUndefined();
    });

    it('CSV: ヘッダーが無ければ header は null', () => {
        const r = loadTextFile('1,0.1\n2,0.2\n', 'a.csv', reflectance);
        expect(r.items[0].header).toBeNull();
        expect(r.items[0].x).toEqual([1, 2]);
    });

    it('CSV: 反射スペクトルで nm を選んだときだけ μm に換算する', () => {
        const text = '1000,0.1\n2000,0.2\n';
        expect(
            loadTextFile(text, 'a.csv', { ...reflectance, unitOverride: 'nm' })
                .items[0].x,
        ).toEqual([1, 2]);
        expect(
            loadTextFile(text, 'a.csv', {
                presetSelected: 'auto',
                unitOverride: 'nm',
            }).items[0].x,
        ).toEqual([1000, 2000]);
    });

    it('DPT: プリセットの軸ラベルを返し、空なら何も返さない', () => {
        const r = loadTextFile('1.0,0.2\n1.5,0.3\n', 'a.dpt', reflectance);
        expect(r.items[0].x).toEqual([1.0, 1.5]);
        expect(r.labels).toBe(PRESET_LABELS['wavelength-reflectance']);
        expect(loadTextFile('# only comment\n', 'b.dpt', reflectance)).toEqual({
            items: [],
        });
    });

    it('ASC: XRD の軸ラベルを返す', () => {
        const r = loadTextFile('10 100\n20 200\n', 'a.asc', {
            presetSelected: 'spacing-intensity',
        });
        expect(r.items[0].y).toEqual([100, 200]);
        expect(r.labels).toBe(PRESET_LABELS['spacing-intensity']);
    });

    it('TAB: メタが無くても RELAB 形式と判定し、nm を μm に換算する', () => {
        const r = loadTextFile('2\n500 0.1\n600 0.2\n', 'x.tab', reflectance);
        expect(r.items[0].x).toEqual([0.5, 0.6]);
        expect(r.items[0].y).toEqual([0.1, 0.2]);
        expect(r.labels).toBe(PRESET_LABELS['wavelength-reflectance']);
    });

    it('XML: RELAB のメタを返し、トレースは作らない。その .tab はメタで読む', () => {
        const field = (name, loc, len) =>
            `<Field_Character><name>${name}</name>` +
            `<field_location unit="byte">${loc}</field_location>` +
            `<field_length unit="byte">${len}</field_length></Field_Character>`;
        const xml =
            '<root><file_name>X.tab</file_name><records>2</records>' +
            field('Wavelength', 1, 6) +
            field('Reflectance', 7, 6) +
            '</root>';
        const r = loadTextFile(xml, 'x.xml', reflectance);
        expect(r.items).toEqual([]);
        expect(r.relabMeta?.tabFileName).toBe('x.tab');

        const tab = loadTextFile(' 500.0 0.100\n 600.0 0.200\n', 'X.tab', {
            ...reflectance,
            relabMeta: { 'x.tab': r.relabMeta },
        });
        expect(tab.items[0].x).toEqual([0.5, 0.6]);
        expect(tab.items[0].y).toEqual([0.1, 0.2]);
    });

    it('InfraWin の温度ログ: 時間を 0 秒始まりにする', () => {
        const text = [
            'header',
            'This document contains measurement data of the following devices:',
            'No.\tDate\tSec. since 00:00\tTemperature',
            'unit row',
            '1\td\t100\t20.5',
            '2\td\t101.5\t21.0',
        ].join('\n');
        const r = loadTextFile(text, 't.txt', {
            presetSelected: 'time-temperature',
        });
        expect(r.items[0].x).toEqual([0, 1.5]);
        expect(r.items[0].y).toEqual([20.5, 21.0]);
        expect(r.labels).toBe(PRESET_LABELS['time-temperature']);
    });

    it('その他の拡張子は空白区切り 2 列として読み、空でもトレースを返す', () => {
        expect(
            loadTextFile('1 2\n3 4\n', 'a.txt', reflectance).items[0],
        ).toMatchObject({ x: [1, 3], y: [2, 4], header: null });
        expect(loadTextFile('', 'b.txt', reflectance).items).toHaveLength(1);
    });
});

describe('selectOpusSpectra', () => {
    const sp = (key, dxu, extra = {}) => ({
        key,
        dxu,
        label: key.toUpperCase(),
        x: dxu === 'WN' ? [5000, 10000] : [2, 1],
        y: new Float32Array([0.1, 0.2]),
        ...extra,
    });

    it('反射スペクトルでは同じスペクトルの WN/MI 重複から MI を残す', () => {
        const out = selectOpusSpectra(
            [sp('r', 'WN'), sp('r', 'MI'), sp('t', 'PNT')],
            'a.0',
            'wavelength-reflectance',
        );
        expect(out).toHaveLength(1);
        expect(out[0].x).toEqual([2, 1]);
        expect(out[0].name).toBe('a.0');
        expect(out[0].y).toEqual([
            expect.closeTo(0.1, 6),
            expect.closeTo(0.2, 6),
        ]);
    });

    it('WN しか無ければ μm に換算する', () => {
        const out = selectOpusSpectra(
            [sp('r', 'WN')],
            'a.0',
            'wavelength-reflectance',
        );
        expect(out[0].x).toEqual([2, 1]);
    });

    it('Series に較正済みがあれば raw チャンネルを非表示にし、名前に番号を付ける', () => {
        const out = selectOpusSpectra(
            [
                sp('r', 'MI', { seriesIndex: 0 }),
                sp('r', 'MI', { seriesIndex: 1 }),
                sp('sm', 'MI', { seriesIndex: 0 }),
            ],
            'a.0',
            'wavelength-reflectance',
        );
        expect(out.map((o) => o.name)).toEqual([
            'a.0 [R #1]',
            'a.0 [R #2]',
            'a.0 [SM #1]',
        ]);
        expect(out.map((o) => o.visible)).toEqual([true, true, false]);
    });
});

describe('loadFile', () => {
    it('数字だけの拡張子と .opus を OPUS として扱う', () => {
        expect(isOpusExtension('0')).toBe(true);
        expect(isOpusExtension('0001')).toBe(true);
        expect(isOpusExtension('opus')).toBe(true);
        expect(isOpusExtension('csv')).toBe(false);
    });

    it('マジックバイトの無い OPUS 拡張子のファイルは空の結果になる', async () => {
        const r = await loadFile(new File(['not opus'], 'a.0'), reflectance);
        expect(r).toEqual({ items: [] });
    });

    it('テキストファイルを読んで変換する', async () => {
        const r = await loadFile(
            new File(['1.0,0.2\n2.0,0.3\n'], 'a.dpt'),
            reflectance,
        );
        expect(r.items[0].y).toEqual([0.2, 0.3]);
    });
});
