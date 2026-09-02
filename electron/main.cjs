const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { autoUpdater } = require('electron-updater');

// 開発環境かどうかの判定
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// 開発環境でのセキュリティ警告を抑制
if (isDev) {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

// 自動ダウンロードはしない（ユーザーがボタンを押してから落とす）。
// 差分ダウンロードは未検証の経路なので無効にする。
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.disableDifferentialDownload = true;

// 進捗の送り先。ハンドラのたびに listener を足すと多重送信になるので 1 回だけ登録する。
let progressSender = null;
autoUpdater.on('download-progress', (p) => {
    progressSender?.send('download-progress', {
        percent: Math.round(p.percent ?? 0),
        receivedBytes: p.transferred ?? 0,
        totalBytes: p.total ?? 0,
    });
});

const pkgPath = path.join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const currentVersion = pkg.version;
const RELEASES_URL =
    'https://api.github.com/repos/Flint8777/Reflectance-Spectra/releases/latest';
const REDIRECT_CODES = [301, 302, 307, 308];
const MAX_REDIRECTS = 5;
// shell.openExternal で開いてよい URL のホワイトリスト。
// プレフィクス完全一致（先頭から）で評価する。
const ALLOWED_EXTERNAL_PREFIXES = [
    'https://github.com/Flint8777/Reflectance-Spectra',
];

// ---- ヘルパー関数 ----

function httpOptions(url) {
    const urlObj = new URL(url);
    // HTTPS 強制。リダイレクト先が http:// にダウングレードされた場合も拒否
    if (urlObj.protocol !== 'https:') {
        throw new Error(`https only: got ${urlObj.protocol}`);
    }
    return {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: { 'User-Agent': 'Reflectance-Spectra-Viewer' },
    };
}

function fetchJson(url, redirectsLeft = MAX_REDIRECTS) {
    return new Promise((resolve, reject) => {
        https
            .get(httpOptions(url), (res) => {
                if (REDIRECT_CODES.includes(res.statusCode)) {
                    res.destroy();
                    if (redirectsLeft <= 0) {
                        reject(new Error('too many redirects'));
                        return;
                    }
                    resolve(fetchJson(res.headers.location, redirectsLeft - 1));
                    return;
                }
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`JSON parse error: ${e.message}`));
                    }
                });
                res.on('error', reject);
            })
            .on('error', reject);
    });
}

function downloadFile(url, dest, onProgress) {
    return new Promise((resolve, reject) => {
        const doDownload = (downloadUrl, redirectsLeft) => {
            https
                .get(httpOptions(downloadUrl), (res) => {
                    if (REDIRECT_CODES.includes(res.statusCode)) {
                        res.destroy();
                        if (redirectsLeft <= 0) {
                            reject(new Error('too many redirects'));
                            return;
                        }
                        doDownload(res.headers.location, redirectsLeft - 1);
                        return;
                    }
                    const totalBytes = parseInt(
                        res.headers['content-length'] || '0',
                        10,
                    );
                    let receivedBytes = 0;
                    const fileStream = fs.createWriteStream(dest);
                    res.on('data', (chunk) => {
                        receivedBytes += chunk.length;
                        fileStream.write(chunk);
                        if (onProgress && totalBytes > 0) {
                            onProgress({
                                percent: Math.round(
                                    (receivedBytes / totalBytes) * 100,
                                ),
                                receivedBytes,
                                totalBytes,
                            });
                        }
                    });
                    res.on('end', () => {
                        fileStream.close(resolve);
                    });
                    res.on('error', (err) => {
                        fileStream.close();
                        reject(err);
                    });
                    fileStream.on('error', reject);
                })
                .on('error', reject);
        };
        doDownload(url, MAX_REDIRECTS);
    });
}

// NSIS インストーラ版は同じフォルダにアンインストーラを置く。
// zip を展開しただけの portable 版には存在しないので、これで区別できる。
function isInstallerBuild() {
    if (process.platform !== 'win32') return false;
    try {
        const dir = path.dirname(app.getPath('exe'));
        return fs.existsSync(
            path.join(dir, 'Uninstall Reflectance Spectra Viewer.exe'),
        );
    } catch {
        return false;
    }
}

function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na !== nb) return na - nb;
    }
    return 0;
}

// ---- IPC ハンドラ ----

ipcMain.handle('get-platform', () => process.platform);

ipcMain.handle('open-external', (_event, url) => {
    // ALLOWED_EXTERNAL_PREFIXES に一致しない URL は拒否（file:// や cmd: の混入防御）
    if (
        typeof url !== 'string' ||
        !ALLOWED_EXTERNAL_PREFIXES.some((p) => url.startsWith(p))
    ) {
        throw new Error('blocked: url not in allowlist');
    }
    return shell.openExternal(url);
});

let cachedRelease = null;

ipcMain.handle('check-update', async () => {
    // 開発中は package.json の version（コミット上は固定値）と比較することになり、
    // 常に「更新あり」と出てしまう。適用側と同じく本番版だけで動かす。
    const installKind = isInstallerBuild() ? 'installer' : 'portable';
    if (!app.isPackaged) {
        return {
            hasUpdate: false,
            currentVersion,
            latestVersion: currentVersion,
            releaseUrl: null,
            installKind,
        };
    }
    if (installKind === 'installer') {
        const result = await autoUpdater.checkForUpdates();
        const latestVersion = result?.updateInfo?.version ?? currentVersion;
        return {
            hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
            currentVersion,
            latestVersion,
            releaseUrl: `https://github.com/Flint8777/Reflectance-Spectra/releases/tag/v${latestVersion}`,
            installKind,
        };
    }
    cachedRelease = await fetchJson(RELEASES_URL);
    const latestVersion = cachedRelease.tag_name.replace(/^v/, '');
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
    return {
        hasUpdate,
        currentVersion,
        latestVersion,
        releaseUrl: cachedRelease.html_url,
        installKind,
    };
});

ipcMain.handle('download-apply-update', async (event) => {
    if (!app.isPackaged) {
        throw new Error('アップデートは本番版のみサポートされています');
    }

    // インストーラ版: electron-updater が latest.yml を見て差し替える。
    // 署名していないが、electron-updater は publisherName が無いときは
    // 署名検証をスキップするので Windows では動く。
    if (isInstallerBuild()) {
        progressSender = event.sender;
        await autoUpdater.downloadUpdate();
        // 呼び出し元へ戻ってから終了させる（ここで即 quit すると IPC が切れる）
        setImmediate(() => autoUpdater.quitAndInstall(true, true));
        return;
    }

    // portable 版: インストーラをダウンロードして起動し、自分は終了する。
    // インストーラ側（build/installer.nsh）が旧フォルダを片付ける。
    const release = cachedRelease || (await fetchJson(RELEASES_URL));
    const asset = release.assets.find((a) =>
        a.name.toLowerCase().endsWith('_win_setup.exe'),
    );
    if (!asset) {
        throw new Error(
            'インストーラ（*_win_setup.exe）が見つかりません。Releases から手動で取得してください',
        );
    }

    const dest = path.join(os.tmpdir(), asset.name);
    await downloadFile(asset.browser_download_url, dest, (progress) => {
        event.sender.send('download-progress', progress);
    });

    // 先に起動してから終了する。インストーラは旧コピーを消す前に少し待つ。
    const installer = spawn(dest, [], { detached: true, stdio: 'ignore' });
    installer.unref();
    setImmediate(() => app.quit());
});

// ---- ウィンドウ作成 ----

function createWindow() {
    const version = currentVersion ? ` (v${currentVersion})` : '';

    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs'),
            // 本番では DevTools を無効化
            devTools: isDev,
        },
        title: `Reflectance Spectra Viewer${version}`,
    });

    // Content Security Policy の設定
    win.webContents.session.webRequest.onHeadersReceived(
        (details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': isDev
                        ? [
                              "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:* data: blob:",
                          ]
                        : [
                              "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src blob:;",
                          ],
                },
            });
        },
    );

    // 開発環境ではViteのdevサーバーに接続、本番ではビルドされたファイルを読み込み
    if (isDev) {
        const port = process.env.VITE_PORT || '5173';
        win.loadURL(`http://localhost:${port}`);
        win.webContents.openDevTools();
    } else {
        const indexPath = path.join(__dirname, '../dist/index.html');
        win.loadFile(indexPath);
        // 失敗時のみエラーを出す
        win.webContents.on(
            'did-fail-load',
            (_event, errorCode, errorDescription) => {
                console.error('Failed to load:', errorCode, errorDescription);
            },
        );
    }

    // HTMLの<title>タグによるウィンドウタイトル上書きを防止
    win.on('page-title-updated', (e) => e.preventDefault());

    // メニューバーを完全に撤去（Alt キーによる表示も抑止）
    win.setMenu(null);

    // 新規ウィンドウ生成は一切拒否（target=_blank 等での乗っ取り防御）
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    // 既存ウィンドウのナビゲーション抑止。開発時のみ Vite dev server へのナビゲーションを許可
    win.webContents.on('will-navigate', (e, url) => {
        if (isDev && url.startsWith('http://localhost:')) return;
        e.preventDefault();
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
