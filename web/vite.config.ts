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
        name: 'HomeInventory',
        short_name: 'Home',
        description: 'Supplies and small chores around the house',
        lang: 'en',
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
    // Only reachable through `tailscale serve` (HTTPS :8443), never on the network.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    allowedHosts: ['borkai-server.tail61796b.ts.net'],
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
