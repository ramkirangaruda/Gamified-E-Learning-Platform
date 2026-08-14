import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Builds into ../app — the drive layout (brief §7) expects the built bundle at the
// repo's app/, served by the Go binary's static file handler (internal/api + cmd/server).
// cards.html is a second, dev/print-only entry point (the card gallery, see
// src/CardGallery.tsx) — it ships in the same build but is not linked from the game UI.
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
