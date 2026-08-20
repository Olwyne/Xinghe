import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Xinghe — 星河',
        short_name: 'Xinghe',
        description: 'Pomodoro timer with goals, habits, and rituals',
        theme_color: '#0B0D2A',
        background_color: '#0B0D2A',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    // Git worktrees live under .claude/worktrees/ and hold full copies of src,
    // so their test files would otherwise be collected alongside our own.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
