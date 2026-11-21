// Memória dos agentes e formatação das mensagens.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPlatform } from './helpers.js';
import { toPlainText, toWhatsApp, toTelegramBlocks, parseMessage } from '../shared/format.js';

let P;
before(async () => {
  P = await startPlatform();
});
after(async () => {
  await P.stop();
});

const toolUse = (name, input) => ({ content: [{ type: 'tool_use', id: `toolu_${Math.random().toString(36).slice(2, 8)}`, name, input }], stop_reason: 'tool_use' });
const text = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });
const systemText = () => [].concat(P.fakes.claude.requests.at(-1).system).map((b) => b.text).join('\n');
const toolNames = () => (P.fakes.claude.requests.at(-1).tools || []).map((t) => t.name);

describe('memória do agente', () => {
  let ana; // proprietária
  let bia; // outra pessoa da mesma empresa
  let agentId;

  it('o agente guarda memórias geral e do contato pela ferramenta lembrar', async () => {
    ana = P.client();
    assert.equal((await ana.post('/api/auth/signup', { name: 'Ana', company: 'Loja Sol', email: 'ana@sol.com', password: 'senhaforte1' })).status, 201);
    agentId = (await ana.post('/api/agents', { name: 'Paulo', area: 'Atendimento' })).body.agent.id;

    P.fakes.claude.queue.push(
      toolUse('lembrar', { conteudo: 'A loja fecha às 18h aos sábados.', sobre: 'geral' }),
      toolUse('lembrar', { conteudo: 'Ana prefere ser chamada de Aninha.', sobre: 'contato' }),
      text('Anotado, **Aninha**! 😊'),
    );
    const r = await ana.post(`/api/agents/${agentId}/chat`, { message: 'Me chama de Aninha. E lembre que no sábado fechamos às 18h.' });
    assert.equal(r.status, 200);
    assert.equal(r.body.reply, 'Anotado, **Aninha**! 😊');
    assert.ok(toolNames().includes('lembrar') && toolNames().includes('esquecer'), 'ferramentas de memória sempre disponíveis');

    const mem = (await ana.get(`/api/agents/${agentId}/memories`)).body.memories;
    assert.equal(mem.length, 2);
    assert.deepEqual(mem.map((m) => m.scope).sort(), ['contato', 'geral']);
    assert.equal(mem.find((m) => m.scope === 'contato').contact, 'Ana');
  });

  it('numa conversa nova, o agente recebe a memória geral e a do contato', async () => {
    P.fakes.claude.queue.push(text('Olá!'));
    await ana.post(`/api/agents/${agentId}/chat`, { message: 'Oi de novo' });
    const sys = systemText();
    assert.match(sys, /fecha às 18h aos sábados/);
    assert.match(sys, /Aninha/);
    assert.match(sys, /\*\*negrito\*\*/, 'instruções de formatação');
    assert.match(sys, /emojis/i, 'instruções de emoji');
  });

  it('a memória de um contato não aparece para outra pessoa', async () => {
    const { createToken } = await import('../server/routes/auth.js');
    const me = (await ana.get('/api/auth/me')).body.user;
    const { db } = await import('../server/db.js');
    const org = await db.get('SELECT partner_id FROM organizations WHERE id = $1', [me.orgId]);
    const raw = await createToken({ kind: 'convite', partnerId: org.partner_id, orgId: me.orgId, email: 'bia@sol.com', role: 'admin', ttlMs: 60_000 });
    bia = P.client();
    assert.equal((await bia.post(`/api/invites/${raw}/accept`, { name: 'Bia', password: 'senhaforte1' })).status, 201);

    P.fakes.claude.queue.push(text('Oi, Bia!'));
    await bia.post(`/api/agents/${agentId}/chat`, { message: 'Oi' });
    const sys = systemText();
    assert.match(sys, /fecha às 18h aos sábados/, 'memória geral vale para todos');
    assert.doesNotMatch(sys, /Aninha/, 'memória da Ana não aparece para a Bia');
  });

  it('o agente esquece e a equipe acrescenta e apaga memórias', async () => {
    const geral = (await ana.get(`/api/agents/${agentId}/memories`)).body.memories.find((m) => m.scope === 'geral');
    P.fakes.claude.queue.push(toolUse('esquecer', { id: geral.id }), text('Esquecido.'));
    await ana.post(`/api/agents/${agentId}/chat`, { message: 'Esqueça o horário de sábado.' });
    let mem = (await ana.get(`/api/agents/${agentId}/memories`)).body.memories;
    assert.ok(!mem.some((m) => m.id === geral.id));

    assert.equal((await ana.post(`/api/agents/${agentId}/memories`, { content: '' })).status, 400);
    const add = await ana.post(`/api/agents/${agentId}/memories`, { content: 'Frete grátis acima de R$ 200.' });
    assert.equal(add.status, 201);
    mem = (await ana.get(`/api/agents/${agentId}/memories`)).body.memories;
    const added = mem.find((m) => m.id === add.body.id);
    assert.equal(added.source, 'equipe');
    assert.equal(added.createdBy, 'Ana');
    assert.equal((await ana.del(`/api/agents/${agentId}/memories/${add.body.id}`)).status, 200);
    assert.equal((await ana.del(`/api/agents/${agentId}/memories/${add.body.id}`)).status, 404);
  });

  it('outra empresa não vê nem apaga a memória', async () => {
    const out = P.client();
    await out.post('/api/auth/signup', { name: 'Zé', company: 'Outra', email: 'ze@outra.com', password: 'senhaforte1' });
    assert.equal((await out.get(`/api/agents/${agentId}/memories`)).status, 404);
    const any = (await ana.get(`/api/agents/${agentId}/memories`)).body.memories[0];
    assert.equal((await out.del(`/api/agents/${agentId}/memories/${any.id}`)).status, 404);
  });

  it('edita nome, área e status do agente', async () => {
    const r = await ana.put(`/api/agents/${agentId}`, { name: 'Paulo Agenda', area: 'Agendamento', status: 'publicado' });
    assert.equal(r.status, 200);
    assert.equal(r.body.agent.area, 'Agendamento');
    assert.equal(r.body.agent.status, 'publicado');
    assert.equal((await ana.put(`/api/agents/${agentId}`, { area: 'Inexistente' })).status, 400);
    assert.ok((await ana.get(`/api/agents/${agentId}`)).body.areas.includes('Agendamento'));
  });
});

describe('formatação das mensagens', () => {
  const msg = '## Resumo\nOlá **Ana**! Seu pedido *chegou* e o __prazo__ é amanhã 😊\n- **Item:** caneta\n1. Primeiro\n[site](https://x.com) e 2*3=6';

  it('tira as marcações no texto puro e mantém emojis e contas', () => {
    const t = toPlainText(msg);
    assert.ok(!t.includes('**') && !t.includes('__') && !t.includes('##'));
    assert.match(t, /😊/);
    assert.match(t, /2\*3=6/);
    assert.match(t, /• Item: caneta/);
  });

  it('gera o formato do WhatsApp e o HTML do Telegram', () => {
    assert.match(toWhatsApp(msg), /Olá \*Ana\*! Seu pedido _chegou_/);
    const tg = toTelegramBlocks(msg).join('\n');
    assert.match(tg, /<b>Ana<\/b>/);
    assert.match(tg, /<i>chegou<\/i>/);
    assert.match(tg, /<u>prazo<\/u>/);
    assert.match(tg, /<a href="https:\/\/x.com">site<\/a>/);
  });

  it('não confunde nomes com sublinhado e escapa HTML', () => {
    assert.equal(parseMessage('arquivo_final_v2.pdf')[0].segments.map((s) => s.text).join(''), 'arquivo_final_v2.pdf');
    assert.match(toTelegramBlocks('a < b & c')[0], /a &lt; b &amp; c/);
  });
});
