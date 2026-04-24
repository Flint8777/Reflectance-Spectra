const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const https = require('https')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')

// 開発環境かどうかの判定
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// 開発環境でのセキュリティ警告を抑制
if (isDev) {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
}

const pkgPath = path.join(__dirname, '../package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
const currentVersion = pkg.version
const RELEASES_URL = 'https://api.github.com/repos/Flint8777/Reflectance-Spectra/releases/latest'
const REDIRECT_CODES = [301, 302, 307, 308]

// ---- ヘルパー関数 ----

function httpOptions(url) {
    const urlObj = new URL(url)
    return {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: { 'User-Agent': 'Reflectance-Spectra-Viewer' }
    }
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(httpOptions(url), res => {
            if (REDIRECT_CODES.includes(res.statusCode)) {
                res.destroy()
                resolve(fetchJson(res.headers.location))
                return
            }
            let data = ''
            res.on('data', chunk => data += chunk)
            res.on('end', () => {
                try { resolve(JSON.parse(data)) }
                catch (e) { reject(new Error(`JSON parse error: ${e.message}`)) }
            })
            res.on('error', reject)
        }).on('error', reject)
    })
}

function downloadFile(url, dest, onProgress) {
    return new Promise((resolve, reject) => {
        const doDownload = (downloadUrl) => {
            https.get(httpOptions(downloadUrl), res => {
                if (REDIRECT_CODES.includes(res.statusCode)) {
                    res.destroy()
                    doDownload(res.headers.location)
                    return
                }
                const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
                let receivedBytes = 0
                const fileStream = fs.createWriteStream(dest)
                res.on('data', chunk => {
                    receivedBytes += chunk.length
                    fileStream.write(chunk)
                    if (onProgress && totalBytes > 0) {
                        onProgress({
                            percent: Math.round(receivedBytes / totalBytes * 100),
                            receivedBytes,
                            totalBytes
                        })
                    }
                })
                res.on('end', () => { fileStream.close(resolve) })
                res.on('error', err => { fileStream.close(); reject(err) })
                fileStream.on('error', reject)
            }).on('error', reject)
        }
        doDownload(url)
    })
}

function compareVersions(a, b) {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0
        const nb = pb[i] || 0
        if (na !== nb) return na - nb
    }
    return 0
}

// ---- IPC ハンドラ ----

ipcMain.handle('get-platform', () => process.platform)

ipcMain.handle('open-external', (_event, url) => shell.openExternal(url))

let cachedRelease = null

ipcMain.handle('check-update', async () => {
    cachedRelease = await fetchJson(RELEASES_URL)
    const latestVersion = cachedRelease.tag_name.replace(/^v/, '')
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0
    return { hasUpdate, currentVersion, latestVersion, releaseUrl: cachedRelease.html_url }
})

ipcMain.handle('download-apply-update', async (event) => {
    if (!app.isPackaged) {
        throw new Error('アップデートは本番版のみサポートされています')
    }

    const release = cachedRelease || await fetchJson(RELEASES_URL)
    const latestVersion = release.tag_name.replace(/^v/, '')
    if (compareVersions(latestVersion, currentVersion) <= 0) {
        throw new Error('すでに最新バージョンです')
    }

    const asset = release.assets.find(a => {
        const n = a.name.toLowerCase()
        return n.endsWith('.zip') && (n.includes('windows-portable') || n.includes('_win'))
    })
    if (!asset) throw new Error('Windows zip アセットが見つかりません')

    const tempDir = os.tmpdir()
    const zipDest = path.join(tempDir, asset.name)
    const exePath = app.getPath('exe')
    const appDir = path.dirname(exePath)

    await downloadFile(asset.browser_download_url, zipDest, (progress) => {
        event.sender.send('download-progress', progress)
    })

    // PowerShell アップデートスクリプト生成
    const scriptPath = path.join(tempDir, 'reflectance-update.ps1')
    const pid = process.pid
    const zipPathEscaped = zipDest.replace(/'/g, "''")
    const exePathEscaped = exePath.replace(/'/g, "''")
    const destDirEscaped = appDir.replace(/'/g, "''")
    const tempExtractDir = path.join(tempDir, 'reflectance-update-extract')
    const tempExtractEscaped = tempExtractDir.replace(/'/g, "''")
    const exeName = path.basename(exePath)
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
        '}',
        'Start-Sleep -Seconds 1',
        'Remove-Item $zipPath -Force -ErrorAction SilentlyContinue',
        'Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue',
        'Remove-Item $scriptPath -Force -ErrorAction SilentlyContinue',
    ].join('\r\n')

    fs.writeFileSync(scriptPath, scriptContent, 'utf-8')

    // cmd /c start で完全に独立したプロセスとして起動（app.quit()に巻き込まれない）
    const ps = spawn('cmd.exe', [
        '/c', 'start', '""', 'powershell.exe',
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-WindowStyle', 'Hidden', '-File', scriptPath
    ], { detached: true, stdio: 'ignore' })
    ps.unref()

    app.quit()
})

// ---- ウィンドウ作成 ----

function createWindow() {
    const version = currentVersion ? ` (v${currentVersion})` : ''

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
        title: `Reflectance Spectra Viewer${version}`
    })

    // Content Security Policy の設定
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': isDev
                    ? ["default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:* data: blob:"]
                    : ["default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src blob:;"]
            }
        })
    })

    // 開発環境ではViteのdevサーバーに接続、本番ではビルドされたファイルを読み込み
    if (isDev) {
        const port = process.env.VITE_PORT || '5173'
        win.loadURL(`http://localhost:${port}`)
        win.webContents.openDevTools()
    } else {
        const indexPath = path.join(__dirname, '../dist/index.html')
        win.loadFile(indexPath)
        // 失敗時のみエラーを出す
        win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error('Failed to load:', errorCode, errorDescription)
        })
    }

    // HTMLの<title>タグによるウィンドウタイトル上書きを防止
    win.on('page-title-updated', (e) => e.preventDefault())

    // メニューバーを完全に撤去（Alt キーによる表示も抑止）
    win.setMenu(null)
}

app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
