import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
const buildId = process.env.GITHUB_SHA || `local-${Date.now()}`;
export default defineConfig({
  define: { __APP_BUILD_ID__: JSON.stringify(buildId) },
  plugins: [react(), {
    name: 'distrihub-build-version',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'app-version.json', source: JSON.stringify({ buildId }) }); },
  }],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
