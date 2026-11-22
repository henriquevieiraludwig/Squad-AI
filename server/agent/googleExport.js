// Exporta um dashboard para o Google: Planilhas (painel com gráficos nativos, no tema da marca)
// e Apresentações (um slide por parte do painel, com os gráficos ligados à planilha).
import { request } from '../connectors/http.js';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const SLIDES = 'https://slides.googleapis.com/v1/presentations';
const P = 'Google Workspace';

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
};
const C = {
  bg: hex('#10271E'),
  card: hex('#183A2B'),
  ink: hex('#EEF4EE'),
  soft: hex('#A9BDB0'),
  faint: hex('#7E9587'),
  lime: hex('#B8F479'),
  down: hex('#FF9B8C'),
};
// Mesma paleta dos gráficos da plataforma (validada para daltonismo).
const SERIES = ['#6CA82C', '#3A86D6', '#C98118', '#A375E8', '#DC5644', '#17A08E'].map(hex);
const SINGLE = hex('#B8F479');

const NUMBER_FORMAT = {
  moeda: { type: 'CURRENCY', pattern: '"R$" #,##0' },
  percentual: { type: 'NUMBER', pattern: '0.0"%"' },
  numero: { type: 'NUMBER', pattern: '#,##0' },
};
const CHART_TYPE = { barras: 'COLUMN', barras_horizontais: 'BAR', linha: 'LINE', area: 'AREA' };
const trendColor = (t) => (t === 'alta' ? C.lime : t === 'queda' ? C.down : C.soft);

// ---------- Planilhas ----------

const COLS = 12;
const COL_PX = 110;
const ROW_PX = 21;
const CHART_H = 360;
const BAND_ROWS = Math.ceil((CHART_H + 18) / ROW_PX);

const text = (color, size = 10, bold = false, family = 'Inter') => ({ foregroundColor: color, fontSize: size, bold, fontFamily: family });
const fmt = (bg, t, extra = {}) => ({ backgroundColor: bg, textFormat: t, verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP', ...extra });
const cell = (value, format) => ({
  userEnteredValue: typeof value === 'number' ? { numberValue: value } : { stringValue: String(value ?? '') },
  userEnteredFormat: format,
});
const range = (sheetId, r0, r1, c0, c1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });

// Agrupa os gráficos em faixas: inteiro ocupa a faixa sozinho; dois "metade" dividem uma faixa.
export function chartBands(charts) {
  const bands = [];
  let open = null;
  charts.forEach((c, i) => {
    if (c.width === 'inteira') {
      bands.push([i]);
      open = null;
    } else if (open) {
      open.push(i);
      open = null;
    } else {
      open = [i];
      bands.push(open);
    }
  });
  return bands;
}

function chartSpec(c, sheetId) {
  const n = c.labels.length;
  const src = (col) => ({ sourceRange: { sources: [range(sheetId, 0, n + 1, col, col + 1)] } });
  const base = {
    title: c.title,
    subtitle: c.subtitle || undefined,
    fontName: 'Inter',
    titleTextFormat: { foregroundColorStyle: { rgbColor: C.ink }, bold: true, fontSize: 13, fontFamily: 'Inter' },
    subtitleTextFormat: { foregroundColorStyle: { rgbColor: C.soft }, fontSize: 10, fontFamily: 'Inter' },
    backgroundColorStyle: { rgbColor: C.card },
  };
  if (c.type === 'rosca') {
    return { ...base, pieChart: { legendPosition: 'RIGHT_LEGEND', domain: src(0), series: src(1), pieHole: 0.5 } };
  }
  const horizontal = c.type === 'barras_horizontais';
  const axisFmt = { foregroundColorStyle: { rgbColor: C.soft }, fontSize: 10, fontFamily: 'Inter' };
  return {
    ...base,
    basicChart: {
      chartType: CHART_TYPE[c.type] || 'COLUMN',
      legendPosition: c.series.length > 1 ? 'BOTTOM_LEGEND' : 'NO_LEGEND',
      headerCount: 1,
      axis: [
        { position: 'BOTTOM_AXIS', format: axisFmt },
        { position: 'LEFT_AXIS', format: axisFmt },
      ],
      domains: [{ domain: src(0) }],
      series: c.series.map((s, i) => ({
        series: src(i + 1),
        targetAxis: horizontal ? 'BOTTOM_AXIS' : 'LEFT_AXIS',
        colorStyle: { rgbColor: c.series.length === 1 ? SINGLE : SERIES[i % SERIES.length] },
        ...(c.type === 'linha' ? { lineStyle: { width: 3 } } : {}),
      })),
    },
  };
}

// Monta a criação da planilha e o batchUpdate com valores, formatação e gráficos.
export function buildSheetsRequests(spec) {
  const dataSheetId = (i) => 100 + i;
  const chartId = (i) => 1000 + i;
  const sheets = [
    { properties: { sheetId: 0, title: 'Dashboard', gridProperties: { hideGridlines: true, rowCount: 400, columnCount: COLS }, tabColorStyle: { rgbColor: C.lime } } },
    ...spec.charts.map((c, i) => ({
      properties: { sheetId: dataSheetId(i), title: `Dados ${i + 1}`, gridProperties: { rowCount: Math.max(c.labels.length + 5, 20), columnCount: Math.max(c.series.length + 1, 4), frozenRowCount: 1 } },
    })),
  ];

  const reqs = [];
  const rows = []; // [rowIndex, cells[] (12 colunas)]
  const merges = [];
  const heights = [];
  const blank = fmt(C.bg, text(C.ink));
  const putRow = (r, cells, h) => {
    rows.push([r, cells]);
    if (h) heights.push([r, h]);
  };
  const fullRow = (r, value, format, h) => {
    putRow(r, [cell(value, format), ...Array.from({ length: COLS - 1 }, () => cell('', format))], h);
    merges.push(range(0, r, r + 1, 0, COLS));
  };

  let r = 0;
  fullRow(r++, spec.title, fmt(C.bg, text(C.ink, 22, true)), 48);
  if (spec.subtitle) fullRow(r++, spec.subtitle, fmt(C.bg, text(C.soft, 11)), 28);
  const meta = [spec.period, spec.source].filter(Boolean).join('  ·  ').toUpperCase();
  if (meta) fullRow(r++, meta, fmt(C.bg, text(C.lime, 9, false, 'Roboto Mono')), 24);
  r++;

  // Indicadores: cada um é um cartão de 3 linhas (rótulo, valor, detalhe).
  if (spec.kpis.length) {
    const span = Math.floor(COLS / spec.kpis.length);
    const card = (t, align = 'LEFT') => fmt(C.card, t, { horizontalAlignment: align, padding: { left: 12, right: 12 } });
    const lines = [[], [], []];
    for (let c = 0; c < COLS; c++) {
      const k = spec.kpis[Math.floor(c / span)];
      const first = c % span === 0;
      if (!k) {
        lines.forEach((l) => l.push(cell('', blank)));
        continue;
      }
      const detail = [k.detail, k.trendText].filter(Boolean).join('  ·  ');
      lines[0].push(cell(first ? k.label : '', card(text(C.soft, 10))));
      lines[1].push(cell(first ? k.value : '', card(text(C.lime, 20, true))));
      lines[2].push(cell(first ? detail : '', card(text(k.trend ? trendColor(k.trend) : C.faint, 9))));
    }
    spec.kpis.forEach((_, i) => {
      for (let j = 0; j < 3; j++) merges.push(range(0, r + j, r + j + 1, i * span, i * span + span - 1));
    });
    putRow(r, lines[0], 30);
    putRow(r + 1, lines[1], 40);
    putRow(r + 2, lines[2], 28);
    r += 4;
  }

  // Gráficos nativos sobre o painel, alimentados pelas abas de dados.
  const fullPx = COLS * COL_PX;
  const halfPx = Math.floor((fullPx - 12) / 2);
  for (const band of chartBands(spec.charts)) {
    band.forEach((ci, pos) => {
      const c = spec.charts[ci];
      const wide = band.length === 1 && c.width === 'inteira';
      reqs.push({
        addChart: {
          chart: {
            chartId: chartId(ci),
            spec: chartSpec(c, dataSheetId(ci)),
            position: {
              overlayPosition: {
                anchorCell: { sheetId: 0, rowIndex: r, columnIndex: 0 },
                offsetXPixels: pos === 0 ? 0 : halfPx + 12,
                offsetYPixels: 0,
                widthPixels: wide ? fullPx : halfPx,
                heightPixels: CHART_H,
              },
            },
          },
        },
      });
    });
    for (let j = 0; j < BAND_ROWS; j++) heights.push([r + j, ROW_PX]);
    r += BAND_ROWS;
  }

  if (spec.insights.length) {
    fullRow(r++, 'Conclusões', fmt(C.bg, text(C.ink, 14, true)), 34);
    spec.insights.forEach((x) => fullRow(r++, `●  ${x}`, fmt(C.card, text(C.ink, 10), { padding: { left: 12, right: 12 } }), 36));
    r++;
  }

  for (const t of spec.tables) {
    if (t.title) fullRow(r++, t.title, fmt(C.bg, text(C.ink, 14, true)), 34);
    const padCells = (arr, format) => [...arr.map((v) => cell(v, format)), ...Array.from({ length: COLS - arr.length }, () => cell('', blank))];
    putRow(r++, padCells(t.columns.map((x) => x.toUpperCase()), fmt(C.card, text(C.faint, 9, true, 'Roboto Mono'))), 28);
    t.rows.forEach((row) => putRow(r++, padCells(row, fmt(C.card, text(C.ink, 10))), 24));
    r++;
  }

  // Fundo verde-floresta em toda a área usada, antes dos conteúdos.
  reqs.unshift(
    { repeatCell: { range: range(0, 0, Math.max(r + 10, 60), 0, COLS), cell: { userEnteredFormat: blank }, fields: 'userEnteredFormat' } },
    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 0, endIndex: COLS }, properties: { pixelSize: COL_PX }, fields: 'pixelSize' } },
    ...rows.map(([ri, cells]) => ({
      updateCells: { start: { sheetId: 0, rowIndex: ri, columnIndex: 0 }, rows: [{ values: cells }], fields: 'userEnteredValue,userEnteredFormat' },
    })),
    ...merges.map((m) => ({ mergeCells: { range: m, mergeType: 'MERGE_ALL' } })),
    ...heights.map(([ri, px]) => ({
      updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: ri, endIndex: ri + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' },
    })),
  );

  // Abas de dados (fonte dos gráficos), com o mesmo formato de número do painel.
  spec.charts.forEach((c, i) => {
    const head = fmt(C.bg, text(C.lime, 10, true));
    const num = { numberFormat: NUMBER_FORMAT[c.format] || NUMBER_FORMAT.numero, textFormat: { fontFamily: 'Inter', fontSize: 10 } };
    const data = [
      { values: [cell(c.title || 'Categoria', head), ...c.series.map((s) => cell(s.name, head))] },
      ...c.labels.map((l, li) => ({ values: [cell(l, { textFormat: { fontFamily: 'Inter', fontSize: 10 } }), ...c.series.map((s) => cell(s.data[li], num))] })),
    ];
    reqs.push(
      { updateCells: { start: { sheetId: dataSheetId(i), rowIndex: 0, columnIndex: 0 }, rows: data, fields: 'userEnteredValue,userEnteredFormat' } },
      { autoResizeDimensions: { dimensions: { sheetId: dataSheetId(i), dimension: 'COLUMNS', startIndex: 0, endIndex: c.series.length + 1 } } },
    );
  });

  return {
    create: { properties: { title: spec.title, locale: 'pt_BR', timeZone: 'America/Sao_Paulo' }, sheets },
    requests: reqs,
    chartIds: spec.charts.map((_, i) => chartId(i)),
  };
}

export async function exportToSheets(token, spec) {
  const { create, requests, chartIds } = buildSheetsRequests(spec);
  const created = await request(SHEETS, { method: 'POST', token, body: create, provider: P });
  await request(`${SHEETS}/${created.spreadsheetId}:batchUpdate`, { method: 'POST', token, body: { requests }, provider: P });
  return {
    spreadsheetId: created.spreadsheetId,
    chartIds,
    url: created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${created.spreadsheetId}/edit`,
  };
}

// ---------- Apresentações ----------

const EMU = 12700; // 1 pt
const W = 720 * EMU; // 10 pol
const H = 405 * EMU; // 5,625 pol (16:9)

export function buildSlidesRequests(spec, { spreadsheetId, chartIds }) {
  const reqs = [];
  let n = 0;
  const id = (p) => `z${p}_${++n}`;
  const box = (page, x, y, w, h) => ({
    pageObjectId: page,
    size: { width: { magnitude: w * EMU, unit: 'EMU' }, height: { magnitude: h * EMU, unit: 'EMU' } },
    transform: { scaleX: 1, scaleY: 1, translateX: x * EMU, translateY: y * EMU, unit: 'EMU' },
  });
  const slide = () => {
    const s = id('s');
    reqs.push(
      { createSlide: { objectId: s, slideLayoutReference: { predefinedLayout: 'BLANK' } } },
      { updatePageProperties: { objectId: s, pageProperties: { pageBackgroundFill: { solidFill: { color: { rgbColor: C.bg } } } }, fields: 'pageBackgroundFill.solidFill.color' } },
    );
    return s;
  };
  const textBox = (page, value, [x, y, w, h], { color = C.ink, size = 14, bold = false, family = 'Inter', align = 'START' } = {}) => {
    if (!value) return null;
    const o = id('t');
    reqs.push(
      { createShape: { objectId: o, shapeType: 'TEXT_BOX', elementProperties: box(page, x, y, w, h) } },
      { insertText: { objectId: o, text: value } },
      {
        updateTextStyle: {
          objectId: o,
          textRange: { type: 'ALL' },
          style: { foregroundColor: { opaqueColor: { rgbColor: color } }, fontFamily: family, fontSize: { magnitude: size, unit: 'PT' }, bold },
          fields: 'foregroundColor,fontFamily,fontSize,bold',
        },
      },
      { updateParagraphStyle: { objectId: o, textRange: { type: 'ALL' }, style: { alignment: align }, fields: 'alignment' } },
    );
    return o;
  };
  const rect = (page, [x, y, w, h], color = C.card) => {
    const o = id('r');
    reqs.push(
      { createShape: { objectId: o, shapeType: 'ROUND_RECTANGLE', elementProperties: box(page, x, y, w, h) } },
      {
        updateShapeProperties: {
          objectId: o,
          shapeProperties: { shapeBackgroundFill: { solidFill: { color: { rgbColor: color } } }, outline: { propertyState: 'NOT_RENDERED' } },
          fields: 'shapeBackgroundFill.solidFill.color,outline.propertyState',
        },
      },
    );
    return o;
  };
  const eyebrow = (page, value) => textBox(page, value.toUpperCase(), [40, 26, 640, 18], { color: C.lime, size: 9, family: 'Roboto Mono' });

  // Capa
  const cover = slide();
  rect(cover, [40, 150, 56, 6], C.lime);
  textBox(cover, [spec.period].filter(Boolean).join('').toUpperCase(), [40, 110, 640, 20], { color: C.lime, size: 11, family: 'Roboto Mono' });
  textBox(cover, spec.title, [40, 170, 640, 90], { size: 34, bold: true });
  textBox(cover, spec.subtitle, [40, 262, 640, 60], { color: C.soft, size: 15 });
  textBox(cover, spec.source && `Fonte: ${spec.source}`, [40, 360, 640, 20], { color: C.faint, size: 10 });

  // Indicadores
  if (spec.kpis.length) {
    const s = slide();
    eyebrow(s, spec.period || 'Resumo');
    textBox(s, 'Indicadores principais', [40, 44, 640, 36], { size: 22, bold: true });
    const k = spec.kpis.length;
    const cols = k <= 3 ? k : Math.ceil(k / 2);
    const rowsN = Math.ceil(k / cols);
    const gap = 14;
    const cw = (640 - gap * (cols - 1)) / cols;
    const ch = rowsN === 1 ? 170 : 128;
    const top = rowsN === 1 ? 130 : 100;
    spec.kpis.forEach((kp, i) => {
      const x = 40 + (i % cols) * (cw + gap);
      const y = top + Math.floor(i / cols) * (ch + gap);
      rect(s, [x, y, cw, ch]);
      textBox(s, kp.label, [x + 14, y + 12, cw - 28, 20], { color: C.soft, size: 11 });
      textBox(s, kp.value, [x + 14, y + 36, cw - 28, 44], { color: C.lime, size: cols >= 3 ? 24 : 30, bold: true });
      textBox(s, kp.detail, [x + 14, y + ch - 48, cw - 28, 18], { color: C.faint, size: 10 });
      textBox(s, kp.trendText, [x + 14, y + ch - 28, cw - 28, 18], { color: trendColor(kp.trend), size: 10, bold: true });
    });
  }

  // Um slide por gráfico, ligado à planilha (atualiza se a planilha mudar).
  spec.charts.forEach((c, i) => {
    const s = slide();
    eyebrow(s, spec.title);
    textBox(s, c.title, [40, 44, 640, 30], { size: 20, bold: true });
    textBox(s, c.subtitle, [40, 74, 640, 22], { color: C.soft, size: 11 });
    reqs.push({
      createSheetsChart: {
        objectId: id('c'),
        spreadsheetId,
        chartId: chartIds[i],
        linkingMode: 'LINKED',
        elementProperties: box(s, 40, 102, 640, 280),
      },
    });
  });

  // Conclusões
  if (spec.insights.length) {
    const s = slide();
    eyebrow(s, spec.title);
    textBox(s, 'Conclusões', [40, 44, 640, 36], { size: 22, bold: true });
    rect(s, [40, 96, 640, 280]);
    const t = textBox(s, spec.insights.join('\n'), [60, 110, 600, 252], { size: spec.insights.length > 4 ? 13 : 15 });
    reqs.push(
      { createParagraphBullets: { objectId: t, textRange: { type: 'ALL' }, bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE' } },
      { updateParagraphStyle: { objectId: t, textRange: { type: 'ALL' }, style: { spaceBelow: { magnitude: 10, unit: 'PT' }, lineSpacing: 120 }, fields: 'spaceBelow,lineSpacing' } },
    );
  }

  // Tabelas (até 10 linhas por slide, o resto continua nos slides seguintes).
  for (const tb of spec.tables) {
    if (!tb.columns.length) continue;
    for (let start = 0; start < Math.max(tb.rows.length, 1); start += 10) {
      const part = tb.rows.slice(start, start + 10);
      const s = slide();
      eyebrow(s, spec.title);
      textBox(s, tb.title || 'Detalhe', [40, 44, 640, 30], { size: 20, bold: true });
      const tid = id('tb');
      const nr = part.length + 1;
      reqs.push({ createTable: { objectId: tid, rows: nr, columns: tb.columns.length, elementProperties: box(s, 40, 90, 640, Math.min(24 * nr, 290)) } });
      const fill = (r0, span, color) => ({
        updateTableCellProperties: {
          objectId: tid,
          tableRange: { location: { rowIndex: r0, columnIndex: 0 }, rowSpan: span, columnSpan: tb.columns.length },
          tableCellProperties: { tableCellBackgroundFill: { solidFill: { color: { rgbColor: color } } } },
          fields: 'tableCellBackgroundFill.solidFill.color',
        },
      });
      reqs.push(fill(0, 1, C.bg));
      if (part.length) reqs.push(fill(1, part.length, C.card));
      [tb.columns.map((x) => x.toUpperCase()), ...part].forEach((row, ri) =>
        row.forEach((v, ci) => {
          if (!v) return;
          const loc = { rowIndex: ri, columnIndex: ci };
          reqs.push(
            { insertText: { objectId: tid, cellLocation: loc, text: v } },
            {
              updateTextStyle: {
                objectId: tid,
                cellLocation: loc,
                textRange: { type: 'ALL' },
                style: {
                  foregroundColor: { opaqueColor: { rgbColor: ri === 0 ? C.faint : C.ink } },
                  fontFamily: ri === 0 ? 'Roboto Mono' : 'Inter',
                  fontSize: { magnitude: ri === 0 ? 8 : 10, unit: 'PT' },
                  bold: ri === 0,
                },
                fields: 'foregroundColor,fontFamily,fontSize,bold',
              },
            },
          );
        }),
      );
    }
  }
  return reqs;
}

export async function exportToSlides(token, spec) {
  const sheet = await exportToSheets(token, spec);
  const pres = await request(SLIDES, { method: 'POST', token, body: { title: spec.title }, provider: P });
  const requests = buildSlidesRequests(spec, sheet);
  // Remove o slide em branco que vem na apresentação nova.
  for (const s of pres.slides || []) requests.push({ deleteObject: { objectId: s.objectId } });
  await request(`${SLIDES}/${pres.presentationId}:batchUpdate`, { method: 'POST', token, body: { requests }, provider: P });
  return { url: `https://docs.google.com/presentation/d/${pres.presentationId}/edit`, sheetUrl: sheet.url };
}
