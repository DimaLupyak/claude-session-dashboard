import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    port: 3000,
    watch: {
      ignored: ['**/routeTree.gen.ts'],
    },
  },
  plugins: [
    tsConfigPaths(),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
  ],
  // Test config is in vitest.config.ts (separate from app config to avoid
  // tanstackStart/viteReact plugins interfering with React module resolution in tests)
})
