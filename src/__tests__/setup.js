import '@testing-library/jest-dom'
import { vi } from 'vitest'
import React from 'react'

// Mock Plotly to avoid Canvas/WebGL errors in jsdom
// App.jsx は factory pattern を使うので react-plotly.js/factory を差し替える
vi.mock('react-plotly.js/factory', () => ({
    default: () => ({ data, layout, ...props }) => {
        return React.createElement('div', { 'data-testid': 'plotly-mock', ...props })
    }
}))
vi.mock('plotly.js-dist-min', () => ({ default: {} }))

// Mock HTMLCanvasElement.getContext if needed
HTMLCanvasElement.prototype.getContext = vi.fn()

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-url')
