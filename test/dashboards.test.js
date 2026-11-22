// Dashboards criados pelos agentes: ferramenta, telas, link público e isolamento entre empresas.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPlatform } from './helpers.js';
import { SAMPLE_DASHBOARD_INPUT } from '../shared/sampleDashboard.js';
import { normalizeSpec } from '../server/agent/dashboards.js';

let P;
before(async () => {
  P = await startPlatform();
});
after(async () => {
  await P.stop();
});

const toolUse = (name, input) => ({ content: [{ type: 'tool_use', id: `toolu_${Math.random().toString(36).slice(2, 8)}`, name, input }], stop_reason: 'tool_use' });
const text = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });

describe('dashboards', () => {
  let ana;
  let agentId;
  let dashId;

  it('normaliza o que o agente manda (números em texto, tipos inválidos, excessos)', () => {
    const s = normalizeSpec({
      titulo: 'Teste',
      graficos: [{ tipo: 'pizza3d', titulo: 'X', rotulos: ['a', 'b'], series: [{ nome: 'S', valores: ['1.500,50', 'abc'] }] }],
    });
    assert.equal(s.charts[0].type, 'barras');
    assert.deepEqual(s.charts[0].series[0].data, [1500.5, 0]);
    assert.throws(() => normalizeSpec({ titulo: 'Vazio' }), /pelo menos um/);
  });

  it('o agente cria o dashboard pela ferramenta e devolve o link', async () => {
    ana = P.client();
    await ana.post('/api/auth/signup', { name: 'Ana', company: 'Loja Sol', email: 'ana@sol.com', password: 'senhaforte1' });
    agentId = (await ana.post('/api/agents', { name: 'Dani', area: 'Dados e relatórios' })).body.agent.id;
    P.fakes.claude.queue.push(toolUse('criar_dashboard', SAMPLE_DASHBOARD_INPUT), text('Pronto! [Abrir o dashboard](https://x/app/dashboards/1) 📊'));
    const r = await ana.post(`/api/agents/${agentId}/chat`, { message: 'Monte um dashboard das vendas do ano' });
    assert.equal(r.status, 200);
    const tools = P.fakes.claude.requests.at(-2).tools.map((t) => t.name);
    assert.ok(tools.includes('criar_dashboard'), 'ferramenta sempre disponível');
    const act = r.body.actions.find((a) => a.label.startsWith('Dashboard:'));
    assert.ok(act?.link?.startsWith('/app/dashboards/'));
    const back = P.fakes.claude.requests.at(-1).messages.at(-1).content.find((b) => b.type === 'tool_result');
    assert.match(back.content, /Dashboard criado: http.*\/app\/dashboards\/\d+/);
    dashId = Number(act.link.split('/').pop());
  });

  it('lista, abre, compartilha e apaga', async () => {
    const list = (await ana.get('/api/dashboards')).body.dashboards;
    assert.equal(list.length, 1);
    assert.equal(list[0].title, 'Performance comercial e financeira');
    assert.equal(list[0].agentName, 'Dani');
    const d = (await ana.get(`/api/dashboards/${dashId}`)).body.dashboard;
    assert.equal(d.spec.kpis.length, 4);
    assert.equal(d.spec.charts.length, 5);
    assert.equal(d.spec.charts[0].width, 'inteira');

    const sh = await ana.post(`/api/dashboards/${dashId}/share`, { enabled: true });
    assert.ok(sh.body.shareToken.length >= 16);
    const pub = await P.client().get(`/api/public/dashboards/${sh.body.shareToken}`);
    assert.equal(pub.status, 200);
    assert.equal(pub.body.dashboard.orgName, 'Loja Sol');
    await ana.post(`/api/dashboards/${dashId}/share`, { enabled: false });
    assert.equal((await P.client().get(`/api/public/dashboards/${sh.body.shareToken}`)).status, 404, 'link desligado');
  });

  it('outra empresa não vê', async () => {
    const z = P.client();
    await z.post('/api/auth/signup', { name: 'Zé', company: 'Outra', email: 'ze@outra.com', password: 'senhaforte1' });
    assert.deepEqual((await z.get('/api/dashboards')).body.dashboards, []);
    assert.equal((await z.get(`/api/dashboards/${dashId}`)).status, 404);
    assert.equal((await z.del(`/api/dashboards/${dashId}`)).status, 404);
    assert.equal((await ana.del(`/api/dashboards/${dashId}`)).status, 200);
  });
});
