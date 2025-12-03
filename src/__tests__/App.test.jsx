import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../App.jsx'

describe('App', () => {
    it('renders application title', () => {
        render(<App />)
        // Expect some stable text from the app; adjust if needed
        const title = screen.getByText(/Reflectance/i)
        expect(title).toBeInTheDocument()
    })
})
