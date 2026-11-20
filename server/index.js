import express from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  loadUser,
  requireAuth,
  tooManyAttempts,
  registerFailure,
  clearFailures,
} from './auth.js';
import { registerIntegrationRoutes } from './routes-integrations.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AREAS = ['Atendimento', 'Vendas', 'Pessoas e RH', 'Operações', 'Financeiro', 'Jurídico', 'Outra'];

app.disable('x-powered-by');
// rawBody é usado para conferir a assinatura dos webhooks do WhatsApp.
app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(cookieParser());
app.use(loadUser);

const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);

// ---------- Autenticação ----------

app.post('/api/auth/signup', async (req, res) => {
  const name = clean(req.body.name, 120);
  const company = clean(req.body.company, 120);
  const email = clean(req.body.email, 200).toLowerCase();
  const password = String(req.body.password ?? '');

  const fields = {};
  if (!name) fields.name = 'Informe seu nome.';
  if (!company) fields.company = 'Informe o nome da empresa.';
  if (!EMAIL_RE.test(email)) fields.email = 'Use um e-mail válido, como voce@empresa.com.';
  if (password.length < 8) fields.password = 'A senha precisa ter pelo menos 8 caracteres.';
  if (Object.keys(fields).length) return res.status(400).json({ error: 'Revise os campos destacados.', fields });

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({
      error: 'Já existe uma conta com este e-mail.',
      fields: { email: 'Este e-mail já tem conta. Entre com ele ou use outro.' },
    });
  }

  const passwordHash = await hashPassword(password);
  db.exec('BEGIN');
  try {
    const org = db.prepare('INSERT INTO organizations (name) VALUES (?)').run(company);
    const user = db
      .prepare('INSERT INTO users (org_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
      .run(org.lastInsertRowid, name, email, passwordHash, 'admin');
    db.exec('COMMIT');
    createSession(res, user.lastInsertRowid);
    res.status(201).json({ ok: true });
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Não foi possível criar a conta agora. Tente de novo em instantes.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = clean(req.body.email, 200).toLowerCase();
  const password = String(req.body.password ?? '');
  const key = `${req.ip}|${email}`;

  if (tooManyAttempts(key)) {
    return res.status(429).json({ error: 'Muitas tentativas seguidas. Aguarde 15 minutos e tente de novo.' });
  }
  if (!email || !password) {
    return res.status(400).json({ error: 'Informe e-mail e senha para entrar.' });
  }

  const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
  const ok = user ? await verifyPassword(password, user.password_hash) : false;
  if (!ok) {
    registerFailure(key);
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }

  clearFailures(key);
  createSession(res, user.id);
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user });
});

// ---------- Agentes ----------

app.get('/api/agents', requireAuth, (req, res) => {
  const agents = db
    .prepare(
      `SELECT id, name, area, role_description AS roleDescription, status, created_at AS createdAt
         FROM agents WHERE org_id = ? ORDER BY created_at DESC, id DESC`,
    )
    .all(req.user.orgId);
  res.json({ agents, areas: AREAS });
});

app.post('/api/agents', requireAuth, (req, res) => {
  const name = clean(req.body.name, 80);
  const area = clean(req.body.area, 40);
  const roleDescription = clean(req.body.roleDescription, 600);

  const fields = {};
  if (!name) fields.name = 'Dê um nome ao agente.';
  if (!AREAS.includes(area)) fields.area = 'Escolha a área em que o agente vai atuar.';
  if (Object.keys(fields).length) return res.status(400).json({ error: 'Revise os campos destacados.', fields });

  const result = db
    .prepare('INSERT INTO agents (org_id, name, area, role_description, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.orgId, name, area, roleDescription, req.user.id);
  const agent = db
    .prepare(
      `SELECT id, name, area, role_description AS roleDescription, status, created_at AS createdAt
         FROM agents WHERE id = ?`,
    )
    .get(result.lastInsertRowid);
  res.status(201).json({ agent });
});

registerIntegrationRoutes(app);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// ---------- Front-end em produção ----------

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`Squad AI API ouvindo em http://localhost:${PORT}`));
