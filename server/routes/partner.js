// Console do parceiro (white label) e console da plataforma (Matriz AI).
import { db, json } from '../db.js';
import { ROLES } from '../auth.js';
import { mergeBrand, mergeSettings, publicBrand, invalidatePartnerCache, partnerOAuth, encryptOAuth, DEFAULT_LIMITS } from '../brand.js';
import { usageSummary } from '../usage.js';
import { createToken, sendTemplate } from './auth.js';
import { h } from './org.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|localhost)$/;
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const URL_RE = /^https:\/\/\S+$/;
const DAY = 86_400_000;
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);

// Parceiro alvo: "me" (o do usuário) ou um id (só a plataforma acessa outros parceiros).
async function targetPartner(req, res) {
  if (!req.user) {
    res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' });
    return null;
  }
  if (!req.user.isPartnerAdmin) {
    res.status(403).json({ error: 'Esta área é da equipe do parceiro.' });
    return null;
  }
  const pid = req.params.pid === 'me' ? req.user.partnerId : Number(req.params.pid);
  if (pid !== req.user.partnerId && !req.user.isPlatformAdmin) {
    res.status(403).json({ error: 'Você não tem acesso a este parceiro.' });
    return null;
  }
  const p = await db.get('SELECT * FROM partners WHERE id = $1', [pid]);
  if (!p) res.status(404).json({ error: 'Parceiro não encontrado.' });
  return p;
}

function requirePlatform(req, res, next) {
  if (!req.user?.isPlatformAdmin) return res.status(403).json({ error: 'Esta área é da equipe da plataforma.' });
  next();
}

function cleanLimits(input = {}) {
  const out = {};
  for (const k of Object.keys(DEFAULT_LIMITS)) {
    if (input[k] === undefined || input[k] === '' || input[k] === null) continue;
    const n = Math.floor(Number(input[k]));
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000) throw Object.assign(new Error(`Limite inválido: ${k}.`), { status: 400 });
    out[k] = n;
  }
  return out;
}

async function partnerView(p) {
  const domains = await db.all('SELECT domain, created_at FROM partner_domains WHERE partner_id = $1 ORDER BY created_at', [p.id]);
  const oauth = partnerOAuth(p);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    status: p.status,
    isPlatform: p.is_default,
    brand: mergeBrand(p.brand),
    settings: mergeSettings(p.settings),
    domains: domains.map((d) => d.domain),
    // Nunca devolve segredos: só se cada app próprio está configurado.
    oauth: Object.fromEntries(
      ['microsoft', 'google', 'slack'].map((k) => [k, { configured: Boolean(oauth[k]?.clientId), clientId: oauth[k]?.clientId || '', tenant: oauth[k]?.tenant || '', restricted: Boolean(oauth[k]?.restricted) }]),
    ),
    platformHost: (process.env.PUBLIC_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
  };
}

async function addDomain(partnerId, domain) {
  const d = clean(domain, 253).toLowerCase();
  if (!DOMAIN_RE.test(d)) throw Object.assign(new Error('Domínio inválido. Use algo como app.suaempresa.com.br.'), { status: 400 });
  const taken = await db.get('SELECT partner_id FROM partner_domains WHERE domain = $1', [d]);
  if (taken && taken.partner_id !== partnerId) throw Object.assign(new Error('Este domínio já está em uso por outro parceiro.'), { status: 409 });
  await db.run('INSERT INTO partner_domains (domain, partner_id) VALUES ($1, $2) ON CONFLICT (domain) DO NOTHING', [d, partnerId]);
  invalidatePartnerCache();
  return d;
}

const wrap = (fn) =>
  h(async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  });

export function registerPartnerRoutes(app) {
  app.get('/api/brand', (req, res) => res.json({ brand: publicBrand(req.partner) }));

  app.get('/api/partner/:pid', wrap(async (req, res) => {
    const p = await targetPartner(req, res);
    if (p) res.json({ partner: await partnerView(p) });
  }));

  // Marca e regras do parceiro.
  app.put('/api/partner/:pid/brand', wrap(async (req, res) => {
    const p = await targetPartner(req, res);
    if (!p) return;
    const b = req.body || {};
    const brand = mergeBrand(p.brand);
    const settings = mergeSettings(p.settings);
    const name = b.name !== undefined ? clean(b.name, 60) : p.name;
    if (!name) return res.status(400).json({ error: 'Informe o nome da marca.', fields: { name: 'Obrigatório.' } });

    if (b.colors) {
      for (const k of ['action', 'dark', 'accent']) {
        if (b.colors[k] !== undefined) {
          if (!HEX_RE.test(b.colors[k])) return res.status(400).json({ error: 'Use cores no formato #RRGGBB.', fields: { [`color_${k}`]: 'Formato #RRGGBB.' } });
          brand.colors[k] = b.colors[k];
        }
      }
    }
    if (b.logo !== undefined) {
      if (b.logo === null || b.logo === '') brand.logo = null;
      else {
        if (!/^data:image\/(png|svg\+xml|webp|jpeg);base64,/.test(b.logo)) return res.status(400).json({ error: 'Envie o logotipo em PNG, SVG, WebP ou JPG.' });
        if (b.logo.length > 300_000) return res.status(400).json({ error: 'O logotipo precisa ter menos de 200 KB.' });
        brand.logo = b.logo;
      }
    }
    for (const k of ['termsUrl', 'privacyUrl']) {
      if (b[k] !== undefined) {
        const v = clean(b[k], 500);
        if (v && !URL_RE.test(v)) return res.status(400).json({ error: 'Os links precisam começar com https://', fields: { [k]: 'Use https://' } });
        brand[k] = v;
      }
    }
    for (const k of ['supportEmail', 'senderEmail']) {
      if (b[k] !== undefined) {
        const v = clean(b[k]).toLowerCase();
        if (v && !EMAIL_RE.test(v)) return res.status(400).json({ error: 'E-mail inválido.', fields: { [k]: 'E-mail inválido.' } });
        brand[k] = v;
      }
    }
    if (b.senderName !== undefined) brand.senderName = clean(b.senderName, 60);
    if (b.showPoweredBy !== undefined) brand.showPoweredBy = Boolean(b.showPoweredBy);
    if (b.allowSignup !== undefined) settings.allowSignup = Boolean(b.allowSignup);
    if (b.defaultLimits) settings.defaultLimits = { ...settings.defaultLimits, ...cleanLimits(b.defaultLimits) };

    await db.run('UPDATE partners SET name = $2, brand = $3, settings = $4 WHERE id = $1', [p.id, name, json(brand), json(settings)]);
    invalidatePartnerCache();
    res.json({ partner: await partnerView(await db.get('SELECT * FROM partners WHERE id = $1', [p.id])) });
  }));

  app.post('/api/partner/:pid/domains', wrap(async (req, res) => {
    const p = await targetPartner(req, res);
    if (!p) return;
    const domain = await addDomain(p.id, req.body?.domain);
    res.status(201).json({ domain });
  }));

  app.delete('/api/partner/:pid/domains/:domain', wrap(async (req, res) => {
    const p = await targetPartner(req, res);
    if (!p) return;
    await db.run('DELETE FROM partner_domains WHERE partner_id = $1 AND domain = $2', [p.id, String(req.params.domain).toLowerCase()]);
    invalidatePartnerCache();
    res.json({ ok: true });
  }));

  // Apps OAuth próprios: o cliente vê a marca do parceiro na tela de consentimento.
  app.put('/api/partner/:pid/oauth/:provider', wrap(async (req, res) => {
    const p = await targetPartner(req, res);
    if (!p) return;
    const { provider } = req.params;
    if (!['microsoft', 'google', 'slack'].includes(provider)) return res.status(404).json({ error: 'Provedor desconhecido.' });
    const cfg = partnerOAuth(p);
    const clientId = clean(req.body?.clientId, 300);
    const clientSecret = clean(req.body?.clientSecret, 500);
    if (!clientId) return res.status(400).json({ error: 'Informe o Client ID.', fields: { clientId: 'Obrigatório.' } });
    if (!clientSecret && !cfg[provider]?.clientSecret) return res.status(400).json({ error: 'Informe o Client Secret.', fields: { clientSecret: 'Obrigatório.' } });
    cfg[provider] = {
      clientId,
      clientSecret: clientSecret || cfg[provider].clientSecret,
      ...(provider === 'microsoft' ? { tenant: clean(req.body?.tenant, 100) || 'common' } : {}),
      ...(provider === 'google' ? { restricted: Boolean(req.body?.restricted) } : {}),
    };
    await db.run('UPDATE partners SET oauth_enc = $2 WHERE id = $1', [p.id, encryptOAuth(cfg)]);
    invalidatePartnerCache();
    res.json({ ok: true });
  }));

  app.delete('/api/partner/:pid/oauth/:provider', wrap(async (req, res) => {
    const p = await targetPartner(req, res);
    if (!p) return;
    const cfg = partnerOAuth(p);
    delete cfg[req.params.provider];
    await db.run('UPDATE partners SET oauth_enc = $2 WHERE id = $1', [p.id, Object.keys(cfg).length ? encryptOAuth(cfg) : null]);
    invalidatePartnerCache();
    res.json({ ok: true });
  }));

  // ---------- Clientes do parceiro ----------

  app.get('/api/partner/:pid/clients', wrap(async (req, res) => {
    const p = await targetPartner(req, res);
    if (!p) return;
    const orgs = await db.all(
      `SELECT o.id, o.name, o.status, o.limits, o.created_at,
              (SELECT COUNT(*)::int FROM users u WHERE u.org_id = o.id) AS members,
              (SELECT COUNT(*)::int FROM agents a WHERE a.org_id = o.id) AS agents,
              (SELECT COUNT(*)::int FROM usage_events e WHERE e.org_id = o.id AND e.created_at >= date_trunc('month', now())) AS messages,
              (SELECT COALESCE(SUM(e.input_tokens + e.output_tokens), 0)::int FROM usage_events e WHERE e.org_id = o.id AND e.created_at >= date_trunc('month', now())) AS tokens,
              (SELECT u.email FROM users u WHERE u.org_id = o.id AND u.role = 'owner' LIMIT 1) AS owner_email,
              (SELECT t.email FROM tokens t WHERE t.org_id = o.id AND t.kind = 'convite' AND t.role = 'owner' AND t.used_at IS NULL LIMIT 1) AS pending_owner
         FROM organizations o WHERE o.partner_id = $1 ORDER BY o.created_at DESC`,
      [p.id],
    );
    const defaults = mergeSettings(p.settings).defaultLimits;
    res.json({
      defaults,
      clients: orgs.map((o) => ({
        id: o.id,
        name: o.name,
        status: o.status,
        createdAt: o.created_at,
        members: o.members,
        agents: o.agents,
        messages: o.messages,
        tokens: o.tokens,
        ownerEmail: o.owner_email || o.pending_owner || '',
        ownerPending: !o.owner_email && Boolean(o.pending_owner),
        limits: { ...defaults, ...o.limits },
        customLimits: o.limits,
      })),
    });
  }));

  app.post('/api/partner/:pid/clients', wrap(async (req, res) => {
    const p = await targetPartner(req, res);
    if (!p) return;
    const name = clean(req.body?.name, 120);
    const ownerEmail = clean(req.body?.ownerEmail).toLowerCase();
    const fields = {};
    if (!name) fields.name = 'Informe o nome da empresa.';
    if (!EMAIL_RE.test(ownerEmail)) fields.ownerEmail = 'Use um e-mail válido.';
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Revise os campos destacados.', fields });
    if (await db.get('SELECT 1 FROM users WHERE partner_id = $1 AND email = $2', [p.id, ownerEmail])) {
      return res.status(409).json({ error: 'Este e-mail já tem conta neste parceiro.', fields: { ownerEmail: 'Já tem conta.' } });
    }
    const limits = cleanLimits(req.body?.limits);
    const org = await db.get('INSERT INTO organizations (partner_id, name, limits) VALUES ($1, $2, $3) RETURNING id', [p.id, name, json(limits)]);
    const raw = await createToken({ kind: 'convite', partnerId: p.id, orgId: org.id, email: ownerEmail, role: 'owner', createdBy: req.user.id, ttlMs: 7 * DAY });
    await sendTemplate(p.id, ownerEmail, 'invite', [raw, { orgName: name, inviterName: p.name, roleLabel: ROLES.owner }]);
    res.status(201).json({ id: org.id });
  }));

  app.put('/api/partner/:pid/clients/:orgId', wrap(async (req, res) => {
    const p = await targetPartner(req, res);
    if (!p) return;
    const org = await db.get('SELECT * FROM organizations WHERE id = $1 AND partner_id = $2', [Number(req.params.orgId), p.id]);
    if (!org) return res.status(404).json({ error: 'Cliente não encontrado.' });
    const name = req.body?.name !== undefined ? clean(req.body.name, 120) || org.name : org.name;
    const status = ['ativa', 'suspensa'].includes(req.body?.status) ? req.body.status : org.status;
    const limits = req.body?.limits ? cleanLimits(req.body.limits) : org.limits;
    await db.run('UPDATE organizations SET name = $2, status = $3, limits = $4 WHERE id = $1', [org.id, name, status, json(limits)]);
    res.json({ ok: true });
  }));

  app.get('/api/partner/:pid/clients/:orgId/usage', wrap(async (req, res) => {
    const p = await targetPartner(req, res);
    if (!p) return;
    const org = await db.get('SELECT id FROM organizations WHERE id = $1 AND partner_id = $2', [Number(req.params.orgId), p.id]);
    if (!org) return res.status(404).json({ error: 'Cliente não encontrado.' });
    res.json(await usageSummary(org.id));
  }));

  // ---------- Equipe do parceiro ----------

  app.get('/api/partner/:pid/team', wrap(async (req, res) => {
    const p = await targetPartner(req, res);
    if (!p) return;
    const members = await db.all('SELECT id, name, email, created_at FROM users WHERE partner_id = $1 AND is_partner_admin ORDER BY created_at', [p.id]);
    const invites = await db.all(
      `SELECT id, email, created_at FROM tokens WHERE partner_id = $1 AND org_id IS NULL AND kind = 'convite' AND used_at IS NULL AND expires_at > now()`,
      [p.id],
    );
    res.json({ members, invites });
  }));

  app.post('/api/partner/:pid/team', wrap(async (req, res) => {
    const p = await targetPartner(req, res);
    if (!p) return;
    const email = clean(req.body?.email).toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Use um e-mail válido.', fields: { email: 'E-mail inválido.' } });
    if (await db.get('SELECT 1 FROM users WHERE partner_id = $1 AND email = $2', [p.id, email])) return res.status(409).json({ error: 'Este e-mail já tem conta neste parceiro.' });
    const raw = await createToken({ kind: 'convite', partnerId: p.id, email, role: 'partner_admin', createdBy: req.user.id, ttlMs: 7 * DAY });
    await sendTemplate(p.id, email, 'invite', [raw, { orgName: null, inviterName: req.user.name, roleLabel: `equipe do ${p.name}` }]);
    res.status(201).json({ ok: true });
  }));

  // ---------- Plataforma: parceiros ----------

  app.get('/api/platform/partners', requirePlatform, wrap(async (_req, res) => {
    const rows = await db.all(
      `SELECT p.id, p.slug, p.name, p.status, p.is_default, p.created_at,
              (SELECT COUNT(*)::int FROM organizations o WHERE o.partner_id = p.id) AS clients,
              (SELECT COUNT(*)::int FROM usage_events e JOIN organizations o ON o.id = e.org_id WHERE o.partner_id = p.id AND e.created_at >= date_trunc('month', now())) AS messages,
              (SELECT COALESCE(SUM(e.input_tokens + e.output_tokens), 0)::int FROM usage_events e JOIN organizations o ON o.id = e.org_id WHERE o.partner_id = p.id AND e.created_at >= date_trunc('month', now())) AS tokens,
              (SELECT string_agg(d.domain, ', ') FROM partner_domains d WHERE d.partner_id = p.id) AS domains
         FROM partners p ORDER BY p.is_default DESC, p.created_at`,
    );
    res.json({
      partners: rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, status: r.status, isPlatform: r.is_default, clients: r.clients, messages: r.messages, tokens: r.tokens, domains: r.domains || '', createdAt: r.created_at })),
      subdomainBase: process.env.PARTNER_SUBDOMAIN_BASE || '',
    });
  }));

  app.post('/api/platform/partners', requirePlatform, wrap(async (req, res) => {
    const name = clean(req.body?.name, 60);
    const slug = clean(req.body?.slug, 40).toLowerCase();
    const adminEmail = clean(req.body?.adminEmail).toLowerCase();
    const fields = {};
    if (!name) fields.name = 'Informe o nome da marca.';
    if (!SLUG_RE.test(slug)) fields.slug = 'Use de 3 a 40 letras minúsculas, números ou hífen.';
    if (!EMAIL_RE.test(adminEmail)) fields.adminEmail = 'Use um e-mail válido.';
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Revise os campos destacados.', fields });
    if (await db.get('SELECT 1 FROM partners WHERE slug = $1', [slug])) return res.status(409).json({ error: 'Este identificador já existe.', fields: { slug: 'Já em uso.' } });

    const p = await db.get(`INSERT INTO partners (slug, name, brand, settings) VALUES ($1, $2, '{}', $3) RETURNING *`, [
      slug,
      name,
      json({ allowSignup: false }),
    ]);
    const domains = [];
    if (process.env.PARTNER_SUBDOMAIN_BASE) domains.push(await addDomain(p.id, `${slug}.${process.env.PARTNER_SUBDOMAIN_BASE}`));
    if (req.body?.domain) domains.push(await addDomain(p.id, req.body.domain));
    const raw = await createToken({ kind: 'convite', partnerId: p.id, email: adminEmail, role: 'partner_admin', createdBy: req.user.id, ttlMs: 7 * DAY });
    await sendTemplate(p.id, adminEmail, 'invite', [raw, { orgName: null, inviterName: req.partner.name, roleLabel: `equipe do ${name}` }]);
    res.status(201).json({ id: p.id, domains, inviteSent: domains.length > 0 });
  }));

  app.put('/api/platform/partners/:id/status', requirePlatform, wrap(async (req, res) => {
    const status = req.body?.status;
    if (!['ativo', 'suspenso'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    const p = await db.get('SELECT is_default FROM partners WHERE id = $1', [Number(req.params.id)]);
    if (!p) return res.status(404).json({ error: 'Parceiro não encontrado.' });
    if (p.is_default) return res.status(400).json({ error: 'A própria plataforma não pode ser suspensa.' });
    await db.run('UPDATE partners SET status = $2 WHERE id = $1', [Number(req.params.id), status]);
    invalidatePartnerCache();
    res.json({ ok: true });
  }));
}
