import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const demo = process.env.VITE_DEMO === '1';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
  // A demonstração vira um único HTML, então tudo precisa caber num só arquivo JS.
  build: demo ? { assetsInlineLimit: 1_000_000, rollupOptions: { output: { inlineDynamicImports: true } } } : {},
});
