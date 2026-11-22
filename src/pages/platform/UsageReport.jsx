// Relatório de consumo da API do Claude (custo estimado em dólar, por dia, agente e canal).
import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { fmtNumber } from './common.jsx';

const CHANNELS = { teste: 'Testes na plataforma', whatsapp: 'WhatsApp', telegram: 'Telegram', interno: 'Entre agentes', agendada: 'Tarefas agendadas' };
const usd = (v) => (v > 0 && v < 0.01 ? '< US$ 0,01' : `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const shortDay = (d) => {
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
};

function DailyChart({ series }) {
  const [hover, setHover] = useState(null);
  const W = 640;
  const H = 150;
  const max = Math.max(...series.map((s) => s.cost), 0.0001);
  const bw = W / series.length;
  const every = Math.ceil(series.length / 6);
  return (
    <div className="usage-chart">
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label="Custo por dia">
        <line x1="0" x2={W} y1={H} y2={H} className="usage-axis" />
        {series.map((s, i) => {
          const h = s.cost ? Math.max(3, (s.cost / max) * (H - 8)) : 0;
          return (
            <g key={s.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * bw} y="0" width={bw} height={H} fill="transparent" />
              {h > 0 && <rect x={i * bw + bw * 0.18} y={H - h} width={bw * 0.64} height={h} rx="3" className={`usage-bar ${hover === i ? 'is-hover' : ''}`} />}
              {i % every === 0 && (
                <text x={i === 0 ? 0 : i * bw + bw / 2} y={H + 16} textAnchor={i === 0 ? "start" : "middle"} className="usage-label">
                  {shortDay(s.day)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="usage-tip" style={{ left: `${((hover + 0.5) / series.length) * 100}%` }}>
          <strong>{shortDay(series[hover].day)}</strong>
          <span>{usd(series[hover].cost)}</span>
          <span className="muted">{fmtNumber(series[hover].turns)} respostas</span>
        </div>
      )}
    </div>
  );
}

export default function UsageReport() {
  const [days, setDays] = useState(30);
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    api(`/usage/report?days=${days}`)
      .then(setR)
      .catch((e) => setError(e.message));
  }, [days]);

  const t = r?.total;
  const avg = t?.turns ? t.cost / t.turns : 0;
  const tokens = t ? t.input + t.output + t.cacheRead + t.cacheWrite : 0;
  const cacheShare = t && t.input + t.cacheRead + t.cacheWrite ? t.cacheRead / (t.input + t.cacheRead + t.cacheWrite) : 0;

  return (
    <section className="panel usage-report" aria-labelledby="usage-title">
      <div className="panel-head">
        <h2 id="usage-title">Consumo da IA (Claude)</h2>
        <div className="seg" role="group" aria-label="Período">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" className={days === d ? 'is-on' : ''} onClick={() => setDays(d)}>
              {d} dias
            </button>
          ))}
        </div>
      </div>
      {error && <p className="muted">{error}</p>}
      {!r && !error && <div className="skeleton" style={{ height: 220 }} />}
      {r && (
        <>
          <ul className="usage-kpis">
            <li>
              <span>Custo estimado</span>
              <strong className="tabular">{usd(t.cost)}</strong>
            </li>
            <li>
              <span>Respostas dos agentes</span>
              <strong className="tabular">{fmtNumber(t.turns)}</strong>
            </li>
            <li>
              <span>Custo médio por resposta</span>
              <strong className="tabular">{usd(avg)}</strong>
            </li>
            <li>
              <span>Tokens processados</span>
              <strong className="tabular">{fmtNumber(tokens)}</strong>
            </li>
          </ul>
          {t.turns ? <DailyChart series={r.series} /> : <p className="muted">Ainda não há consumo neste período.</p>}
          {r.byAgent.length > 0 && (
            <div className="usage-tables">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>Agente</th>
                    <th>Respostas</th>
                    <th>Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {r.byAgent.map((a) => (
                    <tr key={a.agentId ?? 0}>
                      <td>{a.name}</td>
                      <td className="tabular">{fmtNumber(a.turns)}</td>
                      <td className="tabular">{usd(a.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th>Respostas</th>
                    <th>Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {r.byChannel.map((c) => (
                    <tr key={c.channel}>
                      <td>{CHANNELS[c.channel] || c.channel}</td>
                      <td className="tabular">{fmtNumber(c.turns)}</td>
                      <td className="tabular">{usd(c.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="hint">
            Estimativa pelos tokens registrados e pelo preço público da API do Claude, em dólar (a Anthropic cobra em dólar).
            {cacheShare > 0 && ` ${Math.round(cacheShare * 100)}% da entrada veio do cache, que custa 95% menos.`} O valor exato está no console da
            Anthropic.
          </p>
        </>
      )}
    </section>
  );
}
