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

        const tasks = files.map((file, idx) => new Promise((resolve) => {
            const ext = file.name.toLowerCase().split('.').pop()
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
                            if (Number.isFinite(xv) && Number.isFinite(yv)) {
                                x.push(xv); y.push(yv)
                            }
                        }
                        newTraces.push({
                            x, y,
                            type: 'scattergl',
                            mode: 'lines',
                            line: { color: palette[colorIdx % palette.length], width: 1.5 },
                            name: file.name,
                        })
                        newInfos.push(file.name)
                        colorIdx++
                        resolve()
                    }
                })
            } else {
                // treat as DPT-like text
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
                    newInfos.push(file.name)
                    colorIdx++
                    resolve()
                }
                reader.readAsText(file)
            }
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
