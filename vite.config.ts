import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Vite always adds crossorigin to the built HTML's script/link tags; there's
// no config option to turn it off. A file:// page's origin is "null", and
// browsers block crossorigin-marked requests from that origin, so opening
// dist/index.html directly would otherwise fail even with relative paths.
function stripCrossorigin(): Plugin {
  return {
    name: 'strip-crossorigin',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin(="[^"]*")?/g, '')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), stripCrossorigin()],
  // Vite only exposes VITE_-prefixed env vars to client code by default;
  // CURRENT_LEAGUE needs to be readable from src/lib/marketData.ts.
  envPrefix: ['VITE_', 'CURRENT_LEAGUE'],
  // Relative asset paths so dist/index.html can be opened directly via
  // file:// (root-absolute paths 404 outside of an HTTP server).
  base: './',
})
