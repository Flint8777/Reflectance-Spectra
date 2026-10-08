// 軸目盛り・凡例配置・エクスポート用フィギュア生成の純粋関数

// 割り算を使わないのは 1e-5 / 5 === 2.0000000000000003e-6 になるため（指数表記から作り直す）。
const MINOR_MANTISSA = /^(\d\.\d{6})e([+-]\d+)$/;
const MINOR_TABLE = new Map([
    ['1.000000', [2, -1]], // 5 分割: 1 -> 0.2
    ['2.000000', [5, -1]], // 4 分割: 2 -> 0.5
    ['2.500000', [5, -1]], // 5 分割: 2.5 -> 0.5
    ['5.000000', [1, 0]], // 5 分割: 5 -> 1
]);

export function minorDtick(majorDtick) {
    // log/date 軸の dtick は 'M1'・'L2' のような文字列なので数値以外は弾く
    if (
        typeof majorDtick !== 'number' ||
        !Number.isFinite(majorDtick) ||
        majorDtick <= 0
    ) {
        return undefined;
    }
    const m = MINOR_MANTISSA.exec(majorDtick.toExponential(6));
    if (!m) return undefined;
    const hit = MINOR_TABLE.get(m[1]);
    if (!hit) return undefined;
    const out = Number(`${hit[0]}e${Number(m[2]) + hit[1]}`);
    return out > 0 && Number.isFinite(out) ? out : undefined;
}

const LEGEND_INSET = 0.02;
// これを超える大きさの凡例は図の中に置かない（プロットを覆ってしまうため）
const LEGEND_MAX_FRAC = 0.62;
// 凡例とデータの間に最低これだけ空ける（chamfer 距離。3 = 1 セル）
const LEGEND_MIN_CLEARANCE = 3;

function estimateLegendBox(list) {
    let nameLen = 6;
    for (const t of list) nameLen = Math.max(nameLen, (t?.name ?? '').length);
    return {
        boxW: Math.min(0.6, 0.1 + 0.012 * nameLen),
        boxH: Math.min(0.6, 0.05 + 0.05 * Math.max(1, list.length)),
    };
}

// 線分を [0,1]^2 にクリップする（Liang-Barsky）。両端が枠外でも横切る線を拾うため。
function clipUnitSegment(u0, v0, u1, v1) {
    const du = u1 - u0;
    const dv = v1 - v0;
    const p = [-du, du, -dv, dv];
    const q = [u0, 1 - u0, v0, 1 - v0];
    let t0 = 0;
    let t1 = 1;
    for (let i = 0; i < 4; i++) {
        if (p[i] === 0) {
            if (q[i] < 0) return null;
            continue;
        }
        const r = q[i] / p[i];
        if (p[i] < 0) {
            if (r > t1) return null;
            if (r > t0) t0 = r;
        } else {
            if (r < t0) return null;
            if (r < t1) t1 = r;
        }
    }
    return [u0 + t0 * du, v0 + t0 * dv, u0 + t1 * du, v0 + t1 * dv];
}

// 凡例をスペクトルに重ならない位置へ置く。角は優先せず、データから最も離れた場所を選ぶ。
// 空きが無い（または凡例が大きすぎる）ときは clear:false を返し、呼び出し側が図の外へ逃がす。
export function pickLegendPlacement(traces, options = {}) {
    const { xRange = null, yRange = null, aspect = 1, grid = 64 } = options;
    const list = (traces ?? []).filter(
        (t) =>
            t?.x?.length &&
            t?.y?.length &&
            t.visible !== false &&
            t.visible !== 'legendonly',
    );
    const est = estimateLegendBox(list);
    const boxW = Number.isFinite(options.boxW) ? options.boxW : est.boxW;
    const boxH = Number.isFinite(options.boxH) ? options.boxH : est.boxH;
    const inset = LEGEND_INSET;
    const corner = (clear) => ({
        x: Math.min(Math.max(1 - inset - boxW, inset), 1 - inset),
        y: 1 - inset,
        xanchor: 'left',
        yanchor: 'top',
        clear,
    });
    if (!list.length) return corner(true);
    if (boxW > LEGEND_MAX_FRAC || boxH > LEGEND_MAX_FRAC) return corner(false);

    const nx = Math.min(256, Math.max(16, Math.round(grid)));
    // セルが画素で正方形になるよう縦の分割数を縦横比から決める
    const ny = Math.min(
        256,
        Math.max(
            16,
            Math.round(
                nx / (Number.isFinite(aspect) && aspect > 0 ? aspect : 1),
            ),
        ),
    );

    // 軸レンジ。range[0] が原点なので、反転軸（波数など）でもそのまま扱える
    let x0 = Number.NaN;
    let x1 = Number.NaN;
    let y0 = Number.NaN;
    let y1 = Number.NaN;
    if (xRange && Number.isFinite(xRange[0]) && Number.isFinite(xRange[1])) {
        [x0, x1] = xRange;
    }
    if (yRange && Number.isFinite(yRange[0]) && Number.isFinite(yRange[1])) {
        [y0, y1] = yRange;
    }
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) {
        let xMin = Number.POSITIVE_INFINITY;
        let xMax = Number.NEGATIVE_INFINITY;
        let yMin = Number.POSITIVE_INFINITY;
        let yMax = Number.NEGATIVE_INFINITY;
        for (const t of list) {
            const n = Math.min(t.x.length, t.y.length);
            for (let i = 0; i < n; i++) {
                const x = t.x[i];
                const y = t.y[i];
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                if (x < xMin) xMin = x;
                if (x > xMax) xMax = x;
                if (y < yMin) yMin = y;
                if (y > yMax) yMax = y;
            }
        }
        if (!Number.isFinite(xMin)) return corner(true);
        if (!Number.isFinite(x0)) [x0, x1] = [xMin, xMax];
        if (!Number.isFinite(y0)) [y0, y1] = [yMin, yMax];
    }
    const spanX = x1 - x0;
    const spanY = y1 - y0;
    const toU = (x) => (spanX === 0 ? 0.5 : (x - x0) / spanX);
    const toV = (y) => (spanY === 0 ? 0.5 : (y - y0) / spanY);

    // --- 占有グリッド: 点ではなく折れ線として塗る ---
    const occ = new Uint8Array(nx * ny);
    const colOf = (u) => Math.min(nx - 1, Math.max(0, Math.floor(u * nx)));
    const rowOf = (v) =>
        Math.min(ny - 1, Math.max(0, Math.floor((1 - v) * ny)));
    const markCell = (u, v) => {
        if (u < 0 || u > 1 || v < 0 || v > 1) return;
        occ[rowOf(v) * nx + colOf(u)] = 1;
    };
    const markSegment = (u0, v0, u1, v1) => {
        const c = clipUnitSegment(u0, v0, u1, v1);
        if (!c) return;
        const ca = colOf(c[0]);
        const ra = rowOf(c[1]);
        const cb = colOf(c[2]);
        const rb = rowOf(c[3]);
        const steps = Math.max(Math.abs(cb - ca), Math.abs(rb - ra));
        if (steps === 0) {
            occ[ra * nx + ca] = 1;
            return;
        }
        for (let i = 0; i <= steps; i++) {
            const cc = Math.round(ca + ((cb - ca) * i) / steps);
            const rr = Math.round(ra + ((rb - ra) * i) / steps);
            occ[rr * nx + cc] = 1;
        }
    };

    const BUDGET = 4000;
    let marked = false;
    for (const t of list) {
        const n = Math.min(t.x.length, t.y.length);
        const connect = !(
            typeof t.mode === 'string' &&
            t.mode.includes('markers') &&
            !t.mode.includes('lines')
        );
        const stride = Math.max(1, Math.ceil(n / BUDGET));
        let prevU = null;
        let prevV = null;
        for (let start = 0; start < n; start += stride) {
            const end = Math.min(start + stride, n);
            // チャンクの最小・最大を残す間引き。細いスパイクを飛ばさない
            let lo = -1;
            let hi = -1;
            let first = -1;
            let last = -1;
            let gap = false;
            for (let i = start; i < end; i++) {
                if (!Number.isFinite(t.x[i]) || !Number.isFinite(t.y[i])) {
                    gap = true;
                    continue;
                }
                if (first < 0) first = i;
                last = i;
                if (lo < 0 || t.y[i] < t.y[lo]) lo = i;
                if (hi < 0 || t.y[i] > t.y[hi]) hi = i;
            }
            if (first < 0) {
                prevU = null;
                prevV = null;
                continue;
            }
            const keep = [...new Set([first, lo, hi, last])].sort(
                (a, b) => a - b,
            );
            for (const i of keep) {
                const u = toU(t.x[i]);
                const v = toV(t.y[i]);
                if (connect && prevU !== null) markSegment(prevU, prevV, u, v);
                else markCell(u, v);
                marked = true;
                prevU = u;
                prevV = v;
            }
            if (gap) {
                prevU = null;
                prevV = null;
            }
        }
    }
    if (!marked) return corner(true);

    // --- データからの距離（chamfer 3-4）---
    const INF = 1 << 24;
    const dist = new Int32Array(nx * ny);
    for (let i = 0; i < dist.length; i++) dist[i] = occ[i] ? 0 : INF;
    for (let r = 0; r < ny; r++) {
        for (let c = 0; c < nx; c++) {
            const k = r * nx + c;
            let d = dist[k];
            if (r > 0) {
                d = Math.min(d, dist[k - nx] + 3);
                if (c > 0) d = Math.min(d, dist[k - nx - 1] + 4);
                if (c < nx - 1) d = Math.min(d, dist[k - nx + 1] + 4);
            }
            if (c > 0) d = Math.min(d, dist[k - 1] + 3);
            dist[k] = d;
        }
    }
    for (let r = ny - 1; r >= 0; r--) {
        for (let c = nx - 1; c >= 0; c--) {
            const k = r * nx + c;
            let d = dist[k];
            if (r < ny - 1) {
                d = Math.min(d, dist[k + nx] + 3);
                if (c < nx - 1) d = Math.min(d, dist[k + nx + 1] + 4);
                if (c > 0) d = Math.min(d, dist[k + nx - 1] + 4);
            }
            if (c < nx - 1) d = Math.min(d, dist[k + 1] + 3);
            dist[k] = d;
        }
    }

    // --- 箱の中の最小距離をスライディング最小値で求める ---
    const bw = Math.min(nx, Math.max(1, Math.ceil(boxW * nx)));
    const bh = Math.min(ny, Math.max(1, Math.ceil(boxH * ny)));
    const imX = Math.ceil(inset * nx);
    const imY = Math.ceil(inset * ny);
    const cLo = imX;
    const cHi = nx - imX - bw;
    const rLo = imY;
    const rHi = ny - imY - bh;
    if (cHi < cLo || rHi < rLo) return corner(false);

    const rowMin = new Int32Array(ny * nx);
    for (let r = 0; r < ny; r++) {
        for (let c = cLo; c <= cHi; c++) {
            let m = INF;
            for (let k = 0; k < bw; k++) {
                const v = dist[r * nx + c + k];
                if (v < m) m = v;
            }
            rowMin[r * nx + c] = m;
        }
    }

    let best = -1;
    let bestEdge = 0;
    let bestC = cLo;
    let bestR = rLo;
    for (let r = rLo; r <= rHi; r++) {
        for (let c = cLo; c <= cHi; c++) {
            let m = INF;
            for (let k = 0; k < bh; k++) {
                const v = rowMin[(r + k) * nx + c];
                if (v < m) m = v;
            }
            // 同点のときだけ枠の隅に寄せる（連番書き出しで位置が飛ばないように）
            const edge =
                Math.min(c - cLo, cHi - c) / Math.max(1, nx) +
                Math.min(r - rLo, rHi - r) / Math.max(1, ny);
            if (m > best || (m === best && edge < bestEdge)) {
                best = m;
                bestEdge = edge;
                bestC = c;
                bestR = r;
            }
        }
    }
    if (best < LEGEND_MIN_CLEARANCE) return corner(false);

    // ceil で膨らませたぶんを均等に戻し、検証済みのセル矩形の内側に収める
    const x = bestC / nx + (bw / nx - boxW) / 2;
    const yTop = 1 - bestR / ny - (bh / ny - boxH) / 2;
    return {
        x: Math.min(Math.max(x, inset), Math.max(inset, 1 - inset - boxW)),
        y: Math.min(
            Math.max(yTop, Math.min(1 - inset, inset + boxH)),
            1 - inset,
        ),
        xanchor: 'left',
        yanchor: 'top',
        clear: true,
    };
}

// 論文向けに書き出す図の figure（data + layout）を組み立てる。
// scattergl は WebGL キャンバスをラスタ画像として SVG に埋め込むため、
// ベクター出力には SVG レンダラの scatter へ落とす必要がある。
export function buildExportFigure(traces, layout, options = {}) {
    const { showLegend = true, xRange = null, yRange = null } = options;
    const data = (traces ?? []).map((t) => ({
        ...t,
        type: t.type === 'scattergl' ? 'scatter' : t.type,
    }));
    // 定数ではなく毎回作る。plotly は渡した layout に書き戻すので、
    // x/y で minor を共有すると片方の relayout がもう片方を壊す。
    const exportAxisStyle = () => ({
        showgrid: false,
        zeroline: false,
        showline: true,
        linecolor: '#000000',
        linewidth: 1,
        mirror: false,
        ticks: 'outside',
        ticklen: 6,
        tickwidth: 1,
        tickcolor: '#000000',
        minor: {
            ticks: 'outside',
            ticklen: 3,
            tickwidth: 1,
            tickcolor: '#000000',
            showgrid: false,
        },
    });
    const exportAxis = (axis, range, side) => {
        const src = axis ?? {};
        const out = {
            ...src,
            ...exportAxisStyle(),
            side,
            ...(range ? { autorange: false, range: [range[0], range[1]] } : {}),
        };
        // 画面側 memo とネストを共有しない（plotly が書き戻すため）
        if (src.title) {
            out.title = {
                ...src.title,
                ...(src.title.font ? { font: { ...src.title.font } } : {}),
            };
        }
        // スタック表示は目盛ラベルを出さない。数字の無い目盛だけ残ると壊れて見える
        if (out.showticklabels === false) {
            out.ticks = '';
            out.minor = { ...out.minor, ticks: '' };
        }
        return out;
    };
    const est = estimateLegendBox(data);
    return {
        data,
        layout: {
            ...layout,
            paper_bgcolor: '#ffffff',
            plot_bgcolor: '#ffffff',
            xaxis: exportAxis(layout?.xaxis, xRange, 'bottom'),
            yaxis: exportAxis(layout?.yaxis, yRange, 'left'),
            showlegend: showLegend,
            legend: {
                bgcolor: '#ffffff',
                bordercolor: '#cccccc',
                borderwidth: 1,
                font: { size: 12 },
                ...(layout?.legend ?? {}),
                // 本番の位置は実測した凡例サイズを使って書き出し時に決める
                x: Math.max(LEGEND_INSET, 1 - LEGEND_INSET - est.boxW),
                y: 1 - LEGEND_INSET,
                xanchor: 'left',
                yanchor: 'top',
            },
        },
    };
}
