import {
    act,
    createEvent,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App.jsx';

// 状態管理を組み替える前の挙動を固定するための結合テスト。
// Plotly は setup.js でモックし、描画に渡された data を globalThis.__plotProps で読む。
const plotData = () => globalThis.__plotProps?.data ?? [];

const startReflectance = () => {
    render(<App />);
    fireEvent.click(screen.getByText('Reflectance Spectra'));
};

const upload = async (files) => {
    const input = document.getElementById('file-input');
    await act(async () => {
        fireEvent.change(input, { target: { files } });
    });
};

const dpt = (name, rows) =>
    new File([rows.map((r) => r.join(',')).join('\n')], name);

const csv = (name, header, rows) =>
    new File([[header, ...rows.map((r) => r.join(','))].join('\n')], name);

beforeEach(() => {
    globalThis.__plotProps = undefined;
});

afterEach(() => {
    globalThis.__plotProps = undefined;
});

describe('ファイル読み込み', () => {
    it('DPT は単位を聞かずに μm のまま 1 トレースとして描画される', async () => {
        startReflectance();
        await upload([
            dpt('a.dpt', [
                [1.0, 0.2],
                [1.5, 0.35],
                [2.0, 0.3],
            ]),
        ]);
        await waitFor(() => expect(plotData()).toHaveLength(1));
        expect(plotData()[0].x).toEqual([1.0, 1.5, 2.0]);
        expect(plotData()[0].y).toEqual([0.2, 0.35, 0.3]);
        expect(screen.queryByText('Select Wavelength Unit')).toBeNull();
    });

    it('CSV は単位ダイアログを経て、nm を選ぶと μm に換算される', async () => {
        startReflectance();
        await upload([
            csv('b.csv', 'Wavelength,Reflectance', [
                [1000, 0.1],
                [2000, 0.2],
            ]),
        ]);
        expect(screen.getByText('Select Wavelength Unit')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText(/nm/));
        await act(async () => {
            fireEvent.click(screen.getByText('Apply'));
        });
        await waitFor(() => expect(plotData()).toHaveLength(1));
        expect(plotData()[0].x).toEqual([1, 2]);
        expect(plotData()[0].y).toEqual([0.1, 0.2]);
    });

    it('内部の並びはファイル名の降順、色はファイル名の昇順に割り当てる', async () => {
        startReflectance();
        await upload([
            dpt('z.dpt', [
                [1, 0.5],
                [2, 0.6],
            ]),
            dpt('a.dpt', [
                [1, 0.1],
                [2, 0.2],
            ]),
        ]);
        await waitFor(() => expect(plotData()).toHaveLength(2));
        const [first, second] = plotData();
        expect(first.y).toEqual([0.5, 0.6]); // z.dpt
        expect(second.y).toEqual([0.1, 0.2]); // a.dpt
        expect(second.line.color).toBe('#1f77b4'); // palette[0]
        expect(first.line.color).toBe('#ff7f0e'); // palette[1]
    });
});

describe('凡例とアンロード', () => {
    const loadTwo = async () => {
        startReflectance();
        await upload([
            dpt('a.dpt', [
                [1, 0.1],
                [2, 0.2],
            ]),
            dpt('b.dpt', [
                [1, 0.3],
                [2, 0.4],
            ]),
        ]);
        await waitFor(() => expect(plotData()).toHaveLength(2));
    };

    // 凡例はファイル名の昇順（a, b）、内部の並びは降順（b, a）
    const rowCheckbox = (i) =>
        screen
            .getAllByTitle('Unload')
            [i].parentElement.querySelector('input[type="checkbox"]');
    const visibleFlags = () => plotData().map((t) => t.visible);

    it('チェックを外したトレースは visible: false になり、戻すと復帰する', async () => {
        await loadTwo();
        fireEvent.click(rowCheckbox(0)); // a.dpt
        await waitFor(() => expect(visibleFlags()).toEqual([true, false]));
        fireEvent.click(rowCheckbox(0));
        await waitFor(() => expect(visibleFlags()).toEqual([true, true]));
    });

    it('1 件だけアンロードし、Undo で元の位置に戻る', async () => {
        await loadTwo();
        const unloadButtons = screen.getAllByTitle('Unload');
        fireEvent.click(unloadButtons[0]); // a.dpt
        await waitFor(() => expect(plotData()).toHaveLength(1));
        expect(plotData()[0].y).toEqual([0.3, 0.4]);
        fireEvent.click(document.querySelector('.notice-action'));
        await waitFor(() => expect(plotData()).toHaveLength(2));
        expect(plotData()[0].y).toEqual([0.3, 0.4]); // b.dpt
        expect(plotData()[1].y).toEqual([0.1, 0.2]); // a.dpt（元の位置）
    });

    it('Unload All は確認後に全トレースを外す', async () => {
        await loadTwo();
        fireEvent.click(screen.getByTitle('Unload All'));
        fireEvent.click(document.querySelector('.confirm-dialog .danger-btn'));
        await waitFor(() => expect(plotData()).toHaveLength(0));
    });
});

describe('色とグループ', () => {
    const loadTwo = async () => {
        startReflectance();
        await upload([
            dpt('a.dpt', [
                [1, 0.1],
                [2, 0.2],
            ]),
            dpt('b.dpt', [
                [1, 0.3],
                [2, 0.4],
            ]),
        ]);
        await waitFor(() => expect(plotData()).toHaveLength(2));
    };
    const groupTab = (id) =>
        screen
            .getAllByTitle(/Drop a spectrum here/)
            .find((el) => el.textContent === id);
    // 凡例はファイル名の昇順（a, b）、内部の並びは降順（b, a）なので a.dpt は内部 index 1
    // jsdom の DragEvent は ctrlKey を初期化できないので、作ったイベントに直接載せる
    const dropOnGroup = (id, traceIdx, ctrlKey = false) => {
        const el = groupTab(id);
        const ev = createEvent.drop(el, {
            dataTransfer: { getData: () => String(traceIdx) },
        });
        Object.defineProperty(ev, 'ctrlKey', { value: ctrlKey });
        fireEvent(el, ev);
    };

    it('色見本のクリックでパレットの次の色に変わる', async () => {
        await loadTwo();
        const swatch = screen.getAllByTitle(
            'Click: next color · Double-click: custom color',
        )[0]; // a.dpt（palette[0]）
        fireEvent.click(swatch);
        await waitFor(() => expect(plotData()[1].line.color).toBe('#ff7f0e'));
        expect(plotData()[0].line.color).toBe('#ff7f0e'); // b.dpt は元のまま
    });

    it('別グループへドロップすると移動し、今のグループでは非表示になる', async () => {
        await loadTwo();
        dropOnGroup('2', 1);
        await waitFor(() =>
            expect(plotData().map((t) => t.visible)).toEqual([true, false]),
        );
        expect(plotData()).toHaveLength(2);
    });

    it('Ctrl を押しながらドロップするとコピーが末尾に増える', async () => {
        await loadTwo();
        dropOnGroup('2', 1, true);
        await waitFor(() => expect(plotData()).toHaveLength(3));
        expect(plotData()[2].y).toEqual([0.1, 0.2]);
        expect(plotData()[2].visible).toBe(false); // グループ 2 に入るので今は非表示
        expect(plotData()[1].visible).toBe(true); // 元はグループ 1 に残る
    });
});
