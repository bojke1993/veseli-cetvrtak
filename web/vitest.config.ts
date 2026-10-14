import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { aliases } from './vite.config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: aliases, dedupe: ['react', 'react-dom'] },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
