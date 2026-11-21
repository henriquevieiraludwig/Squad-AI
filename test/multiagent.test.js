// Ferramentas escolhidas na criação, processos com vários agentes e passagem de tarefa entre agentes.
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

const toolUse = (name, input) => ({ content: [{ type: 'tool_use', id: `toolu_${Math.random().toString(36).slice(2, 8)}`, name, input }], stop_reason: 'tool_use' });
const text = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });
const sysOf = (req) => [].concat(req.system).map((b) => (typeof b === 'string' ? b : b.text)).join('\n');

describe('vários agentes', () => {
  let ana;
  let paulo;
  let bruno;

  it('cria agente já com as ferramentas escolhidas', async () => {
    ana = P.client();
    await ana.post('/api/auth/signup', { name: 'Ana', company: 'Loja Lua', email: 'ana@lua.com', password: 'senhaforte1' });
    const r = await ana.post('/api/agents', {
      name: 'Paulo',
      area: 'Atendimento',
      tools: [
        { actionId: 'gcal_create_event', mode: 'approval' },
        { actionId: 'gmail_search', mode: 'auto' },
        { actionId: 'inexistente', mode: 'auto' },
        { actionId: 'gmail_send_email', mode: 'qualquer' },
      ],
    });
    assert.equal(r.status, 201);
    paulo = r.body.agent.id;
    const tools = (await ana.get(`/api/agents/${paulo}`)).body.tools;
    assert.deepEqual(tools, { gcal_create_event: 'approval', gmail_search: 'auto' }, 'só as válidas');
    bruno = (await ana.post('/api/agents', { name: 'Bruno', area: 'Financeiro' })).body.agent.id;
    assert.deepEqual((await ana.get(`/api/agents/${bruno}`)).body.tools, {}, 'sem ferramentas por padrão');
  });

  it('salva processo com responsável por etapa e cada agente vê o processo', async () => {
    const r = await ana.post('/api/processes', {
      title: 'Venda com nota fiscal',
      steps: ['Confirmar o pedido com o cliente', 'Emitir a nota fiscal', 'Avisar o cliente'],
      stepAgents: [paulo, bruno, paulo],
    });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.process.stepAgents, [paulo, bruno, paulo]);
    const bad = await ana.post('/api/processes', { title: 'X', steps: ['a'], stepAgents: [999999] });
    assert.equal(bad.status, 400);

    P.fakes.claude.queue.push(text('Oi'));
    await ana.post(`/api/agents/${bruno}/chat`, { message: 'oi' });
    const sys = sysOf(P.fakes.claude.requests.at(-1));
    assert.match(sys, /Venda com nota fiscal/, 'Bruno vê o processo em que tem etapa');
    assert.match(sys, /Emitir a nota fiscal \(responsável: você\)/);
    assert.match(sys, /Confirmar o pedido com o cliente \(responsável: Paulo\)/);
  });

  it('um agente passa a tarefa para outro e recebe o resultado', async () => {
    P.fakes.claude.queue.push(
      toolUse('passar_tarefa', { agente: 'Bruno', tarefa: 'Emita a nota do pedido 123, R$ 500.' }), // Paulo
      text('Nota 456 emitida.'), // Bruno
      text('Pronto! A nota 456 foi emitida ✅'), // Paulo
    );
    const r = await ana.post(`/api/agents/${paulo}/chat`, { message: 'Fecha a venda do pedido 123' });
    assert.equal(r.status, 200);
    assert.equal(r.body.reply, 'Pronto! A nota 456 foi emitida ✅');
    assert.ok(r.body.actions.some((a) => a.label === 'Passou tarefa para Bruno' && a.status === 'executada'));

    const reqs = P.fakes.claude.requests.slice(-3);
    assert.ok(reqs[0].tools.some((t) => t.name === 'passar_tarefa'), 'Paulo tem a ferramenta');
    assert.match(sysOf(reqs[1]), /Você é Bruno/);
    const brunoMsg = JSON.stringify(reqs[1].messages);
    assert.match(brunoMsg, /Tarefa passada por Paulo/);
    assert.match(brunoMsg, /pedido 123/);
    const back = reqs[2].messages.at(-1).content.find((b) => b.type === 'tool_result');
    assert.match(back.content, /Resposta de Bruno:\nNota 456 emitida\./);

    const convs = (await ana.get('/api/conversations')).body.conversations;
    assert.ok(convs.some((c) => c.channel === 'interno' && c.agentName === 'Bruno'), 'conversa entre agentes registrada');
  });

  it('não encontra agente inexistente e não passa para si mesmo', async () => {
    P.fakes.claude.queue.push(toolUse('passar_tarefa', { agente: 'Carla', tarefa: 'x' }), text('Não há Carla.'));
    await ana.post(`/api/agents/${paulo}/chat`, { message: 'passa pra Carla' });
    const res = P.fakes.claude.requests.at(-1).messages.at(-1).content.find((b) => b.type === 'tool_result');
    assert.equal(res.is_error, true);
    assert.match(res.content, /Não encontrei o agente "Carla"/);
    const desc = P.fakes.claude.requests.at(-1).tools.find((t) => t.name === 'passar_tarefa').description;
    assert.match(desc, /Bruno/);
    assert.doesNotMatch(desc, /Paulo \(/, 'não lista ele mesmo');
  });
});
