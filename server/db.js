// Camada de dados em dialeto PostgreSQL.
// Com DATABASE_URL: servidor Postgres (produção). Sem ela: PGlite, um Postgres embutido
// que roda dentro do Node (desenvolvimento e testes), gravado em data/pglite ou em memória.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIGRATIONS } from './schema.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let driver = null;

// Supabase, Neon, Render e afins exigem SSL. O parâmetro sslmode da URL é tratado aqui,
// porque o driver pg passou a interpretá-lo como verificação completa do certificado.
export function connectionOptions(url) {
  const u = new URL(url);
  const sslmode = u.searchParams.get('sslmode');
  u.searchParams.delete('sslmode');
  const managed = /\.(supabase\.co|supabase\.com|neon\.tech|render\.com)$/.test(u.hostname);
  const wantsSsl = process.env.DATABASE_SSL === 'true' || (process.env.DATABASE_SSL !== 'false' && (managed || (sslmode && sslmode !== 'disable')));
  return {
    connectionString: u.toString(),
    ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
    // O pooler da Supabase (porta 6543) não guarda estado de sessão; avisamos para usar a 5432.
    transactionPooler: /pooler\.supabase\.com$/.test(u.hostname) && u.port === '6543',
  };
}

async function pgDriver(url) {
  const { default: pg } = await import('pg');
  const opts = connectionOptions(url);
  if (opts.transactionPooler) {
    console.warn('[banco] Você está usando o pooler de transações da Supabase (porta 6543). Prefira o "Session pooler" (porta 5432) para um servidor sempre ligado.');
  }
  const pool = new pg.Pool({
    connectionString: opts.connectionString,
    ssl: opts.ssl,
    max: Number(process.env.DATABASE_POOL || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  // Poolers gerenciados encerram conexões ociosas; sem este tratador o processo cairia.
  pool.on('error', (err) => console.error('[banco] conexão ociosa encerrada:', err.message));
  const wrap = (client) => ({
    async query(sql, params = []) {
      const r = await client.query(sql, params);
      return { rows: r.rows, count: r.rowCount ?? 0 };
    },
  });
  return {
    kind: 'postgres',
    ...wrap(pool),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(wrap(client));
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

async function pgliteDriver(dataDir) {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir !== 'memory://') mkdirSync(dataDir, { recursive: true });
  const lite = new PGlite(dataDir);
  await lite.waitReady;
  const wrap = (conn) => ({
    async query(sql, params = []) {
      const r = await conn.query(sql, params);
      return { rows: r.rows, count: r.affectedRows ?? r.rows.length };
    },
  });
  return {
    kind: 'pglite',
    ...wrap(lite),
    tx: (fn) => lite.transaction((t) => fn(wrap(t))),
    exec: (sql) => lite.exec(sql),
    close: () => lite.close(),
  };
}

export async function initDb({ url = process.env.DATABASE_URL, dataDir = process.env.PGLITE_DIR } = {}) {
  if (driver) return driver;
  driver = url ? await pgDriver(url) : await pgliteDriver(dataDir || join(root, 'data', 'pglite'));
  await migrate();
  return driver;
}

export async function closeDb() {
  if (driver) await driver.close();
  driver = null;
}

async function migrate() {
  await driver.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const { rows } = await driver.query('SELECT version FROM schema_migrations');
  const done = new Set(rows.map((r) => r.version));
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const version = i + 1;
    if (done.has(version)) continue;
    await driver.tx(async (t) => {
      for (const stmt of MIGRATIONS[i].split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await t.query(stmt);
      await t.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    });
  }
}

const current = () => {
  if (!driver) throw new Error('Banco não inicializado. Chame initDb() antes.');
  return driver;
};

// Interface usada pelo restante do servidor. Placeholders no formato $1, $2...
function api(getConn) {
  return {
    async all(sql, params) {
      return (await getConn().query(sql, params)).rows;
    },
    async get(sql, params) {
      return (await getConn().query(sql, params)).rows[0] ?? null;
    },
    async run(sql, params) {
      return getConn().query(sql, params);
    },
  };
}

export const db = {
  ...api(current),
  tx: (fn) => current().tx((conn) => fn(api(() => conn))),
  get kind() {
    return current().kind;
  },
};

// JSONB sempre vai como texto (o driver pg converteria arrays em arrays do Postgres).
export const json = (value) => JSON.stringify(value ?? null);
