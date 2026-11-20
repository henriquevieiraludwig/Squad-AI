import { Link, useNavigate } from 'react-router-dom';
import { IconAgent, IconPlug, IconShield, IconBolt, IconCheck } from '../../components/Icons.jsx';
import { PageHead } from './common.jsx';
import AgentList from './AgentList.jsx';

export default function Home({ user, agents, summary, loadError, reloadAgents, openCreate }) {
  const navigate = useNavigate();
  const firstName = user.name.split(/\s+/)[0];
  const s = summary || {};
  const ready = Boolean(summary);

  // A faixa escura destaca a próxima ação que mais importa agora.
  let band;
  if (!ready) band = null;
  else if (!s.agents)
    band = {
      title: 'Crie o primeiro agente da empresa',
      text: 'Escolha um processo que se repete toda semana. O agente começa por ele.',
      action: 'Criar agente',
      onClick: openCreate,
    };
  else if (!s.integrations)
    band = {
      title: 'Conecte as ferramentas da empresa',
      text: 'Com o Microsoft 365, o Google Workspace ou um canal de conversa conectado, o agente passa a executar tarefas.',
      action: 'Conectar ferramentas',
      onClick: () => navigate('/app/integracoes'),
    };
  else if (s.pending)
    band = {
      title: `${s.pending} ${s.pending > 1 ? 'ações esperam' : 'ação espera'} sua aprovação`,
      text: 'Os agentes prepararam as tarefas e aguardam alguém da equipe confirmar.',
      action: 'Revisar aprovações',
      onClick: () => navigate('/app/aprovacoes'),
    };
  else if (!s.toolsEnabled)
    band = {
      title: 'Libere as primeiras ações para um agente',
      text: 'Escolha o que cada agente pode fazer sozinho e o que precisa de aprovação.',
      action: 'Configurar agente',
      onClick: () => navigate(`/app/agentes/${agents?.[0]?.id ?? ''}`),
    };
  else
    band = {
      title: 'Teste um agente antes de ligar os canais',
      text: 'Converse como se fosse um colaborador ou cliente e veja as ações que ele propõe.',
      action: 'Abrir conversa de teste',
      onClick: () => navigate('/app/testar'),
    };

  const stats = [
    { label: 'Agentes', value: s.agents, Icon: IconAgent, to: '/app/agentes' },
    { label: 'Integrações conectadas', value: s.integrations, Icon: IconPlug, to: '/app/integracoes' },
    { label: 'Aprovações pendentes', value: s.pending, Icon: IconShield, to: '/app/aprovacoes' },
    { label: 'Ações na semana', value: s.executedWeek, Icon: IconBolt, to: '/app/aprovacoes' },
  ];

  const checklist = [
    { title: 'Crie o primeiro agente', text: 'Dê um nome e escolha a área em que ele vai atuar.', done: s.agents > 0, to: null },
    { title: 'Conecte uma ferramenta', text: 'Microsoft 365, Google Workspace, WhatsApp, Telegram ou Slack.', done: s.integrations > 0, to: '/app/integracoes' },
    { title: 'Libere ações para o agente', text: 'Defina o que roda sozinho e o que pede aprovação.', done: s.toolsEnabled > 0, to: agents?.[0] ? `/app/agentes/${agents[0].id}` : null },
    { title: 'Teste uma conversa', text: 'Veja o agente responder e propor ações antes de ligar os canais.', done: s.conversations > 0, to: '/app/testar' },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const nextIndex = checklist.findIndex((c) => !c.done);

  return (
    <>
      <PageHead title={`Olá, ${firstName}.`} lede={`Acompanhe os agentes e as automações de ${user.orgName}.`} />

      {band ? (
        <section className="band" aria-labelledby="band-title">
          <div>
            <h2 id="band-title">{band.title}</h2>
            <p>{band.text}</p>
          </div>
          <button className="btn btn-primary btn-lg" onClick={band.onClick}>
            {band.action}
          </button>
        </section>
      ) : (
        <div className="band band-loading skeleton" aria-hidden="true" />
      )}

      <ul className="stats" aria-label="Resumo">
        {stats.map(({ label, value, Icon, to }) => (
          <li key={label}>
            <Link to={to} className="stat">
              <span className="stat-icon">
                <Icon />
              </span>
              <span className="stat-value tabular">{ready ? value : <span className="skeleton stat-skel" />}</span>
              <span className="stat-label">{label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="home-grid">
        <section className="panel" aria-labelledby="checklist-title">
          <div className="panel-head">
            <h2 id="checklist-title">Primeiros passos</h2>
            <span className="muted tabular">
              {doneCount} de {checklist.length}
            </span>
          </div>
          <div className="progress" aria-hidden="true">
            <span style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
          </div>
          <ol className="checklist">
            {checklist.map((c, i) => (
              <li key={c.title} className={`check ${c.done ? 'is-done' : ''} ${i === nextIndex ? 'is-next' : ''}`}>
                <span className="check-mark" aria-hidden="true">
                  {c.done ? <IconCheck size={14} /> : i + 1}
                </span>
                <div>
                  <h3>
                    {c.to && !c.done ? <Link to={c.to}>{c.title}</Link> : c.title}
                    {c.done && <span className="visually-hidden"> (concluído)</span>}
                  </h3>
                  <p>{c.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel" aria-labelledby="agents-title">
          <div className="panel-head">
            <h2 id="agents-title">Agentes</h2>
            {agents?.length > 0 && (
              <Link to="/app/agentes" className="link">
                Ver todos
              </Link>
            )}
          </div>
          <AgentList agents={agents?.slice(0, 4)} loadError={loadError} reload={reloadAgents} openCreate={openCreate} compact />
        </section>
      </div>
    </>
  );
}
