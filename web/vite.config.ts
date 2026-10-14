import { fileURLToPath } from 'node:url';
import { defineConfig, type Alias } from 'vite';
import react from '@vitejs/plugin-react';

/** Shared HTTP contract (type-only) from the server package. */
export const aliases: Alias[] = [
  { find: '@api', replacement: fileURLToPath(new URL('../server/src/api-types.ts', import.meta.url)) },
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: aliases,
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        // SSE (/api/live/stream): keep the connection open and unbuffered.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (String(proxyRes.headers['content-type'] ?? '').includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
