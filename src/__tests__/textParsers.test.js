import { describe, expect, it } from 'vitest';
import { extractRelabMeta } from '../lib/textParsers.js';

const field = (name, loc, len) =>
    `<Field_Character><name>${name}</name>` +
    `<field_location unit="byte">${loc}</field_location>` +
    `<field_length unit="byte">${len}</field_length></Field_Character>`;

describe('extractRelabMeta', () => {
    it('Wavelength と Reflectance の位置と長さを読む', () => {
        const xml =
            '<root><file_name>X.tab</file_name><records>2</records>' +
            field('Reflectance', 7, 6) +
            field('Wavelength', 1, 6) +
            '</root>';
        expect(extractRelabMeta(xml)).toEqual({
            tabFileName: 'x.tab',
            wlLoc: 0,
            wlLen: 6,
            rfLoc: 6,
            rfLen: 6,
            recordCount: 2,
        });
    });

    it('別の Field_Character の値を取り違えない', () => {
        const xml =
            '<root><file_name>X.tab</file_name>' +
            '<Field_Character><name>Wavelength</name></Field_Character>' +
            field('Wavelength', 3, 4) +
            field('Reflectance', 9, 5) +
            '</root>';
        const meta = extractRelabMeta(xml);
        expect(meta.wlLoc).toBe(2);
        expect(meta.wlLen).toBe(4);
    });

    it('閉じタグの無いタグを大量に並べた XML でも直ちに失敗する', () => {
        // 文書全体への遅延量指定子の連鎖でバックトラックが爆発し、画面が固まっていた（ReDoS）
        const xml =
            '<file_name>a.tab</file_name>' +
            '<Field_Character>'.repeat(200) +
            '<name>Wavelength</name>'.repeat(200) +
            '<field_location unit="byte">1</field_location>'.repeat(200) +
            '<field_length unit="byte">1</field_length>'.repeat(200);
        const t0 = performance.now();
        expect(() => extractRelabMeta(xml)).toThrow('fields not found');
        expect(performance.now() - t0).toBeLessThan(1000);
    });
});
