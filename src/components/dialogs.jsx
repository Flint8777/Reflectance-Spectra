// App から使うダイアログ・通知バナー

import React, { useState } from 'react';
import { PRESET_LABELS } from '../constants.js';
import {
    AutoDetectIcon,
    ReflectanceSpectrumIcon,
    ThermometerIcon,
    XRDIcon,
} from './icons.jsx';

export function NoticeBanner({ notice, onClose }) {
    if (!notice) return null;
    return (
        <div className={`notice-banner notice-${notice.type}`}>
            <span className="notice-message">{notice.message}</span>
            {notice.actionLabel && notice.actionFn && (
                <button
                    type="button"
                    className="notice-action"
                    onClick={notice.actionFn}
                >
                    {notice.actionLabel}
                </button>
            )}
            <button
                type="button"
                className="notice-close"
                onClick={onClose}
                title="Dismiss"
            >
                ×
            </button>
        </div>
    );
}

export function ConfirmDialog({
    title,
    body,
    confirmLabel,
    cancelLabel,
    danger,
    onConfirm,
    onCancel,
}) {
    React.useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onConfirm, onCancel]);

    return (
        <div className="dialog-overlay">
            <div className="dialog-box confirm-dialog">
                <h3>{title}</h3>
                <p className="confirm-body">{body}</p>
                <div className="dialog-actions">
                    <button
                        type="button"
                        className="cancel-btn"
                        onClick={onCancel}
                    >
                        {cancelLabel || 'Cancel'}
                    </button>
                    <button
                        type="button"
                        className={danger ? 'danger-btn' : 'apply-btn'}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function NormalizationDialog({
    mode,
    wavelength,
    maxScope,
    xLabel,
    onApply,
    onCancel,
}) {
    const [selectedMode, setSelectedMode] = useState(mode || 'none');
    const [wlInput, setWlInput] = useState(String(wavelength ?? 2.0));
    const [selectedMaxScope, setSelectedMaxScope] = useState(
        maxScope || 'view',
    );
    const [error, setError] = useState('');

    const unitHint = (() => {
        const m = String(xLabel || '').match(/\(([^)]+)\)/);
        return m ? m[1] : '';
    })();

    const apply = () => {
        if (selectedMode === 'wavelength') {
            const wl = parseFloat(wlInput);
            if (!Number.isFinite(wl) || wl <= 0) {
                setError('Please enter a positive number');
                return;
            }
            onApply({ mode: 'wavelength', wavelength: wl });
            return;
        }
        if (selectedMode === 'max') {
            onApply({ mode: 'max', maxScope: selectedMaxScope });
            return;
        }
        if (selectedMode === 'minmax') {
            onApply({ mode: 'minmax', maxScope: selectedMaxScope });
            return;
        }
        onApply({ mode: 'none' });
    };

    return (
        <div className="dialog-overlay">
            <div className="dialog-box">
                <h3>Normalize spectra</h3>
                <p>
                    Apply the same normalization to all spectra in the current
                    view.
                </p>
                <div className="norm-options">
                    <label className="norm-option">
                        <input
                            type="radio"
                            name="norm-mode"
                            checked={selectedMode === 'none'}
                            onChange={() => {
                                setSelectedMode('none');
                                setError('');
                            }}
                        />
                        <span>No normalization</span>
                    </label>
                    <label className="norm-option">
                        <input
                            type="radio"
                            name="norm-mode"
                            checked={selectedMode === 'wavelength'}
                            onChange={() => {
                                setSelectedMode('wavelength');
                                setError('');
                            }}
                        />
                        <span>Normalize at x =</span>
                        <input
                            type="number"
                            step="any"
                            value={wlInput}
                            onChange={(e) => {
                                setWlInput(e.target.value);
                                setSelectedMode('wavelength');
                                setError('');
                            }}
                            onFocus={() => setSelectedMode('wavelength')}
                            style={{
                                width: 90,
                                marginLeft: 8,
                                padding: '4px 6px',
                            }}
                        />
                        {unitHint && (
                            <span style={{ marginLeft: 4, color: '#666' }}>
                                {unitHint}
                            </span>
                        )}
                    </label>
                    <label className="norm-option">
                        <input
                            type="radio"
                            name="norm-mode"
                            checked={selectedMode === 'max'}
                            onChange={() => {
                                setSelectedMode('max');
                                setError('');
                            }}
                        />
                        <span>Normalize by max (y / max)</span>
                    </label>
                    <label className="norm-option">
                        <input
                            type="radio"
                            name="norm-mode"
                            checked={selectedMode === 'minmax'}
                            onChange={() => {
                                setSelectedMode('minmax');
                                setError('');
                            }}
                        />
                        <span>Min-Max normalize (min→0, max→1)</span>
                    </label>
                    {(selectedMode === 'max' || selectedMode === 'minmax') && (
                        <div className="norm-suboptions">
                            <div className="norm-suboptions-title">
                                Reference range
                            </div>
                            <label>
                                <input
                                    type="radio"
                                    name="norm-max-scope"
                                    checked={selectedMaxScope === 'view'}
                                    onChange={() => setSelectedMaxScope('view')}
                                />
                                <span>
                                    Use{' '}
                                    {selectedMode === 'minmax'
                                        ? 'min/max'
                                        : 'max'}{' '}
                                    in view
                                </span>
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    name="norm-max-scope"
                                    checked={selectedMaxScope === 'all'}
                                    onChange={() => setSelectedMaxScope('all')}
                                />
                                <span>
                                    Use{' '}
                                    {selectedMode === 'minmax'
                                        ? 'min/max'
                                        : 'max'}{' '}
                                    in full range
                                </span>
                            </label>
                        </div>
                    )}
                </div>
                {error && (
                    <div style={{ color: '#c00', fontSize: 13, marginTop: 8 }}>
                        {error}
                    </div>
                )}
                <div className="dialog-actions">
                    <button
                        type="button"
                        className="cancel-btn"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button type="button" className="apply-btn" onClick={apply}>
                        Apply
                    </button>
                </div>
            </div>
        </div>
    );
}

export function ExportDialog({ onExport, onClose }) {
    const [format, setFormat] = useState('svg');
    const [scale, setScale] = useState(4);
    const [busy, setBusy] = useState(false);
    return (
        <div className="dialog-overlay">
            <div className="dialog-box">
                <h3>Export figure</h3>
                <p>
                    Save the plot as a figure file. The current display range is
                    kept, and a legend is placed clear of the spectra.
                </p>
                <div className="norm-options">
                    <label className="norm-option">
                        <input
                            type="radio"
                            name="export-format"
                            checked={format === 'svg'}
                            onChange={() => setFormat('svg')}
                        />
                        <span>SVG (vector, for publication)</span>
                    </label>
                    <label className="norm-option">
                        <input
                            type="radio"
                            name="export-format"
                            checked={format === 'png'}
                            onChange={() => setFormat('png')}
                        />
                        <span>PNG (raster)</span>
                    </label>
                    {format === 'png' && (
                        <div className="norm-suboptions">
                            <div className="norm-suboptions-title">
                                Resolution
                            </div>
                            <label className="norm-option">
                                <input
                                    type="radio"
                                    name="export-scale"
                                    checked={scale === 2}
                                    onChange={() => setScale(2)}
                                />
                                <span>2x screen size</span>
                            </label>
                            <label className="norm-option">
                                <input
                                    type="radio"
                                    name="export-scale"
                                    checked={scale === 4}
                                    onChange={() => setScale(4)}
                                />
                                <span>4x screen size (print quality)</span>
                            </label>
                        </div>
                    )}
                </div>
                <div className="dialog-actions">
                    <button
                        type="button"
                        className="cancel-btn"
                        onClick={onClose}
                        disabled={busy}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="apply-btn"
                        disabled={busy}
                        onClick={async () => {
                            setBusy(true);
                            await onExport(
                                format,
                                format === 'png' ? scale : 1,
                            );
                            setBusy(false);
                            onClose();
                        }}
                    >
                        {busy ? 'Exporting...' : 'Export'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function StackDialog({ gap, onGapChange, onDisable, onClose }) {
    return (
        <div className="dialog-overlay">
            <div className="dialog-box">
                <h3>Stack display</h3>
                <p>
                    Scale each spectrum to the same height and stack them
                    vertically.
                </p>
                <div className="norm-options">
                    <div className="norm-suboptions">
                        <label
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'stretch',
                                gap: 6,
                            }}
                        >
                            <span>Gap between spectra</span>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                }}
                            >
                                <span style={{ fontSize: 12, color: '#666' }}>
                                    Tight
                                </span>
                                <input
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.05"
                                    value={gap}
                                    onChange={(e) =>
                                        onGapChange(parseFloat(e.target.value))
                                    }
                                    style={{ flex: 1 }}
                                />
                                <span style={{ fontSize: 12, color: '#666' }}>
                                    Wide
                                </span>
                            </div>
                        </label>
                    </div>
                </div>
                <div className="dialog-actions">
                    <button
                        type="button"
                        className="danger-btn"
                        onClick={onDisable}
                    >
                        Disable
                    </button>
                    <button
                        type="button"
                        className="apply-btn"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

// IPC 越しの例外は "Error invoking remote method 'x': Error: 本文" になるので、
// 利用者に見せる前に内部の前置きを剥がす。
export function cleanIpcErrorMessage(err) {
    const raw = err?.message ?? String(err ?? '');
    return raw
        .replace(/^Error invoking remote method '[^']*':\s*/, '')
        .replace(/^(Error|TypeError):\s*/, '')
        .trim();
}

export function UpdateDialog({
    status,
    info,
    progress,
    errorMessage,
    platform,
    onDownload,
    onOpenBrowser,
    onQuit,
    onClose,
}) {
    const isMac = platform === 'darwin';
    return (
        <div className="dialog-overlay">
            <div className="dialog-box">
                <h3>Check for updates</h3>
                {status === 'checking' && <p>Checking...</p>}
                {status === 'available' && (
                    <>
                        <p>
                            {isMac
                                ? 'A new version is available. The DMG is saved to Downloads and opened in Finder; drag the app to Applications to replace the old one.'
                                : info?.installKind === 'portable'
                                  ? 'A new version is available. It installs as a regular app, and this portable copy is removed.'
                                  : 'A new version is available.'}
                        </p>
                        <p style={{ fontSize: 13, color: '#555' }}>
                            Current: v{info.currentVersion} &rarr; Latest: v
                            {info.latestVersion}
                        </p>
                        <div className="dialog-actions">
                            <button
                                type="button"
                                className="cancel-btn"
                                onClick={onClose}
                            >
                                Later
                            </button>
                            {platform === 'win32' ? (
                                <button
                                    type="button"
                                    className="apply-btn"
                                    onClick={onDownload}
                                >
                                    {info?.installKind === 'portable'
                                        ? 'Download installer'
                                        : 'Download & apply'}
                                </button>
                            ) : isMac ? (
                                <button
                                    type="button"
                                    className="apply-btn"
                                    onClick={onDownload}
                                >
                                    Download DMG
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="apply-btn"
                                    onClick={onOpenBrowser}
                                >
                                    Open release page
                                </button>
                            )}
                        </div>
                    </>
                )}
                {status === 'downloading' && (
                    <>
                        <p>Downloading... {progress?.percent ?? 0}%</p>
                        <div
                            style={{
                                width: '100%',
                                background: '#eee',
                                borderRadius: 4,
                                height: 8,
                                overflow: 'hidden',
                            }}
                        >
                            <div
                                style={{
                                    width: `${progress?.percent ?? 0}%`,
                                    background: '#4a9eff',
                                    height: '100%',
                                    borderRadius: 4,
                                    transition: 'width 0.2s',
                                }}
                            />
                        </div>
                        <p
                            style={{
                                fontSize: 12,
                                color: '#777',
                                marginTop: 8,
                            }}
                        >
                            {isMac
                                ? 'The DMG opens in Finder when the download completes.'
                                : 'The app will restart after download completes.'}
                        </p>
                    </>
                )}
                {status === 'downloaded' && (
                    <>
                        <p>Opened {info?.dmgPath} in Finder.</p>
                        <p style={{ fontSize: 13, color: '#555' }}>
                            Drag Reflectance Spectra Viewer to the Applications
                            folder and choose Replace, then launch it again.
                            Quit this app first so the replacement is not in
                            use.
                        </p>
                        <div className="dialog-actions">
                            <button
                                type="button"
                                className="cancel-btn"
                                onClick={onClose}
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                className="apply-btn"
                                onClick={onQuit}
                            >
                                Quit
                            </button>
                        </div>
                    </>
                )}
                {status === 'no-update' && (
                    <>
                        <p>
                            You have the latest version. (v
                            {info?.currentVersion})
                        </p>
                        {platform === 'win32' &&
                            info?.installKind === 'portable' && (
                                <p style={{ fontSize: 13, color: '#555' }}>
                                    This is the portable copy. Switching to the
                                    installer keeps the app updating itself and
                                    adds a Start menu entry.
                                </p>
                            )}
                        <div className="dialog-actions">
                            <button
                                type="button"
                                className="cancel-btn"
                                onClick={onClose}
                            >
                                Close
                            </button>
                            {platform === 'win32' &&
                                info?.installKind === 'portable' && (
                                    <button
                                        type="button"
                                        className="apply-btn"
                                        onClick={onDownload}
                                    >
                                        Switch to installer
                                    </button>
                                )}
                        </div>
                    </>
                )}
                {status === 'error' && (
                    <>
                        <p style={{ color: '#c00' }}>
                            {errorMessage
                                ? `Update failed: ${errorMessage}`
                                : 'An error occurred while checking.'}
                        </p>
                        <div className="dialog-actions">
                            <button
                                type="button"
                                className="cancel-btn"
                                onClick={onClose}
                            >
                                Close
                            </button>
                            {info?.releaseUrl && (
                                <button
                                    type="button"
                                    className="apply-btn"
                                    onClick={onOpenBrowser}
                                >
                                    Open release page
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export function HeaderSelectDialog({ candidates, onSelect, onCancel }) {
    return (
        <div className="dialog-overlay">
            <div className="dialog-box">
                <h3>Select Axis Labels</h3>
                <p>Different headers were detected. Choose the pair to use.</p>
                <div className="header-candidates">
                    {candidates.map((h) => (
                        <button
                            type="button"
                            key={`${h.xLabel} ${h.yLabel}`}
                            className="header-candidate-btn"
                            onClick={() => onSelect(h)}
                        >
                            X: {h.xLabel} / Y: {h.yLabel}
                        </button>
                    ))}
                </div>
                <button type="button" className="cancel-btn" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

export function LabelSettingDialog({
    currentX,
    currentY,
    onApplyPreset,
    onApplyCustom,
    onCancel,
}) {
    const [customX, setCustomX] = useState(currentX);
    const [customY, setCustomY] = useState(currentY);
    const [selectedPreset, setSelectedPreset] = useState('');
    const PRESET_ICONS = {
        'wavelength-reflectance': {
            icon: <ReflectanceSpectrumIcon />,
            label: 'Reflectance Spectra',
        },
        'spacing-intensity': { icon: <XRDIcon />, label: 'XRD Pattern' },
        'time-temperature': {
            icon: <ThermometerIcon />,
            label: 'Temperature Profile',
        },
    };
    const presets = Object.fromEntries(
        Object.entries(PRESET_LABELS).map(([k, v]) => [
            k,
            { ...v, ...PRESET_ICONS[k] },
        ]),
    );
    const handleSelectPreset = (p) => {
        setSelectedPreset(p);
        if (PRESET_LABELS[p]) {
            setCustomX(PRESET_LABELS[p].x);
            setCustomY(PRESET_LABELS[p].y);
        }
    };
    const apply = () => {
        if (selectedPreset) {
            onApplyPreset(selectedPreset);
            return;
        }
        if (customX.trim() || customY.trim()) onApplyCustom(customX, customY);
    };
    return (
        <div className="dialog-overlay">
            <div className="dialog-box">
                <h3>Axis Labels</h3>
                <div
                    className="datatype-icon-buttons"
                    style={{ marginBottom: 12 }}
                >
                    {Object.entries(presets).map(([key, info]) => (
                        <button
                            type="button"
                            key={key}
                            className={
                                'datatype-icon-btn' +
                                (selectedPreset === key ? ' selected' : '')
                            }
                            onClick={() => handleSelectPreset(key)}
                            title={info.label}
                        >
                            {info.icon}
                            <span>{info.label}</span>
                        </button>
                    ))}
                </div>
                <div className="custom-section">
                    <h4 style={{ marginTop: 0 }}>Custom Labels</h4>
                    <div className="input-group">
                        <label htmlFor="custom-x-label">X label:</label>
                        <input
                            id="custom-x-label"
                            value={customX}
                            onChange={(e) => {
                                setCustomX(e.target.value);
                                setSelectedPreset('');
                            }}
                            placeholder="e.g., Wavelength (μm)"
                        />
                    </div>
                    <div className="input-group">
                        <label htmlFor="custom-y-label">Y label:</label>
                        <input
                            id="custom-y-label"
                            value={customY}
                            onChange={(e) => {
                                setCustomY(e.target.value);
                                setSelectedPreset('');
                            }}
                            placeholder="e.g., Reflectance"
                        />
                    </div>
                </div>
                <div className="dialog-actions">
                    <button
                        type="button"
                        className="cancel-btn"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button type="button" className="apply-btn" onClick={apply}>
                        Apply
                    </button>
                </div>
            </div>
        </div>
    );
}

export function InitialPresetDialog({ onSelect }) {
    return (
        <div className="dialog-overlay">
            <div className="dialog-box">
                <h3>Data Type</h3>
                <div className="datatype-icon-buttons">
                    <button
                        type="button"
                        className="datatype-icon-btn"
                        onClick={() => onSelect('wavelength-reflectance')}
                        title="OPUS binary, DPT (OPUS), TAB (RELAB), CSV, TXT"
                    >
                        <ReflectanceSpectrumIcon />
                        <span>Reflectance Spectra</span>
                        <span className="datatype-subtitle">
                            .0 .opus .dpt .tab .csv .txt
                        </span>
                    </button>
                    <button
                        type="button"
                        className="datatype-icon-btn"
                        onClick={() => onSelect('spacing-intensity')}
                        title="CSV, ASC"
                    >
                        <XRDIcon />
                        <span>XRD Pattern</span>
                        <span className="datatype-subtitle">.csv .asc</span>
                    </button>
                    <button
                        type="button"
                        className="datatype-icon-btn"
                        onClick={() => onSelect('time-temperature')}
                        title="TXT (InfraWin)"
                    >
                        <ThermometerIcon />
                        <span>Temperature Profile</span>
                        <span className="datatype-subtitle">
                            .txt (InfraWin)
                        </span>
                    </button>
                    <button
                        type="button"
                        className="datatype-icon-btn"
                        onClick={() => onSelect('auto')}
                        title={
                            'Auto: use CSV header row as axis labels.\nLabels stay flexible and adapt to each file.\nSupports: TAB, CSV, TXT'
                        }
                    >
                        <AutoDetectIcon />
                        <span>Auto</span>
                        <span className="datatype-subtitle">
                            labels from header
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}

export function BulkUnitDialog({
    files,
    selections,
    onChangeSelection,
    onApply,
}) {
    return (
        <div className="dialog-overlay">
            <div className="dialog-box unit-dialog">
                <h3 style={{ marginTop: 0 }}>Select Wavelength Unit</h3>
                <div className="unit-dialog-desc">
                    Set wavelength unit for each file. If <strong>nm</strong> is
                    selected, values are converted to <strong>μm</strong> for
                    plotting.
                </div>
                <div
                    style={{
                        maxHeight: 320,
                        overflowY: 'auto',
                        marginBottom: 12,
                    }}
                >
                    {files.map((f, i) => (
                        <div
                            key={`${f.name}-${f.size}-${f.lastModified}`}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '8px 10px',
                                border: '1px solid #eee',
                                borderRadius: 6,
                                marginBottom: 8,
                            }}
                        >
                            <div
                                style={{
                                    flex: 1,
                                    fontSize: 13,
                                    wordBreak: 'break-all',
                                }}
                            >
                                {f.name}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <label
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '6px 8px',
                                        border: '1px solid #ddd',
                                        borderRadius: 6,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name={`unit-${i}`}
                                        checked={selections[i] === 'nm'}
                                        onChange={() =>
                                            onChangeSelection(i, 'nm')
                                        }
                                    />{' '}
                                    nm
                                </label>
                                <label
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '6px 8px',
                                        border: '1px solid #ddd',
                                        borderRadius: 6,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name={`unit-${i}`}
                                        checked={selections[i] === 'um'}
                                        onChange={() =>
                                            onChangeSelection(i, 'um')
                                        }
                                    />{' '}
                                    μm
                                </label>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="dialog-actions">
                    <button
                        type="button"
                        className="apply-btn"
                        onClick={onApply}
                    >
                        Apply
                    </button>
                </div>
            </div>
        </div>
    );
}
