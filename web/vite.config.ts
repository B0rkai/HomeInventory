import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Our own service worker (src/sw.ts), so push handling can go in it later.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false, // registered in src/main.tsx
      // The dev build on the phone is installable and gets the service worker too.
      devOptions: { enabled: true, type: 'module' },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
      manifest: {
        name: 'Spájz',
        short_name: 'Spájz',
        description: 'Mi fogyott el otthon, és ki intézi.',
        lang: 'hu',
        start_url: '/',
        display: 'standalone',
        theme_color: '#2f6b4f',
        background_color: '#f4efe6',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    // Reachable from the server itself only, never on the network.
    host: '127.0.0.1',
    // The items' icon table is shared with the server (src/icons.ts).
    fs: { allow: ['.', '../server/src/homeinventory/seed'] },
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
