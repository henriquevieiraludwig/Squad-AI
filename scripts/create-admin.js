// Cria o primeiro administrador da plataforma e mostra o link para ele definir a senha.
// Uso: npm run create-admin -- voce@empresa.com
import { initDb, closeDb, db } from '../server/db.js';
import { ensureDefaultPartner, partnerBaseUrl } from '../server/brand.js';
import { createToken } from '../server/routes/auth.js';

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Informe o e-mail: npm run create-admin -- voce@empresa.com');
  process.exit(1);
}

await initDb();
const partner = await ensureDefaultPartner();
const existing = await db.get('SELECT id, is_partner_admin FROM users WHERE partner_id = $1 AND email = $2', [partner.id, email]);
if (existing) {
  await db.run('UPDATE users SET is_partner_admin = true WHERE id = $1', [existing.id]);
  console.log(`${email} já tinha conta e agora é administrador da plataforma.`);
} else {
  const raw = await createToken({ kind: 'convite', partnerId: partner.id, email, role: 'partner_admin', ttlMs: 7 * 86_400_000 });
  console.log(`Convite criado. Abra este link em até 7 dias para definir nome e senha:\n${await partnerBaseUrl(partner)}/convite?token=${raw}`);
}
await closeDb();
