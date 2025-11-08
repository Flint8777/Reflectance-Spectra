import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
<<<<<<< HEAD
    // Electron で file:// から読み込むため、ビルド時は相対パスにする
    base: './',
=======
>>>>>>> 5e3a7baa90a390d440caec597def580a9af35aa7
})
