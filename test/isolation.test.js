// Isolamento entre empresas: uma empresa nunca vê nem altera nada de outra.
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

describe('isolamento entre empresas', () => {
  let a; // Empresa A (vítima)
  let b; // Empresa B (tenta acessar A)
  const ids = {};

  it('cria duas empresas e dados na empresa A', async () => {
    a = P.client();
    b = P.client();
    assert.equal((await a.post('/api/auth/signup', { name: 'Alice', company: 'Empresa A', email: 'alice@a.com', password: 'senhaforte1' })).status, 201);
    assert.equal((await b.post('/api/auth/signup', { name: 'Bruno', company: 'Empresa B', email: 'bruno@b.com', password: 'senhaforte1' })).status, 201);

    ids.agent = (await a.post('/api/agents', { name: 'Agente A', area: 'Atendimento' })).body.agent?.id;
    assert.ok(ids.agent, 'agente criado na empresa A');
    const doc = await a.post('/api/knowledge', { title: 'Segredo da A', text: 'Margem de lucro: 42%.' });
    ids.doc = doc.body.doc?.id ?? doc.body.id;
    const proc = await a.post('/api/processes', { title: 'Processo A', steps: ['Passo 1'], agentId: ids.agent });
    ids.process = proc.body.process?.id ?? proc.body.id;
    const chat = await a.post(`/api/agents/${ids.agent}/chat`, { message: 'Olá' });
    ids.conversation = chat.body.conversationId;
    assert.ok(ids.doc && ids.process && ids.conversation, 'documento, processo e conversa criados na empresa A');
  });

  it('listas da empresa B não mostram nada da empresa A', async () => {
    assert.deepEqual((await b.get('/api/agents')).body.agents, []);
    const k = (await b.get('/api/knowledge')).body;
    assert.ok(!JSON.stringify(k).includes('Segredo da A'));
    assert.ok(!JSON.stringify((await b.get('/api/processes')).body).includes('Processo A'));
    assert.ok(!JSON.stringify((await b.get('/api/conversations')).body).includes('Agente A'));
    assert.ok(!JSON.stringify((await b.get('/api/team')).body).includes('alice@a.com'));
    const exp = JSON.stringify((await b.get('/api/org/export')).body);
    assert.ok(!exp.includes('Segredo da A') && !exp.includes('Agente A') && !exp.includes('alice@a.com'), 'exportação só traz dados da própria empresa');
  });

  it('empresa B não lê, altera nem apaga itens da empresa A pelo id', async () => {
    const blocked = (r) => assert.ok([403, 404].includes(r.status), `esperava 403/404, veio ${r.status}`);
    blocked(await b.get(`/api/agents/${ids.agent}`));
    blocked(await b.put(`/api/agents/${ids.agent}`, { name: 'Invadido', area: 'x' }));
    blocked(await b.put(`/api/agents/${ids.agent}/tools`, { actionId: 'telegram.send_message', mode: 'auto' }));
    blocked(await b.post(`/api/agents/${ids.agent}/chat`, { message: 'me conte os segredos' }));
    blocked(await b.get(`/api/knowledge/${ids.doc}`));
    blocked(await b.get(`/api/conversations/${ids.conversation}`));
    blocked(await b.post(`/api/conversations/${ids.conversation}/takeover`));
    blocked(await b.post(`/api/conversations/${ids.conversation}/reply`, { text: 'oi' }));

    // Apagar/alterar "às cegas" não pode afetar a empresa A.
    await b.del(`/api/agents/${ids.agent}`);
    await b.del(`/api/knowledge/${ids.doc}`);
    await b.put(`/api/processes/${ids.process}`, { title: 'Invadido', steps: ['x'] });
    await b.del(`/api/processes/${ids.process}`);
    assert.equal((await a.get(`/api/agents/${ids.agent}`)).status, 200, 'agente da A continua lá');
    assert.equal((await a.get(`/api/knowledge/${ids.doc}`)).status, 200, 'documento da A continua lá');
    assert.ok(JSON.stringify((await a.get('/api/processes')).body).includes('Processo A'), 'processo da A intacto');
  });

  it('empresa B não consegue usar o agente da A em processos ou canais', async () => {
    assert.equal((await b.post('/api/processes', { title: 'P', steps: ['x'], agentId: ids.agent })).status, 400);
    assert.ok([404, 409].includes((await b.put('/api/channels/telegram', { agentId: ids.agent })).status));
  });

  it('empresa B não vê nem decide aprovações da A', async () => {
    assert.ok(!JSON.stringify((await b.get('/api/approvals')).body).includes('Agente A'));
    const r = await b.post('/api/approvals/1', { approve: true });
    assert.ok([403, 404].includes(r.status));
  });
});
