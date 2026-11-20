import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { PROVIDERS, PROVIDER_BY_ID, connectionFor, defaultMode } from '../../../shared/catalog.js';
import { IconChat } from '../../components/Icons.jsx';
import { PageHead, SearchInput, FilterChips, Monogram, ErrorState, LoadingRows, AGENT_STATUS, formatDate } from './common.jsx';

const MODE_OPTIONS = [
  { value: 'off', label: 'Desligada' },
  { value: 'approval', label: 'Pede aprovação' },
  { value: 'auto', label: 'Automática' },
];

export default function AgentDetail({ notify, refreshSummary }) {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('conectadas');

  const load = useCallback(async () => {
    setError('');
    try {
      const [agent, integ] = await Promise.all([api(`/agents/${id}`), api('/integrations')]);
      setData(agent);
      setCatalog(integ);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const connected = useMemo(() => new Set((catalog?.providers || []).filter((p) => p.connected && !p.via).map((p) => p.id)), [catalog]);

  async function setMode(action, mode) {
    setSaving(action.id);
    try {
      const { tools } = await api(`/agents/${id}/tools`, { method: 'PUT', body: { actionId: action.id, mode } });
      setData((d) => ({ ...d, tools }));
      refreshSummary();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(null);
    }
  }

  async function setChannel(provider, take) {
    try {
      await api(`/channels/${provider}`, { method: 'PUT', body: { agentId: take ? Number(id) : null } });
      await load();
      notify(take ? `${data.agent.name} agora responde no ${PROVIDER_BY_ID[provider].name}.` : 'O canal ficou sem agente.');
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data || !catalog)
    return (
      <>
        <div className="skeleton" style={{ height: 72, marginBottom: 24 }} />
        <LoadingRows rows={4} />
      </>
    );

  const { agent, tools } = data;
  const st = AGENT_STATUS[agent.status] || { label: agent.status, cls: 'pill-neutral' };
  const q = query.trim().toLowerCase();
  const enabledCount = Object.keys(tools).length;

  // Ações agrupadas pela plataforma que guarda a conexão.
  const groups = PROVIDERS.filter((p) => !p.via)
    .map((p) => ({
      provider: p,
      isConnected: connected.has(p.id),
      actions: catalog.actions.filter((a) => connectionFor(a.provider) === p.id && (!q || `${a.label} ${a.service}`.toLowerCase().includes(q))),
    }))
    .filter((g) => g.actions.length && (view === 'todas' || (view === 'conectadas' ? g.isConnected : g.actions.some((a) => tools[a.id]))));

  const channelProviders = catalog.providers.filter((p) => p.channel);

  return (
    <>
      <PageHead
        back={{ to: '/app/agentes', label: 'Agentes' }}
        title={agent.name}
        lede={agent.roleDescription || 'Sem descrição da função ainda.'}
      >
        <Link to={`/app/testar?agente=${agent.id}`} className="btn btn-primary">
          <IconChat size={18} />
          Testar conversa
        </Link>
      </PageHead>
      <p className="meta-line">
        <span className={`pill ${st.cls}`}>{st.label}</span>
        <span>{agent.area}</span>
        <span>Criado em {formatDate(agent.createdAt)}</span>
        <span className="tabular">{enabledCount} ações liberadas</span>
      </p>

      <section className="panel" aria-labelledby="tools-title">
        <div className="panel-head">
          <div>
            <h2 id="tools-title">Ferramentas</h2>
            <p className="panel-sub">Consultas costumam rodar sozinhas. Envios em nome da empresa devem pedir aprovação.</p>
          </div>
        </div>
        <div className="toolbar toolbar-in-panel">
          <SearchInput id="tool-search" label="Buscar ações" value={query} onChange={setQuery} placeholder="Buscar ação, como e-mail ou agenda" />
          <FilterChips
            label="Mostrar"
            value={view}
            onChange={setView}
            options={[
              { value: 'conectadas', label: 'Plataformas conectadas' },
              { value: 'liberadas', label: 'Só liberadas', count: enabledCount },
              { value: 'todas', label: 'Todas' },
            ]}
          />
        </div>

        {groups.length === 0 && (
          <div className="empty">
            <h3>{view === 'conectadas' ? 'Nenhuma plataforma conectada ainda' : 'Nenhuma ação encontrada'}</h3>
            <p>
              {view === 'conectadas'
                ? 'Conecte o Microsoft 365, o Google Workspace ou um canal para liberar ações a este agente.'
                : 'Ajuste a busca ou o filtro.'}
            </p>
            {view === 'conectadas' && (
              <Link to="/app/integracoes" className="btn btn-secondary">
                Ver integrações
              </Link>
            )}
          </div>
        )}

        {groups.map(({ provider, isConnected, actions }) => (
          <div key={provider.id} className="tool-group">
            <div className="tool-group-head">
              <Monogram letter={provider.monogram} size={32} />
              <h3>{provider.name}</h3>
              {isConnected ? (
                <span className="pill pill-ok">Conectado</span>
              ) : (
                <Link to="/app/integracoes" className="link">
                  Conectar para liberar
                </Link>
              )}
            </div>
            <ul className="tool-list">
              {actions.map((a) => {
                const mode = tools[a.id] || 'off';
                return (
                  <li key={a.id} className={`tool ${isConnected ? '' : 'is-disabled'}`}>
                    <div className="tool-info">
                      <strong>{a.label}</strong>
                      <span>
                        {a.service}. <span className={a.risk === 'read' ? 'risk-read' : 'risk-write'}>{a.risk === 'read' ? 'Consulta' : 'Executa em nome da empresa'}</span>
                      </span>
                    </div>
                    <div className="segmented" role="radiogroup" aria-label={`Modo de ${a.label}`}>
                      {MODE_OPTIONS.map((o) => (
                        <label key={o.value} className={mode === o.value ? 'is-on' : ''}>
                          <input
                            type="radio"
                            name={`mode-${a.id}`}
                            value={o.value}
                            checked={mode === o.value}
                            disabled={!isConnected || saving === a.id}
                            onChange={() => setMode(a, o.value)}
                          />
                          {o.label}
                        </label>
                      ))}
                    </div>
                    {mode === 'off' && isConnected && (
                      <button type="button" className="tool-suggest" onClick={() => setMode(a, defaultMode(a))} disabled={saving === a.id}>
                        Ligar com o modo recomendado
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section className="panel" aria-labelledby="channels-title">
        <div className="panel-head">
          <div>
            <h2 id="channels-title">Canais de atendimento</h2>
            <p className="panel-sub">Em cada canal, um agente responde as mensagens que chegam.</p>
          </div>
        </div>
        <ul className="channel-list">
          {channelProviders.map((p) => {
            const mine = p.routeAgentId === agent.id;
            const other = p.routeAgentId && !mine ? catalog.agents.find((x) => x.id === p.routeAgentId) : null;
            return (
              <li key={p.id} className="channel">
                <Monogram letter={p.monogram} size={36} />
                <div className="channel-info">
                  <strong>{p.name}</strong>
                  <span>
                    {!p.connected
                      ? 'Canal não conectado.'
                      : mine
                        ? `Este agente responde em ${p.accountLabel}.`
                        : other
                          ? `Hoje quem responde é ${other.name}.`
                          : 'Conectado, sem agente respondendo.'}
                  </span>
                </div>
                {!p.connected ? (
                  <Link to="/app/integracoes" className="btn btn-secondary btn-sm">
                    Conectar
                  </Link>
                ) : mine ? (
                  <button className="btn btn-secondary btn-sm" onClick={() => setChannel(p.id, false)}>
                    Parar de responder
                  </button>
                ) : (
                  <button className="btn btn-dark btn-sm" onClick={() => setChannel(p.id, true)}>
                    Responder neste canal
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
