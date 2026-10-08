// トレース色のパレットとプリセットごとの軸ラベル

export const palette = [
    '#1f77b4',
    '#ff7f0e',
    '#2ca02c',
    '#d62728',
    '#9467bd',
    '#8c564b',
    '#e377c2',
    '#7f7f7f',
    '#bcbd22',
    '#17becf',
];

export const PRESET_LABELS = {
    'wavelength-reflectance': { x: 'Wavelength (μm)', y: 'Reflectance' },
    'spacing-intensity': { x: '2θ (°)', y: 'Intensity' },
    'time-temperature': { x: 'Time (s)', y: 'Temperature (°C)' },
};
