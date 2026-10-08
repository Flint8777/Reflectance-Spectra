import Papa from 'papaparse';
import PlotlyDefault from 'plotly.js-dist-min';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import createPlotlyComponentDefault from 'react-plotly.js/factory';
import {
    BulkUnitDialog,
    ConfirmDialog,
    cleanIpcErrorMessage,
    ExportDialog,
    HeaderSelectDialog,
    InitialPresetDialog,
    LabelSettingDialog,
    NormalizationDialog,
    NoticeBanner,
    StackDialog,
    UpdateDialog,
} from './components/dialogs.jsx';
import {
    AddFileIcon,
    ArrowDownIcon,
    ArrowUpIcon,
    AutoFitYIcon,
    CustomOrderIcon,
    ExportIcon,
    ExtIcon,
    IconButton,
    LabelIcon,
    NameIcon,
    NormalizeIcon,
    StackIcon,
    UnloadIcon,
    UpdateIcon,
    ZoomResetIcon,
} from './components/icons.jsx';
import { PRESET_LABELS, palette } from './constants.js';
import {
    findYatX,
    normalizeAtX,
    normalizeByMaxInRange,
    scaleToUnit,
    scaleToUnitInRange,
} from './lib/normalization.js';
import {
    buildExportFigure,
    minorDtick,
    pickLegendPlacement,
} from './lib/plotLayout.js';
import {
    extractRelabMeta,
    isRelabTabFile,
    parseDPT,
    parseRelabTab,
    parseWhitespaceSeparated,
} from './lib/textParsers.js';
import { isOpusMagic, parseOpusBuffer } from './opusParser.js';

// Vite v8 (Rolldown) が CJS の `__esModule: true` を unwrap せず default 経由で
// `{ default: fn }` を返すため、`.default` フォールバックで実体を取り出す。
// react-plotly.js を factory pattern で使い、軽量な dist-min を Plotly として渡す。
const createPlotlyComponent =
    createPlotlyComponentDefault?.default ?? createPlotlyComponentDefault;
const Plotly = PlotlyDefault?.default ?? PlotlyDefault;
const Plot = createPlotlyComponent(Plotly);

export default function App() {
    const [traces, setTraces] = useState([]);
    const [filesInfo, setFilesInfo] = useState([]);
    const [visibility, setVisibility] = useState([]);
    // 簡易グループ機能: グループ配列と各トレースの所属(groupId)、現在表示グループ
    const [groups, setGroups] = useState([
        { id: '1', name: 'Group 1' },
        { id: '2', name: 'Group 2' },
    ]);
    const [activeGroupId, setActiveGroupId] = useState('1');
    const [traceGroupIds, setTraceGroupIds] = useState([]);
    // グループの表示状態トグル（Show/Hide）
    const [groupToggleState, setGroupToggleState] = useState({
        1: 'show',
        2: 'show',
    });
    const [groupContextMenu, setGroupContextMenu] = useState({
        visible: false,
        x: 0,
        y: 0,
        groupId: null,
    });
    const [xRange, setXRange] = useState(null);
    const [yRange, setYRange] = useState(null);
    const [cross, setCross] = useState({ x: null, y: null });
    const [relabMeta, setRelabMeta] = useState({});
    const plotRef = useRef(null);
    // react-plotly.js v4 は ref にグラフ div を直接渡す（v2 は instance.el にDOMを持つ）。両対応で取り出す。
    const getPlotEl = useCallback(
        () => plotRef.current?.el ?? plotRef.current,
        [],
    );
    const animFrame = useRef(0);
    // 次のカラーインデックスをトラックし、複数回の追加でも重複しないようにする
    // グループごとの独立カラーカウンタ: { [groupId]: nextPaletteIdx }
    // グループが空になったら該当キーを削除して次回 0 から再スタート
    const groupColorCountersRef = useRef({});

    const [xLabel, setXLabel] = useState('Wavelength (μm)');
    const [yLabel, setYLabel] = useState('Reflectance');
    const [headerCandidates, setHeaderCandidates] = useState([]);
    const [showHeaderDialog, setShowHeaderDialog] = useState(false);
    // これまでにユーザーが選択 / 却下したヘッダー組（再問合せ抑制）
    const [seenHeaders, setSeenHeaders] = useState([]);
    const [showLabelDialog, setShowLabelDialog] = useState(false);
    const [presetSelected, setPresetSelected] = useState(null);
    const [showPresetDialog, setShowPresetDialog] = useState(true);
    const [lockedLabels, setLockedLabels] = useState(false);
    const [unitQueryFiles, setUnitQueryFiles] = useState([]);
    const [unitDialogVisible, setUnitDialogVisible] = useState(false);
    const [unitSelections, setUnitSelections] = useState([]); // 'nm' or 'um' per file
    const [immediateReflectanceFiles, setImmediateReflectanceFiles] = useState(
        [],
    );
    const [xMinInput, setXMinInput] = useState('');
    const [xMaxInput, setXMaxInput] = useState('');
    const [yMinInput, setYMinInput] = useState('');
    const [yMaxInput, setYMaxInput] = useState('');
    const [isDraggingFiles, setIsDraggingFiles] = useState(false);
    // Plotly 自身のズーム状態: onRelayout が発火しないケースも捕捉するため、直接監視する
    const [plotIsZoomed, setPlotIsZoomed] = useState(false);
    const [legendSortKey, setLegendSortKey] = useState('filename'); // 'filename' | 'ext' | 'custom'
    const [legendSortOrder, setLegendSortOrder] = useState('asc'); // 'asc' | 'desc'
    // 同一ファイル内の複数スペクトル群を凡例で展開するかどうか (ファイル名キー集合)
    const [expandedFiles, setExpandedFiles] = useState(() => new Set());
    const [dragOverLegend, setDragOverLegend] = useState(null); // { idx, position: 'before'|'after' } | null

    // 規格化関連: 'none' | 'wavelength' | 'max'
    const [normalizationMode, setNormalizationMode] = useState('none');
    const [normalizationWavelength, setNormalizationWavelength] = useState(2.0);
    // 最大値規格化の参照範囲: 'view'（表示範囲内）| 'all'（全範囲）
    const [normalizationMaxScope, setNormalizationMaxScope] = useState('view');
    const [showNormalizationDialog, setShowNormalizationDialog] =
        useState(false);

    // 確認ダイアログ（Unload All / Close Group 共通）
    const [confirmState, setConfirmState] = useState(null);

    // 通知バナー: { type: 'warning'|'error'|'info', message: string, id: number } | null
    const [notice, setNotice] = useState(null);

    // スタック表示関連: 各スペクトルを単位高さにスケールして縦にオフセットする
    const [stackEnabled, setStackEnabled] = useState(false);
    const [stackGap, setStackGap] = useState(0);
    const [showStackDialog, setShowStackDialog] = useState(false);
    const [showExportDialog, setShowExportDialog] = useState(false);

    // アップデート関連
    const [updateStatus, setUpdateStatus] = useState('idle'); // 'idle'|'checking'|'available'|'downloading'|'downloaded'|'no-update'|'error'
    const [updateInfo, setUpdateInfo] = useState(null);
    const [downloadProgress, setDownloadProgress] = useState(null);
    const [updateError, setUpdateError] = useState(null);
    // 関連付け・起動引数で渡されたファイル。データタイプを選ぶまで保留する
    const [pendingOpenFiles, setPendingOpenFiles] = useState([]);
    const [showUpdateDialog, setShowUpdateDialog] = useState(false);
    const [platform, setPlatform] = useState(null);

    const onRelayout = useCallback((ev) => {
        const haveX =
            ev['xaxis.range[0]'] !== undefined &&
            ev['xaxis.range[1]'] !== undefined;
        const haveY =
            ev['yaxis.range[0]'] !== undefined &&
            ev['yaxis.range[1]'] !== undefined;
        if (haveX)
            setXRange([
                Number(ev['xaxis.range[0]']),
                Number(ev['xaxis.range[1]']),
            ]);
        if (haveY)
            setYRange([
                Number(ev['yaxis.range[0]']),
                Number(ev['yaxis.range[1]']),
            ]);
    }, []);

    const parseAndAddFiles = useCallback(
        (files, unitOverride = null) => {
            if (!files?.length) return;
            const newTraces = [];
            const newInfos = [];
            const newGroupIds = [];
            const detectedHeaders = [];
            const newVisibility = []; // 既定 true。OPUS Series で raw を隠す等の用途で個別指定

            // パース完了は非同期順なのでここでは色を割り当てず、後でファイル名昇順に確定する
            const addTrace = (x, y, file, header) => {
                newTraces.push({
                    x,
                    y,
                    type: 'scattergl',
                    mode: 'lines',
                    line: { width: 1.5 },
                    name: file.name,
                });
                newInfos.push(file.name);
                newGroupIds.push(activeGroupId);
                detectedHeaders.push(header);
                newVisibility.push(true);
            };

            const tasks = files.map(
                (file) =>
                    new Promise((resolve) => {
                        const lname = file.name.toLowerCase();
                        const ext = lname.split('.').pop();

                        // OPUS バイナリ (.0 / .0001 / .opus 等) は ArrayBuffer 経路で処理
                        if (/^\d+$/.test(ext) || ext === 'opus') {
                            const binReader = new FileReader();
                            binReader.onload = () => {
                                const ab = binReader.result;
                                if (!isOpusMagic(ab)) {
                                    resolve();
                                    return;
                                }
                                const result = parseOpusBuffer(ab);
                                if (!result?.spectra.length) {
                                    resolve();
                                    return;
                                }
                                let spectra = result.spectra;
                                if (
                                    presetSelected === 'wavelength-reflectance'
                                ) {
                                    // 波長軸のスペクトルだけに絞る（PNT/LGW 等の Trace 軸は除外）
                                    spectra = spectra.filter(
                                        (sp) =>
                                            sp.dxu === 'WN' || sp.dxu === 'MI',
                                    );
                                    // OPUS は同一物理スペクトルを WN/MI 両方で保存することがあるので MI を優先
                                    // Series の場合は seriesIndex ごとに別物として dedup する
                                    const byKey = new Map();
                                    for (const sp of spectra) {
                                        const idxPart =
                                            sp.seriesIndex !== undefined
                                                ? `#${sp.seriesIndex}`
                                                : '';
                                        const k = sp.key + idxPart;
                                        if (!byKey.has(k)) byKey.set(k, []);
                                        byKey.get(k).push(sp);
                                    }
                                    const filtered = [];
                                    for (const list of byKey.values()) {
                                        const miOnes = list.filter(
                                            (s) => s.dxu === 'MI',
                                        );
                                        if (
                                            miOnes.length &&
                                            list.some((s) => s.dxu === 'WN')
                                        )
                                            filtered.push(...miOnes);
                                        else filtered.push(...list);
                                    }
                                    spectra = filtered;
                                }
                                // Series ファイルかつ較正済 (ratioed) が存在する場合、raw な単一チャンネル
                                // (Sample 'sm' / Reference 'rf') をデフォルト非表示にする
                                const isRawChannel = (sp) =>
                                    sp.key.endsWith('sm') ||
                                    sp.key.endsWith('rf');
                                const hasSeries = spectra.some(
                                    (sp) => sp.seriesIndex !== undefined,
                                );
                                const hasCalibrated = spectra.some(
                                    (sp) => !isRawChannel(sp),
                                );
                                const hideRawByDefault =
                                    hasSeries && hasCalibrated;
                                for (const sp of spectra) {
                                    let x = sp.x;
                                    // OPUS の DXU=WN（cm⁻¹）→ wavelength-reflectance プリセット時のみ μm に変換
                                    if (
                                        presetSelected ===
                                            'wavelength-reflectance' &&
                                        sp.dxu === 'WN'
                                    ) {
                                        x = x.map((v) =>
                                            Number.isFinite(v) && v !== 0
                                                ? 10000 / v
                                                : NaN,
                                        );
                                    }
                                    // 表示名: Series なら #N インデックス、複数スペクトルならラベル付き
                                    // 手動マイクロ FT-IR では位置情報が記録されないため、時刻ではなく順序番号を採用
                                    const labelWithIdx =
                                        sp.seriesIndex !== undefined
                                            ? `${sp.label} #${sp.seriesIndex + 1}`
                                            : sp.label;
                                    const displayName =
                                        spectra.length > 1
                                            ? `${file.name} [${labelWithIdx}]`
                                            : file.name;
                                    newTraces.push({
                                        x,
                                        y: Array.from(sp.y),
                                        type: 'scattergl',
                                        mode: 'lines',
                                        line: { width: 1.5 },
                                        name: displayName,
                                    });
                                    newInfos.push(file.name);
                                    newGroupIds.push(activeGroupId);
                                    detectedHeaders.push(
                                        PRESET_LABELS['wavelength-reflectance'],
                                    );
                                    newVisibility.push(
                                        !(hideRawByDefault && isRawChannel(sp)),
                                    );
                                }
                                if (!lockedLabels) {
                                    setXLabel(
                                        PRESET_LABELS['wavelength-reflectance']
                                            .x,
                                    );
                                    setYLabel(
                                        PRESET_LABELS['wavelength-reflectance']
                                            .y,
                                    );
                                }
                                resolve();
                            };
                            binReader.onerror = () => resolve();
                            binReader.readAsArrayBuffer(file);
                            return;
                        }

                        const reader = new FileReader();
                        reader.onload = () => {
                            const text = String(reader.result);
                            const lines = text.split(/\r?\n/);

                            const isTimeTemp =
                                lines.length > 1 &&
                                lines[1]
                                    .trim()
                                    .includes(
                                        'This document contains measurement data of the following devices:',
                                    );
                            if (isTimeTemp) {
                                const headerIdx = lines.findIndex(
                                    (l) =>
                                        l.includes('No.') &&
                                        l.includes('Date') &&
                                        l.includes('Temperature'),
                                );
                                if (headerIdx === -1) {
                                    resolve();
                                    return;
                                }
                                const headerLine = lines[headerIdx];
                                const headers = headerLine
                                    .split('\t')
                                    .map((h) => h.trim());
                                const dataLines = lines
                                    .slice(headerIdx + 2)
                                    .filter((l) => l.trim());
                                const xIdx = headers.findIndex(
                                    (h) =>
                                        h.includes('Sec.') &&
                                        h.includes('00:00'),
                                );
                                const yIdx = headers.indexOf('Temperature');
                                if (xIdx === -1 || yIdx === -1) {
                                    resolve();
                                    return;
                                }
                                const x = [];
                                const y = [];
                                for (const dl of dataLines) {
                                    const cols = dl
                                        .split('\t')
                                        .map((c) => c.trim());
                                    const xv = Number(cols[xIdx]);
                                    const yv = Number(cols[yIdx]);
                                    if (
                                        Number.isFinite(xv) &&
                                        Number.isFinite(yv)
                                    ) {
                                        x.push(xv);
                                        y.push(yv);
                                    }
                                }
                                if (x.length) {
                                    const start = x[0];
                                    for (let i = 0; i < x.length; i++)
                                        x[i] -= start;
                                }
                                addTrace(
                                    x,
                                    y,
                                    file,
                                    PRESET_LABELS['time-temperature'],
                                );
                                if (!lockedLabels) {
                                    setXLabel(
                                        PRESET_LABELS['time-temperature'].x,
                                    );
                                    setYLabel(
                                        PRESET_LABELS['time-temperature'].y,
                                    );
                                }
                                resolve();
                                return;
                            }

                            if (ext === 'csv') {
                                const nonEmpty = lines.filter(Boolean);
                                if (!nonEmpty.length) {
                                    resolve();
                                    return;
                                }
                                const firstParsed = Papa.parse(nonEmpty[0], {
                                    header: false,
                                }).data[0];
                                let hasHeader = false;
                                let headerX = null;
                                let headerY = null;
                                if (firstParsed && firstParsed.length >= 2) {
                                    const v0 = Number(firstParsed[0]);
                                    const v1 = Number(firstParsed[1]);
                                    if (
                                        !Number.isFinite(v0) ||
                                        !Number.isFinite(v1)
                                    ) {
                                        hasHeader = true;
                                        headerX = String(firstParsed[0]).trim();
                                        headerY = String(firstParsed[1]).trim();
                                    }
                                }
                                Papa.parse(text, {
                                    header: hasHeader,
                                    dynamicTyping: true,
                                    skipEmptyLines: true,
                                    complete: (res) => {
                                        const x = [];
                                        const y = [];
                                        if (hasHeader && res.data.length) {
                                            const fields = Object.keys(
                                                res.data[0],
                                            );
                                            const xKey = fields[0];
                                            const yKey = fields[1] || fields[0];
                                            for (const row of res.data) {
                                                const xv = Number(row[xKey]);
                                                const yv = Number(row[yKey]);
                                                if (
                                                    Number.isFinite(xv) &&
                                                    Number.isFinite(yv)
                                                ) {
                                                    x.push(xv);
                                                    y.push(yv);
                                                }
                                            }
                                        } else {
                                            for (const row of res.data) {
                                                if (!row || row.length < 2)
                                                    continue;
                                                const xv = Number(row[0]);
                                                const yv = Number(row[1]);
                                                if (
                                                    Number.isFinite(xv) &&
                                                    Number.isFinite(yv)
                                                ) {
                                                    x.push(xv);
                                                    y.push(yv);
                                                }
                                            }
                                        }
                                        const xData =
                                            presetSelected ===
                                                'wavelength-reflectance' &&
                                            unitOverride === 'nm'
                                                ? x.map((v) => v / 1000)
                                                : x;
                                        addTrace(
                                            xData,
                                            y,
                                            file,
                                            hasHeader
                                                ? {
                                                      xLabel: headerX,
                                                      yLabel: headerY,
                                                  }
                                                : null,
                                        );
                                        resolve();
                                    },
                                });
                                return;
                            }

                            if (ext === 'xml') {
                                try {
                                    const meta = extractRelabMeta(text);
                                    if (meta?.tabFileName)
                                        setRelabMeta((prev) => ({
                                            ...prev,
                                            [meta.tabFileName.toLowerCase()]:
                                                meta,
                                        }));
                                } catch {}
                                resolve();
                                return;
                            }

                            if (ext === 'tab') {
                                const meta = relabMeta[lname];
                                let x = [],
                                    y = [];
                                if (meta) {
                                    try {
                                        const p = parseRelabTab(text, meta);
                                        x = p.x;
                                        y = p.y;
                                    } catch {
                                        const fb = parseDPT(text);
                                        x = fb.x;
                                        y = fb.y;
                                    }
                                } else if (isRelabTabFile(text)) {
                                    // ここで簡易パースを直接実装
                                    const lines = text
                                        .split(/\r?\n/)
                                        .map((l) => l.trim());
                                    const n = parseInt(lines[0], 10);
                                    for (
                                        let i = 1;
                                        i <= n && i < lines.length;
                                        ++i
                                    ) {
                                        const t = lines[i];
                                        if (!t) continue;
                                        const m = t.match(
                                            /^\s*([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)(?:\s+[-+]?\d+(?:\.\d+)?)?\s*$/,
                                        );
                                        if (m) {
                                            const xv = parseFloat(m[1]);
                                            const yv = parseFloat(m[2]);
                                            if (
                                                Number.isFinite(xv) &&
                                                Number.isFinite(yv)
                                            ) {
                                                x.push(xv);
                                                y.push(yv);
                                            }
                                        }
                                    }
                                } else {
                                    const fb = parseDPT(text);
                                    x = fb.x;
                                    y = fb.y;
                                }
                                // ルール: RELAB TABはnm保存なのでμmへ変換（1/1000）。
                                // 上記はXMLメタあり/なし双方に適用。
                                if (x.length) x = x.map((v) => v / 1000);
                                addTrace(
                                    x,
                                    y,
                                    file,
                                    PRESET_LABELS['wavelength-reflectance'],
                                );
                                if (!lockedLabels) {
                                    setXLabel(
                                        PRESET_LABELS['wavelength-reflectance']
                                            .x,
                                    );
                                    setYLabel(
                                        PRESET_LABELS['wavelength-reflectance']
                                            .y,
                                    );
                                }
                                resolve();
                                return;
                            }

                            if (ext === 'dpt') {
                                const { x, y } = parseDPT(text);
                                if (!x.length) {
                                    resolve();
                                    return;
                                }
                                addTrace(
                                    x,
                                    y,
                                    file,
                                    PRESET_LABELS['wavelength-reflectance'],
                                );
                                if (!lockedLabels) {
                                    setXLabel(
                                        PRESET_LABELS['wavelength-reflectance']
                                            .x,
                                    );
                                    setYLabel(
                                        PRESET_LABELS['wavelength-reflectance']
                                            .y,
                                    );
                                }
                                resolve();
                                return;
                            }

                            if (ext === 'asc') {
                                const { x, y } = parseWhitespaceSeparated(text);
                                if (!x.length) {
                                    resolve();
                                    return;
                                }
                                addTrace(
                                    x,
                                    y,
                                    file,
                                    PRESET_LABELS['spacing-intensity'],
                                );
                                if (!lockedLabels) {
                                    setXLabel(
                                        PRESET_LABELS['spacing-intensity'].x,
                                    );
                                    setYLabel(
                                        PRESET_LABELS['spacing-intensity'].y,
                                    );
                                }
                                resolve();
                                return;
                            }

                            const { x, y } = parseWhitespaceSeparated(text);
                            const xData =
                                presetSelected === 'wavelength-reflectance' &&
                                unitOverride === 'nm'
                                    ? x.map((v) => v / 1000)
                                    : x;
                            addTrace(xData, y, file, null);
                            resolve();
                        };
                        reader.readAsText(file);
                    }),
            );

            Promise.all(tasks).then(() => {
                // 1) ファイル名昇順に色を割り当て（グループ別カラーカウンタを進める）
                const ascIndices = newInfos
                    .map((_, i) => i)
                    .sort((a, b) => {
                        const fa = String(newInfos[a]).toLowerCase();
                        const fb = String(newInfos[b]).toLowerCase();
                        return fa < fb ? -1 : fa > fb ? 1 : 0;
                    });
                for (const i of ascIndices) {
                    const gid = newGroupIds[i];
                    const cIdx = groupColorCountersRef.current[gid] ?? 0;
                    groupColorCountersRef.current[gid] = cIdx + 1;
                    newTraces[i] = {
                        ...newTraces[i],
                        line: {
                            ...newTraces[i].line,
                            color: palette[cIdx % palette.length],
                        },
                    };
                }
                // 2) 内部配列の順序はファイル名の降順（既存の挙動を維持）
                const indices = newInfos.map((_, i) => i);
                indices.sort((a, b) => {
                    const fa = String(newInfos[a]).toLowerCase();
                    const fb = String(newInfos[b]).toLowerCase();
                    if (fa < fb) return 1;
                    if (fa > fb) return -1;
                    return 0;
                });
                const sortedTraces = indices.map((i) => newTraces[i]);
                const sortedInfos = indices.map((i) => newInfos[i]);
                const sortedGroupIds = indices.map((i) => newGroupIds[i]);
                const sortedHeaders = indices.map((i) => detectedHeaders[i]);
                const sortedVisibility = indices.map(
                    (i) => newVisibility[i] !== false,
                );

                // wavenumber ヘッダーを含むトレースの位置 (sorted 配列内)
                const wnIndices = [];
                for (let i = 0; i < sortedHeaders.length; i++) {
                    const h = sortedHeaders[i];
                    if (h && /wavenumber/i.test(h.xLabel)) wnIndices.push(i);
                }

                const commit = (convertWavenumber) => {
                    const finalTraces =
                        convertWavenumber && wnIndices.length
                            ? sortedTraces.map((t, i) => {
                                  if (!wnIndices.includes(i)) return t;
                                  const newX = t.x.map((v) =>
                                      Number.isFinite(v) && v !== 0
                                          ? 10000 / v
                                          : NaN,
                                  );
                                  return { ...t, x: newX };
                              })
                            : sortedTraces;

                    setTraces((prev) => [...prev, ...finalTraces]);
                    setFilesInfo((prev) => [...prev, ...sortedInfos]);
                    setVisibility((prev) => [...prev, ...sortedVisibility]);
                    setTraceGroupIds((prev) => [...prev, ...sortedGroupIds]);

                    // ヘッダー処理: 変換した場合は wavenumber → Wavelength (μm) 相当に置換
                    if (!lockedLabels) {
                        const effHeaders = sortedHeaders.map((h) => {
                            if (!h) return h;
                            if (
                                convertWavenumber &&
                                /wavenumber/i.test(h.xLabel)
                            ) {
                                return {
                                    xLabel: 'Wavelength (μm)',
                                    yLabel: h.yLabel,
                                };
                            }
                            return h;
                        });
                        const valid = effHeaders.filter((h) => h);
                        if (valid.length) {
                            const unique = [];
                            for (const h of valid)
                                if (
                                    !unique.find(
                                        (u) =>
                                            u.xLabel === h.xLabel &&
                                            u.yLabel === h.yLabel,
                                    )
                                )
                                    unique.push(h);
                            const isCurrent = (h) =>
                                h.xLabel === xLabel && h.yLabel === yLabel;
                            const isSeen = (h) =>
                                seenHeaders.some(
                                    (s) =>
                                        s.xLabel === h.xLabel &&
                                        s.yLabel === h.yLabel,
                                );
                            const novel = unique.filter(
                                (h) => !isCurrent(h) && !isSeen(h),
                            );
                            if (novel.length === 1) {
                                setXLabel(novel[0].xLabel);
                                setYLabel(novel[0].yLabel);
                                setSeenHeaders((prev) => [...prev, novel[0]]);
                            } else if (novel.length > 1) {
                                setHeaderCandidates(novel);
                                setShowHeaderDialog(true);
                            }
                        }
                    }
                    const addedNames = new Set(sortedInfos);
                    const failedNames = files
                        .filter((f) => {
                            const ext = f.name.toLowerCase().split('.').pop();
                            if (ext === 'xml') return false;
                            return !addedNames.has(f.name);
                        })
                        .map((f) => f.name);
                    if (failedNames.length > 0) {
                        const msg =
                            failedNames.length === 1
                                ? `Failed to parse: ${failedNames[0]}`
                                : `Failed to parse ${failedNames.length} files: ${failedNames.join(', ')}`;
                        setNotice({
                            type: 'error',
                            message: msg,
                            id: Date.now(),
                        });
                    }
                    setXRange(null);
                    setYRange(null);
                };

                if (wnIndices.length > 0) {
                    const n = wnIndices.length;
                    setConfirmState({
                        title: 'Convert Wavenumber to Wavelength?',
                        body: `${n} ${n === 1 ? 'file has' : 'files have'} a Wavenumber header.\nConvert X values from cm⁻¹ to Wavelength (μm) using λ = 10000 / ν?`,
                        confirmLabel: 'Convert',
                        cancelLabel: 'Keep as-is',
                        danger: false,
                        onConfirm: () => commit(true),
                        onDismiss: () => commit(false),
                    });
                } else {
                    commit(false);
                }
            });
        },
        [
            relabMeta,
            lockedLabels,
            presetSelected,
            activeGroupId,
            xLabel,
            yLabel,
            seenHeaders,
        ],
    );

    const classifyAndAddFiles = useCallback(
        (files) => {
            if (!files.length) return;
            if (presetSelected !== 'wavelength-reflectance') {
                parseAndAddFiles(files);
                return;
            }
            const immediate = [];
            const needsUnit = [];
            for (const f of files) {
                const ext = f.name.toLowerCase().split('.').pop();
                // OPUS バイナリは DXU で単位が一意に決まるので nm/μm 確認をスキップ
                if (
                    ext === 'tab' ||
                    ext === 'dpt' ||
                    ext === 'xml' ||
                    /^\d+$/.test(ext) ||
                    ext === 'opus'
                )
                    immediate.push(f);
                else needsUnit.push(f);
            }
            if (needsUnit.length) {
                setUnitQueryFiles(needsUnit);
                setUnitSelections(needsUnit.map(() => 'um'));
                setUnitDialogVisible(true);
                setImmediateReflectanceFiles(immediate);
            } else {
                parseAndAddFiles(immediate);
            }
        },
        [presetSelected, parseAndAddFiles],
    );

    const handleFiles = useCallback(
        (e) => {
            classifyAndAddFiles(Array.from(e.target.files || []));
        },
        [classifyAndAddFiles],
    );

    const toggleVisibility = useCallback((idx) => {
        setVisibility((prev) => {
            const next = [...prev];
            next[idx] = !next[idx];
            return next;
        });
    }, []);

    // 指定インデックス群の可視性を一括設定
    const setVisibilityForIndices = useCallback((indices, visible) => {
        setVisibility((prev) => {
            const next = [...prev];
            for (const i of indices) next[i] = visible;
            return next;
        });
    }, []);

    // 指定インデックス群を一括 unload（Undo 付き）。グループヘッダの × ボタン用
    const unloadIndices = useCallback(
        (indices, displayLabel) => {
            if (!indices.length) return;
            const sorted = [...indices].sort((a, b) => a - b);
            const members = sorted.map((idx) => ({
                trace: traces[idx],
                info: filesInfo[idx],
                visible: visibility[idx],
                groupId: traceGroupIds[idx],
                idx,
            }));
            const colorCounters = { ...groupColorCountersRef.current };
            const toRemove = new Set(sorted);
            setTraces((prev) => prev.filter((_, i) => !toRemove.has(i)));
            setFilesInfo((prev) => prev.filter((_, i) => !toRemove.has(i)));
            setVisibility((prev) => prev.filter((_, i) => !toRemove.has(i)));
            setTraceGroupIds((prev) => prev.filter((_, i) => !toRemove.has(i)));
            const insertAll = (arr, getValue) => {
                const next = [...arr];
                for (const m of members)
                    next.splice(Math.min(m.idx, next.length), 0, getValue(m));
                return next;
            };
            setNotice({
                type: 'info',
                message: `Unloaded "${displayLabel}" (${members.length} traces)`,
                actionLabel: 'Undo',
                actionFn: () => {
                    setTraces((prev) => insertAll(prev, (m) => m.trace));
                    setFilesInfo((prev) => insertAll(prev, (m) => m.info));
                    setVisibility((prev) => insertAll(prev, (m) => m.visible));
                    setTraceGroupIds((prev) =>
                        insertAll(prev, (m) => m.groupId),
                    );
                    groupColorCountersRef.current = colorCounters;
                    setNotice(null);
                },
                id: Date.now(),
            });
        },
        [traces, filesInfo, visibility, traceGroupIds],
    );

    const toggleFileExpanded = useCallback((fname) => {
        setExpandedFiles((prev) => {
            const next = new Set(prev);
            if (next.has(fname)) next.delete(fname);
            else next.add(fname);
            return next;
        });
    }, []);
    const clearAll = useCallback(() => {
        if (!traces.length) return;
        setConfirmState({
            title: 'Unload all spectra?',
            body: 'All loaded spectra will be unloaded from the viewer.',
            confirmLabel: 'Unload',
            danger: true,
            onConfirm: () => {
                setTraces([]);
                setFilesInfo([]);
                setVisibility([]);
                setTraceGroupIds([]);
                setXRange(null);
                setYRange(null);
                setRelabMeta({});
                groupColorCountersRef.current = {};
            },
        });
    }, [traces.length]);
    const resetZoom = useCallback(() => {
        setXRange(null);
        setYRange(null);
        // Plotly 内部 autorange も明示的に戻す（onRelayout 経由で state が更新されないケースに備え）
        const plotEl = getPlotEl();
        if (plotEl && window.Plotly) {
            try {
                window.Plotly.relayout(plotEl, {
                    'xaxis.autorange': true,
                    'yaxis.autorange': true,
                });
            } catch {}
        }
        setPlotIsZoomed(false);
    }, [getPlotEl]);

    // 凡例のドラッグ＆ドロップ並び替え: 全並列配列を同じ順で並べ替え、custom モードへ自動切替
    const reorderLegendItem = useCallback((fromIdx, toIdx, position) => {
        if (fromIdx === toIdx) return;
        const move = (arr) => {
            const next = [...arr];
            const item = next[fromIdx];
            next.splice(fromIdx, 1);
            let insertIdx = toIdx;
            if (fromIdx < toIdx) insertIdx -= 1;
            if (position === 'after') insertIdx += 1;
            next.splice(insertIdx, 0, item);
            return next;
        };
        setTraces((prev) => move(prev));
        setFilesInfo((prev) => move(prev));
        setVisibility((prev) => move(prev));
        setTraceGroupIds((prev) => move(prev));
        setLegendSortKey('custom');
    }, []);

    const applyInlineRange = useCallback(
        (axis) => {
            const parseOrNull = (s) => {
                const t = String(s ?? '').trim();
                if (t === '') return null;
                const v = parseFloat(t);
                return Number.isFinite(v) ? v : null;
            };
            const fullLayout = getPlotEl()?._fullLayout;
            const label = axis.toUpperCase();
            if (axis === 'x') {
                const cur = fullLayout?.xaxis?.range;
                const minVal = parseOrNull(xMinInput);
                const maxVal = parseOrNull(xMaxInput);
                const min =
                    minVal != null ? minVal : cur ? Number(cur[0]) : null;
                const max =
                    maxVal != null ? maxVal : cur ? Number(cur[1]) : null;
                if (Number.isFinite(min) && Number.isFinite(max) && min < max) {
                    setXRange([min, max]);
                } else {
                    setNotice({
                        type: 'warning',
                        message: `Invalid ${label} range: minimum must be less than maximum.`,
                        id: Date.now(),
                    });
                }
            } else if (axis === 'y') {
                const cur = fullLayout?.yaxis?.range;
                const minVal = parseOrNull(yMinInput);
                const maxVal = parseOrNull(yMaxInput);
                const min =
                    minVal != null ? minVal : cur ? Number(cur[0]) : null;
                const max =
                    maxVal != null ? maxVal : cur ? Number(cur[1]) : null;
                if (Number.isFinite(min) && Number.isFinite(max) && min < max) {
                    setYRange([min, max]);
                } else {
                    setNotice({
                        type: 'warning',
                        message: `Invalid ${label} range: minimum must be less than maximum.`,
                        id: Date.now(),
                    });
                }
            }
        },
        [xMinInput, xMaxInput, yMinInput, yMaxInput, getPlotEl],
    );

    const handleRangeKeyDown = useCallback(
        (axis, e) => {
            if (e.key === 'Enter') {
                applyInlineRange(axis);
            }
        },
        [applyInlineRange],
    );

    const changeColor = useCallback((idx) => {
        setTraces((prev) => {
            const input = document.createElement('input');
            input.type = 'color';
            input.value = prev[idx]?.line?.color || '#000000';
            input.onchange = (e) => {
                const c = e.target.value;
                setTraces((p) => {
                    const next = [...p];
                    next[idx] = {
                        ...next[idx],
                        line: { ...next[idx].line, color: c },
                    };
                    return next;
                });
            };
            input.click();
            return prev;
        });
    }, []);

    // カラーサイクル上の次の色へ遷移（palette 外の色からは palette[0] へ）
    const cycleColor = useCallback((idx) => {
        setTraces((prev) => {
            const cur = prev[idx]?.line?.color;
            const curIdx = palette.indexOf(cur);
            const nextIdx = curIdx === -1 ? 0 : (curIdx + 1) % palette.length;
            const next = [...prev];
            next[idx] = {
                ...next[idx],
                line: { ...next[idx].line, color: palette[nextIdx] },
            };
            return next;
        });
    }, []);

    // シングルクリック=次の色 / ダブルクリック=カラーピッカー。クリックタイマー管理
    const colorClickTimerRef = useRef({});
    const handleColorClick = useCallback(
        (idx) => {
            if (colorClickTimerRef.current[idx])
                clearTimeout(colorClickTimerRef.current[idx]);
            colorClickTimerRef.current[idx] = setTimeout(() => {
                cycleColor(idx);
                delete colorClickTimerRef.current[idx];
            }, 250);
        },
        [cycleColor],
    );
    const handleColorDoubleClick = useCallback(
        (idx) => {
            if (colorClickTimerRef.current[idx]) {
                clearTimeout(colorClickTimerRef.current[idx]);
                delete colorClickTimerRef.current[idx];
            }
            changeColor(idx);
        },
        [changeColor],
    );

    // 規格化を適用した派生トレース
    const normalizedTraces = useMemo(() => {
        if (normalizationMode === 'none') return traces;
        return traces.map((t) => {
            if (!t.y?.length) return t;
            if (normalizationMode === 'max') {
                const scopeRange =
                    normalizationMaxScope === 'view' ? xRange : null;
                const newY = normalizeByMaxInRange(t.x, t.y, scopeRange);
                if (!newY || newY === t.y) return t;
                return { ...t, y: newY };
            }
            if (normalizationMode === 'minmax') {
                const scopeRange =
                    normalizationMaxScope === 'view' ? xRange : null;
                const newY = scaleToUnitInRange(t.x, t.y, scopeRange);
                if (!newY || newY === t.y) return t;
                return { ...t, y: newY };
            }
            if (normalizationMode === 'wavelength') {
                const newY = normalizeAtX(t.x, t.y, normalizationWavelength);
                if (!newY) return t;
                return { ...t, y: newY };
            }
            return t;
        });
    }, [
        traces,
        normalizationMode,
        normalizationWavelength,
        normalizationMaxScope,
        xRange,
    ]);

    // 現在のグループで表示中のインデックス一覧（挿入順）
    const visibleIndices = useMemo(() => {
        const out = [];
        for (let i = 0; i < normalizedTraces.length; i++) {
            if (visibility[i] !== false && traceGroupIds[i] === activeGroupId)
                out.push(i);
        }
        return out;
    }, [normalizedTraces, visibility, traceGroupIds, activeGroupId]);

    // 現在のグループのみ表示 + スタック適用（単位高さにスケール後、順位 × offset を加算）
    const visibleTraces = useMemo(() => {
        return normalizedTraces.map((t, i) => {
            const visible =
                visibility[i] !== false && traceGroupIds[i] === activeGroupId;
            if (!visible) return { ...t, visible: false };
            if (!stackEnabled) return { ...t, visible: true };
            const rank = visibleIndices.indexOf(i);
            if (rank < 0) return { ...t, visible: true };
            const scaled = scaleToUnit(t.y);
            // 各スペクトルを [0,1] にスケール。gap=0 なら上下の端が接する形 (step=1)。
            const off = rank * (1 + stackGap);
            const y = off === 0 ? scaled : scaled.map((v) => v + off);
            return { ...t, visible: true, y };
        });
    }, [
        normalizedTraces,
        visibility,
        traceGroupIds,
        activeGroupId,
        stackEnabled,
        stackGap,
        visibleIndices,
    ]);

    // 現在の X 表示範囲における可視トレースの y min/max に合わせて Y 軸を自動調整
    const autoFitY = useCallback(() => {
        let mn = Infinity,
            mx = -Infinity;
        for (const t of visibleTraces) {
            if (!t.visible || !t.x || !t.y || !t.x.length) continue;
            for (let j = 0; j < t.x.length; j++) {
                const x = t.x[j],
                    y = t.y[j];
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                if (xRange && (x < xRange[0] || x > xRange[1])) continue;
                if (y < mn) mn = y;
                if (y > mx) mx = y;
            }
        }
        if (!Number.isFinite(mn) || !Number.isFinite(mx)) return;
        const span = mx - mn;
        const pad =
            span > 0 ? span * 0.05 : Math.max(Math.abs(mn) * 0.05, 1e-6);
        setYRange([mn - pad, mx + pad]);
    }, [visibleTraces, xRange]);

    const onMouseMove = useCallback(
        (ev) => {
            if (animFrame.current) cancelAnimationFrame(animFrame.current);
            const plotEl = getPlotEl();
            if (!plotEl) return;
            const rect = plotEl.getBoundingClientRect();
            const px = ev.clientX - rect.left;
            const py = ev.clientY - rect.top;
            animFrame.current = requestAnimationFrame(() =>
                setCross({
                    x: Math.max(0, Math.min(rect.width, px)),
                    y: Math.max(0, Math.min(rect.height, py)),
                }),
            );
        },
        [getPlotEl],
    );

    React.useEffect(() => {
        const plotEl = getPlotEl();
        if (!plotEl) return;
        const move = (ev) => onMouseMove(ev);
        const leave = () => setCross({ x: null, y: null });
        plotEl.addEventListener('mousemove', move);
        plotEl.addEventListener('mouseleave', leave);
        return () => {
            plotEl.removeEventListener('mousemove', move);
            plotEl.removeEventListener('mouseleave', leave);
            cancelAnimationFrame(animFrame.current);
        };
    }, [onMouseMove, getPlotEl]);

    const dataCoord = useMemo(() => {
        const plotEl = getPlotEl();
        if (!plotEl || cross.x == null || cross.y == null)
            return { x: null, y: null };
        const gd = plotEl._fullLayout;
        if (!gd) return { x: null, y: null };
        const xaxis = gd.xaxis;
        const yaxis = gd.yaxis;
        const xv = xaxis.p2l ? xaxis.p2l(cross.x - xaxis._offset) : null;
        const yv = yaxis.p2l ? yaxis.p2l(cross.y - yaxis._offset) : null;
        return { x: xv, y: yv };
    }, [cross, getPlotEl]);

    const displayYLabel = useMemo(() => {
        let base = yLabel;
        if (normalizationMode === 'wavelength')
            base = `${yLabel} (Normalized @ ${normalizationWavelength})`;
        else if (normalizationMode === 'max') {
            base =
                normalizationMaxScope === 'view'
                    ? `${yLabel} (Normalized to max in view)`
                    : `${yLabel} (Normalized to max)`;
        } else if (normalizationMode === 'minmax') {
            base =
                normalizationMaxScope === 'view'
                    ? `${yLabel} (Min-Max in view)`
                    : `${yLabel} (Min-Max [0, 1])`;
        }
        if (stackEnabled) base = `${base} [Stacked]`;
        return base;
    }, [
        yLabel,
        normalizationMode,
        normalizationWavelength,
        normalizationMaxScope,
        stackEnabled,
    ]);

    const layout = useMemo(
        () => ({
            paper_bgcolor: '#ffffff',
            plot_bgcolor: '#ffffff',
            margin: { l: 80, r: 30, t: 30, b: 70 },
            xaxis: {
                title: { text: xLabel, font: { size: 14 } },
                autorange: xRange == null,
                range: xRange ?? undefined,
                exponentformat: 'none',
                showexponent: 'none',
            },
            yaxis: {
                title: { text: displayYLabel, font: { size: 14 } },
                autorange: yRange == null,
                range: yRange ?? undefined,
                exponentformat: 'none',
                showexponent: 'none',
                showticklabels: !stackEnabled,
            },
            showlegend: false,
            hovermode: false,
            dragmode: 'zoom',
        }),
        [xRange, yRange, xLabel, displayYLabel, stackEnabled],
    );

    const config = useMemo(
        () => ({
            displayModeBar: true,
            responsive: true,
            scrollZoom: true,
            doubleClick: 'reset',
            editable: false,
            staticPlot: false,
        }),
        [],
    );

    const exportFigure = useCallback(
        async (format, scale) => {
            const gd = getPlotEl();
            const width = Math.round(gd?.clientWidth || 1200);
            const height = Math.round(gd?.clientHeight || 800);
            const full = gd?._fullLayout;
            const { data, layout: exportLayout } = buildExportFigure(
                visibleTraces,
                layout,
                {
                    xRange: full?.xaxis?.range ?? xRange,
                    yRange: full?.yaxis?.range ?? yRange,
                },
            );
            const stamp = new Date()
                .toISOString()
                .slice(0, 16)
                .replace(/[-:]/g, '')
                .replace('T', '-');
            // 画面外に SVG レンダラのグラフを起こしてから書き出す
            const holder = document.createElement('div');
            holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;`;
            document.body.appendChild(holder);
            try {
                await Plotly.newPlot(holder, data, exportLayout, {
                    staticPlot: true,
                });
                // dtick も凡例の実寸も、一度描くまで決まらない
                const f = holder._fullLayout;
                const update = {};
                for (const ax of ['xaxis', 'yaxis']) {
                    const a = f?.[ax];
                    if (!a || a.ticks === '') continue;
                    const md = minorDtick(a.dtick);
                    update[`${ax}.minor.ticks`] =
                        md === undefined ? '' : 'outside';
                    if (md !== undefined) update[`${ax}.minor.dtick`] = md;
                }
                if (exportLayout.showlegend && f?.legend) {
                    const plotW = f.xaxis?._length || width;
                    const plotH = f.yaxis?._length || height;
                    const legendH = Math.min(
                        f.legend._height ?? 0,
                        f.legend._maxHeight ?? Number.POSITIVE_INFINITY,
                    );
                    const place = pickLegendPlacement(data, {
                        xRange: f.xaxis?.range,
                        yRange: f.yaxis?.range,
                        boxW: (f.legend._width ?? 0) / plotW,
                        boxH: legendH / plotH,
                        aspect: plotW / plotH,
                    });
                    if (place.clear) {
                        update['legend.orientation'] = 'v';
                        update['legend.x'] = place.x;
                        update['legend.y'] = place.y;
                        update['legend.xanchor'] = place.xanchor;
                        update['legend.yanchor'] = place.yanchor;
                    } else {
                        // 中に置ける空きが無い図（スタック・密なズーム）は
                        // プロットの上へ横並びで逃がす。幅は削られない
                        update['legend.orientation'] = 'h';
                        update['legend.x'] = 0;
                        update['legend.y'] = 1.02;
                        update['legend.xanchor'] = 'left';
                        update['legend.yanchor'] = 'bottom';
                        update['legend.borderwidth'] = 0;
                    }
                }
                await Plotly.relayout(holder, update);
                await Plotly.downloadImage(holder, {
                    format,
                    width,
                    height,
                    scale,
                    filename: `spectra_${stamp}`,
                });
                setNotice({
                    type: 'info',
                    message: `Exported as ${format.toUpperCase()}`,
                    id: Date.now(),
                });
            } catch (err) {
                setNotice({
                    type: 'error',
                    message: `Export failed: ${err.message}`,
                    id: Date.now(),
                });
            } finally {
                Plotly.purge(holder);
                holder.remove();
            }
        },
        [getPlotEl, visibleTraces, layout, xRange, yRange],
    );

    const selectHeader = useCallback((h) => {
        setXLabel(h.xLabel);
        setYLabel(h.yLabel);
        setSeenHeaders((prev) =>
            prev.some((s) => s.xLabel === h.xLabel && s.yLabel === h.yLabel)
                ? prev
                : [...prev, h],
        );
        setShowHeaderDialog(false);
        setHeaderCandidates([]);
    }, []);
    const applyLabelPreset = useCallback((preset) => {
        if (PRESET_LABELS[preset]) {
            setXLabel(PRESET_LABELS[preset].x);
            setYLabel(PRESET_LABELS[preset].y);
        }
        setShowLabelDialog(false);
    }, []);
    const applyCustomLabels = useCallback((xLbl, yLbl) => {
        setXLabel(xLbl);
        setYLabel(yLbl);
        setShowLabelDialog(false);
    }, []);

    React.useEffect(() => {
        if (!presetSelected || pendingOpenFiles.length === 0) return;
        const files = pendingOpenFiles;
        // 空配列で置き換えると、この間に届いたぶんを取りこぼす
        setPendingOpenFiles((prev) => prev.slice(files.length));
        classifyAndAddFiles(files);
    }, [presetSelected, pendingOpenFiles, classifyAndAddFiles]);

    const handleInitialPreset = useCallback(
        (preset) => {
            setPresetSelected(preset);
            if (preset !== 'auto') {
                if (PRESET_LABELS[preset]) {
                    setXLabel(PRESET_LABELS[preset].x);
                    setYLabel(PRESET_LABELS[preset].y);
                }
                setLockedLabels(true);
            } else {
                setLockedLabels(false);
            }
            setShowPresetDialog(false);
            // 関連付けから開かれたときはファイル選択を出さない（渡された分を読む）
            if (pendingOpenFiles.length > 0) return;
            setTimeout(() => {
                const input = document.getElementById('file-input');
                if (input) input.click();
            }, 0);
        },
        [pendingOpenFiles],
    );

    React.useEffect(() => {
        if (xRange) {
            setXMinInput(String(xRange[0]));
            setXMaxInput(String(xRange[1]));
        }
        if (yRange) {
            setYMinInput(String(yRange[0]));
            setYMaxInput(String(yRange[1]));
        }
    }, [xRange, yRange]);

    // 通知バナーは 8 秒で自動消去
    React.useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => {
            setNotice((prev) => (prev && prev.id === notice.id ? null : prev));
        }, 8000);
        return () => clearTimeout(timer);
    }, [notice]);

    // 空グループのカラーカウンタを削除（次に追加時は palette[0] から再開）
    React.useEffect(() => {
        const inUse = new Set(traceGroupIds);
        for (const key of Object.keys(groupColorCountersRef.current)) {
            if (!inUse.has(key)) delete groupColorCountersRef.current[key];
        }
    }, [traceGroupIds]);

    // Plotly のズーム状態を直接監視（onRelayout prop が発火しないケースへの保険）
    // biome-ignore lint/correctness/useExhaustiveDependencies: traces.length は意図的。本数が変わると Plotly が描画要素を作り直すため、リスナーを貼り直す必要がある
    React.useEffect(() => {
        const plotEl = getPlotEl();
        if (!plotEl) return;
        const update = () => {
            const fl = plotEl._fullLayout;
            if (!fl) return;
            const xAuto = fl.xaxis?.autorange !== false;
            const yAuto = fl.yaxis?.autorange !== false;
            setPlotIsZoomed(!xAuto || !yAuto);
        };
        if (typeof plotEl.on === 'function') {
            plotEl.on('plotly_relayout', update);
            plotEl.on('plotly_relayouting', update);
            plotEl.on('plotly_afterplot', update);
        }
        update();
        return () => {
            if (typeof plotEl.removeListener === 'function') {
                plotEl.removeListener('plotly_relayout', update);
                plotEl.removeListener('plotly_relayouting', update);
                plotEl.removeListener('plotly_afterplot', update);
            }
        };
    }, [traces.length, getPlotEl]);

    // グループコンテキストメニュー: メニュー外クリックで閉じる
    React.useEffect(() => {
        if (!groupContextMenu.visible) return;
        const handler = (e) => {
            const menuEl = document.querySelector('.context-menu');
            if (menuEl?.contains(e.target)) return;
            setGroupContextMenu({ visible: false, x: 0, y: 0, groupId: null });
        };
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [groupContextMenu.visible]);

    // プラットフォーム取得 & 起動3秒後にアップデート自動チェック
    React.useEffect(() => {
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
    React.useEffect(() => {
        if (!window.electronAPI) return;
        const cleanup = window.electronAPI.onDownloadProgress((data) => {
            setDownloadProgress(data);
        });
        return cleanup;
    }, []);

    // 関連付けから開かれたファイルを受け取る。
    // 起動直後は購読前に送られることがあるので、貯まっている分も取りに行く。
    React.useEffect(() => {
        if (!window.electronAPI?.takePendingFiles) return;
        const toFiles = (payload) =>
            (payload ?? []).map(
                (f) => new File([new Uint8Array(f.data)], f.name),
            );
        // take-pending-files は破壊的な読み出しなので、途中で unmount されても
        // 捨てない（開発時の StrictMode 二重マウントでファイルが消えるのを防ぐ）
        window.electronAPI
            .takePendingFiles()
            .then((payload) => {
                const files = toFiles(payload);
                if (files.length)
                    setPendingOpenFiles((prev) => [...prev, ...files]);
            })
            .catch(() => {
                // 取得できなくても通常の読み込み手段は残る
            });
        const cleanup = window.electronAPI.onOpenFiles?.((payload) => {
            const files = toFiles(payload);
            if (files.length)
                setPendingOpenFiles((prev) => [...prev, ...files]);
        });
        return () => {
            cleanup?.();
        };
    }, []);

    // 更新の失敗通知。quitAndInstall は例外を投げないので、これが無いと
    // ダイアログが「ダウンロード中」のまま固まる
    React.useEffect(() => {
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

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: ファイルのドロップ領域。クリック操作ではなく、キーボードからは同等機能のファイル選択ボタンを用意している
        <div
            className="app"
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingFiles(true);
            }}
            onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingFiles(false);
            }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingFiles(false);
                classifyAndAddFiles(Array.from(e.dataTransfer?.files || []));
            }}
            style={{
                outline: isDraggingFiles ? '3px dashed #66a3ff' : 'none',
                outlineOffset: isDraggingFiles ? 6 : 0,
            }}
        >
            <div className="toolbar" style={{ position: 'relative' }}>
                <div className="toolbar-icon-buttons">
                    <IconButton
                        onClick={() =>
                            document.getElementById('file-input').click()
                        }
                        disabled={!presetSelected}
                        title={
                            !presetSelected
                                ? 'Add Files — select a data type first'
                                : 'Add Files'
                        }
                    >
                        <AddFileIcon />
                    </IconButton>
                    <IconButton onClick={clearAll} title="Unload All">
                        <UnloadIcon />
                    </IconButton>
                    <IconButton
                        onClick={resetZoom}
                        disabled={
                            xRange == null && yRange == null && !plotIsZoomed
                        }
                        title={
                            xRange == null && yRange == null && !plotIsZoomed
                                ? 'Already auto-scaled'
                                : 'Reset Zoom'
                        }
                    >
                        <ZoomResetIcon />
                    </IconButton>
                    <IconButton
                        onClick={autoFitY}
                        disabled={visibleIndices.length === 0}
                        title={
                            visibleIndices.length === 0
                                ? 'No visible spectra to fit'
                                : 'Auto-fit Y (to current X range)'
                        }
                    >
                        <AutoFitYIcon />
                    </IconButton>
                    <IconButton
                        onClick={() => setShowLabelDialog(true)}
                        title="Axis Labels"
                    >
                        <LabelIcon />
                    </IconButton>
                    <div
                        style={{ position: 'relative', display: 'inline-flex' }}
                    >
                        <IconButton
                            onClick={() => setShowNormalizationDialog(true)}
                            title={
                                normalizationMode === 'none'
                                    ? 'Normalize spectra'
                                    : `Active: ${
                                          normalizationMode === 'max'
                                              ? normalizationMaxScope === 'view'
                                                  ? 'Max (in view)'
                                                  : 'Max (full range)'
                                              : normalizationMode === 'minmax'
                                                ? (
                                                      normalizationMaxScope ===
                                                      'view'
                                                          ? 'Min-Max (in view)'
                                                          : 'Min-Max (full range)'
                                                  )
                                                : `x = ${normalizationWavelength}`
                                      }`
                            }
                        >
                            <NormalizeIcon />
                        </IconButton>
                        {normalizationMode !== 'none' && (
                            <span
                                style={{
                                    position: 'absolute',
                                    top: 4,
                                    right: 4,
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: '#2196F3',
                                    pointerEvents: 'none',
                                }}
                            />
                        )}
                    </div>
                    <div
                        style={{ position: 'relative', display: 'inline-flex' }}
                    >
                        <IconButton
                            onClick={() => {
                                if (!stackEnabled) {
                                    setStackEnabled(true);
                                    setStackGap(0);
                                    setYRange(null);
                                }
                                setShowStackDialog(true);
                            }}
                            title={
                                stackEnabled
                                    ? 'Stacking active'
                                    : 'Stack display'
                            }
                        >
                            <StackIcon />
                        </IconButton>
                        {stackEnabled && (
                            <span
                                style={{
                                    position: 'absolute',
                                    top: 4,
                                    right: 4,
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: '#4caf50',
                                    pointerEvents: 'none',
                                }}
                            />
                        )}
                    </div>
                    <IconButton
                        onClick={() => setShowExportDialog(true)}
                        disabled={visibleIndices.length === 0}
                        title={
                            visibleIndices.length === 0
                                ? 'Export figure - no visible spectra'
                                : 'Export figure (SVG / PNG)'
                        }
                    >
                        <ExportIcon />
                    </IconButton>
                    {window.electronAPI && (
                        <div
                            style={{
                                position: 'relative',
                                display: 'inline-flex',
                            }}
                        >
                            <IconButton
                                onClick={handleCheckUpdate}
                                title={
                                    updateStatus === 'available'
                                        ? 'Update available'
                                        : 'Check for updates'
                                }
                            >
                                <UpdateIcon />
                            </IconButton>
                            {updateStatus === 'available' && (
                                <span
                                    style={{
                                        position: 'absolute',
                                        top: 4,
                                        right: 4,
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        background: '#e33',
                                        pointerEvents: 'none',
                                    }}
                                />
                            )}
                        </div>
                    )}
                </div>
                <input
                    id="file-input"
                    type="file"
                    multiple
                    onChange={handleFiles}
                    onClick={(e) => {
                        e.target.value = '';
                    }}
                    style={{ display: 'none' }}
                />

                {Object.keys(relabMeta).length > 0 &&
                    (() => {
                        const n = Object.keys(relabMeta).length;
                        return (
                            <div
                                style={{
                                    marginLeft: 12,
                                    fontSize: 12,
                                    color: '#444',
                                }}
                            >{`RELAB metadata: ${n} ${n === 1 ? 'file' : 'files'}`}</div>
                        );
                    })()}
                <div className="inline-range-inputs">
                    <span>X:</span>
                    <input
                        type="number"
                        step="any"
                        value={xMinInput}
                        onChange={(e) => setXMinInput(e.target.value)}
                        onKeyDown={(e) => handleRangeKeyDown('x', e)}
                        placeholder="Min"
                    />
                    <span>~</span>
                    <input
                        type="number"
                        step="any"
                        value={xMaxInput}
                        onChange={(e) => setXMaxInput(e.target.value)}
                        onKeyDown={(e) => handleRangeKeyDown('x', e)}
                        placeholder="Max"
                    />
                    <span style={{ marginLeft: 12 }}>Y:</span>
                    <input
                        type="number"
                        step="any"
                        value={yMinInput}
                        onChange={(e) => setYMinInput(e.target.value)}
                        onKeyDown={(e) => handleRangeKeyDown('y', e)}
                        placeholder="Min"
                    />
                    <span>~</span>
                    <input
                        type="number"
                        step="any"
                        value={yMaxInput}
                        onChange={(e) => setYMaxInput(e.target.value)}
                        onKeyDown={(e) => handleRangeKeyDown('y', e)}
                        placeholder="Max"
                    />
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
                            if (dataCoord.x == null || dataCoord.y == null)
                                return '—';
                            const unitOf = (label) => {
                                const m = String(label || '').match(
                                    /\(([^)]+)\)\s*$/,
                                );
                                return m ? ` ${m[1]}` : '';
                            };
                            const xu = unitOf(xLabel);
                            const yu =
                                normalizationMode === 'none'
                                    ? unitOf(yLabel)
                                    : '';
                            return `X: ${dataCoord.x.toFixed(4)}${xu} · Y: ${dataCoord.y.toFixed(4)}${yu}`;
                        })()}
                    </span>
                </div>
            </div>
            <NoticeBanner notice={notice} onClose={() => setNotice(null)} />
            <div className="main-area">
                <div className="legend-panel">
                    {/* グループパネル（ドラッグ＆ドロップで移動/コピー） */}
                    <div className="group-panel">
                        {groups.map((g) => (
                            // biome-ignore lint/a11y/useKeyWithClickEvents: マウス前提のグループ操作（右クリックメニュー・スペクトルのドロップ先）。セマンティックな button 化は表示崩れを伴うため別途対応
                            // biome-ignore lint/a11y/noStaticElementInteractions: 同上
                            <div
                                key={g.id}
                                className={`group-item ${g.id === activeGroupId ? 'active' : ''} ${groupToggleState[g.id] === 'hide' ? 'hide' : 'show'}`}
                                title={
                                    'Right-click: menu\nDrop a spectrum here to move (Ctrl+drop to copy)'
                                }
                                onClick={() => {
                                    setActiveGroupId(g.id);
                                    setGroupToggleState((prev) => {
                                        const nextState =
                                            prev[g.id] === 'show'
                                                ? 'hide'
                                                : 'show';
                                        setVisibility((vPrev) =>
                                            vPrev.map((v, i) =>
                                                traceGroupIds[i] === g.id
                                                    ? nextState === 'show'
                                                    : v,
                                            ),
                                        );
                                        return { ...prev, [g.id]: nextState };
                                    });
                                }}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    setGroupContextMenu({
                                        visible: true,
                                        x: e.clientX,
                                        y: e.clientY,
                                        groupId: g.id,
                                    });
                                }}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    const traceIndexStr =
                                        e.dataTransfer.getData('text/plain');
                                    const idx = Number(traceIndexStr);
                                    if (!Number.isFinite(idx)) return;
                                    const isCopy = e.ctrlKey;
                                    if (isCopy) {
                                        const src = traces[idx];
                                        const newColorIdx =
                                            groupColorCountersRef.current[
                                                g.id
                                            ] ?? 0;
                                        groupColorCountersRef.current[g.id] =
                                            newColorIdx + 1;
                                        const cloned = {
                                            ...src,
                                            line: {
                                                ...src.line,
                                                color: palette[
                                                    newColorIdx % palette.length
                                                ],
                                            },
                                            name: filesInfo[idx],
                                        };
                                        setTraces((prev) => [...prev, cloned]);
                                        setFilesInfo((prev) => [
                                            ...prev,
                                            filesInfo[idx],
                                        ]);
                                        setVisibility((prev) => [
                                            ...prev,
                                            true,
                                        ]);
                                        setTraceGroupIds((prev) => [
                                            ...prev,
                                            g.id,
                                        ]);
                                    } else {
                                        // 移動: 同一グループへのドロップは no-op
                                        if (traceGroupIds[idx] === g.id) return;
                                        // 移動先グループのカウンタから新しい色を割り当てる
                                        const targetColorIdx =
                                            groupColorCountersRef.current[
                                                g.id
                                            ] ?? 0;
                                        groupColorCountersRef.current[g.id] =
                                            targetColorIdx + 1;
                                        const newColor =
                                            palette[
                                                targetColorIdx % palette.length
                                            ];
                                        setTraces((prev) => {
                                            const next = [...prev];
                                            next[idx] = {
                                                ...next[idx],
                                                line: {
                                                    ...next[idx].line,
                                                    color: newColor,
                                                },
                                            };
                                            return next;
                                        });
                                        setTraceGroupIds((prev) => {
                                            const next = [...prev];
                                            next[idx] = g.id;
                                            return next;
                                        });
                                    }
                                }}
                            >
                                {g.id}
                            </div>
                        ))}
                        <button
                            type="button"
                            className="group-add-btn"
                            title="Add new group"
                            onClick={() => {
                                // 既存Groupの番号を解析し次番号を採用（数字のみ）
                                const nums = groups
                                    .map((gr) => Number(gr.id))
                                    .filter((n) => Number.isFinite(n));
                                const nextNum = nums.length
                                    ? Math.max(...nums) + 1
                                    : 1;
                                const id = String(nextNum);
                                const name = String(nextNum);
                                setGroups((prev) => [...prev, { id, name }]);
                                setActiveGroupId(id);
                                setGroupToggleState((prev) => ({
                                    ...prev,
                                    [id]: 'show',
                                }));
                            }}
                        >
                            +
                        </button>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                marginLeft: 'auto',
                            }}
                        >
                            <button
                                type="button"
                                className="icon-button"
                                title={
                                    legendSortKey === 'filename'
                                        ? 'Sorting by file name'
                                        : legendSortKey === 'ext'
                                          ? 'Sorting by extension'
                                          : 'Custom order (drag to reorder)'
                                }
                                onClick={() =>
                                    setLegendSortKey((prev) =>
                                        prev === 'filename'
                                            ? 'ext'
                                            : prev === 'ext'
                                              ? 'custom'
                                              : 'filename',
                                    )
                                }
                            >
                                {legendSortKey === 'filename' ? (
                                    <NameIcon />
                                ) : legendSortKey === 'ext' ? (
                                    <ExtIcon />
                                ) : (
                                    <CustomOrderIcon />
                                )}
                            </button>
                            <button
                                type="button"
                                className="icon-button"
                                title={
                                    legendSortKey === 'custom'
                                        ? 'Order set manually'
                                        : legendSortOrder === 'asc'
                                          ? 'Ascending'
                                          : 'Descending'
                                }
                                onClick={() =>
                                    setLegendSortOrder((prev) =>
                                        prev === 'asc' ? 'desc' : 'asc',
                                    )
                                }
                                disabled={legendSortKey === 'custom'}
                            >
                                {legendSortOrder === 'asc' ? (
                                    <ArrowUpIcon />
                                ) : (
                                    <ArrowDownIcon />
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="legend-scroll">
                        {(() => {
                            const items = traces
                                .map((trace, idx) => ({ trace, idx }))
                                .filter(
                                    ({ idx }) =>
                                        traceGroupIds[idx] === activeGroupId,
                                );
                            const compare = (a, b) => {
                                const nameA = (
                                    filesInfo[a.idx] || ''
                                ).toLowerCase();
                                const nameB = (
                                    filesInfo[b.idx] || ''
                                ).toLowerCase();
                                if (legendSortKey === 'ext') {
                                    const extA = nameA.split('.').pop();
                                    const extB = nameB.split('.').pop();
                                    if (extA < extB)
                                        return legendSortOrder === 'asc'
                                            ? -1
                                            : 1;
                                    if (extA > extB)
                                        return legendSortOrder === 'asc'
                                            ? 1
                                            : -1;
                                    // tie-breaker by filename
                                }
                                if (nameA < nameB)
                                    return legendSortOrder === 'asc' ? -1 : 1;
                                if (nameA > nameB)
                                    return legendSortOrder === 'asc' ? 1 : -1;
                                return 0;
                            };
                            if (legendSortKey !== 'custom') items.sort(compare);
                            // ファイル名で隣接同名を集約してグループ化（>1 の時のみ親行を立てる）
                            const groups = [];
                            const fnameToGroupIdx = new Map();
                            for (const it of items) {
                                const fname = filesInfo[it.idx] || '';
                                let gi = fnameToGroupIdx.get(fname);
                                if (gi === undefined) {
                                    gi = groups.length;
                                    fnameToGroupIdx.set(fname, gi);
                                    groups.push({ fname, members: [] });
                                }
                                groups[gi].members.push(it);
                            }
                            // 単発 item のレンダラ（既存挙動を維持）
                            const renderItem = (
                                { trace, idx },
                                indented = false,
                            ) => {
                                const isDragOver =
                                    dragOverLegend &&
                                    dragOverLegend.idx === idx;
                                const classes = ['legend-item'];
                                if (indented) classes.push('indented');
                                if (
                                    isDragOver &&
                                    dragOverLegend.position === 'before'
                                )
                                    classes.push('drag-over-before');
                                if (
                                    isDragOver &&
                                    dragOverLegend.position === 'after'
                                )
                                    classes.push('drag-over-after');
                                return (
                                    // biome-ignore lint/a11y/noStaticElementInteractions: ドラッグ＆ドロップによる並べ替え専用。キーボードでの等価操作は存在しない
                                    <div
                                        key={idx}
                                        className={classes.join(' ')}
                                        title={
                                            'Drag to a group to move (Ctrl+drag to copy) · Drag to another item to reorder'
                                        }
                                        draggable
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData(
                                                'text/plain',
                                                String(idx),
                                            );
                                        }}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            const rect =
                                                e.currentTarget.getBoundingClientRect();
                                            const position =
                                                e.clientY - rect.top <
                                                rect.height / 2
                                                    ? 'before'
                                                    : 'after';
                                            setDragOverLegend((prev) =>
                                                prev &&
                                                prev.idx === idx &&
                                                prev.position === position
                                                    ? prev
                                                    : { idx, position },
                                            );
                                        }}
                                        onDragLeave={() => {
                                            setDragOverLegend((prev) =>
                                                prev && prev.idx === idx
                                                    ? null
                                                    : prev,
                                            );
                                        }}
                                        onDragEnd={() =>
                                            setDragOverLegend(null)
                                        }
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const fromIdx = Number(
                                                e.dataTransfer.getData(
                                                    'text/plain',
                                                ),
                                            );
                                            setDragOverLegend(null);
                                            if (
                                                !Number.isFinite(fromIdx) ||
                                                fromIdx === idx
                                            )
                                                return;
                                            const rect =
                                                e.currentTarget.getBoundingClientRect();
                                            const position =
                                                e.clientY - rect.top <
                                                rect.height / 2
                                                    ? 'before'
                                                    : 'after';
                                            reorderLegendItem(
                                                fromIdx,
                                                idx,
                                                position,
                                            );
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={visibility[idx] !== false}
                                            onChange={() =>
                                                toggleVisibility(idx)
                                            }
                                        />
                                        <button
                                            type="button"
                                            className="unload-btn"
                                            title="Unload"
                                            onClick={() =>
                                                unloadIndices(
                                                    [idx],
                                                    traces[idx]?.name ||
                                                        filesInfo[idx],
                                                )
                                            }
                                        >
                                            <UnloadIcon />
                                        </button>
                                        {/* biome-ignore lint/a11y/useKeyWithClickEvents: 色見本のクリック／ダブルクリック専用。button 化は既存のサイズ・枠線指定が崩れるため別途対応 */}
                                        {/* biome-ignore lint/a11y/noStaticElementInteractions: 同上 */}
                                        <div
                                            className="color-box"
                                            style={{
                                                backgroundColor:
                                                    trace.line.color,
                                            }}
                                            onClick={() =>
                                                handleColorClick(idx)
                                            }
                                            onDoubleClick={() =>
                                                handleColorDoubleClick(idx)
                                            }
                                            title="Click: next color · Double-click: custom color"
                                        />
                                        <div className="filename">
                                            {trace.name || filesInfo[idx]}
                                        </div>
                                    </div>
                                );
                            };
                            // ファイル単位のグループヘッダ
                            const renderGroupHeader = (group, expanded) => {
                                const memberIndices = group.members.map(
                                    (m) => m.idx,
                                );
                                const visCount = memberIndices.filter(
                                    (i) => visibility[i] !== false,
                                ).length;
                                const allVisible =
                                    visCount === memberIndices.length;
                                const noneVisible = visCount === 0;
                                const indeterminate =
                                    !allVisible && !noneVisible;
                                return (
                                    // biome-ignore lint/a11y/noStaticElementInteractions: 内部に input / button を含むコンテナ。button 化すると対話要素の入れ子になり不正なため role は付けない
                                    // biome-ignore lint/a11y/useKeyWithClickEvents: 同上
                                    <div
                                        key={`group-${group.fname}`}
                                        className="legend-item legend-group-header"
                                        onClick={(e) => {
                                            // フォーム要素のクリックでは展開トグルしない
                                            const tag = e.target.tagName;
                                            if (
                                                tag === 'INPUT' ||
                                                tag === 'BUTTON' ||
                                                tag === 'svg' ||
                                                tag === 'path'
                                            )
                                                return;
                                            toggleFileExpanded(group.fname);
                                        }}
                                        title={
                                            expanded
                                                ? 'Click to collapse'
                                                : 'Click to expand'
                                        }
                                    >
                                        <span className="disclosure-icon">
                                            {expanded ? '▼' : '▶'}
                                        </span>
                                        <input
                                            type="checkbox"
                                            checked={allVisible}
                                            ref={(el) => {
                                                if (el)
                                                    el.indeterminate =
                                                        indeterminate;
                                            }}
                                            onChange={() =>
                                                setVisibilityForIndices(
                                                    memberIndices,
                                                    !allVisible,
                                                )
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <button
                                            type="button"
                                            className="unload-btn"
                                            title={`Unload all ${memberIndices.length} traces in this file`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                unloadIndices(
                                                    memberIndices,
                                                    group.fname,
                                                );
                                            }}
                                        >
                                            <UnloadIcon />
                                        </button>
                                        <div className="filename">
                                            {group.fname}
                                            <span className="count-badge">
                                                {' '}
                                                ({memberIndices.length})
                                            </span>
                                        </div>
                                    </div>
                                );
                            };
                            // レンダ: グループ size===1 は flat、>1 は親行 +（展開時）子行
                            const rows = [];
                            for (const g of groups) {
                                if (g.members.length === 1) {
                                    rows.push(renderItem(g.members[0], false));
                                } else {
                                    const expanded = expandedFiles.has(g.fname);
                                    rows.push(renderGroupHeader(g, expanded));
                                    if (expanded)
                                        for (const m of g.members)
                                            rows.push(renderItem(m, true));
                                }
                            }
                            return rows;
                        })()}
                    </div>
                </div>
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
                    <div className="crosshair-overlay">
                        {cross.x != null && cross.y != null && (
                            <div className="crosshair-layer">
                                <div
                                    className="cross-vert"
                                    style={{ left: cross.x }}
                                />
                                <div
                                    className="cross-hori"
                                    style={{ top: cross.y }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {showHeaderDialog && (
                <HeaderSelectDialog
                    candidates={headerCandidates}
                    onSelect={selectHeader}
                    onCancel={() => {
                        // Cancel でも「見た」扱いとし、次回以降問合せしない
                        setSeenHeaders((prev) => {
                            const added = headerCandidates.filter(
                                (h) =>
                                    !prev.some(
                                        (s) =>
                                            s.xLabel === h.xLabel &&
                                            s.yLabel === h.yLabel,
                                    ),
                            );
                            return added.length ? [...prev, ...added] : prev;
                        });
                        setShowHeaderDialog(false);
                        setHeaderCandidates([]);
                    }}
                />
            )}
            {showLabelDialog && (
                <LabelSettingDialog
                    currentX={xLabel}
                    currentY={yLabel}
                    onApplyPreset={applyLabelPreset}
                    onApplyCustom={applyCustomLabels}
                    onCancel={() => setShowLabelDialog(false)}
                />
            )}
            {showPresetDialog && (
                <InitialPresetDialog onSelect={handleInitialPreset} />
            )}
            {confirmState && (
                <ConfirmDialog
                    title={confirmState.title}
                    body={confirmState.body}
                    confirmLabel={confirmState.confirmLabel}
                    cancelLabel={confirmState.cancelLabel}
                    danger={confirmState.danger}
                    onConfirm={() => {
                        const fn = confirmState.onConfirm;
                        setConfirmState(null);
                        fn();
                    }}
                    onCancel={() => {
                        const fn = confirmState.onDismiss;
                        setConfirmState(null);
                        if (fn) fn();
                    }}
                />
            )}
            {showExportDialog && (
                <ExportDialog
                    onExport={exportFigure}
                    onClose={() => setShowExportDialog(false)}
                />
            )}
            {showStackDialog && (
                <StackDialog
                    gap={stackGap}
                    onGapChange={setStackGap}
                    onDisable={() => {
                        setStackEnabled(false);
                        setShowStackDialog(false);
                        setYRange(null);
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
                        setNormalizationMode(mode);
                        if (
                            mode === 'wavelength' &&
                            Number.isFinite(wavelength)
                        ) {
                            setNormalizationWavelength(wavelength);
                        }
                        if ((mode === 'max' || mode === 'minmax') && maxScope) {
                            setNormalizationMaxScope(maxScope);
                        }
                        setShowNormalizationDialog(false);
                        // 範囲外により規格化できなかった可視トレース数を集計して警告
                        if (
                            mode === 'wavelength' &&
                            Number.isFinite(wavelength)
                        ) {
                            const skipped = [];
                            for (let i = 0; i < traces.length; i++) {
                                if (visibility[i] === false) continue;
                                if (traceGroupIds[i] !== activeGroupId)
                                    continue;
                                const v = findYatX(
                                    traces[i].x,
                                    traces[i].y,
                                    wavelength,
                                );
                                if (
                                    v === null ||
                                    !Number.isFinite(v) ||
                                    v === 0
                                )
                                    skipped.push(filesInfo[i]);
                            }
                            if (skipped.length > 0) {
                                const msg =
                                    skipped.length === 1
                                        ? `1 spectrum was not normalized because x = ${wavelength} is outside its data range: ${skipped[0]}`
                                        : `${skipped.length} spectra were not normalized because x = ${wavelength} is outside their data range.`;
                                setNotice({
                                    type: 'warning',
                                    message: msg,
                                    id: Date.now(),
                                });
                            }
                        } else if (
                            (mode === 'max' || mode === 'minmax') &&
                            maxScope === 'view' &&
                            xRange
                        ) {
                            const normalizer =
                                mode === 'minmax'
                                    ? scaleToUnitInRange
                                    : normalizeByMaxInRange;
                            const skipped = [];
                            for (let i = 0; i < traces.length; i++) {
                                if (visibility[i] === false) continue;
                                if (traceGroupIds[i] !== activeGroupId)
                                    continue;
                                const ny = normalizer(
                                    traces[i].x,
                                    traces[i].y,
                                    xRange,
                                );
                                if (!ny) skipped.push(filesInfo[i]);
                            }
                            if (skipped.length > 0) {
                                const msg =
                                    skipped.length === 1
                                        ? `1 spectrum was not normalized because no data falls within the current view range: ${skipped[0]}`
                                        : `${skipped.length} spectra were not normalized because no data falls within the current view range.`;
                                setNotice({
                                    type: 'warning',
                                    message: msg,
                                    id: Date.now(),
                                });
                            }
                        }
                        if (mode === 'minmax') {
                            setYRange([0, 1]);
                        } else if (mode === 'max') {
                            // 可視トレース×現在の X 範囲で規格化後の min/max を求め Y 軸にフィット
                            const scope = maxScope === 'view' ? xRange : null;
                            let mn = Infinity,
                                mx = -Infinity;
                            for (let i = 0; i < traces.length; i++) {
                                if (visibility[i] === false) continue;
                                if (traceGroupIds[i] !== activeGroupId)
                                    continue;
                                const t = traces[i];
                                const ny = normalizeByMaxInRange(
                                    t.x,
                                    t.y,
                                    scope,
                                );
                                if (!ny) continue;
                                for (let j = 0; j < t.x.length; j++) {
                                    const x = t.x[j],
                                        y = ny[j];
                                    if (
                                        !Number.isFinite(x) ||
                                        !Number.isFinite(y)
                                    )
                                        continue;
                                    if (
                                        xRange &&
                                        (x < xRange[0] || x > xRange[1])
                                    )
                                        continue;
                                    if (y < mn) mn = y;
                                    if (y > mx) mx = y;
                                }
                            }
                            if (Number.isFinite(mn) && Number.isFinite(mx)) {
                                const span = mx - mn;
                                const pad = span > 0 ? span * 0.05 : 1e-6;
                                setYRange([mn - pad, mx + pad]);
                            } else {
                                setYRange(null);
                            }
                        } else {
                            setYRange(null);
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
                    errorMessage={updateError}
                    platform={platform}
                    onDownload={handleDownloadUpdate}
                    onQuit={() => window.electronAPI.quitApp?.()}
                    onOpenBrowser={() => {
                        if (updateInfo?.releaseUrl)
                            window.electronAPI.openExternal(
                                updateInfo.releaseUrl,
                            );
                    }}
                    onClose={() => setShowUpdateDialog(false)}
                />
            )}

            {unitDialogVisible && (
                <BulkUnitDialog
                    files={unitQueryFiles}
                    selections={unitSelections}
                    onChangeSelection={(idx, unit) => {
                        setUnitSelections((prev) => {
                            const next = [...prev];
                            next[idx] = unit;
                            return next;
                        });
                    }}
                    onApply={() => {
                        unitQueryFiles.forEach((f, i) => {
                            parseAndAddFiles([f], unitSelections[i]);
                        });
                        setUnitDialogVisible(false);
                        if (immediateReflectanceFiles.length)
                            parseAndAddFiles(immediateReflectanceFiles);
                        setImmediateReflectanceFiles([]);
                        setUnitQueryFiles([]);
                        setUnitSelections([]);
                    }}
                />
            )}
            {groupContextMenu.visible && (
                <div
                    className="context-menu"
                    style={{
                        top: groupContextMenu.y,
                        left: groupContextMenu.x,
                    }}
                >
                    <div className="context-menu-title">Group Menu</div>
                    <div style={{ fontSize: 12, marginBottom: 8 }}>
                        Target:{' '}
                        {
                            groups.find(
                                (g) => g.id === groupContextMenu.groupId,
                            )?.name
                        }
                    </div>
                    <div className="context-menu-actions">
                        <button
                            type="button"
                            onClick={() => {
                                const id = groupContextMenu.groupId;
                                const gObj = groups.find((g) => g.id === id);
                                if (!gObj) return;
                                const newName = prompt(
                                    'Rename group',
                                    gObj.name,
                                );
                                if (newName?.trim()) {
                                    const trimmed = newName.trim();
                                    // 数字のみを推奨: 非数字でもそのまま設定
                                    setGroups((prev) =>
                                        prev.map((g) =>
                                            g.id === id
                                                ? { ...g, name: trimmed }
                                                : g,
                                        ),
                                    );
                                }
                                setGroupContextMenu({
                                    visible: false,
                                    x: 0,
                                    y: 0,
                                    groupId: null,
                                });
                            }}
                        >
                            Rename
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                const id = groupContextMenu.groupId;
                                const gObj = groups.find((g) => g.id === id);
                                setGroupContextMenu({
                                    visible: false,
                                    x: 0,
                                    y: 0,
                                    groupId: null,
                                });
                                if (!gObj) return;
                                const n = traceGroupIds.filter(
                                    (gid) => gid === id,
                                ).length;
                                const body =
                                    n > 0
                                        ? `This group and its ${n} loaded ${n === 1 ? 'spectrum' : 'spectra'} will be unloaded from the viewer.\nSpectra also shown in other groups will remain.`
                                        : 'This group will be removed.';
                                // 削除対象インデックス（クロージャで固定）を先に算出して全並列配列に一貫して適用
                                const keptIndices = traceGroupIds
                                    .map((gid, i) => (gid !== id ? i : -1))
                                    .filter((i) => i >= 0);
                                setConfirmState({
                                    title: `Close group "${gObj.name}"?`,
                                    body,
                                    confirmLabel: 'Close',
                                    danger: true,
                                    onConfirm: () => {
                                        setTraces((prev) =>
                                            keptIndices.map((i) => prev[i]),
                                        );
                                        setFilesInfo((prev) =>
                                            keptIndices.map((i) => prev[i]),
                                        );
                                        setVisibility((prev) =>
                                            keptIndices.map((i) => prev[i]),
                                        );
                                        setTraceGroupIds((prev) =>
                                            keptIndices.map((i) => prev[i]),
                                        );
                                        setGroups((prev) => {
                                            const remaining = prev.filter(
                                                (g) => g.id !== id,
                                            );
                                            if (activeGroupId === id) {
                                                setActiveGroupId(
                                                    remaining.length
                                                        ? remaining[0].id
                                                        : null,
                                                );
                                            }
                                            return remaining;
                                        });
                                        setGroupToggleState((prev) => {
                                            const { [id]: _omit, ...rest } =
                                                prev;
                                            return rest;
                                        });
                                    },
                                });
                            }}
                        >
                            Close Group
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
