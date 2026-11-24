// Conversas: mesma experiência de Testar conversas. Agentes à esquerda; ao escolher um agente, a lista
// das conversas dele aparece logo abaixo (todos os canais); a conversa abre à direita.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FormattedText from '../../components/FormattedText.jsx';
import ChatComposer from '../../components/ChatComposer.jsx';
import AgentAvatar from '../../components/AgentAvatar.jsx';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { can } from '../../auth.jsx';
import { IconInbox, IconSend, IconPlus } from '../../components/Icons.jsx';
import { PageHead, EmptyState, ErrorState, LoadingRows, formatDate, RUN_STATUS, CHANNEL_LABEL } from './common.jsx';

const AUTHOR = { contato: 'Contato', agente: 'Agente', humano: 'Equipe', sistema: 'Aviso automático' };
const CHANNELS = [
  { value: 'todos', label: 'Todos' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'teste', label: 'Testes' },
  { value: 'agendada', label: 'Agendadas' },
];

export default function Conversations({ user, agents, notify, refreshSummary, openCreate }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [channel, setChannel] = useState('todos');
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(null); // agente da conversa aberta

  const load = useCallback(async () => {
    setError('');
    try {
      setList((await api('/conversations')).conversations);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // mostra mensagens novas dos canais
    return () => clearInterval(t);
  }, [load]);

  const fromList = id && list?.find((c) => String(c.id) === id)?.agentId;
  const agentId = Number(params.get('agente')) || fromList || current || agents?.[0]?.id || null;
  const agent = agents?.find((a) => a.id === agentId);
  const isNew = !id && params.get('nova') === '1';

  const counts = useMemo(() => {
    const m = {};
    for (const c of list || []) m[c.agentId] = (m[c.agentId] || 0) + 1;
    return m;
  }, [list]);

  const convs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list || []).filter(
      (c) =>
        c.agentId === agentId &&
        (channel === 'todos' || c.channel === channel) &&
        (!q || `${c.contact} ${c.preview}`.toLowerCase().includes(q)),
    );
  }, [list, agentId, channel, query]);

  const chooseAgent = (a) => {
    setCurrent(a.id);
    navigate(`/app/conversas?agente=${a.id}`);
  };
  const startNew = () => setParams({ agente: String(agentId), nova: '1' });
  const canTalk = can(user, 'conversar');

  if (!agents) return <LoadingRows rows={3} />;
  if (!agents.length)
    return (
      <>
        <PageHead title="Conversas" lede="Tudo o que os agentes conversaram nos canais e nos testes." />
        <section className="panel">
          <EmptyState icon={<IconInbox />} title="Nenhum agente ainda" text="Crie um agente para conversar com ele e acompanhar os atendimentos dele aqui.">
            {openCreate && (
              <button className="btn btn-primary" onClick={openCreate}>
                Criar agente
              </button>
            )}
          </EmptyState>
        </section>
      </>
    );

  return (
    <>
      <PageHead title="Conversas" lede="Escolha um agente para ver as conversas dele em todos os canais. Assuma uma conversa quando ela precisar de uma pessoa." />

      <div className={`chat-layout conv-layout ${id || isNew ? 'has-selection' : ''}`}>
        <nav className="chat-agents conv-side" aria-label="Agentes e conversas">
          <span className="chat-agents-title">Agentes</span>
          <ul className="conv-agent-list">
            {agents.map((a) => {
              const active = a.id === agentId;
              return (
                <li key={a.id}>
                  <button type="button" className={`chat-agent-item ${active ? 'is-active' : ''}`} aria-current={active ? 'true' : undefined} aria-expanded={active} onClick={() => chooseAgent(a)}>
                    <AgentAvatar avatar={a.avatar} name={a.name} size={36} />
                    <span>
                      <strong>{a.name}</strong>
                      <span className="muted">{a.area}</span>
                    </span>
                    {counts[a.id] > 0 && <span className="conv-count tabular">{counts[a.id]}</span>}
                  </button>

                  {active && (
                    <div className="conv-sub">
                      {canTalk && (
                        <button type="button" className={`conv-new ${isNew ? 'is-active' : ''}`} onClick={startNew}>
                          <IconPlus size={16} />
                          Nova conversa com {a.name}
                        </button>
                      )}
                      {(list?.length || 0) > 0 && (
                        <div className="conv-filters">
                          <label htmlFor="conv-search" className="visually-hidden">
                            Buscar nas conversas
                          </label>
                          <input id="conv-search" className="input input-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar contato ou mensagem" />
                          <div className="conv-chips" role="group" aria-label="Canal">
                            {CHANNELS.map((o) => (
                              <button key={o.value} type="button" className={channel === o.value ? 'is-on' : ''} onClick={() => setChannel(o.value)}>
                                {o.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {error ? (
                        <ErrorState message={error} onRetry={load} />
                      ) : !list ? (
                        <LoadingRows rows={3} />
                      ) : convs.length === 0 ? (
                        <p className="muted conv-none">{counts[a.id] ? 'Nenhuma conversa com esse filtro.' : `Nenhuma conversa com ${a.name} ainda.`}</p>
                      ) : (
                        <ul className="conv-items">
                          {convs.map((c) => (
                            <li key={c.id}>
                              <Link to={`/app/conversas/${c.id}`} className={`conv-row ${String(c.id) === id ? 'is-active' : ''}`}>
                                <span className="conv-top">
                                  <strong>{c.contact || 'Contato'}</strong>
                                  <span className="muted tabular">{formatDate(c.lastMessageAt, true)}</span>
                                </span>
                                <span className="conv-preview">{c.preview || 'Sem mensagens de texto'}</span>
                                <span className="conv-meta">
                                  <span className="tag">{CHANNEL_LABEL[c.channel] || c.channel}</span>
                                  {c.handledBy === 'humano' && <span className="pill pill-warn">Com {c.assignedTo || 'a equipe'}</span>}
                                  {c.pending > 0 && <span className="pill pill-warn">{c.pending} aprovação</span>}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {id ? (
          <ConversationDetail key={id} id={id} user={user} notify={notify} onChange={() => (load(), refreshSummary())} onBack={() => navigate(`/app/conversas?agente=${agentId}`)} />
        ) : agent && canTalk ? (
          <NewConversation
            key={`${agentId}-${isNew}`}
            agent={agent}
            notify={notify}
            onBack={() => navigate(`/app/conversas?agente=${agentId}`)}
            onCreated={(convId) => {
              load();
              refreshSummary();
              navigate(`/app/conversas/${convId}`, { replace: true });
            }}
          />
        ) : (
          <section className="chat-panel conv-placeholder">
            <div className="inbox-empty muted">Escolha uma conversa para ver o histórico.</div>
          </section>
        )}
      </div>
    </>
  );
}

function PanelHead({ avatar, name, title, subtitle, onBack, children }) {
  return (
    <div className="chat-panel-head">
      <div className="chat-agent">
        <button type="button" className="btn btn-ghost btn-sm conv-back" onClick={onBack} aria-label="Voltar para a lista">
          ←
        </button>
        <AgentAvatar avatar={avatar} name={name} size={40} />
        <div>
          <strong>{title}</strong>
          <span className="muted">{subtitle}</span>
        </div>
      </div>
      {children && <div className="chat-panel-links">{children}</div>}
    </div>
  );
}

// Nova conversa de teste com o agente, aberta direto nesta tela.
function NewConversation({ agent, notify, onCreated, onBack }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);

  async function send(text, attachments = [], files = []) {
    if (sending) return false;
    setSending(true);
    setSent([text, files.length ? `📎 ${files.map((f) => f.name).join(', ')}` : ''].filter(Boolean).join('\n'));
    setDraft('');
    try {
      const res = await api(`/agents/${agent.id}/chat`, { method: 'POST', body: { message: text, attachments, newConversation: true } });
      onCreated(res.conversationId);
      return true;
    } catch (err) {
      notify(err.message, 'error');
      setDraft(text);
      setSent(null);
      return false;
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="chat-panel" aria-label={`Nova conversa com ${agent.name}`}>
      <PanelHead avatar={agent.avatar} name={agent.name} title={agent.name} subtitle={`${agent.area}, nova conversa`} onBack={onBack}>
        <Link to={`/app/agentes/${agent.id}`} className="link">
          Ferramentas do agente
        </Link>
      </PanelHead>
      <div className="chat-log" aria-live="polite">
        {!sent && (
          <div className="chat-empty">
            <p>Escreva para começar uma conversa nova com {agent.name}. Ela fica salva aqui na lista do agente.</p>
          </div>
        )}
        {sent && (
          <div className="msg msg-user">
            <p>{sent}</p>
          </div>
        )}
        {sending && (
          <div className="msg msg-agent msg-typing" aria-label="O agente está respondendo">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
      <ChatComposer id="chat-input" value={draft} onChange={setDraft} onSend={send} sending={sending} notify={notify} placeholder="Escreva uma mensagem" />
    </section>
  );
}

function ConversationDetail({ id, user, notify, onChange, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState(null); // mensagem enviada aguardando a resposta do agente
  const endRef = useRef(null);
  const canAttend = can(user, 'atender');

  const load = useCallback(async () => {
    try {
      setData(await api(`/conversations/${id}`));
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [data?.messages.length, pending]);

  // Continua a conversa com o agente, não importa quando ela foi feita.
  async function continueChat(text, attachments = [], files = []) {
    if (sending) return false;
    setSending(true);
    setPending([text, files.length ? `📎 ${files.map((f) => f.name).join(', ')}` : ''].filter(Boolean).join('\n'));
    setDraft('');
    try {
      await api(`/agents/${data.conversation.agentId}/chat`, { method: 'POST', body: { message: text, attachments, conversationId: id } });
      await load();
      onChange();
      return true;
    } catch (err) {
      notify(err.message, 'error');
      setDraft(text);
      return false;
    } finally {
      setPending(null);
      setSending(false);
    }
  }

  async function act(path, body, msg) {
    setBusy(true);
    try {
      await api(`/conversations/${id}/${path}`, { method: 'POST', body });
      if (msg) notify(msg);
      await load();
      onChange();
      return true;
    } catch (err) {
      notify(err.message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (error)
    return (
      <section className="chat-panel">
        <ErrorState message={error} onRetry={load} />
      </section>
    );
  if (!data)
    return (
      <section className="chat-panel" style={{ padding: 16 }}>
        <LoadingRows rows={4} />
      </section>
    );

  const c = data.conversation;
  const human = c.handledBy === 'humano';

  return (
    <section className="chat-panel" aria-label={`Conversa com ${c.contact || 'contato'}`}>
      <PanelHead avatar={c.agentAvatar} name={c.agentName} title={c.contact || 'Contato'} subtitle={`${CHANNEL_LABEL[c.channel] || c.channel}, agente ${c.agentName}`} onBack={onBack}>
        {canAttend && c.canReply &&
          (human ? (
            <button className="btn btn-secondary btn-sm" onClick={() => act('release', {}, 'O agente voltou a responder esta conversa.')} disabled={busy}>
              Devolver ao agente
            </button>
          ) : (
            <button className="btn btn-dark btn-sm" onClick={() => act('takeover', {}, 'Você assumiu a conversa. O agente parou de responder.')} disabled={busy}>
              Assumir conversa
            </button>
          ))}
      </PanelHead>

      {human && c.canReply && <div className="alert alert-warn conv-banner">{c.assignedTo || 'Uma pessoa da equipe'} está atendendo. O agente não responde enquanto isso.</div>}

      <div className="chat-log" aria-live="polite">
        {data.messages.map((m) => (
          <div key={m.id} className={`msg ${m.author === 'contato' ? 'msg-user' : 'msg-agent'} ${m.author === 'humano' ? 'msg-human' : ''}`}>
            <span className="msg-author">
              {m.author === 'contato' && c.channel === 'teste' ? c.contact || 'Você' : AUTHOR[m.author] || m.author}, {formatDate(m.at, true)}
            </span>
            {m.author === 'contato' ? <p>{m.text}</p> : <FormattedText text={m.text} />}
          </div>
        ))}
        {data.actions.length > 0 && (
          <div className="conv-actions">
            <strong>Ações nesta conversa</strong>
            {data.actions.map((a) => (
              <span key={a.id} className="conv-action">
                <span className={`pill ${RUN_STATUS[a.status].cls}`}>{RUN_STATUS[a.status].label}</span>
                {a.label}
              </span>
            ))}
          </div>
        )}
        {pending && (
          <>
            <div className="msg msg-user">
              <p>{pending}</p>
            </div>
            <div className="msg msg-agent msg-typing" aria-label="O agente está respondendo">
              <span />
              <span />
              <span />
            </div>
          </>
        )}
        <div ref={endRef} />
      </div>

      {c.canContinue && (
        <ChatComposer id="continue-chat" value={draft} onChange={setDraft} onSend={continueChat} sending={sending} notify={notify} placeholder={`Escreva para ${c.agentName}`} />
      )}

      {canAttend && c.canReply && human && (
        <form
          className="composer"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!reply.trim()) return;
            if (await act('reply', { text: reply })) setReply('');
          }}
        >
          <label htmlFor="human-reply" className="visually-hidden">
            Resposta para o contato
          </label>
          <textarea id="human-reply" className="input" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Responder pelo ${CHANNEL_LABEL[c.channel]}`} />
          <button type="submit" className="btn btn-primary" disabled={busy || !reply.trim()}>
            <IconSend />
            Enviar
          </button>
        </form>
      )}
    </section>
  );
}
