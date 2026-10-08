// テキスト形式（DPT / 空白区切り / RELAB TAB+XML）のパーサ

// RELAB .tabファイル判定関数
export function isRelabTabFile(text) {
    const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    if (lines.length < 3) return false;
    // 先頭が整数
    if (!/^\d+$/.test(lines[0])) return false;
    // 2行目以降が「数値 空白 数値」または「数値 空白 数値 空白 数値」形式
    let dataLineCount = 0;
    for (let i = 1; i < lines.length; ++i) {
        if (
            /^[-+]?\d+(?:\.\d+)?\s+[-+]?\d+(?:\.\d+)?(?:\s+[-+]?\d+(?:\.\d+)?)?$/.test(
                lines[i],
            )
        ) {
            dataLineCount++;
        } else {
            break;
        }
    }
    // データ行数が先頭の整数と一致
    if (dataLineCount === parseInt(lines[0], 10)) return true;
    return false;
}

export function parseWhitespaceSeparated(text) {
    const lines = text.split(/\r?\n/);
    const xs = [],
        ys = [];
    for (const ln of lines) {
        const t = ln.trim();
        if (!t || t.startsWith('#')) continue;
        const cols = t.split(/\s+/).filter(Boolean);
        if (cols.length < 2) continue;
        const x = parseFloat(cols[0]),
            y = parseFloat(cols[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            xs.push(x);
            ys.push(y);
        }
    }
    return { x: xs, y: ys };
}

export function parseDPT(text) {
    const lines = text.split(/\r?\n/);
    const xs = [];
    const ys = [];
    for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        // DPTファイルはカンマ区切り専用
        if (!t.includes(',')) continue;
        const parts = t
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
        if (parts.length < 2) continue;
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            xs.push(x);
            ys.push(y);
        }
    }
    return { x: xs, y: ys };
}

export function extractRelabMeta(xmlText) {
    const fileNameMatch = xmlText.match(/<file_name>([^<]+)<\/file_name>/i);
    if (!fileNameMatch) throw new Error('file_name not found');
    const tabFileName = fileNameMatch[1].trim().toLowerCase();
    const recordsMatch = xmlText.match(/<records>(\d+)<\/records>/i);
    const recordCount = recordsMatch ? Number(recordsMatch[1]) : null;
    const wlPattern =
        '<Field_Character>[\\s\\S]*?<name>Wavelength</name>[\\s\\S]*?<field_location unit="byte">(\\d+)</field_location>[\\s\\S]*?<field_length unit="byte">(\\d+)</field_length>[\\s\\S]*?</Field_Character>';
    const rfPattern =
        '<Field_Character>[\\s\\S]*?<name>Reflectance</name>[\\s\\S]*?<field_location unit="byte">(\\d+)</field_location>[\\s\\S]*?<field_length unit="byte">(\\d+)</field_length>[\\s\\S]*?</Field_Character>';
    const wlBlock = xmlText.match(new RegExp(wlPattern, 'i'));
    const rfBlock = xmlText.match(new RegExp(rfPattern, 'i'));
    if (!wlBlock || !rfBlock) throw new Error('fields not found');
    const wlLoc = Number(wlBlock[1]) - 1;
    const wlLen = Number(wlBlock[2]);
    const rfLoc = Number(rfBlock[1]) - 1;
    const rfLen = Number(rfBlock[2]);
    return { tabFileName, wlLoc, wlLen, rfLoc, rfLen, recordCount };
}

export function parseRelabTab(rawText, meta) {
    const { wlLoc, wlLen, rfLoc, rfLen, recordCount } = meta;
    const norm = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = norm.split('\n');
    const x = [];
    const y = [];
    let headerSkipped = false;
    for (const ln of lines) {
        if (!ln.trim()) continue;
        const stripped = ln.trim();
        if (
            !headerSkipped &&
            recordCount &&
            /^\d+$/.test(stripped) &&
            Number(stripped) === recordCount
        ) {
            headerSkipped = true;
            continue;
        }
        if (/^[A-Za-z]/.test(stripped)) break;
        if (ln.length < Math.max(wlLoc + wlLen, rfLoc + rfLen)) continue;
        const wlStr = ln.slice(wlLoc, wlLoc + wlLen).trim();
        const rfStr = ln.slice(rfLoc, rfLoc + rfLen).trim();
        if (!wlStr || !rfStr) continue;
        const wlVal = Number(wlStr);
        const rfVal = Number(rfStr);
        if (!Number.isFinite(wlVal) || !Number.isFinite(rfVal)) continue;
        x.push(wlVal);
        y.push(rfVal);
        if (recordCount && x.length >= recordCount) break;
    }
    if (!x.length) throw new Error('No numeric data in TAB');
    return { x, y };
}
