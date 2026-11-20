import express from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, db } from './db.js';
import { loadUser } from './auth.js';
import { resolvePartner, ensureDefaultPartner } from './brand.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerOrgRoutes } from './routes/org.js';
import { registerIntegrationRoutes } from './routes/integrations.js';
import { registerPartnerRoutes } from './routes/partner.js';
import { registerJobHandlers } from './job-handlers.js';
import { startWorker } from './jobs.js';

const PORT = Number(process.env.PORT) || 3001;
const VERSION = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'dev';
let Sentry = null;

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Atrás de um proxy (Render, Railway, Fly), confia no cabeçalho de host e protocolo originais.
  if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  // Upload de documentos usa um limite maior; o resto, 1 MB. rawBody confere a assinatura do WhatsApp.
  const keepRaw = (req, _res, buf) => {
    req.rawBody = buf;
  };
  app.use('/api/knowledge', express.json({ limit: '15mb' }));
  app.use(express.json({ limit: '1mb', verify: keepRaw }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    try {
      await db.get('SELECT 1 AS ok');
      res.json({ ok: true, db: db.kind, version: VERSION });
    } catch (err) {
      res.status(503).json({ ok: false, error: err.message });
    }
  });

  app.use(resolvePartner);
  app.use(loadUser);

  registerPartnerRoutes(app);
  registerAuthRoutes(app);
  registerOrgRoutes(app);
  registerIntegrationRoutes(app);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
  }

  if (Sentry) Sentry.setupExpressErrorHandler(app);
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'O conteúdo enviado é grande demais.' });
    res.status(500).json({ error: 'Algo deu errado no servidor. Tente de novo em instantes.' });
  });
  return app;
}

export async function start() {
  if (process.env.SENTRY_DSN) {
    Sentry = await import('@sentry/node');
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'development', release: VERSION, tracesSampleRate: 0.1 });
  }
  await initDb();
  await ensureDefaultPartner();
  registerJobHandlers();
  await startWorker();
  const app = createApp();
  return app.listen(PORT, () => console.log(`Squad AI ouvindo em http://localhost:${PORT} (banco: ${db.kind})`));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start().catch((err) => {
    console.error('Falha ao iniciar:', err);
    process.exit(1);
  });
}
