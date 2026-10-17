import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    isAllowedDownloadUrl,
    isSafeAssetName,
    parseSha256Digest,
    verifySha256,
} from '../../electron/updateDownload.cjs';

describe('isAllowedDownloadUrl', () => {
    it.each([
        // API が返す browser_download_url
        'https://github.com/Flint8777/Reflectance-Spectra/releases/download/v2.14.0/Reflectance-Spectra-Viewer-v2.14.0_win_setup.exe',
        // そこからの 302 先（2026-10 時点）
        'https://release-assets.githubusercontent.com/github-production-release-asset/1063774296/36bedb5f?sp=r&sig=abc',
        // 以前の 302 先
        'https://objects.githubusercontent.com/github-production-release-asset-2e65be/1063774296/abc?X-Amz-Algorithm=AWS4',
    ])('GitHub の配布経路は許可: %s', (url) => {
        expect(isAllowedDownloadUrl(url)).toBe(true);
    });

    it.each([
        // 別リポジトリの Release
        'https://github.com/evil/Reflectance-Spectra/releases/download/v9.9.9/x_win_setup.exe',
        'https://github.com/Flint8777/Reflectance-Spectra-evil/releases/download/v1/x.exe',
        // Release 以外のパス
        'https://github.com/Flint8777/Reflectance-Spectra/raw/main/x.exe',
        // ホストの偽装
        'https://release-assets.githubusercontent.com.evil.com/x',
        'https://evil.com/release-assets.githubusercontent.com/x',
        'https://github.com:8443/Flint8777/Reflectance-Spectra/releases/download/v1/x.exe',
        'https://user:pass@release-assets.githubusercontent.com/x',
        'http://release-assets.githubusercontent.com/x',
        'not a url',
        '',
    ])('それ以外は拒否: %s', (url) => {
        expect(isAllowedDownloadUrl(url)).toBe(false);
    });

    it.each([undefined, null, 42])('文字列以外は拒否: %s', (url) => {
        expect(isAllowedDownloadUrl(url)).toBe(false);
    });
});

describe('parseSha256Digest', () => {
    const hex =
        'f40323ca9de1592e528ec2d54d0f1eacb5dcb40440b2c7c85c09cc1388563f50';

    it('sha256:<hex> から hex を取り出す', () => {
        expect(parseSha256Digest(`sha256:${hex}`)).toBe(hex);
    });

    it('大文字は小文字にそろえる', () => {
        expect(parseSha256Digest(`sha256:${hex.toUpperCase()}`)).toBe(hex);
    });

    it.each([
        undefined,
        null,
        '',
        hex,
        `sha512:${hex}`,
        `sha256:${hex.slice(1)}`,
        `sha256:${hex}00`,
        `sha256:${'z'.repeat(64)}`,
    ])('形式が違えば null: %s', (digest) => {
        expect(parseSha256Digest(digest)).toBeNull();
    });
});

describe('isSafeAssetName', () => {
    it.each([
        'Reflectance-Spectra-Viewer-v2.14.0_win_setup.exe',
        'Reflectance.Spectra.Viewer-2.14.0_mac.dmg',
    ])('実際のアセット名は許可: %s', (name) => {
        expect(isSafeAssetName(name)).toBe(true);
    });

    it.each([
        '../evil.exe',
        '..\\evil.exe',
        'dir/evil.exe',
        'C:\\Windows\\evil.exe',
        '.',
        '..',
        'name with space.exe',
        '',
        undefined,
    ])('パスとして解釈されうる名前は拒否: %s', (name) => {
        expect(isSafeAssetName(name)).toBe(false);
    });
});

describe('verifySha256', () => {
    let dir;

    afterEach(() => {
        if (dir) fs.rmSync(dir, { recursive: true, force: true });
        dir = undefined;
    });

    function writeTemp(content) {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-download-'));
        const file = path.join(dir, 'asset.bin');
        fs.writeFileSync(file, content);
        return file;
    }

    it('一致すれば解決する', async () => {
        const file = writeTemp('installer body');
        const hex = createHash('sha256').update('installer body').digest('hex');
        await expect(verifySha256(file, hex)).resolves.toBeUndefined();
    });

    it('一致しなければ拒否する', async () => {
        const file = writeTemp('tampered body');
        const hex = createHash('sha256').update('installer body').digest('hex');
        await expect(verifySha256(file, hex)).rejects.toThrow(/sha256/);
    });
});
