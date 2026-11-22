// Dashboards criados pelos agentes: o agente descreve o painel (indicadores, gráficos, tabelas e conclusões)
// e a plataforma desenha no tema da marca, com link para abrir, compartilhar e baixar em PDF.
import { randomBytes } from 'node:crypto';
import { db, json } from '../db.js';
import { partnerBaseUrl } from '../brand.js';

import { CHART_TYPES, FORMATS, WIDTHS, normalizeSpec, DashboardError } from '../../shared/dashboardSpec.js';

export { normalizeSpec, DashboardError };

export const DASHBOARD_TOOL = {
  name: 'criar_dashboard',
  description:
    'Cria um dashboard profissional e visual (painel com indicadores em destaque, gráficos, tabelas e conclusões) na plataforma, no tema da marca, e devolve o link. Use sempre que pedirem um dashboard, painel, relatório visual ou análise de dados para apresentar; prefira isto a uma planilha quando o objetivo for mostrar resultados. Monte com cuidado: 3 a 6 indicadores principais no topo (valores já formatados, ex.: "R$ 14,21 mi", "84.174", "6,9%"); gráficos com o tipo certo para cada pergunta (barras para comparar categorias ou meses, linha ou área para evolução no tempo, barras horizontais para rankings com nomes longos, rosca só para partes de um todo com até 6 fatias); uma tabela com o detalhe; e de 3 a 5 conclusões objetivas com números. Os valores dos gráficos são números puros (sem "R$" nem pontos de milhar); o formato define como aparecem.',
  input_schema: {
    type: 'object',
    properties: {
      titulo: { type: 'string', description: 'Título do dashboard, ex.: "Performance comercial e financeira".' },
      subtitulo: { type: 'string', description: 'Uma frase explicando o que o painel mostra.' },
      periodo: { type: 'string', description: 'Período analisado, ex.: "nov/2025 a out/2026".' },
      fonte: { type: 'string', description: 'De onde vieram os dados, ex.: "Planilha de vendas 2026".' },
      indicadores: {
        type: 'array',
        description: 'Indicadores em destaque no topo (3 a 6).',
        items: {
          type: 'object',
          properties: {
            rotulo: { type: 'string', description: 'Nome do indicador, ex.: "Faturamento total".' },
            valor: { type: 'string', description: 'Valor já formatado, ex.: "R$ 20,09 mi".' },
            detalhe: { type: 'string', description: 'Contexto curto, ex.: "Soma dos 12 meses".' },
            tendencia: { type: 'string', enum: ['alta', 'queda', 'estavel'] },
            texto_tendencia: { type: 'string', description: 'Ex.: "+83% no período".' },
          },
          required: ['rotulo', 'valor'],
        },
      },
      graficos: {
        type: 'array',
        description: 'Gráficos do painel.',
        items: {
          type: 'object',
          properties: {
            tipo: { type: 'string', enum: CHART_TYPES },
            titulo: { type: 'string' },
            subtitulo: { type: 'string', description: 'Opcional: o que observar no gráfico.' },
            formato: { type: 'string', enum: FORMATS, description: 'Como mostrar os valores: moeda (R$), numero ou percentual.' },
            largura: { type: 'string', enum: WIDTHS, description: 'inteira para o gráfico principal; metade para os demais.' },
            rotulos: { type: 'array', items: { type: 'string' }, description: 'Categorias do eixo (meses, produtos, regiões...).' },
            series: {
              type: 'array',
              description: 'Uma série para a maioria dos gráficos; até 6 para comparar. Nunca misture grandezas diferentes no mesmo gráfico.',
              items: {
                type: 'object',
                properties: { nome: { type: 'string' }, valores: { type: 'array', items: { type: 'number' } } },
                required: ['nome', 'valores'],
              },
            },
          },
          required: ['tipo', 'titulo', 'rotulos', 'series'],
        },
      },
      tabelas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            titulo: { type: 'string' },
            colunas: { type: 'array', items: { type: 'string' } },
            linhas: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Valores já formatados.' },
          },
          required: ['colunas', 'linhas'],
        },
      },
      conclusoes: { type: 'array', items: { type: 'string' }, description: 'De 3 a 5 conclusões objetivas, com números.' },
    },
    required: ['titulo'],
  },
};

export async function createDashboard({ orgId, agentId = null, conversationId = null, spec }) {
  const row = await db.get(
    'INSERT INTO dashboards (org_id, agent_id, conversation_id, title, spec) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [orgId, agentId, conversationId, spec.title, json(spec)],
  );
  return row.id;
}

export async function runDashboardTool(ctx, block) {
  const base = { type: 'tool_result', tool_use_id: block.id };
  let spec;
  try {
    spec = normalizeSpec(block.input || {});
  } catch (err) {
    if (err instanceof DashboardError) return { result: { ...base, is_error: true, content: err.message } };
    throw err;
  }
  const id = await createDashboard({ orgId: ctx.orgId, agentId: ctx.agentId, conversationId: ctx.conversationId, spec });
  const org = await db.get('SELECT p.* FROM organizations o JOIN partners p ON p.id = o.partner_id WHERE o.id = $1', [ctx.orgId]);
  const url = `${await partnerBaseUrl(org)}/app/dashboards/${id}`;
  return {
    run: { id: `dash-${id}`, label: `Dashboard: ${spec.title}`, status: 'executada', link: `/app/dashboards/${id}` },
    result: {
      ...base,
      content: `Dashboard criado: ${url}\nInforme esse link na resposta como [Abrir o dashboard](${url}). Na tela, a equipe pode compartilhar um link público e baixar em PDF.`,
    },
  };
}

export const newShareToken = () => randomBytes(18).toString('base64url');
