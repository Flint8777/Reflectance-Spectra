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
        const parts = t.split(/[\s,;\t]+/).filter(Boolean)
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

export default function App() {
    const [traces, setTraces] = useState([])
    const [filesInfo, setFilesInfo] = useState([])
    const [visibility, setVisibility] = useState([]) // track visibility per trace
    const [xRange, setXRange] = useState(null)
    const [yRange, setYRange] = useState(null)
    const [cross, setCross] = useState({ x: null, y: null }) // pixel position
    // RELAB PDS4 メタ情報保持: tabファイル名(lowercase) -> { wlLoc, wlLen, rfLoc, rfLen, recordCount }
    const [relabMeta, setRelabMeta] = useState({})
    const plotRef = useRef(null)
    const animFrame = useRef(0)

    const onRelayout = useCallback((ev) => {
        // Update ranges from relayout event keys
        const xr0 = ev['xaxis.range[0]'] ?? ev['xaxis.autorange'] === true ? null : undefined
        const xr1 = ev['xaxis.range[1]'] ?? undefined
        const yr0 = ev['yaxis.range[0]'] ?? ev['yaxis.autorange'] === true ? null : undefined
        const yr1 = ev['yaxis.range[1]'] ?? undefined

        setXRange((prev) => {
            if (xr0 !== undefined && xr1 !== undefined) return [Number(ev['xaxis.range[0]']), Number(ev['xaxis.range[1]'])]
            return prev
        })
        setYRange((prev) => {
            if (yr0 !== undefined && yr1 !== undefined) return [Number(ev['yaxis.range[0]']), Number(ev['yaxis.range[1]'])]
            return prev
        })
    }, [])

    const handleFiles = useCallback((e) => {
        const files = Array.from(e.target.files || [])
        if (files.length === 0) return

        const newTraces = []
        const newInfos = []

        let colorIdx = traces.length % palette.length

        const tasks = files.map((file) => new Promise((resolve) => {
            const lowerName = file.name.toLowerCase()
            const ext = lowerName.split('.').pop()

            // 1) CSV
            if (ext === 'csv') {
                Papa.parse(file, {
                    header: false,
                    dynamicTyping: true,
                    skipEmptyLines: true,
                    complete: (res) => {
                        const x = []
                        const y = []
                        for (const row of res.data) {
                            if (!row || row.length < 2) continue
                            const xv = Number(row[0])
                            const yv = Number(row[1])
                            if (Number.isFinite(xv) && Number.isFinite(yv)) { x.push(xv); y.push(yv) }
                        }
                        newTraces.push({
                            x, y,
                            type: 'scattergl',
                            mode: 'lines',
                            line: { color: palette[colorIdx % palette.length], width: 1.5 },
                            name: file.name,
                        })
                        newInfos.push(file.name); colorIdx++
                        resolve()
                    }
                })
                return
            }

            // 2) RELAB PDS4 XML ラベル
            if (ext === 'xml') {
                const reader = new FileReader()
                reader.onload = () => {
                    const xmlText = String(reader.result)
                    try {
                        const meta = extractRelabMeta(xmlText)
                        if (meta && meta.tabFileName) {
                            setRelabMeta(prev => ({ ...prev, [meta.tabFileName.toLowerCase()]: meta }))
                        }
                    } catch (err) {
                        console.warn('RELAB XML parse failed:', err)
                    }
                    resolve() // XML自体はトレース追加しない
                }
                reader.readAsText(file)
                return
            }

            // 3) RELAB TAB (固定幅) もしくは DPT-like fallback
            if (ext === 'tab') {
                const reader = new FileReader()
                reader.onload = () => {
                    const raw = String(reader.result)
                    const meta = relabMeta[lowerName]
                    let x = []
                    let y = []
                    if (meta) {
                        try {
                            const parsed = parseRelabTab(raw, meta)
                            x = parsed.x; y = parsed.y
                        } catch (err) {
                            console.warn('RELAB TAB parse failed, fallback to whitespace parse:', err)
                            const fallback = parseDPT(raw)
                            x = fallback.x; y = fallback.y
                        }
                    } else {
                        // XMLが無い場合は通常テキストパースへフォールバック
                        const p = parseDPT(raw)
                        x = p.x; y = p.y
                    }
                    // nm -> μm 推定変換: 平均値が 100 より大きければ nm とみなし 1000 で割る
                    if (x.length > 0) {
                        const avg = x.reduce((a, b) => a + b, 0) / x.length
                        if (avg > 100) x = x.map(v => v / 1000)
                    }
                    newTraces.push({
                        x, y,
                        type: 'scattergl',
                        mode: 'lines',
                        line: { color: palette[colorIdx % palette.length], width: 1.5 },
                        name: file.name,
                    })
                    newInfos.push(file.name); colorIdx++
                    resolve()
                }
                reader.readAsText(file)
                return
            }

            // 4) その他拡張子は DPT-like テキストとして扱う
            const reader = new FileReader()
            reader.onload = () => {
                const { x, y } = parseDPT(String(reader.result))
                newTraces.push({
                    x, y,
                    type: 'scattergl',
                    mode: 'lines',
                    line: { color: palette[colorIdx % palette.length], width: 1.5 },
                    name: file.name,
                })
                newInfos.push(file.name); colorIdx++
                resolve()
            }
            reader.readAsText(file)
        }))

        Promise.all(tasks).then(() => {
            setTraces((prev) => [...prev, ...newTraces])
            setFilesInfo((prev) => [...prev, ...newInfos])
            setVisibility((prev) => [...prev, ...newTraces.map(() => true)])
            // After first load, set autorange to fit
            setXRange(null); setYRange(null)
        })
    }, [traces.length])

    const toggleVisibility = useCallback((idx) => {
        setVisibility(prev => {
            const next = [...prev]
            next[idx] = !next[idx]
            return next
        })
    }, [])

    const clearAll = useCallback(() => {
        setTraces([])
        setFilesInfo([])
        setVisibility([])
        setXRange(null)
        setYRange(null)
    }, [])

    const resetZoom = useCallback(() => {
        setXRange(null)
        setYRange(null)
    }, [])

    const changeColor = useCallback((idx) => {
        // HTML5 color pickerで色を選択
        const input = document.createElement('input')
        input.type = 'color'
        input.value = traces[idx]?.line?.color || '#000000'
        input.addEventListener('change', (e) => {
            const newColor = e.target.value
            setTraces(prev => {
                const next = [...prev]
                next[idx] = {
                    ...next[idx],
                    line: { ...next[idx].line, color: newColor }
                }
                return next
            })
        })
        input.click()
    }, [traces])

    const visibleTraces = useMemo(() => {
        return traces.map((t, i) => ({ ...t, visible: visibility[i] !== false }))
    }, [traces, visibility])

    // Convert pixel position to data coordinates using current layout
    const pixelToData = useCallback((px, py) => {
        const plotEl = plotRef.current?.el
        const gd = plotEl && plotEl._fullLayout
        if (!gd) return { x: null, y: null }

        const bbox = plotEl.getBoundingClientRect()
        const left = gd._plotContainer.getBoundingClientRect().left
        const top = gd._plotContainer.getBoundingClientRect().top

        const xaxis = gd.xaxis
        const yaxis = gd.yaxis
        // Use axis pixel<->data converters if present
        const xVal = xaxis.p2l ? xaxis.p2l(px - xaxis._offset) : null
        const yVal = yaxis.p2l ? yaxis.p2l(py - yaxis._offset) : null

        return { x: xVal, y: yVal }
    }, [])

    const onMouseMove = useCallback((ev) => {
        // throttle with rAF
        if (animFrame.current) cancelAnimationFrame(animFrame.current)

        const plotEl = plotRef.current?.el
        if (!plotEl) return

        const rect = plotEl.getBoundingClientRect()
        const px = ev.clientX - rect.left
        const py = ev.clientY - rect.top

        animFrame.current = requestAnimationFrame(() => {
            setCross({ x: Math.max(0, Math.min(rect.width, px)), y: Math.max(0, Math.min(rect.height, py)) })
        })
    }, [])

    // Plotly要素にマウスリスナーを直接追加
    React.useEffect(() => {
        const plotEl = plotRef.current?.el
        if (!plotEl) return

        const handleMouseMove = (ev) => onMouseMove(ev)
        const handleMouseLeave = () => setCross({ x: null, y: null })

        plotEl.addEventListener('mousemove', handleMouseMove)
        plotEl.addEventListener('mouseleave', handleMouseLeave)

        return () => {
            plotEl.removeEventListener('mousemove', handleMouseMove)
            plotEl.removeEventListener('mouseleave', handleMouseLeave)
        }
    }, [onMouseMove])

    const dataCoord = useMemo(() => {
        if (!plotRef.current || cross.x == null || cross.y == null) return { x: null, y: null }
        const plotEl = plotRef.current.el
        const gd = plotEl && plotEl._fullLayout
        if (!gd) return { x: null, y: null }

        const xaxis = gd.xaxis
        const yaxis = gd.yaxis
        const xVal = xaxis.p2l ? xaxis.p2l(cross.x - xaxis._offset) : null
        const yVal = yaxis.p2l ? yaxis.p2l(cross.y - yaxis._offset) : null
        return { x: xVal, y: yVal }
    }, [cross])

    const layout = useMemo(() => ({
        paper_bgcolor: '#ffffff',
        plot_bgcolor: '#ffffff',
        margin: { l: 60, r: 20, t: 20, b: 50 },
        xaxis: { title: 'Wavelength (μm)', autorange: xRange == null, range: xRange ?? undefined },
        yaxis: { title: 'Reflectance', autorange: yRange == null, range: yRange ?? undefined },
        showlegend: false,  // 左側の凡例パネルを使うのでPlotlyの凡例は非表示
        hovermode: false,
        dragmode: 'zoom',
    }), [xRange, yRange])

    const config = useMemo(() => ({
        displayModeBar: true,
        responsive: true,
        scrollZoom: true,
        doubleClick: 'reset',
        // performance hints
        editable: false,
        staticPlot: false,
    }), [])

    return (
        <div className="app">
            <div className="toolbar">
                <button onClick={() => document.getElementById('file-input').click()}>
                    ファイルを追加
                </button>
                <input
                    id="file-input"
                    type="file"
                    multiple
                    onChange={handleFiles}
                    style={{ display: 'none' }}
                />
                {/* TODO: RELAB: XML→TAB の関連性をUI表示（XML読み込み済みメタ数など） */}
                {Object.keys(relabMeta).length > 0 && (
                    <div style={{ marginLeft: '12px', fontSize: '12px', color: '#444' }}>
                        RELAB XML 読込: {Object.keys(relabMeta).length} 件
                    </div>
                )}
                <button onClick={clearAll}>全てクリア</button>
                <button onClick={resetZoom}>ズームリセット</button>
                <div style={{ marginLeft: '12px', fontSize: '14px' }}>
                    読込数: {traces.length}
                </div>
                <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#666' }}>
                    ズーム: ドラッグで矩形選択 | ダブルクリックでリセット
                </div>
            </div>
            <div className="main-area">
                {/* 左側の凡例パネル */}
                <div className="legend-panel">
                    <div className="legend-title">スペクトル一覧</div>
                    <div className="legend-scroll">
                        {traces.map((trace, idx) => (
                            <div key={idx} className="legend-item">
                                <input
                                    type="checkbox"
                                    checked={visibility[idx] !== false}
                                    onChange={() => toggleVisibility(idx)}
                                />
                                <div
                                    className="color-box"
                                    style={{ backgroundColor: trace.line.color }}
                                    onClick={() => changeColor(idx)}
                                    title="クリックして色を変更"
                                />
                                <div className="filename" title={filesInfo[idx]}>
                                    {filesInfo[idx]}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {/* 右側のグラフエリア */}
                <div className="viewer">
                    <div className="plot-wrap">
                        <Plot
                            ref={plotRef}
                            data={visibleTraces}
                            layout={layout}
                            config={config}
                            onRelayout={onRelayout}
                            style={{ width: '100%', height: '100%' }}
                            useResizeHandler
                        />
                    </div>
                    {/* crosshair overlay - イベントは通すが、十字線だけ表示 */}
                    <div className="crosshair-overlay">
                        {cross.x != null && cross.y != null && (
                            <div className="crosshair-layer">
                                <div className="cross-vert" style={{ left: cross.x }} />
                                <div className="cross-hori" style={{ top: cross.y }} />
                            </div>
                        )}
                    </div>
                    {/* 座標表示 - 独立した要素として配置 */}
                    <div className="coords">
                        {dataCoord.x == null ? (
                            <div>Move mouse on plot</div>
                        ) : (
                            <div>
                                <div>Wavelength: {dataCoord.x.toFixed(5)} μm</div>
                                <div>Reflectance: {dataCoord.y.toFixed(5)}</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ===== RELAB パーサ補助関数 =====
// XML から TAB ファイル名と Wavelength/Reflectance の field_location/field_length, records を抽出
function extractRelabMeta(xmlText) {
    // <file_name>something.tab</file_name>
    const fileNameMatch = xmlText.match(/<file_name>([^<]+)</file_name>/i)
    if (!fileNameMatch) throw new Error('file_name not found in XML')
    const tabFileName = fileNameMatch[1].trim()

    const recordsMatch = xmlText.match(/<records>(\d+)<\/records>/i)
    const recordCount = recordsMatch ? Number(recordsMatch[1]) : null

    // Regex to capture Field_Character blocks for Wavelength and Reflectance
    const wlBlock = xmlText.match(/<Field_Character>[\s\S]*?<name>Wavelength<\/name>[\s\S]*?<field_location unit="byte">(\d+)<\/field_location>[\s\S]*?<field_length unit="byte">(\d+)<\/field_length>[\s\S]*?<\/Field_Character>/i)
    const rfBlock = xmlText.match(/<Field_Character>[\s\S]*?<name>Reflectance<\/name>[\s\S]*?<field_location unit="byte">(\d+)<\/field_location>[\s\S]*?<field_length unit="byte">(\d+)<\/field_length>[\s\S]*?<\/Field_Character>/i)
    if (!wlBlock || !rfBlock) throw new Error('Wavelength/Reflectance field definitions not found')

    const wlLoc = Number(wlBlock[1]) - 1 // convert to 0-based
    const wlLen = Number(wlBlock[2])
    const rfLoc = Number(rfBlock[1]) - 1
    const rfLen = Number(rfBlock[2])

    return { tabFileName: tabFileName.toLowerCase(), wlLoc, wlLen, rfLoc, rfLen, recordCount }
}

function parseRelabTab(rawText, meta) {
    const { wlLoc, wlLen, rfLoc, rfLen, recordCount } = meta
    const norm = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = norm.split('\n')
    const x = []
    const y = []
    let headerSkipped = false
    for (const ln of lines) {
        if (!ln.trim()) continue
        const stripped = ln.trim()
        // レコード数行のスキップ
        if (!headerSkipped && recordCount && /^\d+$/.test(stripped) && Number(stripped) === recordCount) {
            headerSkipped = true
            continue
        }
        // 英字開始行をメタ情報開始とみなし終了
        if (/^[A-Za-z]/.test(stripped)) break
        if (ln.length < Math.max(wlLoc + wlLen, rfLoc + rfLen)) continue
        const wlStr = ln.slice(wlLoc, wlLoc + wlLen).trim()
        const rfStr = ln.slice(rfLoc, rfLoc + rfLen).trim()
        if (!wlStr || !rfStr) continue
        const wlVal = Number(wlStr)
        const rfVal = Number(rfStr)
        if (!Number.isFinite(wlVal) || !Number.isFinite(rfVal)) continue
        x.push(wlVal); y.push(rfVal)
        if (recordCount && x.length >= recordCount) break
    }
    if (x.length === 0) throw new Error('No numeric data parsed from TAB')
    return { x, y }
}
