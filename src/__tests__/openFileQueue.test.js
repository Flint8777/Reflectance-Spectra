import { describe, expect, it, vi } from 'vitest';
import { OpenFileQueue } from '../../electron/openFileQueue.cjs';

const payload = (...names) => names.map((name) => ({ name, data: name }));

describe('OpenFileQueue', () => {
    it('renderer が取りに来るまでは送らずに貯める（起動直後の取りこぼし防止）', () => {
        const send = vi.fn().mockReturnValue(true);
        const q = new OpenFileQueue({ send });
        q.add(payload('a.dpt'));
        expect(send).not.toHaveBeenCalled();
        expect(q.take()).toEqual(payload('a.dpt'));
    });

    it('一度取りに来たあとは送るだけで、二重に受け取らせない', () => {
        const send = vi.fn().mockReturnValue(true);
        const q = new OpenFileQueue({ send });
        q.take();
        q.add(payload('b.dpt'));
        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith(payload('b.dpt'));
        expect(q.take()).toEqual([]);
    });

    it('送れなかったとき（ウィンドウが無い等）は貯める', () => {
        const send = vi.fn().mockReturnValue(false);
        const q = new OpenFileQueue({ send });
        q.take();
        q.add(payload('c.dpt'));
        expect(q.take()).toEqual(payload('c.dpt'));
    });

    it('ウィンドウを作り直したら未準備に戻す（購読も作り直しになるため）', () => {
        const send = vi.fn().mockReturnValue(true);
        const q = new OpenFileQueue({ send });
        q.take();
        q.markRendererNotReady();
        q.add(payload('d.dpt'));
        expect(send).not.toHaveBeenCalled();
        expect(q.take()).toEqual(payload('d.dpt'));
    });

    it('取り出しは破壊的で、二度目は空になる', () => {
        const q = new OpenFileQueue({ send: () => true });
        q.add(payload('e.dpt'));
        expect(q.take()).toHaveLength(1);
        expect(q.take()).toEqual([]);
    });

    it('複数回貯めたぶんをまとめて渡す', () => {
        const q = new OpenFileQueue({ send: () => true });
        q.add(payload('f.dpt'));
        q.add(payload('g.dpt', 'h.dpt'));
        expect(q.take()).toEqual(payload('f.dpt', 'g.dpt', 'h.dpt'));
    });

    it('空の配列では何もしない', () => {
        const send = vi.fn().mockReturnValue(true);
        const q = new OpenFileQueue({ send });
        q.take();
        q.add([]);
        expect(send).not.toHaveBeenCalled();
        expect(q.take()).toEqual([]);
    });
});
