// Bruker OPUS バイナリファイルの JS パーサ
// brukeropus (https://github.com/joshduran/brukeropus, MIT) のロジックを JS に移植。
// クライアントサイド（ブラウザ / Electron）で File.arrayBuffer() から直接読む想定。

const MAGIC = [0x0A, 0x0A, 0xFE, 0xFE]

// block_type の int32 → 6-tuple 変換（brukeropus parse.get_block_type）
// bits 0-1 = t0, 2-3 = t1, 4-9 = t2, 10-16 = t3, 17-18 = t4, 19-21 = t5
const decodeBlockType = (typeInt) => [
    typeInt & 0x3,
    (typeInt >> 2) & 0x3,
    (typeInt >> 4) & 0x3F,
    (typeInt >> 10) & 0x7F,
    (typeInt >> 17) & 0x3,
    (typeInt >> 19) & 0x7,
]

// CODE_3 (type[3] mod 32): 短縮キーと表示ラベル
const CODE_3_ABR = {
    0: '', 1: '', 2: 'ig', 3: 'ph', 4: 'a', 5: 't', 6: 'km', 7: 'tr',
    8: 'gcig', 9: 'gcsc', 10: 'ra', 11: 'e', 12: 'r', 13: 'dir',
    14: 'pw', 15: 'logr', 16: 'atr', 17: 'pas', 18: 'arit', 19: 'aria',
    22: 'match',
}
const CODE_3_LABEL = {
    1: 'Spectrum', 2: 'Interferogram', 3: 'Phase', 4: 'Absorbance',
    5: 'Transmittance', 6: 'Kubelka-Munk', 7: 'Trace', 8: 'GC Interferograms',
    9: 'GC Spectra', 10: 'Raman', 11: 'Emission', 12: 'Reflectance',
    14: 'Power', 15: 'log Reflectance', 16: 'ATR', 17: 'Photoacoustic',
    18: 'Arithmetic (T)', 19: 'Arithmetic (A)', 22: 'Match',
}
const CODE_1_LABEL = { 1: 'Sample', 2: 'Reference' }

export const isOpusMagic = (arrayBuffer) => {
    if (!arrayBuffer || arrayBuffer.byteLength < 4) return false
    const v = new Uint8Array(arrayBuffer, 0, 4)
    return v[0] === MAGIC[0] && v[1] === MAGIC[1] && v[2] === MAGIC[2] && v[3] === MAGIC[3]
}

// 文字列を latin-1 として復号。\0 終端で打ち切る
const decodeStr = (view, offset, size) => {
    const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, size)
    let end = bytes.indexOf(0)
    if (end === -1) end = bytes.length
    // latin-1 は 1 バイト 1 コードポイント。fromCharCode で十分
    let s = ''
    for (let i = 0; i < end; i++) s += String.fromCharCode(bytes[i])
    return s
}

const parseHeader = (view) => ({
    version: view.getFloat64(4, true),
    directoryStart: view.getInt32(12, true),
    maxBlocks: view.getInt32(16, true),
    numBlocks: view.getInt32(20, true),
})

const parseDirectory = (view, start, numBlocks) => {
    const blocks = []
    for (let i = 0; i < numBlocks; i++) {
        const off = start + i * 12
        if (off + 12 > view.byteLength) break
        const typeInt = view.getInt32(off, true)
        const sizeWords = view.getInt32(off + 4, true)
        const blockStart = view.getInt32(off + 8, true)
        if (blockStart <= 0) break
        blocks.push({
            type: decodeBlockType(typeInt),
            size: sizeWords * 4,
            start: blockStart,
        })
    }
    return blocks
}

// パラメータブロック: 連続する (key 3 bytes, pad 1 byte, dtype int16, val_size int16, value) エントリ。
// END マーカーで終端。dtype: 0=int32, 1=float64, それ以外=string。
const parseParams = (view, blockStart, blockSize) => {
    const params = {}
    let loc = 0
    while (loc + 8 <= blockSize) {
        const k0 = view.getUint8(blockStart + loc)
        const k1 = view.getUint8(blockStart + loc + 1)
        const k2 = view.getUint8(blockStart + loc + 2)
        const key = String.fromCharCode(k0, k1, k2)
        if (key === 'END') break
        const dtype = view.getInt16(blockStart + loc + 4, true)
        const valSize = view.getInt16(blockStart + loc + 6, true) * 2 // bytes
        let val
        if (dtype === 0) {
            val = view.getInt32(blockStart + loc + 8, true)
        } else if (dtype === 1) {
            val = view.getFloat64(blockStart + loc + 8, true)
        } else {
            val = decodeStr(view, blockStart + loc + 8, valSize)
        }
        params[key.toLowerCase()] = val
        loc += valSize + 8
    }
    return params
}

// 1D データブロック: Float32Array
const parseData = (view, blockStart, blockSize, dpf) => {
    // dpf 1=float32, 2=int32 (今のところ float32 のみ対応)
    const count = Math.floor(blockSize / 4)
    if (dpf === 2) {
        const arr = new Int32Array(count)
        for (let i = 0; i < count; i++) arr[i] = view.getInt32(blockStart + i * 4, true)
        return arr
    }
    const arr = new Float32Array(count)
    for (let i = 0; i < count; i++) arr[i] = view.getFloat32(blockStart + i * 4, true)
    return arr
}

// FileBlock 分類ヘルパー（brukeropus block.py 相当）
const isDirectoryBlock = (t) => t[0] === 0 && t[1] === 0 && t[2] === 0 && t[3] === 13 && t[4] === 0 && t[5] === 0
const isDataStatusBlock = (t) => t[2] === 1
const isParamBlock = (t) => t[2] > 0 || (t[0] === 0 && t[1] === 0 && t[2] === 0 && t[3] === 0 && t[4] === 0 && t[5] === 1)
const isDataBlock = (t) => t[2] === 0 && t[3] !== 0 && t[3] !== 13 && t[5] !== 2 && t[5] !== 5
// Compact 形式: type[5]==4。先頭にメタデータを持ち、末尾 npt 個が実データ
const isCompactData = (t) => isDataBlock(t) && t[5] === 4
// Series 形式: type[5]==2。時系列で複数スペクトルを 1 ブロックに格納
const isSeriesData = (t) => t[2] === 0 && t[3] !== 0 && t[3] !== 13 && t[5] === 2

// 3D Series の各サブブロックに付随する info ブロックのフィールド定義
// (brukeropus constants.STRUCT_3D_INFO_BLOCK 移植)
const STRUCT_3D_INFO = [
    ['nss', 'i'], ['nsr', 'i'], ['nsn', 'i'], ['npt', 'i'],
    ['gfw', 'i'], ['gbw', 'i'], ['bfw', 'i'], ['bbw', 'i'],
    ['hfl', 'd'], ['lfl', 'd'], ['hff', 'd'], ['lff', 'd'],
    ['filter_size', 'i'], ['filter_type', 'i'],
    ['fxv', 'd'], ['lxv', 'd'], ['mny', 'd'], ['mxy', 'd'],
    ['csf', 'd'], ['pka', 'd'], ['pra', 'd'],
    ['pkl', 'i'], ['prl', 'i'], ['srt', 'd'], ['ert', 'd'],
]

// Series ブロック解析
//   header(24B): version, num_blocks, offset_to_first_sub, data_size, info_size, store_count
//   store_table: store_count × 8B (使用しない)
//   sub-blocks: (data_size + info_size) × num_blocks
const parseDataSeries = (view, blockStart, blockSize) => {
    const numBlocks = view.getInt32(blockStart + 4, true)
    const subOffset = view.getInt32(blockStart + 8, true)
    const dataSize = view.getInt32(blockStart + 12, true)
    const infoSize = view.getInt32(blockStart + 16, true)
    const spectra = []
    let off = subOffset
    for (let i = 0; i < numBlocks; i++) {
        if (off + dataSize + infoSize > blockSize) break // ストアテーブルでスキップされた等
        const count = Math.floor(dataSize / 4)
        const y = new Float32Array(count)
        for (let j = 0; j < count; j++) y[j] = view.getFloat32(blockStart + off + j * 4, true)
        // info block 読み出し
        const info = {}
        let p = blockStart + off + dataSize
        for (const [key, fmt] of STRUCT_3D_INFO) {
            if (fmt === 'i') { info[key] = view.getInt32(p, true); p += 4 }
            else { info[key] = view.getFloat64(p, true); p += 8 }
        }
        spectra.push({ y, info })
        off += dataSize + infoSize
    }
    return spectra
}

// データブロックとデータステータスブロックを type で対応付け（t[0:2] と t[3:6] が一致）
const matchStatusByType = (data, statusBlocks) =>
    statusBlocks.filter(s =>
        s.type[0] === data.type[0] && s.type[1] === data.type[1] &&
        s.type[3] === data.type[3] && s.type[4] === data.type[4] && s.type[5] === data.type[5]
    )

// Series ブロック用ペアリング: status.npt × 4 == data_size_per_spectrum を一致条件にする
// Series ブロック header の offset 12 にサブブロックあたりの data_size が格納されている
const pairSeriesAndStatus = (seriesBlocks, statusBlocks) => {
    const resolved = new Map()
    const used = new Set()
    const remaining = []
    for (const s of seriesBlocks) {
        const exactNpt = Math.floor(s.dataSizePerSub / 4)
        const candidates = matchStatusByType(s, statusBlocks)
            .filter(st => st.params.npt === exactNpt)
        if (candidates.length === 1 && !used.has(candidates[0].start)) {
            resolved.set(s.start, candidates[0])
            used.add(candidates[0].start)
        } else {
            remaining.push(s)
        }
    }
    for (const s of remaining) {
        const free = matchStatusByType(s, statusBlocks).filter(st => !used.has(st.start))
        if (!free.length) continue
        free.sort((a, b) => b.params.npt - a.params.npt)
        resolved.set(s.start, free[0])
        used.add(free[0].start)
    }
    return resolved
}

// brukeropus の pair_data_and_status_blocks 移植
// OPUS は同一 type のデータを波数 (WN) / 波長 (MI) ベースで重複保存することがあるため、
// type マッチだけでは候補が複数残る。npt 一致と「既使用 status の除外」で曖昧性を解決する。
const pairDataAndStatus = (dataBlocks, statusBlocks) => {
    // 各 data に対し「type が一致し、かつ count >= npt（is_valid_match）」の status を候補とする
    const entries = dataBlocks.map(d => {
        const count = Math.floor(d.size / 4)
        const candidates = matchStatusByType(d, statusBlocks)
            .filter(s => typeof s.params.npt === 'number' && count >= s.params.npt)
        return { data: d, count, candidates }
    })

    const usedStatusStart = new Set()
    const resolved = new Map() // data.start → status

    // Phase 1: npt === count の単独マッチを確定
    const remaining = []
    for (const e of entries) {
        const perfect = e.candidates.filter(s => s.params.npt === e.count)
        if (perfect.length === 1 && !usedStatusStart.has(perfect[0].start)) {
            resolved.set(e.data.start, perfect[0])
            usedStatusStart.add(perfect[0].start)
        } else {
            remaining.push(e)
        }
    }

    // Phase 2: 残りについて未使用 status から選択（npt 降順で多く埋まる方を優先）
    for (const e of remaining) {
        const free = e.candidates.filter(s => !usedStatusStart.has(s.start))
        if (!free.length) continue // ペアが無いデータブロックは除外
        free.sort((a, b) => b.params.npt - a.params.npt)
        resolved.set(e.data.start, free[0])
        usedStatusStart.add(free[0].start)
    }

    return resolved
}

const getDataKey = (type) => {
    const typeIdx = type[3] % 32
    let key = CODE_3_ABR[typeIdx] ?? ('_' + type[3])
    if (type[1] === 1) key += 'sm'
    else if (type[1] === 2) key += 'rf'
    if (type[5] === 4) key += '_c' // brukeropus 互換: Compact 形式の識別子
    return key || 'data'
}

const getDataLabel = (type) => {
    const typeIdx = type[3] % 32
    const parts = []
    if (CODE_1_LABEL[type[1]]) parts.push(CODE_1_LABEL[type[1]])
    if (CODE_3_LABEL[typeIdx]) parts.push(CODE_3_LABEL[typeIdx])
    if (type[5] === 4) parts.push('(Compact)')
    return parts.length ? parts.join(' ') : 'Data'
}

// linspace(fxv, lxv, n) — fxv > lxv でも線形に並べる
const linspace = (start, end, n) => {
    if (n <= 0) return []
    if (n === 1) return [start]
    const out = new Array(n)
    const step = (end - start) / (n - 1)
    for (let i = 0; i < n; i++) out[i] = start + step * i
    return out
}

export const parseOpusBuffer = (arrayBuffer) => {
    if (!isOpusMagic(arrayBuffer)) return null

    const view = new DataView(arrayBuffer)
    const header = parseHeader(view)
    const dirBlocks = parseDirectory(view, header.directoryStart, header.numBlocks)

    // ブロックを分類
    const dataBlocks = []
    const seriesBlocks = []
    const statusBlocks = []
    const paramBlocks = []
    for (const b of dirBlocks) {
        if (isDirectoryBlock(b.type)) continue
        if (isDataStatusBlock(b.type)) {
            const params = parseParams(view, b.start, b.size)
            statusBlocks.push({ ...b, params })
        } else if (isSeriesData(b.type)) {
            // Series ブロック header から data_size_per_sub を pre-fetch（ペアリング用）
            const dataSizePerSub = view.getInt32(b.start + 12, true)
            seriesBlocks.push({ ...b, dataSizePerSub })
        } else if (isDataBlock(b.type)) {
            dataBlocks.push(b)
        } else if (isParamBlock(b.type)) {
            // sample/reference の機器パラメータ等。今回は機能では使わないがメタとして保持
            const params = parseParams(view, b.start, b.size)
            paramBlocks.push({ ...b, params })
        }
    }

    const spectra = []

    // 1D データブロックのペアリングと展開
    const pairs = pairDataAndStatus(dataBlocks, statusBlocks)
    for (const d of dataBlocks) {
        const status = pairs.get(d.start)
        if (!status) continue // 無効ペア（data 長 < npt 等）はスキップ
        const p = status.params
        if (typeof p.fxv !== 'number' || typeof p.lxv !== 'number') continue
        const dpf = typeof p.dpf === 'number' ? p.dpf : 1
        const raw = parseData(view, d.start, d.size, dpf)
        const npt = p.npt
        const csf = typeof p.csf === 'number' ? p.csf : 1.0
        // Compact 形式は先頭にメタデータがあるので末尾 npt 個を取る
        const offset = isCompactData(d.type) ? raw.length - npt : 0
        const y = new Array(npt)
        for (let i = 0; i < npt; i++) y[i] = csf * raw[offset + i]
        const x = linspace(p.fxv, p.lxv, npt)
        spectra.push({
            key: getDataKey(d.type),
            label: getDataLabel(d.type),
            x,
            y,
            npt,
            dxu: typeof p.dxu === 'string' ? p.dxu : null,
            params: p,
        })
    }

    // 3D Series ブロックの展開: 各サブスペクトルを個別のエントリとして spectra に追加
    const seriesPairs = pairSeriesAndStatus(seriesBlocks, statusBlocks)
    for (const sb of seriesBlocks) {
        const status = seriesPairs.get(sb.start)
        if (!status) continue
        const p = status.params
        if (typeof p.fxv !== 'number' || typeof p.lxv !== 'number') continue
        const subs = parseDataSeries(view, sb.start, sb.size)
        if (!subs.length) continue
        const baseSrt = subs[0].info.srt ?? 0
        const npt = p.npt
        const csf = typeof p.csf === 'number' ? p.csf : 1.0
        const x = linspace(p.fxv, p.lxv, npt)
        for (let i = 0; i < subs.length; i++) {
            const sub = subs[i]
            const y = new Array(npt)
            for (let k = 0; k < npt; k++) y[k] = csf * sub.y[k]
            spectra.push({
                key: getDataKey(sb.type),
                label: getDataLabel(sb.type),
                x,
                y,
                npt,
                dxu: typeof p.dxu === 'string' ? p.dxu : null,
                params: p,
                seriesIndex: i,
                seriesTotal: subs.length,
                srt: sub.info.srt,
                ert: sub.info.ert,
                timeRelative: (sub.info.srt ?? 0) - baseSrt,
            })
        }
    }

    return {
        version: header.version,
        spectra,
        paramBlocks,
    }
}
