import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'host',
      remotes: {
        cardA: 'http://localhost:4173/assets/remoteEntry.js',
        cardB: 'http://localhost:4174/assets/remoteEntry.js',
      },
      shared: ['react', 'react-dom'],
    }),
  ],
  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
  server: {
    port: 3000,
    fs: {
      allow: ['..']
    }
  },
  preview: {
    port: 3000,
  },
  optimizeDeps: {
    exclude: ['@module-federation-vite/ui'],
  },
  resolve: {
    preserveSymlinks: true,
  },
}) 