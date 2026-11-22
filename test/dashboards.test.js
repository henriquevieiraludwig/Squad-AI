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

// Exportação para o Google: confere a forma das chamadas (APIs simuladas).
import { buildSheetsRequests, buildSlidesRequests, chartBands, exportToSlides } from '../server/agent/googleExport.js';

describe('exportação para o Google', () => {
  const spec = normalizeSpec(SAMPLE_DASHBOARD_INPUT);

  it('planilha: painel no tema da marca, uma aba de dados e um gráfico nativo por gráfico', () => {
    const { create, requests, chartIds } = buildSheetsRequests(spec);
    assert.equal(create.sheets[0].properties.title, 'Dashboard');
    assert.equal(create.sheets[0].properties.gridProperties.hideGridlines, true);
    assert.equal(create.sheets.length, spec.charts.length + 1);
    const charts = requests.filter((r) => r.addChart).map((r) => r.addChart.chart);
    assert.equal(charts.length, spec.charts.length);
    assert.deepEqual(charts.map((c) => c.chartId), chartIds);
    for (const c of charts) {
      assert.ok(c.spec.basicChart || c.spec.pieChart);
      assert.ok(c.spec.backgroundColorStyle.rgbColor);
    }
    const values = JSON.stringify(requests.filter((r) => r.updateCells));
    assert.ok(values.includes(spec.kpis[0].value));
    assert.ok(values.includes(spec.title));
    // Dois gráficos "metade" seguidos dividem a mesma faixa.
    assert.deepEqual(chartBands([{ width: 'inteira' }, { width: 'metade' }, { width: 'metade' }, { width: 'metade' }]), [[0], [1, 2], [3]]);
  });

  it('slides: capa, indicadores, um slide por gráfico (ligado à planilha), conclusões e tabela', () => {
    const reqs = buildSlidesRequests(spec, { spreadsheetId: 'ss1', chartIds: spec.charts.map((_, i) => 1000 + i) });
    const slides = reqs.filter((r) => r.createSlide).length;
    const tableSlides = spec.tables.reduce((n, t) => n + Math.max(1, Math.ceil(t.rows.length / 10)), 0);
    assert.equal(slides, 1 + 1 + spec.charts.length + (spec.insights.length ? 1 : 0) + tableSlides);
    const linked = reqs.filter((r) => r.createSheetsChart);
    assert.equal(linked.length, spec.charts.length);
    assert.ok(linked.every((r) => r.createSheetsChart.spreadsheetId === 'ss1' && r.createSheetsChart.linkingMode === 'LINKED'));
    assert.ok(reqs.every((r) => !r.insertText || r.insertText.text));
  });

  it('cria a planilha e a apresentação e devolve o link', async () => {
    const calls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, opt) => {
      calls.push([String(url), JSON.parse(opt.body || 'null')]);
      const body = String(url).endsWith('/spreadsheets')
        ? { spreadsheetId: 'ss9', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/ss9/edit' }
        : String(url).endsWith('/presentations')
          ? { presentationId: 'pp9', slides: [{ objectId: 'p' }] }
          : {};
      return new Response(JSON.stringify(body), { status: 200 });
    };
    try {
      const out = await exportToSlides('tok', spec);
      assert.equal(out.url, 'https://docs.google.com/presentation/d/pp9/edit');
      assert.equal(calls.length, 4);
      const last = calls[3][1].requests;
      assert.deepEqual(last.at(-1), { deleteObject: { objectId: 'p' } });
      assert.ok(last.some((r) => r.createSheetsChart?.spreadsheetId === 'ss9'));
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
