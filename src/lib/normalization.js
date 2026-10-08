// 規格化・スケーリングの純粋関数（App とテストから使う）

// 指定した target の x に対応する y を線形補間で返す。範囲外は null。
export function findYatX(xs, ys, target) {
    if (!xs || !ys || xs.length === 0 || xs.length !== ys.length) return null;
    const ascending = xs[0] <= xs[xs.length - 1];
    const xsArr = ascending ? xs : [...xs].reverse();
    const ysArr = ascending ? ys : [...ys].reverse();
    if (target < xsArr[0] || target > xsArr[xsArr.length - 1]) return null;
    for (let i = 0; i < xsArr.length - 1; i++) {
        const x1 = xsArr[i];
        const x2 = xsArr[i + 1];
        if (target >= x1 && target <= x2) {
            if (x1 === x2) return ysArr[i];
            const t = (target - x1) / (x2 - x1);
            return ysArr[i] + t * (ysArr[i + 1] - ysArr[i]);
        }
    }
    return null;
}

// 最大値で y 配列を規格化（最大値が 0 または非有限のときはそのまま返す）
export function normalizeByMax(ys) {
    let max = -Infinity;
    for (const v of ys) if (Number.isFinite(v) && v > max) max = v;
    if (!Number.isFinite(max) || max === 0) return ys;
    return ys.map((v) => v / max);
}

// xRange 内の最大値で規格化。xRange が null なら全範囲を使用。
// 範囲内にデータ点が無い場合は null を返し、最大値が 0 のときはそのまま返す。
export function normalizeByMaxInRange(xs, ys, xRange) {
    if (!xs || !ys || xs.length !== ys.length) return null;
    if (!xRange) return normalizeByMax(ys);
    const [xMin, xMax] =
        xRange[0] <= xRange[1] ? xRange : [xRange[1], xRange[0]];
    let max = -Infinity;
    let foundInRange = false;
    for (let i = 0; i < xs.length; i++) {
        const x = xs[i],
            y = ys[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < xMin || x > xMax) continue;
        foundInRange = true;
        if (y > max) max = y;
    }
    if (!foundInRange) return null;
    if (!Number.isFinite(max) || max === 0) return ys;
    return ys.map((v) => v / max);
}

// y 配列を (y - min) / (max - min) で [0, 1] にスケール。形状（比率）を保つ。
export function scaleToUnit(ys) {
    if (!ys?.length) return ys;
    let mn = Infinity,
        mx = -Infinity;
    for (const v of ys) {
        if (!Number.isFinite(v)) continue;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx)) return ys;
    const range = mx - mn;
    if (range === 0) return ys.map(() => 0);
    return ys.map((v) => (v - mn) / range);
}

// xRange 内の min/max を基準に [0, 1] にスケール。xRange が null なら全範囲。
// 範囲内にデータが無い場合は null を返す。min==max のときは 0 の配列を返す。
export function scaleToUnitInRange(xs, ys, xRange) {
    if (!xs || !ys || xs.length !== ys.length) return null;
    if (!xRange) return scaleToUnit(ys);
    const [xMin, xMax] =
        xRange[0] <= xRange[1] ? xRange : [xRange[1], xRange[0]];
    let mn = Infinity,
        mx = -Infinity;
    let found = false;
    for (let i = 0; i < xs.length; i++) {
        const x = xs[i],
            y = ys[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < xMin || x > xMax) continue;
        found = true;
        if (y < mn) mn = y;
        if (y > mx) mx = y;
    }
    if (!found) return null;
    const range = mx - mn;
    if (range === 0) return ys.map(() => 0);
    return ys.map((v) => (v - mn) / range);
}

// 指定 x の値で y 配列を規格化。範囲外や規格化値が 0 のときは null。
export function normalizeAtX(xs, ys, targetX) {
    const v = findYatX(xs, ys, targetX);
    if (v === null || !Number.isFinite(v) || v === 0) return null;
    return ys.map((y) => y / v);
}

// 主目盛り dtick から「キリのいい」副目盛り dtick を導く。丸く割れなければ undefined。
