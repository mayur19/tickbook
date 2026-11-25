/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = `http://127.0.0.1:${process.env.API_PORT ?? '4106'}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5106),
    strictPort: true,
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/health': { target: API },
      '/ws': { target: API.replace('http', 'ws'), ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.tsx', 'test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/components/**', 'src/hooks/**', 'src/api/**'],
      thresholds: { lines: 75, functions: 70, branches: 70, statements: 75 },
    },
  },
});
