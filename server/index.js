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
import { createToken } from './routes/auth.js';
import { partnerBaseUrl } from './brand.js';

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
  // Mensagens com anexos (até 5 arquivos de 10 MB, em base64).
  app.use(/^\/api\/agents\/\d+\/chat$/, express.json({ limit: '70mb' }));
  app.use(express.json({ limit: '1mb', verify: keepRaw }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    try {
      await db.get('SELECT 1 AS ok');
      const has = (...names) => names.every((n) => Boolean(process.env[n]));
      res.json({
        ok: true,
        db: db.kind,
        version: VERSION,
        ai: has('ANTHROPIC_API_KEY'),
        email: has('RESEND_API_KEY'),
        // Apps OAuth da plataforma (só diz se existem; nunca mostra valores).
        google: has('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'),
        microsoft: has('MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'),
        slack: has('SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET'),
      });
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
  const platform = await ensureDefaultPartner();
  await bootstrapAdmin(platform);
  registerJobHandlers();
  await startWorker();
  const app = createApp();
  return app.listen(PORT, () => {
    console.log(`Squad AI ouvindo em http://localhost:${PORT} (banco: ${db.kind})`);
    if (!process.env.RESEND_API_KEY) console.warn('[aviso] RESEND_API_KEY não definida: e-mails (redefinir senha, convites, confirmação) só aparecem neste log e não são entregues.');
  });
}

// Hospedagens sem terminal (ex.: Render grátis): com BOOTSTRAP_ADMIN_EMAIL definido e nenhum
// administrador da plataforma ainda, cria um convite e mostra o link no log do servidor.
async function bootstrapAdmin(platform) {
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) return;
  const admin = await db.get('SELECT 1 FROM users WHERE partner_id = $1 AND is_partner_admin', [platform.id]);
  if (admin) return;
  const raw = await createToken({ kind: 'convite', partnerId: platform.id, email, role: 'partner_admin', ttlMs: 7 * 86_400_000 });
  console.log(`\n[primeiro acesso] Abra este link para criar o administrador da plataforma (${email}):\n${await partnerBaseUrl(platform)}/convite?token=${raw}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start().catch((err) => {
    console.error('Falha ao iniciar:', err);
    process.exit(1);
  });
}
