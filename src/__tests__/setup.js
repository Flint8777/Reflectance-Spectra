import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Plotly to avoid Canvas/WebGL errors in jsdom
vi.mock('react-plotly.js', () => ({
  default: ({ data, layout, ...props }) => {
    return <div data-testid="plotly-mock" {...props} />
  }
}))

// Mock HTMLCanvasElement.getContext if needed
HTMLCanvasElement.prototype.getContext = vi.fn()

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-url')
