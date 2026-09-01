const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

// 開発環境かどうかの判定
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// 開発環境でのセキュリティ警告を抑制
if (isDev) {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

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
    cachedRelease = await fetchJson(RELEASES_URL);
    const latestVersion = cachedRelease.tag_name.replace(/^v/, '');
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
    return {
        hasUpdate,
        currentVersion,
        latestVersion,
        releaseUrl: cachedRelease.html_url,
    };
});

ipcMain.handle('download-apply-update', async (event) => {
    if (!app.isPackaged) {
        throw new Error('アップデートは本番版のみサポートされています');
    }

    const release = cachedRelease || (await fetchJson(RELEASES_URL));
    const latestVersion = release.tag_name.replace(/^v/, '');
    if (compareVersions(latestVersion, currentVersion) <= 0) {
        throw new Error('すでに最新バージョンです');
    }

    const asset = release.assets.find((a) => {
        const n = a.name.toLowerCase();
        return (
            n.endsWith('.zip') &&
            (n.includes('windows-portable') || n.includes('_win'))
        );
    });
    if (!asset) throw new Error('Windows zip アセットが見つかりません');

    const tempDir = os.tmpdir();
    const zipDest = path.join(tempDir, asset.name);
    const exePath = app.getPath('exe');
    const appDir = path.dirname(exePath);

    await downloadFile(asset.browser_download_url, zipDest, (progress) => {
        event.sender.send('download-progress', progress);
    });

    // PowerShell アップデートスクリプト生成
    const scriptPath = path.join(tempDir, 'reflectance-update.ps1');
    const pid = process.pid;
    const zipPathEscaped = zipDest.replace(/'/g, "''");
    const exePathEscaped = exePath.replace(/'/g, "''");
    const destDirEscaped = appDir.replace(/'/g, "''");
    const tempExtractDir = path.join(tempDir, 'reflectance-update-extract');
    const tempExtractEscaped = tempExtractDir.replace(/'/g, "''");
    const exeName = path.basename(exePath);
    const scriptContent = [
        // アプリプロセスが完全に終了するまで待機（最大30秒）
        `try { Wait-Process -Id ${pid} -Timeout 30 -ErrorAction SilentlyContinue } catch {}`,
        // 子プロセス（GPU・レンダラー等）を強制終了してファイルロックを解放
        `taskkill /F /IM "${exeName}" /T 2>$null`,
        'Start-Sleep -Seconds 2',
        `$zipPath = '${zipPathEscaped}'`,
        `$exePath = '${exePathEscaped}'`,
        `$destDir = '${destDirEscaped}'`,
        `$tempExtract = '${tempExtractEscaped}'`,
        `$scriptPath = '${scriptPath.replace(/'/g, "''")}'`,
        // 一時展開先をクリーンアップ
        'if (Test-Path $tempExtract) { Remove-Item -Recurse -Force $tempExtract }',
        // 最大5回リトライしてZIPを一時ディレクトリに展開
        '$ok = $false',
        'for ($i = 0; $i -lt 5; $i++) {',
        '  try {',
        '    Expand-Archive -LiteralPath $zipPath -DestinationPath $tempExtract -Force -ErrorAction Stop',
        '    $ok = $true',
        '    break',
        '  } catch { Start-Sleep -Seconds 2 }',
        '}',
        // ZIPにネストされたフォルダがある場合、その中身を取り出す
        'if ($ok) {',
        '  $inner = Get-ChildItem -LiteralPath $tempExtract -Directory',
        '  $files = Get-ChildItem -LiteralPath $tempExtract -File',
        '  if ($inner.Count -eq 1 -and $files.Count -eq 0) {',
        '    $src = $inner[0].FullName',
        '  } else {',
        '    $src = $tempExtract',
        '  }',
        '  try {',
        '    Get-ChildItem -LiteralPath $src | Copy-Item -Destination $destDir -Recurse -Force -ErrorAction Stop',
        '    Start-Process -FilePath $exePath',
        '  } catch {',
        '    Write-Error "コピー失敗: $_"',
        '  }',
        // アイコン資源が変わったことをシェルに通知する（best-effort、ASCII のみ）。
        // 実測では SHCNE_ASSOCCHANGED を撃っても iconcache*.db は 1 バイトも変わらず、
        // 更新でアイコンが変わったときに古い絵が残る問題自体は解決しない。
        // それでも関連付け・アイコン変更時の作法であり 5 ms で済むので、
        // 実際に更新が成立したときだけ撃つ（Explorer の CPU を使うため無条件では撃たない）。
        // 失敗しても再起動を妨げないよう try/catch の外に置き、痕跡だけ残す。
        '  try {',
        "    if (-not ('Win32.ShellNotify' -as [type])) {",
        '      $sig = \'[System.Runtime.InteropServices.DllImport("shell32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)] public static extern void SHChangeNotify(int wEventId, uint uFlags, System.IntPtr dwItem1, System.IntPtr dwItem2);\'',
        '      Add-Type -Namespace Win32 -Name ShellNotify -MemberDefinition $sig -ErrorAction Stop',
        '    }',
        // SHCNE_ASSOCCHANGED = 0x08000000 / SHCNF_IDLIST(0x0000) | SHCNF_FLUSHNOWAIT(0x3000)
        // 0x1000 (SHCNF_FLUSH) は配信完了までブロックするので使わない。
        // 0x2000 は古い SDK の値で flush ビットが落ちる。
        '    [Win32.ShellNotify]::SHChangeNotify(0x08000000, 0x3000, [IntPtr]::Zero, [IntPtr]::Zero)',
        '  } catch {',
        '    "SHChangeNotify failed: $_" | Out-File -FilePath (Join-Path $env:TEMP \'reflectance-update-last.log\') -Append',
        '  }',
        '}',
        'Start-Sleep -Seconds 1',
        'Remove-Item $zipPath -Force -ErrorAction SilentlyContinue',
        'Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue',
        'Remove-Item $scriptPath -Force -ErrorAction SilentlyContinue',
    ].join('\r\n');

    // BOM 必須。powershell.exe (5.1) は BOM 無しの .ps1 をシステム ANSI（日本語環境では
    // cp932）として読むため、上の 'コピー失敗' のような非 ASCII が文字化けする。
    // install 先に日本語が入ると $destDir の展開まで壊れる。
    fs.writeFileSync(scriptPath, `\uFEFF${scriptContent}`, 'utf-8');

    // cmd /c start で完全に独立したプロセスとして起動（app.quit()に巻き込まれない）
    const ps = spawn(
        'cmd.exe',
        [
            '/c',
            'start',
            '""',
            'powershell.exe',
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-WindowStyle',
            'Hidden',
            '-File',
            scriptPath,
        ],
        { detached: true, stdio: 'ignore' },
    );
    ps.unref();

    app.quit();
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
