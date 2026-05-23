import { describe, it, expect } from 'vitest'
import { parseOpusBuffer, isOpusMagic } from '../opusParser.js'

// ------------- 合成 OPUS バイト列ビルダー -------------
// OPUS フォーマット仕様（brukeropus 参考）:
//   0..3   magic = 0x0A 0x0A 0xFE 0xFE
//   4..11  version (float64)
//   12..15 directory_start (int32)
//   16..19 max_blocks (int32)
//   20..23 num_blocks (int32)
//   以降は任意レイアウト。directory_start が directory block を指す。
//
// directory block は (type_int, size_in_words, start_byte) を num_blocks 個並べる。
// size_in_words は int32 単位 (= bytes / 4)。
//
// block_type の int32 エンコーディング (LSB から):
//   bits 0-1   = t[0]
//   bits 2-3   = t[1]
//   bits 4-9   = t[2]
//   bits 10-16 = t[3]
//   bits 17-18 = t[4]
//   bits 19-21 = t[5]

const encodeBlockType = (t) =>
    ((t[0] & 0x3)) |
    ((t[1] & 0x3) << 2) |
    ((t[2] & 0x3F) << 4) |
    ((t[3] & 0x7F) << 10) |
    ((t[4] & 0x3) << 17) |
    ((t[5] & 0x7) << 19)

// パラメータブロック 1 エントリを Uint8Array で組み立てる
// dtype_code: 0=int32, 1=float64, 2+=string
const buildParamEntry = (key, dtype, value) => {
    if (key.length !== 3) throw new Error('key must be 3 chars')
    const enc = new TextEncoder()
    let valBytes
    let valSizeWords // val_size は int16 で「2 で乗算前」の値、後で *2 して byte 数になる
    if (dtype === 0) {
        valBytes = new Uint8Array(4)
        new DataView(valBytes.buffer).setInt32(0, value, true)
        valSizeWords = 2 // 4 bytes / 2
    } else if (dtype === 1) {
        valBytes = new Uint8Array(8)
        new DataView(valBytes.buffer).setFloat64(0, value, true)
        valSizeWords = 4 // 8 bytes / 2
    } else {
        // 文字列。終端 \0 を含めて偶数バイトに揃える
        const raw = enc.encode(value)
        let total = raw.length + 1 // \0 終端
        if (total % 2 !== 0) total += 1
        valBytes = new Uint8Array(total)
        valBytes.set(raw, 0)
        valSizeWords = total / 2
    }
    const entry = new Uint8Array(8 + valBytes.length)
    entry.set(enc.encode(key), 0)
    entry[3] = 0 // 予約バイト
    new DataView(entry.buffer).setInt16(4, dtype, true)
    new DataView(entry.buffer).setInt16(6, valSizeWords, true)
    entry.set(valBytes, 8)
    return entry
}

const buildParamBlock = (entries) => {
    const parts = entries.map(([k, t, v]) => buildParamEntry(k, t, v))
    const endMarker = new Uint8Array(8)
    endMarker.set(new TextEncoder().encode('END'), 0)
    parts.push(endMarker)
    const total = parts.reduce((s, p) => s + p.length, 0)
    const out = new Uint8Array(total)
    let off = 0
    for (const p of parts) { out.set(p, off); off += p.length }
    return out
}

// Float32 データ配列をブロック化
const buildDataBlock = (values) => {
    const buf = new ArrayBuffer(values.length * 4)
    const view = new DataView(buf)
    for (let i = 0; i < values.length; i++) view.setFloat32(i * 4, values[i], true)
    return new Uint8Array(buf)
}

// STRUCT_3D_INFO の各フィールド (key, fmt) — opusParser.js と同期
const STRUCT_3D_INFO_TEST = [
    ['nss', 'i'], ['nsr', 'i'], ['nsn', 'i'], ['npt', 'i'],
    ['gfw', 'i'], ['gbw', 'i'], ['bfw', 'i'], ['bbw', 'i'],
    ['hfl', 'd'], ['lfl', 'd'], ['hff', 'd'], ['lff', 'd'],
    ['filter_size', 'i'], ['filter_type', 'i'],
    ['fxv', 'd'], ['lxv', 'd'], ['mny', 'd'], ['mxy', 'd'],
    ['csf', 'd'], ['pka', 'd'], ['pra', 'd'],
    ['pkl', 'i'], ['prl', 'i'], ['srt', 'd'], ['ert', 'd'],
]
const INFO_BYTES = STRUCT_3D_INFO_TEST.reduce((s, [, f]) => s + (f === 'i' ? 4 : 8), 0)

// Series ブロック構築
//   header(24): version, num_blocks, offset, data_size, info_size, store_count
//   store_table: store_count × (2 int32) = 8 byte/entry
//   sub-blocks: (spectrum_data_size + info_size) × num_blocks
const buildSeriesBlock = (spectraList, infoOverrides = []) => {
    // spectraList: [{ y: number[] }, ...]
    const num = spectraList.length
    const npt = spectraList[0].y.length
    const dataSize = npt * 4
    const infoSize = INFO_BYTES
    const storeCount = 0
    const headerBytes = 24
    const subOffset = headerBytes + storeCount * 8 // store_table 直後から
    const total = subOffset + (dataSize + infoSize) * num

    const buf = new ArrayBuffer(total)
    const view = new DataView(buf)
    view.setInt32(0, 0, true)              // version
    view.setInt32(4, num, true)            // num_blocks
    view.setInt32(8, subOffset, true)      // offset
    view.setInt32(12, dataSize, true)      // data_size
    view.setInt32(16, infoSize, true)      // info_size
    view.setInt32(20, storeCount, true)    // store_count

    let off = subOffset
    for (let i = 0; i < num; i++) {
        // spectrum
        for (let j = 0; j < npt; j++) {
            view.setFloat32(off + j * 4, spectraList[i].y[j], true)
        }
        off += dataSize
        // info block
        const overrides = infoOverrides[i] || {}
        let p = off
        for (const [key, fmt] of STRUCT_3D_INFO_TEST) {
            const v = overrides[key] ?? 0
            if (fmt === 'i') { view.setInt32(p, v, true); p += 4 }
            else { view.setFloat64(p, v, true); p += 8 }
        }
        off += infoSize
    }
    return new Uint8Array(buf)
}

// 与えられた block 群を含む完全な OPUS ファイルを構築
// blocks: [{ type: [6 ints], bytes: Uint8Array }]
const buildOpusFile = (blocks) => {
    // size は 4 の倍数に揃える必要あり（size_in_words = size/4）
    const padded = blocks.map(b => {
        const rem = b.bytes.length % 4
        if (rem === 0) return b
        const pad = new Uint8Array(b.bytes.length + (4 - rem))
        pad.set(b.bytes, 0)
        return { ...b, bytes: pad }
    })

    // directory block を構築するため、各ブロックの start を先に決める
    // レイアウト: header(24) + data blocks + directory
    const HEADER = 24
    const offsets = []
    let cur = HEADER
    for (const b of padded) {
        offsets.push(cur)
        cur += b.bytes.length
    }
    const directoryStart = cur
    // directory block 本体: 各 (type_int, size_in_words, start) と末尾の directory 自身のエントリ
    const dirEntries = padded.length + 1 // 自己エントリ含む
    const directorySize = dirEntries * 12
    const dirBytes = new Uint8Array(directorySize)
    const dirView = new DataView(dirBytes.buffer)
    for (let i = 0; i < padded.length; i++) {
        dirView.setInt32(i * 12, encodeBlockType(padded[i].type), true)
        dirView.setInt32(i * 12 + 4, padded[i].bytes.length / 4, true)
        dirView.setInt32(i * 12 + 8, offsets[i], true)
    }
    // 末尾に directory 自身のエントリ
    const dirSelfOffset = padded.length * 12
    dirView.setInt32(dirSelfOffset, encodeBlockType([0, 0, 0, 13, 0, 0]), true)
    dirView.setInt32(dirSelfOffset + 4, directorySize / 4, true)
    dirView.setInt32(dirSelfOffset + 8, directoryStart, true)

    const totalSize = directoryStart + directorySize
    const out = new Uint8Array(totalSize)
    const outView = new DataView(out.buffer)
    // header
    out[0] = 0x0A; out[1] = 0x0A; out[2] = 0xFE; out[3] = 0xFE
    outView.setFloat64(4, 7.5, true) // version
    outView.setInt32(12, directoryStart, true)
    outView.setInt32(16, dirEntries, true) // max_blocks
    outView.setInt32(20, dirEntries, true) // num_blocks
    // data blocks
    for (let i = 0; i < padded.length; i++) out.set(padded[i].bytes, offsets[i])
    // directory
    out.set(dirBytes, directoryStart)
    return out.buffer
}

// ------------- テスト -------------

describe('isOpusMagic', () => {
    it('マジックバイトを検出する', () => {
        const buf = new Uint8Array([0x0A, 0x0A, 0xFE, 0xFE, 0, 0, 0, 0]).buffer
        expect(isOpusMagic(buf)).toBe(true)
    })

    it('非 OPUS バイト列は拒否する', () => {
        const buf = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]).buffer
        expect(isOpusMagic(buf)).toBe(false)
    })

    it('4 バイト未満は false を返す', () => {
        const buf = new Uint8Array([0x0A, 0x0A]).buffer
        expect(isOpusMagic(buf)).toBe(false)
    })
})

describe('parseOpusBuffer', () => {
    it('マジックなしのバッファでは null を返す', () => {
        const buf = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer
        expect(parseOpusBuffer(buf)).toBeNull()
    })

    it('1 つの Reflectance ブロックを抽出できる', () => {
        const yValues = [0.1, 0.2, 0.3, 0.4]
        const dataBlock = {
            type: [0, 0, 0, 12, 0, 0], // Reflectance
            bytes: buildDataBlock(yValues),
        }
        const statusBlock = {
            type: [0, 0, 1, 12, 0, 0], // Data Parameters for Reflectance
            bytes: buildParamBlock([
                ['fxv', 1, 4000.0],
                ['lxv', 1, 1000.0],
                ['npt', 0, yValues.length],
                ['dpf', 0, 1],
                ['dxu', 2, 'WN'],
                ['csf', 1, 1.0],
            ]),
        }
        const buf = buildOpusFile([dataBlock, statusBlock])
        const result = parseOpusBuffer(buf)
        expect(result).not.toBeNull()
        expect(result.spectra).toHaveLength(1)
        const s = result.spectra[0]
        expect(s.key).toBe('r')
        expect(s.label).toMatch(/Reflectance/)
        expect(s.dxu).toBe('WN')
        expect(s.npt).toBe(4)
        expect(s.x).toHaveLength(4)
        // linspace(4000, 1000, 4) = [4000, 3000, 2000, 1000]
        expect(s.x[0]).toBeCloseTo(4000, 5)
        expect(s.x[3]).toBeCloseTo(1000, 5)
        expect(s.x[1]).toBeCloseTo(3000, 5)
        expect(s.y).toHaveLength(4)
        expect(s.y[0]).toBeCloseTo(0.1, 5)
        expect(s.y[3]).toBeCloseTo(0.4, 5)
    })

    it('CSF を適用して y をスケールする', () => {
        const yValues = [1.0, 2.0, 3.0]
        const dataBlock = {
            type: [0, 0, 0, 12, 0, 0],
            bytes: buildDataBlock(yValues),
        }
        const statusBlock = {
            type: [0, 0, 1, 12, 0, 0],
            bytes: buildParamBlock([
                ['fxv', 1, 1.0],
                ['lxv', 1, 3.0],
                ['npt', 0, 3],
                ['dpf', 0, 1],
                ['dxu', 2, 'MI'],
                ['csf', 1, 2.5],
            ]),
        }
        const buf = buildOpusFile([dataBlock, statusBlock])
        const result = parseOpusBuffer(buf)
        expect(result.spectra[0].y[0]).toBeCloseTo(2.5, 5)
        expect(result.spectra[0].y[1]).toBeCloseTo(5.0, 5)
        expect(result.spectra[0].y[2]).toBeCloseTo(7.5, 5)
    })

    it('複数のデータブロック (Absorbance + Transmittance) を別スペクトルとして返す', () => {
        const a = {
            type: [0, 0, 0, 4, 0, 0], // Absorbance
            bytes: buildDataBlock([0.5, 0.6]),
        }
        const aStatus = {
            type: [0, 0, 1, 4, 0, 0],
            bytes: buildParamBlock([
                ['fxv', 1, 2000.0], ['lxv', 1, 1000.0], ['npt', 0, 2],
                ['dpf', 0, 1], ['dxu', 2, 'WN'], ['csf', 1, 1.0],
            ]),
        }
        const t = {
            type: [0, 0, 0, 5, 0, 0], // Transmittance
            bytes: buildDataBlock([0.9, 0.8]),
        }
        const tStatus = {
            type: [0, 0, 1, 5, 0, 0],
            bytes: buildParamBlock([
                ['fxv', 1, 2000.0], ['lxv', 1, 1000.0], ['npt', 0, 2],
                ['dpf', 0, 1], ['dxu', 2, 'WN'], ['csf', 1, 1.0],
            ]),
        }
        const buf = buildOpusFile([a, aStatus, t, tStatus])
        const result = parseOpusBuffer(buf)
        expect(result.spectra).toHaveLength(2)
        const keys = result.spectra.map(s => s.key).sort()
        expect(keys).toEqual(['a', 't'])
    })

    it('NPT より長いデータブロックは NPT に切り詰める', () => {
        const yValues = [0.1, 0.2, 0.3, 0.99, 0.99] // 5 個格納、npt=3
        const dataBlock = {
            type: [0, 0, 0, 12, 0, 0],
            bytes: buildDataBlock(yValues),
        }
        const statusBlock = {
            type: [0, 0, 1, 12, 0, 0],
            bytes: buildParamBlock([
                ['fxv', 1, 1.0], ['lxv', 1, 3.0], ['npt', 0, 3],
                ['dpf', 0, 1], ['dxu', 2, 'MI'], ['csf', 1, 1.0],
            ]),
        }
        const buf = buildOpusFile([dataBlock, statusBlock])
        const result = parseOpusBuffer(buf)
        expect(result.spectra[0].y).toHaveLength(3)
        expect(result.spectra[0].y[2]).toBeCloseTo(0.3, 5)
    })

    it('同一 type の data/status が WN/MI で重複保存されているとき npt 一致で正しくペアリングする', () => {
        // 実 OPUS パターン: Sample channel が WN ベース (短) と MI ベース (長) で別々のブロックに保存される
        // type tuple は完全同一 (3,1,0,1,0,0) なので type マッチだけだと 2×2=4 通り誤組み合わせ
        const dataWN = {
            type: [3, 1, 0, 1, 0, 0],
            bytes: buildDataBlock([1.0, 2.0, 3.0]), // 3 点
        }
        const dataMI = {
            type: [3, 1, 0, 1, 0, 0],
            bytes: buildDataBlock([10.0, 20.0, 30.0, 40.0, 50.0]), // 5 点
        }
        const statusWN = {
            type: [3, 1, 1, 1, 0, 0],
            bytes: buildParamBlock([
                ['fxv', 1, 10000.0], ['lxv', 1, 5000.0], ['npt', 0, 3],
                ['dpf', 0, 1], ['dxu', 2, 'WN'], ['csf', 1, 1.0],
                ['mny', 1, 1.0], ['mxy', 1, 3.0],
            ]),
        }
        const statusMI = {
            type: [3, 1, 1, 1, 0, 0],
            bytes: buildParamBlock([
                ['fxv', 1, 1.0], ['lxv', 1, 5.0], ['npt', 0, 5],
                ['dpf', 0, 1], ['dxu', 2, 'MI'], ['csf', 1, 1.0],
                ['mny', 1, 10.0], ['mxy', 1, 50.0],
            ]),
        }
        const buf = buildOpusFile([dataWN, statusWN, dataMI, statusMI])
        const result = parseOpusBuffer(buf)
        expect(result.spectra).toHaveLength(2)
        // WN ペア: 3 点、x は cm⁻¹ 範囲
        const wn = result.spectra.find(s => s.dxu === 'WN')
        expect(wn).toBeDefined()
        expect(wn.npt).toBe(3)
        expect(wn.y).toHaveLength(3)
        expect(wn.x[0]).toBeCloseTo(10000, 5)
        // MI ペア: 5 点、x は μm 範囲
        const mi = result.spectra.find(s => s.dxu === 'MI')
        expect(mi).toBeDefined()
        expect(mi.npt).toBe(5)
        expect(mi.y).toHaveLength(5)
        expect(mi.x[0]).toBeCloseTo(1, 5)
        expect(mi.x[4]).toBeCloseTo(5, 5)
    })

    it('Series データブロック (type[5]==2) を各 time slice として展開する', () => {
        // 3 点 × npt=2 の Reflectance Series
        const series = buildSeriesBlock(
            [
                { y: [0.1, 0.2] },
                { y: [0.3, 0.4] },
                { y: [0.5, 0.6] },
            ],
            [
                { npt: 2, fxv: 1.0, lxv: 2.0, csf: 1, srt: 100.0, ert: 130.0 },
                { npt: 2, fxv: 1.0, lxv: 2.0, csf: 1, srt: 150.0, ert: 180.0 },
                { npt: 2, fxv: 1.0, lxv: 2.0, csf: 1, srt: 200.0, ert: 230.0 },
            ],
        )
        const seriesBlock = {
            type: [3, 3, 0, 12, 0, 2], // Ratioed/Reflectance/(Series)
            bytes: series,
        }
        // Series 用 status (type[5]==2, type[2]==1)
        const statusBlock = {
            type: [3, 3, 1, 12, 0, 2],
            bytes: buildParamBlock([
                ['fxv', 1, 1.0], ['lxv', 1, 2.0], ['npt', 0, 2],
                ['dpf', 0, 1], ['dxu', 2, 'MI'], ['csf', 1, 1.0],
            ]),
        }
        const buf = buildOpusFile([seriesBlock, statusBlock])
        const result = parseOpusBuffer(buf)
        expect(result.spectra).toHaveLength(3)
        for (const s of result.spectra) {
            expect(s.key).toBe('r') // Ratioed Reflectance
            expect(s.dxu).toBe('MI')
            expect(s.npt).toBe(2)
            expect(s.x).toHaveLength(2)
            expect(s.seriesTotal).toBe(3)
        }
        // 順序とインデックス
        expect(result.spectra[0].seriesIndex).toBe(0)
        expect(result.spectra[1].seriesIndex).toBe(1)
        expect(result.spectra[2].seriesIndex).toBe(2)
        // 時刻情報: srt と timeRelative
        expect(result.spectra[0].srt).toBeCloseTo(100, 5)
        expect(result.spectra[0].timeRelative).toBeCloseTo(0, 5)
        expect(result.spectra[1].timeRelative).toBeCloseTo(50, 5) // 150 - 100
        expect(result.spectra[2].timeRelative).toBeCloseTo(100, 5) // 200 - 100
        // y データ
        expect(result.spectra[0].y).toEqual([0.1, 0.2].map(v => expect.closeTo(v, 5)))
        expect(result.spectra[1].y[0]).toBeCloseTo(0.3, 5)
        expect(result.spectra[2].y[1]).toBeCloseTo(0.6, 5)
    })

    it('Compact データブロック (type[5]==4) は末尾 npt 個を実データとして読む', () => {
        // Compact 形式: [先頭プレフィックスバイト...][末尾に実 float32 配列]
        // ここでは prefix 5 個 + actual_y 3 個 = 計 8 floats のブロックを作る
        const prefix = [99, 99, 99, 99, 99] // 5 個のダミー prefix（メタデータの代わり）
        const actualY = [10.0, 20.0, 30.0]
        const allValues = [...prefix, ...actualY] // ブロック全体は 8 floats
        const dataBlock = {
            type: [0, 0, 0, 12, 0, 4], // Reflectance + (Compact)
            bytes: buildDataBlock(allValues),
        }
        const statusBlock = {
            type: [0, 0, 1, 12, 0, 4],
            bytes: buildParamBlock([
                ['fxv', 1, 1.0], ['lxv', 1, 3.0], ['npt', 0, 3],
                ['dpf', 0, 1], ['dxu', 2, 'MI'], ['csf', 1, 1.0],
            ]),
        }
        const buf = buildOpusFile([dataBlock, statusBlock])
        const result = parseOpusBuffer(buf)
        expect(result.spectra).toHaveLength(1)
        const s = result.spectra[0]
        expect(s.y).toHaveLength(3)
        // 末尾 3 個が読まれるべき: prefix の 99 が出てきたら誤り
        expect(s.y[0]).toBeCloseTo(10.0, 5)
        expect(s.y[1]).toBeCloseTo(20.0, 5)
        expect(s.y[2]).toBeCloseTo(30.0, 5)
        // brukeropus 互換: Compact は key/label に識別子を付ける
        expect(s.key).toBe('r_c')
        expect(s.label).toMatch(/\(Compact\)/)
    })

    it('data 長 < status.npt のペアは無効として除外する', () => {
        // 短い data + 大きい npt の status のみ → data は不足するので spectrum 化しない
        const data = {
            type: [0, 0, 0, 12, 0, 0],
            bytes: buildDataBlock([0.1, 0.2]), // 2 点しかない
        }
        const status = {
            type: [0, 0, 1, 12, 0, 0],
            bytes: buildParamBlock([
                ['fxv', 1, 1.0], ['lxv', 1, 5.0], ['npt', 0, 5], // 5 点要求
                ['dpf', 0, 1], ['dxu', 2, 'MI'], ['csf', 1, 1.0],
            ]),
        }
        const buf = buildOpusFile([data, status])
        const result = parseOpusBuffer(buf)
        expect(result.spectra).toHaveLength(0)
    })

    it('Sample 単一チャンネル (sm) を識別する', () => {
        // type[1]=1 (Sample), type[3]=1 (Spectrum) → key='sm'
        const dataBlock = {
            type: [0, 1, 0, 1, 0, 0],
            bytes: buildDataBlock([100.0, 200.0]),
        }
        const statusBlock = {
            type: [0, 1, 1, 1, 0, 0],
            bytes: buildParamBlock([
                ['fxv', 1, 2000.0], ['lxv', 1, 1000.0], ['npt', 0, 2],
                ['dpf', 0, 1], ['dxu', 2, 'WN'], ['csf', 1, 1.0],
            ]),
        }
        const buf = buildOpusFile([dataBlock, statusBlock])
        const result = parseOpusBuffer(buf)
        expect(result.spectra).toHaveLength(1)
        expect(result.spectra[0].key).toBe('sm')
    })
})
