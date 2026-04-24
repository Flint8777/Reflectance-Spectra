import { describe, it, expect } from 'vitest'
import { findYatX, normalizeByMax, normalizeAtX, normalizeByMaxInRange, scaleToUnit, scaleToUnitInRange } from '../App.jsx'

describe('findYatX', () => {
    it('x が完全一致のとき対応する y を返す', () => {
        expect(findYatX([1, 2, 3], [10, 20, 30], 2)).toBe(20)
    })

    it('2点間では線形補間する', () => {
        expect(findYatX([1, 2, 3], [10, 20, 30], 1.5)).toBe(15)
    })

    it('先頭・末尾の境界値を扱える', () => {
        expect(findYatX([1, 2, 3], [10, 20, 30], 1)).toBe(10)
        expect(findYatX([1, 2, 3], [10, 20, 30], 3)).toBe(30)
    })

    it('範囲外のときは null を返す', () => {
        expect(findYatX([1, 2, 3], [10, 20, 30], 0.5)).toBeNull()
        expect(findYatX([1, 2, 3], [10, 20, 30], 3.5)).toBeNull()
    })

    it('降順の x 配列にも対応する', () => {
        expect(findYatX([3, 2, 1], [30, 20, 10], 1.5)).toBe(15)
    })

    it('空配列では null を返す', () => {
        expect(findYatX([], [], 1)).toBeNull()
    })
})

describe('normalizeByMax', () => {
    it('最大値で割って返す', () => {
        expect(normalizeByMax([1, 2, 4, 2])).toEqual([0.25, 0.5, 1, 0.5])
    })

    it('最大値が 0 のときはそのまま返す', () => {
        expect(normalizeByMax([0, 0, 0])).toEqual([0, 0, 0])
    })

    it('負の値があっても正の最大値で規格化する', () => {
        expect(normalizeByMax([-1, 2, 4])).toEqual([-0.25, 0.5, 1])
    })
})

describe('scaleToUnit', () => {
    it('値を [0, 1] の範囲にスケールする', () => {
        expect(scaleToUnit([10, 20, 30])).toEqual([0, 0.5, 1])
    })

    it('min と max が同じとき 0 の配列を返す', () => {
        expect(scaleToUnit([5, 5, 5])).toEqual([0, 0, 0])
    })

    it('形状（比率）を保つ', () => {
        // 元の y1=2, y2=4, y3=8 → スケール後の相対差分比 (y3-y2)/(y2-y1)=2 を保つ
        const result = scaleToUnit([2, 4, 8])
        expect(result[0]).toBe(0)
        expect(result[2]).toBe(1)
        // (result[2]-result[1])/(result[1]-result[0]) = (1-x)/x = 2 → x=1/3
        expect(result[1]).toBeCloseTo(1 / 3)
    })

    it('空配列はそのまま返す', () => {
        expect(scaleToUnit([])).toEqual([])
    })
})

describe('scaleToUnitInRange', () => {
    it('xRange 内の min/max で全データをスケール', () => {
        const xs = [1, 2, 3, 4, 5]
        const ys = [10, 5, 20, 3, 100]
        // [1,3] 内では min=5, max=20 なので (y - 5) / 15
        const r = scaleToUnitInRange(xs, ys, [1, 3])
        expect(r[0]).toBeCloseTo((10 - 5) / 15)
        expect(r[1]).toBe(0)
        expect(r[2]).toBe(1)
        expect(r[3]).toBeCloseTo((3 - 5) / 15)
        expect(r[4]).toBeCloseTo((100 - 5) / 15)
    })

    it('xRange が null のとき全範囲でスケール', () => {
        expect(scaleToUnitInRange([1, 2, 3], [10, 20, 30], null)).toEqual([0, 0.5, 1])
    })

    it('範囲内にデータ点が無い場合は null', () => {
        expect(scaleToUnitInRange([1, 2, 3], [10, 20, 30], [10, 20])).toBeNull()
    })

    it('範囲内の min と max が同じなら 0 の配列を返す', () => {
        expect(scaleToUnitInRange([1, 2, 3], [5, 5, 5], [1, 3])).toEqual([0, 0, 0])
    })
})

describe('normalizeByMaxInRange', () => {
    it('表示範囲内の最大値で全 y を割る', () => {
        const xs = [1, 2, 3, 4, 5]
        const ys = [10, 5, 20, 3, 100]
        // [1,3] の範囲内の最大値は 20
        const result = normalizeByMaxInRange(xs, ys, [1, 3])
        expect(result).toEqual([10 / 20, 5 / 20, 20 / 20, 3 / 20, 100 / 20])
    })

    it('xRange が null のときは全範囲の最大値で規格化する', () => {
        expect(normalizeByMaxInRange([1, 2, 3], [1, 2, 4], null)).toEqual([0.25, 0.5, 1])
    })

    it('範囲内にデータ点が無いときは null を返す', () => {
        expect(normalizeByMaxInRange([1, 2, 3], [10, 20, 30], [10, 20])).toBeNull()
    })

    it('範囲内の最大値が 0 のときはそのまま返す', () => {
        expect(normalizeByMaxInRange([1, 2, 3], [0, 0, 0], [1, 3])).toEqual([0, 0, 0])
    })
})

describe('normalizeAtX', () => {
    it('指定した x の値で全 y を割る', () => {
        const x = [1, 2, 3]
        const y = [10, 20, 30]
        expect(normalizeAtX(x, y, 2)).toEqual([0.5, 1, 1.5])
    })

    it('補間した値で規格化できる', () => {
        const x = [1, 2, 3]
        const y = [10, 20, 30]
        // x=1.5 での補間値は 15 なので [10/15, 20/15, 30/15]
        const result = normalizeAtX(x, y, 1.5)
        expect(result[0]).toBeCloseTo(10 / 15)
        expect(result[1]).toBeCloseTo(20 / 15)
        expect(result[2]).toBeCloseTo(30 / 15)
    })

    it('範囲外のときは null を返す', () => {
        expect(normalizeAtX([1, 2, 3], [10, 20, 30], 5)).toBeNull()
    })

    it('補間結果が 0 のときは null を返す', () => {
        expect(normalizeAtX([1, 2, 3], [0, 0, 0], 2)).toBeNull()
    })
})
