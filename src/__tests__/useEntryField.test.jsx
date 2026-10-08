import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEntryField } from '../hooks/useEntryField.js';

describe('useEntryField', () => {
    const t1 = { x: [1], y: [1] };
    const t2 = { x: [2], y: [2] };

    it('指定したフィールドだけを並べた配列を返す', () => {
        const entries = [
            { trace: t1, visible: true },
            { trace: t2, visible: false },
        ];
        const { result } = renderHook(() => useEntryField(entries, 'visible'));
        expect(result.current).toEqual([true, false]);
    });

    it('他のフィールドだけが変わったときは前回と同じ配列を返す', () => {
        const { result, rerender } = renderHook(
            ({ entries }) => useEntryField(entries, 'trace'),
            {
                initialProps: {
                    entries: [{ trace: t1, visible: true }],
                },
            },
        );
        const first = result.current;
        rerender({ entries: [{ trace: t1, visible: false }] });
        expect(result.current).toBe(first);
    });

    it('対象のフィールドが変わったら新しい配列を返す', () => {
        const { result, rerender } = renderHook(
            ({ entries }) => useEntryField(entries, 'trace'),
            { initialProps: { entries: [{ trace: t1 }] } },
        );
        const first = result.current;
        rerender({ entries: [{ trace: t2 }] });
        expect(result.current).not.toBe(first);
        expect(result.current).toEqual([t2]);
    });
});
