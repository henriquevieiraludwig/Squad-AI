import { uniqueSlug } from '../orgs.js';
// Cadastro, login, recuperação de senha, verificação de e-mail e convites.
import { db, json } from '../db.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  destroyUserSessions,
  requireAuth,
  rateLimit,
  resetRateLimit,
  sha256,
  newToken,
  ROLES,
} from '../auth.js';
import { mergeSettings } from '../brand.js';
import { enqueue } from '../jobs.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const HOUR = 3_600_000;

export async function createToken({ kind, partnerId, orgId = null, userId = null, email = null, role = null, data = {}, createdBy = null, ttlMs }) {
  const raw = newToken();
  await db.run(
    `INSERT INTO tokens (token_hash, kind, partner_id, org_id, user_id, email, role, data, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [sha256(raw), kind, partnerId, orgId, userId, email, role, json(data), createdBy, new Date(Date.now() + ttlMs)],
  );
  return raw;
}

async function findToken(raw, kind, partnerId) {
  const t = await db.get('SELECT * FROM tokens WHERE token_hash = $1 AND kind = $2', [sha256(String(raw || '')), kind]);
  if (!t || t.partner_id !== partnerId) return { error: 'Este link é inválido. Peça um novo.' };
  if (t.used_at) return { error: 'Este link já foi usado. Peça um novo, se precisar.' };
  if (new Date(t.expires_at) < new Date()) return { error: 'Este link expirou. Peça um novo.' };
  return { token: t };
}

export const sendTemplate = (partnerId, to, template, args = []) => enqueue('email', { partnerId, to, template, args });

async function sendVerification(user, partnerId) {
  const raw = await createToken({ kind: 'verificacao', partnerId, userId: user.id, email: user.email, ttlMs: 7 * 24 * HOUR });
  await sendTemplate(partnerId, user.email, 'verify', [raw]);
}

export function passwordProblem(password) {
  if (String(password || '').length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  return null;
}

export function registerAuthRoutes(app) {
  app.post('/api/auth/signup', async (req, res) => {
    const settings = mergeSettings(req.partner.settings);
    if (!settings.allowSignup) return res.status(403).json({ error: 'O cadastro é feito por convite. Fale com quem oferece a plataforma para você.' });
    if (!rateLimit({ key: `signup:${req.ip}`, max: 10, windowMs: HOUR })) return res.status(429).json({ error: 'Muitos cadastros seguidos. Tente mais tarde.' });

    const name = clean(req.body.name, 120);
    const company = clean(req.body.company, 120);
    const email = clean(req.body.email).toLowerCase();
    const password = String(req.body.password ?? '');
    const fields = {};
    if (!name) fields.name = 'Informe seu nome.';
    if (!company) fields.company = 'Informe o nome da empresa.';
    if (!EMAIL_RE.test(email)) fields.email = 'Use um e-mail válido, como voce@empresa.com.';
    const pw = passwordProblem(password);
    if (pw) fields.password = pw;
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Revise os campos destacados.', fields });

    if (await db.get('SELECT 1 FROM users WHERE partner_id = $1 AND email = $2', [req.partner.id, email])) {
      return res.status(409).json({ error: 'Já existe uma conta com este e-mail.', fields: { email: 'Este e-mail já tem conta. Entre com ele ou use outro.' } });
    }
    const passwordHash = await hashPassword(password);
    const user = await db.tx(async (t) => {
      const org = await t.get('INSERT INTO organizations (partner_id, name, slug) VALUES ($1, $2, $3) RETURNING id', [req.partner.id, company, await uniqueSlug(t, req.partner.id, company)]);
      return t.get(
        `INSERT INTO users (partner_id, org_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5, 'owner') RETURNING id, email`,
        [req.partner.id, org.id, name, email, passwordHash],
      );
    });
    await createSession(res, user.id);
    await sendVerification(user, req.partner.id);
    res.status(201).json({ ok: true });
  });

  app.post('/api/auth/login', async (req, res) => {
    const email = clean(req.body.email).toLowerCase();
    const password = String(req.body.password ?? '');
    const key = `login:${req.partner.id}:${req.ip}:${email}`;
    if (!rateLimit({ key, max: 8, windowMs: 15 * 60_000 })) return res.status(429).json({ error: 'Muitas tentativas seguidas. Aguarde 15 minutos e tente de novo.' });
    if (!email || !password) return res.status(400).json({ error: 'Informe e-mail e senha para entrar.' });

    const user = await db.get(
      'SELECT u.id, u.password_hash, o.slug AS org_slug FROM users u LEFT JOIN organizations o ON o.id = u.org_id WHERE u.partner_id = $1 AND u.email = $2',
      [req.partner.id, email],
    );
    const ok = user ? await verifyPassword(password, user.password_hash) : false;
    if (!ok) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    // Entrando pelo endereço de uma empresa, a conta precisa ser dessa empresa.
    const slug = clean(req.body.slug, 60);
    if (slug && user.org_slug !== slug) return res.status(403).json({ error: 'Esta conta não pertence a esta empresa. Use o endereço de acesso que você recebeu por e-mail.' });
    resetRateLimit(key);
    await createSession(res, user.id);
    res.json({ ok: true });
  });

  app.post('/api/auth/logout', async (req, res) => {
    await destroySession(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => res.json({ user: req.user }));

  // Formulário de contato do site da Zadok: grava e avisa os administradores da plataforma por e-mail.
  app.post('/api/contact', async (req, res) => {
    if (!rateLimit({ key: `contact:${req.ip}`, max: 5, windowMs: 60 * 60_000 })) return res.status(429).json({ error: 'Muitos envios seguidos. Tente de novo mais tarde.' });
    const name = clean(req.body.name, 120);
    const email = clean(req.body.email, 200).toLowerCase();
    const company = clean(req.body.company, 160);
    const message = clean(req.body.message, 2000);
    const interest = clean(req.body.interest, 60) || 'Zadok';
    if (!name || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Informe o seu nome e um e-mail válido.' });
    await db.run('INSERT INTO leads (name, email, company, message, interest) VALUES ($1, $2, $3, $4, $5)', [name, email, company, message, interest]);
    const platform = await db.get('SELECT id FROM partners WHERE is_default LIMIT 1');
    const admins = await db.all('SELECT email FROM users WHERE partner_id = $1 AND is_partner_admin', [platform.id]);
    const to = new Set([...admins.map((a) => a.email), ...(process.env.BOOTSTRAP_ADMIN_EMAIL ? [process.env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase()] : [])]);
    for (const addr of to) await sendTemplate(platform.id, addr, 'lead', [{ name, email, company, message, interest }]);
    res.status(201).json({ ok: true });
  });

  // Tela de login com o nome da empresa (endereço de acesso /acesso/<slug>).
  app.get('/api/access/:slug', async (req, res) => {
    const org = await db.get(`SELECT name, slug FROM organizations WHERE partner_id = $1 AND slug = $2 AND status = 'ativa'`, [req.partner.id, String(req.params.slug).toLowerCase()]);
    if (!org) return res.status(404).json({ error: 'Endereço de acesso não encontrado. Confira o link que você recebeu por e-mail.' });
    res.json({ org: { name: org.name, slug: org.slug } });
  });

  // ---------- Senha ----------

  app.post('/api/auth/forgot', async (req, res) => {
    const email = clean(req.body.email).toLowerCase();
    if (!rateLimit({ key: `forgot:${req.ip}`, max: 5, windowMs: HOUR })) return res.status(429).json({ error: 'Muitos pedidos seguidos. Tente mais tarde.' });
    const user = EMAIL_RE.test(email) && (await db.get('SELECT id, email FROM users WHERE partner_id = $1 AND email = $2', [req.partner.id, email]));
    if (user) {
      const raw = await createToken({ kind: 'senha', partnerId: req.partner.id, userId: user.id, email: user.email, ttlMs: HOUR });
      await sendTemplate(req.partner.id, user.email, 'reset', [raw]);
    }
    // Mesma resposta exista ou não a conta, para não revelar quem é cliente.
    res.json({ ok: true });
  });

  app.post('/api/auth/reset', async (req, res) => {
    const { token, error } = await findToken(req.body.token, 'senha', req.partner.id);
    if (error) return res.status(400).json({ error });
    const pw = passwordProblem(req.body.password);
    if (pw) return res.status(400).json({ error: pw, fields: { password: pw } });
    await db.run('UPDATE users SET password_hash = $1, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $2', [
      await hashPassword(req.body.password),
      token.user_id,
    ]);
    await db.run('UPDATE tokens SET used_at = now() WHERE id = $1', [token.id]);
    await destroyUserSessions(token.user_id);
    await createSession(res, token.user_id);
    res.json({ ok: true });
  });

  // ---------- Verificação de e-mail ----------

  app.post('/api/auth/verify', async (req, res) => {
    const { token, error } = await findToken(req.body.token, 'verificacao', req.partner.id);
    if (error) return res.status(400).json({ error });
    await db.run('UPDATE users SET email_verified_at = now() WHERE id = $1', [token.user_id]);
    await db.run('UPDATE tokens SET used_at = now() WHERE id = $1', [token.id]);
    res.json({ ok: true });
  });

  app.post('/api/auth/resend-verification', requireAuth, async (req, res) => {
    if (req.user.emailVerified) return res.json({ ok: true });
    if (!rateLimit({ key: `verify:${req.user.id}`, max: 3, windowMs: HOUR })) return res.status(429).json({ error: 'Já enviamos alguns e-mails. Confira a caixa de spam ou tente mais tarde.' });
    await sendVerification(req.user, req.partner.id);
    res.json({ ok: true });
  });

  // ---------- Convites ----------

  app.get('/api/invites/:token', async (req, res) => {
    const { token, error } = await findToken(req.params.token, 'convite', req.partner.id);
    if (error) return res.status(400).json({ error });
    const org = token.org_id ? await db.get('SELECT name FROM organizations WHERE id = $1', [token.org_id]) : null;
    const exists = await db.get('SELECT 1 FROM users WHERE partner_id = $1 AND email = $2', [req.partner.id, token.email]);
    res.json({
      email: token.email,
      orgName: org?.name || null,
      roleLabel: token.org_id ? ROLES[token.role] : 'Equipe do parceiro',
      partnerName: req.partner.name,
      name: token.data?.name || '',
      hasAccount: Boolean(exists),
    });
  });

  app.post('/api/invites/:token/accept', async (req, res) => {
    const { token, error } = await findToken(req.params.token, 'convite', req.partner.id);
    if (error) return res.status(400).json({ error });
    if (await db.get('SELECT 1 FROM users WHERE partner_id = $1 AND email = $2', [req.partner.id, token.email])) {
      return res.status(409).json({ error: 'Este e-mail já tem uma conta aqui. Entre com ela ou peça o convite para outro e-mail.' });
    }
    const name = clean(req.body.name, 120);
    const pw = passwordProblem(req.body.password);
    const fields = {};
    if (!name) fields.name = 'Informe seu nome.';
    if (pw) fields.password = pw;
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Revise os campos destacados.', fields });

    const isPartnerAdmin = !token.org_id;
    const user = await db.tx(async (t) => {
      const u = await t.get(
        `INSERT INTO users (partner_id, org_id, name, email, password_hash, role, is_partner_admin, email_verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now()) RETURNING id`,
        [req.partner.id, token.org_id, name, token.email, await hashPassword(req.body.password), isPartnerAdmin ? 'member' : token.role, isPartnerAdmin],
      );
      await t.run('UPDATE tokens SET used_at = now() WHERE id = $1', [token.id]);
      return u;
    });
    await createSession(res, user.id);
    res.status(201).json({ ok: true, partnerAdmin: isPartnerAdmin });
  });
}
