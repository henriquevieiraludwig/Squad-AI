// Exemplo de dashboard (dados da planilha "Relatório anual de vendas"), no formato que o agente envia.
// Usado na demonstração e nos testes de tela.
const MESES = ['nov/25', 'dez/25', 'jan/26', 'fev/26', 'mar/26', 'abr/26', 'mai/26', 'jun/26', 'jul/26', 'ago/26', 'set/26', 'out/26'];

export const SAMPLE_DASHBOARD_INPUT = {
  titulo: 'Performance comercial e financeira',
  subtitulo: 'Vendas, faturamento líquido e descontos dos últimos 12 meses.',
  periodo: 'nov/2025 a out/2026',
  fonte: 'Relatório anual de vendas',
  indicadores: [
    { rotulo: 'Faturamento líquido', valor: 'R$ 20,09 mi', detalhe: 'Soma dos 12 meses', tendencia: 'alta', texto_tendencia: '+83% no período' },
    { rotulo: 'Vendas', valor: '1.321', detalhe: 'Média de 110 por mês', tendencia: 'alta', texto_tendencia: '+159%' },
    { rotulo: 'Ticket médio', valor: 'R$ 15.208', detalhe: 'Valor líquido por venda' },
    { rotulo: 'Desconto médio', valor: '6,88%', detalhe: 'R$ 1,48 mi concedidos', tendencia: 'estavel', texto_tendencia: 'estável' },
  ],
  graficos: [
    {
      tipo: 'barras',
      titulo: 'Evolução do faturamento líquido',
      subtitulo: 'Quedas em jan, mar e jul/26; recorde em out/26.',
      formato: 'moeda',
      largura: 'inteira',
      rotulos: MESES,
      series: [{ nome: 'Faturamento líquido', valores: [1397598, 1473127.25, 920082.5, 1228874.25, 1218032.75, 1228970.75, 1803455.25, 2101785.5, 1767356.25, 2080554.5, 2306926.75, 2563133.75] }],
    },
    {
      tipo: 'area',
      titulo: 'Quantidade de vendas por mês',
      formato: 'numero',
      rotulos: MESES,
      series: [{ nome: 'Vendas', valores: [64, 80, 75, 88, 95, 108, 104, 123, 137, 130, 151, 166] }],
    },
    {
      tipo: 'rosca',
      titulo: 'Faturamento por trimestre',
      formato: 'moeda',
      rotulos: ['T1 (nov–jan)', 'T2 (fev–abr)', 'T3 (mai–jul)', 'T4 (ago–out)'],
      series: [{ nome: 'Faturamento', valores: [3790807.75, 3675877.75, 5672597, 6950615] }],
    },
    {
      tipo: 'linha',
      titulo: 'Ticket médio por mês',
      formato: 'moeda',
      rotulos: MESES,
      series: [{ nome: 'Ticket médio', valores: [21837.47, 18414.09, 12267.77, 13964.48, 12821.4, 11379.36, 17340.92, 17087.69, 12900.41, 16004.27, 15277.66, 15440.56] }],
    },
    {
      tipo: 'barras_horizontais',
      titulo: 'Desconto concedido por trimestre',
      formato: 'moeda',
      rotulos: ['T4 (ago–out)', 'T3 (mai–jul)', 'T2 (fev–abr)', 'T1 (nov–jan)'],
      series: [{ nome: 'Desconto', valores: [503006, 410293, 277808, 292910] }],
    },
  ],
  conclusoes: [
    'O faturamento líquido cresceu 83%, de R$ 1,40 mi em nov/25 para R$ 2,56 mi em out/26, puxado pelo número de vendas (de 64 para 166).',
    'O 2º semestre faturou R$ 12,62 mi contra R$ 7,47 mi do 1º, um aumento de 69%.',
    'O ticket médio caiu de R$ 21,8 mil para R$ 15,4 mil: a empresa vende mais, porém em vendas menores.',
    'Houve quedas em jan, mar e jul/26; a pior foi jan/26 (R$ 920 mil). Vale planejar campanhas para esses meses.',
  ],
  tabelas: [
    {
      titulo: 'Resultado por trimestre',
      colunas: ['Trimestre', 'Meses', 'Vendas', 'Valor líquido', '% do total', 'Ticket médio'],
      linhas: [
        ['T1', 'nov/25 a jan/26', '219', 'R$ 3.790.807,75', '18,9%', 'R$ 17.309,62'],
        ['T2', 'fev/26 a abr/26', '291', 'R$ 3.675.877,75', '18,3%', 'R$ 12.631,88'],
        ['T3', 'mai/26 a jul/26', '364', 'R$ 5.672.597,00', '28,2%', 'R$ 15.584,06'],
        ['T4', 'ago/26 a out/26', '447', 'R$ 6.950.615,00', '34,6%', 'R$ 15.549,47'],
      ],
    },
  ],
};
