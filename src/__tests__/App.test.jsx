import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import App from '../App.jsx'

describe('App', () => {
    it('renders application title', () => {
        render(<App />)
        const title = screen.getByText(/Reflectance/i)
        expect(title).toBeInTheDocument()
    })
})

describe('アップデート機能', () => {
    afterEach(() => {
        delete window.electronAPI
        vi.useRealTimers()
    })

    it('window.electronAPI が未定義のときアップデートボタンは表示されない', () => {
        delete window.electronAPI
        render(<App />)
        expect(screen.queryByTitle('Check for updates')).toBeNull()
    })

    it('window.electronAPI が定義されているときアップデートボタンが同期的に表示される', () => {
        window.electronAPI = {
            getPlatform: vi.fn().mockResolvedValue('win32'),
            checkForUpdate: vi.fn().mockResolvedValue({
                hasUpdate: false, currentVersion: '1.0.0', latestVersion: '1.0.0',
                releaseUrl: 'https://github.com/test/releases/latest',
            }),
            onDownloadProgress: vi.fn().mockReturnValue(() => {}),
        }
        render(<App />)
        expect(screen.getByTitle('Check for updates')).toBeInTheDocument()
    })

    it('ボタンクリックでダイアログが開きタイトルが表示される', async () => {
        window.electronAPI = {
            getPlatform: vi.fn().mockResolvedValue('win32'),
            checkForUpdate: vi.fn().mockResolvedValue({
                hasUpdate: true, currentVersion: '1.0.0', latestVersion: '2.0.0',
                releaseUrl: 'https://github.com/test/releases/latest',
            }),
            onDownloadProgress: vi.fn().mockReturnValue(() => {}),
        }
        render(<App />)
        fireEvent.click(screen.getByTitle('Check for updates'))
        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Check for updates' })).toBeInTheDocument()
        })
    })

    it('checkForUpdate の結果で最新バージョン番号がダイアログに表示される', async () => {
        window.electronAPI = {
            getPlatform: vi.fn().mockResolvedValue('win32'),
            checkForUpdate: vi.fn().mockResolvedValue({
                hasUpdate: true, currentVersion: '1.0.0', latestVersion: '2.0.0',
                releaseUrl: 'https://github.com/test/releases/latest',
            }),
            onDownloadProgress: vi.fn().mockReturnValue(() => {}),
        }
        render(<App />)
        fireEvent.click(screen.getByTitle('Check for updates'))
        await waitFor(() => {
            expect(screen.getByText(/2\.0\.0/)).toBeInTheDocument()
        })
    })

    it('起動3秒後の自動チェックで更新ありのときボタンタイトルが変わる', async () => {
        window.electronAPI = {
            getPlatform: vi.fn().mockResolvedValue('win32'),
            checkForUpdate: vi.fn().mockResolvedValue({
                hasUpdate: true, currentVersion: '1.0.0', latestVersion: '2.0.0',
                releaseUrl: 'https://github.com/test/releases/latest',
            }),
            onDownloadProgress: vi.fn().mockReturnValue(() => {}),
        }
        vi.useFakeTimers()
        render(<App />)
        await act(async () => {
            vi.advanceTimersByTime(3000)
        })
        vi.useRealTimers()
        await waitFor(() => {
            expect(screen.getByTitle('Update available')).toBeInTheDocument()
        }, { timeout: 3000 })
    })
})
