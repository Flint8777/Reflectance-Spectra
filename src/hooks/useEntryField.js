import { useMemo, useRef } from 'react';

// entries（{ trace, file, visible, groupId } の配列）から 1 つのフィールドだけを並べた配列を作る。
// 中身が前回と同じなら前回の配列をそのまま返すので、例えば表示の切替で
// traces の参照が変わって規格化などを計算し直す、ということが起きない。
export function useEntryField(entries, key) {
    const prevRef = useRef(null);
    return useMemo(() => {
        const next = entries.map((e) => e[key]);
        const prev = prevRef.current;
        if (
            prev &&
            prev.length === next.length &&
            next.every((v, i) => v === prev[i])
        )
            return prev;
        prevRef.current = next;
        return next;
    }, [entries, key]);
}
