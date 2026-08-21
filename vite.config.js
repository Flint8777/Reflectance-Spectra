import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    // Electron で file:// から読み込むため、ビルド時は相対パスにする
    base: './',
});
