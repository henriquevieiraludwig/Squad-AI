// Testa a conexão com o banco de DATABASE_URL e aplica as migrações.
// Uso: DATABASE_URL="postgresql://..." npm run db:check
import { initDb, closeDb, db } from '../server/db.js';

if (!process.env.DATABASE_URL) {
  console.error('Defina DATABASE_URL com a string de conexão (no Supabase: Connect > Session pooler).');
  process.exit(1);
}
const host = new URL(process.env.DATABASE_URL).host;
console.log(`Conectando em ${host}…`);
try {
  await initDb();
  const v = await db.get('SHOW server_version');
  const t = await db.get(`SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`);
  const m = await db.get('SELECT MAX(version)::int AS v FROM schema_migrations');
  const rls = await db.get(`SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity`);
  console.log(`Conexão OK. PostgreSQL ${v.server_version}, ${t.n} tabelas, migração ${m.v} aplicada.`);
  console.log(rls.n === 0 ? 'Todas as tabelas estão protegidas contra a API pública da Supabase (RLS ligado).' : `Atenção: ${rls.n} tabelas sem RLS.`);
} catch (err) {
  console.error('Falha ao conectar:', err.message);
  if (/ENOTFOUND|ENETUNREACH|EHOSTUNREACH/.test(err.code || err.message)) {
    console.error('Dica: o endereço direto (db.xxx.supabase.co) só funciona com IPv6. Use a string do "Session pooler".');
  }
  if (/password authentication failed/.test(err.message)) console.error('Dica: confira a senha do banco (Supabase: Project Settings > Database > Reset password).');
  process.exitCode = 1;
} finally {
  await closeDb();
}
