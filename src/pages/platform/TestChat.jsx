import { useEffect, useRef, useState } from 'react';
import FormattedText from '../../components/FormattedText.jsx';
import ChatComposer from '../../components/ChatComposer.jsx';
import AgentAvatar from '../../components/AgentAvatar.jsx';
import { Link, useSearchParams } from 'react-router-dom';
import { api, DEMO } from '../../api.js';
import { IconChat, IconSend } from '../../components/Icons.jsx';
import { PageHead, EmptyState, LoadingRows, RUN_STATUS } from './common.jsx';

export default function TestChat({ agents, openCreate, refreshSummary, notify }) {
  const [params, setParams] = useSearchParams();
  const agentId = Number(params.get('agente')) || agents?.[0]?.id || null;
  const agent = agents?.find((a) => a.id === agentId);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const freshRef = useRef(false); // true depois de "Nova conversa": a próxima mensagem abre outra conversa
  const endRef = useRef(null);

  // Reabre a última conversa com o agente (a conversa fica salva ao sair da tela).
  useEffect(() => {
    let alive = true;
    setConversationId(null);
    setMessages([]);
    setError('');
    freshRef.current = false;
    if (!agentId) return;
    setLoadingHistory(true);
    api(`/agents/${agentId}/chat`)
      .then((res) => {
        if (!alive) return;
        setConversationId(res.conversationId);
        setMessages(res.messages || []);
      })
      .catch(() => {})
      .finally(() => alive && setLoadingHistory(false));
    return () => {
      alive = false;
    };
  }, [agentId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages, sending]);

  // Envia texto e anexos. Devolve false se falhar (a caixa mantém os arquivos para tentar de novo).
  async function send(text, attachments = [], files = []) {
    if (sending) return false;
    setDraft('');
    setError('');
    const names = files.map((f) => f.name);
    setMessages((m) => [...m, { role: 'user', text: text || '', files: names }]);
    setSending(true);
    try {
      const res = await api(`/agents/${agentId}/chat`, {
        method: 'POST',
        body: { message: text, attachments, conversationId, newConversation: freshRef.current },
      });
      freshRef.current = false;
      setConversationId(res.conversationId);
      setMessages((m) => [...m, { role: 'agent', text: res.reply, actions: res.actions }]);
      if (res.actions?.length) refreshSummary();
      return true;
    } catch (err) {
      setError(err.message);
      setMessages((m) => m.slice(0, -1));
      setDraft(text);
      return false;
    } finally {
      setSending(false);
    }
  }


  if (!agents) return <LoadingRows rows={3} />;
  if (!agents.length)
    return (
      <>
        <PageHead title="Testar conversas" lede="Converse com um agente como se fosse um colaborador ou cliente." />
        <section className="panel">
          <EmptyState icon={<IconChat />} title="Crie um agente para testar" text="O teste mostra as respostas e as ações que o agente propõe.">
            <button className="btn btn-primary" onClick={openCreate}>
              Criar agente
            </button>
          </EmptyState>
        </section>
      </>
    );

  const suggestions = [
    'Quais compromissos eu tenho amanhã?',
    'Envie um e-mail para financeiro@empresa.com com o resumo do reembolso de R$ 186.',
    'Avise o canal de operações que a visita das 14h foi remarcada.',
  ];

  return (
    <>
      <PageHead title="Testar conversas" lede="As ações que pedem aprovação vão para a fila de aprovações, como aconteceria de verdade.">
      </PageHead>

      <div className="chat-layout">
      <nav className="chat-agents" aria-label="Agentes">
        <span className="chat-agents-title">Agentes</span>
        <ul>
          {agents.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className={`chat-agent-item ${a.id === agentId ? 'is-active' : ''}`}
                aria-current={a.id === agentId ? 'true' : undefined}
                onClick={() => setParams({ agente: String(a.id) })}
              >
                <AgentAvatar avatar={a.avatar} name={a.name} size={36} />
                <span>
                  <strong>{a.name}</strong>
                  <span className="muted">{a.area}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-ghost btn-sm chat-agents-new" onClick={openCreate}>
          + Novo agente
        </button>
      </nav>

      <section className="chat-panel" aria-label={`Conversa com ${agent?.name}`}>
        <div className="chat-panel-head">
          <div className="chat-agent">
            <AgentAvatar avatar={agent?.avatar} name={agent?.name} size={40} />
            <div>
              <strong>{agent?.name}</strong>
              <span className="muted">{agent?.area}</span>
            </div>
          </div>
          <div className="chat-panel-links">
            <Link to={`/app/agentes/${agentId}`} className="link">
              Ferramentas do agente
            </Link>
            {messages.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  freshRef.current = true;
                  setConversationId(null);
                  setMessages([]);
                }}
              >
                Nova conversa
              </button>
            )}
          </div>
        </div>

        <div className="chat-log" aria-live="polite">
          {loadingHistory && messages.length === 0 && <p className="muted chat-loading">Carregando a conversa…</p>}
          {!loadingHistory && messages.length === 0 && (
            <div className="chat-empty">
              <p>Comece com um pedido real do dia a dia. Por exemplo:</p>
              <ul>
                {suggestions.map((s) => (
                  <li key={s}>
                    <button type="button" className="suggestion" onClick={() => setDraft(s)}>
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
              {DEMO && <p className="hint">Na demonstração, as respostas são simuladas sem chamar o modelo de IA.</p>}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`msg msg-${m.role}`}>
              {m.role === 'agent' ? <FormattedText text={m.text} /> : m.text && <p>{m.text}</p>}
              {m.files?.length > 0 && <p className="msg-files">📎 {m.files.join(', ')}</p>}
              {m.actions?.map((a) => {
                const st = RUN_STATUS[a.status];
                return (
                  <div key={a.id} className="msg-action">
                    <span className={`pill ${st.cls}`}>{st.label}</span>
                    <span>
                      {a.label}
                      {a.input?.to ? ` para ${a.input.to}` : ''}
                    </span>
                    {a.status === 'pendente' && (
                      <Link to="/app/aprovacoes" className="link">
                        Revisar
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {sending && (
            <div className="msg msg-agent msg-typing" aria-label="O agente está respondendo">
              <span />
              <span />
              <span />
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <div className="alert alert-error chat-error" role="alert">
            {error}
          </div>
        )}

        <ChatComposer
          id="chat-input"
          value={draft}
          onChange={setDraft}
          onSend={send}
          sending={sending}
          notify={notify}
          placeholder="Escreva, dite pelo microfone ou anexe arquivos"
        />
      </section>
      </div>
    </>
  );
}
