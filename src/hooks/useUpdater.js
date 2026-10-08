import { useCallback, useEffect, useState } from 'react';
import { cleanIpcErrorMessage } from '../components/dialogs.jsx';

// アップデートの状態とダイアログの開閉をまとめる。
// window.electronAPI が無い環境（ブラウザ版・テスト）では副作用を何もしない。
export function useUpdater() {
    const [updateStatus, setUpdateStatus] = useState('idle'); // 'idle'|'checking'|'available'|'downloading'|'downloaded'|'no-update'|'error'
    const [updateInfo, setUpdateInfo] = useState(null);
    const [downloadProgress, setDownloadProgress] = useState(null);
    const [updateError, setUpdateError] = useState(null);
    const [showUpdateDialog, setShowUpdateDialog] = useState(false);
    const [platform, setPlatform] = useState(null);

    // プラットフォーム取得 & 起動3秒後にアップデート自動チェック
    useEffect(() => {
        if (!window.electronAPI) return;
        window.electronAPI.getPlatform().then((p) => setPlatform(p));
        const timer = setTimeout(() => {
            window.electronAPI
                .checkForUpdate()
                .then((result) => {
                    setUpdateInfo(result);
                    setUpdateStatus(result.hasUpdate ? 'available' : 'idle');
                })
                .catch(() => {
                    /* バックグラウンドチェック失敗は無視 */
                });
        }, 3000);
        return () => clearTimeout(timer);
    }, []);

    // ダウンロード進捗リスナー
    useEffect(() => {
        if (!window.electronAPI) return;
        const cleanup = window.electronAPI.onDownloadProgress((data) => {
            setDownloadProgress(data);
        });
        return cleanup;
    }, []);

    // 更新の失敗通知。quitAndInstall は例外を投げないので、これが無いと
    // ダイアログが「ダウンロード中」のまま固まる
    useEffect(() => {
        if (!window.electronAPI?.onUpdateError) return;
        const cleanup = window.electronAPI.onUpdateError((message) => {
            setUpdateError(message);
            setUpdateStatus('error');
        });
        return cleanup;
    }, []);

    const handleCheckUpdate = useCallback(async () => {
        setShowUpdateDialog(true);
        if (
            updateStatus === 'available' ||
            updateStatus === 'no-update' ||
            updateStatus === 'downloading' ||
            updateStatus === 'downloaded'
        )
            return;
        setUpdateStatus('checking');
        try {
            const result = await window.electronAPI.checkForUpdate();
            setUpdateInfo(result);
            setUpdateStatus(result.hasUpdate ? 'available' : 'no-update');
        } catch (err) {
            setUpdateError(cleanIpcErrorMessage(err));
            setUpdateStatus('error');
        }
    }, [updateStatus]);

    const handleDownloadUpdate = useCallback(async () => {
        setUpdateStatus('downloading');
        setDownloadProgress(null);
        try {
            const result = await window.electronAPI.downloadAndApplyUpdate();
            // Windows は main.cjs 側で app.quit() が呼ばれる。
            // macOS は DMG を Finder で開いたところで戻ってくるので、置き換え手順を出す
            if (result?.kind === 'dmg') {
                setUpdateInfo((prev) => ({ ...prev, dmgPath: result.path }));
                setUpdateStatus('downloaded');
            }
        } catch (err) {
            setUpdateError(cleanIpcErrorMessage(err));
            setUpdateStatus('error');
        }
    }, []);

    return {
        updateStatus,
        updateInfo,
        downloadProgress,
        updateError,
        platform,
        showUpdateDialog,
        setShowUpdateDialog,
        handleCheckUpdate,
        handleDownloadUpdate,
    };
}
