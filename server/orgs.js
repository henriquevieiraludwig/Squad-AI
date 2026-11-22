// Endereço de acesso de cada empresa: /acesso/<slug> no domínio da plataforma (ou do parceiro).
import { partnerBaseUrl } from './brand.js';

export function slugify(name) {
  return (
    String(name || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'empresa'
  );
}

// Slug ainda não usado por outra empresa do mesmo parceiro ("matriz-ai", "matriz-ai-2"...).
export async function uniqueSlug(q, partnerId, name) {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; await q.get('SELECT 1 FROM organizations WHERE partner_id = $1 AND slug = $2', [partnerId, slug]); i++) slug = `${base}-${i}`;
  return slug;
}

export async function accessUrlFor(partner, slug) {
  return `${await partnerBaseUrl(partner)}/acesso/${slug}`;
}
