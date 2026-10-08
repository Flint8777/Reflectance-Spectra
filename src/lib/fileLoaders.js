// 読み込んだファイル 1 つをトレースの素データに変換する純粋関数群。
// App 側の副作用（軸ラベルの更新・RELAB メタの保存）は戻り値で伝え、ここでは行わない。
//
// 戻り値は共通で { items, labels?, relabMeta? }。
// - items: [{ x, y, name, header, visible }]（header は軸ラベル候補 { xLabel, yLabel } か null）
// - labels: プリセットの軸ラベル（{ x, y }）。ロックされていなければ App がすぐ反映する
// - relabMeta: RELAB の XML から取り出したメタデータ（後続の .tab 読み込みで使う）
import Papa from 'papaparse';
import { PRESET_LABELS } from '../constants.js';
import { isOpusMagic, parseOpusBuffer } from '../opusParser.js';
import {
    extractRelabMeta,
    isRelabTabFile,
    parseDPT,
    parseRelabTab,
    parseWhitespaceSeparated,
} from './textParsers.js';

const EMPTY = { items: [] };

const wavenumberToMicron = (xs) =>
    xs.map((v) => (Number.isFinite(v) && v !== 0 ? 10000 / v : NaN));

// OPUS は数字だけの拡張子（.0 / .0001）か .opus
export const isOpusExtension = (ext) => /^\d+$/.test(ext) || ext === 'opus';

// OPUS から取り出したスペクトル群を、プリセットに応じて絞り込み・表示名付けする
export function selectOpusSpectra(spectra, fileName, presetSelected) {
    let list = spectra;
    if (presetSelected === 'wavelength-reflectance') {
        // 波長軸のスペクトルだけに絞る（PNT/LGW 等の Trace 軸は除外）
        list = list.filter((sp) => sp.dxu === 'WN' || sp.dxu === 'MI');
        // OPUS は同一物理スペクトルを WN/MI 両方で保存することがあるので MI を優先
        // Series の場合は seriesIndex ごとに別物として dedup する
        const byKey = new Map();
        for (const sp of list) {
            const idxPart =
                sp.seriesIndex !== undefined ? `#${sp.seriesIndex}` : '';
            const k = sp.key + idxPart;
            if (!byKey.has(k)) byKey.set(k, []);
            byKey.get(k).push(sp);
        }
        const filtered = [];
        for (const group of byKey.values()) {
            const miOnes = group.filter((s) => s.dxu === 'MI');
            if (miOnes.length && group.some((s) => s.dxu === 'WN'))
                filtered.push(...miOnes);
            else filtered.push(...group);
        }
        list = filtered;
    }
    // Series ファイルかつ較正済 (ratioed) が存在する場合、raw な単一チャンネル
    // (Sample 'sm' / Reference 'rf') をデフォルト非表示にする
    const isRawChannel = (sp) => sp.key.endsWith('sm') || sp.key.endsWith('rf');
    const hasSeries = list.some((sp) => sp.seriesIndex !== undefined);
    const hasCalibrated = list.some((sp) => !isRawChannel(sp));
    const hideRawByDefault = hasSeries && hasCalibrated;
    return list.map((sp) => {
        // OPUS の DXU=WN（cm⁻¹）→ wavelength-reflectance プリセット時のみ μm に変換
        const x =
            presetSelected === 'wavelength-reflectance' && sp.dxu === 'WN'
                ? wavenumberToMicron(sp.x)
                : sp.x;
        // 表示名: Series なら #N インデックス、複数スペクトルならラベル付き
        // 手動マイクロ FT-IR では位置情報が記録されないため、時刻ではなく順序番号を採用
        const labelWithIdx =
            sp.seriesIndex !== undefined
                ? `${sp.label} #${sp.seriesIndex + 1}`
                : sp.label;
        const name =
            list.length > 1 ? `${fileName} [${labelWithIdx}]` : fileName;
        return {
            x,
            y: Array.from(sp.y),
            name,
            header: PRESET_LABELS['wavelength-reflectance'],
            visible: !(hideRawByDefault && isRawChannel(sp)),
        };
    });
}

// OPUS バイナリの中身からトレースの素データを作る
export function loadOpusBuffer(ab, fileName, presetSelected) {
    if (!isOpusMagic(ab)) return EMPTY;
    const result = parseOpusBuffer(ab);
    if (!result?.spectra.length) return EMPTY;
    return {
        items: selectOpusSpectra(result.spectra, fileName, presetSelected),
        labels: PRESET_LABELS['wavelength-reflectance'],
    };
}

const single = (x, y, fileName, header) => ({
    x,
    y,
    name: fileName,
    header,
    visible: true,
});

// InfraWin の温度ログ（2 行目に装置の説明がある .txt）
function loadTimeTemperature(lines, fileName) {
    const headerIdx = lines.findIndex(
        (l) =>
            l.includes('No.') &&
            l.includes('Date') &&
            l.includes('Temperature'),
    );
    if (headerIdx === -1) return EMPTY;
    const headers = lines[headerIdx].split('\t').map((h) => h.trim());
    const dataLines = lines.slice(headerIdx + 2).filter((l) => l.trim());
    const xIdx = headers.findIndex(
        (h) => h.includes('Sec.') && h.includes('00:00'),
    );
    const yIdx = headers.indexOf('Temperature');
    if (xIdx === -1 || yIdx === -1) return EMPTY;
    const x = [];
    const y = [];
    for (const dl of dataLines) {
        const cols = dl.split('\t').map((c) => c.trim());
        const xv = Number(cols[xIdx]);
        const yv = Number(cols[yIdx]);
        if (Number.isFinite(xv) && Number.isFinite(yv)) {
            x.push(xv);
            y.push(yv);
        }
    }
    // 時間は 0 秒始まりにそろえる
    if (x.length) {
        const start = x[0];
        for (let i = 0; i < x.length; i++) x[i] -= start;
    }
    return {
        items: [single(x, y, fileName, PRESET_LABELS['time-temperature'])],
        labels: PRESET_LABELS['time-temperature'],
    };
}

// CSV: 先頭行が数値でなければヘッダーありとみなし、1・2 列目を x・y に使う
function loadCsv(text, lines, fileName, toMicron) {
    const nonEmpty = lines.filter(Boolean);
    if (!nonEmpty.length) return EMPTY;
    const firstParsed = Papa.parse(nonEmpty[0], { header: false }).data[0];
    let hasHeader = false;
    let headerX = null;
    let headerY = null;
    if (firstParsed && firstParsed.length >= 2) {
        const v0 = Number(firstParsed[0]);
        const v1 = Number(firstParsed[1]);
        if (!Number.isFinite(v0) || !Number.isFinite(v1)) {
            hasHeader = true;
            headerX = String(firstParsed[0]).trim();
            headerY = String(firstParsed[1]).trim();
        }
    }
    // 文字列を渡した Papa.parse は同期的に結果を返す
    const res = Papa.parse(text, {
        header: hasHeader,
        dynamicTyping: true,
        skipEmptyLines: true,
    });
    const x = [];
    const y = [];
    if (hasHeader && res.data.length) {
        const fields = Object.keys(res.data[0]);
        const xKey = fields[0];
        const yKey = fields[1] || fields[0];
        for (const row of res.data) {
            const xv = Number(row[xKey]);
            const yv = Number(row[yKey]);
            if (Number.isFinite(xv) && Number.isFinite(yv)) {
                x.push(xv);
                y.push(yv);
            }
        }
    } else {
        for (const row of res.data) {
            if (!row || row.length < 2) continue;
            const xv = Number(row[0]);
            const yv = Number(row[1]);
            if (Number.isFinite(xv) && Number.isFinite(yv)) {
                x.push(xv);
                y.push(yv);
            }
        }
    }
    return {
        items: [
            single(
                toMicron(x),
                y,
                fileName,
                hasHeader ? { xLabel: headerX, yLabel: headerY } : null,
            ),
        ],
    };
}

// RELAB の .tab（nm 保存）。対応する .xml のメタがあればそれで読み、無ければ簡易判定
function loadRelabTab(text, fileName, meta) {
    let x = [];
    let y = [];
    if (meta) {
        try {
            ({ x, y } = parseRelabTab(text, meta));
        } catch {
            ({ x, y } = parseDPT(text));
        }
    } else if (isRelabTabFile(text)) {
        const lines = text.split(/\r?\n/).map((l) => l.trim());
        const n = parseInt(lines[0], 10);
        for (let i = 1; i <= n && i < lines.length; ++i) {
            const t = lines[i];
            if (!t) continue;
            const m = t.match(
                /^\s*([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)(?:\s+[-+]?\d+(?:\.\d+)?)?\s*$/,
            );
            if (m) {
                const xv = parseFloat(m[1]);
                const yv = parseFloat(m[2]);
                if (Number.isFinite(xv) && Number.isFinite(yv)) {
                    x.push(xv);
                    y.push(yv);
                }
            }
        }
    } else {
        ({ x, y } = parseDPT(text));
    }
    // RELAB TAB は nm 保存なので μm へ変換（XML メタあり/なし双方に適用）
    if (x.length) x = x.map((v) => v / 1000);
    return {
        items: [
            single(x, y, fileName, PRESET_LABELS['wavelength-reflectance']),
        ],
        labels: PRESET_LABELS['wavelength-reflectance'],
    };
}

// テキスト形式のファイル 1 つを読む。形式は拡張子と内容で判定する
export function loadTextFile(
    text,
    fileName,
    { presetSelected, unitOverride = null, relabMeta = {} },
) {
    const lname = fileName.toLowerCase();
    const ext = lname.split('.').pop();
    const lines = text.split(/\r?\n/);
    // 単位ダイアログで nm が選ばれたら μm に換算する（反射スペクトルのときだけ）
    const toMicron = (x) =>
        presetSelected === 'wavelength-reflectance' && unitOverride === 'nm'
            ? x.map((v) => v / 1000)
            : x;

    const isTimeTemp =
        lines.length > 1 &&
        lines[1]
            .trim()
            .includes(
                'This document contains measurement data of the following devices:',
            );
    if (isTimeTemp) return loadTimeTemperature(lines, fileName);

    if (ext === 'csv') return loadCsv(text, lines, fileName, toMicron);

    if (ext === 'xml') {
        try {
            const meta = extractRelabMeta(text);
            if (meta?.tabFileName) return { items: [], relabMeta: meta };
        } catch {}
        return EMPTY;
    }

    if (ext === 'tab') return loadRelabTab(text, fileName, relabMeta[lname]);

    if (ext === 'dpt') {
        const { x, y } = parseDPT(text);
        if (!x.length) return EMPTY;
        return {
            items: [
                single(x, y, fileName, PRESET_LABELS['wavelength-reflectance']),
            ],
            labels: PRESET_LABELS['wavelength-reflectance'],
        };
    }

    if (ext === 'asc') {
        const { x, y } = parseWhitespaceSeparated(text);
        if (!x.length) return EMPTY;
        return {
            items: [single(x, y, fileName, PRESET_LABELS['spacing-intensity'])],
            labels: PRESET_LABELS['spacing-intensity'],
        };
    }

    // その他: 空白/タブ区切り 2 列のフォールバック
    const { x, y } = parseWhitespaceSeparated(text);
    return { items: [single(toMicron(x), y, fileName, null)] };
}

const readAs = (file, kind) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        if (kind === 'arrayBuffer') reader.readAsArrayBuffer(file);
        else reader.readAsText(file);
    });

// File を読み、形式に応じてトレースの素データを返す。
// 読み込みや解析で例外が出たら空の結果を返す（呼び出し側で「読めなかったファイル」として扱う）
export async function loadFile(file, options) {
    const ext = file.name.toLowerCase().split('.').pop();
    try {
        if (isOpusExtension(ext)) {
            const ab = await readAs(file, 'arrayBuffer');
            return loadOpusBuffer(ab, file.name, options.presetSelected);
        }
        const text = String(await readAs(file, 'text'));
        return loadTextFile(text, file.name, options);
    } catch {
        return EMPTY;
    }
}
