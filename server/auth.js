import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';

const scryptAsync = promisify(scrypt);
const SESSION_DAYS = 30;
export const COOKIE_NAME = 'squadai_session';

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const key = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(key, expected);
}

export const sha256 = (v) => createHash('sha256').update(v).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export async function createSession(res, userId) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [sha256(token), userId, expiresAt]);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    path: '/',
  });
}

export async function destroySession(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) await db.run('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export async function destroyUserSessions(userId) {
  await db.run('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

// ---------- Papéis e permissões ----------

export const ROLES = {
  owner: 'Proprietário',
  admin: 'Administrador',
  approver: 'Aprovador',
  member: 'Membro',
};

const PERMS = {
  owner: ['configurar', 'aprovar', 'atender', 'equipe', 'conversar'],
  admin: ['configurar', 'aprovar', 'atender', 'equipe', 'conversar'],
  approver: ['aprovar', 'atender', 'conversar'],
  member: ['conversar'],
};

export const permissionsFor = (role) => PERMS[role] || [];
export const can = (user, perm) => Boolean(user?.orgId) && permissionsFor(user.role).includes(perm);

function shapeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    roleLabel: row.org_id ? ROLES[row.role] : 'Equipe do parceiro',
    orgId: row.org_id,
    orgName: row.org_name || null,
    orgSlug: row.org_slug || null,
    orgStatus: row.org_status || null,
    partnerId: row.partner_id,
    isPartnerAdmin: row.is_partner_admin,
    isPlatformAdmin: Boolean(row.is_partner_admin && row.partner_is_default),
    emailVerified: Boolean(row.email_verified_at),
    permissions: row.org_id ? permissionsFor(row.role) : [],
  };
}

export async function loadUser(req, _res, next) {
  req.user = null;
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  try {
    const row = await db.get(
      `SELECT u.*, o.name AS org_name, o.slug AS org_slug, o.status AS org_status, p.is_default AS partner_is_default, s.expires_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         JOIN partners p ON p.id = u.partner_id
         LEFT JOIN organizations o ON o.id = u.org_id
        WHERE s.token_hash = $1`,
      [sha256(token)],
    );
    if (row && new Date(row.expires_at) > new Date() && row.partner_id === req.partner?.id) {
      req.user = shapeUser(row);
    } else if (row && new Date(row.expires_at) <= new Date()) {
      await db.run('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' });
  next();
}

// Rotas da empresa: exige usuário de uma empresa ativa (e, opcionalmente, uma permissão).
export function requireOrg(perm) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' });
    if (!req.user.orgId) return res.status(403).json({ error: 'Esta área é das empresas clientes. Use o painel do parceiro.' });
    if (req.user.orgStatus === 'suspensa') return res.status(403).json({ error: 'O acesso desta empresa está suspenso. Fale com o suporte.' });
    if (perm && !can(req.user, perm)) {
      const msg = {
        configurar: 'Só administradores podem alterar esta configuração.',
        aprovar: 'Só aprovadores e administradores podem decidir pedidos.',
        atender: 'Só aprovadores e administradores podem atender conversas.',
        equipe: 'Só administradores podem gerenciar a equipe.',
      }[perm];
      return res.status(403).json({ error: msg || 'Você não tem permissão para esta ação.' });
    }
    next();
  };
}

// ---------- Limite simples de tentativas (em memória) ----------

const buckets = new Map();

export function rateLimit({ key, max, windowMs }) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start > windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return true;
  }
  b.count += 1;
  return b.count <= max;
}

export function resetRateLimit(key) {
  buckets.delete(key);
}

// Limpa entradas antigas de tempos em tempos.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now - b.start > 3_600_000) buckets.delete(k);
}, 600_000).unref();
