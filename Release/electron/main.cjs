const { app, BrowserWindow } = require('electron')
const path = require('path')

// 開発環境かどうかの判定
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            // 本番では DevTools を無効化
            devTools: isDev,
        },
        title: 'Reflectance Spectra Viewer'
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
