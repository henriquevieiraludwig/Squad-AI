import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const demo = process.env.VITE_DEMO === '1';

// Versão desta montagem (o Render informa o commit). O site compara com a do servidor para saber quando há atualização.
const appVersion = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'dev';

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
  // A demonstração vira um único HTML, então tudo precisa caber num só arquivo JS.
  build: demo ? { assetsInlineLimit: 1_000_000, rollupOptions: { output: { inlineDynamicImports: true } } } : {},
});
