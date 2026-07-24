import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vite only exposes VITE_-prefixed env vars to client code by default;
  // CURRENT_LEAGUE needs to be readable from src/lib/marketData.ts.
  envPrefix: ['VITE_', 'CURRENT_LEAGUE'],
})
