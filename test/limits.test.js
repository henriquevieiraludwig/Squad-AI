// Limites: empresas de clientes seguem o plano; a empresa do dono da plataforma não tem limite de agentes.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPlatform } from './helpers.js';

let P;
before(async () => {
  P = await startPlatform();
});
after(async () => {
  await P.stop();
});

describe('limites', () => {
  it('cliente comum para em 5 agentes', async () => {
    const c = P.client();
    await c.post('/api/auth/signup', { name: 'Cli', company: 'Cliente', email: 'cli@x.com', password: 'senhaforte1' });
    for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/agents', { name: `A${i}`, area: 'Atendimento' })).status, 201);
    const sixth = await c.post('/api/agents', { name: 'A6', area: 'Atendimento' });
    assert.equal(sixth.status, 402);
  });

  it('a empresa do dono da plataforma não tem limite de agentes', async () => {
    const { createToken } = await import('../server/routes/auth.js');
    const raw = await createToken({ kind: 'convite', partnerId: P.platform.id, email: 'dono@zadok.com', role: 'partner_admin', ttlMs: 60_000 });
    const dono = P.client();
    assert.equal((await dono.post(`/api/invites/${raw}/accept`, { name: 'Dono', password: 'senhaforte1' })).status, 201);
    assert.equal((await dono.post('/api/platform/my-company', { name: 'Zadok' })).status, 201);
    for (let i = 0; i < 7; i++) assert.equal((await dono.post('/api/agents', { name: `Z${i}`, area: 'Atendimento' })).status, 201);
    const usage = (await dono.get('/api/usage')).body;
    const limits = usage.limits || usage.usage?.limits;
    assert.equal(limits.unlimited, true);
  });
});

describe('acesso pelo endereço da empresa', () => {
  it('endereço próprio, login restrito à empresa e link no convite', async () => {
    const a = P.client();
    await a.post('/api/auth/signup', { name: 'Ana', company: 'Padaria São João', email: 'ana@pao.com', password: 'senhaforte1' });
    const me = (await a.get('/api/auth/me')).body.user;
    assert.equal(me.orgSlug, 'padaria-sao-joao');
    const info = await P.client().get('/api/access/padaria-sao-joao');
    assert.equal(info.body.org.name, 'Padaria São João');
    assert.equal((await P.client().get('/api/access/nao-existe')).status, 404);

    const b = P.client();
    await b.post('/api/auth/signup', { name: 'Bia', company: 'Padaria São João', email: 'bia@pao2.com', password: 'senhaforte1' });
    assert.equal((await b.get('/api/auth/me')).body.user.orgSlug, 'padaria-sao-joao-2', 'nome repetido ganha número');

    const fresh = P.client();
    assert.equal((await fresh.post('/api/auth/login', { email: 'ana@pao.com', password: 'senhaforte1', slug: 'padaria-sao-joao-2' })).status, 403);
    assert.equal((await fresh.post('/api/auth/login', { email: 'ana@pao.com', password: 'senhaforte1', slug: 'padaria-sao-joao' })).status, 200);

    await a.post('/api/team/invites', { email: 'carlos@pao.com', role: 'member' });
    await P.drainJobs();
    const { outbox } = await import('../server/email.js');
    const mail = outbox.find((m) => m.to === 'carlos@pao.com');
    assert.match(mail.text, /\/acesso\/padaria-sao-joao/);
  });
});
