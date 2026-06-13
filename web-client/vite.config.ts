import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // Manual registration via sw_register wrapper
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/ws/,
          /^\/video/,
          /^\/whep/,
          /^\/auth/,
          /^\/perf/,
          /^\/mediamtx-api/,
        ],
        runtimeCaching: [
          {
            urlPattern: /^\/assets\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-assets',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 31536000, // 1 year; hashed so immutable
              },
            },
          },
        ],
      },
      manifest: false, // No PWA install manifest needed for app-shell precache
    }),
  ],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
