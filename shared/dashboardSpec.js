// Regras do formato de dashboard que o agente envia (usadas pelo servidor e pela demonstração).
export const CHART_TYPES = ['barras', 'barras_horizontais', 'linha', 'area', 'rosca'];
export const FORMATS = ['moeda', 'numero', 'percentual'];
export const WIDTHS = ['inteira', 'metade'];

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export class DashboardError extends Error {}

// Normaliza o que o agente mandou: corta excessos e garante tipos, para a tela nunca quebrar.
export function normalizeSpec(input = {}) {
  const title = str(input.titulo, 120);
  if (!title) throw new DashboardError('Dê um título ao dashboard.');
  const kpis = (Array.isArray(input.indicadores) ? input.indicadores : []).slice(0, 6).map((k) => ({
    label: str(k.rotulo, 60),
    value: str(k.valor, 24),
    detail: str(k.detalhe, 70),
    trend: ['alta', 'queda', 'estavel'].includes(k.tendencia) ? k.tendencia : null,
    trendText: str(k.texto_tendencia, 28),
  })).filter((k) => k.label && k.value);

  const charts = (Array.isArray(input.graficos) ? input.graficos : []).slice(0, 10).map((c) => {
    const labels = (Array.isArray(c.rotulos) ? c.rotulos : []).slice(0, 60).map((l) => str(l, 40));
    const series = (Array.isArray(c.series) ? c.series : []).slice(0, 6).map((s) => ({
      name: str(s.nome, 50) || 'Série',
      data: labels.map((_, i) => num((s.valores || [])[i])),
    }));
    return {
      type: CHART_TYPES.includes(c.tipo) ? c.tipo : 'barras',
      title: str(c.titulo, 80),
      subtitle: str(c.subtitulo, 140),
      format: FORMATS.includes(c.formato) ? c.formato : 'numero',
      width: WIDTHS.includes(c.largura) ? c.largura : 'metade',
      labels,
      series,
    };
  }).filter((c) => c.labels.length && c.series.length);

  const tables = (Array.isArray(input.tabelas) ? input.tabelas : []).slice(0, 4).map((t) => {
    const columns = (Array.isArray(t.colunas) ? t.colunas : []).slice(0, 10).map((c) => str(c, 40));
    const rows = (Array.isArray(t.linhas) ? t.linhas : []).slice(0, 200).map((r) => columns.map((_, i) => str((r || [])[i], 80)));
    return { title: str(t.titulo, 80), columns, rows };
  }).filter((t) => t.columns.length && t.rows.length);

  const insights = (Array.isArray(input.conclusoes) ? input.conclusoes : []).slice(0, 8).map((x) => str(x, 400)).filter(Boolean);

  if (!kpis.length && !charts.length && !tables.length) throw new DashboardError('O dashboard precisa de pelo menos um indicador, gráfico ou tabela.');
  return { title, subtitle: str(input.subtitulo, 200), period: str(input.periodo, 60), source: str(input.fonte, 120), kpis, charts, tables, insights };
}

