import { describe, expect, it } from 'vitest';
import { filePathsFromArgv } from '../../electron/argvFiles.cjs';

// 実ファイルの有無は注入する（テストでディスクを触らない）
const exists = (...paths) => {
    const set = new Set(paths);
    return (p) => set.has(p);
};

describe('filePathsFromArgv', () => {
    it('本番のダブルクリック起動: exe パスの次の実ファイルだけ拾う', () => {
        const argv = [
            'C:\\Users\\u\\AppData\\Local\\Programs\\App\\App.exe',
            'C:\\data\\MM1120-04.0',
        ];
        expect(
            filePathsFromArgv(argv, {
                isFile: exists('C:\\data\\MM1120-04.0'),
            }),
        ).toEqual(['C:\\data\\MM1120-04.0']);
    });

    it('複数ファイルをまとめて開ける', () => {
        const argv = ['App.exe', 'C:\\a.dpt', 'C:\\b.dpt'];
        expect(
            filePathsFromArgv(argv, {
                isFile: exists('C:\\a.dpt', 'C:\\b.dpt'),
            }),
        ).toEqual(['C:\\a.dpt', 'C:\\b.dpt']);
    });

    it('スペースを含むパスをそのまま扱う（argv は分割済み）', () => {
        const argv = ['App.exe', 'C:\\My Data\\sample 1.dpt'];
        expect(
            filePathsFromArgv(argv, {
                isFile: exists('C:\\My Data\\sample 1.dpt'),
            }),
        ).toEqual(['C:\\My Data\\sample 1.dpt']);
    });

    it('更新後の再起動で渡るフラグを取り込まない', () => {
        const argv = ['App.exe', '--updated', '--force-run', 'C:\\a.dpt'];
        expect(
            filePathsFromArgv(argv, { isFile: exists('C:\\a.dpt') }),
        ).toEqual(['C:\\a.dpt']);
    });

    it('Chromium のスイッチ（値付き・単独）を取り込まない', () => {
        const argv = [
            'App.exe',
            '--allow-file-access-from-files',
            '--disable-gpu',
            '--user-data-dir=C:\\tmp',
            'C:\\a.dpt',
        ];
        expect(
            filePathsFromArgv(argv, { isFile: exists('C:\\a.dpt') }),
        ).toEqual(['C:\\a.dpt']);
    });

    it('先頭の実行ファイル自身は拾わない', () => {
        const argv = ['C:\\App\\App.exe'];
        expect(
            filePathsFromArgv(argv, { isFile: exists('C:\\App\\App.exe') }),
        ).toEqual([]);
    });

    it('開発実行（electron.exe + アプリのディレクトリ）で誤検出しない', () => {
        const argv = [
            'C:\\repo\\node_modules\\electron\\dist\\electron.exe',
            'C:\\repo',
        ];
        // ディレクトリは isFile が false
        expect(filePathsFromArgv(argv, { isFile: () => false })).toEqual([]);
    });

    it('存在しないパスは無視する', () => {
        const argv = ['App.exe', 'C:\\gone.dpt'];
        expect(filePathsFromArgv(argv, { isFile: () => false })).toEqual([]);
    });

    it('重複を除く', () => {
        const argv = ['App.exe', 'C:\\a.dpt', 'C:\\a.dpt'];
        expect(
            filePathsFromArgv(argv, { isFile: exists('C:\\a.dpt') }),
        ).toEqual(['C:\\a.dpt']);
    });

    it('引数が無い・壊れていても落ちない', () => {
        expect(filePathsFromArgv([], { isFile: () => true })).toEqual([]);
        expect(filePathsFromArgv(null, { isFile: () => true })).toEqual([]);
        expect(
            filePathsFromArgv(['App.exe', '', null], { isFile: () => true }),
        ).toEqual([]);
    });
});
