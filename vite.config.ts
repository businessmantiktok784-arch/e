import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
