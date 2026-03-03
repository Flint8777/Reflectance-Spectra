const { app, BrowserWindow } = require('electron')
const path = require('path')

// 開発環境かどうかの判定
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// 開発環境でのセキュリティ警告を抑制
if (isDev) {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
}

// WebGL/GPU を強制有効化（パッケージ版でのブラックリスト無視）
// 一部環境でGPUが無効化され、WebGLが利用不可になる問題への対処
try {
    // 新名称: ignore-gpu-blocklist（旧: ignore-gpu-blacklist）。両方設定しておく
    app.commandLine.appendSwitch('enable-webgl')
    app.commandLine.appendSwitch('ignore-gpu-blacklist')
    app.commandLine.appendSwitch('ignore-gpu-blocklist')
} catch (_) { /* noop */ }

function createWindow() {

    // package.jsonからversionを取得
    const fs = require('fs');
    const pkgPath = path.join(__dirname, '../package.json');
    let version = '';
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        version = pkg.version ? ` (v${pkg.version})` : '';
    } catch (e) {
        version = '';
    }
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            // 本番では DevTools を無効化
            devTools: isDev,
            // 明示的に WebGL を許可（将来のElectronでの互換性用）
            // 注: 現行ではこのフラグが未使用でも、起動スイッチで有効化される
            webgl: true,
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
                    : ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';"]
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

    // メニューバーを非表示（本番で余計なメニューを出さない）
    if (!isDev) {
        win.setMenuBarVisibility(false)
    }
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
