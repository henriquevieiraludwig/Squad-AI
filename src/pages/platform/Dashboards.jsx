import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { can } from '../../auth.jsx';
import { IconChart, IconCopy, IconTrash } from '../../components/Icons.jsx';
import AgentAvatar from '../../components/AgentAvatar.jsx';
import DashboardView from '../../components/dashboard/DashboardView.jsx';
import { PageHead, EmptyState, ErrorState, LoadingRows, formatDate } from './common.jsx';

export default function Dashboards(props) {
  const { id } = useParams();
  return id ? <DashboardDetail id={id} {...props} /> : <DashboardList {...props} />;
}

function DashboardList({ notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/dashboards')
      .then((r) => setData(r.dashboards))
      .catch((err) => setError(err.message));
  }, []);
  return (
    <>
      <PageHead title="Dashboards" lede="Painéis criados pelos agentes a partir dos seus dados. Peça a qualquer agente: “monte um dashboard com…”." />
      {error && <ErrorState message={error} />}
      {!data && !error && <LoadingRows rows={3} />}
      {data && !data.length && (
        <section className="panel">
          <EmptyState
            icon={<IconChart />}
            title="Nenhum dashboard ainda"
            text="Envie uma planilha ou o link de uma planilha do Google para um agente e peça: “monte um dashboard das vendas do ano, com faturamento por mês, ticket médio e conclusões”."
          >
            <Link className="btn btn-primary" to="/app/testar">
              Pedir a um agente
            </Link>
          </EmptyState>
        </section>
      )}
      {data && data.length > 0 && (
        <ul className="dash-grid-list">
          {data.map((d) => (
            <li key={d.id}>
              <Link to={`/app/dashboards/${d.id}`} className="dash-tile">
                <div className="dash-tile-kpis">
                  {d.kpis.map((k) => (
                    <span key={k.label}>
                      <small>{k.label}</small>
                      <strong>{k.value}</strong>
                    </span>
                  ))}
                </div>
                <h3>{d.title}</h3>
                <span className="muted dash-tile-meta">
                  {d.agentName && <AgentAvatar avatar={d.agentAvatar} name={d.agentName} size={20} />}
                  {d.agentName ? `${d.agentName} · ` : ''}
                  {formatDate(d.createdAt, true)}
                  {d.shared ? ' · compartilhado' : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function DashboardDetail({ id, user, notify }) {
  const navigate = useNavigate();
  const editable = can(user, 'configurar');
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(() => {
    api(`/dashboards/${id}`)
      .then((r) => setD(r.dashboard))
      .catch((err) => setError(err.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <ErrorState message={error} />;
  if (!d) return <LoadingRows rows={4} />;
  const shareUrl = d.shareToken ? `${window.location.origin}/d/${d.shareToken}` : null;

  async function share(enabled) {
    try {
      const r = await api(`/dashboards/${id}/share`, { method: 'POST', body: { enabled } });
      setD((x) => ({ ...x, shareToken: r.shareToken, shared: Boolean(r.shareToken) }));
      if (r.shareToken) {
        await navigator.clipboard?.writeText(`${window.location.origin}/d/${r.shareToken}`).catch(() => {});
        notify('Link público criado e copiado. Quem tiver o link vê o dashboard, sem precisar entrar.');
      } else notify('Link público desligado.');
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  return (
    <>
      <PageHead back={{ to: '/app/dashboards', label: 'Dashboards' }} title={d.title} lede={d.agentName ? `Criado por ${d.agentName} em ${formatDate(d.createdAt, true)}.` : undefined}>
        <button className="btn btn-secondary" onClick={() => window.print()}>
          Baixar PDF
        </button>
        {editable && (
          <button className="btn btn-primary" onClick={() => share(true)}>
            <IconCopy size={16} />
            {d.shared ? 'Copiar link público' : 'Compartilhar link'}
          </button>
        )}
      </PageHead>
      {shareUrl && (
        <div className="alert alert-info dash-share-bar">
          <span>
            Link público: <a href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a>
          </span>
          {editable && (
            <button className="btn btn-ghost btn-sm" onClick={() => share(false)}>
              Desligar link
            </button>
          )}
        </div>
      )}
      <DashboardView spec={d.spec} />
      <div className="dash-actions-foot">
        {d.conversationId && (
          <Link className="link" to={`/app/conversas/${d.conversationId}`}>
            Ver a conversa em que ele foi criado
          </Link>
        )}
        {editable &&
          (confirm ? (
            <span className="confirm-row">
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  await api(`/dashboards/${id}`, { method: 'DELETE' });
                  notify('Dashboard apagado.');
                  navigate('/app/dashboards');
                }}
              >
                Confirmar exclusão
              </button>
            </span>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(true)}>
              <IconTrash size={16} />
              Apagar
            </button>
          ))}
      </div>
    </>
  );
}
