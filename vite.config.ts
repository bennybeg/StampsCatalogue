import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Марки',
        short_name: 'Марки',
        lang: 'ru',
        display: 'standalone',
        start_url: '.',
        background_color: '#f7f5f0',
        theme_color: '#1f5fbf',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // The recognition worker (~16 MB) and ONNX runtime wasm (~27 MB) must be precached for offline use.
        globPatterns: ['**/*.{js,css,html,wasm,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 40_000_000,
      },
    }),
  ],
  worker: { format: 'es' },
});
