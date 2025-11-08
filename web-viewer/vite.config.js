import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    // Electron で file:// から読み込むため、ビルド時は相対パスにする
    base: './',
})
