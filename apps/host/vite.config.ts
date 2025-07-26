import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'host',
      remotes: {
        promptManager: 'http://localhost:4175/assets/remoteEntry.js',
        recordCollector: 'http://localhost:4176/assets/remoteEntry.js',
        requestReviewer: 'http://localhost:4177/assets/remoteEntry.js',
      },
      shared: ['react', 'react-dom', 'zustand', 'lucide-react'],
      dev: {
        enabled: true,
      },
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