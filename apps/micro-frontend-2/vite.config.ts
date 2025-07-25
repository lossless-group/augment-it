import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'cardB',
      exposes: {
        './Card': './src/components/CardB.tsx',
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
    port: 4174,
  },
  preview: {
    port: 4174,
  },
  optimizeDeps: {
    exclude: ['@module-federation-vite/ui'],
  },
  resolve: {
    preserveSymlinks: true, // important for monorepos
  },
})
