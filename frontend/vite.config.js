import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Development:  npm run dev   (talks to the backend on port 8000)
// Production:   npm run build (writes the finished site into backend/app/static)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8000' } },
  build: { outDir: '../backend/app/static', emptyOutDir: true },
})
