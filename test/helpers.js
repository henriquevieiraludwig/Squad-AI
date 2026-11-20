// Ambiente de teste: plataforma completa com PGlite em memória, Claude falso e Telegram falso.
import http from 'node:http';

// Servidor falso que imita a API do Claude e a do Telegram.
export function startFakes() {
  const claude = { requests: [], queue: [] };
  const telegram = { sent: [] };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const data = body ? JSON.parse(body) : {};
      res.setHeader('content-type', 'application/json');
      if (req.url.startsWith('/v1/messages')) {
        claude.requests.push(data);
        const next = claude.queue.shift() || { content: [{ type: 'text', text: 'Resposta do agente.' }], stop_reason: 'end_turn' };
        return res.end(
          JSON.stringify({
            id: `msg_${claude.requests.length}`,
            type: 'message',
            role: 'assistant',
            model: data.model,
            content: next.content,
            stop_reason: next.stop_reason,
            stop_sequence: null,
            usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          }),
        );
      }
      const tg = req.url.match(/^\/bot([^/]+)\/(\w+)$/);
      if (tg) {
        if (tg[2] === 'sendMessage') telegram.sent.push(data);
        if (tg[2] === 'getMe') return res.end(JSON.stringify({ ok: true, result: { username: 'empresa_bot' } }));
        return res.end(JSON.stringify({ ok: true, result: { message_id: telegram.sent.length } }));
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}`, claude, telegram })));
}

export async function startPlatform() {
  const fakes = await startFakes();
  process.env.NODE_ENV = 'test';
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.ANTHROPIC_API_KEY = 'teste';
  process.env.ANTHROPIC_BASE_URL = fakes.url;
  process.env.TELEGRAM_API_URL = fakes.url;
  process.env.PUBLIC_URL = 'http://plataforma.test';
  process.env.APP_URL = 'http://plataforma.test';
  if (!process.env.DATABASE_URL) process.env.PGLITE_DIR = 'memory://';
  delete process.env.RESEND_API_KEY;

  const { initDb, db, closeDb } = await import('../server/db.js');
  const { ensureDefaultPartner } = await import('../server/brand.js');
  const { registerJobHandlers } = await import('../server/job-handlers.js');
  const { createApp } = await import('../server/index.js');
  const { drainJobs } = await import('../server/jobs.js');
  const { outbox } = await import('../server/email.js');

  await initDb();
  if (process.env.DATABASE_URL) {
    // Banco Postgres de teste: começa vazio.
    await db.run(`DO $$ DECLARE r record; BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations' LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP; END $$`);
  }
  const platform = await ensureDefaultPartner();
  registerJobHandlers();
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;

  // Cliente HTTP com cookies e cabeçalho Host (para simular os domínios dos parceiros).
  function client(host = 'plataforma.test') {
    let cookie = '';
    async function call(method, path, body) {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const res = await new Promise((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port,
            path,
            method,
            headers: {
              Host: host,
              ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
              ...(cookie ? { Cookie: cookie } : {}),
            },
          },
          (r) => {
            let data = '';
            r.on('data', (c) => (data += c));
            r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, text: data }));
          },
        );
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
      });
      const set = res.headers['set-cookie'];
      if (set) cookie = set.map((c) => c.split(';')[0]).join('; ');
      let json = null;
      try {
        json = JSON.parse(res.text);
      } catch {}
      return { status: res.status, body: json, headers: res.headers };
    }
    return {
      get: (p) => call('GET', p),
      post: (p, b = {}) => call('POST', p, b),
      put: (p, b = {}) => call('PUT', p, b),
      del: (p) => call('DELETE', p),
      get cookie() {
        return cookie;
      },
      set cookie(v) {
        cookie = v;
      },
    };
  }

  const lastLink = (to, path) => {
    const mail = [...outbox].reverse().find((m) => m.to === to && m.text.includes(path));
    if (!mail) return null;
    return mail.text.match(new RegExp(`${path}\\?token=([\\w-]+)`))?.[1] || null;
  };

  // Envia uma requisição crua (ex.: webhook com cabeçalhos próprios).
  function raw(method, path, body, headers = {}) {
    const payload = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, path, method, headers: { Host: 'plataforma.test', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers } },
        (r) => {
          r.resume();
          r.on('end', () => resolve(r.statusCode));
        },
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  return {
    db,
    port,
    raw,
    platform,
    client,
    fakes,
    outbox,
    drainJobs,
    lastLink,
    async stop() {
      server.close();
      fakes.server.close();
      await closeDb();
    },
  };
}
