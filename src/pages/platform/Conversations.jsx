import { useCallback, useEffect, useRef, useState } from 'react';
import FormattedText from '../../components/FormattedText.jsx';
import ChatComposer from '../../components/ChatComposer.jsx';
import AgentAvatar from '../../components/AgentAvatar.jsx';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { can } from '../../auth.jsx';
import { IconInbox, IconSend, IconPlus } from '../../components/Icons.jsx';
import { PageHead, SearchInput, FilterChips, EmptyState, ErrorState, LoadingRows, formatDate, RUN_STATUS, CHANNEL_LABEL } from './common.jsx';

const AUTHOR = { contato: 'Contato', agente: 'Agente', humano: 'Equipe', sistema: 'Aviso automático' };

export default function Conversations({ user, agents, notify, refreshSummary }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [channel, setChannel] = useState('todos');
  const [status, setStatus] = useState('todas');
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    setError('');
    const qs = new URLSearchParams({ channel, status, q: query.trim() });
    try {
      setList((await api(`/conversations?${qs}`)).conversations);
    } catch (err) {
      setError(err.message);
    }
  }, [channel, status, query]);

  useEffect(() => {
    const t = setTimeout(load, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  // Atualiza a lista de tempos em tempos para mostrar mensagens novas dos canais.
  useEffect(() => {
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <>
      <PageHead title="Conversas" lede="Tudo o que os agentes conversaram nos canais e nos testes. Assuma uma conversa quando ela precisar de uma pessoa.">
        {can(user, 'conversar') && agents?.length > 0 && (
          <div className="new-conv">
            <button className="btn btn-primary" onClick={() => setPicking((v) => !v)} aria-expanded={picking} aria-haspopup="menu">
              <IconPlus />
              Nova conversa
            </button>
            {picking && (
              <div className="new-conv-menu" role="menu">
                <span className="muted">Conversar com</span>
                {agents.map((a) => (
                  <button key={a.id} type="button" role="menuitem" className="chat-agent-item" onClick={() => navigate(`/app/testar?agente=${a.id}&nova=1`)}>
                    <AgentAvatar avatar={a.avatar} name={a.name} size={32} />
                    <span>
                      <strong>{a.name}</strong>
                      <span className="muted">{a.area}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </PageHead>
      <div className="toolbar">
        <SearchInput id="conv-search" label="Buscar conversas" value={query} onChange={setQuery} placeholder="Buscar por contato ou agente" />
        <FilterChips
          label="Canal"
          value={channel}
          onChange={setChannel}
          options={[
            { value: 'todos', label: 'Todos os canais' },
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'telegram', label: 'Telegram' },
            { value: 'teste', label: 'Testes' },
          ]}
        />
        <FilterChips
          label="Quem atende"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'todas', label: 'Todas' },
            { value: 'humano', label: 'Com a equipe' },
            { value: 'agente', label: 'Com o agente' },
          ]}
        />
      </div>

      <div className={`inbox ${id ? 'has-selection' : ''}`}>
        <section className="panel panel-flush inbox-list" aria-label="Lista de conversas">
          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : !list ? (
            <div style={{ padding: 16 }}>
              <LoadingRows rows={4} />
            </div>
          ) : list.length === 0 ? (
            <EmptyState icon={<IconInbox />} title="Nenhuma conversa por aqui" text="Conecte o WhatsApp ou o Telegram em Integrações, ou converse com um agente em Testar conversas." />
          ) : (
            <ul>
              {list.map((c) => (
                <li key={c.id}>
                  <Link to={`/app/conversas/${c.id}`} className={`conv-row ${String(c.id) === id ? 'is-active' : ''}`}>
                    <span className="conv-top">
                      <strong>{c.contact || 'Contato'}</strong>
                      <span className="muted tabular">{formatDate(c.lastMessageAt, true)}</span>
                    </span>
                    <span className="conv-preview">{c.preview || 'Sem mensagens de texto'}</span>
                    <span className="conv-meta">
                      <span className="tag">{CHANNEL_LABEL[c.channel] || c.channel}</span>
                      <span className="conv-agent muted">
                        <AgentAvatar avatar={c.agentAvatar} name={c.agentName} size={20} />
                        {c.agentName}
                      </span>
                      {c.handledBy === 'humano' && <span className="pill pill-warn">Com {c.assignedTo || 'a equipe'}</span>}
                      {c.pending > 0 && <span className="pill pill-warn">{c.pending} aprovação pendente</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel panel-flush inbox-detail" aria-label="Conversa selecionada">
          {id ? (
            <ConversationDetail key={id} id={id} user={user} notify={notify} onChange={() => (load(), refreshSummary())} onBack={() => navigate('/app/conversas')} />
          ) : (
            <div className="inbox-empty muted">Escolha uma conversa para ver o histórico.</div>
          )}
        </section>
      </div>
    </>
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

  // Continua a conversa de teste com o agente, não importa quando ela foi feita.
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

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data)
    return (
      <div style={{ padding: 16 }}>
        <LoadingRows rows={4} />
      </div>
    );

  const c = data.conversation;
  const human = c.handledBy === 'humano';

  return (
    <div className="conv-detail">
      <div className="conv-detail-head">
        <button className="btn btn-ghost btn-sm conv-back" onClick={onBack}>
          Voltar
        </button>
        <div className="chat-agent">
          <AgentAvatar avatar={c.agentAvatar} name={c.agentName} size={40} />
          <div>
            <strong>{c.contact || 'Contato'}</strong>
            <span className="muted">
              {CHANNEL_LABEL[c.channel] || c.channel}, agente {c.agentName}
            </span>
          </div>
        </div>
        {canAttend && c.canReply && (
          <div className="conv-detail-actions">
            {human ? (
              <button className="btn btn-secondary btn-sm" onClick={() => act('release', {}, 'O agente voltou a responder esta conversa.')} disabled={busy}>
                Devolver ao agente
              </button>
            ) : (
              <button className="btn btn-dark btn-sm" onClick={() => act('takeover', {}, 'Você assumiu a conversa. O agente parou de responder.')} disabled={busy}>
                Assumir conversa
              </button>
            )}
          </div>
        )}
      </div>

      {human && <div className="alert alert-warn conv-banner">{c.assignedTo || 'Uma pessoa da equipe'} está atendendo. O agente não responde enquanto isso.</div>}

      <div className="conv-log">
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
              <span className="msg-author">Contato, agora</span>
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
        <ChatComposer
          id="continue-chat"
          value={draft}
          onChange={setDraft}
          onSend={continueChat}
          sending={sending}
          notify={notify}
          placeholder={`Continuar a conversa com ${c.agentName}: escreva, dite ou anexe arquivos`}
        />
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
    </div>
  );
}
