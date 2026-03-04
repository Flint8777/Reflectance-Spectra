const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    checkForUpdate: () => ipcRenderer.invoke('check-update'),
    downloadAndApplyUpdate: () => ipcRenderer.invoke('download-apply-update'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    onDownloadProgress: (cb) => {
        const handler = (_event, data) => cb(data)
        ipcRenderer.on('download-progress', handler)
        return () => ipcRenderer.removeListener('download-progress', handler)
    },
    getPlatform: () => ipcRenderer.invoke('get-platform'),
})
