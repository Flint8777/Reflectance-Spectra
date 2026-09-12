import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App.jsx';

describe('App', () => {
    it('renders application title', () => {
        render(<App />);
        const title = screen.getByText(/Reflectance/i);
        expect(title).toBeInTheDocument();
    });
});

describe('アップデート機能', () => {
    afterEach(() => {
        delete window.electronAPI;
        vi.useRealTimers();
    });

    it('window.electronAPI が未定義のときアップデートボタンは表示されない', () => {
        delete window.electronAPI;
        render(<App />);
        expect(screen.queryByTitle('Check for updates')).toBeNull();
    });

    it('window.electronAPI が定義されているときアップデートボタンが同期的に表示される', () => {
        window.electronAPI = {
            getPlatform: vi.fn().mockResolvedValue('win32'),
            checkForUpdate: vi.fn().mockResolvedValue({
                hasUpdate: false,
                currentVersion: '1.0.0',
                latestVersion: '1.0.0',
                releaseUrl: 'https://github.com/test/releases/latest',
            }),
            onDownloadProgress: vi.fn().mockReturnValue(() => {}),
        };
        render(<App />);
        expect(screen.getByTitle('Check for updates')).toBeInTheDocument();
    });

    it('ボタンクリックでダイアログが開きタイトルが表示される', async () => {
        window.electronAPI = {
            getPlatform: vi.fn().mockResolvedValue('win32'),
            checkForUpdate: vi.fn().mockResolvedValue({
                hasUpdate: true,
                currentVersion: '1.0.0',
                latestVersion: '2.0.0',
                releaseUrl: 'https://github.com/test/releases/latest',
            }),
            onDownloadProgress: vi.fn().mockReturnValue(() => {}),
        };
        render(<App />);
        fireEvent.click(screen.getByTitle('Check for updates'));
        await waitFor(() => {
            expect(
                screen.getByRole('heading', { name: 'Check for updates' }),
            ).toBeInTheDocument();
        });
    });

    it('checkForUpdate の結果で最新バージョン番号がダイアログに表示される', async () => {
        window.electronAPI = {
            getPlatform: vi.fn().mockResolvedValue('win32'),
            checkForUpdate: vi.fn().mockResolvedValue({
                hasUpdate: true,
                currentVersion: '1.0.0',
                latestVersion: '2.0.0',
                releaseUrl: 'https://github.com/test/releases/latest',
            }),
            onDownloadProgress: vi.fn().mockReturnValue(() => {}),
        };
        render(<App />);
        fireEvent.click(screen.getByTitle('Check for updates'));
        await waitFor(() => {
            expect(screen.getByText(/2\.0\.0/)).toBeInTheDocument();
        });
    });

    it('起動3秒後の自動チェックで更新ありのときボタンタイトルが変わる', async () => {
        window.electronAPI = {
            getPlatform: vi.fn().mockResolvedValue('win32'),
            checkForUpdate: vi.fn().mockResolvedValue({
                hasUpdate: true,
                currentVersion: '1.0.0',
                latestVersion: '2.0.0',
                releaseUrl: 'https://github.com/test/releases/latest',
            }),
            onDownloadProgress: vi.fn().mockReturnValue(() => {}),
        };
        vi.useFakeTimers();
        render(<App />);
        await act(async () => {
            vi.advanceTimersByTime(3000);
        });
        vi.useRealTimers();
        await waitFor(
            () => {
                expect(
                    screen.getByTitle('Update available'),
                ).toBeInTheDocument();
            },
            { timeout: 3000 },
        );
    });
});

describe('macOS の更新導線（DMG を落として Finder で開く）', () => {
    afterEach(() => {
        delete window.electronAPI;
    });

    function macApi(overrides = {}) {
        return {
            getPlatform: vi.fn().mockResolvedValue('darwin'),
            checkForUpdate: vi.fn().mockResolvedValue({
                hasUpdate: true,
                currentVersion: '2.13.0',
                latestVersion: '2.14.0',
                releaseUrl:
                    'https://github.com/Flint8777/Reflectance-Spectra/releases/tag/v2.14.0',
                installKind: 'portable',
            }),
            downloadAndApplyUpdate: vi.fn().mockResolvedValue({
                kind: 'dmg',
                path: '/Users/me/Downloads/Reflectance.Spectra.Viewer-2.14.0_mac.dmg',
            }),
            quitApp: vi.fn().mockResolvedValue(undefined),
            openExternal: vi.fn(),
            onDownloadProgress: vi.fn().mockReturnValue(() => {}),
            ...overrides,
        };
    }

    it('更新ありのとき Download DMG ボタンが出て、Release ページを開くボタンは出ない', async () => {
        window.electronAPI = macApi();
        render(<App />);
        fireEvent.click(screen.getByTitle('Check for updates'));
        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: 'Download DMG' }),
            ).toBeInTheDocument();
        });
        expect(
            screen.queryByRole('button', { name: 'Open release page' }),
        ).toBeNull();
    });

    it('Download DMG で落として開いたあと、置き換え手順と Quit ボタンが出る', async () => {
        window.electronAPI = macApi();
        render(<App />);
        fireEvent.click(screen.getByTitle('Check for updates'));
        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: 'Download DMG' }),
            ).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', { name: 'Download DMG' }));
        await waitFor(() => {
            expect(screen.getByText(/Applications/)).toBeInTheDocument();
        });
        expect(window.electronAPI.downloadAndApplyUpdate).toHaveBeenCalledTimes(
            1,
        );
        expect(
            screen.getByText(/Reflectance\.Spectra\.Viewer-2\.14\.0_mac\.dmg/),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Quit' }));
        expect(window.electronAPI.quitApp).toHaveBeenCalledTimes(1);
    });

    it('ダウンロードに失敗したら Release ページを開くボタンに逃がす', async () => {
        window.electronAPI = macApi({
            downloadAndApplyUpdate: vi
                .fn()
                .mockRejectedValue(
                    new Error('DMG（*_mac.dmg）が見つかりません'),
                ),
        });
        render(<App />);
        fireEvent.click(screen.getByTitle('Check for updates'));
        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: 'Download DMG' }),
            ).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', { name: 'Download DMG' }));
        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: 'Open release page' }),
            ).toBeInTheDocument();
        });
        fireEvent.click(
            screen.getByRole('button', { name: 'Open release page' }),
        );
        expect(window.electronAPI.openExternal).toHaveBeenCalledWith(
            'https://github.com/Flint8777/Reflectance-Spectra/releases/tag/v2.14.0',
        );
    });
});

describe('関連付けから開かれたファイル', () => {
    afterEach(() => {
        delete window.electronAPI;
    });

    it('起動時に main へ溜まっているファイルを取りに行き、追加分も購読する', async () => {
        const takePendingFiles = vi.fn().mockResolvedValue([]);
        const onOpenFiles = vi.fn().mockReturnValue(() => {});
        window.electronAPI = {
            getPlatform: vi.fn().mockResolvedValue('win32'),
            checkForUpdate: vi.fn().mockResolvedValue({
                hasUpdate: false,
                currentVersion: '1.0.0',
                latestVersion: '1.0.0',
            }),
            onDownloadProgress: vi.fn().mockReturnValue(() => {}),
            takePendingFiles,
            onOpenFiles,
        };
        render(<App />);
        await waitFor(() => {
            expect(takePendingFiles).toHaveBeenCalledTimes(1);
        });
        expect(onOpenFiles).toHaveBeenCalled();
    });

    it('受け渡し口を持たない環境（ブラウザ版・旧 preload）でも落ちない', async () => {
        window.electronAPI = {
            getPlatform: vi.fn().mockResolvedValue('win32'),
            checkForUpdate: vi.fn().mockResolvedValue({
                hasUpdate: false,
                currentVersion: '1.0.0',
                latestVersion: '1.0.0',
            }),
            onDownloadProgress: vi.fn().mockReturnValue(() => {}),
        };
        render(<App />);
        expect(screen.getByText(/Reflectance/i)).toBeInTheDocument();
    });
});
