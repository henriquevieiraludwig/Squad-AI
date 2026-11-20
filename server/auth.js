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

const sha256 = (v) => createHash('sha256').update(v).digest('hex');

export function createSession(res, userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    sha256(token),
    userId,
    expiresAt,
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(expiresAt),
    path: '/',
  });
}

export function destroySession(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  req.user = null;
  if (token) {
    const row = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.role, u.org_id, o.name AS org_name, s.expires_at
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           JOIN organizations o ON o.id = u.org_id
          WHERE s.token_hash = ?`,
      )
      .get(sha256(token));
    if (row && row.expires_at > Date.now()) {
      req.user = {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        orgId: row.org_id,
        orgName: row.org_name,
      };
    } else if (row) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' });
  next();
}

// Limite simples de tentativas de login por IP + e-mail (em memória).
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function tooManyAttempts(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) return false;
  return entry.count >= MAX_ATTEMPTS;
}

export function registerFailure(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) attempts.set(key, { first: Date.now(), count: 1 });
  else entry.count += 1;
}

export function clearFailures(key) {
  attempts.delete(key);
}
