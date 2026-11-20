import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { IconShield, IconHistory } from '../../components/Icons.jsx';
import { PageHead, SearchInput, FilterChips, EmptyState, ErrorState, LoadingRows, InputDetails, RUN_STATUS, CHANNEL_LABEL, formatDate } from './common.jsx';

export default function Approvals({ notify, refreshSummary, summary }) {
  const [tab, setTab] = useState('pendente');
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState('');
  const [deciding, setDeciding] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('todas');

  const load = useCallback(async () => {
    setError('');
    setRuns(null);
    try {
      const { runs } = await api(`/approvals?status=${tab === 'pendente' ? 'pendente' : 'todas'}`);
      setRuns(runs);
    } catch (err) {
      setError(err.message);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(run, approve) {
    setDeciding(`${run.id}-${approve}`);
    try {
      const out = await api(`/approvals/${run.id}`, { method: 'POST', body: { approve } });
      setRuns((list) => list.filter((r) => r.id !== run.id));
      refreshSummary();
      if (out.status === 'executada') notify(`${run.label}: aprovado e executado.`);
      else if (out.status === 'recusada') notify(`${run.label}: recusado. O agente vai avisar quem pediu.`);
      else notify(`${run.label}: aprovado, mas a execução falhou. ${out.result?.erro || ''}`, 'error');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setDeciding(null);
    }
  }

  const history = useMemo(() => {
    if (!runs || tab === 'pendente') return runs;
    const q = query.trim().toLowerCase();
    return runs.filter(
      (r) => r.status !== 'pendente' && (status === 'todas' || r.status === status) && (!q || `${r.label} ${r.agentName} ${r.contact}`.toLowerCase().includes(q)),
    );
  }, [runs, tab, query, status]);

  return (
    <>
      <PageHead title="Aprovações" lede="Ações que os agentes prepararam e esperam alguém da equipe confirmar, e o histórico de tudo o que foi executado." />

      <div className="toolbar">
        <FilterChips
          label="Ver"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pendente', label: 'Pendentes', count: summary?.pending },
            { value: 'historico', label: 'Histórico' },
          ]}
        />
      </div>

      {tab === 'historico' && (
        <div className="toolbar">
          <SearchInput id="history-search" label="Buscar no histórico" value={query} onChange={setQuery} placeholder="Buscar por ação, agente ou contato" />
          <FilterChips
            label="Filtrar por resultado"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'todas', label: 'Todas' },
              { value: 'executada', label: 'Executadas' },
              { value: 'recusada', label: 'Recusadas' },
              { value: 'erro', label: 'Com falha' },
            ]}
          />
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !runs ? (
        <LoadingRows rows={3} />
      ) : tab === 'pendente' ? (
        runs.length === 0 ? (
          <section className="panel">
            <EmptyState
              icon={<IconShield />}
              title="Nada esperando aprovação"
              text="Quando um agente preparar uma ação que precisa de confirmação, ela aparece aqui."
            />
          </section>
        ) : (
          <ul className="approval-list">
            {runs.map((r) => (
              <li key={r.id} className="approval">
                <div className="approval-head">
                  <div>
                    <h3>{r.label}</h3>
                    <p className="muted">
                      Pedido #{r.id} de {r.agentName || 'agente removido'}
                      {r.channel && `, em ${CHANNEL_LABEL[r.channel] || r.channel}${r.contact ? ` com ${r.contact}` : ''}`}, {formatDate(r.requestedAt, true)}
                    </p>
                  </div>
                  <span className="pill pill-warn">Aguardando</span>
                </div>
                <InputDetails input={r.input} />
                <div className="approval-actions">
                  <button className="btn btn-secondary" onClick={() => decide(r, false)} disabled={Boolean(deciding)}>
                    {deciding === `${r.id}-false` && <span className="spinner" aria-hidden="true" />}
                    Recusar
                  </button>
                  <button className="btn btn-primary" onClick={() => decide(r, true)} disabled={Boolean(deciding)}>
                    {deciding === `${r.id}-true` && <span className="spinner" aria-hidden="true" />}
                    Aprovar e executar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : history.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon={<IconHistory />}
            title={runs.length ? 'Nenhuma ação encontrada' : 'Nenhuma ação executada ainda'}
            text={runs.length ? 'Ajuste a busca ou o filtro.' : 'As ações dos agentes, automáticas ou aprovadas, aparecem aqui.'}
          />
        </section>
      ) : (
        <section className="panel panel-flush">
          <ul className="history">
            {history.map((r) => {
              const st = RUN_STATUS[r.status];
              return (
                <li key={r.id}>
                  <details>
                    <summary>
                      <span className={`pill ${st.cls}`}>{st.label}</span>
                      <strong>{r.label}</strong>
                      <span className="muted">{r.agentName}</span>
                      <span className="muted tabular history-date">{formatDate(r.decidedAt || r.requestedAt, true)}</span>
                    </summary>
                    <div className="history-body">
                      <InputDetails input={r.input} />
                      <p className="muted">
                        {r.decidedBy ? `Decidido por ${r.decidedBy}.` : 'Executada automaticamente.'}
                        {r.result?.erro && ` Erro: ${r.result.erro}`}
                      </p>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
