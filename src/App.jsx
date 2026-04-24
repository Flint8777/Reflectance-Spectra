// RELAB .tabファイル判定関数
function isRelabTabFile(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 3) return false;
    // 先頭が整数
    if (!/^\d+$/.test(lines[0])) return false;
    // 2行目以降が「数値 空白 数値」または「数値 空白 数値 空白 数値」形式
    let dataLineCount = 0;
    for (let i = 1; i < lines.length; ++i) {
        if (/^[-+]?\d+(?:\.\d+)?\s+[-+]?\d+(?:\.\d+)?(?:\s+[-+]?\d+(?:\.\d+)?)?$/.test(lines[i])) {
            dataLineCount++;
        } else {
            break;
        }
    }
    // データ行数が先頭の整数と一致
    if (dataLineCount === parseInt(lines[0], 10)) return true;
    return false;
}


import React, { useCallback, useMemo, useRef, useState } from 'react'
import Plot from 'react-plotly.js'
import Papa from 'papaparse'

const palette = [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
    '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
]

const PRESET_LABELS = {
    'wavelength-reflectance': { x: 'Wavelength (μm)', y: 'Reflectance' },
    'spacing-intensity': { x: '2θ (°)', y: 'Intensity' },
    'time-temperature': { x: 'Time (s)', y: 'Temperature (°C)' },
}

// 指定した target の x に対応する y を線形補間で返す。範囲外は null。
export function findYatX(xs, ys, target) {
    if (!xs || !ys || xs.length === 0 || xs.length !== ys.length) return null
    const ascending = xs[0] <= xs[xs.length - 1]
    const xsArr = ascending ? xs : [...xs].reverse()
    const ysArr = ascending ? ys : [...ys].reverse()
    if (target < xsArr[0] || target > xsArr[xsArr.length - 1]) return null
    for (let i = 0; i < xsArr.length - 1; i++) {
        const x1 = xsArr[i]
        const x2 = xsArr[i + 1]
        if (target >= x1 && target <= x2) {
            if (x1 === x2) return ysArr[i]
            const t = (target - x1) / (x2 - x1)
            return ysArr[i] + t * (ysArr[i + 1] - ysArr[i])
        }
    }
    return null
}

// 最大値で y 配列を規格化（最大値が 0 または非有限のときはそのまま返す）
export function normalizeByMax(ys) {
    let max = -Infinity
    for (const v of ys) if (Number.isFinite(v) && v > max) max = v
    if (!Number.isFinite(max) || max === 0) return ys
    return ys.map(v => v / max)
}

// xRange 内の最大値で規格化。xRange が null なら全範囲を使用。
// 範囲内にデータ点が無い場合は null を返し、最大値が 0 のときはそのまま返す。
export function normalizeByMaxInRange(xs, ys, xRange) {
    if (!xs || !ys || xs.length !== ys.length) return null
    if (!xRange) return normalizeByMax(ys)
    const [xMin, xMax] = xRange[0] <= xRange[1] ? xRange : [xRange[1], xRange[0]]
    let max = -Infinity
    let foundInRange = false
    for (let i = 0; i < xs.length; i++) {
        const x = xs[i], y = ys[i]
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue
        if (x < xMin || x > xMax) continue
        foundInRange = true
        if (y > max) max = y
    }
    if (!foundInRange) return null
    if (!Number.isFinite(max) || max === 0) return ys
    return ys.map(v => v / max)
}

// y 配列を (y - min) / (max - min) で [0, 1] にスケール。形状（比率）を保つ。
export function scaleToUnit(ys) {
    if (!ys || !ys.length) return ys
    let mn = Infinity, mx = -Infinity
    for (const v of ys) {
        if (!Number.isFinite(v)) continue
        if (v < mn) mn = v
        if (v > mx) mx = v
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx)) return ys
    const range = mx - mn
    if (range === 0) return ys.map(() => 0)
    return ys.map(v => (v - mn) / range)
}

// xRange 内の min/max を基準に [0, 1] にスケール。xRange が null なら全範囲。
// 範囲内にデータが無い場合は null を返す。min==max のときは 0 の配列を返す。
export function scaleToUnitInRange(xs, ys, xRange) {
    if (!xs || !ys || xs.length !== ys.length) return null
    if (!xRange) return scaleToUnit(ys)
    const [xMin, xMax] = xRange[0] <= xRange[1] ? xRange : [xRange[1], xRange[0]]
    let mn = Infinity, mx = -Infinity
    let found = false
    for (let i = 0; i < xs.length; i++) {
        const x = xs[i], y = ys[i]
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue
        if (x < xMin || x > xMax) continue
        found = true
        if (y < mn) mn = y
        if (y > mx) mx = y
    }
    if (!found) return null
    const range = mx - mn
    if (range === 0) return ys.map(() => 0)
    return ys.map(v => (v - mn) / range)
}

// 指定 x の値で y 配列を規格化。範囲外や規格化値が 0 のときは null。
export function normalizeAtX(xs, ys, targetX) {
    const v = findYatX(xs, ys, targetX)
    if (v === null || !Number.isFinite(v) || v === 0) return null
    return ys.map(y => y / v)
}

function parseWhitespaceSeparated(text) {
    const lines = text.split(/\r?\n/)
    const xs = [], ys = []
    for (const ln of lines) {
        const t = ln.trim()
        if (!t || t.startsWith('#')) continue
        const cols = t.split(/\s+/).filter(Boolean)
        if (cols.length < 2) continue
        const x = parseFloat(cols[0]), y = parseFloat(cols[1])
        if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y) }
    }
    return { x: xs, y: ys }
}

function parseDPT(text) {
    const lines = text.split(/\r?\n/)
    const xs = []
    const ys = []
    for (const line of lines) {
        const t = line.trim()
        if (!t || t.startsWith('#')) continue
        // DPTファイルはカンマ区切り専用
        if (!t.includes(',')) continue
        const parts = t.split(',').map(p => p.trim()).filter(Boolean)
        if (parts.length < 2) continue
        const x = parseFloat(parts[0])
        const y = parseFloat(parts[1])
        if (Number.isFinite(x) && Number.isFinite(y)) {
            xs.push(x)
            ys.push(y)
        }
    }
    return { x: xs, y: ys }
}


function IconButton({ onClick, disabled, title, children }) {
    return (
        <button className='icon-button' onClick={onClick} disabled={disabled} title={title}>
            {children}
        </button>
    )
}

function AddFileIcon() {
    return (
        <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
            <polyline points='14 2 14 8 20 8' />
            <line x1='12' y1='18' x2='12' y2='12' />
            <line x1='9' y1='15' x2='15' y2='15' />
        </svg>
    )
}

function ClearIcon() {
    return (
        <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <polyline points='3 6 5 6 21 6' />
            <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
            <line x1='10' y1='11' x2='10' y2='17' />
            <line x1='14' y1='11' x2='14' y2='17' />
        </svg>
    )
}

function UnloadIcon() {
    return (
        <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
            <line x1='6' y1='6' x2='18' y2='18' />
            <line x1='18' y1='6' x2='6' y2='18' />
        </svg>
    )
}

function ZoomResetIcon() {
    return (
        <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <circle cx='11' cy='11' r='8' />
            <path d='m21 21-4.35-4.35' />
            <line x1='8' y1='11' x2='14' y2='11' />
            <line x1='11' y1='8' x2='11' y2='14' />
        </svg>
    )
}

function LabelIcon() {
    return (
        <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <line x1='4' y1='9' x2='20' y2='9' />
            <line x1='4' y1='15' x2='20' y2='15' />
            <line x1='10' y1='3' x2='8' y2='21' />
            <line x1='16' y1='3' x2='14' y2='21' />
        </svg>
    )
}

function ReflectanceSpectrumIcon() {
    return (
        <svg width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
            <path d='M3 18 L8 12 L12 15 L21 3' />
            <circle cx='3' cy='18' r='1.5' fill='currentColor' />
            <circle cx='8' cy='12' r='1.5' fill='currentColor' />
            <circle cx='12' cy='15' r='1.5' fill='currentColor' />
            <circle cx='21' cy='3' r='1.5' fill='currentColor' />
        </svg>
    )
}

function XRDIcon() {
    return (
        <svg width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
            {/* baseline (x-axis) */}
            <line x1='2' y1='20' x2='22' y2='20' strokeWidth='1.5' />
            {/* diffractogram-like peak pattern */}
            <path d='M2 20 L5 20 L6.2 10 L7.4 20 L10 20 L11 4 L12 20 L14.5 20 L15.5 13 L16.5 20 L19 20 L20 16 L21 20' />
        </svg>
    )
}

function ThermometerIcon() {
    return (
        <svg width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
            <path d='M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z' />
            <circle cx='12' cy='17' r='1.5' fill='currentColor' />
        </svg>
    )
}

function AutoDetectIcon() {
    return (
        <svg width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
            <circle cx='12' cy='12' r='3' fill='currentColor' />
            <path d='M12 1v6m0 6v6M23 12h-6m-6 0H1' />
            <circle cx='12' cy='12' r='9' />
        </svg>
    )
}

function RangeIcon() {
    return (
        <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <rect x='3' y='3' width='18' height='18' rx='2' ry='2' />
            <line x1='9' y1='9' x2='15' y2='9' />
            <line x1='9' y1='15' x2='15' y2='15' />
            <line x1='9' y1='9' x2='9' y2='15' />
            <line x1='15' y1='9' x2='15' y2='15' />
        </svg>
    )
}

function ApplyIcon() {
    return (
        <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <polyline points='20 6 9 17 4 12' />
        </svg>
    )
}

function ArrowUpIcon() {
    return (
        <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <path d='M12 5l-5 5' />
            <path d='M12 5l5 5' />
            <path d='M12 5v14' />
        </svg>
    )
}

function ArrowDownIcon() {
    return (
        <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <path d='M12 19l-5-5' />
            <path d='M12 19l5-5' />
            <path d='M12 5v14' />
        </svg>
    )
}

function NameIcon() {
    return (
        <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <path d='M4 16l4-8 4 8' />
            <path d='M5.5 13h4' />
            <rect x='14' y='6' width='6' height='12' rx='1' />
            <path d='M15 9h4M15 13h4' />
        </svg>
    )
}

function ExtIcon() {
    return (
        <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <rect x='3' y='3' width='14' height='18' rx='2' />
            <path d='M17 7l4 4-4 4' />
            <line x1='6' y1='9' x2='12' y2='9' />
            <line x1='6' y1='13' x2='12' y2='13' />
        </svg>
    )
}

function CustomOrderIcon() {
    return (
        <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <circle cx='8' cy='6' r='1' fill='currentColor' />
            <circle cx='16' cy='6' r='1' fill='currentColor' />
            <circle cx='8' cy='12' r='1' fill='currentColor' />
            <circle cx='16' cy='12' r='1' fill='currentColor' />
            <circle cx='8' cy='18' r='1' fill='currentColor' />
            <circle cx='16' cy='18' r='1' fill='currentColor' />
        </svg>
    )
}

function AutoFitYIcon() {
    return (
        <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <rect x='4' y='4' width='16' height='16' rx='2' />
            <line x1='8' y1='8' x2='8' y2='16' />
            <polyline points='5 10 8 8 11 10' />
            <polyline points='5 14 8 16 11 14' />
            <path d='M14 12 L19 12' opacity='0.5' strokeDasharray='2 2' />
        </svg>
    )
}

function StackIcon() {
    return (
        <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <path d='M3 17 L8 12 L12 14 L21 7' />
            <path d='M3 12 L8 7 L12 9 L21 2' opacity='0.55' />
            <path d='M3 22 L8 17 L12 19 L21 12' opacity='0.55' />
        </svg>
    )
}

function NormalizeIcon() {
    return (
        <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <path d='M3 20 L3 4' />
            <path d='M3 20 L21 20' />
            <path d='M5 16 L10 9 L14 13 L20 5' />
            <line x1='3' y1='8' x2='5' y2='8' strokeDasharray='2 2' />
        </svg>
    )
}

function UpdateIcon() {
    return (
        <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <polyline points='23 4 23 10 17 10' />
            <polyline points='1 20 1 14 7 14' />
            <path d='M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' />
        </svg>
    )
}

function NoticeBanner({ notice, onClose }) {
    if (!notice) return null
    return (
        <div className={`notice-banner notice-${notice.type}`}>
            <span className='notice-message'>{notice.message}</span>
            {notice.actionLabel && notice.actionFn && (
                <button className='notice-action' onClick={notice.actionFn}>{notice.actionLabel}</button>
            )}
            <button className='notice-close' onClick={onClose} title='Dismiss'>×</button>
        </div>
    )
}

function ConfirmDialog({ title, body, confirmLabel, cancelLabel, danger, onConfirm, onCancel }) {
    React.useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); onCancel() }
            else if (e.key === 'Enter') { e.preventDefault(); onConfirm() }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onConfirm, onCancel])

    return (
        <div className='dialog-overlay'>
            <div className='dialog-box confirm-dialog'>
                <h3>{title}</h3>
                <p className='confirm-body'>{body}</p>
                <div className='dialog-actions'>
                    <button className='cancel-btn' onClick={onCancel}>{cancelLabel || 'Cancel'}</button>
                    <button className={danger ? 'danger-btn' : 'apply-btn'} onClick={onConfirm}>{confirmLabel}</button>
                </div>
            </div>
        </div>
    )
}

function NormalizationDialog({ mode, wavelength, maxScope, xLabel, onApply, onCancel }) {
    const [selectedMode, setSelectedMode] = useState(mode || 'none')
    const [wlInput, setWlInput] = useState(String(wavelength ?? 2.0))
    const [selectedMaxScope, setSelectedMaxScope] = useState(maxScope || 'view')
    const [error, setError] = useState('')

    const unitHint = (() => {
        const m = String(xLabel || '').match(/\(([^)]+)\)/)
        return m ? m[1] : ''
    })()

    const apply = () => {
        if (selectedMode === 'wavelength') {
            const wl = parseFloat(wlInput)
            if (!Number.isFinite(wl) || wl <= 0) {
                setError('Please enter a positive number')
                return
            }
            onApply({ mode: 'wavelength', wavelength: wl })
            return
        }
        if (selectedMode === 'max') {
            onApply({ mode: 'max', maxScope: selectedMaxScope })
            return
        }
        if (selectedMode === 'minmax') {
            onApply({ mode: 'minmax', maxScope: selectedMaxScope })
            return
        }
        onApply({ mode: 'none' })
    }

    return (
        <div className='dialog-overlay'>
            <div className='dialog-box'>
                <h3>Normalize spectra</h3>
                <p>Apply the same normalization to all spectra in the current view.</p>
                <div className='norm-options'>
                    <label className='norm-option'>
                        <input type='radio' name='norm-mode' checked={selectedMode === 'none'} onChange={() => { setSelectedMode('none'); setError('') }} />
                        <span>No normalization</span>
                    </label>
                    <label className='norm-option'>
                        <input type='radio' name='norm-mode' checked={selectedMode === 'wavelength'} onChange={() => { setSelectedMode('wavelength'); setError('') }} />
                        <span>Normalize at x =</span>
                        <input
                            type='number'
                            step='any'
                            value={wlInput}
                            onChange={e => { setWlInput(e.target.value); setSelectedMode('wavelength'); setError('') }}
                            onFocus={() => setSelectedMode('wavelength')}
                            style={{ width: 90, marginLeft: 8, padding: '4px 6px' }}
                        />
                        {unitHint && <span style={{ marginLeft: 4, color: '#666' }}>{unitHint}</span>}
                    </label>
                    <label className='norm-option'>
                        <input type='radio' name='norm-mode' checked={selectedMode === 'max'} onChange={() => { setSelectedMode('max'); setError('') }} />
                        <span>Normalize by max (y / max)</span>
                    </label>
                    <label className='norm-option'>
                        <input type='radio' name='norm-mode' checked={selectedMode === 'minmax'} onChange={() => { setSelectedMode('minmax'); setError('') }} />
                        <span>Min-Max normalize (min→0, max→1)</span>
                    </label>
                    {(selectedMode === 'max' || selectedMode === 'minmax') && (
                        <div className='norm-suboptions'>
                            <div className='norm-suboptions-title'>Reference range</div>
                            <label>
                                <input
                                    type='radio'
                                    name='norm-max-scope'
                                    checked={selectedMaxScope === 'view'}
                                    onChange={() => setSelectedMaxScope('view')}
                                />
                                <span>Use {selectedMode === 'minmax' ? 'min/max' : 'max'} in view</span>
                            </label>
                            <label>
                                <input
                                    type='radio'
                                    name='norm-max-scope'
                                    checked={selectedMaxScope === 'all'}
                                    onChange={() => setSelectedMaxScope('all')}
                                />
                                <span>Use {selectedMode === 'minmax' ? 'min/max' : 'max'} in full range</span>
                            </label>
                        </div>
                    )}
                </div>
                {error && <div style={{ color: '#c00', fontSize: 13, marginTop: 8 }}>{error}</div>}
                <div className='dialog-actions'>
                    <button className='cancel-btn' onClick={onCancel}>Cancel</button>
                    <button className='apply-btn' onClick={apply}>Apply</button>
                </div>
            </div>
        </div>
    )
}

function StackDialog({ gap, onGapChange, onDisable, onClose }) {
    return (
        <div className='dialog-overlay'>
            <div className='dialog-box'>
                <h3>Stack display</h3>
                <p>Scale each spectrum to the same height and stack them vertically.</p>
                <div className='norm-options'>
                    <div className='norm-suboptions'>
                        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                            <span>Gap between spectra</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 12, color: '#666' }}>Tight</span>
                                <input
                                    type='range'
                                    min='0'
                                    max='2'
                                    step='0.05'
                                    value={gap}
                                    onChange={e => onGapChange(parseFloat(e.target.value))}
                                    style={{ flex: 1 }}
                                />
                                <span style={{ fontSize: 12, color: '#666' }}>Wide</span>
                            </div>
                        </label>
                    </div>
                </div>
                <div className='dialog-actions'>
                    <button className='danger-btn' onClick={onDisable}>Disable</button>
                    <button className='apply-btn' onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    )
}

function UpdateDialog({ status, info, progress, platform, onDownload, onOpenBrowser, onClose }) {
    return (
        <div className='dialog-overlay'>
            <div className='dialog-box'>
                <h3>Check for updates</h3>
                {status === 'checking' && <p>Checking...</p>}
                {status === 'available' && (
                    <>
                        <p>A new version is available.</p>
                        <p style={{ fontSize: 13, color: '#555' }}>
                            Current: v{info.currentVersion} &rarr; Latest: v{info.latestVersion}
                        </p>
                        <div className='dialog-actions'>
                            <button className='cancel-btn' onClick={onClose}>Later</button>
                            {platform === 'win32'
                                ? <button className='apply-btn' onClick={onDownload}>Download &amp; apply</button>
                                : <button className='apply-btn' onClick={onOpenBrowser}>Open release page</button>
                            }
                        </div>
                    </>
                )}
                {status === 'downloading' && (
                    <>
                        <p>Downloading... {progress?.percent ?? 0}%</p>
                        <div style={{ width: '100%', background: '#eee', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                            <div style={{ width: `${progress?.percent ?? 0}%`, background: '#4a9eff', height: '100%', borderRadius: 4, transition: 'width 0.2s' }} />
                        </div>
                        <p style={{ fontSize: 12, color: '#777', marginTop: 8 }}>The app will restart after download completes.</p>
                    </>
                )}
                {status === 'no-update' && (
                    <>
                        <p>You have the latest version. (v{info?.currentVersion})</p>
                        <div className='dialog-actions'>
                            <button className='cancel-btn' onClick={onClose}>Close</button>
                        </div>
                    </>
                )}
                {status === 'error' && (
                    <>
                        <p style={{ color: '#c00' }}>An error occurred while checking.</p>
                        <div className='dialog-actions'>
                            <button className='cancel-btn' onClick={onClose}>Close</button>
                            {info?.releaseUrl && <button className='apply-btn' onClick={onOpenBrowser}>Open release page</button>}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default function App() {
    const [traces, setTraces] = useState([])
    const [filesInfo, setFilesInfo] = useState([])
    const [visibility, setVisibility] = useState([])
    // 簡易グループ機能: グループ配列と各トレースの所属(groupId)、現在表示グループ
    const [groups, setGroups] = useState([
        { id: '1', name: 'Group 1' },
        { id: '2', name: 'Group 2' },
    ])
    const [activeGroupId, setActiveGroupId] = useState('1')
    const [traceGroupIds, setTraceGroupIds] = useState([])
    // グループの表示状態トグル（Show/Hide）
    const [groupToggleState, setGroupToggleState] = useState({ '1': 'show', '2': 'show' })
    const [groupContextMenu, setGroupContextMenu] = useState({ visible: false, x: 0, y: 0, groupId: null })
    const [xRange, setXRange] = useState(null)
    const [yRange, setYRange] = useState(null)
    const [cross, setCross] = useState({ x: null, y: null })
    const [relabMeta, setRelabMeta] = useState({})
    const plotRef = useRef(null)
    const animFrame = useRef(0)
    // 次のカラーインデックスをトラックし、複数回の追加でも重複しないようにする
    // グループごとの独立カラーカウンタ: { [groupId]: nextPaletteIdx }
    // グループが空になったら該当キーを削除して次回 0 から再スタート
    const groupColorCountersRef = useRef({})

    const [xLabel, setXLabel] = useState('Wavelength (μm)')
    const [yLabel, setYLabel] = useState('Reflectance')
    const [headerCandidates, setHeaderCandidates] = useState([])
    const [showHeaderDialog, setShowHeaderDialog] = useState(false)
    // これまでにユーザーが選択 / 却下したヘッダー組（再問合せ抑制）
    const [seenHeaders, setSeenHeaders] = useState([])
    const [showLabelDialog, setShowLabelDialog] = useState(false)
    const [presetSelected, setPresetSelected] = useState(null)
    const [showPresetDialog, setShowPresetDialog] = useState(true)
    const [lockedLabels, setLockedLabels] = useState(false)
    const [unitQueryFiles, setUnitQueryFiles] = useState([])
    const [unitDialogVisible, setUnitDialogVisible] = useState(false)
    const [unitSelections, setUnitSelections] = useState([]) // 'nm' or 'um' per file
    const [immediateReflectanceFiles, setImmediateReflectanceFiles] = useState([])
    const [xMinInput, setXMinInput] = useState('')
    const [xMaxInput, setXMaxInput] = useState('')
    const [yMinInput, setYMinInput] = useState('')
    const [yMaxInput, setYMaxInput] = useState('')
    const [isDraggingFiles, setIsDraggingFiles] = useState(false)
    // Plotly 自身のズーム状態: onRelayout が発火しないケースも捕捉するため、直接監視する
    const [plotIsZoomed, setPlotIsZoomed] = useState(false)
    const [legendSortKey, setLegendSortKey] = useState('filename') // 'filename' | 'ext' | 'custom'
    const [legendSortOrder, setLegendSortOrder] = useState('asc') // 'asc' | 'desc'
    const [dragOverLegend, setDragOverLegend] = useState(null) // { idx, position: 'before'|'after' } | null

    // 規格化関連: 'none' | 'wavelength' | 'max'
    const [normalizationMode, setNormalizationMode] = useState('none')
    const [normalizationWavelength, setNormalizationWavelength] = useState(2.0)
    // 最大値規格化の参照範囲: 'view'（表示範囲内）| 'all'（全範囲）
    const [normalizationMaxScope, setNormalizationMaxScope] = useState('view')
    const [showNormalizationDialog, setShowNormalizationDialog] = useState(false)

    // 確認ダイアログ（Unload All / Close Group 共通）
    const [confirmState, setConfirmState] = useState(null)

    // 通知バナー: { type: 'warning'|'error'|'info', message: string, id: number } | null
    const [notice, setNotice] = useState(null)

    // スタック表示関連: 各スペクトルを単位高さにスケールして縦にオフセットする
    const [stackEnabled, setStackEnabled] = useState(false)
    const [stackGap, setStackGap] = useState(0)
    const [showStackDialog, setShowStackDialog] = useState(false)

    // アップデート関連
    const [updateStatus, setUpdateStatus] = useState('idle') // 'idle'|'checking'|'available'|'downloading'|'no-update'|'error'
    const [updateInfo, setUpdateInfo] = useState(null)
    const [downloadProgress, setDownloadProgress] = useState(null)
    const [showUpdateDialog, setShowUpdateDialog] = useState(false)
    const [platform, setPlatform] = useState(null)

    const onRelayout = useCallback((ev) => {
        const haveX = ev['xaxis.range[0]'] !== undefined && ev['xaxis.range[1]'] !== undefined
        const haveY = ev['yaxis.range[0]'] !== undefined && ev['yaxis.range[1]'] !== undefined
        if (haveX) setXRange([Number(ev['xaxis.range[0]']), Number(ev['xaxis.range[1]'])])
        if (haveY) setYRange([Number(ev['yaxis.range[0]']), Number(ev['yaxis.range[1]'])])
    }, [])

    const parseAndAddFiles = useCallback((files, unitOverride = null) => {
        if (!files || !files.length) return
        const newTraces = []
        const newInfos = []
        const newGroupIds = []
        const detectedHeaders = []

        // パース完了は非同期順なのでここでは色を割り当てず、後でファイル名昇順に確定する
        const addTrace = (x, y, file, header) => {
            newTraces.push({ x, y, type: 'scattergl', mode: 'lines', line: { width: 1.5 }, name: file.name })
            newInfos.push(file.name)
            newGroupIds.push(activeGroupId)
            detectedHeaders.push(header)
        }

        const tasks = files.map(file => new Promise(resolve => {
            const lname = file.name.toLowerCase()
            const ext = lname.split('.').pop()
            const reader = new FileReader()
            reader.onload = () => {
                const text = String(reader.result)
                const lines = text.split(/\r?\n/)

                const isTimeTemp = lines.length > 1 && lines[1].trim().includes('This document contains measurement data of the following devices:')
                if (isTimeTemp) {
                    const headerIdx = lines.findIndex(l => l.includes('No.') && l.includes('Date') && l.includes('Temperature'))
                    if (headerIdx === -1) { resolve(); return }
                    const headerLine = lines[headerIdx]
                    const headers = headerLine.split('\t').map(h => h.trim())
                    const dataLines = lines.slice(headerIdx + 2).filter(l => l.trim())
                    const xIdx = headers.findIndex(h => h.includes('Sec.') && h.includes('00:00'))
                    const yIdx = headers.findIndex(h => h === 'Temperature')
                    if (xIdx === -1 || yIdx === -1) { resolve(); return }
                    const x = []; const y = []
                    for (const dl of dataLines) {
                        const cols = dl.split('\t').map(c => c.trim())
                        const xv = Number(cols[xIdx]); const yv = Number(cols[yIdx])
                        if (Number.isFinite(xv) && Number.isFinite(yv)) { x.push(xv); y.push(yv) }
                    }
                    if (x.length) { const start = x[0]; for (let i = 0; i < x.length; i++) x[i] -= start }
                    addTrace(x, y, file, PRESET_LABELS['time-temperature'])
                    if (!lockedLabels) { setXLabel(PRESET_LABELS['time-temperature'].x); setYLabel(PRESET_LABELS['time-temperature'].y) }
                    resolve(); return
                }

                if (ext === 'csv') {
                    const nonEmpty = lines.filter(Boolean)
                    if (!nonEmpty.length) { resolve(); return }
                    const firstParsed = Papa.parse(nonEmpty[0], { header: false }).data[0]
                    let hasHeader = false; let headerX = null; let headerY = null
                    if (firstParsed && firstParsed.length >= 2) {
                        const v0 = Number(firstParsed[0]); const v1 = Number(firstParsed[1])
                        if (!Number.isFinite(v0) || !Number.isFinite(v1)) { hasHeader = true; headerX = String(firstParsed[0]).trim(); headerY = String(firstParsed[1]).trim() }
                    }
                    Papa.parse(text, {
                        header: hasHeader,
                        dynamicTyping: true,
                        skipEmptyLines: true,
                        complete: res => {
                            const x = []; const y = []
                            if (hasHeader && res.data.length) {
                                const fields = Object.keys(res.data[0])
                                const xKey = fields[0]; const yKey = fields[1] || fields[0]
                                for (const row of res.data) {
                                    const xv = Number(row[xKey]); const yv = Number(row[yKey])
                                    if (Number.isFinite(xv) && Number.isFinite(yv)) { x.push(xv); y.push(yv) }
                                }
                            } else {
                                for (const row of res.data) {
                                    if (!row || row.length < 2) continue
                                    const xv = Number(row[0]); const yv = Number(row[1])
                                    if (Number.isFinite(xv) && Number.isFinite(yv)) { x.push(xv); y.push(yv) }
                                }
                            }
                            const xData = (presetSelected === 'wavelength-reflectance' && unitOverride === 'nm') ? x.map(v => v / 1000) : x
                            addTrace(xData, y, file, hasHeader ? { xLabel: headerX, yLabel: headerY } : null)
                            resolve()
                        }
                    })
                    return
                }

                if (ext === 'xml') {
                    try { const meta = extractRelabMeta(text); if (meta && meta.tabFileName) setRelabMeta(prev => ({ ...prev, [meta.tabFileName.toLowerCase()]: meta })) } catch { }
                    resolve(); return
                }

                if (ext === 'tab') {
                    const meta = relabMeta[lname]
                    let x = [], y = [];
                    if (meta) {
                        try {
                            const p = parseRelabTab(text, meta); x = p.x; y = p.y;
                        } catch {
                            const fb = parseDPT(text); x = fb.x; y = fb.y;
                        }
                    } else if (isRelabTabFile(text)) {
                        // ここで簡易パースを直接実装
                        const lines = text.split(/\r?\n/).map(l => l.trim());
                        const n = parseInt(lines[0], 10);
                        for (let i = 1; i <= n && i < lines.length; ++i) {
                            const t = lines[i];
                            if (!t) continue;
                            const m = t.match(/^\s*([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)(?:\s+[-+]?\d+(?:\.\d+)?)?\s*$/);
                            if (m) {
                                const xv = parseFloat(m[1]);
                                const yv = parseFloat(m[2]);
                                if (Number.isFinite(xv) && Number.isFinite(yv)) {
                                    x.push(xv); y.push(yv);
                                }
                            }
                        }
                    } else {
                        const fb = parseDPT(text); x = fb.x; y = fb.y;
                    }
                    // ルール: RELAB TABはnm保存なのでμmへ変換（1/1000）。
                    // 上記はXMLメタあり/なし双方に適用。
                    if (x.length) x = x.map(v => v / 1000);
                    addTrace(x, y, file, PRESET_LABELS['wavelength-reflectance'])
                    if (!lockedLabels) { setXLabel(PRESET_LABELS['wavelength-reflectance'].x); setYLabel(PRESET_LABELS['wavelength-reflectance'].y) }
                    resolve(); return;
                }

                if (ext === 'dpt') {
                    const { x, y } = parseDPT(text)
                    if (!x.length) { resolve(); return }
                    addTrace(x, y, file, PRESET_LABELS['wavelength-reflectance'])
                    if (!lockedLabels) { setXLabel(PRESET_LABELS['wavelength-reflectance'].x); setYLabel(PRESET_LABELS['wavelength-reflectance'].y) }
                    resolve(); return
                }

                if (ext === 'asc') {
                    const { x, y } = parseWhitespaceSeparated(text)
                    if (!x.length) { resolve(); return }
                    addTrace(x, y, file, PRESET_LABELS['spacing-intensity'])
                    if (!lockedLabels) { setXLabel(PRESET_LABELS['spacing-intensity'].x); setYLabel(PRESET_LABELS['spacing-intensity'].y) }
                    resolve(); return
                }

                const { x, y } = parseWhitespaceSeparated(text)
                const xData = (presetSelected === 'wavelength-reflectance' && unitOverride === 'nm') ? x.map(v => v / 1000) : x
                addTrace(xData, y, file, null)
                resolve()
            }
            reader.readAsText(file)
        }))

        Promise.all(tasks).then(() => {
            // 1) ファイル名昇順に色を割り当て（グループ別カラーカウンタを進める）
            const ascIndices = newInfos.map((_, i) => i).sort((a, b) => {
                const fa = String(newInfos[a]).toLowerCase()
                const fb = String(newInfos[b]).toLowerCase()
                return fa < fb ? -1 : fa > fb ? 1 : 0
            })
            for (const i of ascIndices) {
                const gid = newGroupIds[i]
                const cIdx = groupColorCountersRef.current[gid] ?? 0
                groupColorCountersRef.current[gid] = cIdx + 1
                newTraces[i] = { ...newTraces[i], line: { ...newTraces[i].line, color: palette[cIdx % palette.length] } }
            }
            // 2) 内部配列の順序はファイル名の降順（既存の挙動を維持）
            const indices = newInfos.map((_, i) => i)
            indices.sort((a, b) => {
                const fa = String(newInfos[a]).toLowerCase()
                const fb = String(newInfos[b]).toLowerCase()
                if (fa < fb) return 1
                if (fa > fb) return -1
                return 0
            })
            const sortedTraces = indices.map(i => newTraces[i])
            const sortedInfos = indices.map(i => newInfos[i])
            const sortedGroupIds = indices.map(i => newGroupIds[i])
            const sortedHeaders = indices.map(i => detectedHeaders[i])

            // wavenumber ヘッダーを含むトレースの位置 (sorted 配列内)
            const wnIndices = []
            for (let i = 0; i < sortedHeaders.length; i++) {
                const h = sortedHeaders[i]
                if (h && /wavenumber/i.test(h.xLabel)) wnIndices.push(i)
            }

            const commit = (convertWavenumber) => {
                const finalTraces = convertWavenumber && wnIndices.length
                    ? sortedTraces.map((t, i) => {
                        if (!wnIndices.includes(i)) return t
                        const newX = t.x.map(v => (Number.isFinite(v) && v !== 0) ? 10000 / v : NaN)
                        return { ...t, x: newX }
                    })
                    : sortedTraces

                setTraces(prev => [...prev, ...finalTraces])
                setFilesInfo(prev => [...prev, ...sortedInfos])
                setVisibility(prev => [...prev, ...finalTraces.map(() => true)])
                setTraceGroupIds(prev => [...prev, ...sortedGroupIds])

                // ヘッダー処理: 変換した場合は wavenumber → Wavelength (μm) 相当に置換
                if (!lockedLabels) {
                    const effHeaders = sortedHeaders.map(h => {
                        if (!h) return h
                        if (convertWavenumber && /wavenumber/i.test(h.xLabel)) {
                            return { xLabel: 'Wavelength (μm)', yLabel: h.yLabel }
                        }
                        return h
                    })
                    const valid = effHeaders.filter(h => h)
                    if (valid.length) {
                        const unique = []
                        for (const h of valid) if (!unique.find(u => u.xLabel === h.xLabel && u.yLabel === h.yLabel)) unique.push(h)
                        const isCurrent = (h) => h.xLabel === xLabel && h.yLabel === yLabel
                        const isSeen = (h) => seenHeaders.some(s => s.xLabel === h.xLabel && s.yLabel === h.yLabel)
                        const novel = unique.filter(h => !isCurrent(h) && !isSeen(h))
                        if (novel.length === 1) {
                            setXLabel(novel[0].xLabel); setYLabel(novel[0].yLabel)
                            setSeenHeaders(prev => [...prev, novel[0]])
                        } else if (novel.length > 1) {
                            setHeaderCandidates(novel); setShowHeaderDialog(true)
                        }
                    }
                }
                const addedNames = new Set(sortedInfos)
                const failedNames = files
                    .filter(f => {
                        const ext = f.name.toLowerCase().split('.').pop()
                        if (ext === 'xml') return false
                        return !addedNames.has(f.name)
                    })
                    .map(f => f.name)
                if (failedNames.length > 0) {
                    const msg = failedNames.length === 1
                        ? `Failed to parse: ${failedNames[0]}`
                        : `Failed to parse ${failedNames.length} files: ${failedNames.join(', ')}`
                    setNotice({ type: 'error', message: msg, id: Date.now() })
                }
                setXRange(null); setYRange(null)
            }

            if (wnIndices.length > 0) {
                const n = wnIndices.length
                setConfirmState({
                    title: 'Convert Wavenumber to Wavelength?',
                    body: `${n} ${n === 1 ? 'file has' : 'files have'} a Wavenumber header.\nConvert X values from cm⁻¹ to Wavelength (μm) using λ = 10000 / ν?`,
                    confirmLabel: 'Convert',
                    cancelLabel: 'Keep as-is',
                    danger: false,
                    onConfirm: () => commit(true),
                    onDismiss: () => commit(false),
                })
            } else {
                commit(false)
            }
        })
    }, [relabMeta, lockedLabels, presetSelected, activeGroupId, xLabel, yLabel, seenHeaders])

    const classifyAndAddFiles = useCallback((files) => {
        if (!files.length) return
        if (presetSelected !== 'wavelength-reflectance') { parseAndAddFiles(files); return }
        const immediate = []; const needsUnit = []
        for (const f of files) {
            const ext = f.name.toLowerCase().split('.').pop()
            if (ext === 'tab' || ext === 'dpt' || ext === 'xml') immediate.push(f)
            else needsUnit.push(f)
        }
        if (needsUnit.length) {
            setUnitQueryFiles(needsUnit)
            setUnitSelections(needsUnit.map(() => 'um'))
            setUnitDialogVisible(true)
            setImmediateReflectanceFiles(immediate)
        } else {
            parseAndAddFiles(immediate)
        }
    }, [presetSelected, parseAndAddFiles])

    const handleFiles = useCallback((e) => {
        classifyAndAddFiles(Array.from(e.target.files || []))
    }, [classifyAndAddFiles])

    const toggleVisibility = useCallback((idx) => { setVisibility(prev => { const next = [...prev]; next[idx] = !next[idx]; return next }) }, [])
    const clearAll = useCallback(() => {
        if (!traces.length) return
        setConfirmState({
            title: 'Unload all spectra?',
            body: 'All loaded spectra will be unloaded from the viewer.',
            confirmLabel: 'Unload',
            danger: true,
            onConfirm: () => {
                setTraces([]); setFilesInfo([]); setVisibility([]); setTraceGroupIds([])
                setXRange(null); setYRange(null)
                setRelabMeta({})
                groupColorCountersRef.current = {}
            }
        })
    }, [traces.length])
    const resetZoom = useCallback(() => {
        setXRange(null); setYRange(null)
        // Plotly 内部 autorange も明示的に戻す（onRelayout 経由で state が更新されないケースに備え）
        const plotEl = plotRef.current?.el
        if (plotEl && window.Plotly) {
            try { window.Plotly.relayout(plotEl, { 'xaxis.autorange': true, 'yaxis.autorange': true }) } catch { }
        }
        setPlotIsZoomed(false)
    }, [])

    // 凡例のドラッグ＆ドロップ並び替え: 全並列配列を同じ順で並べ替え、custom モードへ自動切替
    const reorderLegendItem = useCallback((fromIdx, toIdx, position) => {
        if (fromIdx === toIdx) return
        const move = (arr) => {
            const next = [...arr]
            const item = next[fromIdx]
            next.splice(fromIdx, 1)
            let insertIdx = toIdx
            if (fromIdx < toIdx) insertIdx -= 1
            if (position === 'after') insertIdx += 1
            next.splice(insertIdx, 0, item)
            return next
        }
        setTraces(prev => move(prev))
        setFilesInfo(prev => move(prev))
        setVisibility(prev => move(prev))
        setTraceGroupIds(prev => move(prev))
        setLegendSortKey('custom')
    }, [])

    const applyInlineRange = useCallback((axis) => {
        const parseOrNull = (s) => {
            const t = String(s ?? '').trim()
            if (t === '') return null
            const v = parseFloat(t)
            return Number.isFinite(v) ? v : null
        }
        const fullLayout = plotRef.current?.el?._fullLayout
        const label = axis.toUpperCase()
        if (axis === 'x') {
            const cur = fullLayout?.xaxis?.range
            const minVal = parseOrNull(xMinInput)
            const maxVal = parseOrNull(xMaxInput)
            const min = minVal != null ? minVal : (cur ? Number(cur[0]) : null)
            const max = maxVal != null ? maxVal : (cur ? Number(cur[1]) : null)
            if (Number.isFinite(min) && Number.isFinite(max) && min < max) {
                setXRange([min, max])
            } else {
                setNotice({ type: 'warning', message: `Invalid ${label} range: minimum must be less than maximum.`, id: Date.now() })
            }
        } else if (axis === 'y') {
            const cur = fullLayout?.yaxis?.range
            const minVal = parseOrNull(yMinInput)
            const maxVal = parseOrNull(yMaxInput)
            const min = minVal != null ? minVal : (cur ? Number(cur[0]) : null)
            const max = maxVal != null ? maxVal : (cur ? Number(cur[1]) : null)
            if (Number.isFinite(min) && Number.isFinite(max) && min < max) {
                setYRange([min, max])
            } else {
                setNotice({ type: 'warning', message: `Invalid ${label} range: minimum must be less than maximum.`, id: Date.now() })
            }
        }
    }, [xMinInput, xMaxInput, yMinInput, yMaxInput])

    const handleRangeKeyDown = useCallback((axis, e) => {
        if (e.key === 'Enter') {
            applyInlineRange(axis)
        }
    }, [applyInlineRange])



    const changeColor = useCallback((idx) => {
        setTraces(prev => {
            const input = document.createElement('input'); input.type = 'color'
            input.value = prev[idx]?.line?.color || '#000000'
            input.onchange = e => {
                const c = e.target.value
                setTraces(p => { const next = [...p]; next[idx] = { ...next[idx], line: { ...next[idx].line, color: c } }; return next })
            }
            input.click()
            return prev
        })
    }, [])

    // カラーサイクル上の次の色へ遷移（palette 外の色からは palette[0] へ）
    const cycleColor = useCallback((idx) => {
        setTraces(prev => {
            const cur = prev[idx]?.line?.color
            const curIdx = palette.indexOf(cur)
            const nextIdx = curIdx === -1 ? 0 : (curIdx + 1) % palette.length
            const next = [...prev]
            next[idx] = { ...next[idx], line: { ...next[idx].line, color: palette[nextIdx] } }
            return next
        })
    }, [])

    // シングルクリック=次の色 / ダブルクリック=カラーピッカー。クリックタイマー管理
    const colorClickTimerRef = useRef({})
    const handleColorClick = useCallback((idx) => {
        if (colorClickTimerRef.current[idx]) clearTimeout(colorClickTimerRef.current[idx])
        colorClickTimerRef.current[idx] = setTimeout(() => {
            cycleColor(idx)
            delete colorClickTimerRef.current[idx]
        }, 250)
    }, [cycleColor])
    const handleColorDoubleClick = useCallback((idx) => {
        if (colorClickTimerRef.current[idx]) {
            clearTimeout(colorClickTimerRef.current[idx])
            delete colorClickTimerRef.current[idx]
        }
        changeColor(idx)
    }, [changeColor])

    // 規格化を適用した派生トレース
    const normalizedTraces = useMemo(() => {
        if (normalizationMode === 'none') return traces
        return traces.map(t => {
            if (!t.y || !t.y.length) return t
            if (normalizationMode === 'max') {
                const scopeRange = normalizationMaxScope === 'view' ? xRange : null
                const newY = normalizeByMaxInRange(t.x, t.y, scopeRange)
                if (!newY || newY === t.y) return t
                return { ...t, y: newY }
            }
            if (normalizationMode === 'minmax') {
                const scopeRange = normalizationMaxScope === 'view' ? xRange : null
                const newY = scaleToUnitInRange(t.x, t.y, scopeRange)
                if (!newY || newY === t.y) return t
                return { ...t, y: newY }
            }
            if (normalizationMode === 'wavelength') {
                const newY = normalizeAtX(t.x, t.y, normalizationWavelength)
                if (!newY) return t
                return { ...t, y: newY }
            }
            return t
        })
    }, [traces, normalizationMode, normalizationWavelength, normalizationMaxScope, xRange])

    // 現在のグループで表示中のインデックス一覧（挿入順）
    const visibleIndices = useMemo(() => {
        const out = []
        for (let i = 0; i < normalizedTraces.length; i++) {
            if (visibility[i] !== false && traceGroupIds[i] === activeGroupId) out.push(i)
        }
        return out
    }, [normalizedTraces, visibility, traceGroupIds, activeGroupId])

    // 現在のグループのみ表示 + スタック適用（単位高さにスケール後、順位 × offset を加算）
    const visibleTraces = useMemo(() => {
        return normalizedTraces.map((t, i) => {
            const visible = visibility[i] !== false && traceGroupIds[i] === activeGroupId
            if (!visible) return { ...t, visible: false }
            if (!stackEnabled) return { ...t, visible: true }
            const rank = visibleIndices.indexOf(i)
            if (rank < 0) return { ...t, visible: true }
            const scaled = scaleToUnit(t.y)
            // 各スペクトルを [0,1] にスケール。gap=0 なら上下の端が接する形 (step=1)。
            const off = rank * (1 + stackGap)
            const y = off === 0 ? scaled : scaled.map(v => v + off)
            return { ...t, visible: true, y }
        })
    }, [normalizedTraces, visibility, traceGroupIds, activeGroupId, stackEnabled, stackGap, visibleIndices])

    // 現在の X 表示範囲における可視トレースの y min/max に合わせて Y 軸を自動調整
    const autoFitY = useCallback(() => {
        let mn = Infinity, mx = -Infinity
        for (const t of visibleTraces) {
            if (!t.visible || !t.x || !t.y || !t.x.length) continue
            for (let j = 0; j < t.x.length; j++) {
                const x = t.x[j], y = t.y[j]
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue
                if (xRange && (x < xRange[0] || x > xRange[1])) continue
                if (y < mn) mn = y
                if (y > mx) mx = y
            }
        }
        if (!Number.isFinite(mn) || !Number.isFinite(mx)) return
        const span = mx - mn
        const pad = span > 0 ? span * 0.05 : Math.max(Math.abs(mn) * 0.05, 1e-6)
        setYRange([mn - pad, mx + pad])
    }, [visibleTraces, xRange])

    const onMouseMove = useCallback(ev => {
        if (animFrame.current) cancelAnimationFrame(animFrame.current)
        const plotEl = plotRef.current?.el; if (!plotEl) return
        const rect = plotEl.getBoundingClientRect()
        const px = ev.clientX - rect.left; const py = ev.clientY - rect.top
        animFrame.current = requestAnimationFrame(() => setCross({ x: Math.max(0, Math.min(rect.width, px)), y: Math.max(0, Math.min(rect.height, py)) }))
    }, [])

    React.useEffect(() => {
        const plotEl = plotRef.current?.el; if (!plotEl) return
        const move = ev => onMouseMove(ev)
        const leave = () => setCross({ x: null, y: null })
        plotEl.addEventListener('mousemove', move)
        plotEl.addEventListener('mouseleave', leave)
        return () => {
            plotEl.removeEventListener('mousemove', move)
            plotEl.removeEventListener('mouseleave', leave)
            cancelAnimationFrame(animFrame.current)
        }
    }, [onMouseMove])

    const dataCoord = useMemo(() => {
        if (!plotRef.current || cross.x == null || cross.y == null) return { x: null, y: null }
        const plotEl = plotRef.current.el; const gd = plotEl && plotEl._fullLayout
        if (!gd) return { x: null, y: null }
        const xaxis = gd.xaxis; const yaxis = gd.yaxis
        const xv = xaxis.p2l ? xaxis.p2l(cross.x - xaxis._offset) : null
        const yv = yaxis.p2l ? yaxis.p2l(cross.y - yaxis._offset) : null
        return { x: xv, y: yv }
    }, [cross])

    const displayYLabel = useMemo(() => {
        let base = yLabel
        if (normalizationMode === 'wavelength') base = `${yLabel} (Normalized @ ${normalizationWavelength})`
        else if (normalizationMode === 'max') {
            base = normalizationMaxScope === 'view'
                ? `${yLabel} (Normalized to max in view)`
                : `${yLabel} (Normalized to max)`
        } else if (normalizationMode === 'minmax') {
            base = normalizationMaxScope === 'view'
                ? `${yLabel} (Min-Max in view)`
                : `${yLabel} (Min-Max [0, 1])`
        }
        if (stackEnabled) base = `${base} [Stacked]`
        return base
    }, [yLabel, normalizationMode, normalizationWavelength, normalizationMaxScope, stackEnabled])

    const layout = useMemo(() => ({
        paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff', margin: { l: 80, r: 30, t: 30, b: 70 },
        xaxis: { title: { text: xLabel, font: { size: 14 } }, autorange: xRange == null, range: xRange ?? undefined, exponentformat: 'none', showexponent: 'none' },
        yaxis: { title: { text: displayYLabel, font: { size: 14 } }, autorange: yRange == null, range: yRange ?? undefined, exponentformat: 'none', showexponent: 'none', showticklabels: !stackEnabled },
        showlegend: false, hovermode: false, dragmode: 'zoom'
    }), [xRange, yRange, xLabel, displayYLabel, stackEnabled])

    const config = useMemo(() => ({ displayModeBar: true, responsive: true, scrollZoom: true, doubleClick: 'reset', editable: false, staticPlot: false }), [])

    const selectHeader = useCallback(h => {
        setXLabel(h.xLabel); setYLabel(h.yLabel)
        setSeenHeaders(prev => prev.some(s => s.xLabel === h.xLabel && s.yLabel === h.yLabel) ? prev : [...prev, h])
        setShowHeaderDialog(false); setHeaderCandidates([])
    }, [])
    const applyLabelPreset = useCallback(preset => {
        if (PRESET_LABELS[preset]) { setXLabel(PRESET_LABELS[preset].x); setYLabel(PRESET_LABELS[preset].y) }
        setShowLabelDialog(false)
    }, [])
    const applyCustomLabels = useCallback((xLbl, yLbl) => { setXLabel(xLbl); setYLabel(yLbl); setShowLabelDialog(false) }, [])

    const handleInitialPreset = useCallback((preset) => {
        setPresetSelected(preset)
        if (preset !== 'auto') {
            if (PRESET_LABELS[preset]) { setXLabel(PRESET_LABELS[preset].x); setYLabel(PRESET_LABELS[preset].y) }
            setLockedLabels(true)
        } else { setLockedLabels(false) }
        setShowPresetDialog(false)
        setTimeout(() => { const input = document.getElementById('file-input'); if (input) input.click() }, 0)
    }, [])

    React.useEffect(() => {
        if (xRange) { setXMinInput(String(xRange[0])); setXMaxInput(String(xRange[1])) }
        if (yRange) { setYMinInput(String(yRange[0])); setYMaxInput(String(yRange[1])) }
    }, [xRange, yRange])

    // 通知バナーは 8 秒で自動消去
    React.useEffect(() => {
        if (!notice) return
        const timer = setTimeout(() => {
            setNotice(prev => (prev && prev.id === notice.id) ? null : prev)
        }, 8000)
        return () => clearTimeout(timer)
    }, [notice])

    // 空グループのカラーカウンタを削除（次に追加時は palette[0] から再開）
    React.useEffect(() => {
        const inUse = new Set(traceGroupIds)
        for (const key of Object.keys(groupColorCountersRef.current)) {
            if (!inUse.has(key)) delete groupColorCountersRef.current[key]
        }
    }, [traceGroupIds])

    // Plotly のズーム状態を直接監視（onRelayout prop が発火しないケースへの保険）
    React.useEffect(() => {
        const plotEl = plotRef.current?.el
        if (!plotEl) return
        const update = () => {
            const fl = plotEl._fullLayout
            if (!fl) return
            const xAuto = fl.xaxis?.autorange !== false
            const yAuto = fl.yaxis?.autorange !== false
            setPlotIsZoomed(!xAuto || !yAuto)
        }
        if (typeof plotEl.on === 'function') {
            plotEl.on('plotly_relayout', update)
            plotEl.on('plotly_relayouting', update)
            plotEl.on('plotly_afterplot', update)
        }
        update()
        return () => {
            if (typeof plotEl.removeListener === 'function') {
                plotEl.removeListener('plotly_relayout', update)
                plotEl.removeListener('plotly_relayouting', update)
                plotEl.removeListener('plotly_afterplot', update)
            }
        }
    }, [traces.length])

    // グループコンテキストメニュー: メニュー外クリックで閉じる
    React.useEffect(() => {
        if (!groupContextMenu.visible) return
        const handler = (e) => {
            const menuEl = document.querySelector('.context-menu')
            if (menuEl && menuEl.contains(e.target)) return
            setGroupContextMenu({ visible: false, x: 0, y: 0, groupId: null })
        }
        document.addEventListener('click', handler)
        return () => document.removeEventListener('click', handler)
    }, [groupContextMenu.visible])

    // プラットフォーム取得 & 起動3秒後にアップデート自動チェック
    React.useEffect(() => {
        if (!window.electronAPI) return
        window.electronAPI.getPlatform().then(p => setPlatform(p))
        const timer = setTimeout(() => {
            window.electronAPI.checkForUpdate()
                .then(result => {
                    setUpdateInfo(result)
                    setUpdateStatus(result.hasUpdate ? 'available' : 'idle')
                })
                .catch(() => { /* バックグラウンドチェック失敗は無視 */ })
        }, 3000)
        return () => clearTimeout(timer)
    }, [])

    // ダウンロード進捗リスナー
    React.useEffect(() => {
        if (!window.electronAPI) return
        const cleanup = window.electronAPI.onDownloadProgress(data => {
            setDownloadProgress(data)
        })
        return cleanup
    }, [])

    const handleCheckUpdate = useCallback(async () => {
        setShowUpdateDialog(true)
        if (updateStatus === 'available' || updateStatus === 'no-update' || updateStatus === 'downloading') return
        setUpdateStatus('checking')
        try {
            const result = await window.electronAPI.checkForUpdate()
            setUpdateInfo(result)
            setUpdateStatus(result.hasUpdate ? 'available' : 'no-update')
        } catch {
            setUpdateStatus('error')
        }
    }, [updateStatus])

    const handleDownloadUpdate = useCallback(async () => {
        setUpdateStatus('downloading')
        setDownloadProgress(null)
        try {
            await window.electronAPI.downloadAndApplyUpdate()
            // main.cjs 側で app.quit() が呼ばれる
        } catch {
            setUpdateStatus('error')
        }
    }, [])

    return (
        <div
            className='app'
            onDragOver={e => {
                e.preventDefault()
                e.stopPropagation()
                setIsDraggingFiles(true)
            }}
            onDragLeave={e => {
                e.preventDefault()
                e.stopPropagation()
                setIsDraggingFiles(false)
            }}
            onDrop={e => {
                e.preventDefault()
                e.stopPropagation()
                setIsDraggingFiles(false)
                classifyAndAddFiles(Array.from(e.dataTransfer?.files || []))
            }}
            style={{ outline: isDraggingFiles ? '3px dashed #66a3ff' : 'none', outlineOffset: isDraggingFiles ? 6 : 0 }}
        >
            <div className='toolbar' style={{ position: 'relative' }}>
                <div className='toolbar-icon-buttons'>
                    <IconButton onClick={() => document.getElementById('file-input').click()} disabled={!presetSelected} title={!presetSelected ? 'Add Files — select a data type first' : 'Add Files'}>
                        <AddFileIcon />
                    </IconButton>
                    <IconButton onClick={clearAll} title='Unload All'>
                        <UnloadIcon />
                    </IconButton>
                    <IconButton
                        onClick={resetZoom}
                        disabled={xRange == null && yRange == null && !plotIsZoomed}
                        title={xRange == null && yRange == null && !plotIsZoomed ? 'Already auto-scaled' : 'Reset Zoom'}
                    >
                        <ZoomResetIcon />
                    </IconButton>
                    <IconButton
                        onClick={autoFitY}
                        disabled={visibleIndices.length === 0}
                        title={visibleIndices.length === 0 ? 'No visible spectra to fit' : 'Auto-fit Y (to current X range)'}
                    >
                        <AutoFitYIcon />
                    </IconButton>
                    <IconButton onClick={() => setShowLabelDialog(true)} title='Axis Labels'>
                        <LabelIcon />
                    </IconButton>
                    <div style={{ position: 'relative', display: 'inline-flex' }}>
                        <IconButton
                            onClick={() => setShowNormalizationDialog(true)}
                            title={normalizationMode === 'none'
                                ? 'Normalize spectra'
                                : `Active: ${normalizationMode === 'max'
                                    ? (normalizationMaxScope === 'view' ? 'Max (in view)' : 'Max (full range)')
                                    : normalizationMode === 'minmax'
                                        ? (normalizationMaxScope === 'view' ? 'Min-Max (in view)' : 'Min-Max (full range)')
                                        : `x = ${normalizationWavelength}`}`}
                        >
                            <NormalizeIcon />
                        </IconButton>
                        {normalizationMode !== 'none' && (
                            <span style={{
                                position: 'absolute', top: 4, right: 4,
                                width: 8, height: 8, borderRadius: '50%',
                                background: '#2196F3', pointerEvents: 'none'
                            }} />
                        )}
                    </div>
                    <div style={{ position: 'relative', display: 'inline-flex' }}>
                        <IconButton
                            onClick={() => {
                                if (!stackEnabled) {
                                    setStackEnabled(true)
                                    setStackGap(0)
                                    setYRange(null)
                                }
                                setShowStackDialog(true)
                            }}
                            title={stackEnabled ? 'Stacking active' : 'Stack display'}
                        >
                            <StackIcon />
                        </IconButton>
                        {stackEnabled && (
                            <span style={{
                                position: 'absolute', top: 4, right: 4,
                                width: 8, height: 8, borderRadius: '50%',
                                background: '#4caf50', pointerEvents: 'none'
                            }} />
                        )}
                    </div>
                    {window.electronAPI && (
                        <div style={{ position: 'relative', display: 'inline-flex' }}>
                            <IconButton
                                onClick={handleCheckUpdate}
                                title={updateStatus === 'available' ? 'Update available' : 'Check for updates'}
                            >
                                <UpdateIcon />
                            </IconButton>
                            {updateStatus === 'available' && (
                                <span style={{
                                    position: 'absolute', top: 4, right: 4,
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: '#e33', pointerEvents: 'none'
                                }} />
                            )}
                        </div>
                    )}

                </div>
                <input id='file-input' type='file' multiple onChange={handleFiles} onClick={e => { e.target.value = '' }} style={{ display: 'none' }} />

                {Object.keys(relabMeta).length > 0 && (() => {
                    const n = Object.keys(relabMeta).length
                    return <div style={{ marginLeft: 12, fontSize: 12, color: '#444' }}>{`RELAB metadata: ${n} ${n === 1 ? 'file' : 'files'}`}</div>
                })()}
                <div className='inline-range-inputs'>
                    <span>X:</span>
                    <input type='number' step='any' value={xMinInput} onChange={e => setXMinInput(e.target.value)} onKeyDown={e => handleRangeKeyDown('x', e)} placeholder='Min' />
                    <span>~</span>
                    <input type='number' step='any' value={xMaxInput} onChange={e => setXMaxInput(e.target.value)} onKeyDown={e => handleRangeKeyDown('x', e)} placeholder='Max' />
                    <span style={{ marginLeft: 12 }}>Y:</span>
                    <input type='number' step='any' value={yMinInput} onChange={e => setYMinInput(e.target.value)} onKeyDown={e => handleRangeKeyDown('y', e)} placeholder='Min' />
                    <span>~</span>
                    <input type='number' step='any' value={yMaxInput} onChange={e => setYMaxInput(e.target.value)} onKeyDown={e => handleRangeKeyDown('y', e)} placeholder='Max' />
                </div>


                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        right: 16,
                        bottom: 0,
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: 18,
                        color: 'red',
                        whiteSpace: 'nowrap',
                        zIndex: 10,
                        pointerEvents: 'none',
                        height: '100%',
                    }}
                >
                    <span style={{ pointerEvents: 'auto' }}>
                        {(() => {
                            if (dataCoord.x == null || dataCoord.y == null) return '—'
                            const unitOf = (label) => {
                                const m = String(label || '').match(/\(([^)]+)\)\s*$/)
                                return m ? ' ' + m[1] : ''
                            }
                            const xu = unitOf(xLabel)
                            const yu = normalizationMode === 'none' ? unitOf(yLabel) : ''
                            return `X: ${dataCoord.x.toFixed(4)}${xu} · Y: ${dataCoord.y.toFixed(4)}${yu}`
                        })()}
                    </span>
                </div>
            </div>
            <NoticeBanner notice={notice} onClose={() => setNotice(null)} />
            <div className='main-area'>
                <div className='legend-panel'>
                    {/* グループパネル（ドラッグ＆ドロップで移動/コピー） */}
                    <div className='group-panel'>
                        {groups.map(g => (
                            <div
                                key={g.id}
                                className={`group-item ${g.id === activeGroupId ? 'active' : ''} ${groupToggleState[g.id] === 'hide' ? 'hide' : 'show'}`}
                                title={'Right-click: menu\nDrop a spectrum here to move (Ctrl+drop to copy)'}
                                onClick={() => {
                                    setActiveGroupId(g.id)
                                    setGroupToggleState(prev => {
                                        const nextState = prev[g.id] === 'show' ? 'hide' : 'show'
                                        setVisibility(vPrev => vPrev.map((v, i) => traceGroupIds[i] === g.id ? (nextState === 'show') : v))
                                        return { ...prev, [g.id]: nextState }
                                    })
                                }}
                                onContextMenu={e => {
                                    e.preventDefault()
                                    setGroupContextMenu({ visible: true, x: e.clientX, y: e.clientY, groupId: g.id })
                                }}
                                onDragOver={e => e.preventDefault()}
                                onDrop={e => {
                                    const traceIndexStr = e.dataTransfer.getData('text/plain')
                                    const idx = Number(traceIndexStr)
                                    if (!Number.isFinite(idx)) return
                                    const isCopy = e.ctrlKey
                                    if (isCopy) {
                                        const src = traces[idx]
                                        const newColorIdx = groupColorCountersRef.current[g.id] ?? 0
                                        groupColorCountersRef.current[g.id] = newColorIdx + 1
                                        const cloned = {
                                            ...src,
                                            line: { ...src.line, color: palette[newColorIdx % palette.length] },
                                            name: filesInfo[idx]
                                        }
                                        setTraces(prev => [...prev, cloned])
                                        setFilesInfo(prev => [...prev, filesInfo[idx]])
                                        setVisibility(prev => [...prev, true])
                                        setTraceGroupIds(prev => [...prev, g.id])
                                    } else {
                                        // 移動: 同一グループへのドロップは no-op
                                        if (traceGroupIds[idx] === g.id) return
                                        // 移動先グループのカウンタから新しい色を割り当てる
                                        const targetColorIdx = groupColorCountersRef.current[g.id] ?? 0
                                        groupColorCountersRef.current[g.id] = targetColorIdx + 1
                                        const newColor = palette[targetColorIdx % palette.length]
                                        setTraces(prev => {
                                            const next = [...prev]
                                            next[idx] = { ...next[idx], line: { ...next[idx].line, color: newColor } }
                                            return next
                                        })
                                        setTraceGroupIds(prev => {
                                            const next = [...prev]
                                            next[idx] = g.id
                                            return next
                                        })
                                    }
                                }}
                            >
                                {g.id}
                            </div>
                        ))}
                        <button
                            className='group-add-btn'
                            title='Add new group'
                            onClick={() => {
                                // 既存Groupの番号を解析し次番号を採用（数字のみ）
                                const nums = groups.map(gr => Number(gr.id)).filter(n => Number.isFinite(n))
                                const nextNum = nums.length ? Math.max(...nums) + 1 : 1
                                const id = String(nextNum)
                                const name = String(nextNum)
                                setGroups(prev => [...prev, { id, name }])
                                setActiveGroupId(id)
                                setGroupToggleState(prev => ({ ...prev, [id]: 'show' }))
                            }}
                        >
                            +
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                            <button
                                className='icon-button'
                                title={legendSortKey === 'filename' ? 'Sorting by file name' : legendSortKey === 'ext' ? 'Sorting by extension' : 'Custom order (drag to reorder)'}
                                onClick={() => setLegendSortKey(prev => prev === 'filename' ? 'ext' : prev === 'ext' ? 'custom' : 'filename')}
                            >
                                {legendSortKey === 'filename' ? <NameIcon /> : legendSortKey === 'ext' ? <ExtIcon /> : <CustomOrderIcon />}
                            </button>
                            <button
                                className='icon-button'
                                title={legendSortKey === 'custom' ? 'Order set manually' : legendSortOrder === 'asc' ? 'Ascending' : 'Descending'}
                                onClick={() => setLegendSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                                disabled={legendSortKey === 'custom'}
                            >
                                {legendSortOrder === 'asc' ? <ArrowUpIcon /> : <ArrowDownIcon />}
                            </button>
                        </div>
                    </div>

                    <div className='legend-scroll'>
                        {(() => {
                            const items = traces.map((trace, idx) => ({ trace, idx }))
                                .filter(({ idx }) => traceGroupIds[idx] === activeGroupId)
                            const compare = (a, b) => {
                                const nameA = (filesInfo[a.idx] || '').toLowerCase()
                                const nameB = (filesInfo[b.idx] || '').toLowerCase()
                                if (legendSortKey === 'ext') {
                                    const extA = nameA.split('.').pop()
                                    const extB = nameB.split('.').pop()
                                    if (extA < extB) return legendSortOrder === 'asc' ? -1 : 1
                                    if (extA > extB) return legendSortOrder === 'asc' ? 1 : -1
                                    // tie-breaker by filename
                                }
                                if (nameA < nameB) return legendSortOrder === 'asc' ? -1 : 1
                                if (nameA > nameB) return legendSortOrder === 'asc' ? 1 : -1
                                return 0
                            }
                            if (legendSortKey !== 'custom') items.sort(compare)
                            return items.map(({ trace, idx }) => {
                                const isDragOver = dragOverLegend && dragOverLegend.idx === idx
                                const classes = ['legend-item']
                                if (isDragOver && dragOverLegend.position === 'before') classes.push('drag-over-before')
                                if (isDragOver && dragOverLegend.position === 'after') classes.push('drag-over-after')
                                return (
                                <div
                                    key={idx}
                                    className={classes.join(' ')}
                                    title={'Drag to a group to move (Ctrl+drag to copy) · Drag to another item to reorder'}
                                    draggable
                                    onDragStart={e => {
                                        e.dataTransfer.setData('text/plain', String(idx))
                                    }}
                                    onDragOver={e => {
                                        e.preventDefault()
                                        const rect = e.currentTarget.getBoundingClientRect()
                                        const position = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after'
                                        setDragOverLegend(prev => (prev && prev.idx === idx && prev.position === position) ? prev : { idx, position })
                                    }}
                                    onDragLeave={() => {
                                        setDragOverLegend(prev => (prev && prev.idx === idx) ? null : prev)
                                    }}
                                    onDragEnd={() => setDragOverLegend(null)}
                                    onDrop={e => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        const traceIndexStr = e.dataTransfer.getData('text/plain')
                                        const fromIdx = Number(traceIndexStr)
                                        setDragOverLegend(null)
                                        if (!Number.isFinite(fromIdx) || fromIdx === idx) return
                                        const rect = e.currentTarget.getBoundingClientRect()
                                        const position = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after'
                                        reorderLegendItem(fromIdx, idx, position)
                                    }}
                                >
                                    <input type='checkbox' checked={visibility[idx] !== false} onChange={() => toggleVisibility(idx)} />
                                    {/* Unload ボタン: スナップショット保存 + Undo 付き */}
                                    <button
                                        className='unload-btn'
                                        title='Unload'
                                        onClick={() => {
                                            const snapshot = {
                                                trace: traces[idx],
                                                info: filesInfo[idx],
                                                visible: visibility[idx],
                                                groupId: traceGroupIds[idx],
                                                idx,
                                                colorCounters: { ...groupColorCountersRef.current },
                                            }
                                            setTraces(prev => prev.filter((_, i) => i !== idx))
                                            setFilesInfo(prev => prev.filter((_, i) => i !== idx))
                                            setVisibility(prev => prev.filter((_, i) => i !== idx))
                                            setTraceGroupIds(prev => prev.filter((_, i) => i !== idx))
                                            const id = Date.now()
                                            setNotice({
                                                type: 'info',
                                                message: `Unloaded "${snapshot.info}"`,
                                                actionLabel: 'Undo',
                                                actionFn: () => {
                                                    const insertAt = (arr, val) => {
                                                        const n = [...arr]
                                                        n.splice(Math.min(snapshot.idx, n.length), 0, val)
                                                        return n
                                                    }
                                                    setTraces(prev => insertAt(prev, snapshot.trace))
                                                    setFilesInfo(prev => insertAt(prev, snapshot.info))
                                                    setVisibility(prev => insertAt(prev, snapshot.visible))
                                                    setTraceGroupIds(prev => insertAt(prev, snapshot.groupId))
                                                    groupColorCountersRef.current = { ...snapshot.colorCounters }
                                                    setNotice(null)
                                                },
                                                id,
                                            })
                                        }}
                                    >
                                        <UnloadIcon />
                                    </button>
                                    <div
                                        className='color-box'
                                        style={{ backgroundColor: trace.line.color }}
                                        onClick={() => handleColorClick(idx)}
                                        onDoubleClick={() => handleColorDoubleClick(idx)}
                                        title='Click: next color · Double-click: custom color'
                                    />
                                    <div className='filename'>{filesInfo[idx]}</div>
                                </div>
                                )
                            })
                        })()}
                    </div>
                </div>
                <div className='viewer'>
                    <div className='plot-wrap'>
                        <Plot ref={plotRef} data={visibleTraces} layout={layout} config={config} onRelayout={onRelayout} style={{ width: '100%', height: '100%' }} useResizeHandler />
                    </div>
                    <div className='crosshair-overlay'>
                        {cross.x != null && cross.y != null && (
                            <div className='crosshair-layer'>
                                <div className='cross-vert' style={{ left: cross.x }} />
                                <div className='cross-hori' style={{ top: cross.y }} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {showHeaderDialog && <HeaderSelectDialog candidates={headerCandidates} onSelect={selectHeader} onCancel={() => {
                // Cancel でも「見た」扱いとし、次回以降問合せしない
                setSeenHeaders(prev => {
                    const added = headerCandidates.filter(h => !prev.some(s => s.xLabel === h.xLabel && s.yLabel === h.yLabel))
                    return added.length ? [...prev, ...added] : prev
                })
                setShowHeaderDialog(false); setHeaderCandidates([])
            }} />}
            {showLabelDialog && <LabelSettingDialog currentX={xLabel} currentY={yLabel} onApplyPreset={applyLabelPreset} onApplyCustom={applyCustomLabels} onCancel={() => setShowLabelDialog(false)} />}
            {showPresetDialog && <InitialPresetDialog onSelect={handleInitialPreset} />}
            {confirmState && (
                <ConfirmDialog
                    title={confirmState.title}
                    body={confirmState.body}
                    confirmLabel={confirmState.confirmLabel}
                    cancelLabel={confirmState.cancelLabel}
                    danger={confirmState.danger}
                    onConfirm={() => {
                        const fn = confirmState.onConfirm
                        setConfirmState(null)
                        fn()
                    }}
                    onCancel={() => {
                        const fn = confirmState.onDismiss
                        setConfirmState(null)
                        if (fn) fn()
                    }}
                />
            )}
            {showStackDialog && (
                <StackDialog
                    gap={stackGap}
                    onGapChange={setStackGap}
                    onDisable={() => {
                        setStackEnabled(false)
                        setShowStackDialog(false)
                        setYRange(null)
                    }}
                    onClose={() => setShowStackDialog(false)}
                />
            )}
            {showNormalizationDialog && (
                <NormalizationDialog
                    mode={normalizationMode}
                    wavelength={normalizationWavelength}
                    maxScope={normalizationMaxScope}
                    xLabel={xLabel}
                    onApply={({ mode, wavelength, maxScope }) => {
                        setNormalizationMode(mode)
                        if (mode === 'wavelength' && Number.isFinite(wavelength)) {
                            setNormalizationWavelength(wavelength)
                        }
                        if ((mode === 'max' || mode === 'minmax') && maxScope) {
                            setNormalizationMaxScope(maxScope)
                        }
                        setShowNormalizationDialog(false)
                        // 範囲外により規格化できなかった可視トレース数を集計して警告
                        if (mode === 'wavelength' && Number.isFinite(wavelength)) {
                            const skipped = []
                            for (let i = 0; i < traces.length; i++) {
                                if (visibility[i] === false) continue
                                if (traceGroupIds[i] !== activeGroupId) continue
                                const v = findYatX(traces[i].x, traces[i].y, wavelength)
                                if (v === null || !Number.isFinite(v) || v === 0) skipped.push(filesInfo[i])
                            }
                            if (skipped.length > 0) {
                                const msg = skipped.length === 1
                                    ? `1 spectrum was not normalized because x = ${wavelength} is outside its data range: ${skipped[0]}`
                                    : `${skipped.length} spectra were not normalized because x = ${wavelength} is outside their data range.`
                                setNotice({ type: 'warning', message: msg, id: Date.now() })
                            }
                        } else if ((mode === 'max' || mode === 'minmax') && maxScope === 'view' && xRange) {
                            const normalizer = mode === 'minmax' ? scaleToUnitInRange : normalizeByMaxInRange
                            const skipped = []
                            for (let i = 0; i < traces.length; i++) {
                                if (visibility[i] === false) continue
                                if (traceGroupIds[i] !== activeGroupId) continue
                                const ny = normalizer(traces[i].x, traces[i].y, xRange)
                                if (!ny) skipped.push(filesInfo[i])
                            }
                            if (skipped.length > 0) {
                                const msg = skipped.length === 1
                                    ? `1 spectrum was not normalized because no data falls within the current view range: ${skipped[0]}`
                                    : `${skipped.length} spectra were not normalized because no data falls within the current view range.`
                                setNotice({ type: 'warning', message: msg, id: Date.now() })
                            }
                        }
                        if (mode === 'minmax') {
                            setYRange([0, 1])
                        } else if (mode === 'max') {
                            // 可視トレース×現在の X 範囲で規格化後の min/max を求め Y 軸にフィット
                            const scope = maxScope === 'view' ? xRange : null
                            let mn = Infinity, mx = -Infinity
                            for (let i = 0; i < traces.length; i++) {
                                if (visibility[i] === false) continue
                                if (traceGroupIds[i] !== activeGroupId) continue
                                const t = traces[i]
                                const ny = normalizeByMaxInRange(t.x, t.y, scope)
                                if (!ny) continue
                                for (let j = 0; j < t.x.length; j++) {
                                    const x = t.x[j], y = ny[j]
                                    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
                                    if (xRange && (x < xRange[0] || x > xRange[1])) continue
                                    if (y < mn) mn = y
                                    if (y > mx) mx = y
                                }
                            }
                            if (Number.isFinite(mn) && Number.isFinite(mx)) {
                                const span = mx - mn
                                const pad = span > 0 ? span * 0.05 : 1e-6
                                setYRange([mn - pad, mx + pad])
                            } else {
                                setYRange(null)
                            }
                        } else {
                            setYRange(null)
                        }
                    }}
                    onCancel={() => setShowNormalizationDialog(false)}
                />
            )}
            {showUpdateDialog && (
                <UpdateDialog
                    status={updateStatus}
                    info={updateInfo}
                    progress={downloadProgress}
                    platform={platform}
                    onDownload={handleDownloadUpdate}
                    onOpenBrowser={() => {
                        if (updateInfo?.releaseUrl) window.electronAPI.openExternal(updateInfo.releaseUrl)
                    }}
                    onClose={() => setShowUpdateDialog(false)}
                />
            )}

            {unitDialogVisible && (
                <BulkUnitDialog
                    files={unitQueryFiles}
                    selections={unitSelections}
                    onChangeSelection={(idx, unit) => {
                        setUnitSelections(prev => {
                            const next = [...prev];
                            next[idx] = unit; return next
                        })
                    }}
                    onApply={() => {
                        unitQueryFiles.forEach((f, i) => parseAndAddFiles([f], unitSelections[i]))
                        setUnitDialogVisible(false)
                        if (immediateReflectanceFiles.length) parseAndAddFiles(immediateReflectanceFiles)
                        setImmediateReflectanceFiles([])
                        setUnitQueryFiles([]); setUnitSelections([])
                    }}
                />
            )}
            {groupContextMenu.visible && (
                <div
                    className='context-menu'
                    style={{ top: groupContextMenu.y, left: groupContextMenu.x }}
                >
                    <div className='context-menu-title'>Group Menu</div>
                    <div style={{ fontSize: 12, marginBottom: 8 }}>Target: {groups.find(g => g.id === groupContextMenu.groupId)?.name}</div>
                    <div className='context-menu-actions'>
                        <button onClick={() => {
                            const id = groupContextMenu.groupId
                            const gObj = groups.find(g => g.id === id)
                            if (!gObj) return
                            const newName = prompt('Rename group', gObj.name)
                            if (newName && newName.trim()) {
                                const trimmed = newName.trim()
                                // 数字のみを推奨: 非数字でもそのまま設定
                                setGroups(prev => prev.map(g => g.id === id ? { ...g, name: trimmed } : g))
                            }
                            setGroupContextMenu({ visible: false, x: 0, y: 0, groupId: null })
                        }}>Rename</button>
                        <button onClick={() => {
                            const id = groupContextMenu.groupId
                            const gObj = groups.find(g => g.id === id)
                            setGroupContextMenu({ visible: false, x: 0, y: 0, groupId: null })
                            if (!gObj) return
                            const n = traceGroupIds.filter(gid => gid === id).length
                            const body = n > 0
                                ? `This group and its ${n} loaded ${n === 1 ? 'spectrum' : 'spectra'} will be unloaded from the viewer.\nSpectra also shown in other groups will remain.`
                                : 'This group will be removed.'
                            // 削除対象インデックス（クロージャで固定）を先に算出して全並列配列に一貫して適用
                            const keptIndices = traceGroupIds
                                .map((gid, i) => (gid !== id ? i : -1))
                                .filter(i => i >= 0)
                            setConfirmState({
                                title: `Close group "${gObj.name}"?`,
                                body,
                                confirmLabel: 'Close',
                                danger: true,
                                onConfirm: () => {
                                    setTraces(prev => keptIndices.map(i => prev[i]))
                                    setFilesInfo(prev => keptIndices.map(i => prev[i]))
                                    setVisibility(prev => keptIndices.map(i => prev[i]))
                                    setTraceGroupIds(prev => keptIndices.map(i => prev[i]))
                                    setGroups(prev => {
                                        const remaining = prev.filter(g => g.id !== id)
                                        if (activeGroupId === id) {
                                            setActiveGroupId(remaining.length ? remaining[0].id : null)
                                        }
                                        return remaining
                                    })
                                    setGroupToggleState(prev => { const { [id]: _omit, ...rest } = prev; return rest })
                                }
                            })
                        }}>Close Group</button>
                    </div>
                </div>
            )}
        </div>
    )
}
function extractRelabMeta(xmlText) {
    const fileNameMatch = xmlText.match(new RegExp('<file_name>([^<]+)</file_name>', 'i'))
    if (!fileNameMatch) throw new Error('file_name not found')
    const tabFileName = fileNameMatch[1].trim().toLowerCase()
    const recordsMatch = xmlText.match(new RegExp('<records>(\\d+)</records>', 'i'))
    const recordCount = recordsMatch ? Number(recordsMatch[1]) : null
    const wlPattern = '<Field_Character>[\\s\\S]*?<name>Wavelength</name>[\\s\\S]*?<field_location unit="byte">(\\d+)</field_location>[\\s\\S]*?<field_length unit="byte">(\\d+)</field_length>[\\s\\S]*?</Field_Character>'
    const rfPattern = '<Field_Character>[\\s\\S]*?<name>Reflectance</name>[\\s\\S]*?<field_location unit="byte">(\\d+)</field_location>[\\s\\S]*?<field_length unit="byte">(\\d+)</field_length>[\\s\\S]*?</Field_Character>'
    const wlBlock = xmlText.match(new RegExp(wlPattern, 'i'))
    const rfBlock = xmlText.match(new RegExp(rfPattern, 'i'))
    if (!wlBlock || !rfBlock) throw new Error('fields not found')
    const wlLoc = Number(wlBlock[1]) - 1
    const wlLen = Number(wlBlock[2])
    const rfLoc = Number(rfBlock[1]) - 1
    const rfLen = Number(rfBlock[2])
    return { tabFileName, wlLoc, wlLen, rfLoc, rfLen, recordCount }
}

function parseRelabTab(rawText, meta) {
    const { wlLoc, wlLen, rfLoc, rfLen, recordCount } = meta
    const norm = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = norm.split('\n')
    const x = []; const y = []
    let headerSkipped = false
    for (const ln of lines) {
        if (!ln.trim()) continue
        const stripped = ln.trim()
        if (!headerSkipped && recordCount && /^\d+$/.test(stripped) && Number(stripped) === recordCount) { headerSkipped = true; continue }
        if (/^[A-Za-z]/.test(stripped)) break
        if (ln.length < Math.max(wlLoc + wlLen, rfLoc + rfLen)) continue
        const wlStr = ln.slice(wlLoc, wlLoc + wlLen).trim()
        const rfStr = ln.slice(rfLoc, rfLoc + rfLen).trim()
        if (!wlStr || !rfStr) continue
        const wlVal = Number(wlStr); const rfVal = Number(rfStr)
        if (!Number.isFinite(wlVal) || !Number.isFinite(rfVal)) continue
        x.push(wlVal); y.push(rfVal)
        if (recordCount && x.length >= recordCount) break
    }
    if (!x.length) throw new Error('No numeric data in TAB')
    return { x, y }
}

function HeaderSelectDialog({ candidates, onSelect, onCancel }) {
    return (
        <div className='dialog-overlay'>
            <div className='dialog-box'>
                <h3>Select Axis Labels</h3>
                <p>Different headers were detected. Choose the pair to use.</p>
                <div className='header-candidates'>
                    {candidates.map((h, i) => (
                        <button key={i} className='header-candidate-btn' onClick={() => onSelect(h)}>X: {h.xLabel} / Y: {h.yLabel}</button>
                    ))}
                </div>
                <button className='cancel-btn' onClick={onCancel}>Cancel</button>
            </div>
        </div>
    )
}

function LabelSettingDialog({ currentX, currentY, onApplyPreset, onApplyCustom, onCancel }) {
    const [customX, setCustomX] = useState(currentX)
    const [customY, setCustomY] = useState(currentY)
    const [selectedPreset, setSelectedPreset] = useState('')
    const PRESET_ICONS = {
        'wavelength-reflectance': { icon: <ReflectanceSpectrumIcon />, label: 'Reflectance Spectra' },
        'spacing-intensity': { icon: <XRDIcon />, label: 'XRD Pattern' },
        'time-temperature': { icon: <ThermometerIcon />, label: 'Temperature Profile' }
    }
    const presets = Object.fromEntries(
        Object.entries(PRESET_LABELS).map(([k, v]) => [k, { ...v, ...PRESET_ICONS[k] }])
    )
    const handleSelectPreset = (p) => {
        setSelectedPreset(p)
        if (PRESET_LABELS[p]) { setCustomX(PRESET_LABELS[p].x); setCustomY(PRESET_LABELS[p].y) }
    }
    const apply = () => {
        if (selectedPreset) { onApplyPreset(selectedPreset); return }
        if (customX.trim() || customY.trim()) onApplyCustom(customX, customY)
    }
    return (
        <div className='dialog-overlay'>
            <div className='dialog-box'>
                <h3>Axis Labels</h3>
                <div className='datatype-icon-buttons' style={{ marginBottom: 12 }}>
                    {Object.entries(presets).map(([key, info]) => (
                        <button
                            key={key}
                            className={
                                'datatype-icon-btn' + (selectedPreset === key ? ' selected' : '')
                            }
                            onClick={() => handleSelectPreset(key)}
                            title={info.label}
                        >
                            {info.icon}
                            <span>{info.label}</span>
                        </button>
                    ))}
                </div>
                <div className='custom-section'>
                    <h4 style={{ marginTop: 0 }}>Custom Labels</h4>
                    <div className='input-group'>
                        <label>X label:</label>
                        <input value={customX} onChange={e => { setCustomX(e.target.value); setSelectedPreset('') }} placeholder='e.g., Wavelength (μm)' />
                    </div>
                    <div className='input-group'>
                        <label>Y label:</label>
                        <input value={customY} onChange={e => { setCustomY(e.target.value); setSelectedPreset('') }} placeholder='e.g., Reflectance' />
                    </div>
                </div>
                <div className='dialog-actions'>
                    <button className='cancel-btn' onClick={onCancel}>Cancel</button>
                    <button className='apply-btn' onClick={apply}>Apply</button>
                </div>
            </div>
        </div>
    )
}

function InitialPresetDialog({ onSelect }) {
    return (
        <div className='dialog-overlay'>
            <div className='dialog-box'>
                <h3>Data Type</h3>
                <div className='datatype-icon-buttons'>
                    <button className='datatype-icon-btn' onClick={() => onSelect('wavelength-reflectance')} title='DPT (OPUS), TAB (RELAB), CSV, TXT'>
                        <ReflectanceSpectrumIcon />
                        <span>Reflectance Spectra</span>
                        <span className='datatype-subtitle'>.dpt .tab .csv .txt</span>
                    </button>
                    <button className='datatype-icon-btn' onClick={() => onSelect('spacing-intensity')} title='CSV, ASC'>
                        <XRDIcon />
                        <span>XRD Pattern</span>
                        <span className='datatype-subtitle'>.csv .asc</span>
                    </button>
                    <button className='datatype-icon-btn' onClick={() => onSelect('time-temperature')} title='TXT (InfraWin)'>
                        <ThermometerIcon />
                        <span>Temperature Profile</span>
                        <span className='datatype-subtitle'>.txt (InfraWin)</span>
                    </button>
                    <button className='datatype-icon-btn' onClick={() => onSelect('auto')} title={'Auto: use CSV header row as axis labels.\nLabels stay flexible and adapt to each file.\nSupports: TAB, CSV, TXT'}>
                        <AutoDetectIcon />
                        <span>Auto</span>
                        <span className='datatype-subtitle'>labels from header</span>
                    </button>
                </div>
            </div>
        </div>
    )
}

function BulkUnitDialog({ files, selections, onChangeSelection, onApply }) {
    return (
        <div className='dialog-overlay'>
            <div className='dialog-box unit-dialog'>
                <h3 style={{ marginTop: 0 }}>Select Wavelength Unit</h3>
                <div className='unit-dialog-desc'>
                    Set wavelength unit for each file. If <strong>nm</strong> is selected, values are converted to <strong>μm</strong> for plotting.
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 12 }}>
                    {files.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid #eee', borderRadius: 6, marginBottom: 8 }}>
                            <div style={{ flex: 1, fontSize: 13, wordBreak: 'break-all' }}>{f.name}</div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer' }}>
                                    <input type='radio' name={`unit-${i}`} checked={selections[i] === 'nm'} onChange={() => onChangeSelection(i, 'nm')} /> nm
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer' }}>
                                    <input type='radio' name={`unit-${i}`} checked={selections[i] === 'um'} onChange={() => onChangeSelection(i, 'um')} /> μm
                                </label>
                            </div>
                        </div>
                    ))}
                </div>
                <div className='dialog-actions'>
                    <button className='apply-btn' onClick={onApply}>Apply</button>
                </div>
            </div>
        </div>
    )
}

