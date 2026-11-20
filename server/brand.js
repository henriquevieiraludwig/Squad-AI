// White label: cada parceiro tem marca, domínios, regras de cadastro, limites padrão e,
// opcionalmente, apps OAuth próprios. O parceiro é escolhido pelo domínio da requisição.
import { db, json } from './db.js';
import { encrypt, decrypt } from './crypto.js';

export const DEFAULT_BRAND = {
  colors: { action: '#B8F479', dark: '#10271E', accent: '#346A42' },
  logo: null, // data URL (PNG, SVG ou WebP) enviado pelo parceiro
  supportEmail: '',
  termsUrl: '',
  privacyUrl: '',
  senderName: '',
  senderEmail: '', // só use se o domínio estiver verificado no provedor de e-mail
  showPoweredBy: true,
};

export const DEFAULT_LIMITS = { agents: 5, members: 10, messagesPerMonth: 2000, knowledgeChars: 400_000 };
export const DEFAULT_SETTINGS = { allowSignup: true, defaultLimits: DEFAULT_LIMITS };

const PLATFORM_NAME = process.env.PLATFORM_NAME || 'Squad AI';
const PLATFORM_SLUG = process.env.PLATFORM_SLUG || 'squad-ai';

export const mergeBrand = (brand) => ({ ...DEFAULT_BRAND, ...brand, colors: { ...DEFAULT_BRAND.colors, ...(brand?.colors || {}) } });
export const mergeSettings = (s) => ({
  ...DEFAULT_SETTINGS,
  ...s,
  defaultLimits: { ...DEFAULT_LIMITS, ...(s?.defaultLimits || {}) },
});

// Garante que exista o parceiro padrão (a própria plataforma).
export async function ensureDefaultPartner() {
  const existing = await db.get('SELECT * FROM partners WHERE is_default = true');
  if (existing) return existing;
  return db.get(
    `INSERT INTO partners (slug, name, brand, settings, is_default) VALUES ($1, $2, $3, $4, true) RETURNING *`,
    [PLATFORM_SLUG, PLATFORM_NAME, json({}), json({})],
  );
}

// Cache curto de domínio -> parceiro, para não consultar o banco a cada requisição.
let cache = { at: 0, byDomain: new Map(), defaultPartner: null };
const TTL = 30_000;

export function invalidatePartnerCache() {
  cache.at = 0;
}

async function refresh() {
  const partners = await db.all('SELECT * FROM partners');
  const domains = await db.all('SELECT domain, partner_id FROM partner_domains');
  const byId = new Map(partners.map((p) => [p.id, p]));
  cache = {
    at: Date.now(),
    byDomain: new Map(domains.map((d) => [d.domain, byId.get(d.partner_id)])),
    defaultPartner: partners.find((p) => p.is_default) || null,
    byId,
  };
}

export async function partnerForHost(host) {
  if (Date.now() - cache.at > TTL) await refresh();
  const clean = String(host || '').toLowerCase().replace(/:\d+$/, '');
  return cache.byDomain.get(clean) || cache.defaultPartner;
}

export async function partnerById(id) {
  if (Date.now() - cache.at > TTL) await refresh();
  return cache.byId?.get(id) || db.get('SELECT * FROM partners WHERE id = $1', [id]);
}

export async function resolvePartner(req, res, next) {
  try {
    let host = req.hostname;
    // Fora de produção, ?parceiro=slug ajuda a testar marcas sem configurar domínios.
    const override = req.query?.parceiro || req.get('x-partner-slug');
    if (process.env.NODE_ENV !== 'production' && override) {
      const p = await db.get('SELECT * FROM partners WHERE slug = $1', [String(override)]);
      if (p) {
        req.partner = p;
        return next();
      }
    }
    req.partner = await partnerForHost(host);
    if (!req.partner) return res.status(503).json({ error: 'Plataforma ainda não configurada.' });
    if (req.partner.status === 'suspenso' && req.path.startsWith('/api/') && !req.path.startsWith('/api/brand')) {
      return res.status(403).json({ error: 'Este acesso está suspenso. Fale com o suporte.' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function publicBrand(partner) {
  const b = mergeBrand(partner.brand);
  const s = mergeSettings(partner.settings);
  return {
    name: partner.name,
    slug: partner.slug,
    isPlatform: partner.is_default,
    logo: b.logo,
    colors: b.colors,
    supportEmail: b.supportEmail,
    termsUrl: b.termsUrl,
    privacyUrl: b.privacyUrl,
    showPoweredBy: b.showPoweredBy,
    allowSignup: s.allowSignup,
  };
}

// Endereço público do parceiro, usado nos links dos e-mails.
export async function partnerBaseUrl(partner) {
  if (!partner.is_default) {
    const d = await db.get('SELECT domain FROM partner_domains WHERE partner_id = $1 ORDER BY created_at LIMIT 1', [partner.id]);
    if (d) return `https://${d.domain}`;
  }
  return (process.env.APP_URL || process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');
}

// ---------- Apps OAuth próprios do parceiro (opcional) ----------

export function partnerOAuth(partner) {
  if (!partner?.oauth_enc) return {};
  try {
    return decrypt(partner.oauth_enc);
  } catch {
    return {};
  }
}

export const encryptOAuth = (cfg) => encrypt(cfg);

const ENV = {
  microsoft: () => ({ clientId: process.env.MICROSOFT_CLIENT_ID, clientSecret: process.env.MICROSOFT_CLIENT_SECRET, tenant: process.env.MICROSOFT_TENANT || 'common' }),
  google: () => ({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    restricted: process.env.GOOGLE_RESTRICTED_SCOPES === 'true',
  }),
  slack: () => ({ clientId: process.env.SLACK_CLIENT_ID, clientSecret: process.env.SLACK_CLIENT_SECRET }),
};

// Credenciais do app OAuth a usar: as do parceiro, se cadastradas, senão as da plataforma.
export function oauthConfig(partner, provider) {
  const own = partnerOAuth(partner)[provider];
  if (own?.clientId && own?.clientSecret) return { ...ENV[provider]?.(), ...own, source: 'parceiro' };
  return { ...ENV[provider]?.(), source: 'plataforma' };
}
