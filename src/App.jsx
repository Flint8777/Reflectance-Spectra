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
            <line x1='5' y1='20' x2='5' y2='15' />
            <line x1='8' y1='20' x2='8' y2='10' />
            <line x1='11' y1='20' x2='11' y2='5' />
            <line x1='14' y1='20' x2='14' y2='8' />
            <line x1='17' y1='20' x2='17' y2='12' />
            <line x1='20' y1='20' x2='20' y2='16' />
            <line x1='2' y1='20' x2='22' y2='20' strokeWidth='2' />
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
    const nextColorIdxRef = useRef(0)

    const [xLabel, setXLabel] = useState('Wavelength (μm)')
    const [yLabel, setYLabel] = useState('Reflectance')
    const [headerCandidates, setHeaderCandidates] = useState([])
    const [showHeaderDialog, setShowHeaderDialog] = useState(false)
    const [showLabelDialog, setShowLabelDialog] = useState(false)
    const [loadedCount, setLoadedCount] = useState(0)
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
    const [legendSortKey, setLegendSortKey] = useState('filename') // 'filename' | 'ext'
    const [legendSortOrder, setLegendSortOrder] = useState('asc') // 'asc' | 'desc'

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
        // 現在のカラー開始位置を参照（状態更新の非同期性の影響を回避）
        let colorIdx = nextColorIdxRef.current

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
                    const idx = nextColorIdxRef.current; nextColorIdxRef.current = idx + 1
                    newTraces.push({ x, y, type: 'scattergl', mode: 'lines', line: { color: palette[idx % palette.length], width: 1.5 }, name: file.name })
                    newInfos.push(file.name)
                    newGroupIds.push(activeGroupId)
                    detectedHeaders.push({ xLabel: 'Time (s)', yLabel: 'Temperature (°C)' })
                    if (!lockedLabels) { setXLabel('Time (s)'); setYLabel('Temperature (°C)') }
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
                                detectedHeaders.push({ xLabel: headerX, yLabel: headerY })
                            } else {
                                for (const row of res.data) {
                                    if (!row || row.length < 2) continue
                                    const xv = Number(row[0]); const yv = Number(row[1])
                                    if (Number.isFinite(xv) && Number.isFinite(yv)) { x.push(xv); y.push(yv) }
                                }
                                detectedHeaders.push(null)
                            }
                            let xData = x
                            if (presetSelected === 'wavelength-reflectance' && unitOverride === 'nm') xData = xData.map(v => v / 1000)
                            const idx = nextColorIdxRef.current; nextColorIdxRef.current = idx + 1
                            newTraces.push({ x: xData, y, type: 'scattergl', mode: 'lines', line: { color: palette[idx % palette.length], width: 1.5 }, name: file.name })
                            newInfos.push(file.name)
                            newGroupIds.push(activeGroupId)
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
                    const idx = nextColorIdxRef.current; nextColorIdxRef.current = idx + 1
                    newTraces.push({ x, y, type: 'scattergl', mode: 'lines', line: { color: palette[idx % palette.length], width: 1.5 }, name: file.name });
                    newInfos.push(file.name);
                    newGroupIds.push(activeGroupId)
                    detectedHeaders.push({ xLabel: 'Wavelength (μm)', yLabel: 'Reflectance' });
                    if (!lockedLabels) { setXLabel('Wavelength (μm)'); setYLabel('Reflectance'); }
                    resolve(); return;
                }

                if (ext === 'dpt') {
                    const { x, y } = parseDPT(text)
                    if (!x.length) { resolve(); return }
                    const idx = nextColorIdxRef.current; nextColorIdxRef.current = idx + 1
                    newTraces.push({ x, y, type: 'scattergl', mode: 'lines', line: { color: palette[idx % palette.length], width: 1.5 }, name: file.name })
                    newInfos.push(file.name)
                    newGroupIds.push(activeGroupId)
                    detectedHeaders.push({ xLabel: 'Wavelength (μm)', yLabel: 'Reflectance' })
                    if (!lockedLabels) { setXLabel('Wavelength (μm)'); setYLabel('Reflectance') }
                    resolve(); return
                }

                // XRD ASCII (.asc) support: whitespace-separated two numeric columns (2θ, Intensity)
                if (ext === 'asc') {
                    const x = []; const y = []
                    for (const ln of lines) {
                        const t = ln.trim(); if (!t || t.startsWith('#')) continue
                        const cols = t.split(/\s+/).filter(Boolean)
                        if (cols.length < 2) continue
                        const xv = parseFloat(cols[0]); const yv = parseFloat(cols[1])
                        if (Number.isFinite(xv) && Number.isFinite(yv)) { x.push(xv); y.push(yv) }
                    }
                    if (!x.length) { resolve(); return }
                    const idx = nextColorIdxRef.current; nextColorIdxRef.current = idx + 1
                    newTraces.push({ x, y, type: 'scattergl', mode: 'lines', line: { color: palette[idx % palette.length], width: 1.5 }, name: file.name })
                    newInfos.push(file.name)
                    newGroupIds.push(activeGroupId)
                    detectedHeaders.push({ xLabel: '2θ (°)', yLabel: 'Intensity' })
                    if (!lockedLabels) { setXLabel('2θ (°)'); setYLabel('Intensity') }
                    resolve(); return
                }

                const x = []; const y = []
                for (const ln of lines) {
                    const t = ln.trim(); if (!t || t.startsWith('#')) continue
                    const cols = t.split(/[\s\t]+/).filter(Boolean)
                    if (cols.length < 2) continue
                    const xv = parseFloat(cols[0]); const yv = parseFloat(cols[1])
                    if (Number.isFinite(xv) && Number.isFinite(yv)) { x.push(xv); y.push(yv) }
                }
                let xData = x
                if (presetSelected === 'wavelength-reflectance' && unitOverride === 'nm') xData = xData.map(v => v / 1000)
                const idx = nextColorIdxRef.current; nextColorIdxRef.current = idx + 1
                newTraces.push({ x: xData, y, type: 'scattergl', mode: 'lines', line: { color: palette[idx % palette.length], width: 1.5 }, name: file.name })
                newInfos.push(file.name)
                newGroupIds.push(activeGroupId)
                detectedHeaders.push(null)
                resolve()
            }
            reader.readAsText(file)
        }))

        Promise.all(tasks).then(() => {
            // 新規追加分をファイル名の降順でソート（左凡例表示順に反映）
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

            setTraces(prev => [...prev, ...sortedTraces])
            setFilesInfo(prev => [...prev, ...sortedInfos])
            setVisibility(prev => [...prev, ...sortedTraces.map(() => true)])
            setTraceGroupIds(prev => [...prev, ...sortedGroupIds])
            setLoadedCount(prev => prev + newInfos.length)
            if (!lockedLabels) {
                const valid = detectedHeaders.filter(h => h)
                if (valid.length) {
                    const unique = []
                    for (const h of valid) if (!unique.find(u => u.xLabel === h.xLabel && u.yLabel === h.yLabel)) unique.push(h)
                    if (unique.length === 1) { setXLabel(unique[0].xLabel); setYLabel(unique[0].yLabel) }
                    else if (unique.length > 1) { setHeaderCandidates(unique); setShowHeaderDialog(true) }
                }
            }
            setXRange(null); setYRange(null)
        })
    }, [traces.length, relabMeta, lockedLabels, presetSelected, activeGroupId])

    const handleFiles = useCallback((e) => {
        const files = Array.from(e.target.files || [])
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

    const toggleVisibility = useCallback((idx) => { setVisibility(prev => { const next = [...prev]; next[idx] = !next[idx]; return next }) }, [])
    const clearAll = useCallback(() => { setTraces([]); setFilesInfo([]); setVisibility([]); setXRange(null); setYRange(null) }, [])
    const resetZoom = useCallback(() => { setXRange(null); setYRange(null) }, [])

    const applyInlineRange = useCallback((axis) => {
        if (axis === 'x') {
            const min = parseFloat(xMinInput)
            const max = parseFloat(xMaxInput)
            if (Number.isFinite(min) && Number.isFinite(max) && min < max) {
                setXRange([min, max])
            }
        } else if (axis === 'y') {
            const min = parseFloat(yMinInput)
            const max = parseFloat(yMaxInput)
            if (Number.isFinite(min) && Number.isFinite(max) && min < max) {
                setYRange([min, max])
            }
        }
    }, [xMinInput, xMaxInput, yMinInput, yMaxInput])

    const handleRangeKeyDown = useCallback((axis, e) => {
        if (e.key === 'Enter') {
            applyInlineRange(axis)
        }
    }, [applyInlineRange])



    const changeColor = useCallback((idx) => {
        const input = document.createElement('input'); input.type = 'color'
        input.value = traces[idx]?.line?.color || '#000000'
        input.onchange = e => {
            const c = e.target.value
            setTraces(prev => { const next = [...prev]; next[idx] = { ...next[idx], line: { ...next[idx].line, color: c } }; return next })
        }
        input.click()
    }, [traces])

    // 現在のグループのみ表示（グループ選択機能）
    const visibleTraces = useMemo(() => traces.map((t, i) => ({
        ...t,
        visible: visibility[i] !== false && traceGroupIds[i] === activeGroupId
    })), [traces, visibility, traceGroupIds, activeGroupId])

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
        return () => { plotEl.removeEventListener('mousemove', move); plotEl.removeEventListener('mouseleave', leave) }
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

    const layout = useMemo(() => ({
        paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff', margin: { l: 80, r: 30, t: 30, b: 70 },
        xaxis: { title: { text: xLabel, font: { size: 14 } }, autorange: xRange == null, range: xRange ?? undefined, exponentformat: 'none', showexponent: 'none' },
        yaxis: { title: { text: yLabel, font: { size: 14 } }, autorange: yRange == null, range: yRange ?? undefined, exponentformat: 'none', showexponent: 'none' },
        showlegend: false, hovermode: false, dragmode: 'zoom'
    }), [xRange, yRange, xLabel, yLabel])

    const config = useMemo(() => ({ displayModeBar: true, responsive: true, scrollZoom: true, doubleClick: 'reset', editable: false, staticPlot: false }), [])

    const selectHeader = useCallback(h => { setXLabel(h.xLabel); setYLabel(h.yLabel); setShowHeaderDialog(false); setHeaderCandidates([]) }, [])
    const applyLabelPreset = useCallback(preset => {
        const presets = {
            'wavelength-reflectance': { x: 'Wavelength (μm)', y: 'Reflectance' },
            'spacing-intensity': { x: '2θ (°)', y: 'Intensity' },
            'time-temperature': { x: 'Time (s)', y: 'Temperature (°C)' }
        }
        if (presets[preset]) { setXLabel(presets[preset].x); setYLabel(presets[preset].y) }
        setShowLabelDialog(false)
    }, [])
    const applyCustomLabels = useCallback((xLbl, yLbl) => { setXLabel(xLbl); setYLabel(yLbl); setShowLabelDialog(false) }, [])

    const handleInitialPreset = useCallback((preset) => {
        setPresetSelected(preset)
        if (preset !== 'auto') {
            const map = {
                'wavelength-reflectance': { x: 'Wavelength (μm)', y: 'Reflectance' },
                'spacing-intensity': { x: '2θ (°)', y: 'Intensity' },
                'time-temperature': { x: 'Time (s)', y: 'Temperature (°C)' }
            }
            if (map[preset]) { setXLabel(map[preset].x); setYLabel(map[preset].y) }
            setLockedLabels(true)
        } else { setLockedLabels(false) }
        setShowPresetDialog(false)
        setTimeout(() => { const input = document.getElementById('file-input'); if (input) input.click() }, 0)
    }, [])

    React.useEffect(() => {
        if (xRange) { setXMinInput(String(xRange[0])); setXMaxInput(String(xRange[1])) }
        if (yRange) { setYMinInput(String(yRange[0])); setYMaxInput(String(yRange[1])) }
    }, [xRange, yRange])

    // 初期化時に現在の長さからカラーインデックスを初期化（以降は各追加で原子的に更新）
    React.useEffect(() => {
        nextColorIdxRef.current = traces.length % palette.length
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                const files = Array.from(e.dataTransfer?.files || [])
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
            }}
            style={{ outline: isDraggingFiles ? '3px dashed #66a3ff' : 'none', outlineOffset: isDraggingFiles ? 6 : 0 }}
        >
            <div className='toolbar' style={{ position: 'relative' }}>
                <div className='toolbar-icon-buttons'>
                    <IconButton onClick={() => document.getElementById('file-input').click()} disabled={!presetSelected} title={!presetSelected ? 'Add Files (select data type first)' : 'Add Files'}>
                        <AddFileIcon />
                    </IconButton>
                    <IconButton onClick={clearAll} title='Unload All'>
                        <ClearIcon />
                    </IconButton>
                    <IconButton onClick={resetZoom} title='Reset Zoom'>
                        <ZoomResetIcon />
                    </IconButton>
                    <IconButton onClick={() => setShowLabelDialog(true)} title='Axis Labels'>
                        <LabelIcon />
                    </IconButton>
                    {/* Quick Actions removed; group buttons now toggle Show/Hide */}
                </div>
                <input id='file-input' type='file' multiple onChange={handleFiles} style={{ display: 'none' }} />
                {/* 旧グループ管理UI削除 */}
                {Object.keys(relabMeta).length > 0 && <div style={{ marginLeft: 12, fontSize: 12, color: '#444' }}>RELAB XML loaded: {Object.keys(relabMeta).length}</div>}
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
                {/* sort controls moved into legend panel */}
                {/* Zoom説明テキスト削除 */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        right: 16,
                        bottom: 0,
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: 20,
                        color: 'red',
                        whiteSpace: 'nowrap',
                        zIndex: 10,
                        pointerEvents: 'none',
                        height: '100%',
                    }}
                >
                    <span style={{ pointerEvents: 'auto' }}>
                        {dataCoord.x == null || dataCoord.y == null
                            ? '-'
                            : `(${dataCoord.x.toFixed(4)}, ${dataCoord.y.toFixed(4)})`}
                    </span>
                </div>
            </div>
            <div className='main-area'>
                <div className='legend-panel'>
                    {/* グループパネル（ドラッグ＆ドロップで移動/コピー） */}
                    <div className='group-panel'>
                        {groups.map(g => (
                            <div
                                key={g.id}
                                className={`group-item ${g.id === activeGroupId ? 'active' : ''} ${groupToggleState[g.id] === 'hide' ? 'hide' : 'show'}`}
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
                                        const newColorIdx = nextColorIdxRef.current; nextColorIdxRef.current = newColorIdx + 1
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
                            title='Add Group'
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
                                title={legendSortKey === 'filename' ? 'Sorting by File name' : 'Sorting by Extension'}
                                onClick={() => setLegendSortKey(prev => (prev === 'filename' ? 'ext' : 'filename'))}
                            >
                                {legendSortKey === 'filename' ? <NameIcon /> : <ExtIcon />}
                            </button>
                            <button
                                className='icon-button'
                                title={legendSortOrder === 'asc' ? 'Ascending' : 'Descending'}
                                onClick={() => setLegendSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                            >
                                {legendSortOrder === 'asc' ? <ArrowUpIcon /> : <ArrowDownIcon />}
                            </button>
                        </div>
                    </div>
                    {/* sort buttons moved next to group add button */}
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
                            items.sort(compare)
                            return items.map(({ trace, idx }) => (
                                <div
                                    key={idx}
                                    className='legend-item'
                                    draggable
                                    onDragStart={e => {
                                        e.dataTransfer.setData('text/plain', String(idx))
                                    }}
                                >
                                    <input type='checkbox' checked={visibility[idx] !== false} onChange={() => toggleVisibility(idx)} />
                                    {/* Unload(✕)ボタン: 全グループから削除 */}
                                    <button
                                        className='unload-btn'
                                        title='Unload'
                                        onClick={() => {
                                            setTraces(prev => prev.filter((_, i) => i !== idx))
                                            setFilesInfo(prev => prev.filter((_, i) => i !== idx))
                                            setVisibility(prev => prev.filter((_, i) => i !== idx))
                                            setTraceGroupIds(prev => prev.filter((_, i) => i !== idx))
                                        }}
                                    >
                                        <ClearIcon />
                                    </button>
                                    <div className='color-box' style={{ backgroundColor: trace.line.color }} onClick={() => changeColor(idx)} title='Click to change color' />
                                    <div className='filename' title={filesInfo[idx]}>{filesInfo[idx]}</div>
                                </div>
                            ))
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
            {showHeaderDialog && <HeaderSelectDialog candidates={headerCandidates} onSelect={selectHeader} onCancel={() => setShowHeaderDialog(false)} />}
            {showLabelDialog && <LabelSettingDialog currentX={xLabel} currentY={yLabel} onApplyPreset={applyLabelPreset} onApplyCustom={applyCustomLabels} onCancel={() => setShowLabelDialog(false)} />}
            {showPresetDialog && <InitialPresetDialog onSelect={handleInitialPreset} />}

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
                            const hasTraces = traceGroupIds.some(gid => gid === id)
                            if (hasTraces) {
                                alert('Group has data. Move or unload traces before delete.')
                            } else {
                                setGroups(prev => {
                                    const remaining = prev.filter(g => g.id !== id)
                                    // activeGroupIdの更新はprevから計算したremainingに基づいて行う
                                    if (activeGroupId === id) {
                                        setActiveGroupId(remaining.length ? remaining[0].id : null)
                                    }
                                    return remaining
                                })
                                setGroupToggleState(prev => { const { [id]: _omit, ...rest } = prev; return rest })
                            }
                            setGroupContextMenu({ visible: false, x: 0, y: 0, groupId: null })
                        }}>Delete</button>
                        <button onClick={() => {
                            const id = groupContextMenu.groupId
                            setGroupToggleState(prev => {
                                const nextState = prev[id] === 'show' ? 'hide' : 'show'
                                setVisibility(vPrev => vPrev.map((v, i) => traceGroupIds[i] === id ? (nextState === 'show') : v))
                                return { ...prev, [id]: nextState }
                            })
                            setGroupContextMenu({ visible: false, x: 0, y: 0, groupId: null })
                        }}>{groupToggleState[groupContextMenu.groupId] === 'show' ? 'Hide All' : 'Show All'}</button>
                        <button onClick={() => setGroupContextMenu({ visible: false, x: 0, y: 0, groupId: null })}>Close</button>
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
    const presets = {
        'wavelength-reflectance': { x: 'Wavelength (μm)', y: 'Reflectance', icon: <ReflectanceSpectrumIcon />, label: 'Reflectance Spectra' },
        'spacing-intensity': { x: '2θ (°)', y: 'Intensity', icon: <XRDIcon />, label: 'XRD Pattern' },
        'time-temperature': { x: 'Time (s)', y: 'Temperature (°C)', icon: <ThermometerIcon />, label: 'Temperature Profile' }
    }
    const handleSelectPreset = (p) => {
        setSelectedPreset(p)
        if (presets[p]) { setCustomX(presets[p].x); setCustomY(presets[p].y) }
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
                    <button className='apply-btn' onClick={apply}>Apply</button>
                    <button className='cancel-btn' onClick={onCancel}>Cancel</button>
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
                    </button>
                    <button className='datatype-icon-btn' onClick={() => onSelect('spacing-intensity')} title='CSV, ASC'>
                        <XRDIcon />
                        <span>XRD Pattern</span>
                    </button>
                    <button className='datatype-icon-btn' onClick={() => onSelect('time-temperature')} title='TXT (InfraWin)'>
                        <ThermometerIcon />
                        <span>Temperature Profile</span>
                    </button>
                    <button className='datatype-icon-btn' onClick={() => onSelect('auto')} title='TAB, CSV, TXT'>
                        <AutoDetectIcon />
                        <span>Auto</span>
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

// (RangeDialog and AxisContextMenu removed per request)
