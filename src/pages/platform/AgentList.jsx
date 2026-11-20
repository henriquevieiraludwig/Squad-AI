import { Link } from 'react-router-dom';
import { IconAgent } from '../../components/Icons.jsx';
import { AGENT_STATUS, EmptyState, ErrorState, LoadingRows, formatDate } from './common.jsx';

export default function AgentList({ agents, loadError, reload, openCreate, compact = false, emptyFiltered = false }) {
  if (loadError) return <ErrorState message={`Não foi possível carregar os agentes. ${loadError}`} onRetry={reload} />;
  if (!agents) return <LoadingRows rows={compact ? 2 : 3} />;
  if (agents.length === 0) {
    if (emptyFiltered) return <EmptyState icon={<IconAgent />} title="Nenhum agente encontrado" text="Ajuste a busca ou os filtros." />;
    return (
      <EmptyState icon={<IconAgent />} title="Nenhum agente ainda" text="Crie o primeiro agente e escolha o processo que ele vai assumir.">
        {!compact && (
          <button className="btn btn-secondary" onClick={openCreate}>
            Criar agente
          </button>
        )}
      </EmptyState>
    );
  }
  return (
    <ul className="agent-list">
      {agents.map((a) => {
        const st = AGENT_STATUS[a.status] || { label: a.status, cls: 'pill-neutral' };
        return (
          <li key={a.id}>
            <Link to={`/app/agentes/${a.id}`} className="agent">
              <span className="agent-avatar" aria-hidden="true">
                {a.name.trim()[0]?.toUpperCase()}
              </span>
              <span className="agent-main">
                <span className="agent-title">
                  <strong>{a.name}</strong>
                  <span className={`pill ${st.cls}`}>{st.label}</span>
                </span>
                <span className="agent-area">
                  {a.area}, criado em {formatDate(a.createdAt)}
                </span>
                {!compact && a.roleDescription && <span className="agent-desc">{a.roleDescription}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
