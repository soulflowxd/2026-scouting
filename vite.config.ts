import { defineConfig, loadEnv } from 'vite'
import { localTeamPhotos } from './scripts/local-team-photos'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const convexUrl = loadEnv(mode, process.cwd(), 'VITE_CONVEX_URL').VITE_CONVEX_URL
  return {
    // Only this public endpoint belongs in the browser. Never expose API keys,
    // deployment tokens, or other VITE_* variables automatically.
    envPrefix: [],
    define: {
      'import.meta.env.VITE_CONVEX_URL': JSON.stringify(convexUrl ?? ''),
    },
    plugins: [react(), tailwindcss(), localTeamPhotos(convexUrl)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
