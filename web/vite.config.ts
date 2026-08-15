import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Builds into ../app — the drive layout (brief §7) expects the built bundle at the
// repo's app/, served by the Go binary's static file handler (internal/api + cmd/server).
// cards.html is a second, dev/print-only entry point (the card gallery, see
// src/CardGallery.tsx) — it ships in the same build but is not linked from the game UI.
// Dev-only: proxies /api to the Go server so `npm run dev` can hit real data instead of
// needing the frontend built into app/ and served by the Go binary just to test against
// it. Production doesn't need this -- app/ and the API are served from the same origin
// by cmd/server once built.
const DEV_API_PROXY_TARGET = "http://localhost:8099";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": DEV_API_PROXY_TARGET,
    },
  },
  build: {
    outDir: '../app',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        cards: resolve(import.meta.dirname, 'cards.html'),
      },
    },
  },
})
