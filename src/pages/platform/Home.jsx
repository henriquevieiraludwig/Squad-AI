import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconAgent, IconPlug, IconShield, IconBolt, IconCheck } from '../../components/Icons.jsx';
import { api } from '../../api.js';
import { can } from '../../auth.jsx';
import { PageHead, fmtNumber } from './common.jsx';
import AgentList from './AgentList.jsx';

export default function Home({ user, agents, summary, loadError, reloadAgents, openCreate }) {
  const navigate = useNavigate();
  const [usage, setUsage] = useState(null);
  const firstName = user.name.split(/\s+/)[0];
  const s = summary || {};
  const ready = Boolean(summary);
  const config = can(user, 'configurar');

  useEffect(() => {
    api('/usage').then(setUsage).catch(() => {});
  }, [summary]);

  // A faixa escura destaca a próxima ação que mais importa agora, conforme o papel da pessoa.
  let band = null;
  if (ready) {
    if (s.pending && can(user, 'aprovar'))
      band = {
        title: `${s.pending} ${s.pending > 1 ? 'ações esperam' : 'ação espera'} sua aprovação`,
        text: 'Os agentes prepararam as tarefas e aguardam alguém da equipe confirmar.',
        action: 'Revisar aprovações',
        onClick: () => navigate('/app/aprovacoes'),
      };
    else if (!config)
      band = {
        title: 'Converse com os agentes da empresa',
        text: 'Peça uma tarefa do dia a dia e veja o agente seguir os processos da equipe.',
        action: 'Abrir conversa de teste',
        onClick: () => navigate('/app/testar'),
      };
    else if (!s.agents)
      band = { title: 'Crie o primeiro agente da empresa', text: 'Escolha um processo que se repete toda semana. O agente começa por ele.', action: 'Criar agente', onClick: openCreate };
    else if (!s.docs && !s.processes)
      band = {
        title: 'Ensine como a empresa trabalha',
        text: 'Envie políticas e manuais em Contexto da empresa e descreva o passo a passo em Processos.',
        action: 'Enviar contexto',
        onClick: () => navigate('/app/conhecimento'),
      };
    else if (!s.integrations)
      band = {
        title: 'Conecte as ferramentas da empresa',
        text: 'Com o Microsoft 365, o Google Workspace ou um canal de conversa conectado, o agente passa a executar tarefas.',
        action: 'Conectar ferramentas',
        onClick: () => navigate('/app/integracoes'),
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
  }

  const stats = [
    { label: 'Agentes', value: s.agents, Icon: IconAgent, to: '/app/agentes' },
    { label: 'Integrações conectadas', value: s.integrations, Icon: IconPlug, to: '/app/integracoes' },
    { label: 'Aprovações pendentes', value: s.pending, Icon: IconShield, to: '/app/aprovacoes' },
    { label: 'Ações na semana', value: s.executedWeek, Icon: IconBolt, to: '/app/aprovacoes' },
  ];

  const checklist = [
    { title: 'Crie o primeiro agente', text: 'Dê um nome e escolha a área em que ele vai atuar.', done: s.agents > 0, to: '/app/agentes' },
    { title: 'Ensine o contexto da empresa', text: 'Políticas, manuais e perguntas frequentes.', done: s.docs > 0, to: '/app/conhecimento' },
    { title: 'Mapeie um processo', text: 'O passo a passo que o agente deve seguir.', done: s.processes > 0, to: '/app/processos' },
    { title: 'Conecte uma ferramenta e libere ações', text: 'Defina o que roda sozinho e o que pede aprovação.', done: s.integrations > 0 && s.toolsEnabled > 0, to: '/app/integracoes' },
    { title: 'Teste uma conversa', text: 'Veja o agente responder antes de ligar os canais.', done: s.conversations > 0, to: '/app/testar' },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const nextIndex = checklist.findIndex((c) => !c.done);

  const meters = usage && [
    { label: 'Mensagens neste mês', used: usage.month.messages, max: usage.limits.messagesPerMonth },
    { label: 'Agentes', used: usage.counts.agents, max: usage.limits.agents },
    { label: 'Pessoas na equipe', used: usage.counts.members, max: usage.limits.members },
    { label: 'Espaço de contexto (caracteres)', used: usage.counts.knowledgeChars, max: usage.limits.knowledgeChars },
  ];

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
        {config ? (
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
                      {!c.done ? <Link to={c.to}>{c.title}</Link> : c.title}
                      {c.done && <span className="visually-hidden"> (concluído)</span>}
                    </h3>
                    <p>{c.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : (
          <section className="panel" aria-labelledby="agents-title-2">
            <div className="panel-head">
              <h2 id="agents-title-2">Agentes</h2>
            </div>
            <AgentList agents={agents?.slice(0, 4)} loadError={loadError} reload={reloadAgents} openCreate={null} compact />
          </section>
        )}

        <div className="home-side">
          {config && (
            <section className="panel" aria-labelledby="agents-title">
              <div className="panel-head">
                <h2 id="agents-title">Agentes</h2>
                {agents?.length > 0 && (
                  <Link to="/app/agentes" className="link">
                    Ver todos
                  </Link>
                )}
              </div>
              <AgentList agents={agents?.slice(0, 3)} loadError={loadError} reload={reloadAgents} openCreate={openCreate} compact />
            </section>
          )}
          {meters && (
            <section className="panel" aria-labelledby="plan-title">
              <div className="panel-head">
                <h2 id="plan-title">Uso do plano</h2>
              </div>
              <ul className="meters">
                {meters.map((m) => {
                  const pct = m.max ? Math.min(100, Math.round((m.used / m.max) * 100)) : 0;
                  return (
                    <li key={m.label}>
                      <span className="meter-top">
                        <span>{m.label}</span>
                        <span className="muted tabular">
                          {fmtNumber(m.used)} de {fmtNumber(m.max)}
                        </span>
                      </span>
                      <span className={`progress ${pct >= 90 ? 'progress-warn' : ''}`} aria-hidden="true">
                        <span style={{ width: `${pct}%` }} />
                      </span>
                    </li>
                  );
                })}
              </ul>
              {meters.some((m) => m.max && m.used / m.max >= 0.9) && <p className="muted">Perto do limite. Fale com o suporte para ampliar o plano.</p>}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
