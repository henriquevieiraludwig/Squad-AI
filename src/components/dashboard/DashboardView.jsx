import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './dashboard.css';

// Paleta para várias séries, validada para fundo escuro (faixa de luminosidade, daltonismo e contraste).
// Uma série só usa o verde-limão da marca.
const SERIES = ['#6CA82C', '#3A86D6', '#C98118', '#A375E8', '#DC5644', '#17A08E'];
const LIME = '#B8F479';
const colorOf = (series, i) => (series.length === 1 ? LIME : SERIES[i % SERIES.length]);

// ---------- Formatos ----------
const nf = (d = 0) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
function compact(v, format) {
  const a = Math.abs(v);
  let s;
  if (format === 'percentual') return `${nf(a < 10 ? 1 : 0).format(v)}%`;
  if (a >= 1e9) s = `${nf(1).format(v / 1e9)} bi`;
  else if (a >= 1e6) s = `${nf(a >= 1e8 ? 0 : 1).format(v / 1e6)} mi`;
  else if (a >= 1e3) s = `${nf(a >= 1e5 ? 0 : 1).format(v / 1e3)} mil`;
  else s = nf(Number.isInteger(v) ? 0 : 1).format(v);
  return format === 'moeda' ? `R$ ${s}` : s;
}
function full(v, format) {
  if (format === 'percentual') return `${nf(2).format(v)}%`;
  if (format === 'moeda') return `R$ ${nf(2).format(v)}`;
  return nf(Number.isInteger(v) ? 0 : 2).format(v);
}

// Teto do eixo: o maior valor com um pouco de folga, arredondado para um número "redondo" próximo.
function niceMax(max) {
  if (max <= 0) return 1;
  const target = max * 1.08;
  const exp = 10 ** Math.floor(Math.log10(target));
  const f = target / exp;
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => x >= f);
  return step * exp;
}

// Quantos rótulos do eixo cabem sem encostar (cerca de 52px cada).
const labelEvery = (count, width) => Math.max(1, Math.ceil(count / Math.max(2, Math.floor(width / 52))));

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <div className="dash-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <strong>{tip.title}</strong>
      {tip.rows.map((r) => (
        <span key={r.name} className="dash-tip-row">
          <i style={{ background: r.color }} />
          {r.name && <span>{r.name}</span>}
          <b>{r.value}</b>
        </span>
      ))}
    </div>
  );
}

function Legend({ series }) {
  if (series.length < 2) return null;
  return (
    <ul className="dash-legend">
      {series.map((s, i) => (
        <li key={s.name}>
          <i style={{ background: colorOf(series, i) }} />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

// Barra com topo arredondado (4px) e base reta no eixo.
function barPath(x, y, w, h, r = 4) {
  const rr = Math.min(r, w / 2, h);
  if (h <= 0) return '';
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

// ---------- Barras verticais (e agrupadas) ----------
function BarChart({ chart }) {
  const [ref, W] = useWidth();
  const [tip, setTip] = useState(null);
  const { labels, series, format } = chart;
  const H = 280;
  const pad = { t: 28, r: 8, b: 30, l: 8 };
  const max = niceMax(Math.max(...series.flatMap((s) => s.data), 0));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const band = innerW / labels.length;
  const groupW = band * (series.length > 1 ? 0.78 : 0.62);
  const barW = Math.max(2, (groupW - (series.length - 1) * 2) / series.length);
  const showValues = series.length === 1 && labels.length <= 14 && band > 34;
  const y = (v) => pad.t + innerH - (Math.max(0, v) / max) * innerH;
  return (
    <div className="dash-chart-body" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg width={W} height={H} role="img" aria-label={chart.title}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} className="dash-grid" />
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="dash-axis" />
        {labels.map((l, i) => {
          const gx = pad.l + i * band + (band - groupW) / 2;
          return (
            <g key={l + i}>
              {series.map((s, si) => {
                const v = s.data[i];
                const x = gx + si * (barW + 2);
                return <path key={s.name} d={barPath(x, y(v), barW, y(0) - y(v))} fill={colorOf(series, si)} />;
              })}
              {showValues && (
                <text x={gx + groupW / 2} y={y(series[0].data[i]) - 8} className="dash-value" textAnchor="middle">
                  {compact(series[0].data[i], format)}
                </text>
              )}
              {i % labelEvery(labels.length, innerW) === 0 && (
                <text x={pad.l + i * band + band / 2} y={H - 10} className="dash-label" textAnchor="middle">
                  {l.length > 10 ? `${l.slice(0, 9)}…` : l}
                </text>
              )}
              <rect
                x={pad.l + i * band}
                y={pad.t}
                width={band}
                height={innerH}
                fill="transparent"
                onMouseMove={(e) => {
                  const box = ref.current.getBoundingClientRect();
                  setTip({ x: e.clientX - box.left, y: e.clientY - box.top, title: l, rows: series.map((s, si) => ({ name: series.length > 1 ? s.name : '', color: colorOf(series, si), value: full(s.data[i], format) })) });
                }}
              />
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
      <Legend series={series} />
    </div>
  );
}

// ---------- Barras horizontais (ranking) ----------
function HBarChart({ chart }) {
  const [ref, W] = useWidth();
  const [tip, setTip] = useState(null);
  const { labels, series, format } = chart;
  const s = series[0];
  const rowH = 34;
  const labelW = Math.min(170, W * 0.36);
  const H = labels.length * rowH + 8;
  const max = Math.max(...s.data, 0) || 1;
  const barMax = W - labelW - 80;
  return (
    <div className="dash-chart-body" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg width={W} height={H} role="img" aria-label={chart.title}>
        {labels.map((l, i) => {
          const v = s.data[i];
          const w = (Math.max(0, v) / max) * barMax;
          const yy = i * rowH + 6;
          return (
            <g
              key={l + i}
              onMouseMove={(e) => {
                const box = ref.current.getBoundingClientRect();
                setTip({ x: e.clientX - box.left, y: e.clientY - box.top, title: l, rows: [{ name: '', color: LIME, value: full(v, format) }] });
              }}
            >
              <rect x="0" y={yy - 4} width={W} height={rowH} fill="transparent" />
              <text x={labelW - 10} y={yy + 15} className="dash-label" textAnchor="end">
                {l.length > 22 ? `${l.slice(0, 21)}…` : l}
              </text>
              <path d={`M${labelW},${yy + 4}H${labelW + Math.max(0, w - 4)}Q${labelW + w},${yy + 4} ${labelW + w},${yy + 8}V${yy + 18}Q${labelW + w},${yy + 22} ${labelW + Math.max(0, w - 4)},${yy + 22}H${labelW}Z`} fill={LIME} />
              <text x={labelW + w + 8} y={yy + 17} className="dash-value" textAnchor="start">
                {compact(v, format)}
              </text>
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

// ---------- Linha e área ----------
function LineChart({ chart, area }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState(null);
  const { labels, series, format } = chart;
  const H = 280;
  const pad = { t: 28, r: 18, b: 30, l: 18 };
  const max = niceMax(Math.max(...series.flatMap((s) => s.data), 0));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const step = labels.length > 1 ? innerW / (labels.length - 1) : 0;
  const x = (i) => pad.l + i * step;
  const y = (v) => pad.t + innerH - (Math.max(0, v) / max) * innerH;
  const gid = useRef(`g${Math.random().toString(36).slice(2, 8)}`).current;
  // Rótulos seletivos: maior, menor e último ponto de uma série única.
  const marks = new Set();
  if (series.length === 1) {
    const d = series[0].data;
    marks.add(d.indexOf(Math.max(...d)));
    marks.add(d.indexOf(Math.min(...d)));
    marks.add(d.length - 1);
  }
  return (
    <div
      className="dash-chart-body"
      ref={ref}
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const box = ref.current.getBoundingClientRect();
        const i = Math.max(0, Math.min(labels.length - 1, Math.round((e.clientX - box.left - pad.l) / (step || 1))));
        setHover({ i, x: e.clientX - box.left, y: e.clientY - box.top });
      }}
    >
      <svg width={W} height={H} role="img" aria-label={chart.title}>
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={colorOf(series, 0)} stopOpacity="0.35" />
            <stop offset="100%" stopColor={colorOf(series, 0)} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} className="dash-grid" />
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="dash-axis" />
        {series.map((s, si) => {
          const pts = s.data.map((v, i) => `${x(i)},${y(v)}`).join(' L');
          return (
            <g key={s.name}>
              {area && si === 0 && series.length === 1 && <path d={`M${x(0)},${y(0)} L${pts} L${x(s.data.length - 1)},${y(0)}Z`} fill={`url(#${gid})`} />}
              <path d={`M${pts}`} fill="none" stroke={colorOf(series, si)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {s.data.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={hover?.i === i ? 5 : 4} fill={colorOf(series, si)} stroke="var(--dash-card)" strokeWidth="2" />
              ))}
              {series.length === 1 &&
                [...marks].map((i) => (
                  <text key={i} x={x(i)} y={y(s.data[i]) - 12} className="dash-value" textAnchor={i === 0 ? 'start' : i === s.data.length - 1 ? 'end' : 'middle'}>
                    {compact(s.data[i], format)}
                  </text>
                ))}
            </g>
          );
        })}
        {hover && <line x1={x(hover.i)} x2={x(hover.i)} y1={pad.t} y2={y(0)} className="dash-cross" />}
        {labels.map(
          (l, i) =>
            i % labelEvery(labels.length, innerW) === 0 && (
              <text key={l + i} x={x(i)} y={H - 10} className="dash-label" textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}>
                {l.length > 10 ? `${l.slice(0, 9)}…` : l}
              </text>
            ),
        )}
      </svg>
      {hover && (
        <Tooltip
          tip={{ x: hover.x, y: hover.y, title: labels[hover.i], rows: series.map((s, si) => ({ name: series.length > 1 ? s.name : '', color: colorOf(series, si), value: full(s.data[hover.i], format) })) }}
        />
      )}
      <Legend series={series} />
    </div>
  );
}

// ---------- Rosca ----------
function DonutChart({ chart }) {
  const [tip, setTip] = useState(null);
  const ref = useRef(null);
  const { labels, series, format } = chart;
  const data = series[0].data.map((v) => Math.max(0, v));
  const total = data.reduce((a, b) => a + b, 0) || 1;
  const R = 92;
  const r = 60;
  let acc = 0;
  const arcs = data.map((v, i) => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += v;
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad, ang) => `${110 + rad * Math.cos(ang)},${110 + rad * Math.sin(ang)}`;
    const d = data.length === 1 ? null : `M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${large} 0 ${p(r, a0)}Z`;
    return { d, color: SERIES[i % SERIES.length], v, label: labels[i] };
  });
  return (
    <div className="dash-chart-body dash-donut" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg width="220" height="220" viewBox="0 0 220 220" role="img" aria-label={chart.title}>
        {arcs.map((a, i) =>
          a.d ? (
            <path
              key={i}
              d={a.d}
              fill={a.color}
              stroke="var(--dash-card)"
              strokeWidth="2"
              onMouseMove={(e) => {
                const box = ref.current.getBoundingClientRect();
                setTip({ x: e.clientX - box.left, y: e.clientY - box.top, title: a.label, rows: [{ name: `${nf(1).format((a.v / total) * 100)}%`, color: a.color, value: full(a.v, format) }] });
              }}
            />
          ) : (
            <circle key={i} cx="110" cy="110" r={(R + r) / 2} fill="none" stroke={a.color} strokeWidth={R - r} />
          ),
        )}
        <text x="110" y="106" textAnchor="middle" className="dash-donut-total">
          {compact(total, format)}
        </text>
        <text x="110" y="126" textAnchor="middle" className="dash-label">
          total
        </text>
      </svg>
      <ul className="dash-donut-legend">
        {arcs.map((a, i) => (
          <li key={i}>
            <i style={{ background: a.color }} />
            <span>{a.label}</span>
            <b>{nf(1).format((a.v / total) * 100)}%</b>
          </li>
        ))}
      </ul>
      <Tooltip tip={tip} />
    </div>
  );
}

function Chart({ chart }) {
  if (chart.type === 'barras_horizontais') return <HBarChart chart={chart} />;
  if (chart.type === 'linha') return <LineChart chart={chart} />;
  if (chart.type === 'area') return <LineChart chart={chart} area />;
  if (chart.type === 'rosca') return <DonutChart chart={chart} />;
  return <BarChart chart={chart} />;
}

// Ícone do indicador: anel, meio ou ponto (régua de autonomia da marca), alternando.
function KpiIcon({ i }) {
  const kind = ['dot', 'ring', 'half'][i % 3];
  return (
    <span className="dash-kpi-icon" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24">
        {kind === 'dot' && <circle cx="12" cy="12" r="9" fill="currentColor" />}
        {kind !== 'dot' && <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="3" />}
        {kind === 'half' && <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />}
      </svg>
    </span>
  );
}

export default function DashboardView({ spec, footer }) {
  const [showTables, setShowTables] = useState({});
  useEffect(() => setShowTables({}), [spec]);
  return (
    <article className="dash">
      <header className="dash-head">
        <div>
          <span className="dash-eyebrow">Dashboard{spec.period ? ` · ${spec.period}` : ''}</span>
          <h1>{spec.title}</h1>
          {spec.subtitle && <p>{spec.subtitle}</p>}
        </div>
        {spec.source && <span className="dash-source">Fonte: {spec.source}</span>}
      </header>

      {spec.kpis.length > 0 && (
        <section className="dash-kpis" aria-label="Indicadores">
          {spec.kpis.map((k, i) => (
            <div key={k.label} className="dash-kpi">
              <KpiIcon i={i} />
              <div>
                <span className="dash-kpi-label">{k.label}</span>
                <strong className="dash-kpi-value">{k.value}</strong>
                {(k.trendText || k.detail) && (
                  <span className="dash-kpi-detail">
                    {k.trend && (
                      <em className={`dash-trend is-${k.trend}`}>
                        {k.trend === 'alta' ? '▲' : k.trend === 'queda' ? '▼' : '■'} {k.trendText}
                      </em>
                    )}
                    {!k.trend && k.trendText && <em className="dash-trend">{k.trendText}</em>}
                    {k.detail && <span>{k.detail}</span>}
                  </span>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {spec.charts.length > 0 && (
        <section className="dash-charts">
          {spec.charts.map((c, i) => (
            <figure key={c.title + i} className={`dash-card ${c.width === 'inteira' || spec.charts.length === 1 ? 'is-full' : ''}`}>
              <figcaption>
                <div>
                  <h2>{c.title}</h2>
                  {c.subtitle && <p>{c.subtitle}</p>}
                </div>
                <button type="button" className="dash-toggle" onClick={() => setShowTables((t) => ({ ...t, [i]: !t[i] }))} aria-pressed={Boolean(showTables[i])}>
                  {showTables[i] ? 'Ver gráfico' : 'Ver dados'}
                </button>
              </figcaption>
              {showTables[i] ? (
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th />
                        {c.series.map((s) => (
                          <th key={s.name}>{s.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {c.labels.map((l, li) => (
                        <tr key={l + li}>
                          <td>{l}</td>
                          {c.series.map((s) => (
                            <td key={s.name}>{full(s.data[li], c.format)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Chart chart={c} />
              )}
            </figure>
          ))}
        </section>
      )}

      {spec.insights.length > 0 && (
        <section className="dash-card dash-insights is-full">
          <h2>Conclusões</h2>
          <ul>
            {spec.insights.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      {spec.tables.map((t, i) => (
        <section key={i} className="dash-card is-full">
          {t.title && <h2>{t.title}</h2>}
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  {t.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {footer}
    </article>
  );
}
