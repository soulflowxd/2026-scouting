import { defineConfig, loadEnv } from 'vite'
import { localTeamPhotos } from './scripts/local-team-photos'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), localTeamPhotos(loadEnv(mode, process.cwd(), '').VITE_CONVEX_URL)],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}))
