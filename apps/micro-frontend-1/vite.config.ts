import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'cardA',
      filename: 'remoteEntry.js',
      exposes: {
        './Card': './src/components/CardA.tsx',
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
    port: 4173,
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    fs: {
      allow: ['..']
    }
  },
  preview: {
    port: 4173,
  },
  optimizeDeps: {
    exclude: ['@module-federation-vite/ui'],
  },
  resolve: {
    preserveSymlinks: true, // important for monorepos
  },
})
