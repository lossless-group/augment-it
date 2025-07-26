import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        Button: resolve(__dirname, 'src/Button.tsx'),
        RecordCard: resolve(__dirname, 'src/RecordCard.tsx'),
        ErrorBoundary: resolve(__dirname, 'src/ErrorBoundary.tsx'),
      },
      name: 'ModuleFederationViteUI',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'mjs' : 'js'}`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'lucide-react', '@module-federation-vite/utils'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'lucide-react': 'lucide-react',
          '@module-federation-vite/utils': 'ModuleFederationViteUtils',
        },
      },
    },
  },
}) 