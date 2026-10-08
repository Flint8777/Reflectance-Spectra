import { describe, expect, it } from 'vitest';
import { isAllowedExternalUrl } from '../../electron/externalUrl.cjs';

describe('isAllowedExternalUrl', () => {
    it.each([
        // check-update が返すリリースページ
        'https://github.com/Flint8777/Reflectance-Spectra/releases/tag/v2.6.0',
        'https://github.com/Flint8777/Reflectance-Spectra/releases',
        'https://github.com/Flint8777/Reflectance-Spectra',
        'https://github.com/Flint8777/Reflectance-Spectra/',
    ])('本リポジトリ配下は許可: %s', (url) => {
        expect(isAllowedExternalUrl(url)).toBe(true);
    });

    it.each([
        // 先頭一致では通ってしまっていた別リポジトリ
        'https://github.com/Flint8777/Reflectance-Spectra-evil',
        'https://github.com/Flint8777/Reflectance-Spectra.evil/releases',
        // `..` で別リポジトリへ抜ける
        'https://github.com/Flint8777/Reflectance-Spectra/../other',
        // ホスト・スキームの偽装
        'https://github.com.evil.com/Flint8777/Reflectance-Spectra',
        'https://evil.com/github.com/Flint8777/Reflectance-Spectra',
        'https://github.com:8443/Flint8777/Reflectance-Spectra',
        'https://user:pass@github.com/Flint8777/Reflectance-Spectra',
        'http://github.com/Flint8777/Reflectance-Spectra',
        'file:///C:/Windows/System32/cmd.exe',
        'not a url',
        '',
    ])('それ以外は拒否: %s', (url) => {
        expect(isAllowedExternalUrl(url)).toBe(false);
    });

    it.each([undefined, null, 42, {}])('文字列以外は拒否: %s', (url) => {
        expect(isAllowedExternalUrl(url)).toBe(false);
    });
});
