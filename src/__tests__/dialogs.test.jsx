import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NormalizationDialog } from '../components/dialogs.jsx';

const renderDialog = (xLabel) =>
    render(
        <NormalizationDialog
            mode="wavelength"
            wavelength={2}
            maxScope="view"
            xLabel={xLabel}
            onApply={() => {}}
            onCancel={() => {}}
        />,
    );

describe('NormalizationDialog の単位の表示', () => {
    it('軸ラベルの括弧の中を単位として出す', () => {
        renderDialog('Wavelength (μm)');
        expect(screen.getByText('μm')).toBeTruthy();
    });

    it('閉じ括弧の無い「(」の連続でも固まらない', () => {
        // CSV のヘッダーがそのまま軸ラベルになるので、細工した値で正規表現が 2 乗の時間かかっていた
        const label = '('.repeat(120000);
        const t0 = performance.now();
        renderDialog(label);
        expect(performance.now() - t0).toBeLessThan(500);
    });
});
